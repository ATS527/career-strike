import { inflateSync } from 'node:zlib';
import { strFromU8, unzipSync } from 'fflate';
import { decodeHTML } from 'entities';

/** Best-effort text extraction from a stored document. Returns null when no readable text can be recovered. */
export function extractDocumentText(mime: string, bytes: Buffer): string | null {
  if (mime === 'text/plain') return bytes.toString('utf8');
  if (mime === 'application/pdf') return extractPdfText(bytes);
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return extractDocxText(bytes);
  return null;
}

function extractPdfText(bytes: Buffer): string | null {
  if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) return null;
  const raw = bytes.toString('latin1');
  const chunks: string[] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  let foundStream = false;
  while ((match = streamRegex.exec(raw)) !== null) {
    foundStream = true;
    let content = Buffer.from(match[1] ?? '', 'latin1');
    try {
      content = inflateSync(content);
    } catch {
      // Not a FlateDecode stream (or already decoded); keep the raw bytes.
    }
    chunks.push(extractPdfOperators(content.toString('latin1')));
  }
  if (!foundStream) chunks.push(extractPdfOperators(raw));
  const text = chunks.join('\n').trim();
  return text ? text : null;
}

function extractPdfOperators(content: string): string {
  const out: string[] = [];
  // Text-showing operators: (string) Tj and [(string) ...] TJ
  const operatorRegex = /\((?:\\.|[^()\\])*\)\s*Tj|\[(?:[^\]]*)\]\s*TJ/gi;
  let match: RegExpExecArray | null;
  while ((match = operatorRegex.exec(content)) !== null) {
    const token = match[0];
    if (/TJ$/i.test(token)) {
      const strings = token.match(/\((?:\\.|[^()\\])*\)/g) ?? [];
      out.push(strings.map(decodePdfString).join(''));
    } else {
      const stringMatch = token.match(/^\(([\s\S]*)\)\s*Tj$/i);
      if (stringMatch) out.push(decodePdfString(`(${stringMatch[1]})`));
    }
    out.push(' ');
  }
  return out.join('');
}

function decodePdfString(token: string): string {
  const inner = token.startsWith('(') && token.endsWith(')') ? token.slice(1, -1) : token;
  let result = '';
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i]!;
    if (ch !== '\\') {
      result += ch;
      i += 1;
      continue;
    }
    const next = inner[i + 1];
    if (next === undefined) {
      i += 1;
      continue;
    }
    if (next === 'n') { result += '\n'; i += 2; continue; }
    if (next === 'r') { result += '\r'; i += 2; continue; }
    if (next === 't') { result += '\t'; i += 2; continue; }
    if (next === 'b') { result += '\b'; i += 2; continue; }
    if (next === 'f') { result += '\f'; i += 2; continue; }
    if (next === '(' || next === ')' || next === '\\') { result += next; i += 2; continue; }
    if (/[0-7]/.test(next)) {
      let octal = next;
      let j = i + 2;
      while (j < inner.length && j < i + 4 && /[0-7]/.test(inner[j]!)) {
        octal += inner[j]!;
        j += 1;
      }
      result += String.fromCharCode(parseInt(octal, 8));
      i = j;
      continue;
    }
    // Line continuation or unknown escape: drop the backslash.
    i += 1;
  }
  return result;
}

function extractDocxText(bytes: Buffer): string | null {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(new Uint8Array(bytes));
  } catch {
    return null;
  }
  const entryName = Object.keys(unzipped).find((name) => /(^|\/)word\/document[^/]*\.xml$/i.test(name));
  if (!entryName) return null;
  const xml = strFromU8(unzipped[entryName]!);
  const paragraphs = xml.split(/<\/w:p>/i);
  const lines = paragraphs
    .map((paragraph) => {
      const strings = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((m) => decodeHTML(m[1]!));
      return strings.join('').replace(/\s+/g, ' ').trim();
    })
    .filter((line) => line.length > 0);
  const text = lines.join('\n').trim();
  return text ? text : null;
}