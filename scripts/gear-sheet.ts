// Balance sheet for the gear upgrade chance: npx tsx scripts/gear-sheet.ts > reports/balance/gear-upgrade.md
import { generate, RoomType } from '../src/core/floorGenerator';
import { guaranteedLevel, kDefaultGearUpgrade as C, upgradeChance } from '../src/core/gearUpgrade';

const pct = (p: number): string => `${Math.round(p * 100)}%`;
const out: string[] = [];
const P = (s = ''): void => { out.push(s); };

P('# Gear upgrade chance: balance sheet (floors 1-10, DRAFT)');
P();
P(`Rule: a slot's next upgrade is guaranteed while the level it would reach is within the floor's range (${C.freeBase} + ${C.freePerFloor} x floor). Past it, the chance is ${C.decay}^(levels over), never below ${pct(C.minChance)}. Each level adds +${pct(C.bonusPerLevel)} of the class base (weapon Damage, armor Health). Boss of floor 10: every party member gets the upgrade, each rolled on their own chance.`);
P();
P('## Chance by floor and current slot level');
P();
const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15];
P(`| Floor | Guaranteed to level | ${levels.map((l) => `L${l}`).join(' | ')} |`);
P(`|---|---|${levels.map(() => '---').join('|')}|`);
for (let f = 1; f <= 10; ++f) P(`| ${f} | ${guaranteedLevel(f)} | ${levels.map((l) => pct(upgradeChance(l, f))).join(' | ')} |`);
P();
P('Read a cell as "a slot that already has L levels, on this floor, gets its next upgrade with this chance".');

