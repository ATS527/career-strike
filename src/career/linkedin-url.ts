// LinkedIn member profile addresses: https://www.linkedin.com/in/<name>/, also written with a
// country subdomain (in., de., uk. …) or without a scheme. Anything else — company pages, jobs,
// other hosts, unsafe schemes, credentials or ports — is refused. The result is one canonical
// form, so the same profile always compares equal.

const HOST = /^(?:www\.|[a-z]{2,3}\.)?linkedin\.com$/;
const SLUG = /^[\p{L}\p{N}_-]{3,100}$/u;

export type LinkedInUrlResult = { ok: true; url: string } | { ok: false; reason: string };

export function normalizeLinkedInUrl(raw: string): LinkedInUrlResult {
  const input = raw.trim();
  if (!input) return { ok: false, reason: 'Enter your LinkedIn profile address.' };
  if (input.length > 300) return { ok: false, reason: 'That address is too long.' };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, reason: 'That is not a web address.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return { ok: false, reason: 'Only https:// LinkedIn addresses are accepted.' };
  if (url.username || url.password || url.port)
    return { ok: false, reason: 'That address contains a user name, password or port.' };
  if (!HOST.test(url.hostname.toLowerCase())) return { ok: false, reason: 'That is not a linkedin.com address.' };
  const m = /^\/in\/([^/]+)\/?$/i.exec(url.pathname);
  if (!m) return { ok: false, reason: 'Use your member profile address, which looks like linkedin.com/in/your-name.' };
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]!).toLowerCase();
  } catch {
    return { ok: false, reason: 'That profile address is malformed.' };
  }
  if (!SLUG.test(slug)) return { ok: false, reason: 'That profile name is not valid.' };
  return { ok: true, url: `https://www.linkedin.com/in/${encodeURIComponent(slug)}/` };
}
