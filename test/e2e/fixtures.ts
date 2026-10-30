import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { syncBoard } from '../../src/career/jobs.js';
import type { NormalizedPosting } from '../../src/sources/types.js';
import { openDb } from '../../src/store/db.js';

const CLI = path.resolve('dist/cli/index.js');

/** A real Career Strike service (built CLI) running against its own temporary data directory. */
export class CsService {
  port = 0;
  token = '';
  private proc: ChildProcess | null = null;

  constructor(readonly home: string) {}

  static async start(): Promise<CsService> {
    const cs = new CsService(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cs-e2e-')), 'data'));
    await cs.startProcess(0);
    return cs;
  }

  get origin(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  env(): NodeJS.ProcessEnv {
    return { ...process.env, CAREER_STRIKE_HOME: this.home, CAREER_STRIKE_SECRET_STORE: 'file' };
  }

  private async startProcess(port: number): Promise<void> {
    const proc = spawn(process.execPath, [CLI, 'serve', '--port', String(port)], { env: this.env(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const listening = new Promise<void>((resolve, reject) => {
      proc.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (/listening on http:\/\/127\.0\.0\.1:\d+/.test(output)) resolve();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      proc.once('exit', (code) => reject(new Error(`service exited (${code}): ${output}`)));
    });
    await listening;
    this.proc = proc;
    const runtime = JSON.parse(fs.readFileSync(path.join(this.home, 'service.json'), 'utf8')) as { port: number; token: string };
    this.port = runtime.port;
    this.token = runtime.token;
  }

  async stop(): Promise<void> {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;
    if (proc.exitCode === null) {
      proc.kill('SIGTERM');
      await once(proc, 'exit');
    }
  }

  /** Restart on the same port so open browser tabs can reconnect. */
  async restart(): Promise<void> {
    const port = this.port;
    await this.stop();
    await this.startProcess(port);
  }

  async resume(): Promise<void> {
    await this.startProcess(this.port);
  }

  async launchUrl(): Promise<string> {
    const res = await fetch(`${this.origin}/api/session/launch-token`, { method: 'POST', headers: { authorization: `Bearer ${this.token}` } });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    return `${this.origin}/auth/launch?t=${token}`;
  }

  async settings(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.origin}/api/settings`, { headers: { authorization: `Bearer ${this.token}` } });
    return ((await res.json()) as { settings: Record<string, unknown> }).settings;
  }

  /** Write postings into this service's database exactly as a successful board fetch would. */
  seed(source: 'greenhouse' | 'lever' | 'ashby', board: string, postings: Partial<NormalizedPosting>[], at = new Date()): void {
    const db = openDb(path.join(this.home, 'career-strike.db'));
    try {
      syncBoard(db, source, board, postings.map((p, i) => syntheticPosting(source, board, i, p)), at);
    } finally {
      db.close();
    }
  }

  async api(method: string, url: string, body?: unknown): Promise<{ status: number; body: unknown }> {
    const res = await fetch(`${this.origin}${url}`, {
      method,
      headers: { authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  cli(...args: string[]) {
    return spawnSync(process.execPath, [CLI, ...args], { env: this.env(), encoding: 'utf8', timeout: 20_000 });
  }
}

export function syntheticPosting(source: NormalizedPosting['source'], board: string, i: number, over: Partial<NormalizedPosting> = {}): NormalizedPosting {
  return {
    source,
    board,
    sourceJobId: `${board}-${i}`,
    employer: 'Synthetic Labs',
    title: `Synthetic Role ${i}`,
    locationText: 'Remote - India',
    remotePolicy: 'remote',
    employmentType: 'full_time',
    department: 'Engineering',
    salary: null,
    description: [
      { type: 'heading', text: 'About the role' },
      { type: 'paragraph', text: `Synthetic posting number ${i}.` },
      { type: 'item', text: 'Build reliable systems' },
    ],
    applyUrl: `https://careers.example.com/${board}/${i}`,
    postingUrl: `https://careers.example.com/${board}/${i}`,
    publishedAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
    unresolved: ['Salary is not published in structured form.'],
    ...over,
  };
}

export async function signIn(page: Page, cs: CsService): Promise<void> {
  await page.goto(await cs.launchUrl());
  await expect(page).toHaveURL(`${cs.origin}/`);
  await expect(page.getByRole('heading', { level: 1, name: 'Where things stand' })).toBeVisible();
}

export const test = base.extend<{ cs: CsService; consoleProblems: string[] }>({
  cs: async ({}, use) => {
    const cs = await CsService.start();
    await use(cs);
    await cs.stop();
  },
  consoleProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (msg) => {
        // Failed fetches while the service is deliberately stopped are expected in outage tests.
        if (msg.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(msg.text())) problems.push(msg.text());
      });
      page.on('pageerror', (err) => problems.push(err.message));
      await use(problems);
      // Every journey must run without CSP violations or uncaught errors.
      expect(problems).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
