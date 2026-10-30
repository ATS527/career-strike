import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { removeFromOpencodeConfig } from '../../src/mcp/hosts.js';
import { tempDir } from '../helpers.js';

const CONFIG = `{
  // My OpenCode settings
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "other-server": { "type": "local", "command": ["other"] },
    "career-strike": {
      "type": "local",
      "command": ["node", "/x/cli.js", "mcp", "--client", "opencode"]
    }
  },
  /* keep this */
  "theme": "dark"
}
`;

describe('OpenCode config removal', () => {
  it('handles the OpenCode 2.x shape (mcp.servers) and leaves no empty containers', () => {
    const file = path.join(tempDir(), 'opencode.jsonc');
    const original = '{\n  "$schema": "https://opencode.ai/config.json"\n}\n';
    fs.writeFileSync(
      file,
      '{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "servers": {\n      "career-strike": { "type": "local", "command": ["node"] }\n    }\n  }\n}\n',
    );
    expect(removeFromOpencodeConfig(file)).toBe('removed');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(JSON.parse(original));
  });

  it('keeps other servers in the 2.x shape', () => {
    const file = path.join(tempDir(), 'opencode.jsonc');
    fs.writeFileSync(file, '{ "mcp": { "servers": { "career-strike": {}, "mine": { "type": "local" } } } }');
    expect(removeFromOpencodeConfig(file)).toBe('removed');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ mcp: { servers: { mine: { type: 'local' } } } });
  });

  it('removes only the career-strike entry, keeps comments and other servers, and writes a backup', () => {
    const file = path.join(tempDir(), 'opencode.jsonc');
    fs.writeFileSync(file, CONFIG);
    expect(removeFromOpencodeConfig(file)).toBe('removed');
    const after = fs.readFileSync(file, 'utf8');
    expect(after).not.toContain('career-strike');
    expect(after).toContain('// My OpenCode settings');
    expect(after).toContain('/* keep this */');
    expect(after).toContain('"other-server"');
    expect(after).toContain('"theme": "dark"');
    expect(fs.readFileSync(`${file}.career-strike-backup`, 'utf8')).toBe(CONFIG);
    expect(removeFromOpencodeConfig(file)).toBe('not-registered');
  });

  it('does nothing when there is no config or no entry', () => {
    expect(removeFromOpencodeConfig(null)).toBe('not-registered');
    const file = path.join(tempDir(), 'opencode.json');
    fs.writeFileSync(file, '{ "mcp": {} }');
    expect(removeFromOpencodeConfig(file)).toBe('not-registered');
    expect(fs.existsSync(`${file}.career-strike-backup`)).toBe(false);
  });
});
