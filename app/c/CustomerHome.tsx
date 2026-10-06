'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { RecordSummary } from '@/book';
import { cleanName } from '@/chain/profile';
import { messageOf } from '@/client/flows';
import { formatAmount, shortKey } from '@/client/format';
import { loadRecord, loadShopProfiles, loadTabs, type ShopProfiles, type Tab } from '@/client/reads';
import { whatsappLink } from '@/client/remind';
import { useCustody, type Custody } from '@/client/useCustody';
import type { Mode } from '@/passkey/custody';
import { KeyChoice } from '@/ui/KeyChoice';
import { RecordFacts } from '@/ui/RecordFacts';
import s from '@/ui/ui.module.css';

export default function CustomerHome() {
  const custody = useCustody('customer');
  if (custody.status === 'loading') return <main className={s.page}><p>Loading…</p></main>;
  if (custody.status === 'none') return <CreateKey custody={custody} />;
  if (custody.status === 'locked' || !custody.kp) return <Locked custody={custody} />;
  return <Tabs custody={custody} pub={custody.kp.publicKey()} />;
}

function CreateKey({ custody }: { custody: Custody }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('passkey');
  const [problem, setProblem] = useState<string | null>(null);
  const effective: Mode = custody.canPasskey ? mode : 'device';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    let clean: string;
    try {
      clean = cleanName(name);
    } catch (err) {
      setProblem(messageOf(err));
      return;
    }
    await custody.create(effective, { name: clean });
  }

  return (
    <main className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Your tabs</h1>
        <span className={s.tag}>Testnet only</span>
      </header>
      <form className={s.card} onSubmit={submit}>
        <p>Make your Fiado key. Shops will see this name next to your tab, so use the name they know you by.</p>
        <div className={s.field}>
          <label htmlFor="customer-name">Your name</label>
          <input id="customer-name" data-testid="customer-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
        </div>
        <KeyChoice canPasskey={custody.canPasskey} mode={effective} onChange={setMode} />
        <button type="submit" className={s.button} data-testid="create-customer-key" disabled={custody.busy}>
          {custody.busy ? 'Creating…' : 'Create my key'}
        </button>
        {(problem ?? custody.error) && <p role="alert" className={s.problem}>{problem ?? custody.error}</p>}
      </form>
    </main>
  );
}

function Locked({ custody }: { custody: Custody }) {
  return (
    <main className={s.page}>
      <h1 className={s.title}>Welcome back</h1>
      <div className={s.card}>
        <button type="button" className={s.button} data-testid="unlock-customer" disabled={custody.busy} onClick={() => void custody.unlock()}>
          {custody.busy ? 'Unlocking…' : 'Unlock with passkey'}
        </button>
        {custody.error && <p role="alert" className={s.problem}>{custody.error}</p>}
      </div>
    </main>
  );
}

type Loaded = { tabs: Tab[]; record: RecordSummary | null; shops: ShopProfiles };

async function loadAll(pub: string): Promise<Loaded> {
  const [tabs, record] = await Promise.all([loadTabs(pub), loadRecord(pub)]);
  const shops = record ? await loadShopProfiles(record.perShop.map((p) => p.shop)) : {};
  return { tabs, record, shops };
}

function Tabs({ custody, pub }: { custody: Custody; pub: string }) {
  const [data, setData] = useState<Loaded | null>(null);

  const refresh = useCallback(async () => setData(await loadAll(pub)), [pub]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await loadAll(pub);
      if (alive) setData(loaded);
    })();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pub, refresh]);

  const shareOnWhatsApp = () => window.open(whatsappLink(`My Fiado record: ${window.location.origin}/record/${pub}`), '_blank', 'noopener');

  return (
    <main className={s.page} data-testid="customer-ready">
      <header className={s.header}>
        <h1 className={s.title}>{custody.meta?.name ?? 'Your tabs'}</h1>
        <span className={s.tag}>Testnet · {shortKey(pub)}</span>
      </header>

      <h2>Open tabs</h2>
      {data && data.tabs.length === 0 && (
        <p className={s.muted} data-testid="tabs-empty">You have no tabs yet. When a shop gives you a join code, scan it or open its link.</p>
      )}
      <ul className={s.list}>
        {data?.tabs.map((t) => (
          <li key={t.shop} data-testid="tab-row">
            <div className={s.rowTop}>
              <span className={s.name} data-testid="tab-shop">{t.shopName ?? shortKey(t.shop)}</span>
              <span className={s.owed} data-testid="tab-owed">{formatAmount(t.owed, t.currency)}</span>
            </div>
            <div className={s.muted}>
              Limit {formatAmount(t.limit, t.currency)} · <span data-testid="tab-headroom">{formatAmount(t.headroom, t.currency)}</span> left
            </div>
          </li>
        ))}
      </ul>

      {data?.record && data.record.purchases > 0 && (
        <section className={s.card} data-testid="record-summary" aria-labelledby="rec-title">
          <h2 id="rec-title">Your record</h2>
          <p className={s.muted}>Facts any shop can check on the public ledger. It is not a score, and it is yours to share.</p>
          <RecordFacts record={data.record} shops={data.shops} />
          <div className={s.actions}>
            <Link className={s.ghost} style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} data-testid="my-record-link" href={`/record/${pub}`}>
              Open my shareable record
            </Link>
            <button type="button" className={s.ghost} data-testid="share-record" onClick={shareOnWhatsApp}>Share on WhatsApp</button>
          </div>
        </section>
      )}
    </main>
  );
}
