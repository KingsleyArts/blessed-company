// Combat parity with the C++ build: spec-tests/combat comes from tools/golden/dump_combat.cpp running the real CombatSim.h.
// Every scenario must match exactly: the full log text, the summary and the unit state (doubles compared bit for bit).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AbilityDataCsv, AbilityEffectDataCsv, ClassDataCsv, EnemyDataCsv } from '../data/generated';
import { loadCombatData } from './combatData';
import { runScenario, type ScenarioDef } from './combatScenario';
import { fnv1a64 } from './goldenFloor';

interface Golden extends ScenarioDef {
  ticks: number; fightStates: string; firstDeath: string; logHash: string; logBytes: number; summaryHash: string; stateHash: string;
  summary: string;
}
interface Full { name: string; log: string; state: string }

const load = <T>(name: string): T => JSON.parse(readFileSync(`spec-tests/combat/${name}`, 'utf8')) as T;
const data = loadCombatData(ClassDataCsv, EnemyDataCsv, AbilityDataCsv, AbilityEffectDataCsv)!;
const full = new Map(load<Full[]>('combat-logs-full.json').map((f) => [f.name, f]));

/** First differing line, for a readable failure. */
function firstDiff(a: string, b: string): string {
  const la = a.split('\n');
  const lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return `line ${i + 1}\n  ts:  ${la[i]}\n  c++: ${lb[i]}`;
  }
  return 'identical';
}

describe('golden: CombatSim matches the C++ build', () => {
  it('loads the combat data', () => expect(data).toBeDefined());
  for (const g of load<Golden[]>('combat-scenarios.json')) {
    it(g.name, () => {
      const r = runScenario(data, g);
      const f = full.get(g.name);
      if (f) {
        expect(firstDiff(r.log, f.log)).toBe('identical');
        expect(firstDiff(r.state, f.state)).toBe('identical');
      }
      expect(firstDiff(r.summary, g.summary)).toBe('identical');
      expect(r.fightStates).toBe(g.fightStates);
      expect(r.ticks).toBe(g.ticks);
      expect(r.firstDeath).toBe(g.firstDeath);
      expect(r.log.length).toBe(g.logBytes);
      expect(fnv1a64(r.log).toString()).toBe(g.logHash);
      expect(fnv1a64(r.summary).toString()).toBe(g.summaryHash);
      expect(fnv1a64(r.state).toString()).toBe(g.stateHash);
    });
  }
});
