import { describe, expect, it } from 'vitest';
import { data } from './combatTestKit';
import { generate, makeConfig } from './floorGenerator';
import { makeMeta, parseMeta, serializeMeta } from './metaSave';
import { RunFlow } from './runFlow';
import { MemoryMetaStore, RunManager, makeRunManagerOptions } from './runManager';
import { parseRunSave, serializeRunSave } from './runSave';

const game = (store = new MemoryMetaStore()): RunManager => new RunManager(data, store, makeRunManagerOptions({ priestFromStart: true }));
const layout = (f: RunFlow): string => f.getRun().floor.nodes.map((n) => `${n.id}:${n.type}:${n.hasCrystal}:${n.isRescueRoom}`).join(',');
const storeWith = (edit: (m: ReturnType<typeof makeMeta>) => void): MemoryMetaStore => {
  const store = new MemoryMetaStore();
  const m = makeMeta();
  edit(m);
  store.save(serializeMeta(m));
  return store;
};

describe('Priestess from the start', () => {
  it('a new game starts Warrior, Mage and Priestess on the small first floor', () => {
    const rm = game();
    rm.startNewRun(21);
    const run = rm.getFlow().getRun();
    expect(run.party).toEqual(['Warrior', 'Mage', 'Priest']);
    expect(run.floor.isTutorial).toBe(true);
  });

  it('no floor is a rescue floor, for new or returning players', () => {
    for (const small of [true, false]) {
      for (let seed = 1; seed <= 40; seed++) {
        const f = new RunFlow();
        f.setPriestStart(small);
        f.start(seed, false, 2);
        expect(f.getRun().floor.isRescueLayout).toBe(false);
        expect(f.getRun().floor.rescueNode).toBe(-1);
        expect(f.getRun().floor.isTutorial).toBe(false);
      }
    }
  });

  it('the small first floor stops once the player has reached floor 2', () => {
    const rm = game(storeWith((m) => { m.bestFloor = 2; }));
    rm.startNewRun(21);
    expect(rm.getFlow().getRun().floor.isTutorial).toBe(false);
  });

  it('an older save gets her in a free slot and keeps a full party as it was', () => {
    const open = storeWith((m) => { m.activeParty = ['Warrior', 'Assassin']; });
    game(open).grantStartingPriest();
    const a = parseMeta(open.load()!).meta;
    expect(a.priestUnlocked).toBe(true);
    expect(a.activeParty).toEqual(['Warrior', 'Assassin', 'Priest']);

    const full = storeWith((m) => { m.activeParty = ['Warrior', 'Mage', 'Assassin']; });
    game(full).grantStartingPriest();
    const b = parseMeta(full.load()!).meta;
    expect(b.priestUnlocked).toBe(true);
    expect(b.activeParty).toEqual(['Warrior', 'Mage', 'Assassin']);
  });

  it('benching her is kept', () => {
    const store = new MemoryMetaStore();
    const rm = game(store);
    rm.grantStartingPriest();
    expect(rm.setParty(['Warrior', 'Mage'])).toBe(true);
    rm.grantStartingPriest();
    expect(rm.getParty()).toEqual(['Warrior', 'Mage']);
  });

  it('a saved run resumes on the same floor', () => {
    const a = new RunFlow();
    a.setStartParty(['Warrior', 'Mage', 'Priest']);
    a.setPriestStart(true);
    a.start(33, false);
    const text = serializeRunSave({ flow: a.checkpoint(), units: [], gauge: 0 });
    const b = new RunFlow();
    expect(b.restore(parseRunSave(text)!.flow)).toBe(true);
    expect(layout(b)).toBe(layout(a));
    expect(b.checkpoint().priestStartTutorial).toBe(true);
  });

  it('a run saved under the rescue rules keeps its rescue room', () => {
    const a = new RunFlow();
    a.start(33, false, 2);
    expect(a.getRun().floor.rescueNode).toBeGreaterThanOrEqual(0);
    const text = serializeRunSave({ flow: a.checkpoint(), units: [], gauge: 0 });
    const b = new RunFlow();
    expect(b.restore(parseRunSave(text)!.flow)).toBe(true);
    expect(layout(b)).toBe(layout(a));
  });

  it('leaves the original rules alone unless switched on', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    rm.grantStartingPriest();
    rm.startNewRun(21);
    expect(rm.getFlow().getRun().party).toEqual(['Warrior', 'Mage']);
    expect(generate(21, 2, makeConfig()).isRescueLayout).toBe(true);
  });
});
