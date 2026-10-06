import { useContext, type HTMLAttributes, type ReactNode } from 'react';
import { WorkContext } from './work-context';
import s from './slip.module.css';

/** Raised paper for something loose: the code a shop shows, the terms a customer signs. */
export function Slip({ title, children, ...rest }: Omit<HTMLAttributes<HTMLElement>, 'title'> & { title?: ReactNode }) {
  // On a screen whose whole job is this slip, its title is the page heading.
  const Heading = useContext(WorkContext) ? 'h1' : 'h2';
  return (
    <div className={s.wrap}>
      <section {...rest} className={s.slip}>
        {title && <Heading className={s.title}>{title}</Heading>}
        {children}
      </section>
    </div>
  );
}
