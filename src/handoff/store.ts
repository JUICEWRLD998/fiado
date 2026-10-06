// The handoff mailbox needs one tiny piece of shared state: a write-once value with a lifetime.
// Locally that is memory. On Vercel, functions do not share memory between requests, so a deployed
// build must use Redis (Upstash, free tier, via the Vercel Marketplace). Both implement `Store`.

export type Store = {
  kind: 'memory' | 'upstash';
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

type WithStore = typeof globalThis & { __fiadoStore?: Store };

/** One store per server process. Redis when its environment variables are set, otherwise memory. */
export function getStore(env: Record<string, string | undefined> = process.env): Store {
  const g = globalThis as WithStore;
  if (g.__fiadoStore) return g.__fiadoStore;
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  g.__fiadoStore = url && token ? new UpstashStore(url, token) : new MemoryStore();
  return g.__fiadoStore;
}

/** Test seam: replace (or clear) the process-wide store. */
export function setStoreForTests(store: Store | undefined): void {
  (globalThis as WithStore).__fiadoStore = store;
}
