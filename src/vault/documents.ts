import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '../store/db.js';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const TYPES: Readonly<Record<string, { magic: Buffer | null; ext: string }>> = {
  'application/pdf': { magic: Buffer.from('%PDF-'), ext: 'pdf' },
  // DOCX is a ZIP container.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]), ext: 'docx' },
  'text/plain': { magic: null, ext: 'txt' },
};
export const ACCEPTED_DOCUMENT_TYPES = Object.keys(TYPES);

export interface StoredDocument {
  id: string;
  kind: 'resume' | 'cover_letter' | 'other';
  filename: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export class DocumentError extends Error {
  constructor(
    readonly code: 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'EMPTY' | 'CONTENT_MISMATCH',
    message: string,
  ) {
    super(message);
  }
}

/** Keep only a safe display name: no directories, control characters or odd lengths. */
export function safeFilename(raw: string, mime: string): string {
  const base = path.basename(raw.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const cleaned = base.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 120);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : `document.${TYPES[mime]?.ext ?? 'bin'}`;
}

interface Row {
  id: string;
  kind: StoredDocument['kind'];
  filename: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

const toDoc = (r: Row): StoredDocument => ({
  id: r.id,
  kind: r.kind,
  filename: r.filename,
  mime: r.mime,
  sizeBytes: r.size_bytes,
  sha256: r.sha256,
  createdAt: r.created_at,
});

/**
 * Candidate documents live in the vault directory under an opaque id. Only metadata is in the
 * database; neither the vault path nor the file location is ever returned to a client.
 */
export class DocumentVault {
  private readonly dir: string;

  constructor(
    private readonly db: Db,
    vaultDir: string,
  ) {
    this.dir = path.join(vaultDir, 'documents');
  }

  save(input: { kind: StoredDocument['kind']; filename: string; mime: string; bytes: Buffer }, actor: string): StoredDocument {
    const type = TYPES[input.mime];
    if (!type) throw new DocumentError('UNSUPPORTED_TYPE', 'Upload a PDF, Word (.docx) or plain-text file.');
    if (input.bytes.length === 0) throw new DocumentError('EMPTY', 'The file is empty.');
    if (input.bytes.length > MAX_DOCUMENT_BYTES) throw new DocumentError('TOO_LARGE', 'Files must be 10 MB or smaller.');
    if (type.magic && !input.bytes.subarray(0, type.magic.length).equals(type.magic)) {
      throw new DocumentError('CONTENT_MISMATCH', 'The file’s contents do not match its type.');
    }
    const id = `doc_${randomBytes(9).toString('base64url')}`;
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const at = new Date().toISOString();
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(this.dir, id), input.bytes, { mode: 0o600, flag: 'wx' });
    try {
      this.db.transaction(() => {
        this.db
          .prepare('INSERT INTO documents (id, kind, filename, mime, size_bytes, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, input.kind, safeFilename(input.filename, input.mime), input.mime, input.bytes.length, sha256, at);
        this.db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'document.added', id);
      })();
    } catch (err) {
      fs.rmSync(path.join(this.dir, id), { force: true });
      throw err;
    }
    return this.get(id)!;
  }

  list(): StoredDocument[] {
    return (this.db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all() as Row[]).map(toDoc);
  }

  get(id: string): StoredDocument | null {
    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as Row | undefined;
    return row ? toDoc(row) : null;
  }

  /** File contents, verified against the stored hash so a tampered file is never served or attached. */
  read(id: string): Buffer | null {
    const doc = this.get(id);
    if (!doc || !/^doc_[A-Za-z0-9_-]+$/.test(id)) return null;
    const bytes = fs.readFileSync(path.join(this.dir, id));
    if (createHash('sha256').update(bytes).digest('hex') !== doc.sha256) throw new Error(`Document ${id} no longer matches its recorded hash`);
    return bytes;
  }

  delete(id: string, actor: string): boolean {
    const at = new Date().toISOString();
    let deleted = false;
    this.db.transaction(() => {
      deleted = this.db.prepare('DELETE FROM documents WHERE id = ?').run(id).changes > 0;
      if (deleted) this.db.prepare('INSERT INTO audit_events (at, actor, action, subject) VALUES (?, ?, ?, ?)').run(at, actor, 'document.deleted', id);
    })();
    if (deleted) fs.rmSync(path.join(this.dir, id), { force: true });
    return deleted;
  }
}
