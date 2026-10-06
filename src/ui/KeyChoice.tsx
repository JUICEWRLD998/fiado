'use client';

import type { Mode } from '../passkey/custody';
import s from './ui.module.css';

/** The honest choice between a passkey and a key kept in this browser, with what each one means. */
export function KeyChoice({ canPasskey, mode, onChange }: { canPasskey: boolean; mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '0 0 16px' }}>
      <legend className={s.legend}>How should your key be kept?</legend>
      <label className={s.choice}>
        <input type="radio" name="keymode" data-testid="mode-passkey" checked={mode === 'passkey'} disabled={!canPasskey} onChange={() => onChange('passkey')} />
        <span>
          <strong>Passkey</strong> (recommended). Unlocked by your fingerprint, face or screen lock; nothing to write down.
          {!canPasskey && <em> Not available on this browser.</em>}
        </span>
      </label>
      <label className={s.choice}>
        <input type="radio" name="keymode" data-testid="mode-device" checked={mode === 'device'} onChange={() => onChange('device')} />
        <span>
          <strong>Key in this browser.</strong> Simple, but clearing the browser data loses it.
        </span>
      </label>
    </fieldset>
  );
}
