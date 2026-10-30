import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { applyEdits, modify, parse } from 'jsonc-parser';

const run = promisify(execFile);
export const SERVER_NAME = 'career-strike';

export type Host = 'codex' | 'claude-code' | 'opencode';
export const HOSTS: readonly Host[] = ['codex', 'claude-code', 'opencode'];

export interface LaunchSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
}

const BINARY: Record<Host, string> = { codex: 'codex', 'claude-code': 'claude', opencode: 'opencode' };

async function host(hostName: Host, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return run(BINARY[hostName], args, { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
}

export async function hostVersion(hostName: Host): Promise<string | null> {
  try {
    return (await host(hostName, ['--version'])).stdout.trim().split('\n')[0] ?? null;
  } catch {
    return null;
  }
}

/** Register Career Strike's MCP server with a host using the host's own CLI. */
export async function register(hostName: Host, launch: LaunchSpec): Promise<string> {
  await unregister(hostName).catch(() => undefined);
  const envFlags = (flag: string): string[] => Object.entries(launch.env).flatMap(([k, v]) => [flag, `${k}=${v}`]);
  const cmd = [launch.command, ...launch.args];
  switch (hostName) {
    case 'codex':
      return (await host('codex', ['mcp', 'add', SERVER_NAME, ...envFlags('--env'), '--', ...cmd])).stdout;
    case 'claude-code':
      // Claude's -e is variadic: it must come after the server name or it swallows it.
      return (await host('claude-code', ['mcp', 'add', '--scope', 'user', SERVER_NAME, ...envFlags('-e'), '--', ...cmd])).stdout;
    case 'opencode':
      return (await host('opencode', ['mcp', 'add', '--global', ...envFlags('--env'), SERVER_NAME, '--', ...cmd])).stdout;
  }
}

/** Remove only Career Strike's entry from a host's MCP configuration. */
export async function unregister(hostName: Host): Promise<'removed' | 'not-registered'> {
  switch (hostName) {
    case 'codex':
      try {
        await host('codex', ['mcp', 'remove', SERVER_NAME]);
        return 'removed';
      } catch {
        return 'not-registered';
      }
    case 'claude-code':
      try {
        await host('claude-code', ['mcp', 'remove', '--scope', 'user', SERVER_NAME]);
        return 'removed';
      } catch {
        return 'not-registered';
      }
    case 'opencode':
      return removeFromOpencodeConfig();
  }
}

/** Whether the host currently lists Career Strike, per the host itself. */
export async function isRegistered(hostName: Host): Promise<boolean> {
  try {
    const { stdout } = hostName === 'claude-code' ? await host('claude-code', ['mcp', 'list']) : await host(hostName, ['mcp', 'list']);
    return stdout.includes(SERVER_NAME);
  } catch {
    return false;
  }
}

export function opencodeConfigFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = path.join(env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'opencode');
  for (const name of ['opencode.jsonc', 'opencode.json', 'config.json']) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * OpenCode has no `mcp remove`. Remove the single "career-strike" entry from its global config,
 * preserving comments and formatting, after writing a backup next to it.
 */
export function removeFromOpencodeConfig(file: string | null = opencodeConfigFile()): 'removed' | 'not-registered' {
  if (!file) return 'not-registered';
  const text = fs.readFileSync(file, 'utf8');
  const config = parse(text) as { mcp?: Record<string, unknown> } | undefined;
  if (!config?.mcp || !(SERVER_NAME in config.mcp)) return 'not-registered';
  fs.writeFileSync(`${file}.career-strike-backup`, text, { mode: 0o600 });
  const edits = modify(text, ['mcp', SERVER_NAME], undefined, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
  fs.writeFileSync(file, applyEdits(text, edits));
  return 'removed';
}
