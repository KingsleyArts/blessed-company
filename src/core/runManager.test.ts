// The live run manager (runManager.ts) driven headless: frame ticks, Auto, the walk hook, the Temple and the saved meta.
import { describe, expect, it } from 'vitest';
import { data } from './combatTestKit';
import { FightState } from './combatSim';
import { Dir } from './floorGenerator';
import { parseMeta } from './metaSave';
import { MemoryMetaStore, RunChange, RunManager, type TransitionHook, type WalkStep } from './runManager';

/** Ticks at 60 fps until `until` holds or the time runs out (game seconds). */
function runFor(rm: RunManager, seconds: number, until: () => boolean = () => false): number {
  let t = 0;
  while (t < seconds && !until()) {
    rm.tick(1 / 60);
    t += 1 / 60;
  }
  return t;
}

/** A walk hook that finishes each walk after `delay` seconds of ticks (the room view's job). */
class DelayHook implements TransitionHook {
  pending: { left: number; done: () => void } | undefined;
  walks: WalkStep[][] = [];
  cancels = 0;
  constructor(private readonly delay: number) {}
  play(steps: WalkStep[], _speed: number, done: () => void): void {
    this.walks.push(steps);
    this.pending = { left: this.delay, done };
  }
  cancel(): void { this.pending = undefined; ++this.cancels; }
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

describe('RunManager (live)', () => {
  it('a manual run starts its first fight at once and fights in real time', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    const changes: RunChange[] = [];
    rm.onChange((c) => changes.push(c));
    expect(rm.startRunWithFights(7)).toBe(true);
    expect(changes.slice(0, 3)).toEqual([RunChange.RunStarted, RunChange.MapChanged, RunChange.FightStarted]);
    const sim = rm.getSim()!;
    expect(sim.getState()).toBe(FightState.Running);
    rm.tick(1.0);
    expect(sim.getTime()).toBeCloseTo(1.0, 5);   // 1x: one second of frame time is 30 sim steps
    rm.setCombatSpeed(4);
    rm.tick(0.5);
    expect(Math.abs(sim.getTime() - 3.0)).toBeLessThan(0.05);   // the accumulator keeps the sub-step remainder
    rm.setCombatSpeed(0);   // paused
    const t = sim.getTime();
    rm.tick(1.0);
    expect(sim.getTime()).toBe(t);
  });

  it('auto plays a whole run to its end without a view', () => {
    const store = new MemoryMetaStore();
    const rm = new RunManager(data, store);
    rm.startRunWithFights(3);
    rm.setCombatSpeed(10);
    rm.setAuto(true);
    runFor(rm, 3600, () => !rm.getFlow().active());
    expect(rm.getFlow().active()).toBe(false);
    const r = rm.getRunResults();
    expect(r.valid).toBe(true);
    expect(r.floorReached).toBeGreaterThanOrEqual(1);
    expect(rm.isAuto()).toBe(false);   // Auto ends with the run
    const saved = parseMeta(store.text!);
    expect(saved.ok).toBe(true);
    expect(saved.meta.gold).toBe(rm.getMeta().gold);
  });

  it('moves wait for the walk, and the next fight is staged while the party walks in', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    const hook = new DelayHook(1.5);
    rm.setTransitionHook(hook);
    rm.startRunWithFights(11);
    rm.setCombatSpeed(10);
    runFor(rm, 600, () => !rm.getFlow().fightPending() || !rm.getFlow().active());
    expect(rm.getFlow().active()).toBe(true);
    const f = rm.getFlow().currentFloor();
    const here = f.nodes[rm.getFlow().currentNode()];
    const dir = [Dir.North, Dir.East, Dir.South, Dir.West].find((d) => here.door[d] >= 0)!;
    const target = here.door[dir];
    expect(rm.moveDirection(dir)).toBe(true);
    expect(rm.isTransitioning()).toBe(true);
    expect(hook.walks.at(-1)).toEqual([{ dir, fromNode: f.nodes.indexOf(here), toNode: target }]);
    expect(rm.getPartyEntry()).toBe((dir + 2) % 4);
    expect(rm.moveDirection(dir)).toBe(false);   // refused while walking
    const wasFight = rm.getFlow().fightPending();
    if (wasFight) expect(rm.isStaged()).toBe(true);
    for (let i = 0; i < 200 && rm.isTransitioning(); ++i) {
      rm.tick(1 / 60);
      hook.advance(1 / 60);
    }
    expect(rm.isTransitioning()).toBe(false);
    if (wasFight) {
      expect(rm.isStaged()).toBe(false);
      expect(rm.getSim()!.getState()).toBe(FightState.Running);
    }
  });

  it('auto keeps going after a teleport into a start room with no fight (seeds 7 and 99 stalled before)', () => {
    for (const seed of [7, 99]) {
      const rm = new RunManager(data, new MemoryMetaStore());
      const hook = new DelayHook(1);
      rm.setTransitionHook(hook);
      rm.startRunWithFights(seed);
      rm.setCombatSpeed(10);
      rm.setAuto(true);
      let floor2 = false;
      for (let t = 0; t < 4000 && rm.getFlow().active(); t += 1 / 30) {
        hook.advance(1 / 30);
        rm.tick(1 / 30);
        if (rm.getFlow().getRun().floorNumber >= 2) floor2 = true;
      }
      expect(floor2).toBe(true);
      expect(rm.getFlow().active()).toBe(false);   // the run reached its end instead of idling on floor 2
    }
  });

