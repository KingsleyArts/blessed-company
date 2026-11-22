// A/B of the caster rework on the soak bot (Nov 21): same seeds, same bot, the cast-time table and one knob changed at a time.
//   npx tsx scripts/abCasters.ts [runs]      (default 800)
import { AbilityDataCsv, AbilityEffectDataCsv, ClassDataCsv, EnemyDataCsv } from '../src/data/generated';
import { AutoRunSession, makeAutoRunParams } from '../src/core/autoRun';
import type { CombatConfig } from '../src/core/combatSim';
import { loadCombatData } from '../src/core/combatData';

const data = loadCombatData(ClassDataCsv, EnemyDataCsv, AbilityDataCsv, AbilityEffectDataCsv)!;
const runs = Number(process.argv[2] ?? '800');
const variants: [string, { legacy?: boolean; tweak?: (c: CombatConfig) => void }][] = [
  ['old table (before Nov 21)', { legacy: true }],
  ['new table (shipped draft)', {}],
  ['new, no projectile flight', { tweak: (c) => { c.projectileSpeed = 0; } }],
  ['new, no flight, gauge fill x2 per hit', { tweak: (c) => { c.projectileSpeed = 0; c.miracle.fillPerHit *= 2; } }],
  ['new, no flight, Group Heal still 1.5 s cast', { tweak: (c) => { c.projectileSpeed = 0; c.abilityCastTimes.set('GroupHeal', 1.5); } }],
  ['new, Mage 1.43 s / Priestess 1.25 s (same cadence as old)', { tweak: (c) => { c.autoCastTimes.set('Mage', 1 / 0.7); c.autoCastTimes.set('Priest', 1.25); } }],
];
for (const [name, v] of variants) {
  const rs = new AutoRunSession(data, makeAutoRunParams({ maxRuns: runs, legacyCastTimes: v.legacy ?? false, tweakConfig: v.tweak })).runAll();
  const n = rs.length;
  const mean = rs.reduce((a, r) => a + r.results.floorReached, 0) / n;
  const f1 = rs.filter((r) => r.results.floorReached === 1).length / n;
  const f3 = rs.filter((r) => r.results.floorReached >= 3).length / n;
  console.log(`${name.padEnd(58)} mean floor ${mean.toFixed(3)}  died on F1 ${(f1 * 100).toFixed(1)}%  reached F3+ ${(f3 * 100).toFixed(1)}%`);
}
