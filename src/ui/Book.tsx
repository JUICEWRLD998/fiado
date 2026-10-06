'use client';

import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import type { ReactNode } from 'react';
import s from './book.module.css';
import { dur, ease } from './motion';

/**
 * The page. `aside` is context for wide screens only (it is never the only home of anything a person must do),
 * so on a phone the page is one column with the margin on its left edge.
 */
export function Book({
  title,
  titleTestId,
  meta,
  action,
  aside,
  children,
}: {
  title: ReactNode;
  titleTestId?: string;
  meta?: ReactNode;
  action?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={s.layout} data-aside={aside ? '' : undefined}>
      <article className={s.page}>
        <header className={s.head}>
          <h1 className={s.title} data-testid={titleTestId}>
            {title}
          </h1>
          {meta && <div className={s.meta}>{meta}</div>}
          {action && <div className={s.action}>{action}</div>}
        </header>
        {children}
      </article>
      {aside && <aside className={s.aside}>{aside}</aside>}
    </div>
  );
}

/** The ruled list. Rows that arrive or leave animate their place; the first render does not animate. */
export function BookRows({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <ul className={s.rows} data-testid={testId}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </ul>
  );
}

export type RowMark = 'late' | 'clear';

export function BookRow({ mark, testId, children }: { mark?: RowMark; testId?: string; children: ReactNode }) {
  return (
    <m.li
      layout="position"
      className={s.row}
      data-mark={mark}
      data-testid={testId}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: dur.short, ease: ease.out }}
    >
      {children}
    </m.li>
  );
}
