// CombatData.h port: readers for the combat tables. They mirror the C++ readers exactly (header-driven, naive comma split,
// std::stof prefix parsing into float, rows with a bad numeric cell skipped, enum fallbacks) so the sim sees the same numbers.
import { findClass, parseClassDataCsv, stof } from './classData';
import type {
  AbilityDataRow, AbilityEffectRow, ClassDataRow, ClassRole, EffectType, EnemyDataRow, EnemyRole, TargetType, TriggerMode,
} from './dataTypes';

export interface CsvTable {
  col: Map<string, number>;
  rows: string[][];
}

export function parseCsvTable(text: string): CsvTable {
  const t: CsvTable = { col: new Map(), rows: [] };
  for (let line of text.split('\n')) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line === '' || line[0] === '#') continue;
    const cells = line.split(','); // same cells as the C++ getline split plus its trailing-comma rule
    if (t.col.size === 0) cells.forEach((c, i) => t.col.set(c, i));
    else t.rows.push(cells);
  }
  return t;
}

const str = (t: CsvTable, row: string[], name: string): string => {
  const i = t.col.get(name);
  return i === undefined || i >= row.length ? '' : row[i];
};

/** ok.v is cleared when the column exists but the cell is not a number (std::stof threw). */
function num(t: CsvTable, row: string[], name: string, fallback: number, ok: { v: boolean }): number {
  const i = t.col.get(name);
  if (i === undefined) return fallback;
  if (i >= row.length) { ok.v = false; return fallback; }
  const v = stof(row[i]);
  if (Number.isNaN(v)) { ok.v = false; return fallback; }
  return v;
}

export const splitList = (s: string): string[] => s.split('|').filter((x) => x !== '');

const oneOf = <T extends string>(s: string, allowed: readonly T[], fallback: T): T => (allowed.includes(s as T) ? (s as T) : fallback);
export const parseClassRole = (s: string): ClassRole => oneOf(s, ['Healer', 'MeleeDPS', 'RangedDPS', 'Support'] as const, 'Tank');
export const parseEnemyRole = (s: string): EnemyRole => oneOf(s, ['Tank', 'Ranged', 'Healer'] as const, 'Melee');
export const parseTriggerMode = (s: string): TriggerMode => oneOf(s, ['SaveForBossOrElite', 'PackIsLarge', 'AllyIsLow'] as const, 'OnCooldown');
export const parseTargetType = (s: string): TargetType => oneOf(s, ['Weakest', 'Strongest', 'HealerFirst', 'ArcherFirst'] as const, 'Closest');
export const parseEffectType = (s: string): EffectType => oneOf(s, ['Heal', 'AddThreat', 'ApplyModifier', 'SpawnSummon', 'Rush', 'ThreatBurst'] as const, 'Damage');
export const parseBool = (s: string): boolean => s === 'true' || s === 'True' || s === '1';

/** ClassData.csv with ALL columns: numeric ones through the class reader, string/enum ones from the generic table. */
export function parseClassRowsFull(csvText: string): ClassDataRow[] {
  const rows = parseClassDataCsv(csvText);
  const t = parseCsvTable(csvText);
  for (const r of rows) {
    for (const cells of t.rows) {
      if (str(t, cells, 'Name') !== r.Name) continue;
      r.RoleTag = parseClassRole(str(t, cells, 'RoleTag'));
      r.AutoActionId = str(t, cells, 'AutoActionId');
      r.AbilityId = str(t, cells, 'AbilityId');
      r.ExtraAbilityIds = splitList(str(t, cells, 'ExtraAbilityIds'));
      const ok = { v: true };
      r.SmiteThreshold = num(t, cells, 'SmiteThreshold', r.SmiteThreshold, ok);
      if (!ok.v) r.SmiteThreshold = Math.fround(-1);
      r.AllowedStats = splitList(str(t, cells, 'AllowedStats'));
      r.AllowedTargetTypes = splitList(str(t, cells, 'AllowedTargetTypes')).map(parseTargetType);
      r.AllowedTriggerModes = splitList(str(t, cells, 'AllowedTriggerModes')).map(parseTriggerMode);
      break;
    }
  }
  return rows;
}

