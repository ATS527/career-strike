import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { appPaths, ensureHome } from '../../src/core/paths.js';
import { VERSION } from '../../src/core/version.js';
import { inspectDb, openDb } from '../../src/store/db.js';
import { setSetting } from '../../src/store/settings.js';
import { notesFor } from '../../src/updates/changelog.js';
import { UpdateChecker } from '../../src/updates/checker.js';
import {
  downloadRelease,
  type FetchImpl,
  latestRelease,
  listReleases,
  UpdateError,
} from '../../src/updates/releases.js';
import { readHistory } from '../../src/updates/state.js';
import { type SystemOps, Updater } from '../../src/updates/updater.js';
import { compareVersions, parseVersion } from '../../src/updates/version.js';
import { tempDir } from '../helpers.js';

// A placeholder repository: tests never depend on where real releases are published.
const REPO = 'owner/career-strike';
const API = `https://api.github.com/repos/${REPO}/releases`;
const DL = `https://github.com/${REPO}/releases/download`;
const PACKAGE = Buffer.from('synthetic release package');
const SHA = createHash('sha256').update(PACKAGE).digest('hex');

function bump(v: string, part: 0 | 1 | 2 = 1): string {
  const p = parseVersion(v)!;
  p[part] += 1;
  for (let i = part + 1; i < 3; i++) p[i] = 0;
  return p.join('.');
}
const NEXT = bump(VERSION);

function releaseJson(version: string, extra: Record<string, unknown> = {}) {
  return {
    tag_name: `v${version}`,
    name: `Career Strike ${version}`,
    body: `Notes for ${version}`,
    html_url: `https://github.com/${REPO}/releases/tag/v${version}`,
    draft: false,
    prerelease: false,
    published_at: '2026-11-01T00:00:00Z',
    assets: [
      { name: `career-strike-${version}.tgz`, browser_download_url: `${DL}/v${version}/career-strike-${version}.tgz` },
      {
        name: `career-strike-${version}.tgz.sha256`,
        browser_download_url: `${DL}/v${version}/career-strike-${version}.tgz.sha256`,
      },
    ],
    ...extra,
  };
}

/** A fake GitHub: the release list, and downloads that redirect to GitHub's file host like the real one. */
function fakeGitHub(releases: unknown[], opts: { sha?: string; body?: Buffer } = {}): FetchImpl & { calls: string[] } {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    const u = new URL(url);
    if (url.startsWith(API)) return new Response(JSON.stringify(releases), { status: 200 });
    if (u.hostname === 'github.com') {
      return new Response(null, {
        status: 302,
        headers: { location: `https://release-assets.githubusercontent.com${u.pathname}` },
      });
    }
    if (u.hostname === 'release-assets.githubusercontent.com') {
      if (u.pathname.endsWith('.sha256'))
        return new Response(`${opts.sha ?? SHA}  ${path.basename(u.pathname, '.sha256')}\n`);
      return new Response(opts.body ?? PACKAGE);
    }
    return new Response('not found', { status: 404 });
  }) as FetchImpl;
  return Object.assign(impl, { calls });
}

describe('versions', () => {
  it('compares plain semantic versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3', '1.3.0')).toBeLessThan(0);
    expect(parseVersion('1.2.3-beta.1')).toBeNull();
  });

  it('reads one version’s section from the changelog', () => {
    const text =
      '# Changelog\n\n## [0.3.0] - 2026-12-01\n\n- Later\n\n## [0.2.0] - 2026-11-01\n\n### Added\n- Updates\n\n## [0.1.0]\n- First\n';
    expect(notesFor('0.2.0', text)).toBe('### Added\n- Updates');
    expect(notesFor('0.4.0', text)).toBeNull();
    // The bundled changelog has notes for the version being built.
    expect(notesFor(VERSION)).toBeTruthy();
  });
});

