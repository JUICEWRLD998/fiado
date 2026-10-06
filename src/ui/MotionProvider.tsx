'use client';

import { LazyMotion, MotionConfig, domMax } from 'motion/react';

/**
 * One place that decides how motion behaves everywhere.
 * - `domMax` is needed for layout animations (rows entering and leaving the book).
 * - `strict` makes any stray full `motion.*` component fail loudly, so the bundle stays small.
 * - `reducedMotion="user"` turns transform and layout animations off for people who ask, keeping opacity and
 *   colour, so the reduced version is a cross-fade that still ends in the same state.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