export function parseEnemyDataCsv(text: string): EnemyDataRow[] {
  const out: EnemyDataRow[] = [];
  const t = parseCsvTable(text);
  if (!t.col.has('Name')) return out;
  for (const cells of t.rows) {
    const ok = { v: true };
    const e: EnemyDataRow = {
      Name: str(t, cells, 'Name'),
      RoleTag: parseEnemyRole(str(t, cells, 'RoleTag')),
      BaseStats: {
        HP: num(t, cells, 'BaseHP', 0, ok),
        Damage: num(t, cells, 'BaseDamage', 0, ok),
        AttackPerSec: num(t, cells, 'BaseAttackPerSec', 0, ok),
        DefensePct: num(t, cells, 'BaseDefensePct', 0, ok),
      },
      AutoActionId: str(t, cells, 'AutoActionId'),
      AbilityId: str(t, cells, 'AbilityId'),
      Taunts: parseBool(str(t, cells, 'Taunts')),
      IsBoss: parseBool(str(t, cells, 'IsBoss')),
      IsElite: parseBool(str(t, cells, 'IsElite')),
      MoveSpeed: num(t, cells, 'MoveSpeed', 0, ok),
      AttackRange: num(t, cells, 'AttackRange', 0, ok),
      PreferredDistMin: num(t, cells, 'PreferredDistMin', 0, ok),
      PreferredDistMax: num(t, cells, 'PreferredDistMax', 0, ok),
      RetreatDistance: num(t, cells, 'RetreatDistance', 0, ok),
    };
    if (ok.v && e.Name !== '') out.push(e);
  }
  return out;
}

export function parseAbilityDataCsv(text: string): AbilityDataRow[] {
  const out: AbilityDataRow[] = [];
  const t = parseCsvTable(text);
  if (!t.col.has('Name')) return out;
  for (const cells of t.rows) {
    const ok = { v: true };
    const a: AbilityDataRow = {
      Name: str(t, cells, 'Name'),
      Cooldown: num(t, cells, 'Cooldown', 0, ok),
      EffectIds: splitList(str(t, cells, 'EffectIds')),
      AllowedTriggerModes: splitList(str(t, cells, 'AllowedTriggerModes')).map(parseTriggerMode),
      ThreatMultiplier: num(t, cells, 'ThreatMultiplier', 1, ok),
    };
    if (ok.v && a.Name !== '') out.push(a);
  }
  return out;
}

export function parseAbilityEffectCsv(text: string): AbilityEffectRow[] {
  const out: AbilityEffectRow[] = [];
  const t = parseCsvTable(text);
  if (!t.col.has('Name')) return out;
  for (const cells of t.rows) {
    const ok = { v: true };
    const e: AbilityEffectRow = {
      Name: str(t, cells, 'Name'),
      AbilityId: str(t, cells, 'AbilityId'),
      Order: Math.trunc(num(t, cells, 'Order', 0, ok)),
      Type: parseEffectType(str(t, cells, 'EffectType')),
      TargetSelector: str(t, cells, 'TargetSelector'),
      Stat: str(t, cells, 'Stat'),
      Value: num(t, cells, 'Value', Math.fround(-1), ok),
      Duration: num(t, cells, 'Duration', 0, ok),
    };
    if (ok.v && e.Name !== '') out.push(e);
  }
  return out;
}

/** Everything the combat sim reads from data/. */
export class CombatData {
  classes: ClassDataRow[] = [];
  enemies: EnemyDataRow[] = [];
  abilities: AbilityDataRow[] = [];
  effects: AbilityEffectRow[] = [];
  findClassRow(n: string): ClassDataRow | undefined { return findClass(this.classes, n); }
  findEnemy(n: string): EnemyDataRow | undefined { return this.enemies.find((e) => e.Name === n); }
  findAbility(n: string): AbilityDataRow | undefined { return this.abilities.find((a) => a.Name === n); }
  findEffect(n: string): AbilityEffectRow | undefined { return this.effects.find((e) => e.Name === n); }
}

/** Loads from the four CSV texts. Returns undefined if any table came back empty. */
export function loadCombatData(classCsv: string, enemyCsv: string, abilityCsv: string, effectCsv: string): CombatData | undefined {
  const d = new CombatData();
  d.classes = parseClassRowsFull(classCsv);
  d.enemies = parseEnemyDataCsv(enemyCsv);
  d.abilities = parseAbilityDataCsv(abilityCsv);
  d.effects = parseAbilityEffectCsv(effectCsv);
  return d.classes.length && d.enemies.length && d.abilities.length && d.effects.length ? d : undefined;
}