describe('release source', () => {
  it('offers only published releases with a package and checksum, newest first', async () => {
    const fetchImpl = fakeGitHub([
      releaseJson('0.2.0'),
      releaseJson('0.4.0', { draft: true }),
      releaseJson('0.3.1', { prerelease: true }),
      releaseJson('0.3.0'),
      { ...releaseJson('0.2.5'), assets: [] },
      { tag_name: 'nightly', html_url: 'x', assets: [] },
      'garbage',
    ]);
    const list = await listReleases({ releasesUrl: API, fetchImpl });
    expect(list.map((r) => r.version)).toEqual(['0.3.0', '0.2.0']);
    expect((await latestRelease({ releasesUrl: API, fetchImpl }))?.notes).toBe('Notes for 0.3.0');
  });

  it('needs to know where releases are published', async () => {
    await expect(listReleases({ repository: null, fetchImpl: fakeGitHub([]) })).rejects.toThrow(
      /does not record where its releases are published/,
    );
    expect(await listReleases({ repository: REPO, fetchImpl: fakeGitHub([releaseJson('0.3.0')]) })).toHaveLength(1);
  });

  it('contacts only GitHub over https and never follows a redirect elsewhere', async () => {
    await expect(
      listReleases({ releasesUrl: 'https://example.com/releases', fetchImpl: fakeGitHub([]) }),
    ).rejects.toThrow(/Refusing to contact example.com/);
    const offsite = (async (url: string) =>
      url.startsWith(API)
        ? new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } })
        : new Response('')) as FetchImpl;
    await expect(listReleases({ releasesUrl: API, fetchImpl: offsite })).rejects.toThrow(
      /Refusing to contact evil.example/,
    );
    const limited = (async () => new Response('', { status: 403 })) as FetchImpl;
    await expect(listReleases({ releasesUrl: API, fetchImpl: limited })).rejects.toThrow(/limiting requests/);
  });

  it('keeps a download only if it matches the published checksum', async () => {
    const dir = tempDir();
    const [release] = await listReleases({ releasesUrl: API, fetchImpl: fakeGitHub([releaseJson(NEXT)]) });
    const ok = await downloadRelease(release!, dir, { releasesUrl: API, fetchImpl: fakeGitHub([releaseJson(NEXT)]) });
    expect(ok.sha256).toBe(SHA);
    expect(fs.readFileSync(ok.file)).toEqual(PACKAGE);

    const bad = tempDir();
    await expect(
      downloadRelease(release!, bad, { releasesUrl: API, fetchImpl: fakeGitHub([], { sha: 'a'.repeat(64) }) }),
    ).rejects.toThrow(/does not match its published checksum/);
    expect(fs.readdirSync(bad)).toEqual([]);
  });
});

function setup() {
  const paths = appPaths(path.join(tempDir(), 'home'));
  ensureHome(paths);
  const db = openDb(paths.db);
  return { paths, db };
}

describe('weekly update checks', () => {
  it('stay off until the candidate turns them on, then ask at most once a week', async () => {
    const { paths, db } = setup();
    const fetchImpl = fakeGitHub([releaseJson(NEXT)]);
    let now = Date.parse('2026-11-01T00:00:00Z');
    const checker = new UpdateChecker(db, paths, undefined, { releasesUrl: API, fetchImpl }, () => now);

    expect(await checker.tick()).toBe(false);
    expect(fetchImpl.calls).toEqual([]);
    expect(checker.status()).toMatchObject({
      current: VERSION,
      checks: 'off',
      checkedAt: null,
      updateAvailable: false,
    });

    setSetting(db, 'monitoring.updateChecks', 'weekly', 'test');
    expect(await checker.tick()).toBe(true);
    expect(checker.status()).toMatchObject({
      checks: 'weekly',
      updateAvailable: true,
      latest: { version: NEXT },
      error: null,
    });

    now += 6 * 24 * 3600_000;
    expect(await checker.tick()).toBe(false);
    now += 2 * 24 * 3600_000;
    expect(await checker.tick()).toBe(true);
    expect(fetchImpl.calls.filter((u) => u.startsWith(API))).toHaveLength(2);
  });

  it('keeps the last good answer when a check fails, and says why', async () => {
    const { paths, db } = setup();
    await new UpdateChecker(db, paths, undefined, {
      releasesUrl: API,
      fetchImpl: fakeGitHub([releaseJson(NEXT)]),
    }).check();
    const down = (async () => {
      throw new Error('offline');
    }) as FetchImpl;
    const status = await new UpdateChecker(db, paths, undefined, { releasesUrl: API, fetchImpl: down }).check();
    expect(status).toMatchObject({ updateAvailable: true, latest: { version: NEXT } });
    expect(status.error).toMatch(/Could not reach api.github.com/);
  });
});

