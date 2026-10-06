'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { cleanName } from '@/chain/profile';
import { awaitJoinRequest, messageOf, signJoin, type CustomerJoinState } from '@/client/flows';
import { formatAmount } from '@/client/format';
import { readSession } from '@/client/handoff';
import { useCustody } from '@/client/useCustody';
import { useFlow } from '@/client/useFlow';
import type { JoinOffer } from '@/handoff/session';
import type { Mode } from '@/passkey/custody';
import { Button, buttonStyle } from '@/ui/Button';
import { TextField } from '@/ui/Field';
import { Gauge } from '@/ui/Gauge';
import { KeyChoice } from '@/ui/KeyChoice';
import { Notice } from '@/ui/Notice';
import u from '@/ui/screens.module.css';
import { Shell } from '@/ui/Shell';
import { Slip } from '@/ui/Slip';
import { AsideCard, Work } from '@/ui/Work';

const failed = (message: string): CustomerJoinState => ({ step: 'failed', message });

function stroops(amount: string): bigint {
  const [w = '0', f = ''] = amount.split('.');
  return BigInt(w) * 10_000_000n + BigInt((f + '0000000').slice(0, 7));
}

export default function JoinFlow() {
  const id = useSearchParams().get('s');
  const custody = useCustody('customer');
  const [offer, setOffer] = useState<JoinOffer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('passkey');
  const [problem, setProblem] = useState<string | null>(null);
  const { state, start } = useFlow<CustomerJoinState>(failed);
  const savedName = custody.meta?.name ?? '';

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!id) {
        setLoadError('This link has no code. Open the link the shop gave you.');
        return;
      }
      try {
        const session = await readSession(id);
        if (!alive) return;
        if (!session) setLoadError('This code has expired or is wrong. Ask the shop for a new one.');
        else if (session.offer.kind !== 'join') setLoadError('This is a purchase code, not a join code.');
        else setOffer(session.offer);
      } catch (e) {
        if (alive) setLoadError(messageOf(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const shownName = name || savedName;
  const effective: Mode = custody.canPasskey ? mode : 'device';

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!offer || !id) return;
    setProblem(null);
    let clean: string;
    try {
      clean = cleanName(shownName);
    } catch (err) {
      setProblem(messageOf(err));
      return;
    }
    const kp = custody.kp ?? (custody.status === 'none' ? await custody.create(effective, { name: clean }) : await custody.unlock());
    if (!kp) return;
    if (savedName !== clean) custody.rename(clean);
    start((emit, signal) => awaitJoinRequest(kp, offer, id, clean, emit, signal));
  }

  const limit = offer ? stroops(offer.limit) : 0n;

  return (
    <Shell>
      <Work
        aside={
          offer && !state ? (
            <AsideCard title="Before you join">
              <p>The shop cannot add to your tab. Only your signature can.</p>
              <p>If a purchase would go over the limit, the network refuses it.</p>
            </AsideCard>
          ) : undefined
        }
      >
        {loadError && (
          <Notice tone="problem" data-testid="join-error">
            {loadError}
          </Notice>
        )}
        {!loadError && !offer && <p>Loading…</p>}

        {offer && !state && (
          <Slip title={`${offer.shopName} offers you a credit line`} data-testid="offer-card">
            <form onSubmit={join}>
              <p>
                Limit: <strong data-testid="offer-limit">{formatAmount(limit, offer.currency)}</strong>. You can buy on credit up to this amount and pay later.
              </p>
              <Gauge owed={0} limit={Number(limit) / 10_000_000} label={`Nothing owed yet, of a ${formatAmount(limit, offer.currency)} limit`} />
              <TextField label="Your name" data-testid="customer-name" value={shownName} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
              {custody.status === 'none' && <KeyChoice canPasskey={custody.canPasskey} mode={effective} onChange={setMode} />}
              <Button type="submit" variant="primary" data-testid="join-button" busy={custody.busy} disabled={custody.status === 'loading'}>
                {custody.busy ? 'One moment…' : custody.status === 'locked' ? 'Unlock and join' : 'Join'}
              </Button>
              {(problem ?? custody.error) && <Notice tone="problem">{problem ?? custody.error}</Notice>}
            </form>
          </Slip>
        )}

        {state?.step === 'waiting_shop' && (
          <Notice tone="pending" data-testid="join-waiting">
            Waiting for {offer?.shopName ?? 'the shop'} to prepare your credit line…
          </Notice>
        )}

        {state?.step === 'review' && offer && (
          <Slip title="Check before you sign" data-testid="review-card">
            <ul className={u.factList}>
              <li>
                {state.shopName} will open a credit line of <strong>{formatAmount(state.limit, state.currency)}</strong> for you.
              </li>
              <li>Only you can add to your tab. Every purchase needs your signature.</li>
              <li>If a purchase would go over the limit, the network refuses it.</li>
              {!state.existing && <li>Your account is created for you. The shop pays the fees; you need no money.</li>}
            </ul>
            <div className={u.actions}>
              <Button variant="primary" data-testid="sign-join" onClick={() => custody.kp && start((emit, signal) => signJoin(custody.kp!, offer, id!, state.tx, emit, signal))}>
                Sign and join
              </Button>
            </div>
          </Slip>
        )}

        {state?.step === 'sent' && (
          <Notice tone="pending" data-testid="join-sent">
            Signed. Waiting for the network…
          </Notice>
        )}

        {state?.step === 'done' && (
          <Notice tone="ok" data-testid="join-done">
            <p>
              You are in. {state.tab?.shopName ?? offer?.shopName}: {state.tab ? formatAmount(state.tab.owed, state.tab.currency) : ''} owed of{' '}
              {state.tab ? formatAmount(state.tab.limit, state.tab.currency) : ''}.
            </p>
            <Link {...buttonStyle('secondary')} href="/c">
              See my tabs
            </Link>
          </Notice>
        )}

        {state?.step === 'failed' && (
          <Notice tone="problem" data-testid="join-failed">
            {state.message}
          </Notice>
        )}
        {state?.step === 'expired' && (
          <Notice tone="problem" data-testid="join-expired">
            This code expired. Ask the shop for a new one.
          </Notice>
        )}
      </Work>
    </Shell>
  );
}
