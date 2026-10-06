import { useId } from 'react';

/*
 * R2 art: hand-built SVG from the subject's own world, drawn with tokens so it follows the theme.
 * Graded the way flat vector art needs to be to stop reading as a diagram: one 0.5px blur on the wrapper layer,
 * a warm key light from the upper left over a cool fill, a soft contact shadow, and no drawn faces.
 */

/** A hardback ledger open at a ruled page, a red margin, a few lines of entries, a biro. */
export function LedgerCorner({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 360 220" role="img" aria-label="An open counter book with a red margin and a pen">
      <defs>
        <filter id={`${id}-soft`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="0.5" />
        </filter>
        <filter id={`${id}-shadow`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
        <linearGradient id={`${id}-light`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--highlight)', stopOpacity: 0.42 }} />
          <stop offset="0.45" style={{ stopColor: 'var(--highlight)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0.16 }} />
        </linearGradient>
      </defs>

      <ellipse cx="190" cy="198" rx="150" ry="11" style={{ fill: 'var(--ink)', opacity: 0.18 }} filter={`url(#${id}-shadow)`} />

      <g filter={`url(#${id}-soft)`}>
        {/* the hardback cover, peeking out below and to the right */}
        <rect x="46" y="28" width="280" height="160" rx="10" style={{ fill: 'var(--accent)' }} />
        {/* the page block */}
        <rect x="36" y="16" width="282" height="162" rx="8" style={{ fill: 'var(--raised)' }} />
        {/* the page edges, stacked */}
        <path d="M318 24v150" style={{ stroke: 'var(--rule-strong)', strokeWidth: 1.2, opacity: 0.7 }} />
        <path d="M322 28v146" style={{ stroke: 'var(--rule-strong)', strokeWidth: 1.2, opacity: 0.45 }} />

        {/* ruled lines */}
        {[48, 70, 92, 114, 136, 158].map((y) => (
          <path key={y} d={`M52 ${y}H304`} style={{ stroke: 'var(--rule)', strokeWidth: 1.4 }} />
        ))}
        {/* the margin */}
        <path d="M86 16v162" style={{ stroke: 'var(--margin)', strokeWidth: 1.8 }} />

        {/* entries: marks standing for handwriting, a name on the left and a figure on the right */}
        <g style={{ stroke: 'var(--ink)', strokeWidth: 3, strokeLinecap: 'round', fill: 'none' }}>
          <path d="M98 44h58M244 44h40" />
          <path d="M98 66h74M254 66h30" />
          <path d="M98 88h48M236 88h48" />
        </g>
        <g style={{ stroke: 'var(--accent)', strokeWidth: 2.4, strokeLinecap: 'round' }}>
          <path d="M98 110h92" opacity="0.55" />
        </g>
        {/* a tick in the margin for a settled line */}
        <path d="M66 86l6 7 11-14" style={{ stroke: 'var(--tally)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }} />

        {/* the biro, resting across the page */}
        <g transform="rotate(-17 214 150)">
          <rect x="206" y="152" width="132" height="8" rx="4" style={{ fill: 'var(--ink)', opacity: 0.22 }} transform="translate(2 6)" />
          <rect x="206" y="146" width="132" height="8" rx="4" style={{ fill: 'var(--accent)' }} />
          <rect x="306" y="146" width="32" height="8" rx="4" style={{ fill: 'var(--margin)' }} />
          <path d="M206 146l-16 4 16 4z" style={{ fill: 'var(--ink)' }} />
        </g>
      </g>

      {/* the light: warm from the upper left, cooler fill from the lower right */}
      <rect x="36" y="16" width="290" height="172" rx="10" fill={`url(#${id}-light)`} style={{ mixBlendMode: 'multiply' }} />
    </svg>
  );
}

/** Four strokes and a slash on a ruled line: the oldest way of counting. For the moment before there is anything to count. */
export function TallyEmpty({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 220 64" role="img" aria-label="Tally marks on a ruled line">
      <defs>
        <filter id={`${id}-soft`} x="-5%" y="-10%" width="110%" height="120%">
          <feGaussianBlur stdDeviation="0.4" />
        </filter>
      </defs>
      <g filter={`url(#${id}-soft)`}>
        <path d="M6 54H214" style={{ stroke: 'var(--rule-strong)', strokeWidth: 1.5 }} />
        <path d="M24 8v46" style={{ stroke: 'var(--margin)', strokeWidth: 2 }} />
        <g style={{ stroke: 'var(--ink)', strokeWidth: 3.2, strokeLinecap: 'round' }}>
          <path d="M52 16v32M66 16v32M80 16v32M94 16v32" />
          <path d="M44 42L104 22" />
          <path d="M126 16v32M140 16v32" opacity="0.55" />
        </g>
      </g>
    </svg>
  );
}
