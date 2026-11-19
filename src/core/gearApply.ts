// GearApply port (Core/GearApply.h): pushes gear levels into a CombatSim's party units. Level = Temple level + this run's
// dungeon levels. Weapon: +gearBonusPerLevel x level Damage (Percent, ModSource.Gear); armor: the same on Health. Idempotent,
// with the same max-HP rule as EssenceApply.
import type { CombatSim } from './combatSim';
import type { MetaSave } from './metaSave';
import { ModKind, ModSource, StatId } from './statResolver';
import { GearSlot, defaultTempleConfig, gearKey, gearTempleLevel, type TempleConfig } from './temple';

export function gearLevel(meta: MetaSave, dungeon: ReadonlyMap<string, number>, className: string, slot: GearSlot): number {
  let level = gearTempleLevel(meta, className, slot);
  const d = dungeon.get(gearKey(className, slot));
  if (d !== undefined && d > 0) level += d;
  return level;
}

/** Returns the number of party units updated. */
export function applyGearToSim(sim: CombatSim, meta: MetaSave, dungeon: ReadonlyMap<string, number>,
  cfg: TempleConfig = defaultTempleConfig()): number {
  let n = 0;
  const units = sim.getUnits();
  const count = units.length;
  for (let i = 0; i < count; ++i) {
    const cu = units[i];
    if (cu.enemy || cu.summon || cu.removed) continue;
    const u = sim.mutableUnit(cu.id);
    if (!u) continue;
    const before = sim.maxHp(u);
    u.stats.removeBySource(ModSource.Gear);
    const w = gearLevel(meta, dungeon, u.name, GearSlot.Weapon);
    const a = gearLevel(meta, dungeon, u.name, GearSlot.Armor);
    if (w > 0) u.stats.addModifier(StatId.Damage, ModKind.Percent, w * cfg.gearBonusPerLevel, ModSource.Gear);
    if (a > 0) u.stats.addModifier(StatId.Health, ModKind.Percent, a * cfg.gearBonusPerLevel, ModSource.Gear);
    const after = sim.maxHp(u);
    if (after > before) {
      if (u.alive) u.hp += after - before;
    } else if (u.hp > after) u.hp = after;
    ++n;
  }
  return n;
}
