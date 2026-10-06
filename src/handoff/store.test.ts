import { afterEach, describe, expect, it } from 'vitest';
import { getStore, MemoryStore, setStoreForTests, UpstashStore } from './store';

describe('MemoryStore', () => {
  it('writes once, reads back, and refuses to overwrite', async () => {
    const s = new MemoryStore();
    expect(await s.setIfAbsent('k', 'one', 60)).toBe(true);
    expect(await s.setIfAbsent('k', 'two', 60)).toBe(false);
    expect(await s.get('k')).toBe('one');
    expect(await s.get('missing')).toBeNull();
  });

  it('expires a value after its ttl, and then lets the key be written again', async () => {
    let t = 1_000_000;
    const s = new MemoryStore(() => t);
    await s.setIfAbsent('k', 'one', 10);
    t += 9_999;
    expect(await s.get('k')).toBe('one');
    t += 2;
    expect(await s.get('k')).toBeNull();
    expect(await s.setIfAbsent('k', 'again', 10)).toBe(true);
    expect(await s.get('k')).toBe('again');
  });
});

describe('UpstashStore (fake fetch, so the request shape is checked exactly)', () => {
  type Call = { url: string; method?: string; auth?: string; body: unknown };
  function fake(respond: (body: unknown[]) => { status?: number; json: unknown }) {
    const calls: Call[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as unknown[];
      calls.push({ url, method: init.method, auth: (init.headers as Record<string, string>).Authorization, body });
      const r = respond(body);
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
    }) as unknown as typeof fetch;
    return { calls, impl };
  }

  it('sends SET key value EX ttl NX with a bearer token, and reads OK as written', async () => {
    const { calls, impl } = fake(() => ({ json: { result: 'OK' } }));
    const s = new UpstashStore('https://redis.example.test', 'tok', impl);
    expect(await s.setIfAbsent('fiado:h:abc:offer', '{"a":1}', 600)).toBe(true);
    expect(calls[0]).toEqual({
      url: 'https://redis.example.test',
      method: 'POST',
      auth: 'Bearer tok',
      body: ['SET', 'fiado:h:abc:offer', '{"a":1}', 'EX', 600, 'NX'],
    });
  });

  it('reads a null result from SET NX as "already existed"', async () => {
    const { impl } = fake(() => ({ json: { result: null } }));
    expect(await new UpstashStore('https://r.test', 't', impl).setIfAbsent('k', 'v', 5)).toBe(false);
  });

  it('GET returns the string, or null when the key is absent', async () => {
    const present = fake(() => ({ json: { result: 'hello' } }));
    expect(await new UpstashStore('https://r.test', 't', present.impl).get('k')).toBe('hello');
    expect(present.calls[0]?.body).toEqual(['GET', 'k']);
    const absent = fake(() => ({ json: { result: null } }));
    expect(await new UpstashStore('https://r.test', 't', absent.impl).get('k')).toBeNull();
  });

  it('throws on an HTTP error or an error body, never silently pretending the write worked', async () => {
    const http = fake(() => ({ status: 500, json: {} }));
    await expect(new UpstashStore('https://r.test', 't', http.impl).setIfAbsent('k', 'v', 5)).rejects.toThrow(/500/);
    const body = fake(() => ({ json: { error: 'WRONGPASS' } }));
    await expect(new UpstashStore('https://r.test', 't', body.impl).get('k')).rejects.toThrow(/WRONGPASS/);
  });
});

describe('getStore', () => {
  afterEach(() => setStoreForTests(undefined));

  it('uses memory when no Redis is configured', () => {
    setStoreForTests(undefined);
    expect(getStore({}).kind).toBe('memory');
  });

  it('uses Upstash when its variables are set, under either of the two names Vercel provides', () => {
    setStoreForTests(undefined);
    expect(getStore({ UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 't' }).kind).toBe('upstash');
    setStoreForTests(undefined);
    expect(getStore({ KV_REST_API_URL: 'https://a', KV_REST_API_TOKEN: 't' }).kind).toBe('upstash');
  });

  it('needs both the url and the token, and keeps one store per process', () => {
    setStoreForTests(undefined);
    expect(getStore({ UPSTASH_REDIS_REST_URL: 'https://a' }).kind).toBe('memory');
    expect(getStore({})).toBe(getStore({}));
  });
});
