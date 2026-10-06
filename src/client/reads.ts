// What the screens read from Horizon. Everything here is a read: no key, no signature.

import { book, record, todayUtc, toCustomerInfo, toLines, toMovements, type Book, type CustomerInfo, type RawBalance, type RawPayment, type RecordSummary } from '../book';
import { toStroops } from '../chain/amount';
import { HORIZON_URL, DEFAULT_CURRENCY, decodeData, NAME_KEY, CURRENCY_KEY } from '../chain';
import { server } from '../chain/horizon';

type PagedRecords<T> = { _embedded: { records: T[] }; _links: { next: { href: string } } };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Horizon answered ${res.status}`);
  return (await res.json()) as T;
}

/** Every payment an account took part in, with its transaction, oldest first. Follows the paging links. */
export async function fetchAllPayments(account: string, maxPages = 20): Promise<RawPayment[]> {
  const all: RawPayment[] = [];
  let url = `${HORIZON_URL}/accounts/${account}/payments?join=transactions&order=asc&limit=200`;
  for (let page = 0; page < maxPages; page++) {
    const body = await getJson<PagedRecords<RawPayment>>(url);
    if (body._embedded.records.length === 0) break;
    all.push(...body._embedded.records);
    url = body._links.next.href;
  }
  return all;
}

export type ShopBook = { book: Book; shopName: string | null; currency: string };

/** The shop's book: its trustlines for what is owed, its payment history for the story behind each tab. */
export async function loadBook(shop: string, today: string = todayUtc()): Promise<ShopBook> {
  const acct = await server.loadAccount(shop);
  const lines = toLines(acct.balances as unknown as RawBalance[]);
  const entries = await Promise.all(
    lines.map(async (l): Promise<[string, CustomerInfo]> => {
      try {
        const a = await server.loadAccount(l.customer);
        return [l.customer, toCustomerInfo({ flags: a.flags, data: a.data_attr })];
      } catch {
        return [l.customer, { name: null, authRequired: false }];
      }
    }),
  );
  const movements = toMovements(await fetchAllPayments(shop));
  return {
    book: book({ shop, movements, lines, customers: Object.fromEntries(entries), today }),
    shopName: decodeData(acct.data_attr[NAME_KEY]),
    currency: decodeData(acct.data_attr[CURRENCY_KEY]) ?? DEFAULT_CURRENCY,
  };
}

export type Tab = { shop: string; shopName: string | null; currency: string; owed: bigint; limit: bigint; headroom: bigint };

type AccountRecord = { id: string; data?: Record<string, string>; balances: RawBalance[] };

/** The customer's tabs: every shop holding their IOU that they have authorized. */
export async function loadTabs(customer: string): Promise<Tab[]> {
  let body: PagedRecords<AccountRecord>;
  try {
    body = await getJson<PagedRecords<AccountRecord>>(`${HORIZON_URL}/accounts?asset=FIADO:${customer}&limit=200`);
  } catch {
    return [];
  }
  const tabs: Tab[] = [];
  for (const a of body._embedded.records) {
    if (a.id === customer) continue;
    const line = toLines(a.balances).find((l) => l.customer === customer);
    if (!line || !line.authorized) continue;
    tabs.push({
      shop: a.id,
      shopName: decodeData(a.data?.[NAME_KEY]),
      currency: decodeData(a.data?.[CURRENCY_KEY]) ?? DEFAULT_CURRENCY,
      owed: line.owed,
      limit: line.limit,
      headroom: line.limit > line.owed ? line.limit - line.owed : 0n,
    });
  }
  return tabs.sort((x, y) => (x.owed === y.owed ? (x.shopName ?? x.shop).localeCompare(y.shopName ?? y.shop) : x.owed > y.owed ? -1 : 1));
}

/** The customer's portable record, from their own payment feed. Empty until their account exists. */
export async function loadRecord(customer: string, today: string = todayUtc()): Promise<RecordSummary | null> {
  try {
    return record({ customer, movements: toMovements(await fetchAllPayments(customer)), today });
  } catch {
    return null;
  }
}

export { toStroops };
