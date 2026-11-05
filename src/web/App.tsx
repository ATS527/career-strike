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

  if (connection === 'checking') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center" aria-busy="true">
        <div className="h-9 w-9 rounded-full border-3 border-border border-t-primary animate-spin" />
      </div>
    );
  }
  if (connection === 'unauthenticated') return <SessionRequired />;

  return (
    <ConnectionContext.Provider value={value}>
      <RouterProvider router={router} />
    </ConnectionContext.Provider>
  );
}

function SessionRequired() {
  return (
    <main className="max-w-[40rem] mx-auto mt-[12vh] px-6 flex flex-col gap-4 text-foreground" id="main">
      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Career Strike</p>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Open the dashboard from your terminal</h1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        For your privacy, the dashboard only opens through a one-time link created on this computer. Run this command
        and your browser will open signed in:
      </p>
      <pre className="font-mono text-sm p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 shadow-md overflow-x-auto">
        career-strike dashboard
      </pre>
      <p className="text-xs text-muted-foreground">Nothing here works from another website or another device.</p>
    </main>
  );
}
