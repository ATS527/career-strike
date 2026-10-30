import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SERVICE = 'career-strike';

export interface SecretStore {
  readonly kind: 'keychain' | 'file';
  /** Return the named secret, creating a random 32-byte one on first use. */
  getOrCreate(name: string): Promise<Buffer>;
  /** Remove the named secret if it exists. */
  delete(name: string): Promise<void>;
}

/**
 * macOS login Keychain via the system `security` tool. Items are scoped to this data directory
 * (account = hash of its path) so separate installs and test runs never share keys.
 */
export class KeychainSecretStore implements SecretStore {
  readonly kind = 'keychain' as const;
  private readonly account: string;

  constructor(home: string, private readonly service = SERVICE) {
    this.account = createHash('sha256').update(path.resolve(home)).digest('hex').slice(0, 24);
  }

  async getOrCreate(name: string): Promise<Buffer> {
    const account = `${this.account}:${name}`;
    try {
      const { stdout } = await run('security', ['find-generic-password', '-s', this.service, '-a', account, '-w']);
      return Buffer.from(stdout.trim(), 'hex');
    } catch {
      const secret = randomBytes(32);
      await addViaStdin(this.service, account, secret.toString('hex'));
      return secret;
    }
  }

  async delete(name: string): Promise<void> {
    await run('security', ['delete-generic-password', '-s', this.service, '-a', `${this.account}:${name}`]).catch(() => undefined);
  }
}

/**
 * `security -i` reads commands from stdin, so the secret never appears in a process argument list
 * (which other local users can read with ps on macOS).
 */
function addViaStdin(service: string, account: string, hex: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('security', ['-i'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 && !/error/i.test(stderr) ? resolve() : reject(new Error(`Keychain write failed: ${stderr.trim() || code}`))));
    child.stdin.end(`add-generic-password -U -s ${service} -a ${account} -w ${hex}\n`);
  });
}

/** Fallback for systems without a supported keychain: owner-only files in the data directory. */
export class FileSecretStore implements SecretStore {
  readonly kind = 'file' as const;

  constructor(private readonly dir: string) {}

  async getOrCreate(name: string): Promise<Buffer> {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid secret name');
    const file = path.join(this.dir, `${name}.key`);
    try {
      return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
    } catch {
      fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
      const secret = randomBytes(32);
      // wx: never overwrite a key another process created in the meantime.
      try {
        fs.writeFileSync(file, secret.toString('hex'), { mode: 0o600, flag: 'wx' });
        return secret;
      } catch {
        return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
      }
    }
  }

  async delete(name: string): Promise<void> {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error('Invalid secret name');
    fs.rmSync(path.join(this.dir, `${name}.key`), { force: true });
  }
}

/**
 * Keychain on macOS; owner-only files elsewhere, or when CAREER_STRIKE_SECRET_STORE=file
 * (used by tests so they never touch the user's keychain).
 */
export function defaultSecretStore(home: string, env: NodeJS.ProcessEnv = process.env): SecretStore {
  if (process.platform === 'darwin' && env.CAREER_STRIKE_SECRET_STORE !== 'file') return new KeychainSecretStore(home);
  return new FileSecretStore(path.join(home, 'secrets'));
}
