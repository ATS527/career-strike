import type { SourceId } from './types.js';

// Public careers-page hosts for each supported ATS, so users can paste the page they already know.
const HOSTS: readonly [RegExp, SourceId][] = [
  [/^(?:job-)?boards\.greenhouse\.io$/, 'greenhouse'],
  [/^(?:job-)?boards\.eu\.greenhouse\.io$/, 'greenhouse'],
  [/^jobs\.(?:eu\.)?lever\.co$/, 'lever'],
  [/^jobs\.ashbyhq\.com$/, 'ashby'],
];

/** Recognise a public board URL such as https://jobs.lever.co/acme/123 → { lever, acme }. */
export function boardFromUrl(raw: string, practiceOrigin: string | null = null): { source: SourceId; board: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  // The owned practice endpoint: http://127.0.0.1:<port>/boards/<name>, only once registered.
  if (practiceOrigin && url.origin === practiceOrigin) {
    const [first, name] = url.pathname.split('/').filter(Boolean);
    return first === 'boards' && name ? { source: 'practice', board: decodeURIComponent(name) } : null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const match = HOSTS.find(([re]) => re.test(url.hostname));
  const board = url.pathname.split('/').filter(Boolean)[0];
  if (!match || !board) return null;
  // Greenhouse also serves embedded boards as /embed/job_board?for=<board>.
  if (match[1] === 'greenhouse' && board === 'embed') {
    const forBoard = url.searchParams.get('for');
    return forBoard ? { source: 'greenhouse', board: forBoard } : null;
  }
  return { source: match[1], board: decodeURIComponent(board) };
}
