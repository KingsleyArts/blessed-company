// MiracleGauge.h port: the goddess's Miracle Gauge. Not a currency: fills from party combat actions, spent on manual miracles,
// lives and dies with one expedition. Fill is per EVENT (a party hit, a party heal), never per damage point. PLACEHOLDER numbers.

export enum MiracleKind { DivineHealing, DivineShield, DivineSmite }
export enum MiracleResult { Cast, FightNotRunning, NotEnoughGauge, NoTarget }

export const miracleName = (k: MiracleKind): string =>
  k === MiracleKind.DivineHealing ? 'Divine Healing' : k === MiracleKind.DivineShield ? 'Divine Shield' : 'Divine Smite';
export const miracleTargetsEnemy = (k: MiracleKind): boolean => k === MiracleKind.DivineSmite;
export const miracleResultName = (r: MiracleResult): string => MiracleResult[r] ?? '?';

export interface MiracleConfig {
  capacity: number;
  fillPerHit: number;
  fillPerHeal: number;
  healingCost: number;
  healingFractionOfMax: number;
  shieldCost: number;
  shieldSeconds: number;
  smiteCost: number;
  smiteFractionOfMax: number;
  smiteRadius: number;
}

export const defaultMiracleConfig = (): MiracleConfig => ({
  capacity: 100,
  fillPerHit: 0.2,
  fillPerHeal: 0,
  healingCost: 50,
  healingFractionOfMax: 0.4,
  shieldCost: 30,
  shieldSeconds: 5,
  smiteCost: 60,
  smiteFractionOfMax: 0.3,
  smiteRadius: 300,
});

export class MiracleGauge {
  private cfg: MiracleConfig;
  private v = 0;
  constructor(cfg: MiracleConfig = defaultMiracleConfig()) {
    this.cfg = { ...cfg };
  }
  value(): number { return this.v; }
  capacity(): number { return this.cfg.capacity; }
  fraction(): number { return this.cfg.capacity > 0 ? this.v / this.cfg.capacity : 0; }
  config(): Readonly<MiracleConfig> { return this.cfg; }
  /** The tuning menu. */
  mutableConfig(): MiracleConfig { return this.cfg; }
  reset(): void { this.v = 0; }
  /** A resumed run (save slots, Nov 19): put the gauge back where it was, kept inside 0..capacity. */
  restore(v: number): void { this.v = Number.isFinite(v) ? Math.min(this.cfg.capacity, Math.max(0, v)) : 0; }
  addHit(): void { this.add(this.cfg.fillPerHit); }
  addHeal(): void { this.add(this.cfg.fillPerHeal); }
  add(amount: number): void { if (amount > 0) this.v = Math.min(this.cfg.capacity, this.v + amount); }
  cost(k: MiracleKind): number {
    return k === MiracleKind.DivineHealing ? this.cfg.healingCost : k === MiracleKind.DivineShield ? this.cfg.shieldCost : this.cfg.smiteCost;
  }
  canAfford(k: MiracleKind): boolean { return this.v + 1e-9 >= this.cost(k); }
  /** Spends the cost; false (and nothing spent) when the gauge is short. */
  spend(k: MiracleKind): boolean {
    if (!this.canAfford(k)) return false;
    this.v = Math.max(0, this.v - this.cost(k));
    return true;
  }
}
