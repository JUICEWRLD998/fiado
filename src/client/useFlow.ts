'use client';

// Runs one interaction at a time and exposes the latest state it emitted. Starting a new one, or
// leaving the screen, cancels the old one, so a stale poll can never write into a newer screen.

import { useCallback, useEffect, useRef, useState } from 'react';
import { messageOf } from './flows';

export function useFlow<S extends { step: string }>(onError: (message: string) => S) {
  const [state, setState] = useState<S | null>(null);
  const controller = useRef<AbortController | null>(null);

  const start = useCallback(
    (run: (emit: (s: S) => void, signal: AbortSignal) => Promise<void>) => {
      controller.current?.abort();
      const c = new AbortController();
      controller.current = c;
      setState(null);
      const emit = (s: S) => {
        if (!c.signal.aborted) setState(s);
      };
      run(emit, c.signal).catch((e: unknown) => emit(onError(messageOf(e))));
    },
    [onError],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState(null);
  }, []);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  return { state, start, cancel };
}
