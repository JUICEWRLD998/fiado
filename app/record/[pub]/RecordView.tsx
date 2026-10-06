'use client';

import { useEffect, useState } from 'react';
import type { RecordSummary } from '@/book';
import { readProfile } from '@/chain/horizon';
import { messageOf } from '@/client/flows';
import { shortKey } from '@/client/format';
import { loadRecord, loadShopProfiles, type ShopProfiles } from '@/client/reads';
import { Book } from '@/ui/Book';
import { LedgerCorner } from '@/ui/Illustrations';
import { Notice } from '@/ui/Notice';
import { RecordFacts } from '@/ui/RecordFacts';
import u from '@/ui/screens.module.css';
import { Shell } from '@/ui/Shell';

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

  const title = view.status === 'ok' && view.name ? `${view.name}’s record` : 'Fiado record';

  return (
    <Shell>
      <Book
        title={title}
        titleTestId="record-title"
        meta={<p style={{ margin: 0 }}>Public. Counted from transactions on the Stellar test network · {shortKey(pub)}</p>}
        aside={
          <div className={u.asideCard}>
            <h2>Not a score</h2>
            <p className={u.meta} style={{ margin: 0 }}>
              Counts and a median, nothing hidden. A shop reads them and decides for itself.
            </p>
            <LedgerCorner className={u.art} />
          </div>
        }
      >
        {view.status === 'loading' && <p>Reading the ledger…</p>}
        {view.status === 'missing' && (
          <Notice tone="problem" data-testid="record-missing">
            No Fiado account exists at this address.
          </Notice>
        )}
        {view.status === 'error' && <Notice tone="problem">{view.message}</Notice>}
        {view.status === 'ok' && (
          <section className={u.stack}>
            <RecordFacts record={view.record} shops={view.shops} />
            <p className={u.meta}>
              <a href={`https://stellar.expert/explorer/testnet/account/${pub}`} target="_blank" rel="noreferrer">
                Check it on the ledger
              </a>
            </p>
          </section>
        )}
      </Book>
    </Shell>
  );
}
