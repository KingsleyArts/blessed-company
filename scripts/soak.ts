// Headless soak bot: the tol.AutoRun instant loop of the Unreal build (src/core/autoRun.ts), on a fresh in-memory save.
//   npm run soak -- --runs 40 --mult 1.3
// Options: --runs N (default 40), --mult X (enemy Health/Damage multiplier, default 1.3), --seed N (first seed, default 1),
//          --nobuy (the bot never spends run Gold in the sidebar), --temple (BotVisitTemple after every run),
//          --cast-times 0|1 (default 1, the shipped Unreal default), --fullheal (debug: full party after every win),
//          --quiet (summary only), --json <file> (write every run record).
import { writeFileSync } from 'node:fs';
import { AbilityDataCsv, AbilityEffectDataCsv, ClassDataCsv, EnemyDataCsv } from '../src/data/generated';
import { AutoRunSession, makeAutoRunParams, type AutoRunRecord } from '../src/core/autoRun';
import { loadCombatData } from '../src/core/combatData';
import { runOutcomeName } from '../src/core/runFlow';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const data = loadCombatData(ClassDataCsv, EnemyDataCsv, AbilityDataCsv, AbilityEffectDataCsv);
if (!data) {
  console.error('soak: cannot load data/*.csv (run `npm run data` first)');
  process.exit(2);
}
const params = makeAutoRunParams({
  seed: Number(arg('seed') ?? '1'),
  maxRuns: Math.max(1, Number(arg('runs') ?? '40')),
  enemyMult: Number(arg('mult') ?? '1.3'),
  castTimes: (arg('cast-times') ?? '1') !== '0',
  noBuy: flag('nobuy'),
  temple: flag('temple'),
  fullHeal: flag('fullheal'),
});
const quiet = flag('quiet');
const mode = [
  `mult ${params.enemyMult}`, `cast times ${params.castTimes ? 'on' : 'off'}`, params.noBuy ? 'nobuy' : 'sidebar buys',
  params.temple ? 'temple' : 'no temple', ...(params.fullHeal ? ['fullheal'] : []),
].join(', ');
console.log(`soak: ${params.maxRuns} runs from seed ${params.seed} (${mode}), fresh save`);

const t0 = Date.now();
const session = new AutoRunSession(data, params);
const records = session.runAll((r: AutoRunRecord) => {
  if (quiet) return;
  const res = r.results;
  let line = `run ${String(r.run).padStart(3)} seed ${r.seed}: ${runOutcomeName(res.outcome)} on floor ${res.floorReached}, ` +
    `${r.fights} fights, gold ${res.essenceEarned}, faith +${res.goldEarned} = ${r.faithAfterRun}` +
    `${res.priestRescued ? ', priest rescued' : ''}${res.killerName ? `, killed by ${res.killerName}` : ''}`;
  if (r.temple) line += ` | temple: bought ${r.temple.bought}, faith left ${r.temple.faithLeft}, gear ${r.temple.gear}, unlocked ${r.temple.statsUnlocked}`;
  console.log(line);
});

const n = records.length;
const floors = new Map<number, number>();
for (const r of records) floors.set(r.results.floorReached, (floors.get(r.results.floorReached) ?? 0) + 1);
const pct = (k: number): string => `${Math.round((100 * k) / n)}%`;
const f1 = floors.get(1) ?? 0;
const f2 = floors.get(2) ?? 0;
const f3up = n - f1 - f2;
const firstReach = (floor: number): string => {
  const r = records.find((x) => x.results.floorReached >= floor);
  return r ? `run ${r.run}` : 'never';
};
const best = Math.max(0, ...records.map((r) => r.results.floorReached));
const victories = records.filter((r) => runOutcomeName(r.results.outcome) === 'Victory').length;
console.log('');
console.log(`floor reached: ${[...floors.keys()].sort((a, b) => a - b).map((k) => `F${k} x${floors.get(k)}`).join(' ')}`);
console.log(`floor 1 ${f1} (${pct(f1)}) | floor 2 ${f2} (${pct(f2)}) | floor 3+ ${f3up} (${pct(f3up)}) | best ${best} | victories ${victories}`);
console.log(`first run to reach floor 3: ${firstReach(3)} | floor 5: ${firstReach(5)} | floor 10: ${firstReach(10)}`);
console.log(`meta at the end: faith ${session.meta.gold}, best floor ${session.meta.bestFloor} | ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const jsonPath = arg('json');
if (jsonPath) {
  const out = records.map((r) => ({
    run: r.run, seed: r.seed, outcome: runOutcomeName(r.results.outcome), floor: r.results.floorReached, fights: r.fights,
    gold: r.results.essenceEarned, faith: r.results.goldEarned, faithAfterRun: r.faithAfterRun, priest: r.results.priestRescued,
    killer: r.results.killerName, temple: r.temple,
  }));
  writeFileSync(jsonPath, JSON.stringify({ params, records: out }, null, 2));
}
