// The HTTP face of the mailbox, written against the standard Request/Response so it can be tested
// without Next.js. The route files under app/api/handoff are one-line wrappers around this.

import { createLimiter, type Limiter } from './ratelimit';
import { createSession, getSession, isSlot, putSlot, MAX_SLOT_BYTES, TTL_SECONDS, type PutStatus } from './session';
import { getStore, type Store } from './store';

const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

const STATUS: Record<PutStatus, number> = { ok: 201, exists: 409, out_of_order: 409, no_session: 404, invalid: 400, too_big: 413 };

const clientKey = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

export type Limits = { create: Limiter; write: Limiter; read: Limiter };

export const defaultLimits = (): Limits => ({
  create: createLimiter(20, 60_000),
  write: createLimiter(60, 60_000),
  read: createLimiter(900, 60_000), // two phones polling every 1.5s is about 80 a minute
});

async function readJson(req: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  const text = await req.text();
  if (text.length > MAX_SLOT_BYTES * 2) return { ok: false, res: reply(413, { error: 'request body is too large' }) };
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, res: reply(400, { error: 'body is not valid JSON' }) };
  }
}

export function createHandlers(store: Store, limits: Limits = defaultLimits()) {
  return {
    /** POST /api/handoff  body: the offer  ->  201 { id, store, ttl } */
    async create(req: Request): Promise<Response> {
      if (!limits.create(clientKey(req))) return reply(429, { error: 'too many sessions, slow down' });
      const parsed = await readJson(req);
      if (!parsed.ok) return parsed.res;
      const made = await createSession(store, parsed.body);
      if (!made.ok) return reply(400, { error: made.error });
      return reply(201, { id: made.id, store: store.kind, ttl: TTL_SECONDS });
    },

    /** GET /api/handoff/:id  ->  200 { offer, hello, request, response } */
    async read(req: Request, id: string): Promise<Response> {
      if (!limits.read(clientKey(req))) return reply(429, { error: 'too many requests, slow down' });
      const session = await getSession(store, id);
      return session ? reply(200, session) : reply(404, { error: 'unknown or expired session' });
    },

    /** PUT /api/handoff/:id/:slot  body: the slot payload  ->  201 { ok: true } */
    async write(req: Request, id: string, slot: string): Promise<Response> {
      if (!limits.write(clientKey(req))) return reply(429, { error: 'too many requests, slow down' });
      if (!isSlot(slot)) return reply(404, { error: 'unknown slot' });
      const parsed = await readJson(req);
      if (!parsed.ok) return parsed.res;
      const result = await putSlot(store, id, slot, parsed.body);
      return reply(STATUS[result.status], result.status === 'ok' ? { ok: true } : { error: result.error });
    },
  };
}

type WithHandlers = typeof globalThis & { __fiadoHandlers?: ReturnType<typeof createHandlers> };

/** The process-wide handlers, so rate-limit counters survive between requests. */
export function handlers() {
  const g = globalThis as WithHandlers;
  g.__fiadoHandlers ??= createHandlers(getStore());
  return g.__fiadoHandlers;
}
