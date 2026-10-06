// A fixed-window limiter. Best effort: on a serverless host each instance counts for itself, so this
// slows a flood rather than stopping one. Nothing here protects a secret; the mailbox holds none.

export type Limiter = (key: string) => boolean;

/** Returns a function that answers "may this key proceed?" and counts the attempt. */
export function createLimiter(limit: number, windowMs: number, now: () => number = Date.now): Limiter {
  const hits = new Map<string, { count: number; reset: number }>();
  return (key) => {
    const t = now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
    const entry = hits.get(key);
    if (!entry || entry.reset <= t) {
      hits.set(key, { count: 1, reset: t + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}
