import { Outlet } from '@tanstack/react-router';
import { UpdateBanner } from './components/Updates';
import { RETRY_MS, useConnection } from './connection';
import { Link, usePath } from './router';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/applications', label: 'Applications' },
  { href: '/profile', label: 'Profile' },
  { href: '/insights', label: 'Insights' },
  { href: '/activity', label: 'Activity' },
  { href: '/settings', label: 'Settings' },
] as const;

function isCurrent(href: string, path: string): boolean {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`) || (href === '/opportunities' && path.startsWith('/jobs/'));
}

/** Masthead, navigation and footer around every dashboard page. */
export function Shell() {
  const { connection, generation, logout } = useConnection();
  const path = usePath();
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
        <UpdateBanner />
        <Outlet />
      </main>
      <footer className="site-foot">
        <p className="eyebrow">Career Strike</p>
        <p className="muted">Local-first and private by design — your data never leaves this computer.</p>
      </footer>
    </div>
  );
}