interface Harness {
  paths: ReturnType<typeof appPaths>;
  ops: SystemOps & { log: string[] };
  updater: Updater;
  fetchImpl: ReturnType<typeof fakeGitHub>;
}

/** An updater with real data, backups and restores, and fake npm, tar, gh and service control. */
function harness(over: Partial<SystemOps> = {}, github: { sha?: string } = {}): Harness {
  const { paths, db } = setup();
  db.close();
  const log: string[] = [];
  let installed = VERSION;
  let running: number | null = 47999;
  const packages = new Map<string, string>();
  const ops: SystemOps & { log: string[] } = {
    log,
    runningPort: async () => running,
    stopService: async () => {
      log.push('stop');
      running = null;
    },
    packInstalled: (dest) => {
      fs.mkdirSync(dest, { recursive: true });
      const file = path.join(dest, `career-strike-${installed}.tgz`);
      fs.writeFileSync(file, 'previous');
      packages.set(file, installed);
      log.push(`pack ${installed}`);
      return file;
    },
    inspectPackage: () => ({ name: 'career-strike', version: NEXT }),
    verifyProvenance: () => 'unavailable',
    npmInstall: (file) => {
      installed = packages.get(file) ?? NEXT;
      log.push(`install ${installed}`);
      return { ok: true, output: '' };
    },
    runInstalled: (args) => {
      log.push(`run ${args.join(' ')}`);
      if (args[0] === '--version') return { ok: true, output: installed };
      if (args[0] === 'start') running = Number(args[2]);
      if (args[0] === 'stop') running = null;
      return { ok: true, output: '' };
    },
    ...over,
  };
  const fetchImpl = fakeGitHub([releaseJson(NEXT), releaseJson(VERSION)], github);
  const updater = new Updater({
    paths,
    currentVersion: VERSION,
    packageRoot: '/installed/career-strike',
    prefix: '/prefix',
    source: { repository: REPO, fetchImpl },
    ops,
    log: () => {},
  });
  return { paths, ops, updater, fetchImpl };
}

/** Simulate the new version migrating the database when it first starts. */
function migrateOnStart(paths: ReturnType<typeof appPaths>): void {
  const db = openDb(paths.db);
  db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (9999, 'future', 'now')").run();
  db.close();
}