// Monte Carlo: a fresh party of 4 (8 slots) clears every room of every floor; each drop goes to the slot of its type with the best chance.
const RUNS = 400, PARTY = 4;
let seedState = 12345;
const rnd = (): number => { seedState = (seedState * 1664525 + 1013904223) >>> 0; return seedState / 4294967296; };
const sumLv = Array.from({ length: 10 }, () => 0), sumMin = sumLv.slice(), sumMax = sumLv.slice(), drops = sumLv.slice(), landed = sumLv.slice(), wasted = sumLv.slice();
for (let run = 1; run <= RUNS; ++run) {
  const lv = [new Array<number>(PARTY).fill(0), new Array<number>(PARTY).fill(0)];   // [weapon, armor][member]
  for (let f = 1; f <= 10; ++f) {
    const fl = generate(BigInt(run * 7919 + f), f);
    for (const n of fl.nodes) {
      const boss = n.type === RoomType.Boss;
      if (n.type !== RoomType.Elite && n.type !== RoomType.Treasure && !boss) continue;
      const s = rnd() < 0.5 ? 0 : 1;
      ++drops[f - 1];
      if (boss && f === 10) {   // everyone gets the upgrade, each on their own chance
        for (let m = 0; m < PARTY; ++m) if (rnd() < upgradeChance(lv[s][m], f)) { ++lv[s][m]; ++landed[f - 1]; }
        continue;
      }
      let best = 0;
      for (let m = 1; m < PARTY; ++m) if (upgradeChance(lv[s][m], f) > upgradeChance(lv[s][best], f) || (upgradeChance(lv[s][m], f) === upgradeChance(lv[s][best], f) && lv[s][m] < lv[s][best])) best = m;
      if (rnd() < upgradeChance(lv[s][best], f)) { ++lv[s][best]; ++landed[f - 1]; } else ++wasted[f - 1];
    }
    const all = [...lv[0], ...lv[1]];
    sumLv[f - 1] += all.reduce((a, b) => a + b, 0) / all.length;
    sumMin[f - 1] += Math.min(...all);
    sumMax[f - 1] += Math.max(...all);
  }
}
P();
P('## A fresh party through floors 1-10 (simulated, every room cleared, drops go to the best-chance slot of their type)');
P();
P(`${RUNS} simulated runs, party of ${PARTY} (8 slots). Floor 10 is the boss floor; the boss rewards all ${PARTY} members.`);
P();
P('| Floor | Drops per run | Upgrades landed | Wasted (failed rolls) | Avg slot level after | Lowest slot | Highest slot | Gear bonus (avg) | Enemy HP x floor |');
P('|---|---|---|---|---|---|---|---|---|');
for (let f = 1; f <= 10; ++f) {
  const i = f - 1;
  const avg = sumLv[i] / RUNS;
  P(`| ${f} | ${(drops[i] / RUNS).toFixed(1)} | ${(landed[i] / RUNS).toFixed(1)} | ${(wasted[i] / RUNS).toFixed(1)} | ${avg.toFixed(1)} | ${(sumMin[i] / RUNS).toFixed(1)} | ${(sumMax[i] / RUNS).toFixed(1)} | +${pct(avg * C.bonusPerLevel)} | x${Math.pow(1.08, f - 1).toFixed(2)} |`);
}
P();
P('Enemy HP x floor is the floor scaling alone (+8% per floor, before the boss spike); the gear bonus is the party average. Treasure, Elite and Boss rooms drop; Combat and Rest do not.');
// Run after run: levels are permanent, so repeated runs that end at the same floor climb until the chance bites.
function career(maxFloor: number, runs: number, trials: number): { landed: number; wasted: number; avg: number }[] {
  const acc = Array.from({ length: runs }, () => ({ landed: 0, wasted: 0, avg: 0 }));
  for (let tr = 0; tr < trials; ++tr) {
    const lv = [new Array<number>(PARTY).fill(0), new Array<number>(PARTY).fill(0)];
    for (let r = 0; r < runs; ++r) {
      for (let f = 1; f <= maxFloor; ++f) {
        const fl = generate(BigInt((tr * 101 + r) * 7919 + f), f);
        for (const n of fl.nodes) {
          const boss = n.type === RoomType.Boss;
          if (n.type !== RoomType.Elite && n.type !== RoomType.Treasure && !boss) continue;
          const s = rnd() < 0.5 ? 0 : 1;
          if (boss && f === 10) { for (let m = 0; m < PARTY; ++m) if (rnd() < upgradeChance(lv[s][m], f)) { ++lv[s][m]; ++acc[r].landed; } continue; }
          let best = 0;
          for (let m = 1; m < PARTY; ++m) if (upgradeChance(lv[s][m], f) > upgradeChance(lv[s][best], f) || (upgradeChance(lv[s][m], f) === upgradeChance(lv[s][best], f) && lv[s][m] < lv[s][best])) best = m;
          if (rnd() < upgradeChance(lv[s][best], f)) { ++lv[s][best]; ++acc[r].landed; } else ++acc[r].wasted;
        }
      }
      const all = [...lv[0], ...lv[1]];
      acc[r].avg += all.reduce((a, b) => a + b, 0) / all.length;
    }
  }
  return acc.map((a) => ({ landed: a.landed / trials, wasted: a.wasted / trials, avg: a.avg / trials }));
}
P();
P('## Run after run (levels are permanent)');
P();
P('Party of 4, every room cleared, 60 trials per row. Each block is a player whose runs all end on the same floor. Landed and wasted are per run; avg level is the party average after that run.');
for (const maxFloor of [3, 5, 10]) {
  const c = career(maxFloor, 12, 60);
  P();
  P(`**Every run ends on floor ${maxFloor}**`);
  P();
  P('| Run | ' + c.map((_, i) => String(i + 1)).join(' | ') + ' |');
  P('|---|' + c.map(() => '---').join('|') + '|');
  P('| Landed | ' + c.map((x) => x.landed.toFixed(1)).join(' | ') + ' |');
  P('| Wasted | ' + c.map((x) => x.wasted.toFixed(1)).join(' | ') + ' |');
  P('| Avg level | ' + c.map((x) => x.avg.toFixed(1)).join(' | ') + ' |');
}

console.log(out.join('\n'));
