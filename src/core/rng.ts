// splitmix64, ported exactly from FloorGenerator.cpp (Rng) and CombatSupport.h (CombatRng) using BigInt,
// so equal seeds give identical sequences to the Unreal build. Pure rules code: no Phaser imports.

const MASK = (1n << 64n) - 1n;
const GAMMA = 0x9e3779b97f4a7c15n;
const M1 = 0xbf58476d1ce4e5b9n;
const M2 = 0x94d049bb133111ebn;
const TWO_POW_53_INV = 1 / 9007199254740992;

export function u64(v: bigint | number): bigint {
  return BigInt.asUintN(64, BigInt(v));
}

export class Rng {
  private state: bigint;
  constructor(seed: bigint | number) {
    this.state = u64(seed);
  }

  /** The generator's state; `new Rng(getState())` continues the same sequence (run saves). */
  getState(): bigint { return this.state; }

  nextU64(): bigint {
    this.state = (this.state + GAMMA) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * M1) & MASK;
    z = ((z ^ (z >> 27n)) * M2) & MASK;
    return z ^ (z >> 31n);
  }

  /** Inclusive [lo, hi]. Returns lo if hi <= lo. */
  nextInt(lo: number, hi: number): number {
    if (hi <= lo) return lo;
    const span = BigInt(hi) - BigInt(lo) + 1n;
    return lo + Number(this.nextU64() % span);
  }

  /** [0, 1) from the top 53 bits. */
  nextDouble(): number {
    return Number(this.nextU64() >> 11n) * TWO_POW_53_INV;
  }

  chance(p: number): boolean {
    return this.nextDouble() < p;
  }

  /** Index chosen proportionally to weights; falls back to 0 if all weights <= 0. */
  pickWeighted(weights: ArrayLike<number>, n: number = weights.length): number {
    let total = 0;
    for (let i = 0; i < n; i++) if (weights[i] > 0) total += weights[i];
    if (total <= 0) return 0;
    const r = this.nextDouble() * total;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      if (weights[i] <= 0) continue;
      acc += weights[i];
      if (r < acc) return i;
    }
    for (let i = n - 1; i >= 0; i--) if (weights[i] > 0) return i;
    return 0;
  }
}

/** Map-stream seed for one floor, derived from (runSeed + floorNumber * odd constant). */
export function floorSeed(runSeed: bigint | number, floorNumber: number): bigint {
  const mixer = new Rng(u64(runSeed) + u64(floorNumber) * 0xd1b54a32d192ed03n);
  mixer.nextU64();
  return mixer.nextU64();
}

/** Combat's own random stream (CombatSupport.h CombatRng). Same algorithm, different call shapes. */
export class CombatRng {
  private rng: Rng;
  constructor(seed: bigint | number = 1) {
    this.rng = new Rng(seed);
  }
  nextU64(): bigint {
    return this.rng.nextU64();
  }
  nextDouble(): number {
    return this.rng.nextDouble();
  }
  /** [0, n); 0 when n <= 1. */
  nextInt(n: number): number {
    return n <= 1 ? 0 : Number(this.rng.nextU64() % BigInt(n));
  }
  chance(p: number): boolean {
    return p > 0 && this.rng.nextDouble() < p;
  }
}
