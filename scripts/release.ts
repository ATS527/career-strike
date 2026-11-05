// Cut a Career Strike release.
//
//   npm run release -- 0.3.0          bump, commit "Release 0.3.0" and tag v0.3.0 (locally)
//   npm run release -- 0.3.0 --push   …and push main and the tag, which starts the release workflow
//   npm run release -- verify v0.3.0 [--notes release-notes.md --repository owner/name]
//                                     (CI) check a tag against package.json and CHANGELOG.md, and
//                                     write the release notes with the install command
//
// Write the CHANGELOG.md section for the version first: it becomes the release notes and the
// "what's new" note shown in the dashboard after updating.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { notesFor } from '../src/updates/changelog.js';
import { compareVersions, parseVersion } from '../src/updates/version.js';

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();
const pkgVersion = (): string => (JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }).version;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Release notes for GitHub: the changelog section with links made absolute, plus how to install. */
function releaseNotes(notes: string, tag: string, repository: string): string {
  const base = `https://github.com/${repository}`;
  const absolute = notes.replace(
    /\]\((?!https?:|#)([^)]+)\)/g,
    (_m, target: string) => `](${base}/blob/${tag}/${target})`,
  );
  return `${absolute}

## Install or update

Already using Career Strike 0.2.0 or later:

    career-strike update

New install, or updating from 0.1.0 (stop the service first with \`career-strike stop\`):

    npm install --global ${base}/releases/download/${tag}/career-strike-${tag.replace(/^v/, '')}.tgz

Check this package was built from this repository: \`gh attestation verify career-strike-${tag.replace(/^v/, '')}.tgz --repo ${repository}\`
`;
}

function verify(tag: string, notesOut?: string, repository?: string): void {
  const version = tag.replace(/^v/, '');
  if (!parseVersion(version) || !tag.startsWith('v')) fail(`Release tags look like v1.2.3 (got ${tag}).`);
  if (pkgVersion() !== version) fail(`Tag ${tag} does not match package.json version ${pkgVersion()}.`);
  const notes = notesFor(version, fs.readFileSync('CHANGELOG.md', 'utf8'));
  if (!notes) fail(`CHANGELOG.md has no section for ${version}.`);
  if (notesOut) fs.writeFileSync(notesOut, repository ? releaseNotes(notes, tag, repository) : `${notes}\n`);
  console.log(`${tag} matches package.json and CHANGELOG.md.`);
}

function cut(version: string, push: boolean): void {
  if (!parseVersion(version)) fail(`Use a plain version such as 0.3.0 (got ${version}).`);
  if (compareVersions(version, pkgVersion()) <= 0 && !(version === pkgVersion() && !tagExists(`v${version}`))) {
    fail(`${version} is not newer than ${pkgVersion()}.`);
  }
  if (git('branch', '--show-current') !== 'main') fail('Release from main.');
  if (git('status', '--porcelain') !== '') fail('Commit or stash your changes first.');
  git('fetch', '--quiet', 'origin', 'main');
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main'))
    fail('main is not in sync with origin/main. Pull or push first.');
  if (!notesFor(version, fs.readFileSync('CHANGELOG.md', 'utf8')))
    fail(`Add a "## [${version}] - YYYY-MM-DD" section to CHANGELOG.md first.`);

  if (pkgVersion() !== version) {
    execFileSync('npm', ['version', version, '--no-git-tag-version'], { stdio: 'inherit' });
    git('add', 'package.json', 'package-lock.json');
    execFileSync('git', ['commit', '-m', `Release ${version}`], { stdio: 'inherit' });
  }
  git('tag', '-a', `v${version}`, '-m', `Career Strike ${version}`);
  console.log(`Tagged v${version}.`);
  if (push) {
    execFileSync('git', ['push', 'origin', 'main', `v${version}`], { stdio: 'inherit' });
    console.log('Pushed. The release workflow builds, tests and publishes it on GitHub.');
  } else {
    console.log(`Publish it with: git push origin main v${version}`);
  }
}

function tagExists(tag: string): boolean {
  try {
    git('rev-parse', '--verify', '--quiet', `refs/tags/${tag}`);
    return true;
  } catch {
    return false;
  }
}

const [first, second, ...rest] = process.argv.slice(2);
if (first === 'verify' && second) {
  const opt = (name: string): string | undefined => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  verify(second, opt('--notes'), opt('--repository'));
} else if (first) {
  cut(first, [second, ...rest].includes('--push'));
} else {
  fail('Usage: npm run release -- <version> [--push]   |   npm run release -- verify <tag> [--notes <file>]');
}
