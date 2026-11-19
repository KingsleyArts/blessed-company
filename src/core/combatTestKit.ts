// Shared helpers for the combat and unit tests (ports of the helpers at the top of the C++ tests/*.cpp files).
import { expect } from 'vitest';
import { AbilityDataCsv, AbilityEffectDataCsv, ClassDataCsv, EnemyDataCsv } from '../data/generated';
import { CombatData, loadCombatData } from './combatData';
import { FightState, type CombatSim } from './combatSim';
import { ModKind, ModSource, StatId } from './statResolver';
import type { ClassDataRow, EnemyDataRow } from './dataTypes';
import type { UnitId } from './eventBus';

export const data: CombatData = loadCombatData(ClassDataCsv, EnemyDataCsv, AbilityDataCsv, AbilityEffectDataCsv)!;

/** `CombatData d = g_data;` — a deep copy a test may edit. */
export function cloneData(src: CombatData = data): CombatData {
  const d = new CombatData();
  d.classes = structuredClone(src.classes);
  d.enemies = structuredClone(src.enemies);
  d.abilities = structuredClone(src.abilities);
  d.effects = structuredClone(src.effects);
  return d;
}

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
