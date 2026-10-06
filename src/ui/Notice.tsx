import type { HTMLAttributes } from 'react';
import s from './notice.module.css';

export type NoticeTone = 'note' | 'ok' | 'problem' | 'pending';

/** What just happened, in words. Problems are announced assertively; everything else politely. */
export function Notice({ tone = 'note', role, children, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: NoticeTone }) {
  return (
    <div {...rest} role={role ?? (tone === 'problem' ? 'alert' : 'status')} data-tone={tone} className={s.notice}>
      <span className={s.mark} aria-hidden="true" />
      <div className={s.body}>{children}</div>
    </div>
  );
}
