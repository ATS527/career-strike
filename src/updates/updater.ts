import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { AppPaths } from '../core/paths.js';
import { runningService, stopService } from '../service/control.js';
import { inspectDb } from '../store/db.js';
import { backup, restore } from '../store/lifecycle.js';
import {
  downloadRelease,
  latestRelease,
  listReleases,
  type Release,
  type ReleaseSourceOptions,
  releaseRepository,
  releaseSourceOverridden,
  UpdateError,
} from './releases.js';
import { readHistory, type UpdateRecord, updatesDir, writeHistory } from './state.js';
import { compareVersions } from './version.js';

/** Operating-system work the updater does, replaceable in tests. */
export interface SystemOps {
  /** The port the service is running on, or null if it is not running. */
  runningPort(): Promise<number | null>;
  stopService(): Promise<void>;
  /** Pack the installed program so it can be reinstalled offline; null if that is not possible. */
  packInstalled(destDir: string): string | null;
  /** The package name and version inside a release archive. */
  inspectPackage(file: string): { name: string; version: string } | null;
  /** 'verified', 'unavailable' (no signed-in GitHub CLI) or the reason verification failed. */
  verifyProvenance(file: string): 'verified' | 'unavailable' | { failed: string };
  npmInstall(file: string): { ok: boolean; output: string };
  /** Run the installed `career-strike` program (the new one, after npmInstall). */
  runInstalled(args: string[]): { ok: boolean; output: string };
}

export interface UpdaterOptions {
  paths: AppPaths;
  currentVersion: string;
  /** Where the running program is installed, and the npm prefix it was installed into. */
  packageRoot: string;
  prefix: string;
  source?: ReleaseSourceOptions;
  ops?: Partial<SystemOps>;
  log?: (line: string) => void;
  /** Asked before anything changes; answer false to stop. */
  confirm?: (question: string) => Promise<boolean>;
  now?: () => Date;
}

export type UpdateOutcome =
  | { result: 'up-to-date'; current: string; latest: string | null }
  | { result: 'declined' }
  | { result: 'updated'; from: string; to: string; provenance: 'verified' | 'unavailable'; restarted: boolean }
  | { result: 'rolled-back'; from: string; to: string; reason: string };

