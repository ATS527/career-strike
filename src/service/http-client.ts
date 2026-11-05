import http from 'node:http';

export interface LocalResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: unknown;
}

export interface LocalRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

/** Loopback HTTP client built on node:http so callers (and security tests) control the Host header exactly. */
export function localRequest(port: number, path: string, opts: LocalRequestOptions = {}): Promise<LocalResponse> {
  const data = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: opts.method ?? 'GET',
        timeout: opts.timeoutMs ?? 5000,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(data === undefined
            ? {}
            : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(data)) }),
          ...opts.headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          text += chunk;
        });
        res.on('end', () => {
          let body: unknown = text;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            // Non-JSON bodies are returned as text.
          }
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    if (data !== undefined) req.write(data);
    req.end();
  });
}
