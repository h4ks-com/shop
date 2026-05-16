// Process-local idempotency window. Survives within one Node process; lost on
// restart, not shared across replicas. Adequate for our single-container shop.
//
// claim() atomically marks a key. forget() releases the mark — used to allow
// upstream retries (e.g. Stripe webhook retries) after a transient failure.

export type Dedup = {
  claim: (key: string) => boolean;
  forget: (key: string) => void;
};

export function makeDedup(ttlMs: number): Dedup {
  const seen = new Map<string, number>();

  const sweep = (now: number): void => {
    for (const [k, t] of seen) if (now - t > ttlMs) seen.delete(k);
  };

  return {
    claim(key: string): boolean {
      const now = Date.now();
      sweep(now);
      if (seen.has(key)) return false;
      seen.set(key, now);
      return true;
    },
    forget(key: string): void {
      seen.delete(key);
    },
  };
}
