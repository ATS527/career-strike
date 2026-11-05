// Offline by default: a test that reaches beyond this computer fails loudly instead of silently
// depending on (and waiting for) the internet. Live tests opt in with CS_LIVE=1.
if (!process.env.CS_LIVE) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      throw new TypeError(
        `Network access to ${url.hostname} is blocked in offline tests (set CS_LIVE=1 for live tests).`,
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;
}
