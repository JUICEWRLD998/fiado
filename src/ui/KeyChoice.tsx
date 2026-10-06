'use client';

import type { Mode } from '../passkey/custody';
import s from './screens.module.css';

/** The honest choice between a passkey and a key kept in this browser, with what each one means. */
export function KeyChoice({ canPasskey, mode, onChange }: { canPasskey: boolean; mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <fieldset className={s.choices}>
      <legend>How should your key be kept?</legend>
      <label className={s.choice}>
        <input type="radio" name="keymode" data-testid="mode-passkey" checked={mode === 'passkey'} disabled={!canPasskey} onChange={() => onChange('passkey')} />
        <span>
          <strong>Passkey (recommended)</strong>
          Unlocked by your fingerprint, face or screen lock. Nothing to write down.
          {!canPasskey && ' Not available on this browser.'}
        </span>
      </label>
      <label className={s.choice}>
        <input type="radio" name="keymode" data-testid="mode-device" checked={mode === 'device'} onChange={() => onChange('device')} />
        <span>
          <strong>Key in this browser</strong>
          Simple, but clearing the browser data loses it.
        </span>
      </label>
    </fieldset>
  );
}
