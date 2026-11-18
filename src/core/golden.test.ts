// Parity with the C++ build: fixtures in spec-tests/core are produced by tools/golden/dump_golden.cpp from the Unreal reference.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate, makeConfig, scalingMultiplier, type Config } from './floorGenerator';
import { canonicalFloor, floorHash } from './goldenFloor';
import { Rng, floorSeed } from './rng';

const load = <T>(name: string): T => JSON.parse(readFileSync(`spec-tests/core/${name}`, 'utf8')) as T;

interface RngFx {
  seed: string; u64: string[]; nextInt3_17: number[]; nextDouble: number[]; chance03: boolean[]; pickWeighted: number[];
  floorSeeds_m2_0_1_10_30: string[];
}
interface Digest {
  seed: number; floor: number; hasPriest: boolean; floorSeed: string; hash: string; nodes: number; totalEnemies: number;
  killQuota: number; roomRoll: number; scaling: number; variant?: string;
}

describe('golden: Rng matches the C++ splitmix64', () => {
  for (const fx of load<RngFx[]>('rng.json')) {
    it(`seed ${fx.seed}`, () => {
      const seed = BigInt(fx.seed);
      const a = new Rng(seed);
      expect(fx.u64.map(() => a.nextU64().toString())).toEqual(fx.u64);
      const b = new Rng(seed);
      expect(fx.nextInt3_17.map(() => b.nextInt(3, 17))).toEqual(fx.nextInt3_17);
      const c = new Rng(seed);
      expect(fx.nextDouble.map(() => c.nextDouble())).toEqual(fx.nextDouble); // exact doubles
      const d = new Rng(seed);
      expect(fx.pickWeighted.map(() => d.pickWeighted([40, 20, 25, 15], 4))).toEqual(fx.pickWeighted);
      const e = new Rng(seed);
      expect(fx.chance03.map(() => e.chance(0.3))).toEqual(fx.chance03);
      expect([-2, 0, 1, 10, 30].map((f) => floorSeed(seed, f).toString())).toEqual(fx.floorSeeds_m2_0_1_10_30);
    });
  }
});

const check = (d: Digest, cfg: Config): void => {
  const f = generate(d.seed, d.floor, { ...cfg, hasPriest: d.hasPriest });
  const where = `seed ${d.seed} floor ${d.floor} priest ${d.hasPriest} ${d.variant ?? ''}`;
  expect(f.seed.toString(), where).toBe(d.floorSeed);
  expect(floorHash(f), where).toBe(d.hash);
  expect([f.nodes.length, f.totalEnemies, f.killQuota, f.roomRoll], where).toEqual([d.nodes, d.totalEnemies, d.killQuota, d.roomRoll]);
  expect(f.scaling, where).toBe(d.scaling);
};

describe('golden: floors match the C++ generator', () => {
  it('seeds 1-200, floors 1-10, both Priest flags (4000 floors)', () => {
    const rows = load<Digest[]>('floors-digest.json');
    expect(rows.length).toBe(4000);
    for (const d of rows) check(d, makeConfig());
  });

  it('config variants (fallback layout, boss interval 5, clamped roll, no rescue/tutorial, quota/elite values)', () => {
    const variants: Record<string, Partial<Config>> = {
      fallback: { layoutAttempts: 0 },
      boss5: { bossInterval: 5 },
      hugeRoll: { roomCountMin: 100, roomCountMax: 100 },
      noRescueNoTutorial: { rescueFloor: 0, tutorialFloor: 0 },
      quotaElite: { killQuotaFraction: 0.5, eliteMinFloor: 1, eliteMaxFraction: 0.1 },
      tutorialEqRescue: { tutorialFloor: 2 },
      tutorialCrystalAnywhere: { tutorialCrystalMaxDistance: 0 },
    };
    const rows = load<Digest[]>('floors-variants.json');
    expect(new Set(rows.map((r) => r.variant))).toEqual(new Set(Object.keys(variants)));
    for (const d of rows) check(d, makeConfig(variants[d.variant!]));
  });

  it('deeper floors 11-30 (seeds 1-50) and scaling for floors 0-60 match exactly', () => {
    const rows = load<Digest[]>('floors-deep.json');
    expect(rows.length).toBe(1000);
    for (const d of rows) check(d, makeConfig());
    const scaling = load<number[]>('scaling.json');
    expect(scaling.map((_, fl) => scalingMultiplier(fl))).toEqual(scaling); // exact doubles (V8 Math.pow vs MSVC pow)
  });

  it('full canonical strings (seeds 1-3) match, for readable diffs when a hash differs', () => {
    const rows = load<{ seed: number; floor: number; hasPriest: boolean; canonical: string }[]>('floors-full.json');
    for (const r of rows) {
      expect(canonicalFloor(generate(r.seed, r.floor, makeConfig({ hasPriest: r.hasPriest })))).toBe(r.canonical);
    }
  });
});
