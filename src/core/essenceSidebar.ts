// EssenceSidebar port (Core/EssenceSidebar.h): the in-run Essence upgrades, ranks per (character, stat).
// Cost of the next rank = floor(baseCost * (1 + growth)^rank + 0.5), at least 1. Ranks apply as ModSource.Essence modifiers.
import { EssenceConfig, defaultEssenceConfig, type EssenceStatDef } from './essenceConfig';
import { ModSource, type StatResolver } from './statResolver';

export const kBuyMax = -1;

export enum BuyRefusal { None, NoCharacter, UnknownStat, NotAllowedForClass, StatLocked, MaxRank, NotEnoughEssence, BadAmount }

export function buyRefusalText(r: BuyRefusal): string {
  switch (r) {
    case BuyRefusal.None: return '';
    case BuyRefusal.NoCharacter: return 'No such character';
    case BuyRefusal.UnknownStat: return 'Unknown stat';
    case BuyRefusal.NotAllowedForClass: return 'Not available for this class';
    case BuyRefusal.StatLocked: return 'Locked: unlock it at the Temple first';
    case BuyRefusal.MaxRank: return 'Max rank reached';
    case BuyRefusal.NotEnoughEssence: return 'Not enough Essence';
    case BuyRefusal.BadAmount: return 'Bad amount';
  }
  return '';
}

export interface BuyResult {
  bought: number;
  spent: number;
  newRank: number;
  refusal: BuyRefusal;
  reason: string;
}

export interface SidebarRow {
  stat: string;
  tier: number;
  rank: number;
  maxRank: number;
  nextCost: number;
  currentBonus: number;
  nextBonus: number;
  showValue: boolean;
  templeRanks: number;
  unit: string;
  unlocked: boolean;
  canBuy: boolean;
  refusal: BuyRefusal;
  reason: string;
}

interface Character {
  className: string;
  ranks: Map<string, number>;
}

export class EssenceSidebar {
  private cfg: EssenceConfig;
  private chars: Character[] = [];
  private unlocked = new Set<string>();
  private classAllowed = new Map<string, string[]>();
  private templeLevels = new Map<string, number>();

  constructor(cfg: EssenceConfig = defaultEssenceConfig()) {
    this.cfg = cfg;
    this.refreshDefaultUnlocks();
  }

  // ---- setup ----
  reset(party: readonly string[] = []): void {
    this.chars = [];
    for (const c of party) this.addCharacter(c);
  }
  /** Each character's bought ranks, for a run save (save slots, Nov 19). */
  exportRanks(): { className: string; ranks: [string, number][] }[] {
    return this.chars.map((c) => ({ className: c.className, ranks: [...c.ranks.entries()] }));
  }
  /** Restores exportRanks() output: the characters and their ranks replace the current ones. */
  importRanks(list: readonly { className: string; ranks: readonly (readonly [string, number])[] }[]): void {
    this.chars = list.map((c) => ({ className: c.className, ranks: new Map(c.ranks.map(([k, v]) => [k, v] as [string, number])) }));
  }
  addCharacter(className: string): number {
    this.chars.push({ className, ranks: new Map() });
    return this.chars.length - 1;
  }
  setUnlockedStats(names: readonly string[]): void {
    this.unlocked.clear();
    this.refreshDefaultUnlocks();
    for (const n of names) this.unlocked.add(n);
  }
  setTempleLevels(ranks: ReadonlyMap<string, number>): void {
    this.templeLevels = new Map(ranks);
  }
  templeRanks(stat: string): number {
    const d = this.cfg.find(stat);
    const v = this.templeLevels.get(stat);
    return d && v !== undefined && v > 0 ? Math.min(v, d.maxRank) : 0;
  }
  setClassAllowedStats(allowed: ReadonlyMap<string, string[]>): void {
    this.classAllowed = new Map(allowed);
  }

  // ---- queries ----
  config(): EssenceConfig { return this.cfg; }
  characterCount(): number { return this.chars.length; }
  className(ch: number): string { return this.chars[ch].className; }
  hasCharacter(ch: number): boolean { return ch >= 0 && ch < this.chars.length; }
  rank(ch: number, stat: string): number {
    if (!this.hasCharacter(ch)) return 0;
    const own = this.chars[ch].ranks.get(stat) ?? 0;
    const d = this.cfg.find(stat);
    const total = this.templeRanks(stat) + own;
    return d ? Math.min(total, d.maxRank) : total;
  }
  totalRanks(): number {
    let n = 0;
    for (const c of this.chars) for (const v of c.ranks.values()) n += v;
    return n;
  }
  isUnlocked(stat: string): boolean { return this.unlocked.has(stat); }

