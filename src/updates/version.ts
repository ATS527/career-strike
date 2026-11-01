// Career Strike releases use plain semantic versions (MAJOR.MINOR.PATCH). Pre-releases are not
// offered to candidates, so they are not parsed.

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;

export function parseVersion(raw: string): [number, number, number] | null {
  const m = SEMVER.exec(raw.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative if a < b, zero if equal, positive if a > b. Unparseable versions sort first. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return (pa ? 1 : 0) - (pb ? 1 : 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
