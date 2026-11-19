// Headless fight runner: one whole fight at maximum speed, printed as the combat log plus the summary.
//   npm run fight -- --seed 7 --party Warrior,Priest,Mage --enemies Grunt,Grunt,Brute --floor 2 --cast-times
// Options: --seed N (default 1), --party A,B,C (default Warrior,Mage), --enemies X,Y (default Grunt,Grunt,Grunt),
//          --floor N (default 1), --cast-times (install the shipped cast times), --summary-only (skip the log).
import { AbilityDataCsv, AbilityEffectDataCsv, ClassDataCsv, EnemyDataCsv } from '../src/data/generated';
import { loadCombatData } from '../src/core/combatData';
import { defaultCombatConfig, fightStateName, runFightHeadless } from '../src/core/combatSim';
import { installShippedCastTimes } from '../src/core/castTimes';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const list = (s: string | undefined, fallback: string[]): string[] => (s ? s.split(',').filter((x) => x !== '') : fallback);

const data = loadCombatData(ClassDataCsv, EnemyDataCsv, AbilityDataCsv, AbilityEffectDataCsv);
if (!data) {
  console.error('fight: cannot load data/*.csv (run `npm run data` first)');
  process.exit(2);
}
const seed = BigInt(arg('seed') ?? '1');
const party = list(arg('party'), ['Warrior', 'Mage']);
const enemies = list(arg('enemies'), ['Grunt', 'Grunt', 'Grunt']);
const floor = Number(arg('floor') ?? '1');
for (const p of party) if (!data.findClassRow(p)) { console.error(`fight: unknown class "${p}"`); process.exit(2); }
for (const e of enemies) if (!data.findEnemy(e)) { console.error(`fight: unknown enemy "${e}"`); process.exit(2); }

const cfg = defaultCombatConfig();
cfg.logCapacity = 1 << 22; // keep the whole log; the in-game default ring buffer would drop the start of a long fight
if (flag('cast-times')) installShippedCastTimes(cfg);

const r = runFightHeadless(data, seed, party, enemies, floor, [], cfg);
if (!flag('summary-only')) process.stdout.write(r.logText);
process.stdout.write(r.summary);
if (!r.summary.endsWith('\n')) process.stdout.write('\n');
console.log(
  `${fightStateName(r.state)} in ${r.seconds.toFixed(2)}s (${r.ticks} ticks), enemies killed ${r.enemiesKilled}, party alive ${r.partyAlive}` +
    ` | seed ${seed} floor ${floor} party ${party.join('+')} vs ${enemies.join('+')}${flag('cast-times') ? ' (cast times on)' : ''}`,
);
