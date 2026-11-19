// EssenceApply port (Core/EssenceApply.h): pushes the sidebar's ranks into a CombatSim's party units. Party unit k (in sim
// order, enemies, summons and removed units skipped) is party character k of the run. Idempotent.
// Health rule: when max HP rises, a LIVING unit's HP rises by the same amount; when it falls, HP is clamped.
import type { CombatData } from './combatData';
import type { CombatSim } from './combatSim';
import type { EssenceSidebar } from './essenceSidebar';

export const kEssenceAppliesToRunningFight = true;

/** ClassData AllowedStats per class, for EssenceSidebar.setClassAllowedStats. */
export function classAllowedStats(data: CombatData): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const c of data.classes) m.set(c.Name, [...c.AllowedStats]);
  return m;
}

/** Returns the number of party units updated. */
export function applyEssenceToSim(sim: CombatSim, sidebar: EssenceSidebar): number {
  let k = 0;
  const units = sim.getUnits();
  const n = units.length;
  for (let i = 0; i < n; ++i) {
    const cu = units[i];
    if (cu.enemy || cu.summon || cu.removed) continue;
    const u = sim.mutableUnit(cu.id);
    if (!u) continue;
    const before = sim.maxHp(u);
    sidebar.applyTo(k, u.stats);
    const after = sim.maxHp(u);
    if (after > before) {
      if (u.alive) u.hp += after - before;
    } else if (u.hp > after) u.hp = after;
    ++k;
  }
  return k;
}
