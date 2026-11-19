// Temple port (Core/Temple.h): the permanent upgrade shop between runs. Spends MetaSave.gold (shown as Faith) on gear levels,
// stat unlocks, permanent stat ranks and Party Luck. Pure functions over a MetaSave; the caller saves after a purchase.
import { lround } from './cstd';
import type { EssenceStatDef } from './essenceConfig';
import { EssenceSidebar, kBuyMax } from './essenceSidebar';
import type { MetaSave } from './metaSave';

export enum GearSlot { Weapon = 0, Armor = 1 }
export const kGearSlotCount = 2;
export const kGearMaxTempleLevel = 5;

export const gearSlotName = (s: GearSlot): string => (s === GearSlot.Weapon ? 'Weapon' : 'Armor');
export const gearKey = (className: string, s: GearSlot): string => `${className}.${gearSlotName(s)}`;

export interface TempleConfig {
  gearCosts: number[];
  gearBonusPerLevel: number;
  statUnlockCost: number;
  unlockableStats: string[];
  partyLuckMaxRank: number;
  partyLuckBonusPerRank: number;
  partyLuckBaseCost: number;
  partyLuckGrowth: number;
}

export function defaultTempleConfig(): TempleConfig {
  return {
    gearCosts: [150, 300, 600, 1200, 2400],
    gearBonusPerLevel: 0.1,
    statUnlockCost: 300,
    unlockableStats: ['DefensePct', 'CritChance', 'CritFactor', 'HealthRegen', 'CooldownReduction', 'Range', 'HealPower', 'SpiritDamage', 'SpiritDuration'],
    partyLuckMaxRank: 10,
    partyLuckBonusPerRank: 0.1,
    partyLuckBaseCost: 40,
    partyLuckGrowth: 0.4,
  };
}

export const partyLuckNames: readonly string[] = ['EssencePerKill', 'EssencePerRoom', 'GoldPerKill', 'GoldPerRoom'];

export interface TempleBuy {
  ok: boolean;
  cost: number;
  reason: string;
}

const refuse = (why: string): TempleBuy => ({ ok: false, cost: 0, reason: why });
const bought = (cost: number): TempleBuy => ({ ok: true, cost, reason: '' });

export function gearTempleLevel(m: MetaSave, className: string, s: GearSlot): number {
  return Math.max(0, m.gearLevels.get(gearKey(className, s)) ?? 0);
}

/** Cost of the next Temple level of a slot at `level`; -1 at the cap. */
export function gearNextCost(c: TempleConfig, level: number): number {
  if (level < 0) level = 0;
  return level >= kGearMaxTempleLevel ? -1 : c.gearCosts[level];
}

export function buyGear(m: MetaSave, className: string, s: GearSlot, c: TempleConfig = defaultTempleConfig()): TempleBuy {
  if (className === '') return refuse('no such class');
  const level = gearTempleLevel(m, className, s);
  const cost = gearNextCost(c, level);
  if (cost < 0) return refuse('already at the highest Temple level');
  if (m.gold < cost) return refuse('not enough Faith');
  m.gold -= cost;
  m.gearLevels.set(gearKey(className, s), level + 1);
  return bought(cost);
}

export function statTempleLevel(m: MetaSave, stat: string): number {
  return Math.max(0, m.statLevels.get(stat) ?? 0);
}

/** The sidebar's cost of that rank times templeCostMult; -1 at the max rank. */
export function statNextCost(d: EssenceStatDef, rank: number): number {
  if (rank < 0) rank = 0;
  if (rank >= d.maxRank) return -1;
  return Math.max(1, Math.trunc(lround(EssenceSidebar.rankCost(d, rank) * d.templeCostMult)));
}

export const statUnlocked = (m: MetaSave, stat: string): boolean => m.unlockedStats.includes(stat);

export function buyStatUnlock(m: MetaSave, stat: string, c: TempleConfig = defaultTempleConfig()): TempleBuy {
  if (!c.unlockableStats.includes(stat)) return refuse('that stat cannot be unlocked');
  if (statUnlocked(m, stat)) return refuse('already unlocked');
  if (m.gold < c.statUnlockCost) return refuse('not enough Faith');
  m.gold -= c.statUnlockCost;
  m.unlockedStats.push(stat);
  return bought(c.statUnlockCost);
}

/** Buys `amount` permanent ranks (1, 10, 100 or kBuyMax), as many as the Faith affords. The caller checks the unlock. */
export function buyStatRanks(m: MetaSave, d: EssenceStatDef, amount: number): TempleBuy {
  let rank = statTempleLevel(m, d.name);
  if (rank >= d.maxRank) return refuse('already at the highest rank');
  let left = m.gold;
  let spent = 0;
  let n = 0;
  while (rank < d.maxRank && (amount === kBuyMax || n < amount)) {
    const cost = statNextCost(d, rank);
    if (cost < 0 || cost > left) break;
    left -= cost;
    spent += cost;
    ++n;
    ++rank;
  }
  if (n === 0) return refuse('not enough Faith');
  m.gold -= spent;
  m.statLevels.set(d.name, rank);
  return bought(spent);
}

export function partyLuckRank(m: MetaSave, name: string): number {
  return Math.max(0, m.partyLuck.get(name) ?? 0);
}

export function partyLuckNextCost(c: TempleConfig, rank: number): number {
  if (rank < 0) rank = 0;
  if (rank >= c.partyLuckMaxRank) return -1;
  return Math.max(1, Math.trunc(lround(c.partyLuckBaseCost * Math.pow(1.0 + c.partyLuckGrowth, rank))));
}

export function buyPartyLuck(m: MetaSave, name: string, c: TempleConfig = defaultTempleConfig()): TempleBuy {
  if (!partyLuckNames.includes(name)) return refuse('no such Party Luck stat');
  const rank = partyLuckRank(m, name);
  const cost = partyLuckNextCost(c, rank);
  if (cost < 0) return refuse('already at the cap');
  if (m.gold < cost) return refuse('not enough Faith');
  m.gold -= cost;
  m.partyLuck.set(name, rank + 1);
  return bought(cost);
}

/** Payout bonus of a Party Luck stat as a fraction, capped at +100 percent. */
export function partyLuckBonus(m: MetaSave, name: string, c: TempleConfig = defaultTempleConfig()): number {
  return Math.min(1.0, partyLuckRank(m, name) * c.partyLuckBonusPerRank);
}
