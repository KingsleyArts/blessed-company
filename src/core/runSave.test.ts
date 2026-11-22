// Run saves (director, Nov 19: closing the app ended the run): saves are taken at safe moments, a resume puts back the same run, and
// damaged saves are refused.
import { describe, expect, it } from 'vitest';
import { data } from './combatTestKit';
import { FightState } from './combatSim';
import { MemoryMetaStore, RunChange, RunManager, type TransitionHook, type WalkStep } from './runManager';
import { parseRunSave, serializeRunSave } from './runSave';

function runFor(rm: RunManager, hook: DelayHook, seconds: number, until: () => boolean = () => false): void {
  for (let t = 0; t < seconds && !until(); t += 1 / 30) {
    rm.tick(1 / 30);
    hook.advance(1 / 30);
  }
}

class DelayHook implements TransitionHook {
  pending: { left: number; done: () => void } | undefined;
  constructor(private readonly delay: number) {}
  play(_steps: WalkStep[], _speed: number, done: () => void): void { this.pending = { left: this.delay, done }; }
  cancel(): void { this.pending = undefined; }
  advance(dt: number): void {
    if (!this.pending) return;
    this.pending.left -= dt;
    if (this.pending.left <= 0) {
      const d = this.pending.done;
      this.pending = undefined;
      d();
    }
  }
}

/** Plays a run on Auto until it has saved `saves` times (or ends); returns the manager, its store and the last save. */
function playUntilSaves(seed: number, saves: number): { rm: RunManager; store: MemoryMetaStore; text: string | undefined } {
  const store = new MemoryMetaStore();
  const rm = new RunManager(data, store);
  const hook = new DelayHook(0.4);
  rm.setTransitionHook(hook);
  let count = 0;
  let last: string | undefined;
  rm.onChange((c) => {
    if (c !== RunChange.RunSaved || !rm.getRunSave()) return;
    last = rm.getRunSave();
    ++count;
    if (count === 3) {   // buy Essence ranks mid-run so the save carries them
      rm.debugGrantEssence(500);
      rm.buyStat(0, 'Health', 2);
      rm.buyStat(1, 'Damage', 1);
    }
  });
  rm.startRunWithFights(seed);
  rm.setAuto(true);
  rm.setCombatSpeed(8);
  runFor(rm, hook, 900, () => count >= saves || !rm.getFlow().active());
  // A wipe clears the save; the last one taken before it is still a valid save to resume.
  return { rm, store, text: rm.getRunSave() ?? last };
}

describe('run saves', () => {
  it('a new run saves at once; the save is the start room with the fight pending again on a resume', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    rm.startRunWithFights(5);
    const cp = parseRunSave(rm.getRunSave());
    expect(cp).toBeDefined();
    expect(cp!.units).toEqual([]);
    const again = new RunManager(data, new MemoryMetaStore());
    expect(again.resumeRun(rm.getRunSave())).toBe(true);
    expect(again.getFlow().fightPending()).toBe(true);
    expect(again.getSim()!.getState()).toBe(FightState.Running);
    expect(again.getFlow().getRun().currentNode).toBe(rm.getFlow().getRun().currentNode);
  });

  it('a resume puts back the same run: floor, room, fog, cleared rooms, earnings, Essence ranks, party health, gauge', () => {
    for (const seed of [3, 1, 29]) {
      const { store, text } = playUntilSaves(seed, 20);
      const saved = parseRunSave(text);
      expect(saved, `seed ${seed}`).toBeDefined();
      expect(saved!.flow.roomsCleared, `seed ${seed}`).toBeGreaterThan(3);
      expect(saved!.flow.sidebar.some((c) => c.ranks.length > 0), `seed ${seed}: ranks bought`).toBe(true);
      const rm2 = new RunManager(data, store);
      expect(rm2.resumeRun(text)).toBe(true);
      expect(rm2.getFlow().checkpoint()).toEqual(saved!.flow);
      const sim = rm2.getSim()!;
      for (const u of saved!.units) {
        const now = sim.getUnits().find((x) => !x.enemy && !x.summon && x.name === u.name)!;
        expect(now.alive, `${seed} ${u.name}`).toBe(u.alive);
        if (u.alive) expect(now.hp).toBeCloseTo(Math.max(1, u.hp), 3);
        else expect(rm2.despawnedParty.has(u.name)).toBe(true);
      }
      expect(sim.getGauge().value()).toBeCloseTo(saved!.gauge, 5);
    }
  });

  it('a fallen hero stays fallen (and hidden) after a resume', () => {
    const { store, text } = playUntilSaves(23, 6);
    const cp = parseRunSave(text)!;
    expect(cp.units.length).toBeGreaterThan(1);
    const fallen = cp.units[1].name;
    const edited = serializeRunSave({ ...cp, units: cp.units.map((u) => (u.name === fallen ? { ...u, hp: 0, alive: false } : u)) });
    const rm2 = new RunManager(data, store);
    expect(rm2.resumeRun(edited)).toBe(true);
    const u = rm2.getSim()!.getUnits().find((x) => !x.enemy && x.name === fallen)!;
    expect(u.alive).toBe(false);
    expect(rm2.despawnedParty.has(fallen)).toBe(true);
  });

  it('a resumed run plays on and keeps saving', () => {
    const { store, text } = playUntilSaves(41, 5);
    const rm2 = new RunManager(data, store);
    const hook = new DelayHook(0.4);
    rm2.setTransitionHook(hook);
    expect(rm2.resumeRun(text)).toBe(true);
    let saves = 0;
    rm2.onChange((c) => { if (c === RunChange.RunSaved) ++saves; });
    rm2.setAuto(true);
    rm2.setCombatSpeed(8);
    runFor(rm2, hook, 600, () => saves >= 3 || !rm2.getFlow().active());
    expect(saves).toBeGreaterThan(0);
  });

  it('the save is cleared when the run ends', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    rm.startRunWithFights(9);
    expect(rm.getRunSave()).toBeDefined();
    rm.abandonRun();
    expect(rm.getRunSave()).toBeUndefined();
  });

  it('damaged or foreign saves are refused and change nothing', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    rm.startRunWithFights(5);
    const good = rm.getRunSave()!;
    const cp = parseRunSave(good)!;
    const fresh = new RunManager(data, new MemoryMetaStore());
    for (const bad of [undefined, '', 'not json', '{}', good.slice(0, good.length / 2), good.replace('"v":1', '"v":99')]) {
      expect(parseRunSave(bad)).toBeUndefined();
      expect(fresh.resumeRun(bad)).toBe(false);
    }
    // A room number the floor does not have: parses, but the floor refuses it.
    const off = serializeRunSave({ ...cp, flow: { ...cp.flow, currentNode: 9999 } });
    expect(parseRunSave(off)).toBeDefined();
    expect(fresh.resumeRun(off)).toBe(false);
    expect(fresh.getFlow().active()).toBe(false);
    // 64-bit seeds survive the text round trip.
    const big = { ...cp, flow: { ...cp.flow, seed: 2n ** 64n - 1n, gearRng: 12345678901234567890n } };
    expect(parseRunSave(serializeRunSave(big))!.flow.seed).toBe(2n ** 64n - 1n);
    expect(parseRunSave(serializeRunSave(big))!.flow.gearRng).toBe(12345678901234567890n);
  });
});
