import { createContext, useContext } from 'react';

export type Connection = 'checking' | 'connected' | 'unauthenticated' | 'unavailable';

export const RETRY_MS = 3000;

export interface ConnectionState {
  connection: Connection;
  /** Bumped after reconnecting so pages refetch rather than show data from before the outage. */
  generation: number;
  logout: () => Promise<void>;
}

export const ConnectionContext = createContext<ConnectionState | null>(null);

export function useConnection(): ConnectionState {
  const value = useContext(ConnectionContext);
  if (!value) throw new Error('useConnection must be used inside <App>');
  return value;
}
