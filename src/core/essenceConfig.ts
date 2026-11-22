// EssenceConfig port (Core/EssenceConfig.h): the Essence sidebar's tunable numbers. Pure rules code: no Phaser imports.
// Fine ranks: kEssenceRankScale fine ranks make one old (coarse) rank; see the C++ header for the full design note.
import { lround, strtod } from './cstd';
import { ModKind, StatId } from './statResolver';

export const kEssenceRankScale = 10;

export interface EssenceStatDef {
  name: string;
  stat: StatId;
  tier: number;
  /** StatDef AllowedClasses; empty = every class. */
  classes: string[];
  baseCost: number;
  growth: number;
  maxRank: number;
  /** As a fraction (Percent kind) or a raw amount (Flat kind). */
  bonusPerRank: number;
  kind: ModKind;
  unit: string;
  showValue: boolean;
  templeCostMult: number;
}

export function makeStatDef(init: Partial<EssenceStatDef> = {}): EssenceStatDef {
  return {
    name: '', stat: StatId.Damage, tier: 0, classes: [], baseCost: 20, growth: 0.15, maxRank: 10, bonusPerRank: 0.1,
    kind: ModKind.Percent, unit: '', showValue: false, templeCostMult: 3.0, ...init,
  };
}

/** k fine ranks make one old rank (k <= 1 leaves the stat unchanged). */
export function scaleToFineRanks(d: EssenceStatDef, k: number): void {
  if (k <= 1) return;
  d.baseCost = Math.max(1, Math.trunc(lround(d.baseCost / k)));
  d.growth /= k;
  d.maxRank *= k;
  d.bonusPerRank /= k;
}

export class EssenceConfig {
  stats: EssenceStatDef[] = [];
  rankScale = 1;
  find(name: string): EssenceStatDef | undefined {
    return this.stats.find((d) => d.name === name);
  }
  clone(): EssenceConfig {
    const c = new EssenceConfig();
    c.rankScale = this.rankScale;
    c.stats = this.stats.map((d) => ({ ...d, classes: [...d.classes] }));
    return c;
  }
}

/** Tier 0 only: Damage, AttackSpeed, Health (every class) and Threat (the tanks). rankScale 1 = the old coarse ranks. */
export function defaultEssenceConfig(rankScale = kEssenceRankScale): EssenceConfig {
  const c = new EssenceConfig();
  c.rankScale = rankScale < 1 ? 1 : rankScale;
  const add = (name: string, stat: StatId, classes: string[]): void => {
    const d = makeStatDef({ name, stat, tier: 0, classes });
    scaleToFineRanks(d, c.rankScale);
    c.stats.push(d);
  };
  add('Damage', StatId.Damage, []);
  add('AttackSpeed', StatId.AttackSpeed, []);
  add('Health', StatId.Health, []);
  add('Threat', StatId.Threat, ['Warrior', 'Barbarian']); // a tank stat (director, Nov 21)
  return c;
}

const kTier1PerRank: ReadonlyArray<readonly [string, number]> = [
  ['DefensePct', 0.2], ['CritChance', 0.005], ['CritFactor', 0.01], ['HealthRegen', 0.1], ['CooldownReduction', 0.005],
  ['Range', 2.5], ['HealPower', 0.01], ['SpiritDamage', 0.2], ['SpiritDuration', 0.1],
];

