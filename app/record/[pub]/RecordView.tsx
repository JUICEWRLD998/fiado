'use client';

import { useEffect, useState } from 'react';
import type { RecordSummary } from '@/book';
import { readProfile } from '@/chain/horizon';
import { messageOf } from '@/client/flows';
import { shortKey } from '@/client/format';
import { loadRecord, loadShopProfiles, type ShopProfiles } from '@/client/reads';
import { RecordFacts } from '@/ui/RecordFacts';
import s from '@/ui/ui.module.css';

type View =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ok'; name: string | null; record: RecordSummary; shops: ShopProfiles };

/** A customer's record, readable by anyone with the link. It is computed live from the public ledger. */
export default function RecordView({ pub }: { pub: string }) {
  const [view, setView] = useState<View>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const profile = await readProfile(pub);
        if (!alive) return;
        if (!profile) {
          setView({ status: 'missing' });
          return;
        }
        const record = await loadRecord(pub);
        const shops = record ? await loadShopProfiles(record.perShop.map((p) => p.shop)) : {};
        if (!alive) return;
        setView(record ? { status: 'ok', name: profile.name, record, shops } : { status: 'error', message: 'The ledger could not be read just now.' });
      } catch (e) {
        if (alive) setView({ status: 'error', message: messageOf(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [pub]);

  return (
    <main className={s.page}>
      <header className={s.header}>
        <h1 className={s.title} data-testid="record-title">
          {view.status === 'ok' && view.name ? `${view.name}’s record` : 'Fiado record'}
        </h1>
        <span className={s.tag}>Testnet · {shortKey(pub)}</span>
      </header>

      {view.status === 'loading' && <p>Reading the ledger…</p>}
      {view.status === 'missing' && (
        <p role="alert" data-testid="record-missing" className={s.problem}>
          No Fiado account exists at this address.
        </p>
      )}
      {view.status === 'error' && (
        <p role="alert" className={s.problem}>
          {view.message}
        </p>
      )}
      {view.status === 'ok' && (
        <section className={s.card}>
          <p className={s.muted}>
            How this person has used shop credit. These are facts counted from public transactions, not a score. Anyone can check them.
          </p>
          <RecordFacts record={view.record} shops={view.shops} />
          <p className={s.muted}>
            <a href={`https://stellar.expert/explorer/testnet/account/${pub}`} target="_blank" rel="noreferrer">
              Check it on the ledger
            </a>
          </p>
        </section>
      )}
    </main>
  );
}
