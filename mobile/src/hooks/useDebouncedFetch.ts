import { useRef, useCallback } from 'react';

/**
 * Returns a debounced fetch function that won't fire if called within `cooldownMs`
 * of the last successful call. Useful for screen focus listeners.
 */
export function useDebouncedFetch(
  fetchFn: () => Promise<void> | void,
  cooldownMs: number = 3000
) {
  const lastFetchRef = useRef<number>(0);

  const debouncedFetch = useCallback(() => {
    const now = Date.now();
    if (now - lastFetchRef.current < cooldownMs) return;
    lastFetchRef.current = now;
    fetchFn();
  }, [fetchFn, cooldownMs]);

  return debouncedFetch;
}