/** The tier 1 stats of the Temple shop (hidden in the sidebar until unlocked). */
export function addTier1Stats(c: EssenceConfig): void {
  const crit = ['Warrior', 'Assassin', 'Barbarian', 'Summoner', 'Mage'];
  const defs: Array<[string, StatId, string[], number, number, string]> = [
    ['DefensePct', StatId.DefensePercent, [], 0.2, 100, '%'],
    ['CritChance', StatId.CritChance, crit, 0.005, 100, ''],
    ['CritFactor', StatId.CritFactor, crit, 0.01, 100, ''],
    ['HealthRegen', StatId.HealthRegen, [], 0.1, 100, ' HP/s'],
    ['CooldownReduction', StatId.CooldownReduction, [], 0.005, 100, ''],
    ['Range', StatId.Range, ['Priest', 'Summoner', 'Mage'], 2.5, 120, ' range'],
    ['HealPower', StatId.HealPower, ['Priest'], 0.01, 100, ''],
    ['SpiritDamage', StatId.SpiritDamage, ['Summoner'], 0.2, 100, ' dmg'],
    ['SpiritDuration', StatId.SpiritDuration, ['Summoner'], 0.1, 100, ' s'],
  ];
  for (const [name, stat, classes, perRank, maxRank, unit] of defs) {
    const e = makeStatDef({ name, stat, tier: 1, classes: [...classes], kind: ModKind.Flat, unit });
    e.maxRank = Math.trunc(maxRank / kEssenceRankScale);
    e.bonusPerRank = perRank * kEssenceRankScale;
    scaleToFineRanks(e, c.rankScale);
    c.stats.push(e);
  }
}

/** Nov 14 rank rework: Damage and Health are long ladders, the rest short and dearer. */
export function applyRankRework(c: EssenceConfig): void {
  for (const d of c.stats) {
    const longLadder = d.name === 'Damage' || d.name === 'Health';
    if (longLadder) {
      d.maxRank = 5000;
      d.bonusPerRank = 0.004;
      d.baseCost = 3;
      d.growth = 0.0008;
      d.showValue = true;
    } else {
      d.maxRank = 100;
      d.baseCost = 10;
      d.growth = 0.03;
    }
    d.templeCostMult = d.tier >= 1 ? 2.0 : 1.0;
    if (!longLadder && d.tier === 0) d.bonusPerRank = 0.01;
  }
  for (const d of c.stats) {
    if (d.tier >= 1) {
      for (const [n, v] of kTier1PerRank) if (d.name === n) d.bonusPerRank = v;
      if (d.name === 'Range') d.maxRank = 120;
    }
  }
}

/** The sidebar as the game ships it: tier 0 plus tier 1 (hidden until unlocked). */
export function shippedEssenceConfig(rankScale = kEssenceRankScale): EssenceConfig {
  const c = defaultEssenceConfig(rankScale);
  addTier1Stats(c);
  if (c.rankScale === kEssenceRankScale) applyRankRework(c);
  return c;
}

/** Reads EssenceBaseCost, EssenceCostGrowth, MaxRank, BonusPerRank from StatDef.csv text. Returns the stats updated. */
export function applyStatDefCsv(cfg: EssenceConfig, csv: string): number {
  let header: string[] = [];
  let updated = 0;
  // std::getline on ',' drops a trailing empty cell; split keeps it, so trim one trailing empty to match.
  const split = (s: string): string[] => {
    if (s === '') return [];
    const cells = s.split(',');
    if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  };
  const col = (n: string): number => header.indexOf(n);
  const lines = csv.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  for (let line of lines) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line === '' || line[0] === '#') continue;
    const cells = split(line);
    if (header.length === 0) {
      header = cells;
      continue;
    }
    const cName = col('Name');
    if (cName < 0 || cName >= cells.length) continue;
    for (const d of cfg.stats) {
      if (d.name !== cells[cName]) continue;
      const num = (n: string): number | undefined => {
        const c = col(n);
        if (c < 0 || c >= cells.length) return undefined;
        return strtod(cells[c])?.value;
      };
      const k = cfg.rankScale < 1 ? 1 : cfg.rankScale;
      let v = num('EssenceBaseCost');
      if (v !== undefined && v > 0) d.baseCost = Math.max(1, Math.trunc(lround(v / k)));
      v = num('EssenceCostGrowth');
      if (v !== undefined && v >= 0) d.growth = v / k;
      if (d.kind === ModKind.Percent) {
        v = num('MaxRank');
        if (v !== undefined && v > 0) d.maxRank = Math.trunc(v) * k;
        v = num('BonusPerRank');
        if (v !== undefined && v > 0) d.bonusPerRank = v / 100.0 / k;
      }
      ++updated;
    }
  }
  return updated;
}
