'use client';

import { EXPLORER_TX } from '../chain/config';
import type { ShopFlowState } from '../client/flows';
import { Qr } from './Qr';
import s from './ui.module.css';

/** Renders whatever a shop-side interaction has reached: the code to show, or how it ended. */
export function FlowView({ state, onClose }: { state: ShopFlowState | null; onClose: () => void }) {
  if (!state) return null;

  if (state.step === 'link') {
    return (
      <div className={s.qrBox} data-testid="flow-waiting">
        <Qr value={state.link} />
        <a data-testid="flow-link" className={s.link} href={state.link} target="_blank" rel="noreferrer">
          {state.link}
        </a>
        <p data-testid="flow-status" role="status" className={s.muted}>
          {state.status}
        </p>
        <button type="button" className={s.ghost} onClick={onClose}>
          Cancel
        </button>
      </div>
    );
  }

  const explorer = 'hash' in state && state.hash ? `${EXPLORER_TX}${state.hash}` : null;
  const close = (
    <button type="button" className={s.ghost} onClick={onClose}>
      Close
    </button>
  );

  if (state.step === 'done') {
    return (
      <div>
        <p data-testid="flow-done" role="status" className={s.notice}>
          {state.message}{' '}
          {explorer && (
            <a href={explorer} target="_blank" rel="noreferrer" data-testid="flow-explorer">
              View on the ledger
            </a>
          )}
        </p>
        {close}
      </div>
    );
  }

  if (state.step === 'refused') {
    return (
      <div>
        <p data-testid="flow-refused" role="alert" className={s.problem}>
          {state.message}{' '}
          {explorer && (
            <a href={explorer} target="_blank" rel="noreferrer" data-testid="flow-explorer">
              Look it up on the ledger
            </a>
          )}
        </p>
        {close}
      </div>
    );
  }

  if (state.step === 'expired') {
    return (
      <div>
        <p data-testid="flow-expired" role="alert" className={s.problem}>
          This code expired before it was used. Nothing was changed. Start again.
        </p>
        {close}
      </div>
    );
  }

  return (
    <div>
      <p data-testid="flow-failed" role="alert" className={s.problem}>
        {state.message}
      </p>
      {close}
    </div>
  );
}
