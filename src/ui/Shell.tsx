'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import s from './shell.module.css';
import { Wordmark } from './Wordmark';

const LINKS = [
  { href: '/shop', label: 'My shop' },
  { href: '/c', label: 'My tabs' },
] as const;

/** The desk: skip link, a bar with the wordmark and the two places to go, the page, and an optional colophon. */
export function Shell({ children, footer, tag = 'Testnet' }: { children: ReactNode; footer?: ReactNode; tag?: string | null }) {
  const path = usePathname();
  return (
    <div className={s.desk}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <header className={s.bar}>
        <Wordmark />
        <nav className={s.nav} aria-label="Fiado">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={s.link} aria-current={path === l.href || path.startsWith(`${l.href}/`) ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
          {tag && (
            <span className={s.tag} title="This runs on the Stellar test network. No real money is involved.">
              {tag}
            </span>
          )}
        </nav>
      </header>
      <main id="main" className={s.main}>
        {children}
      </main>
      {footer && <footer className={s.foot}>{footer}</footer>}
    </div>
  );
}
