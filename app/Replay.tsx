'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/Button';
import { RefusalMoment } from '@/ui/RefusalMoment';
import s from './page.module.css';

export type ReplayProps = {
  owed: number;
  limit: number;
  attempt: number;
  currency: string;
  /** A real refused transaction on the Stellar test network. */
  txUrl: string;
};

const money = (n: number, cur: string) => `${cur}${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/**
 * Plays the refusal with the numbers of a real transaction. It starts when it scrolls into view (so a visitor sees the
 * moment, not the end of it), and the Replay button runs it again.
 */
export default function Replay({ owed, limit, attempt, currency, txUrl }: ReplayProps) {
  const box = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const over = Math.max(0, attempt - Math.max(0, limit - owed));
  return (
    <div ref={box} className={s.replay} data-testid="replay">
      {seen ? (
        <RefusalMoment
          key={run}
          owed={owed}
          limit={limit}
          attempt={attempt}
          label={`${money(owed, currency)} owed of a ${money(limit, currency)} limit. A purchase of ${money(attempt, currency)} was refused.`}
          figures={`Owed ${money(owed, currency)} · limit ${money(limit, currency)} · tried ${money(attempt, currency)}, ${money(over, currency)} over`}
          sentence="Over the credit limit. The network refused this purchase, so nothing was added to the tab."
        >
          {' '}
          <a href={txUrl} target="_blank" rel="noreferrer">
            Look it up on the ledger
          </a>
        </RefusalMoment>
      ) : (
        <div className={s.replayHold} aria-hidden="true" />
      )}
      <div className={s.replayActions}>
        <Button variant="quiet" onClick={() => setRun((n) => n + 1)} disabled={!seen}>
          Replay
        </Button>
      </div>
    </div>
  );
}
