import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

// An owned, local "applicant tracking system" for practising and testing automated submission.
// It is not an employer: nothing sent here reaches anyone. It behaves like a careful real ATS —
// idempotency keys, receipts that can be looked up later — and can be told to misbehave so that
// Career Strike's handling of failures and lost responses can be exercised for real.

export type FaultMode = 'none' | 'server-error' | 'reject' | 'drop-after-store' | 'slow';

const Submission = z
  .object({
    jobRef: z.string(),
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
    applicant: z
      .object({ fullName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable() })
      .passthrough(),
    answers: z.array(z.object({ key: z.string(), value: z.string().nullable() }).passthrough()),
    coverLetter: z.string().nullable(),
    attachments: z.array(z.object({ filename: z.string(), sha256: z.string(), contentBase64: z.string() })),
  })
  .strict();

const PRACTICE_POSTINGS = [
  {
    id: 'practice-1',
    title: 'Practice Platform Engineer',
    employer: 'Practice Employer (not real)',
    location: 'Remote',
    remote: 'remote',
    description: [
      { type: 'paragraph', text: 'A practice posting served from this computer.' },
      { type: 'heading', text: 'Requirements' },
      { type: 'item', text: 'TypeScript and Kubernetes' },
    ],
  },
  {
    id: 'practice-2',
    title: 'Practice Data Analyst',
    employer: 'Practice Employer (not real)',
    location: 'Remote',
    remote: 'remote',
    description: [
      { type: 'heading', text: 'Requirements' },
      { type: 'item', text: 'SQL and Python' },
    ],
  },
];

export interface Receipt {
  receiptId: string;
  idempotencyKey: string;
  receivedAt: string;
  jobRef: string;
  payloadHash: string;
  attachmentsVerified: boolean;
}

export interface PracticeAts {
  app: FastifyInstance;
  origin: string;
  receipts: Map<string, Receipt>;
  setFault(mode: FaultMode, slowMs?: number): void;
  close(): Promise<void>;
}

export async function startPracticeAts(port = 0): Promise<PracticeAts> {
  const app = Fastify({ logger: false, bodyLimit: 40 * 1024 * 1024 });
  const byKey = new Map<string, Receipt>();
  const byId = new Map<string, Receipt>();
  let fault: FaultMode = 'none';
  let slowMs = 0;

  app.post('/applications', async (req, reply) => {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(key))
      return reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
    if (fault === 'reject')
      return reply
        .code(422)
        .send({ error: 'REJECTED', message: 'The practice endpoint was told to reject this submission.' });
    if (fault === 'server-error') return reply.code(503).send({ error: 'UNAVAILABLE' });
    const existing = byKey.get(key);
    if (existing) return reply.code(200).send({ receipt: existing, duplicate: true });
    const parsed = Submission.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'INVALID', issues: parsed.error.issues });
    const attachmentsVerified = parsed.data.attachments.every(
      (a) => createHash('sha256').update(Buffer.from(a.contentBase64, 'base64')).digest('hex') === a.sha256,
    );
    if (!attachmentsVerified) return reply.code(422).send({ error: 'ATTACHMENT_HASH_MISMATCH' });
    const receipt: Receipt = {
      receiptId: `rcpt_${randomBytes(8).toString('hex')}`,
      idempotencyKey: key,
      receivedAt: new Date().toISOString(),
      jobRef: parsed.data.jobRef,
      payloadHash: parsed.data.payloadHash,
      attachmentsVerified,
    };
    byKey.set(key, receipt);
    byId.set(receipt.receiptId, receipt);
    if (fault === 'drop-after-store') {
      // Stored, but the response is lost on the way back: the classic ambiguous outcome.
      req.raw.socket.destroy();
      return reply;
    }
    if (fault === 'slow') await new Promise((r) => setTimeout(r, slowMs));
    return reply.code(201).send({ receipt });
  });

  // A practice job board, so discovery can be tried (and tested) with no internet connection.
  app.get<{ Params: { board: string } }>('/boards/:board', async (req, reply) => {
    if (req.params.board !== 'demo') return reply.code(404).send({ error: 'NOT_FOUND' });
    if (fault === 'server-error') return reply.code(503).send({ error: 'UNAVAILABLE' });
    if (fault === 'reject') return reply.code(429).send({ error: 'SLOW_DOWN' });
    if (fault === 'slow') await new Promise((r) => setTimeout(r, slowMs));
    return { postings: PRACTICE_POSTINGS };
  });

  app.get<{ Params: { key: string } }>('/applications/by-key/:key', async (req, reply) => {
    const r = byKey.get(req.params.key);
    return r ? { receipt: r } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  app.get<{ Params: { id: string } }>('/applications/:id', async (req, reply) => {
    const r = byId.get(req.params.id);
    return r ? { receipt: r } : reply.code(404).send({ error: 'NOT_FOUND' });
  });

  await app.listen({ host: '127.0.0.1', port });
  const { port: bound } = app.server.address() as AddressInfo;
  return {
    app,
    origin: `http://127.0.0.1:${bound}`,
    receipts: byKey,
    setFault: (mode, ms = 0) => {
      fault = mode;
      slowMs = ms;
    },
    close: () => app.close(),
  };
}
