import fs from 'node:fs';
import { z } from 'zod';
import { localRequest } from './http-client.js';

const RuntimeInfoSchema = z.object({
  pid: z.number().int().positive(),
  port: z.number().int().min(1).max(65535),
  token: z.string().min(32),
  startedAt: z.string(),
  version: z.string(),
});

export type RuntimeInfo = z.infer<typeof RuntimeInfoSchema>;

/** Atomically write the discovery file, readable only by the owner (it contains the API token). */
export function writeRuntime(file: string, info: RuntimeInfo): void {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(info), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function readRuntime(file: string): RuntimeInfo | null {
  try {
    const parsed = RuntimeInfoSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function removeRuntime(file: string, pid: number): void {
  if (readRuntime(file)?.pid === pid) fs.rmSync(file, { force: true });
}

/** True only if a Career Strike service with the recorded pid answers on the recorded port. */
export async function probeHealth(info: RuntimeInfo): Promise<boolean> {
  try {
    const res = await localRequest(info.port, '/api/health', { timeoutMs: 1000 });
    const body = res.body as { service?: unknown; pid?: unknown } | null;
    return res.status === 200 && body?.service === 'career-strike' && body.pid === info.pid;
  } catch {
    return false;
  }
}
