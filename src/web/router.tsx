import { useRouter, useRouterState } from '@tanstack/react-router';
import { type AnchorHTMLAttributes, type MouseEvent, type ReactNode, useCallback, useEffect } from 'react';

// Navigation helpers over TanStack Router (the route tree lives in routes.tsx). Pages link by
// plain same-origin href because some targets come from the API (next actions). Filters live in
// the query string so views are linkable and survive reloads.

export function usePath(): string {
  return useRouterState({ select: (s) => s.location.pathname });
}

/** The raw query string ("?a=1&b=2" or ""), for reading with URLSearchParams. */
export function useSearch(): string {
  return useRouterState({ select: (s) => s.location.searchStr });
}

export type NavigateTo = (to: string, opts?: { replace?: boolean }) => void;

/** Client-side navigation to a same-origin href. Other origins are ignored. */
export function useNavigateTo(): NavigateTo {
  const router = useRouter();
  return useCallback(
    (to, opts = {}) => {
      const url = new URL(to, window.location.origin);
      if (url.origin !== window.location.origin) return;
      // Replacing the URL (e.g. a filter change) keeps the reader's scroll position.
      void router.navigate({
        href: url.pathname + url.search + url.hash,
        replace: opts.replace,
        resetScroll: !opts.replace,
      });
    },
    [router],
  );
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
  const navigate = useNavigateTo();
  const handle = (e: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}

/** Link to an employer site. Only http(s) URLs render as links; they open without referrer or opener. */
export function ExternalLink({
  href,
  children,
  className,
  style,
}: {
  href: string | null;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  let safe: string | null = null;
  try {
    const url = href ? new URL(href) : null;
    if (url && (url.protocol === 'https:' || url.protocol === 'http:')) safe = url.href;
  } catch {
    safe = null;
  }
  if (!safe)
    return (
      <span className={className} style={style}>
        {children}
      </span>
    );
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer external" className={className} style={style}>
      {children}
      <span className="sr-only"> (opens the employer’s site in a new tab)</span>
    </a>
  );
}
