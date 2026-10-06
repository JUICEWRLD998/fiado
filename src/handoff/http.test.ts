import { Account, Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { joinAndOpen } from '../chain/builders';
import { createHandlers, defaultLimits } from './http';
import { createLimiter } from './ratelimit';
import { MAX_SLOT_BYTES } from './session';
import { MemoryStore } from './store';

const SHOP = Keypair.random().publicKey();
const CUST = Keypair.random().publicKey();
const XDR = joinAndOpen({ shop: new Account(SHOP, '1'), customer: CUST, limit: '5000', name: 'Bisi' }).toEnvelope().toXDR('base64');
const offer = { kind: 'join', shop: SHOP, shopName: 'Mama Bisi', currency: '₦', limit: '10000' };

const req = (method: string, body?: unknown, ip = '1.1.1.1') =>
  new Request('http://localhost/api', { method, headers: { 'x-forwarded-for': ip }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });

const fresh = () => createHandlers(new MemoryStore(), defaultLimits());

async function newSession(h: ReturnType<typeof fresh>) {
  const res = await h.create(req('POST', offer));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe('the mailbox over HTTP', () => {
  it('runs a whole join exchange through Request and Response, as the two phones will', async () => {
    const h = fresh();
    const id = await newSession(h);
    expect((await h.write(req('PUT', { pub: CUST, name: 'Bisi' }), id, 'hello')).status).toBe(201);
    expect((await h.write(req('PUT', { xdr: XDR }), id, 'request')).status).toBe(201);
    expect((await h.write(req('PUT', { xdr: XDR }), id, 'response')).status).toBe(201);
    const res = await h.read(req('GET'), id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ offer: { kind: 'join' }, hello: { name: 'Bisi' }, request: { xdr: XDR }, response: { xdr: XDR } });
  });

  it('creating answers with the id, the store kind and the lifetime', async () => {
    const res = await fresh().create(req('POST', offer));
    expect(await res.json()).toMatchObject({ store: 'memory', ttl: 600 });
  });

  it('maps every outcome to the right status code', async () => {
    const h = fresh();
    const id = await newSession(h);
    expect((await h.create(req('POST', { ...offer, limit: '0' }))).status).toBe(400); // bad offer
    expect((await h.read(req('GET'), 'A'.repeat(22))).status).toBe(404); // unknown session
    expect((await h.write(req('PUT', { pub: CUST, name: 'x' }), 'A'.repeat(22), 'hello')).status).toBe(404);
    expect((await h.write(req('PUT', { pub: CUST, name: 'x' }), id, 'nonsense')).status).toBe(404); // unknown slot
    expect((await h.write(req('PUT', { xdr: XDR }), id, 'request')).status).toBe(409); // out of order
    await h.write(req('PUT', { pub: CUST, name: 'x' }), id, 'hello');
    expect((await h.write(req('PUT', { pub: CUST, name: 'x' }), id, 'hello')).status).toBe(409); // already written
    expect((await h.write(req('PUT', { pub: 'bad', name: 'x' }), id, 'hello')).status).toBe(400); // a malformed body is refused before "already written"
  });

  it('refuses bodies that are not JSON, and bodies that are far too large', async () => {
    const h = fresh();
    const id = await newSession(h);
    expect((await h.write(req('PUT', '{not json'), id, 'hello')).status).toBe(400);
    expect((await h.create(req('POST', 'plain text'))).status).toBe(400);
    expect((await h.write(req('PUT', 'x'.repeat(MAX_SLOT_BYTES * 2 + 1)), id, 'hello')).status).toBe(413);
  });

  it('answers 429 once a client exceeds its limit, while another client is unaffected', async () => {
    const h = createHandlers(new MemoryStore(), { create: createLimiter(2, 60_000), write: createLimiter(60, 60_000), read: createLimiter(900, 60_000) });
    expect((await h.create(req('POST', offer, '9.9.9.9'))).status).toBe(201);
    expect((await h.create(req('POST', offer, '9.9.9.9'))).status).toBe(201);
    expect((await h.create(req('POST', offer, '9.9.9.9'))).status).toBe(429);
    expect((await h.create(req('POST', offer, '8.8.8.8'))).status).toBe(201);
  });

  it('keys the limit on the first address of x-forwarded-for', async () => {
    const h = createHandlers(new MemoryStore(), { create: createLimiter(1, 60_000), write: createLimiter(60, 60_000), read: createLimiter(900, 60_000) });
    const mk = (xff: string) => new Request('http://x', { method: 'POST', headers: { 'x-forwarded-for': xff }, body: JSON.stringify(offer) });
    expect((await h.create(mk('5.5.5.5, 10.0.0.1'))).status).toBe(201);
    expect((await h.create(mk('5.5.5.5, 10.0.0.2'))).status).toBe(429);
  });

  it('never lets a response be cached', async () => {
    const h = fresh();
    const id = await newSession(h);
    expect((await h.read(req('GET'), id)).headers.get('cache-control')).toBe('no-store');
    expect((await h.read(req('GET'), 'A'.repeat(22))).headers.get('cache-control')).toBe('no-store');
  });
});
