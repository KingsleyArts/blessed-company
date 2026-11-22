import { describe, it } from 'vitest';
import { CombatSim, FightState } from './combatSim';
import { RunStats } from './runStats';
import { CHECK, NEAR, data } from './combatTestKit';

function fight(): { stats: RunStats; sim: CombatSim } {
  const sim = new CombatSim(data, 5);
  for (const c of ['Warrior', 'Mage', 'Barbarian', 'Summoner']) sim.addPartyUnit(c);
  for (const e of ['Grunt', 'Grunt', 'Brute']) sim.addEnemy(e, 1);
  const stats = new RunStats();
  let room = { floor: 1, node: 2, type: 'Combat' };
  stats.attach(sim, data, () => room);
  sim.startFight();
  for (let i = 0; i < 90 * 30 && sim.getState() === FightState.Running; ++i) {
    sim.step();
    if (i === 100) room = { floor: 1, node: 3, type: 'Elite' };
  }
  return { stats, sim };
}

describe('RunStats', () => {
  it('DamageDealtSplitsByHeroAndSourceAndSumsToOneHundredPercent', () => {
    const { stats, sim } = fight();
    const d = stats.damageReport();
    const real = sim.getUnits().filter((u) => !u.enemy && !u.summon).reduce((a, u) => a + u.damageDone, 0);
    CHECK(d.total > 0 && d.heroes.length === 4, `heroes ${d.heroes.length}`);
    NEAR(d.heroes.reduce((a, h) => a + h.pct, 0), 100, 1e-6);
    for (const h of d.heroes) {
      NEAR(h.sources.reduce((a, s) => a + s.amount, 0), h.total, 1e-6);
      if (h.total > 0) NEAR(h.sources.reduce((a, s) => a + s.pct, 0), 100, 1e-6);
    }
    CHECK(Math.abs(d.total - real) < 1e-6 || d.total >= real - 1e-6, `total ${d.total} vs ${real}`);
    const bar = d.heroes.find((h) => h.hero === 'Barbarian')!;
    CHECK(bar.sources.some((s) => s.label === 'Axe Swing'), 'basic attack is named');
  });
  it('DamageTakenSplitsByRoomHeroAndEnemy', () => {
    const { stats, sim } = fight();
    const rooms = stats.roomReport();
    CHECK(rooms.length === 2, `rooms ${rooms.length}`);
    const taken = rooms.reduce((a, r) => a + r.total, 0);
    const real = sim.getUnits().filter((u) => !u.enemy && !u.summon).reduce((a, u) => a + u.damageTaken, 0);
    NEAR(taken, real, 1e-6);
    for (const r of rooms) {
      NEAR(r.heroes.reduce((a, h) => a + h.pctOfRoom, 0), 100, 1e-6);
      for (const h of r.heroes) {
        NEAR(h.enemies.reduce((a, e) => a + e.amount, 0), h.taken, 1e-6);
        CHECK(h.enemies.every((e) => ['Grunt', 'Brute'].includes(e.enemy)));
      }
    }
  });
  it('ResetClearsEverything', () => {
    const { stats } = fight();
    stats.reset();
    CHECK(stats.damageReport().total === 0 && stats.roomReport().length === 0);
  });
});
