import { describe, expect, it } from 'vitest';
import { isMcpClientName } from '../../src/mcp/clients.js';

describe('MCP client labels', () => {
  it('allows portable client labels but refuses path-like or ambiguous values', () => {
    for (const name of ['codex', 'claude-code', 'opencode', 'axym', 'team-agent-2']) expect(isMcpClientName(name)).toBe(true);
    for (const name of ['', 'Codex', '../token', 'agent/name', 'agent_name', '-agent', 'a'.repeat(65)]) expect(isMcpClientName(name)).toBe(false);
  });
});
