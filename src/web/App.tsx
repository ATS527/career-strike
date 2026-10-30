import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, onConnectionProblem, setCsrfToken } from './api';
import { AddJob } from './pages/AddJob';
import { ApplicationPage } from './pages/ApplicationPage';
import { Applications } from './pages/Applications';
import { Compare } from './pages/Compare';
import { Home } from './pages/Home';
import { JobPage } from './pages/JobPage';
import { NotFound } from './pages/NotFound';
import { Opportunities } from './pages/Opportunities';
import { Prep } from './pages/Prep';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Sources } from './pages/Sources';
import { Link, navigate, usePath } from './router';

type Connection = 'checking' | 'connected' | 'unauthenticated' | 'unavailable';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/applications', label: 'Applications' },
  { href: '/profile', label: 'Profile' },
  { href: '/settings', label: 'Settings' },
] as const;

function isCurrent(href: string, path: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`) || (href === '/opportunities' && path.startsWith('/jobs/'));
}

const RETRY_MS = 3000;

export function App() {
  const [connection, setConnection] = useState<Connection>('checking');
  // Bumped after reconnecting so pages refetch rather than show data from before the outage.
  const [generation, setGeneration] = useState(0);
  const path = usePath();

  const checkSession = useCallback(async () => {
    try {
      const session = await api<{ kind: string; csrf?: string }>('/api/session');
      setCsrfToken(session.csrf ?? null);
      setConnection((prev) => {
        if (prev === 'unavailable') setGeneration((g) => g + 1);
        return 'connected';
      });
    } catch (err) {
      setConnection(err instanceof ApiError && err.status === 401 ? 'unauthenticated' : 'unavailable');
    }
  }, []);

  useEffect(() => {
    void checkSession();
    return onConnectionProblem((problem) => setConnection(problem));
  }, [checkSession]);

  useEffect(() => {
    if (connection !== 'unavailable') return;
    const timer = window.setInterval(() => void checkSession(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [connection, checkSession]);

  if (connection === 'checking') return <div className="boot" aria-busy="true" />;
  if (connection === 'unauthenticated') return <SessionRequired />;

  const logout = async (): Promise<void> => {
    await api('/api/session/logout', { method: 'POST' }).catch(() => undefined);
    setCsrfToken(null);
    setConnection('unauthenticated');
  };

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <Link href="/" className="wordmark">
          Career <span>Strike</span>
        </Link>
        <nav aria-label="Primary">
          <ul>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} aria-current={isCurrent(item.href, path) ? 'page' : undefined}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <button type="button" className="quiet" onClick={() => void logout()}>
          Sign out
        </button>
      </header>
      {connection === 'unavailable' && (
        <div className="banner banner--attention" role="status">
          <strong>The Career Strike service is not responding.</strong> Your data is safe on this device. Retrying every{' '}
          {RETRY_MS / 1000} seconds — or run <code>career-strike start</code>.
        </div>
      )}
      <main id="main" tabIndex={-1} key={generation}>
        {renderPage(path)}
      </main>
    </div>
  );
}

function renderPage(path: string) {
  if (path === '/') return <Home />;
  if (path === '/settings') return <Settings />;
  if (path === '/profile') return <Profile />;
  if (path === '/opportunities') return <Opportunities />;
  if (path === '/opportunities/sources') return <Sources />;
  if (path === '/opportunities/new') return <AddJob />;
  if (path === '/opportunities/compare') return <Compare />;
  if (path === '/applications') return <Applications />;
  const prep = /^\/applications\/([A-Za-z0-9_-]+)\/prep$/.exec(path);
  if (prep) return <Prep key={prep[1]} applicationId={prep[1]!} />;
  const application = /^\/applications\/([A-Za-z0-9_-]+)$/.exec(path);
  if (application) return <ApplicationPage key={application[1]} id={application[1]!} />;
  const job = /^\/jobs\/([A-Za-z0-9_-]+)$/.exec(path);
  if (job) return <JobPage key={job[1]} id={job[1]!} />;
  return <NotFound onHome={() => navigate('/')} />;
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
