// The handoff mailbox needs one tiny piece of shared state: a write-once value with a lifetime.
// Locally that is memory. On Vercel, functions do not share memory between requests, so a deployed
// build must use a shared database: Neon Postgres (Vercel Marketplace) or Upstash Redis. All implement `Store`.

import { neon } from '@neondatabase/serverless';

export type Store = {
  kind: 'memory' | 'upstash' | 'neon';
  /** Writes only if the key is absent. Returns true when this call wrote it. */
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
};

export class MemoryStore implements Store {
  kind = 'memory' as const;
  private data = new Map<string, { value: string; expires: number }>();

  constructor(private now: () => number = Date.now) {}

  private live(key: string) {
    const hit = this.data.get(key);
    if (!hit) return null;
    if (hit.expires <= this.now()) {
      this.data.delete(key);
      return null;
    }
    return hit;
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (this.live(key)) return false;
    if (this.data.size > 5000) for (const k of [...this.data.keys()]) this.live(k); // drop expired entries
    this.data.set(key, { value, expires: this.now() + ttlSeconds * 1000 });
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }
}

/** Upstash Redis over its REST API: one POSTed command array per call. */
export class UpstashStore implements Store {
  kind = 'upstash' as const;

  constructor(
    private url: string,
    private token: string,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async command(args: (string | number)[]): Promise<unknown> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`handoff store answered HTTP ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error(`handoff store error: ${body.error}`);
    return body.result ?? null;
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    return (await this.command(['SET', key, value, 'EX', ttlSeconds, 'NX'])) === 'OK';
  }

  async get(key: string): Promise<string | null> {
    const r = await this.command(['GET', key]);
    return typeof r === 'string' ? r : null;
  }
}

/** Runs one parameterised SQL statement and returns its rows. The seam the tests replace. */
export type RunSql = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

/** Neon Postgres over HTTP. One table; the write-once rule is a single atomic INSERT ... ON CONFLICT. */
export class NeonStore implements Store {
  kind = 'neon' as const;
  private ready: Promise<void> | undefined;

  constructor(private run: RunSql) {}

  private init(): Promise<void> {
    this.ready ??= this.run(
      'CREATE TABLE IF NOT EXISTS fiado_handoff (key text PRIMARY KEY, value text NOT NULL, expires_at timestamptz NOT NULL)',
      [],
    ).then(
      () => undefined,
      (e) => {
        this.ready = undefined; // retry on the next call rather than caching a failure
        throw e;
      },
    );
    return this.ready;
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    await this.init();
    // Writes when the key is new, or replaces it only if the old value has expired. RETURNING gives a row only then.
    const rows = await this.run(
      `INSERT INTO fiado_handoff (key, value, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3::double precision))
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
       WHERE fiado_handoff.expires_at <= now()
       RETURNING key`,
      [key, value, ttlSeconds],
    );
    if (Math.random() < 0.05) await this.run("DELETE FROM fiado_handoff WHERE expires_at < now() - interval '1 hour'", []);
    return rows.length === 1;
  }

  async get(key: string): Promise<string | null> {
    await this.init();
    const rows = await this.run('SELECT value FROM fiado_handoff WHERE key = $1 AND expires_at > now()', [key]);
    const v = rows[0]?.value;
    return typeof v === 'string' ? v : null;
  }
}

type WithStore = typeof globalThis & { __fiadoStore?: Store };

/** One store per server process. Upstash if its variables are set, else Neon if a database URL is set, else memory. */
export function getStore(env: Record<string, string | undefined> = process.env): Store {
  const g = globalThis as WithStore;
  if (g.__fiadoStore) return g.__fiadoStore;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  const dbUrl = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (url && token) g.__fiadoStore = new UpstashStore(url, token);
  else if (dbUrl) {
    const sql = neon(dbUrl);
    g.__fiadoStore = new NeonStore(async (text, params) => (await sql.query(text, params)) as Record<string, unknown>[]);
  } else g.__fiadoStore = new MemoryStore();
  return g.__fiadoStore;
}

/** Test seam: replace (or clear) the process-wide store. */
export function setStoreForTests(store: Store | undefined): void {
  (globalThis as WithStore).__fiadoStore = store;
}
