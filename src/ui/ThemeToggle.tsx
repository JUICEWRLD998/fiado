'use client';

import { useSyncExternalStore } from 'react';
import s from './shell.module.css';

export const THEME_KEY = 'fiado-theme';
const CHANGED = 'fiado-theme-changed';
type Theme = 'light' | 'dark';

/** Re-render when the choice is switched here, or when the device's own setting changes. */
function subscribe(onChange: () => void) {
  const device = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener(CHANGED, onChange);
  device.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    device.removeEventListener('change', onChange);
  };
}

/** The theme the page is showing now: the saved choice if there is one, otherwise the device's setting. */
function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Switches the whole app between light and dark and remembers the choice on this device. */
export function ThemeToggle() {
  // null on the server and during hydration, so the first paint matches the server's HTML
  const theme = useSyncExternalStore<Theme | null>(subscribe, current, () => null);

  function toggle() {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // storage blocked: the choice still applies until the page is closed
    }
    window.dispatchEvent(new Event(CHANGED));
  }

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={s.theme}
      data-testid="theme-toggle"
      aria-label={theme === null ? 'Switch colour theme' : dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
