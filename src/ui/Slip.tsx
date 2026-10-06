import type { HTMLAttributes, ReactNode } from 'react';
import s from './slip.module.css';

/** Raised paper for something loose: the code a shop shows, the terms a customer signs. */
export function Slip({ title, children, ...rest }: Omit<HTMLAttributes<HTMLElement>, 'title'> & { title?: ReactNode }) {
  return (
    <div className={s.wrap}>
      <section {...rest} className={s.slip}>
        {title && <h2 className={s.title}>{title}</h2>}
        {children}
      </section>
    </div>
  );
}
