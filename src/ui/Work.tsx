import type { ReactNode } from 'react';
import b from './book.module.css';
import { LedgerCorner } from './Illustrations';
import s from './screens.module.css';
import { WorkContext } from './work-context';

/**
 * Something to do (a slip), left-aligned like the book, with context beside it on a wide screen and below it on a
 * phone. Replaces a centred slip floating in an empty page.
 */
export function Work({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <WorkContext.Provider value>
      <div className={b.layout} data-aside={aside ? '' : undefined}>
        <div style={{ maxWidth: '34rem', minWidth: 0 }}>{children}</div>
        {aside && <aside className={b.aside}>{aside}</aside>}
      </div>
    </WorkContext.Provider>
  );
}

/** A short card of plain statements, with the ledger corner under it. */
export function AsideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={s.asideCard}>
      <h2>{title}</h2>
      <div className={s.stack}>{children}</div>
      <LedgerCorner className={s.art} />
    </div>
  );
}