describe('career-strike update', () => {
  it('verifies, keeps a way back, installs, and proves the new version starts', async () => {
    const h = harness();
    const r = await h.updater.update();
    expect(r).toEqual({ result: 'updated', from: VERSION, to: NEXT, provenance: 'unavailable', restarted: true });
    expect(h.ops.log).toEqual([
      `pack ${VERSION}`,
      'stop',
      `install ${NEXT}`,
      'run --version',
      'run start --port 47999',
    ]);
    const last = readHistory(h.paths).last!;
    expect(last).toMatchObject({ from: VERSION, to: NEXT, schemaBefore: inspectDb(h.paths.db) });
    expect(fs.existsSync(path.join(last.backupDir!, 'career-strike.db'))).toBe(true);
    expect(fs.existsSync(last.previousPackage!)).toBe(true);
  });

  it('leaves a stopped service stopped', async () => {
    const h = harness({ runningPort: async () => null });
    expect(await h.updater.update()).toMatchObject({ result: 'updated', restarted: false });
    expect(h.ops.log.slice(-2)).toEqual(['run start --port 0', 'run stop']);
  });

  it('says so when there is nothing newer, and refuses to "update" to an older release', async () => {
    const h = harness();
    const current = new Updater({
      paths: h.paths,
      currentVersion: NEXT,
      packageRoot: '/x',
      prefix: '/p',
      source: { repository: REPO, fetchImpl: h.fetchImpl },
      ops: h.ops,
      log: () => {},
    });
    expect(await current.update()).toEqual({ result: 'up-to-date', current: NEXT, latest: NEXT });
    await expect(current.update({ to: VERSION })).rejects.toThrow(/not newer.*--undo/);
    await expect(h.updater.update({ to: '9.9.9' })).rejects.toThrow(/no published release 9.9.9/);
  });

  it('changes nothing when the candidate declines', async () => {
    const h = harness();
    const asking = new Updater({
      paths: h.paths,
      currentVersion: VERSION,
      packageRoot: '/x',
      prefix: '/p',
      source: { repository: REPO, fetchImpl: h.fetchImpl },
      ops: h.ops,
      log: () => {},
      confirm: async () => false,
    });
    expect(await asking.update()).toEqual({ result: 'declined' });
    expect(h.ops.log).toEqual([]);
  });

  it.each([
    ['a checksum mismatch', {}, { sha: 'b'.repeat(64) }, /published checksum/],
    [
      'a package that is not the release it claims',
      { inspectPackage: () => ({ name: 'career-strike', version: '6.6.6' }) },
      {},
      /not the Career Strike release/,
    ],
    [
      'a provenance failure',
      { verifyProvenance: () => ({ failed: 'no attestation' }) },
      {},
      /provenance could not be verified: no attestation/,
    ],
  ] as const)('installs nothing after %s', async (_name, over, github, error) => {
    const h = harness(over as Partial<SystemOps>, github);
    await expect(h.updater.update()).rejects.toThrow(error);
    expect(h.ops.log).toEqual([]);
    expect(readHistory(h.paths).last).toBeNull();
  });

  it('puts the previous program and data back when the new version fails to start', async () => {
    let attempts = 0;
    const h = harness({
      runInstalled: (args) => {
        h.ops.log.push(`run ${args.join(' ')}`);
        if (args[0] === '--version') return { ok: true, output: NEXT };
        if (args[0] === 'start' && attempts++ === 0) {
          migrateOnStart(h.paths);
          return { ok: false, output: 'migration failed' };
        }
        return { ok: true, output: '' };
      },
    });
    const schemaBefore = inspectDb(h.paths.db);
    const r = await h.updater.update();
    expect(r).toMatchObject({ result: 'rolled-back', from: VERSION, to: NEXT });
    expect(r.result === 'rolled-back' && r.reason).toMatch(/did not start.*migration failed/);
    expect(h.ops.log).toEqual([
      `pack ${VERSION}`,
      'stop',
      `install ${NEXT}`,
      'run --version',
      'run start --port 47999',
      'run stop',
      `install ${VERSION}`,
      'run start --port 47999',
    ]);
    expect(inspectDb(h.paths.db)).toBe(schemaBefore);
    expect(readHistory(h.paths).last).toBeNull();
  });

  it('can be undone, restoring the data only if the new version changed it', async () => {
    const h = harness({ runningPort: async () => null });
    await h.updater.update();
    const after = new Updater({
      paths: h.paths,
      currentVersion: NEXT,
      packageRoot: '/x',
      prefix: '/p',
      source: { repository: REPO, fetchImpl: h.fetchImpl },
      ops: h.ops,
      log: () => {},
    });
    const schemaBefore = inspectDb(h.paths.db);
    migrateOnStart(h.paths);
    h.ops.log.length = 0;
    expect(await after.undo()).toEqual({ from: NEXT, to: VERSION, restoredData: true });
    expect(h.ops.log).toEqual([`install ${VERSION}`]);
    expect(inspectDb(h.paths.db)).toBe(schemaBefore);
    expect(readHistory(h.paths).last).toBeNull();
    await expect(after.undo()).rejects.toThrow(/no update to undo/);
  });

  it('announces what is new once, until dismissed', async () => {
    const h = harness();
    await h.updater.update();
    const db = openDb(h.paths.db);
    // The checker runs inside the new version; pretend this build is it.
    vi.resetModules();
    vi.doMock('../../src/core/version.js', () => ({ VERSION: NEXT, MIN_NODE_MAJOR: 22 }));
    const { UpdateChecker: NewChecker } = await import('../../src/updates/checker.js');
    const checker = new NewChecker(db, h.paths);
    expect(checker.status().whatsNew).toMatchObject({ from: VERSION, to: NEXT });
    expect(checker.acknowledge().whatsNew).toBeNull();
    vi.doUnmock('../../src/core/version.js');
    db.close();
  });
});

it('UpdateError is the only error the CLI reports without a stack', () => {
  expect(new UpdateError('x')).toBeInstanceOf(Error);
});
