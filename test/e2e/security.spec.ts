import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, signIn, test } from './fixtures.js';

/**
 * A hostile page on another localhost port (same site, different origin) tries to change
 * settings with the signed-in user's cookie, using every browser mechanism available to it.
 */
function attackerServer(targetOrigin: string): Promise<http.Server> {
  const page = `<!doctype html><html><body>
<form id="f" method="POST" action="${targetOrigin}/api/settings/search.remotePreference" enctype="text/plain">
<input name='{"value":"onsite_ok","x":"' value='"}'></form>
<script>
window.results = [];
const target = ${JSON.stringify(targetOrigin)};
const attempt = (label, p) => p.then(r => results.push(label + ':' + r.status), e => results.push(label + ':blocked'));
attempt('put-json', fetch(target + '/api/settings/search.remotePreference', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json', 'x-cs-csrf': 'guess' }, body: JSON.stringify({ value: 'onsite_ok' }) }));
attempt('put-simple', fetch(target + '/api/settings/search.remotePreference', { method: 'POST', credentials: 'include', mode: 'no-cors', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ value: 'onsite_ok' }) }));
attempt('read', fetch(target + '/api/settings', { credentials: 'include' }).then(r => r.text().then(() => r)));
setTimeout(() => document.getElementById('f').submit(), 1200);
</script></body></html>`;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('a hostile page on another localhost port cannot read or change data', async ({ page, cs }) => {
  await signIn(page, cs);
  const server = await attackerServer(cs.origin);
  try {
    const attackerOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const attackPage = await page.context().newPage();
    // Console noise from blocked requests on the attacker page is expected.
    await attackPage.goto(attackerOrigin);
    await attackPage.waitForFunction(() => (window as unknown as { results: string[] }).results.length === 3);
    const results = await attackPage.evaluate(() => (window as unknown as { results: string[] }).results);
    // Cross-origin reads are opaque or blocked; preflighted writes never reach the API.
    expect(results).toContain('put-json:blocked');
    expect(results).toContain('read:blocked');
    // Then the classic form-post CSRF fires and navigates the attacker tab.
    await attackPage.waitForURL(`${cs.origin}/**`);
    await attackPage.close();
  } finally {
    server.close();
  }
  expect((await cs.settings())['search.remotePreference']).toBe('remote_only');
});

test('the dashboard refuses to render inside a frame', async ({ page, cs }) => {
  await signIn(page, cs);
  const res = await page.request.get(`${cs.origin}/`);
  expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});
