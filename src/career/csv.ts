// A small RFC 4180 CSV reader for candidate-supplied exports. Input is untrusted, so every
// dimension is bounded and a malformed file is reported, never half-read.

export class CsvError extends Error {}

export interface CsvLimits {
  maxRows: number;
  maxFields: number;
  maxFieldChars: number;
}

const DEFAULT_LIMITS: CsvLimits = { maxRows: 5_000, maxFields: 60, maxFieldChars: 20_000 };

export function parseCsv(text: string, limits: CsvLimits = DEFAULT_LIMITS): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endField = (): void => {
    if (row.length >= limits.maxFields) throw new CsvError(`A row has more than ${limits.maxFields} columns.`);
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    if (!(row.length === 1 && row[0] === '')) {
      if (rows.length >= limits.maxRows) throw new CsvError(`The file has more than ${limits.maxRows} rows.`);
      rows.push(row);
    }
    row = [];
  };

  for (; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') {
      if (field !== '') throw new CsvError('A quote appears in the middle of a value.');
      quoted = true;
    } else if (ch === ',') endField();
    else if (ch === '\n') endRow();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
    if (field.length > limits.maxFieldChars) throw new CsvError('A value is longer than expected.');
  }
  if (quoted) throw new CsvError('A quoted value is never closed.');
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/**
 * Rows as records keyed by header. Exports sometimes start with notes, so the header is the
 * first of the leading rows that names every required column (matched case-insensitively).
 * Returns null when no such header exists.
 */
export function csvRecords(
  text: string,
  required: readonly string[],
  limits?: CsvLimits,
): Record<string, string>[] | null {
  const rows = parseCsv(text, limits);
  const want = required.map((r) => r.toLowerCase());
  const at = rows.slice(0, 10).findIndex((r) => {
    const have = new Set(r.map((c) => c.trim().toLowerCase()));
    return want.every((w) => have.has(w));
  });
  if (at < 0) return null;
  const header = rows[at]!.map((c) => c.trim().toLowerCase());
  return rows.slice(at + 1).map((r) => Object.fromEntries(header.map((h, j) => [h, (r[j] ?? '').trim()])));
}
