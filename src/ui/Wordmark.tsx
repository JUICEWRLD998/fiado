import Link from 'next/link';
import s from './shell.module.css';

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className={s.wordmark} aria-label="Fiado, home">
      <span className={s.mark} aria-hidden="true" />
      Fiado
    </Link>
  );
}
