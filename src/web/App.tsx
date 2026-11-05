import { useQueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, onConnectionProblem, setCsrfToken } from './api';
import { type Connection, ConnectionContext, type ConnectionState, RETRY_MS } from './connection';
import { router } from './routes';

export function App() {
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<Connection>('checking');
  const [generation, setGeneration] = useState(0);
  const connectionRef = useRef(connection);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  const checkSession = useCallback(async () => {
    try {
      const session = await api<{ kind: string; csrf?: string }>('/api/session');
      setCsrfToken(session.csrf ?? null);
      if (connectionRef.current === 'unavailable') {
        // Cached data is from before the outage. Drop it *before* the remount so the remounted
        // pages subscribe to fresh queries (removing it afterwards would orphan their fetches).
        queryClient.removeQueries();
        setGeneration((g) => g + 1);
      }
      setConnection('connected');
    } catch (err) {
      setConnection(err instanceof ApiError && err.status === 401 ? 'unauthenticated' : 'unavailable');
    }
  }, [queryClient]);

  useEffect(() => {
    void checkSession();
    return onConnectionProblem((problem) => setConnection(problem));
  }, [checkSession]);

  useEffect(() => {
    if (connection !== 'unavailable') return;
    const timer = window.setInterval(() => void checkSession(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [connection, checkSession]);

  const logout = useCallback(async () => {
    await api('/api/session/logout', { method: 'POST' }).catch(() => undefined);
    setCsrfToken(null);
    queryClient.clear();
    setConnection('unauthenticated');
  }, [queryClient]);

  const value = useMemo<ConnectionState>(() => ({ connection, generation, logout }), [connection, generation, logout]);

  if (connection === 'checking') return <div className="boot" aria-busy="true" />;
  if (connection === 'unauthenticated') return <SessionRequired />;

  return (
    <ConnectionContext.Provider value={value}>
      <RouterProvider router={router} />
    </ConnectionContext.Provider>
  );
}

function SessionRequired() {
  return (
    <main className="standalone" id="main">
      <p className="eyebrow">Career Strike</p>
      <h1>Open the dashboard from your terminal</h1>
      <p>
        For your privacy, the dashboard only opens through a one-time link created on this computer. Run this command
        and your browser will open signed in:
      </p>
      <pre className="command">career-strike dashboard</pre>
      <p className="muted">Nothing here works from another website or another device.</p>
    </main>
  );
}
