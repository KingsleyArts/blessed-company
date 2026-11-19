// ClassData.h port: native reader for ClassData.csv (numeric columns only, header driven, malformed rows skipped) plus
// the class-base and threat-weight glue. In the game the generated table (src/data/generated) is the loader; this reader
// mirrors the C++ test helper so the ported tests exercise the same behaviour.
import type { ClassDataRow } from './dataTypes';
import { StatId, type StatResolver } from './statResolver';

const f32 = Math.fround;

export function defaultClassRow(): ClassDataRow {
  return {
    Name: '', RoleTag: 'Tank', BaseStats: { HP: 0, Damage: 0, AttackPerSec: 0, DefensePct: 0 }, BaseThreat: 1,
    AutoActionId: '', AbilityId: '', AllowedStats: [], AllowedTargetTypes: [], AllowedTriggerModes: [],
    ThreatMultiplier: 1, MoveSpeed: 0, AttackRange: 0, PreferredDistMin: 0, PreferredDistMax: 0, RetreatDistance: 0,
    SmiteThreshold: -1, ExtraAbilityIds: [],
  };
}

/** std::stof semantics: parses the numeric prefix, throws (here: NaN) when there is none. */
function stof(cell: string): number {
  const m = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(cell);
  return m ? f32(parseFloat(m[0])) : Number.NaN;
}

/** The C++ reader splits naively on ',' (no quoting); JS split yields the same cells incl. a trailing empty one. */
const split = (s: string): string[] => s.split(',');

export function parseClassDataCsv(text: string): ClassDataRow[] {
  const rows: ClassDataRow[] = [];
  const col = new Map<string, number>();
  for (let line of text.split('\n')) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line === '' || line[0] === '#') continue;
    const cells = split(line);
    if (col.size === 0) {
      cells.forEach((c, i) => col.set(c, i));
      if (!col.has('Name')) return rows;
      continue;
    }
    let ok = true;
    const get = (name: string, fallback: number): number => {
      const i = col.get(name);
      if (i === undefined) return fallback; // column absent: keep default
      if (i >= cells.length) { ok = false; return fallback; }
      const v = stof(cells[i]);
      if (Number.isNaN(v)) { ok = false; return fallback; }
      return v;
    };
    const c = defaultClassRow();
    c.Name = cells[col.get('Name')!] ?? '';
    c.BaseStats.HP = get('BaseHP', c.BaseStats.HP);
    c.BaseStats.Damage = get('BaseDamage', c.BaseStats.Damage);
    c.BaseStats.AttackPerSec = get('BaseAttackPerSec', c.BaseStats.AttackPerSec);
    c.BaseStats.DefensePct = get('BaseDefensePct', c.BaseStats.DefensePct);
    c.BaseThreat = get('BaseThreat', c.BaseThreat);
    c.ThreatMultiplier = get('ThreatMultiplier', c.ThreatMultiplier);
    c.MoveSpeed = get('MoveSpeed', c.MoveSpeed);
    c.AttackRange = get('AttackRange', c.AttackRange);
    c.PreferredDistMin = get('PreferredDistMin', c.PreferredDistMin);
    c.PreferredDistMax = get('PreferredDistMax', c.PreferredDistMax);
    c.RetreatDistance = get('RetreatDistance', c.RetreatDistance);
    if (ok && c.Name !== '') rows.push(c);
  }
  return rows;
}

export function findClass(rows: readonly ClassDataRow[], name: string): ClassDataRow | undefined {
  return rows.find((c) => c.Name === name);
}

/** Writes the class base block into a resolver. The Threat STAT starts at BaseThreat; ThreatMultiplier is not a stat. */
export function applyClassBase(r: StatResolver, c: ClassDataRow): void {
  r.setBase(StatId.Health, c.BaseStats.HP);
  r.setBase(StatId.Damage, c.BaseStats.Damage);
  r.setBase(StatId.AttackSpeed, c.BaseStats.AttackPerSec);
  r.setBase(StatId.DefensePercent, c.BaseStats.DefensePct);
  r.setBase(StatId.Threat, c.BaseThreat);
  r.setBase(StatId.CooldownReduction, 0);
}

/** Factor applied to damage dealt to get threat added to an enemy's table: Threat stat times the hidden multiplier. */
export function threatWeight(r: StatResolver, c: ClassDataRow): number {
  return r.get(StatId.Threat) * c.ThreatMultiplier;
}
