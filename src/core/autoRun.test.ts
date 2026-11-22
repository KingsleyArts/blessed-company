// The soak bot (autoRun.ts): fast regression pins of our own soak output. The Unreal parity anchor (3164 runs, ~35 s) is in
// autoRun.parity.test.ts, which `npm test` runs and `npm run test:fast` skips.
import { describe, expect, it } from 'vitest';
import { AutoRunSession, botVisitTemple, makeAutoRunParams, type AutoRunRecord } from './autoRun';
import { unrealTauntData as data } from './combatTestKit';   // exact Unreal soak numbers: the Unreal-era Taunt
import { makeMeta } from './metaSave';
import { RunOutcome } from './runFlow';
import { GearSlot, gearTempleLevel, statTempleLevel } from './temple';

const floors = (rs: AutoRunRecord[]): string => {
  const m = new Map<number, number>();
  for (const r of rs) m.set(r.results.floorReached, (m.get(r.results.floorReached) ?? 0) + 1);
  return [...m.keys()].sort((a, b) => a - b).map((k) => `F${k} x${m.get(k)}`).join(' ');
};

describe('autoRun soak bot', () => {
  // Soak pins re-recorded Nov 21 after the caster rework (cast-bound Mage and Priestess, projectiles): was F1 x17 F2 x21 F3 x2 and
  // F1 x2 F2 x5 F3 x1 F4 x8 F5 x6 F6 x8 F7 x5 F8 x4 F9 x1 (mean floor 1.63 / 5.03, now 1.48 / 5.18).
  it('nobuy_40_runs_floor_1_usually_fails', () => {
    const rs = new AutoRunSession(data, makeAutoRunParams({ maxRuns: 40, noBuy: true })).runAll();
    expect(rs.length).toBe(40);
    expect(floors(rs)).toBe('F1 x23 F2 x15 F3 x2');
    for (const r of rs) expect(r.results.outcome).toBe(RunOutcome.Wiped);
    expect(rs.map((r) => r.seed)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it('same_params_same_records', () => {
    const p = makeAutoRunParams({ maxRuns: 8, temple: true });
    const a = new AutoRunSession(data, p).runAll();
    const b = new AutoRunSession(data, p).runAll();
    expect(a).toEqual(b);
  });

  it('runs_are_independent_without_the_temple', () => {
    // Without Temple purchases nothing carries between runs (the Priest unlock is forced off each run), so run k of a soak from
    // seed 1 is run 1 of a soak from seed k.
    const all = new AutoRunSession(data, makeAutoRunParams({ maxRuns: 6 })).runAll();
    const sixth = new AutoRunSession(data, makeAutoRunParams({ maxRuns: 1, seed: 6 })).runAll();
    expect(sixth[0].results).toEqual(all[5].results);
  });

  it('temple_bot_buys_the_cheapest_item_first', () => {
    const m = makeMeta();
    m.gold = 10;
    const v = botVisitTemple(m);
    // Damage ranks cost 3 Faith each at the Temple: the cheapest item, bought 100 ranks at a time (as many as affordable).
    expect(v.bought).toBe(1);
    expect(statTempleLevel(m, 'Damage')).toBe(3);
    expect(m.gold).toBe(1);
    const rich = makeMeta();
    rich.gold = 0;
    expect(botVisitTemple(rich).bought).toBe(0);
    expect(gearTempleLevel(rich, 'Warrior', GearSlot.Weapon)).toBe(0);
  });

  it('temple_soak_climbs', () => {
    const rs = new AutoRunSession(data, makeAutoRunParams({ maxRuns: 40, temple: true })).runAll();
    expect(floors(rs)).toBe('F1 x4 F2 x3 F3 x1 F4 x5 F5 x5 F6 x13 F7 x3 F8 x4 F9 x2');
    expect(rs.findIndex((r) => r.results.floorReached >= 3) + 1).toBe(7);
  });
});