  it('temple purchases and the party picker are saved and survive a reload', () => {
    const store = new MemoryMetaStore();
    const rm = new RunManager(data, store);
    rm.getMeta().gold = 50;
    expect(rm.getTempleSnapshot().valid).toBe(true);
    expect(rm.templeBuy('Level:Damage', 1)).toBe(true);
    expect(rm.templeBuy('Gear:Warrior:0')).toBe(false);   // too expensive for what is left, or refused
    const reloaded = new RunManager(data, store);
    const t = reloaded.getTempleSnapshot();
    const dmg = t.items.find((i) => i.id === 'Level:Damage')!;
    expect(dmg.level).toBe(1);
    expect(t.essence).toBe(rm.getMeta().gold);
    expect(t.roster.map((r) => `${r.label}:${r.owned ? 1 : 0}${r.active ? 1 : 0}`)).toEqual(['Warrior:11', 'Mage:11', 'Assassin:10', 'Priestess:10', 'Barbarian:10', 'Summoner:10']);
    expect(reloaded.templeBuy('Party:Assassin')).toBe(true);
    expect(new RunManager(data, store).getTempleSnapshot().roster.find((r) => r.className === 'Assassin')!.active).toBe(true);
    // The party picker decides the next run's party.
    const third = new RunManager(data, store);
    third.startRunWithFights(5);
    expect(third.getFlow().getRun().party).toEqual(['Warrior', 'Mage', 'Assassin']);
    expect(third.getTempleSnapshot().valid).toBe(false);   // no Temple during a run
    expect(third.templeBuy('Level:Damage')).toBe(false);
  });

  it('a corrupt save starts fresh and is kept aside', () => {
    const store = new MemoryMetaStore();
    store.text = 'garbage';
    let kept = '';
    store.keepCorrupt = (t: string): void => { kept = t; };
    const rm = new RunManager(data, store);
    expect(rm.getMeta().gold).toBe(0);
    expect(kept).toBe('garbage');
  });

  it('miracles cast through the manager spend the gauge', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    rm.startRunWithFights(9);
    const sim = rm.getSim()!;
    sim.getGauge().add(1000);
    const hero = sim.getUnits().find((u) => !u.enemy)!;
    hero.hp = sim.maxHp(hero) * 0.5;
    const before = sim.getGauge().value();
    const r = rm.castMiracle(0, hero.id);
    expect(r.result).toBe(0);
    expect(sim.getGauge().value()).toBeLessThan(before);
  });

  it('Heal and Shield can be cast between fights; a held Shield starts with the next fight; Smite needs a fight (director, Nov 19)', () => {
    let checked = false;
    for (let seed = 11; seed < 40 && !checked; ++seed) {
      const rm = new RunManager(data, new MemoryMetaStore());
      const hook = new DelayHook(1.5);
      rm.setTransitionHook(hook);
      rm.startRunWithFights(seed);
      rm.setCombatSpeed(10);
      runFor(rm, 600, () => !rm.getFlow().fightPending() || !rm.getFlow().active());
      if (!rm.getFlow().active()) continue;
      const sim = rm.getSim()!;
      expect(sim.getState()).not.toBe(FightState.Running);
      sim.getGauge().add(1000);
      expect(rm.miracleReady(0)).toBe(true);    // Divine Healing
      expect(rm.miracleReady(1)).toBe(true);    // Divine Shield
      expect(rm.miracleReady(2)).toBe(false);   // Divine Smite: nothing to strike
      const hero = sim.getUnits().find((u) => !u.enemy && !u.summon && u.alive)!;
      hero.hp = sim.maxHp(hero) * 0.5;
      const g0 = sim.getGauge().value();
      expect(rm.castMiracle(0, hero.id).result).toBe(0);
      expect(hero.hp).toBeGreaterThan(sim.maxHp(hero) * 0.5);
      expect(sim.getGauge().value()).toBeLessThan(g0);
      expect(rm.castSmiteAt(0, 0).result).toBe(1);   // FightNotRunning
      const shielded = rm.castMiracle(1, hero.id);
      expect(shielded.result).toBe(0);
      const full = sim.getUnit(shielded.on)!.shieldLeft;
      expect(full).toBeGreaterThan(0);

      const here = rm.getFlow().currentFloor().nodes[rm.getFlow().currentNode()];
      const dir = [Dir.North, Dir.East, Dir.South, Dir.West].find((d) => here.door[d] >= 0)!;
      expect(rm.moveDirection(dir)).toBe(true);
      if (!rm.getFlow().fightPending()) continue;   // walked into an empty room: try another seed
      const name = hero.name;
      const staged = sim.getUnits().find((u) => u.name === name)!;
      expect(staged.shieldLeft).toBe(full);   // kept through PrepareNextFight
      for (let i = 0; i < 200 && rm.isTransitioning(); ++i) {
        rm.tick(1 / 60);
        hook.advance(1 / 60);
      }
      expect(sim.getState()).toBe(FightState.Running);
      const inFight = sim.getUnits().find((u) => u.name === name)!;
      expect(inFight.shieldLeft).toBeGreaterThan(0);
      expect(inFight.shieldLeft).toBeLessThanOrEqual(full);
      checked = true;
    }
    expect(checked).toBe(true);
  });
});
