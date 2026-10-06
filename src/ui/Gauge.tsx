import type { CSSProperties, ReactNode } from 'react';
import s from './gauge.module.css';

export type GaugeProps = {
  owed: number;
  limit: number;
  /** A purchase being considered. Drawn as a hatched segment that stops at the limit, with the excess dashed. */
  attempt?: number;
  /** The accessible description: a chart that is a picture needs the same words a sighted person reads. */
  label: string;
  /** Replaces the static overlays so a caller can animate them (see RefusalMoment). */
  children?: ReactNode;
  /** Replaces the limit tick, for the pulse in the signature moment. */
  limitNode?: ReactNode;
};

/** Ratios here only draw a picture. Money arithmetic is done in exact stroops elsewhere. */
export function Gauge({ owed, limit, attempt, label, children, limitNode }: GaugeProps) {
  const lim = limit > 0 ? limit : 1;
  const room = Math.max(0, lim - owed);
  const reach = attempt === undefined ? 0 : Math.min(attempt, room);
  const over = attempt === undefined ? 0 : Math.max(0, attempt - room);
  // the dashed excess is capped to the 20% of track that lies beyond the limit, so it never leaves the picture
  const vars = { '--o': Math.min(1, owed / lim), '--r': reach / lim, '--v': Math.min(over / lim, 0.25) } as CSSProperties;

  return (
    <div className={s.gauge} style={vars} role="img" aria-label={label}>
      <span className={s.fill} />
      {children ??
        (attempt !== undefined && (
          <>
            <span className={s.try} />
            {over > 0 && <span className={s.ghost} />}
          </>
        ))}
      {limitNode ?? <span className={s.limit} />}
    </div>
  );
}
