import { useQuery } from '@tanstack/react-query';
import { api, ServiceUnavailableError } from '../api';

export type Resource<T> =
  | { state: 'loading' }
  | { state: 'error'; message: string; retry: () => void }
  | { state: 'ready'; data: T; reload: () => void };

/** Query key for a GET of a local API path; invalidate with `['api']` to refetch everything. */
export const apiKey = (path: string): readonly ['api', string] => ['api', path];

/** Fetch a JSON resource from the local API with honest loading and error states. */
export function useResource<T>(path: string): Resource<T> {
  const query = useQuery({ queryKey: apiKey(path), queryFn: () => api<T>(path) });
  const refetch = (): void => void query.refetch();

  if (query.data !== undefined) return { state: 'ready', data: query.data, reload: refetch };
  // A retry after an error shows the loading state again rather than the stale error.
  if (query.isPending || query.isFetching) return { state: 'loading' };
  return {
    state: 'error',
    message:
      query.error instanceof ServiceUnavailableError
        ? 'The service is not reachable.'
        : 'This information could not be loaded.',
    retry: refetch,
  };
}
