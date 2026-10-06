'use client';

import { EXPLORER_TX } from '../chain/config';
import type { ShopFlowState } from '../client/flows';
import { formatAmount } from '../client/format';
import { Button } from './Button';
import { Notice } from './Notice';
import { Qr } from './Qr';
import { RecordFacts } from './RecordFacts';
import { RefusalMoment } from './RefusalMoment';
import s from './screens.module.css';

/** What the refused purchase was up against: shown as the gauge in the signature moment. */
export type RefusalContext = { owed: bigint; limit: bigint; attempt: bigint; currency: string };

/** Renders whatever a shop-side interaction has reached: the code to show, a decision to make, or how it ended. */
export function FlowView({ state, onClose, refusal }: { state: ShopFlowState | null; onClose: () => void; refusal?: RefusalContext }) {
  if (!state) return null;

  if (state.step === 'link') {
    return (
      <div className={s.qr} data-testid="flow-waiting">
        <Qr value={state.link} />
        <a data-testid="flow-link" className={s.qrLink} href={state.link} target="_blank" rel="noreferrer">
          {state.link}
        </a>
        <Notice tone="pending" data-testid="flow-status">
          {state.status}
        </Notice>
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
      </div>
    );
  }

  if (state.step === 'review_customer') {
    return (
      <div data-testid="review-customer" className={s.stack}>
        <h3 className={s.name}>{state.name} wants a credit line</h3>
        <p className={s.meta}>
          {state.existing ? 'They already use Fiado. Their record, read from the public ledger:' : 'This is their first time on Fiado.'}
        </p>
        {state.record && <RecordFacts record={state.record} shops={state.shops} />}
        <div className={s.actions}>
          <Button variant="primary" data-testid="approve-customer" onClick={state.approve}>
            Open their line
          </Button>
          <Button variant="quiet" data-testid="decline-customer" onClick={state.decline}>
            Not now
          </Button>
        </div>
      </div>
    );
  }

  const explorer = 'hash' in state && state.hash ? `${EXPLORER_TX}${state.hash}` : null;
  const close = (
    <Button variant="quiet" onClick={onClose}>
      Close
    </Button>
  );

  if (state.step === 'done') {
    return (
      <div>
        <Notice tone="ok" data-testid="flow-done">
          {state.message}{' '}
          {explorer && (
            <a href={explorer} target="_blank" rel="noreferrer" data-testid="flow-explorer">
              View on the ledger
            </a>
          )}
        </Notice>
        {close}
      </div>
    );
  }

  if (state.step === 'refused') {
    const link = explorer && (
      <>
        {' '}
        <a href={explorer} target="_blank" rel="noreferrer" data-testid="flow-explorer">
          Look it up on the ledger
        </a>
      </>
    );
    // the signature moment, when we know the numbers: the over-limit refusal, shown on the gauge
    if (state.overLimit && refusal) {
      const num = (n: bigint) => Number(n) / 10_000_000;
      const room = refusal.limit > refusal.owed ? refusal.limit - refusal.owed : 0n;
      const over = refusal.attempt > room ? refusal.attempt - room : 0n;
      return (
        <div data-testid="flow-refused" className={s.stack}>
          <RefusalMoment
            owed={num(refusal.owed)}
            limit={num(refusal.limit)}
            attempt={num(refusal.attempt)}
            label={`${formatAmount(refusal.owed, refusal.currency)} owed of a ${formatAmount(refusal.limit, refusal.currency)} limit. A purchase of ${formatAmount(refusal.attempt, refusal.currency)} was refused.`}
            figures={`Owed ${formatAmount(refusal.owed, refusal.currency)} · limit ${formatAmount(refusal.limit, refusal.currency)} · tried ${formatAmount(refusal.attempt, refusal.currency)}, ${formatAmount(over, refusal.currency)} over`}
            sentence={state.message}
          >
            {link}
          </RefusalMoment>
          {close}
        </div>
      );
    }
    return (
      <div>
        <Notice tone="problem" data-testid="flow-refused">
          {state.message}
          {link}
        </Notice>
        {close}
      </div>
    );
  }

  if (state.step === 'expired') {
    return (
      <div>
        <Notice tone="problem" data-testid="flow-expired">
          This code expired before it was used. Nothing was changed. Start again.
        </Notice>
        {close}
      </div>
    );
  }

  return (
    <div>
      <Notice tone="problem" data-testid="flow-failed">
        {state.message}
      </Notice>
      {close}
    </div>
  );
}
