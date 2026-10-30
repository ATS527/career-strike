import { useCallback, useEffect, useState } from 'react';
import { api, ServiceUnavailableError } from './api';

export type Resource<T> =
  | { state: 'loading' }
  | { state: 'error'; message: string; retry: () => void }
  | { state: 'ready'; data: T; reload: () => void };

/** Fetch a JSON resource from the local API with honest loading and error states. */
export function useResource<T>(path: string): Resource<T> {
  const [result, setResult] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });

  const load = useCallback(() => {
    let cancelled = false;
    setResult((r) => ({ ...r, loading: true }));
    api<T>(path).then(
      (data) => !cancelled && setResult({ data, loading: false }),
      (err: unknown) =>
        !cancelled &&
        setResult({
          loading: false,
          error: err instanceof ServiceUnavailableError ? 'The service is not reachable.' : 'This information could not be loaded.',
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => load(), [load]);

  if (result.data !== undefined) return { state: 'ready', data: result.data, reload: () => void load() };
  if (result.loading) return { state: 'loading' };
  return { state: 'error', message: result.error ?? 'Unknown error', retry: () => void load() };
}
