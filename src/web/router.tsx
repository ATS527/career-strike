import { type AnchorHTMLAttributes, type MouseEvent, type ReactNode, useEffect, useSyncExternalStore } from 'react';

// Minimal history router: the dashboard has a handful of top-level pages. Filters live in the
// query string so views are linkable and survive reloads.

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener('popstate', notify);
  return () => window.removeEventListener('popstate', notify);
};

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function useSearch(): string {
  return useSyncExternalStore(subscribe, () => window.location.search);
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const url = new URL(to, window.location.origin);
  if (url.origin !== window.location.origin) return;
  const target = url.pathname + url.search + url.hash;
  if (opts.replace) window.history.replaceState(null, '', target);
  else window.history.pushState(null, '', target);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** Scroll to and focus the element named by the URL hash once it exists. */
export function useHashFocus(ready: boolean): void {
  useEffect(() => {
    if (!ready || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    const focusable = el.querySelector<HTMLElement>('input, textarea, select, button');
    focusable?.focus({ preventScroll: true });
  }, [ready]);
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}

/** Link to an employer site. Only http(s) URLs render as links; they open without referrer or opener. */
export function ExternalLink({ href, children, className }: { href: string | null; children: ReactNode; className?: string }) {
  let safe: string | null = null;
  try {
    const url = href ? new URL(href) : null;
    if (url && (url.protocol === 'https:' || url.protocol === 'http:')) safe = url.href;
  } catch {
    safe = null;
  }
  if (!safe) return <span className={className}>{children}</span>;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer external" className={className}>
      {children}
      <span className="visually-hidden"> (opens the employer’s site in a new tab)</span>
    </a>
  );
}
