import { describe, expect, it } from 'vitest';
import type { SessionView } from '../handoff/session';
import { createSession, HandoffError, readSession, sessionLink, waitFor, writeSlot } from './handoff';

const OFFER = { kind: 'join', shop: 'G'.padEnd(56, 'A'), shopName: 'Mama Bisi', currency: '₦', limit: '10000' } as const;
const view = (over: Partial<SessionView> = {}): SessionView => ({ offer: OFFER, hello: null, request: null, response: null, ...over });

type Reply = { status?: number; json?: unknown } | Error;
/** A scripted fetch: each call consumes the next reply and records what was asked. */
function script(replies: Reply[]) {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const r = replies.shift() ?? { status: 200, json: view() };
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}
const noSleep = async () => {};

describe('client calls', () => {
  it('creates a session by POSTing the offer', async () => {
    const f = script([{ status: 201, json: { id: 'abc', store: 'memory', ttl: 600 } }]);
    expect(await createSession(OFFER, f.impl)).toEqual({ id: 'abc', store: 'memory', ttl: 600 });
    expect(f.calls[0]).toEqual({ url: '/api/handoff', method: 'POST', body: OFFER });
  });

  it('reads a session, and treats 404 as "expired" rather than an error', async () => {
    expect(await readSession('x', script([{ json: view() }]).impl)).toEqual(view());
    expect(await readSession('x', script([{ status: 404, json: { error: 'gone' } }]).impl)).toBeNull();
  });

  it('writes a slot with PUT, and turns a server refusal into a HandoffError carrying its message', async () => {
    const ok = script([{ status: 201, json: { ok: true } }]);
    await writeSlot('id1', 'hello', { pub: 'G', name: 'x' }, ok.impl);
    expect(ok.calls[0]).toMatchObject({ url: '/api/handoff/id1/hello', method: 'PUT' });
    const bad = script([{ status: 409, json: { error: 'hello was already written' } }]);
    const err = await writeSlot('id1', 'hello', {}, bad.impl).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HandoffError);
    expect((err as HandoffError).status).toBe(409);
    expect((err as HandoffError).message).toBe('hello was already written');
  });

  it('builds the link a phone opens', () => {
    expect(sessionLink('https://fiado.app', 'join', 'abc')).toBe('https://fiado.app/c/join?s=abc');
    expect(sessionLink('https://fiado.app', 'buy', 'abc')).toBe('https://fiado.app/c/pay?s=abc');
  });
});

describe('waitFor', () => {
  it('returns the value as soon as the slot appears, polling until then', async () => {
    const f = script([{ json: view() }, { json: view() }, { json: view({ hello: { pub: 'G', name: 'Bisi' } }) }]);
    const r = await waitFor('id', (s) => s.hello, { fetchImpl: f.impl, sleep: noSleep });
    expect(r).toEqual({ status: 'ok', value: { pub: 'G', name: 'Bisi' } });
    expect(f.calls).toHaveLength(3);
  });

  it('reports "expired" when the session is gone, and stops polling', async () => {
    const f = script([{ json: view() }, { status: 404, json: {} }]);
    expect(await waitFor('id', (s) => s.hello, { fetchImpl: f.impl, sleep: noSleep })).toEqual({ status: 'expired' });
    expect(f.calls).toHaveLength(2);
  });

  it('survives a network blip and keeps going', async () => {
    const f = script([new Error('offline'), { json: view({ hello: { pub: 'G', name: 'Bisi' } }) }]);
    expect((await waitFor('id', (s) => s.hello, { fetchImpl: f.impl, sleep: noSleep })).status).toBe('ok');
  });

  it('gives up at the deadline with "timeout"', async () => {
    const f = script([]);
    expect(await waitFor('id', (s) => s.hello, { fetchImpl: f.impl, sleep: noSleep, timeoutMs: 0 })).toEqual({ status: 'timeout' });
  });

  it('stops at once when aborted, without another request', async () => {
    const c = new AbortController();
    c.abort();
    const f = script([]);
    expect(await waitFor('id', (s) => s.hello, { fetchImpl: f.impl, sleep: noSleep, signal: c.signal })).toEqual({ status: 'aborted' });
    expect(f.calls).toHaveLength(0);
  });
});
