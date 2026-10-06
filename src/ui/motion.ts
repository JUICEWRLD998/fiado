// Mirrors the --dur-* and --ease-* tokens in tokens.css. Motion takes SECONDS; CSS takes milliseconds.
// Change both together. (A literal like `duration: 220` would be 220 seconds.)

export const dur = { micro: 0.12, short: 0.22, long: 0.42 } as const;

export const ease = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/**
 * The signature moment, "the line stops at the margin", as a beat sheet in seconds (design/PLAN.md):
 *   0.12  the attempted purchase starts to grow from the end of the owed ink
 *   0.52  it meets the red margin and stops; the part beyond is drawn as a dashed ghost
 *   0.64  the margin takes one short pulse
 *   0.76  the REFUSED stamp lands (the one allowed overshoot: a real rubber stamp settles by a pixel or two)
 *   0.90  the sentence appears; everything has settled by 1.1
 */
export const beat = {
  attempt: { delay: 0.12, duration: 0.4 },
  ghost: { delay: 0.52, duration: 0.2 },
  pulse: { delay: 0.64, duration: 0.26 },
  stamp: { delay: 0.76, duration: 0.16 },
  sentence: { delay: 0.9, duration: 0.2 },
} as const;
