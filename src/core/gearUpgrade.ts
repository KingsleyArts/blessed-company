// Gear upgrade chance (director Nov 22, draft): weapon and armor upgrades are permanent levels per class and slot. A level is guaranteed while the slot
// is at or below what the floor expects; past that the chance falls geometrically until the player reaches deeper floors (the Deep Dungeon rule).
// DRAFT numbers: move to data/*.csv once the director signs off the balance sheet (reports/balance/gear-upgrade.md).

export interface GearUpgradeConfig {
  /** Levels a slot may reach with a guaranteed upgrade on floor 1. */
  freeBase: number;
  /** Extra guaranteed levels per floor deeper. */
  freePerFloor: number;
  /** Each level past the guaranteed range multiplies the chance by this. */
  decay: number;
  /** The chance never falls below this, so a slot is never stuck. */
  minChance: number;
  /** Damage (weapon) or Health (armor) added per level, as a fraction of the class's base. */
  bonusPerLevel: number;
}

export const kDefaultGearUpgrade: GearUpgradeConfig = { freeBase: 0, freePerFloor: 1, decay: 0.6, minChance: 0.05, bonusPerLevel: 0.1 };

/** The highest level a slot can have and still be guaranteed its next upgrade on this floor. */
export function guaranteedLevel(floor: number, cfg: GearUpgradeConfig = kDefaultGearUpgrade): number {
  return Math.max(0, cfg.freeBase + cfg.freePerFloor * floor);
}

/** Chance that an upgrade lands on a slot currently at `level` (levels already gained) on `floor`. 1 = guaranteed. */
export function upgradeChance(level: number, floor: number, cfg: GearUpgradeConfig = kDefaultGearUpgrade): number {
  const over = level + 1 - guaranteedLevel(floor, cfg);   // how far the level this would reach is past the floor's guaranteed range
  if (over <= 0) return 1;
  return Math.max(cfg.minChance, Math.pow(cfg.decay, over));
}

/** One roll against `roll01` (a uniform number in [0,1)): true when the upgrade lands. */
export const upgradeLands = (level: number, floor: number, roll01: number, cfg: GearUpgradeConfig = kDefaultGearUpgrade): boolean =>
  roll01 < upgradeChance(level, floor, cfg);

/** Boss-of-floor-10 reward: every party member gets the upgrade, each rolled on their own chance. Returns who it landed on. */
export function bossRewardRolls(levels: readonly number[], floor: number, rolls01: readonly number[], cfg: GearUpgradeConfig = kDefaultGearUpgrade): boolean[] {
  return levels.map((lv, i) => upgradeLands(lv, floor, rolls01[i] ?? 1, cfg));
}
