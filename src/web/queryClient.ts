import { QueryClient } from '@tanstack/react-query';

// Server state for the dashboard. The API is on loopback, so queries always run (never paused
// for "offline"), and failures surface immediately with a "Try again" rather than silent retries.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: 'always', retry: false, refetchOnWindowFocus: false, staleTime: 0 },
    mutations: { networkMode: 'always', retry: false },
  },
});
