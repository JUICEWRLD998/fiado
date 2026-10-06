// A small proxy to friendbot, the testnet faucet, so the browser never has to talk to it directly
// (and so its own rate limit protects the shared faucet from one noisy client).

import { fund } from '../chain/horizon';
import { createLimiter, type Limiter } from '../handoff/ratelimit';

const G_RE = /^G[A-Z2-7]{55}$/;
const HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: HEADERS });

export function createFundHandler(deps: { fundImpl?: (account: string) => Promise<void>; limiter?: Limiter } = {}) {
  const fundImpl = deps.fundImpl ?? ((a: string) => fund(a));
  const limiter = deps.limiter ?? createLimiter(10, 60_000);
  return async (req: Request): Promise<Response> => {
    const who = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!limiter(who)) return reply(429, { error: 'too many requests, slow down' });
    let account: unknown;
    try {
      account = ((await req.json()) as { account?: unknown }).account;
    } catch {
      return reply(400, { error: 'body is not valid JSON' });
    }
    if (typeof account !== 'string' || !G_RE.test(account)) return reply(400, { error: 'account must be a Stellar address' });
    try {
      await fundImpl(account);
    } catch {
      return reply(502, { error: 'the testnet faucet did not answer, try again' });
    }
    return reply(200, { ok: true });
  };
}
