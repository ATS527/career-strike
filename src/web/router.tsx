import { type AnchorHTMLAttributes, type MouseEvent, useEffect, useSyncExternalStore } from 'react';

// Minimal history router: the dashboard has a handful of top-level pages.

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener('popstate', notify);
  return () => window.removeEventListener('popstate', notify);
};

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(to: string): void {
  const url = new URL(to, window.location.origin);
  if (url.origin !== window.location.origin) return;
  window.history.pushState(null, '', url.pathname + url.hash);
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
