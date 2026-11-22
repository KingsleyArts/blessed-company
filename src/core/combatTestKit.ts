// Shared helpers for the combat and unit tests (ports of the helpers at the top of the C++ tests/*.cpp files).
import { expect } from 'vitest';
import { AbilityDataCsv, AbilityEffectDataCsv, ClassDataCsv, EnemyDataCsv } from '../data/generated';
import { CombatData, loadCombatData } from './combatData';
import { FightState, type CombatSim } from './combatSim';
import { ModKind, ModSource, StatId } from './statResolver';
import type { ClassDataRow, EnemyDataRow } from './dataTypes';
import type { UnitId } from './eventBus';

export const data: CombatData = loadCombatData(ClassDataCsv, EnemyDataCsv, AbilityDataCsv, AbilityEffectDataCsv)!;

/**
 * The unit suites' ReadFile pins (Barbarian, Priest, ...): the shipped data holds a deliberately weak placeholder Priest,
 * so those suites pin the design values (Attack/sec 0.8, Group Heal 1.2). First occurrence only, like std::string::replace.
 * Today data/*.csv already holds 0.8 and 1.2, so both pins find nothing and pinnedData equals data (same as in C++).
 */
const pinFirst = (text: string, from: string, to: string): string => {
  const p = text.indexOf(from);
  return p < 0 ? text : text.slice(0, p) + to + text.slice(p + from.length);
};
export const pinnedClassCsv = pinFirst(ClassDataCsv, 'Priest,Healer,100,3,0.12,', 'Priest,Healer,100,3,0.8,');
export const pinnedEffectCsv = pinFirst(AbilityEffectDataCsv, 'GroupHeal_1,GroupHeal,0,Heal,AllAllies,,0.5,', 'GroupHeal_1,GroupHeal,0,Heal,AllAllies,,1.2,');
export const pinnedData: CombatData = loadCombatData(pinnedClassCsv, EnemyDataCsv, AbilityDataCsv, pinnedEffectCsv)!;

/** StubRow(name, hp, dmg): a melee enemy row that lives only in a test's data copy. */
export function StubRow(name: string, hp: number, dmg: number): EnemyDataRow {
  return {
    Name: name, RoleTag: 'Melee', BaseStats: { HP: Math.fround(hp), Damage: Math.fround(dmg), AttackPerSec: 1, DefensePct: 0 },
    AutoActionId: '', AbilityId: '', Taunts: false, IsBoss: false, IsElite: false,
    MoveSpeed: 280, AttackRange: 150, PreferredDistMin: 0, PreferredDistMax: 150, RetreatDistance: 0,
  };
}

/** `CombatData d = g_data;` — a deep copy a test may edit. */
export function cloneData(src: CombatData = data): CombatData {
  const d = new CombatData();
  d.classes = structuredClone(src.classes);
  d.enemies = structuredClone(src.enemies);
  d.abilities = structuredClone(src.abilities);
  d.effects = structuredClone(src.effects);
  return d;
}

/** The data with the Nov 12 Barbarian (melee damage) and Summoner (support whose weapon spirit attacks), as the C++ build had them. The
 *  director's Nov 21 change made the Barbarian a tank and the Summoner a healer (data/ClassData.csv); the suites that port the C++ unit
 *  tests or reproduce its goldens use this so they keep checking the engine against the C++ build. */
export const legacyHeroData: CombatData = (() => {
  const d = cloneData();
  const barb = d.findClassRow('Barbarian')!;
  barb.RoleTag = 'MeleeDPS';
  barb.BaseStats.HP = Math.fround(160);
  barb.BaseStats.DefensePct = 10;
  barb.BaseThreat = 1.0;
  barb.ThreatMultiplier = Math.fround(1.2); // as the CSV reader stores it
  barb.ExtraAbilityIds = [];
  const rage = d.findAbility('Rage')!;
  rage.Cooldown = 14;
  rage.EffectIds = ['Rage_1', 'Rage_2'];
  d.findEffect('Rage_1')!.Value = 0.5;
  d.findEffect('Rage_1')!.Duration = 5;
  d.findEffect('Rage_2')!.Duration = 5;
  const su = d.findClassRow('Summoner')!;
  su.RoleTag = 'Support';
  su.AutoActionId = 'RangedBolt';
  return d;
})();

