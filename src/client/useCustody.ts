'use client';

// React state for "which key does this device hold, and is it unlocked".

import type { Keypair } from '@stellar/stellar-sdk';
import { useCallback, useEffect, useState } from 'react';
import { createKey, forget, readMeta, saveName, unlock, type KeyExtras, type Meta, type Mode } from '../passkey/custody';
import type { Role } from '../passkey/derive';
import { passkeysAvailable } from '../passkey/webauthn';

export type CustodyStatus = 'loading' | 'none' | 'locked' | 'ready';

export type Custody = {
  status: CustodyStatus;
  meta: Meta | null;
  kp: Keypair | null;
  busy: boolean;
  error: string | null;
  canPasskey: boolean;
  create: (mode: Mode, extras?: KeyExtras) => Promise<Keypair | null>;
  unlock: () => Promise<Keypair | null>;
  rename: (name: string) => void;
  forget: () => void;
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useCustody(role: Role): Custody {
  const [status, setStatus] = useState<CustodyStatus>('loading');
  const [meta, setMeta] = useState<Meta | null>(null);
  const [kp, setKp] = useState<Keypair | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canPasskey, setCanPasskey] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const m = readMeta(role);
      let key: Keypair | null = null;
      if (m?.mode === 'device') {
        try {
          key = await unlock(role); // a device key needs no gesture
        } catch (e) {
          if (alive) setError(messageOf(e));
        }
      }
      if (!alive) return;
      setCanPasskey(passkeysAvailable());
      setMeta(m);
      setKp(key);
      setStatus(!m ? 'none' : key ? 'ready' : 'locked');
    })();
    return () => {
      alive = false;
    };
  }, [role]);

  const run = useCallback(async (job: () => Promise<Keypair>): Promise<Keypair | null> => {
    setBusy(true);
    setError(null);
    try {
      const key = await job();
      setKp(key);
      setMeta(readMeta(role));
      setStatus('ready');
      return key;
    } catch (e) {
      setError(messageOf(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [role]);

  return {
    status,
    meta,
    kp,
    busy,
    error,
    canPasskey,
    create: (mode, extras) => run(() => createKey(role, mode, extras)),
    unlock: () => run(() => unlock(role)),
    rename: (name) => {
      saveName(role, name);
      setMeta(readMeta(role));
    },
    forget: () => {
      forget(role);
      setKp(null);
      setMeta(null);
      setStatus('none');
    },
  };
}
