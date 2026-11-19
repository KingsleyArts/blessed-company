// Query-string options for testing (the Unreal tol.* console variables): ?seed=N&floor=N&priest=1&mult=1.3&cast=0&test=1&reset=1.
export interface Params {
  seed: number;
  /** tol.NextRun start floor (1 = normal). */
  floor: number;
  priest: boolean;
  enemyMult: number;
  castTimes: boolean;
  /** Testing build: 10x speed step and the tuning menu while paused. On by default in the dev server. */
  testing: boolean;
  /** Wipe the saved progress on load. */
  reset: boolean;
}

export function readParams(search: string, dev = import.meta.env.DEV): Params {
  const q = new URLSearchParams(search);
  const num = (k: string, def: number): number => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? v : def;
  };
  const flag = (k: string, def: boolean): boolean => (q.has(k) ? q.get(k) !== '0' && q.get(k) !== 'false' : def);
  return {
    seed: Math.max(0, Math.trunc(num('seed', 0))),
    floor: Math.max(1, Math.trunc(num('floor', 1))),
    priest: flag('priest', false),
    enemyMult: Math.max(0.1, num('mult', 1.3)),
    castTimes: flag('cast', true),
    testing: flag('test', dev),
    reset: flag('reset', false),
  };
}
