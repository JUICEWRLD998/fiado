import { Account, Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { joinAndOpen } from '../chain/builders';
import { createSession, getSession, isId, MAX_SLOT_BYTES, newId, putSlot, sanitize, TTL_SECONDS } from './session';
import { MemoryStore } from './store';

const SHOP = Keypair.random().publicKey();
const CUST = Keypair.random().publicKey();
const XDR = joinAndOpen({ shop: new Account(SHOP, '1'), customer: CUST, limit: '5000', name: 'Bisi' }).toEnvelope().toXDR('base64');

const joinOffer = { kind: 'join', shop: SHOP, shopName: 'Mama Bisi', currency: '₦', limit: '10000' };
const buyOffer = { kind: 'buy', shop: SHOP, customer: CUST, amount: '3200', item: 'Rice 2 bags', due: '2026-10-20', currency: '₦' };

async function start(offer: unknown, store = new MemoryStore()) {
  const made = await createSession(store, offer);
  if (!made.ok) throw new Error(made.error);
  return { store, id: made.id };
}

describe('newId', () => {
  it('makes 22 url-safe characters, never repeating', () => {
    const ids = new Set(Array.from({ length: 2000 }, newId));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(isId(id)).toBe(true);
  });
  it('isId rejects anything that is not an id', () => {
    for (const bad of ['', 'short', 'x'.repeat(21), 'x'.repeat(23), 'a'.repeat(21) + '!', '../etc/passwd', 'a'.repeat(22) + '\n']) expect(isId(bad), bad).toBe(false);
  });
});

describe('createSession and sanitize', () => {
  it('stores a join offer and a buy offer, normalised', async () => {
    const { store, id } = await start({ ...buyOffer, amount: '3200.00', item: '  Rice 2 bags ' });
    const s = await getSession(store, id);
    expect(s?.offer).toEqual({ ...buyOffer, amount: '3200' });
    expect(s).toMatchObject({ hello: null, request: null, response: null });
  });

  it('drops fields it does not know, so nothing extra rides along', async () => {
    const { store, id } = await start({ ...joinOffer, evil: '<script>', extra: { a: 1 } });
    expect(Object.keys((await getSession(store, id))!.offer).sort()).toEqual(['currency', 'kind', 'limit', 'shop', 'shopName']);
  });

  const bad: [string, unknown][] = [
    ['not an object', 'hello'],
    ['an array', []],
    ['null', null],
    ['an unknown kind', { ...joinOffer, kind: 'steal' }],
    ['a shop that is not an address', { ...joinOffer, shop: 'GABC' }],
    ['a zero limit', { ...joinOffer, limit: '0' }],
    ['a negative limit', { ...joinOffer, limit: '-5' }],
    ['a limit with too many decimals', { ...joinOffer, limit: '1.00000001' }],
    ['a currency with a space', { ...joinOffer, currency: 'N G' }],
    ['an empty shop name', { ...joinOffer, shopName: '  ' }],
    ['a buy with no customer', { ...buyOffer, customer: undefined }],
    ['a buy with a bad date', { ...buyOffer, due: '20/10/2026' }],
    ['a buy whose item cannot fit the 28-byte memo with its date', { ...buyOffer, item: 'x'.repeat(30) }],
    ['a buy for zero', { ...buyOffer, amount: '0' }],
  ];
  for (const [name, body] of bad) {
    it(`refuses ${name}`, async () => {
      const r = await createSession(new MemoryStore(), body);
      expect(r.ok).toBe(false);
    });
  }

  it('accepts a buy with no due date', async () => {
    const { store, id } = await start({ ...buyOffer, due: undefined });
    expect((await getSession(store, id))?.offer).not.toHaveProperty('due');
  });

  it('sanitize rejects an xdr that is not a transaction, and one with illegal characters', () => {
    expect(() => sanitize('request', { xdr: 'AAAA' })).toThrow(/valid transaction/);
    expect(() => sanitize('response', { xdr: 'not base64!' })).toThrow(/base64/);
    expect(sanitize('request', { xdr: XDR })).toEqual({ xdr: XDR });
  });
});

describe('the join flow, in order', () => {
  it('runs offer, hello, request, response, and each can be read back', async () => {
    const { store, id } = await start(joinOffer);
    expect((await putSlot(store, id, 'hello', { pub: CUST, name: 'Bisi' })).status).toBe('ok');
    expect((await putSlot(store, id, 'request', { xdr: XDR })).status).toBe('ok');
    expect((await putSlot(store, id, 'response', { xdr: XDR })).status).toBe('ok');
    const s = await getSession(store, id);
    expect(s?.hello).toEqual({ pub: CUST, name: 'Bisi' });
    expect(s?.request?.xdr).toBe(XDR);
    expect(s?.response?.xdr).toBe(XDR);
  });

  it('refuses out-of-order writes: request before hello, response before request', async () => {
    const { store, id } = await start(joinOffer);
    expect((await putSlot(store, id, 'request', { xdr: XDR })).status).toBe('out_of_order');
    expect((await putSlot(store, id, 'response', { xdr: XDR })).status).toBe('out_of_order');
    await putSlot(store, id, 'hello', { pub: CUST, name: 'Bisi' });
    expect((await putSlot(store, id, 'response', { xdr: XDR })).status).toBe('out_of_order');
  });

  it('every slot is write-once: a second write, even with the same content, is refused and changes nothing', async () => {
    const { store, id } = await start(joinOffer);
    await putSlot(store, id, 'hello', { pub: CUST, name: 'Bisi' });
    const again = await putSlot(store, id, 'hello', { pub: Keypair.random().publicKey(), name: 'Mallory' });
    expect(again.status).toBe('exists');
    expect((await getSession(store, id))?.hello?.name).toBe('Bisi');
  });

  it('the shop cannot say hello to itself', async () => {
    const { store, id } = await start(joinOffer);
    expect((await putSlot(store, id, 'hello', { pub: SHOP, name: 'Me' })).status).toBe('invalid');
  });

  it('refuses a bad hello', async () => {
    const { store, id } = await start(joinOffer);
    expect((await putSlot(store, id, 'hello', { pub: 'nope', name: 'Bisi' })).status).toBe('invalid');
    expect((await putSlot(store, id, 'hello', { pub: CUST, name: '' })).status).toBe('invalid');
    expect((await putSlot(store, id, 'hello', { pub: CUST })).status).toBe('invalid');
  });
});

describe('the buy flow', () => {
  it('takes only a response, once', async () => {
    const { store, id } = await start(buyOffer);
    expect((await putSlot(store, id, 'hello', { pub: CUST, name: 'Bisi' })).status).toBe('out_of_order');
    expect((await putSlot(store, id, 'request', { xdr: XDR })).status).toBe('out_of_order');
    expect((await putSlot(store, id, 'response', { xdr: XDR })).status).toBe('ok');
    expect((await putSlot(store, id, 'response', { xdr: XDR })).status).toBe('exists');
  });
});

describe('guards', () => {
  it('the offer cannot be rewritten through a slot write', async () => {
    const { store, id } = await start(joinOffer);
    expect((await putSlot(store, id, 'offer', joinOffer)).status).toBe('invalid');
  });

  it('an unknown or malformed id is "no session", never an error', async () => {
    const store = new MemoryStore();
    expect((await putSlot(store, newId(), 'hello', { pub: CUST, name: 'x' })).status).toBe('no_session');
    expect((await putSlot(store, '../../etc', 'hello', {})).status).toBe('no_session');
    expect(await getSession(store, newId())).toBeNull();
    expect(await getSession(store, 'not-an-id')).toBeNull();
  });

  it('an oversized payload is refused before anything is parsed', async () => {
    const { store, id } = await start(joinOffer);
    const r = await putSlot(store, id, 'hello', { pub: CUST, name: 'x'.repeat(MAX_SLOT_BYTES) });
    expect(r.status).toBe('too_big');
  });

  it('a session disappears after its time to live', async () => {
    let t = 0;
    const store = new MemoryStore(() => t);
    const { id } = await start(joinOffer, store);
    expect(await getSession(store, id)).not.toBeNull();
    t += TTL_SECONDS * 1000 + 1;
    expect(await getSession(store, id)).toBeNull();
    expect((await putSlot(store, id, 'hello', { pub: CUST, name: 'Bisi' })).status).toBe('no_session');
  });

  it('two sessions never see each other', async () => {
    const store = new MemoryStore();
    const a = await start(joinOffer, store);
    const b = await start(joinOffer, store);
    await putSlot(store, a.id, 'hello', { pub: CUST, name: 'Bisi' });
    expect((await getSession(store, b.id))?.hello).toBeNull();
  });
});
