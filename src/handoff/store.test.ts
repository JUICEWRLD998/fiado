import { afterEach, describe, expect, it } from 'vitest';
import { getStore, MemoryStore, NeonStore, type RunSql, setStoreForTests, UpstashStore } from './store';

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

describe('NeonStore (fake SQL runner, so the statements are checked exactly)', () => {
  function fake(respond: (text: string, params: unknown[]) => Record<string, unknown>[]) {
    const calls: { text: string; params: unknown[] }[] = [];
    const run: RunSql = async (text, params) => {
      calls.push({ text, params });
      return respond(text, params);
    };
    return { calls, run };
  }

  it('creates its table once, then writes with one atomic upsert that only replaces an expired row', async () => {
    const f = fake((text) => (text.startsWith('INSERT') ? [{ key: 'k' }] : []));
    const s = new NeonStore(f.run);
    expect(await s.setIfAbsent('k', 'v', 600)).toBe(true);
    expect(await s.setIfAbsent('k2', 'v', 600)).toBe(true);
    expect(f.calls.filter((c) => c.text.startsWith('CREATE TABLE IF NOT EXISTS fiado_handoff'))).toHaveLength(1);
    const insert = f.calls.find((c) => c.text.startsWith('INSERT'))!;
    expect(insert.params).toEqual(['k', 'v', 600]);
    expect(insert.text).toMatch(/ON CONFLICT \(key\) DO UPDATE/);
    expect(insert.text).toMatch(/WHERE fiado_handoff\.expires_at <= now\(\)/);
  });

  it('reports false when the key is live (the upsert returns no row): planted control', async () => {
    const f = fake((text) => (text.startsWith('INSERT') ? [] : []));
    expect(await new NeonStore(f.run).setIfAbsent('k', 'v', 60)).toBe(false);
  });

  it('reads only unexpired values and returns null when there is no row', async () => {
    const f = fake((text) => (text.startsWith('SELECT') ? [{ value: 'hello' }] : []));
    const s = new NeonStore(f.run);
    expect(await s.get('k')).toBe('hello');
    const select = f.calls.find((c) => c.text.startsWith('SELECT'))!;
    expect(select.text).toMatch(/expires_at > now\(\)/);
    expect(select.params).toEqual(['k']);
    expect(await new NeonStore(fake(() => []).run).get('k')).toBeNull();
  });

  it('retries table creation after a failure instead of caching it', async () => {
    let fail = true;
    const f = fake((text) => {
      if (text.startsWith('CREATE') && fail) throw new Error('db asleep');
      return text.startsWith('INSERT') ? [{ key: 'k' }] : [];
    });
    const s = new NeonStore(f.run);
    await expect(s.setIfAbsent('k', 'v', 60)).rejects.toThrow(/db asleep/);
    fail = false;
    expect(await s.setIfAbsent('k', 'v', 60)).toBe(true);
  });
});

describe('getStore', () => {
  afterEach(() => setStoreForTests(undefined));

  it('uses Neon when only a database url is set, and prefers Upstash when both are set', () => {
    setStoreForTests(undefined);
    expect(getStore({ DATABASE_URL: 'postgres://u:p@ep-x.neon.tech/db' }).kind).toBe('neon');
    setStoreForTests(undefined);
    expect(getStore({ POSTGRES_URL: 'postgres://u:p@ep-x.neon.tech/db' }).kind).toBe('neon');
    setStoreForTests(undefined);
    expect(getStore({ DATABASE_URL: 'postgres://u:p@h/db', UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 't' }).kind).toBe('upstash');
  });

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