/** The data with the Unreal-era Taunt (forced attack only; Taunt_1 unused at +100), as the C++ build and its soak numbers had it. The
 *  director's Nov 20 Taunt (threat to highest +1, then the forced attack) is a data change; the tests that reproduce exact Unreal
 *  numbers or distributions use this so they keep checking the engine against the C++ build. */
export const unrealTauntData: CombatData = (() => {
  const d = cloneData(legacyHeroData);
  d.findAbility('Taunt')!.EffectIds = ['Taunt_3', 'Taunt_2'];
  d.findEffect('Taunt_1')!.Value = 100;
  return d;
})();

export function Cls(n: string): ClassDataRow {
  const r = data.findClassRow(n);
  if (!r) throw new Error(`missing class ${n}`);
  return r;
}
export function Enemy(n: string): EnemyDataRow {
  const r = data.findEnemy(n);
  if (!r) throw new Error(`missing enemy ${n}`);
  return r;
}
export const EffectValue = (n: string): number => data.findEffect(n)?.Value ?? 0;
export const EffectDuration = (n: string): number => data.findEffect(n)?.Duration ?? 0;
export const Cooldown = (ability: string): number => data.findAbility(ability)?.Cooldown ?? 0;

export function Place(s: CombatSim, id: UnitId, x: number, y: number): void {
  const u = s.mutableUnit(id)!;
  u.x = x;
  u.y = y;
}
export function Freeze(s: CombatSim, id: UnitId): void { s.mutableUnit(id)!.moveSpeed = 0; }
export function StepTicks(s: CombatSim, n: number): void { for (let i = 0; i < n; i++) s.step(); }
/** std::llround (half away from zero). */
export const llround = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));
/** StepSeconds(s, sec): llround(sec / dt) ticks. */
export function StepSeconds(s: CombatSim, sec: number): void { StepTicks(s, llround(sec / s.config().dt)); }
/** The unit suites' StepN: steps n ticks but stops once the fight is over. */
export function StepRunning(s: CombatSim, n: number): void {
  for (let i = 0; i < n && s.getState() === FightState.Running; i++) s.step();
}
/** Ticks(s, seconds): llround(seconds / dt). */
export const Ticks = (s: CombatSim, seconds: number): number => llround(seconds / s.config().dt);
/** Dummy: a data enemy turned into a harmless stationary punching bag (Damage 0, given HP, no movement). */
export function Dummy(s: CombatSim, enemyName: string, x: number, y: number, hp = 100000): UnitId {
  const id = s.addEnemy(enemyName, 1);
  const u = s.mutableUnit(id)!;
  u.stats.setBase(StatId.Health, hp);
  u.stats.setBase(StatId.Damage, 0);
  u.hp = hp;
  u.moveSpeed = 0;
  u.x = x;
  u.y = y;
  return id;
}
/** Tough(s, id): +1e6 flat Health so a test can run long without the fight ending. */
export function Tough(s: CombatSim, id: UnitId): void {
  const u = s.mutableUnit(id)!;
  u.stats.addModifier(StatId.Health, ModKind.Flat, 1.0e6, ModSource.GoldUpgrade);
  u.hp = s.maxHp(u);
}
export const dist = (s: CombatSim, a: UnitId, b: UnitId): number => {
  const ua = s.getUnit(a)!;
  const ub = s.getUnit(b)!;
  return Math.sqrt((ua.x - ub.x) ** 2 + (ua.y - ub.y) ** 2);
};

/** CHECK(c): a named boolean assertion. */
export function CHECK(c: unknown, what = 'CHECK'): void {
  expect(!!c, what).toBe(true);
}
/** CHECK_NEAR(a, b, eps). */
export function NEAR(a: number, b: number, eps: number, what = 'NEAR'): void {
  if (!(Math.abs(a - b) <= eps)) expect.fail(`${what}: ${a} != ${b} (eps ${eps})`);
}
