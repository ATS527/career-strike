import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FileSecretStore, KeychainSecretStore } from '../../src/vault/secrets.js';
import { tempDir } from '../helpers.js';

describe('file secret store', () => {
  it('creates an owner-only key once and returns the same key afterwards', async () => {
    const dir = path.join(tempDir(), 'secrets');
    const store = new FileSecretStore(dir);
    const a = await store.getOrCreate('approval-key');
    expect(a).toHaveLength(32);
    expect((await new FileSecretStore(dir).getOrCreate('approval-key')).equals(a)).toBe(true);
    const fs = await import('node:fs');
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, 'approval-key.key')).mode & 0o777).toBe(0o600);
    await expect(store.getOrCreate('../x')).rejects.toThrow('Invalid secret name');
  });
});

// Uses the real macOS login keychain under a dedicated test service name, and removes its item.
describe.runIf(process.platform === 'darwin')('macOS keychain secret store', () => {
  const store = new KeychainSecretStore(tempDir('cs-kc-'), 'career-strike-test');
  afterAll(async () => {
    await store.delete('approval-key');
  });

  it('stores the key in the keychain, returns it unchanged and rotates only when deleted', async () => {
    const a = await store.getOrCreate('approval-key');
    expect(a).toHaveLength(32);
    expect((await store.getOrCreate('approval-key')).equals(a)).toBe(true);
    await store.delete('approval-key');
    expect((await store.getOrCreate('approval-key')).equals(a)).toBe(false);
  });
});
