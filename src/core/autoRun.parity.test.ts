// The soak bot against the Unreal build: the g6 soak of Nov 18 (reports/sim/g6-soak-nov18.md in the reference repo) ran 3164
// instant tol.AutoRun runs at enemy multiplier 1.3 and got floor 1: 1250, floor 2: 1811, floor 3+: 103, best floor 4.
// The TS soak reproduces it exactly with the Unreal defaults (the Nov 18 cast-time table, 
// installLegacyCastTimes: the shipped table changed on Nov 21 with the cast-bound casters; cast times on, sidebar buys on, seeds 1..3164). Slow (~35 s):
// `npm test` runs it, `npm run test:fast` skips it.
import { describe, expect, it } from 'vitest';
import { AutoRunSession, makeAutoRunParams } from './autoRun';
import { unrealTauntData as data } from './combatTestKit';   // exact Unreal soak numbers: the Unreal-era Taunt

describe('autoRun parity', () => {
  it('reproduces_the_unreal_g6_soak_3164_runs', () => {
    const rs = new AutoRunSession(data, makeAutoRunParams({ maxRuns: 3164, legacyCastTimes: true })).runAll();
    let f1 = 0;
    let f2 = 0;
    let best = 0;
    for (const r of rs) {
      if (r.results.floorReached === 1) ++f1;
      else if (r.results.floorReached === 2) ++f2;
      best = Math.max(best, r.results.floorReached);
    }
    expect([f1, f2, rs.length - f1 - f2, best]).toEqual([1250, 1811, 103, 4]);
  }, 600_000);
});
