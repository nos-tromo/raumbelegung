import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Two-step confirmation: the first click arms an item for `ms`,
 * a second click within that time confirms it.
 */
export function useArmed(ms = 4000) {
  const [armed, setArmed] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const click = useCallback(
    (key: string, onConfirm: () => void) => {
      window.clearTimeout(timer.current);
      if (armed === key) {
        setArmed(null);
        onConfirm();
        return;
      }
      setArmed(key);
      timer.current = window.setTimeout(() => setArmed(null), ms);
    },
    [armed, ms],
  );

  return { armed, click };
}