const run = (cmd: string, args: string[], cwd?: string): { ok: boolean; output: string } => {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 16 * 1024 * 1024,
  });
  return { ok: r.status === 0, output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? r.error.message : ''}`.trim() };
};

export function installedBin(prefix: string): string {
  return process.platform === 'win32'
    ? path.join(prefix, 'career-strike.cmd')
    : path.join(prefix, 'bin', 'career-strike');
}

export function systemOps(paths: AppPaths, packageRoot: string, prefix: string, repository: string | null): SystemOps {
  return {
    runningPort: async () => (await runningService(paths))?.port ?? null,
    stopService: async () => void (await stopService(paths)),
    packInstalled: (destDir) => {
      fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
      // --ignore-scripts: an installed copy has no build tools; it is packed exactly as installed.
      const r = run('npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', destDir, packageRoot]);
      const name = r.output.split('\n').pop()?.trim();
      return r.ok && name && fs.existsSync(path.join(destDir, name)) ? path.join(destDir, name) : null;
    },
    inspectPackage: (file) => {
      const r = run('tar', ['-xzOf', file, 'package/package.json']);
      if (!r.ok) return null;
      try {
        const pkg = JSON.parse(r.output) as { name?: unknown; version?: unknown };
        return typeof pkg.name === 'string' && typeof pkg.version === 'string'
          ? { name: pkg.name, version: pkg.version }
          : null;
      } catch {
        return null;
      }
    },
    verifyProvenance: (file) => {
      if (!repository || !run('gh', ['auth', 'status']).ok) return 'unavailable';
      const r = run('gh', ['attestation', 'verify', file, '--repo', repository]);
      return r.ok ? 'verified' : { failed: r.output.split('\n').slice(-3).join(' ') };
    },
    npmInstall: (file) => run('npm', ['install', '--global', '--prefix', prefix, '--no-fund', '--no-audit', file]),
    runInstalled: (args) => run(installedBin(prefix), args),
  };
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-');
}

/** Remove packages and backups from earlier updates, keeping the ones `keep` refers to. */
function prune(paths: AppPaths, keep: readonly (string | null)[]): void {
  const dir = updatesDir(paths);
  const kept = new Set(keep.filter((k): k is string => k !== null).map((k) => path.resolve(k)));
  for (const sub of ['packages', 'backups']) {
    const base = path.join(dir, sub);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base)) {
      const full = path.join(base, entry);
      if (![...kept].some((k) => k === full || k.startsWith(`${full}${path.sep}`)))
        fs.rmSync(full, { recursive: true, force: true });
    }
  }
}

export class Updater {
  private readonly ops: SystemOps;
  private readonly log: (line: string) => void;
  private readonly confirm: (question: string) => Promise<boolean>;
  private readonly now: () => Date;

  constructor(private readonly o: UpdaterOptions) {
    this.ops = { ...systemOps(o.paths, o.packageRoot, o.prefix, releaseRepository(o.source)), ...o.ops };
    this.log = o.log ?? ((line) => console.log(line));
    this.confirm = o.confirm ?? (async () => true);
    this.now = o.now ?? (() => new Date());
  }

  /** The release to install: a named version, or the newest one. */
  async target(to?: string): Promise<{ current: string; release: Release | null }> {
    const current = this.o.currentVersion;
    if (!to) return { current, release: await latestRelease(this.o.source) };
    const wanted = to.replace(/^v/, '');
    const release = (await listReleases(this.o.source)).find((r) => r.version === wanted);
    if (!release) throw new UpdateError(`There is no published release ${wanted}.`);
    return { current, release };
  }

  async update(opts: { to?: string } = {}): Promise<UpdateOutcome> {
    const { paths } = this.o;
    const from = this.o.currentVersion;
    const { release } = await this.target(opts.to);
    if (!release || compareVersions(release.version, from) <= 0) {
      if (opts.to && release)
        throw new UpdateError(
          `${release.version} is not newer than ${from}. To go back after an update, use \`career-strike update --undo\`.`,
        );
      return { result: 'up-to-date', current: from, latest: release?.version ?? null };
    }

    this.log(`Career Strike ${release.version} is available (you have ${from}).`);
    if (release.notes) this.log(`\n${release.notes}\n`);
    this.log(`Release notes: ${release.url}`);
    if (!(await this.confirm(`Update to ${release.version}?`))) return { result: 'declined' };

    // 1. Download and verify before touching anything.
    const work = path.join(updatesDir(paths), 'packages', `${release.version}-${stamp(this.now())}`);
    this.log('Downloading and checking the release…');
    const { file } = await downloadRelease(release, work, this.o.source);
    const inside = this.ops.inspectPackage(file);
    if (inside?.name !== 'career-strike' || inside.version !== release.version) {
      throw new UpdateError(
        'The downloaded package is not the Career Strike release it claims to be. Nothing was installed.',
      );
    }
    // Attestations exist only for packages built by the GitHub release workflow.
    const provenance = releaseSourceOverridden(this.o.source) ? 'unavailable' : this.ops.verifyProvenance(file);
    if (typeof provenance === 'object')
      throw new UpdateError(
        `The package's build provenance could not be verified: ${provenance.failed}. Nothing was installed.`,
      );
    this.log(
      provenance === 'verified'
        ? 'Checksum and build provenance verified.'
        : releaseSourceOverridden(this.o.source)
          ? 'Checksum verified. (Test release source: build provenance is not checked.)'
          : 'Checksum verified. (Sign in to the GitHub CLI to also verify build provenance.)',
    );

    // 2. Keep a way back: the current program and a full copy of the data.
    const previousPackage = this.ops.packInstalled(path.join(updatesDir(paths), 'packages', `${from}-previous`));
    if (!previousPackage)
      throw new UpdateError('Could not keep a copy of the installed version to return to. Nothing was changed.');
    const port = await this.ops.runningPort();
    const wasRunning = port !== null;
    if (wasRunning) {
      this.log('Stopping the service…');
      await this.ops.stopService();
    }
    const schemaBefore = inspectDb(paths.db);
    let backupDir: string | null = null;
    if (schemaBefore !== null) {
      backupDir = path.join(updatesDir(paths), 'backups', `before-${release.version}-${stamp(this.now())}`);
      backup(paths, backupDir);
      this.log(`Backed up your data to ${backupDir}`);
    }
    const record: UpdateRecord = {
      from,
      to: release.version,
      at: this.now().toISOString(),
      previousPackage,
      backupDir,
      schemaBefore,
    };

    // 3. Install, then prove the new version runs: it must report its version and start cleanly
    //    (starting applies any database changes, after their own pre-upgrade backup).
    this.log(`Installing ${release.version}…`);
    const failure = this.installAndProve(file, release.version, port);
    if (failure) {
      this.log(`The update did not work: ${failure}`);
      this.log('Putting the previous version back…');
      this.recover(record, port);
      return { result: 'rolled-back', from, to: release.version, reason: failure };
    }
    if (!wasRunning) this.ops.runInstalled(['stop']);

    writeHistory(paths, { last: record, acknowledged: readHistory(paths).acknowledged });
    prune(paths, [file, previousPackage, backupDir]);
    return { result: 'updated', from, to: release.version, provenance, restarted: wasRunning };
  }

  /** Start on the port the service had, or on any free port when only proving it starts. */
  private start(port: number | null): { ok: boolean; output: string } {
    return this.ops.runInstalled(['start', '--port', String(port ?? 0)]);
  }

  private installAndProve(file: string, version: string, port: number | null): string | null {
    const install = this.ops.npmInstall(file);
    if (!install.ok) return `npm could not install the package. ${install.output.split('\n').slice(-3).join(' ')}`;
    const reported = this.ops.runInstalled(['--version']);
    if (!reported.ok || reported.output.trim() !== version)
      return `the installed program reports "${reported.output.trim()}" instead of ${version}.`;
    const started = this.start(port);
    if (!started.ok) return `the new version did not start. ${started.output.split('\n').slice(-3).join(' ')}`;
    return null;
  }

  /** Reinstall the previous program and, if the data was changed, the backup taken before. */
  private recover(record: UpdateRecord, port: number | null): void {
    this.ops.runInstalled(['stop']);
    if (!record.previousPackage || !this.ops.npmInstall(record.previousPackage).ok) {
      throw new UpdateError(
        `Could not reinstall ${record.from}. Install it by hand: npm install --global ${record.previousPackage ?? `career-strike@${record.from}`}`,
      );
    }
    const schemaNow = inspectDb(this.o.paths.db);
    if (record.backupDir && schemaNow !== record.schemaBefore) {
      const r = restore(this.o.paths, record.backupDir);
      this.log(
        `Restored your data from before the update.${r.previous ? ` The changed copy was kept at ${r.previous}` : ''}`,
      );
    }
    if (port !== null) this.start(port);
    this.log(`Career Strike ${record.from} is back in place.`);
  }

  /** Return to the version that was replaced by the last update. */
  async undo(): Promise<{ from: string; to: string; restoredData: boolean }> {
    const { paths } = this.o;
    const history = readHistory(paths);
    const last = history.last;
    if (!last || last.to !== this.o.currentVersion)
      throw new UpdateError('There is no update to undo for this version.');
    if (!last.previousPackage || !fs.existsSync(last.previousPackage))
      throw new UpdateError(`The copy of ${last.from} kept for undo is missing.`);
    const schemaNow = inspectDb(paths.db);
    const mustRestore = last.backupDir !== null && schemaNow !== last.schemaBefore;
    if (mustRestore) {
      this.log(
        `Version ${last.from} cannot read data saved by ${last.to}, so your data will be restored from the backup taken before the update (${last.at}).`,
      );
      this.log('Anything you changed since then will be kept aside, not deleted, but will not appear in the app.');
    }
    if (!(await this.confirm(`Go back to ${last.from}?`))) throw new UpdateError('Nothing was changed.');

    const port = await this.ops.runningPort();
    if (port !== null) await this.ops.stopService();
    const install = this.ops.npmInstall(last.previousPackage);
    if (!install.ok)
      throw new UpdateError(`npm could not reinstall ${last.from}. ${install.output.split('\n').slice(-3).join(' ')}`);
    if (mustRestore && last.backupDir) {
      const r = restore(paths, last.backupDir);
      if (r.previous) this.log(`Your data from ${last.to} was kept at ${r.previous}`);
    }
    if (port !== null) this.start(port);
    writeHistory(paths, { last: null, acknowledged: history.acknowledged });
    return { from: last.to, to: last.from, restoredData: mustRestore };
  }
}