  static rankCost(d: EssenceStatDef, rank: number): number {
    const c = Math.floor(d.baseCost * Math.pow(1.0 + d.growth, rank) + 0.5);
    return c < 1.0 ? 1 : c > 2.0e9 ? 2000000000 : Math.trunc(c);
  }
  nextCost(ch: number, stat: string): number {
    const d = this.cfg.find(stat);
    if (!d || !this.hasCharacter(ch) || this.rank(ch, stat) >= d.maxRank) return 0;
    return EssenceSidebar.rankCost(d, this.rank(ch, stat));
  }
  availability(ch: number, stat: string): BuyRefusal {
    if (!this.hasCharacter(ch)) return BuyRefusal.NoCharacter;
    const d = this.cfg.find(stat);
    if (!d) return BuyRefusal.UnknownStat;
    const cls = this.chars[ch].className;
    if (d.classes.length > 0 && !d.classes.includes(cls)) return BuyRefusal.NotAllowedForClass;
    const allowed = this.classAllowed.get(cls);
    if (allowed !== undefined && !allowed.includes(stat)) return BuyRefusal.NotAllowedForClass;
    if (!this.isUnlocked(stat)) return BuyRefusal.StatLocked;
    return BuyRefusal.None;
  }

  preview(ch: number, stat: string, amount: number, essence: number): BuyResult {
    return this.plan(ch, stat, amount, essence);
  }

  rows(ch: number, essence: number): SidebarRow[] {
    const rows: SidebarRow[] = [];
    if (!this.hasCharacter(ch)) return rows;
    for (const d of this.cfg.stats) {
      const av = this.availability(ch, d.name);
      if (av === BuyRefusal.NotAllowedForClass) continue;
      const rank = this.rank(ch, d.name);
      const p = this.plan(ch, d.name, 1, essence);
      rows.push({
        stat: d.name, tier: d.tier, unit: d.unit, rank, maxRank: d.maxRank, nextCost: this.nextCost(ch, d.name),
        showValue: d.showValue, templeRanks: this.templeRanks(d.name), currentBonus: rank * d.bonusPerRank,
        nextBonus: Math.min(rank + 1, d.maxRank) * d.bonusPerRank, unlocked: av !== BuyRefusal.StatLocked,
        canBuy: p.bought > 0, refusal: p.refusal, reason: p.reason,
      });
    }
    return rows;
  }

  // ---- purchase ----
  /** Spends from essence.value (the run's Essence). amount: 1, 10, 100 or kBuyMax. */
  buy(ch: number, stat: string, amount: number, essence: { value: number }): BuyResult {
    const r = this.plan(ch, stat, amount, essence.value);
    if (r.bought > 0) {
      essence.value -= r.spent;
      this.chars[ch].ranks.set(stat, r.newRank - this.templeRanks(stat));
    }
    return r;
  }

  // ---- stat application ----
  applyTo(ch: number, r: StatResolver): void {
    r.removeBySource(ModSource.Essence);
    if (!this.hasCharacter(ch)) return;
    for (const d of this.cfg.stats) {
      if (this.availability(ch, d.name) === BuyRefusal.NotAllowedForClass) continue;
      const rank = this.rank(ch, d.name);
      if (rank > 0) r.addModifier(d.stat, d.kind, rank * d.bonusPerRank, ModSource.Essence);
    }
  }

  private refreshDefaultUnlocks(): void {
    for (const d of this.cfg.stats) if (d.tier === 0) this.unlocked.add(d.name);
  }

  private plan(ch: number, stat: string, amount: number, essence: number): BuyResult {
    const r: BuyResult = { bought: 0, spent: 0, newRank: 0, refusal: BuyRefusal.None, reason: '' };
    const refuse = (why: BuyRefusal): BuyResult => {
      r.refusal = why;
      r.reason = buyRefusalText(why);
      return r;
    };
    if (amount !== kBuyMax && amount < 1) return refuse(BuyRefusal.BadAmount);
    const av = this.availability(ch, stat);
    if (av !== BuyRefusal.None) return refuse(av);
    const d = this.cfg.find(stat)!;
    r.newRank = this.rank(ch, stat);
    if (r.newRank >= d.maxRank) return refuse(BuyRefusal.MaxRank);
    let left = essence;
    while (r.newRank < d.maxRank && (amount === kBuyMax || r.bought < amount)) {
      const cost = EssenceSidebar.rankCost(d, r.newRank);
      if (cost > left) break;
      left -= cost;
      r.spent += cost;
      ++r.bought;
      ++r.newRank;
    }
    if (r.bought === 0) return refuse(BuyRefusal.NotEnoughEssence);
    return r;
  }
}
