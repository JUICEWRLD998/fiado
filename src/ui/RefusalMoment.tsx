'use client';

import * as m from 'motion/react-m';
import { useState, type ReactNode } from 'react';
import g from './gauge.module.css';
import { Gauge } from './Gauge';
import s from './moment.module.css';
import { beat, ease } from './motion';

export type RefusalMomentProps = {
  owed: number;
  limit: number;
  attempt: number;
  /** The gauge's accessible description. */
  label: string;
  /** The facts under the gauge, in words. */
  figures: string;
  /** The verdict, as text. It is the end state of the moment and is announced politely. */
  sentence: string;
  /** Extra inline content after the sentence, such as a link to the refused transaction. */
  children?: ReactNode;
  /** Show the end state with no motion at all (used for static renders and tests). */
  still?: boolean;
};

/**
 * "The line stops at the margin." A purchase over the limit is refused by the network: the attempted segment grows
 * to the red limit and stops, the part beyond is drawn dashed, the limit pulses once, a rubber stamp lands, and the
 * verdict appears as text. A click or tap anywhere on it jumps straight to the end. Reduced motion lands on the same
 * end state through a cross-fade (MotionProvider).
 */
export function RefusalMoment({ owed, limit, attempt, label, figures, sentence, children, still = false }: RefusalMomentProps) {
  const [skipped, setSkipped] = useState(false);
  const instant = still || skipped;
  const tween = (b: { delay: number; duration: number }) => (instant ? { duration: 0 } : { delay: b.delay, duration: b.duration, ease: ease.out });
  const room = Math.max(0, limit - owed);
  const over = Math.max(0, attempt - room);

  return (
    <section className={s.moment} data-testid="refusal-moment" onPointerDown={() => setSkipped(true)}>
      <div key={instant ? 'end' : 'play'} className={s.moment}>
        <div className={s.stampRow}>
          <m.span
            className={s.stamp}
            aria-hidden="true"
            initial={instant ? false : { opacity: 0, scale: 1.12, rotate: -4 }}
            animate={{ opacity: 1, scale: 1, rotate: -2 }}
            transition={tween(beat.stamp)}
          >
            Refused
          </m.span>
        </div>

        <Gauge
          owed={owed}
          limit={limit}
          attempt={attempt}
          label={label}
          limitNode={
            <m.span
              className={g.limit}
              initial={false}
              animate={{ opacity: instant ? 1 : [1, 0.35, 1] }}
              transition={instant ? { duration: 0 } : { delay: beat.pulse.delay, duration: beat.pulse.duration, ease: 'linear' }}
            />
          }
        >
          <m.span
            className={g.try}
            initial={instant ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={tween(beat.attempt)}
          />
          {over > 0 && (
            <m.span
              className={g.ghost}
              initial={instant ? false : { opacity: 0 }}
              animate={{ opacity: 0.55 }}
              transition={tween(beat.ghost)}
            />
          )}
        </Gauge>

        <p className={s.figures}>{figures}</p>

        <m.p
          className={s.sentence}
          role="status"
          aria-live="polite"
          initial={instant ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={tween(beat.sentence)}
        >
          {sentence}
          {children}
        </m.p>
      </div>
    </section>
  );
}
