import { Outlet } from '@tanstack/react-router';
import { UpdateBanner } from './components/Updates';
import { Button } from './components/ui/button';
import { RETRY_MS, useConnection } from './connection';
import { Link, usePath } from './router';

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/markets', label: 'Markets' },
  { href: '/resume', label: 'Resume Studio' },
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
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 lg:px-8 pb-16 min-h-screen flex flex-col">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-foreground focus:text-background focus:rounded-md focus:shadow-lg focus:outline-none"
        href="#main"
      >
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-4 flex-wrap px-5 py-3.5 mt-5 bg-card/85 border border-border border-b-2 border-b-foreground rounded-xl shadow-xs backdrop-blur-md">
        <Link href="/" className="text-2xl font-bold font-serif text-foreground tracking-tight no-underline">
          Career <span className="text-primary italic font-medium">Strike</span>
        </Link>
        <nav aria-label="Primary" className="flex-1 overflow-x-auto">
          <ul className="flex items-center flex-wrap gap-1 m-0 p-0 list-none">
            {NAV.map((item) => {
              const active = isCurrent(item.href, path);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`inline-block px-3 py-1.5 rounded-md text-sm font-medium transition-colors no-underline ${
                      active
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void logout()}
          className="text-muted-foreground hover:text-foreground"
        >
          Sign out
        </Button>
      </header>

      {connection === 'unavailable' && (
        <div
          className="my-4 p-4 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 text-sm shadow-xs"
          role="status"
        >
          <strong>The Career Strike service is not responding.</strong> Your data is safe on this device. Retrying every{' '}
          {RETRY_MS / 1000} seconds — or run <code className="px-1 py-0.5 rounded bg-muted">career-strike start</code>.
        </div>
      )}

      <main id="main" tabIndex={-1} key={generation} className="flex-1 mt-6 outline-none">
        <UpdateBanner />
        <Outlet />
      </main>

      <footer className="mt-16 pt-6 border-t border-border text-center text-xs text-muted-foreground space-y-1">
        <p className="font-semibold uppercase tracking-wider text-[11px] text-muted-foreground">Career Strike</p>
        <p className="text-muted-foreground">
          Local-first and private by design — your data never leaves this computer.
        </p>
      </footer>
    </div>
  );
}

export default Shell;
