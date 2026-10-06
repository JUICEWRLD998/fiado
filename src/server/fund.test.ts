import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { createLimiter } from '../handoff/ratelimit';
import { createFundHandler } from './fund';

const ACCOUNT = Keypair.random().publicKey();
const post = (body: unknown, ip = '1.1.1.1') =>
  new Request('http://x/api/fund', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('the friendbot proxy', () => {
  it('funds a valid account and says so', async () => {
    const funded: string[] = [];
    const h = createFundHandler({ fundImpl: async (a) => void funded.push(a) });
    const res = await h(post({ account: ACCOUNT }));
    expect(res.status).toBe(200);
    expect(funded).toEqual([ACCOUNT]);
  });

  it('refuses anything that is not a Stellar address, without calling the faucet', async () => {
    const funded: string[] = [];
    const h = createFundHandler({ fundImpl: async (a) => void funded.push(a) });
    for (const bad of [{ account: 'GABC' }, { account: 42 }, {}, { account: `${ACCOUNT}x` }, { account: '../etc/passwd' }]) {
      expect((await h(post(bad))).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await h(post('not json'))).status).toBe(400);
    expect(funded).toEqual([]);
  });

  it('answers 502 when the faucet fails, rather than pretending it worked', async () => {
    const h = createFundHandler({ fundImpl: async () => { throw new Error('friendbot 500'); } });
    expect((await h(post({ account: ACCOUNT }))).status).toBe(502);
  });

  it('limits one client without affecting another', async () => {
    const h = createFundHandler({ fundImpl: async () => {}, limiter: createLimiter(1, 60_000) });
    expect((await h(post({ account: ACCOUNT }, '7.7.7.7'))).status).toBe(200);
    expect((await h(post({ account: ACCOUNT }, '7.7.7.7'))).status).toBe(429);
    expect((await h(post({ account: ACCOUNT }, '6.6.6.6'))).status).toBe(200);
  });
});
