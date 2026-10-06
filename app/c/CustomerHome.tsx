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
import { Book, BookRow, BookRows } from '@/ui/Book';
import { Button, buttonStyle } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { Gauge } from '@/ui/Gauge';
import { LedgerCorner, TallyEmpty } from '@/ui/Illustrations';
import { KeyChoice } from '@/ui/KeyChoice';
import { Notice } from '@/ui/Notice';
import { RecordFacts } from '@/ui/RecordFacts';
import u from '@/ui/screens.module.css';
import { Shell } from '@/ui/Shell';
import { Slip } from '@/ui/Slip';
import { AsideCard, Work } from '@/ui/Work';

const units = (n: bigint) => Number(n) / 10_000_000;

export default function CustomerHome() {
  const custody = useCustody('customer');
  return (
    <Shell>
      {custody.status === 'loading' && <p>Loading…</p>}
      {custody.status === 'none' && <CreateKey custody={custody} />}
      {(custody.status === 'locked' || (custody.status === 'ready' && !custody.kp)) && <Locked custody={custody} />}
      {custody.status === 'ready' && custody.kp && <Tabs custody={custody} pub={custody.kp.publicKey()} />}
    </Shell>
  );
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
    <Work
      aside={
        <AsideCard title="Only you can add to your tab">
          <p>Your key is made on this device. A shop can offer you credit, but only your signature adds to what you owe.</p>
          <p className={u.meta}>This runs on the Stellar test network. No real money.</p>
        </AsideCard>
      }
    >
      <Slip title="Make your Fiado key">
        <form onSubmit={submit}>
          <p>Shops will see this name next to your tab, so use the name they know you by.</p>
          <TextField label="Your name" data-testid="customer-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          <KeyChoice canPasskey={custody.canPasskey} mode={effective} onChange={setMode} />
          <Button type="submit" variant="primary" data-testid="create-customer-key" busy={custody.busy}>
            {custody.busy ? 'Creating…' : 'Create my key'}
          </Button>
          {(problem ?? custody.error) && <Notice tone="problem">{problem ?? custody.error}</Notice>}
        </form>
      </Slip>
    </Work>
  );
}

function Locked({ custody }: { custody: Custody }) {
  return (
    <Work>
      <Slip title="Welcome back">
        <Button variant="primary" data-testid="unlock-customer" busy={custody.busy} onClick={() => void custody.unlock()}>
          {custody.busy ? 'Unlocking…' : 'Unlock with passkey'}
        </Button>
        {custody.error && <Notice tone="problem">{custody.error}</Notice>}
      </Slip>
    </Work>
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
  const tabs = data?.tabs ?? [];

  return (
    <div data-testid="customer-ready">
      <Book
        title={custody.meta?.name ?? 'Your tabs'}
        meta={<p style={{ margin: 0 }}>{data ? (tabs.length === 0 ? 'No open tabs.' : `${tabs.length} open ${tabs.length === 1 ? 'tab' : 'tabs'}`) : 'Reading the ledger…'}</p>}
        aside={
          <div className={u.asideCard}>
            <h2>Only you can add to your tab</h2>
            <p className={u.meta} style={{ margin: 0 }}>
              Every purchase needs your signature, and the network refuses anything over your limit.
            </p>
            <LedgerCorner className={u.art} />
            <p className={u.meta} style={{ margin: 0 }}>
              Testnet · {shortKey(pub)}
            </p>
          </div>
        }
      >
        {data && tabs.length === 0 && (
          <div className={u.empty} data-testid="tabs-empty">
            <TallyEmpty className={u.emptyArt} />
            <p>You have no tabs yet. When a shop gives you a join code, scan it or open its link.</p>
          </div>
        )}

        <BookRows>
          {tabs.map((t) => (
            <BookRow key={t.shop} testId="tab-row" mark={t.owed === 0n ? 'clear' : undefined}>
              <div className={u.top}>
                <span className={u.name} data-testid="tab-shop">
                  {t.shopName ?? shortKey(t.shop)}
                </span>
                <span className={u.owed} data-testid="tab-owed">
                  {formatAmount(t.owed, t.currency)}
                </span>
              </div>
              <Gauge owed={units(t.owed)} limit={units(t.limit)} label={`${formatAmount(t.owed, t.currency)} owed of a ${formatAmount(t.limit, t.currency)} limit`} />
              <p className={u.meta}>
                Limit {formatAmount(t.limit, t.currency)} · <span data-testid="tab-headroom">{formatAmount(t.headroom, t.currency)}</span> left
              </p>
            </BookRow>
          ))}
        </BookRows>

        {data?.record && data.record.purchases > 0 && (
          <section className={u.stack} style={{ marginTop: 32 }} data-testid="record-summary" aria-labelledby="rec-title">
            <h2 id="rec-title">Your record</h2>
            <p className={u.meta}>Facts any shop can check on the public ledger. It is not a score, and it is yours to share.</p>
            <RecordFacts record={data.record} shops={data.shops} />
            <div className={u.actions}>
              <Link {...buttonStyle('secondary')} data-testid="my-record-link" href={`/record/${pub}`}>
                Open my shareable record
              </Link>
              <Button variant="quiet" data-testid="share-record" onClick={shareOnWhatsApp}>
                Share on WhatsApp
              </Button>
            </div>
          </section>
        )}
      </Book>
    </div>
  );
}
