// The browser side of the mailbox: create a session, read it, write a slot, and wait for the other phone.

import type { Offer, SessionView, Slot } from '../handoff/session';

export class HandoffError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

async function call(f: Fetch, method: string, path: string, body?: unknown): Promise<Response> {
  return f(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function failure(res: Response): Promise<HandoffError> {
  let message = `the server answered ${res.status}`;
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) message = j.error;
  } catch {
    // keep the status message
  }
  return new HandoffError(res.status, message);
}

export async function createSession(offer: Offer, f: Fetch = (...a) => fetch(...a)): Promise<{ id: string; store: string; ttl: number }> {
  const res = await call(f, 'POST', '/api/handoff', offer);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as { id: string; store: string; ttl: number };
}

/** The session, or null once it has expired or never existed. */
export async function readSession(id: string, f: Fetch = (...a) => fetch(...a)): Promise<SessionView | null> {
  const res = await call(f, 'GET', `/api/handoff/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw await failure(res);
  return (await res.json()) as SessionView;
}

export async function writeSlot(id: string, slot: Exclude<Slot, 'offer'>, body: unknown, f: Fetch = (...a) => fetch(...a)): Promise<void> {
  const res = await call(f, 'PUT', `/api/handoff/${encodeURIComponent(id)}/${slot}`, body);
  if (!res.ok) throw await failure(res);
}

/** The link a phone opens, for either kind of session. */
export const sessionLink = (origin: string, kind: Offer['kind'], id: string) => `${origin}/c/${kind === 'join' ? 'join' : 'pay'}?s=${id}`;

export type Waited<T> = { status: 'ok'; value: T } | { status: 'expired' } | { status: 'timeout' } | { status: 'aborted' };

export type WaitOptions = {
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: Fetch;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Polls a session until `pick` returns a value. A network blip is not an ending: we keep trying until the
 * deadline. A 404 means the session expired, which is final.
 */
export async function waitFor<T>(id: string, pick: (s: SessionView) => T | null | undefined, o: WaitOptions = {}): Promise<Waited<T>> {
  const interval = o.intervalMs ?? 1500;
  const deadline = Date.now() + (o.timeoutMs ?? 9 * 60_000);
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (;;) {
    if (o.signal?.aborted) return { status: 'aborted' };
    try {
      const s = await readSession(id, o.fetchImpl);
      if (s === null) return { status: 'expired' };
      const v = pick(s);
      if (v !== null && v !== undefined) return { status: 'ok', value: v };
    } catch {
      // transient: retry until the deadline
    }
    if (Date.now() >= deadline) return { status: 'timeout' };
    await sleep(interval);
  }
}
