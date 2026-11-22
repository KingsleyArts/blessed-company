// Permanent gear (director, Nov 22): upgrades are permanent levels rolled against a chance that falls as a slot outgrows the floor.
import { describe, expect, it } from 'vitest';
import { RunFlow } from './runFlow';
import { parseRunSave, serializeRunSave } from './runSave';
import { upgradeChance } from './gearUpgrade';
import { data } from './combatTestKit';
import { MemoryMetaStore, RunManager, makeRunManagerOptions } from './runManager';
import { parseMeta } from './metaSave';
import { GearSlot, gearKey } from './temple';

const drop = (f: RunFlow, boss = false): void => (f as unknown as { dropGear(b: boolean): void }).dropGear(boss);
function started(levels: Map<string, number>, choice = true): RunFlow {
  const f = new RunFlow();
  f.setGearChoice(choice);
  f.setPermanentGear(levels);
  f.setStartParty(['Warrior', 'Mage', 'Priest']);
  f.start(5, false);
  return f;
}

describe('permanent gear', () => {
  it('a guaranteed upgrade raises the permanent level, not the dungeon level', () => {
    const levels = new Map<string, number>();
    const f = started(levels);
    drop(f);
    const slot = f.getPendingGear()[0].slot;
    expect(f.upgradeChanceFor('Mage', slot)).toBe(1);
    expect(f.assignGear(0, 'Mage')).toBe(true);
    expect(levels.get(gearKey('Mage', slot))).toBe(1);
    expect(f.getDungeonGear().size).toBe(0);
    expect(f.consumeGearDrops()).toEqual([{ className: 'Mage', slot, dungeonLevel: 1, landed: true }]);
  });

  it('a high slot is a long shot on floor 1 and a failed roll uses the drop up', () => {
    let fails = 0, lands = 0;
    for (let seed = 1; seed <= 60; ++seed) {
      const f = new RunFlow();
      f.setGearChoice(true);
      const levels = new Map([[gearKey('Mage', GearSlot.Weapon), 9], [gearKey('Mage', GearSlot.Armor), 9]]);
      f.setPermanentGear(levels);
      f.setStartParty(['Mage']);
      f.start(seed, false);
      drop(f);
      const slot = f.getPendingGear()[0].slot;
      expect(f.upgradeChanceFor('Mage', slot)).toBeCloseTo(upgradeChance(9, 1));
      f.assignGear(0, 'Mage');
      const d = f.consumeGearDrops()[0];
      if (d.landed) { ++lands; expect(levels.get(gearKey('Mage', slot))).toBe(10); } else { ++fails; expect(levels.get(gearKey('Mage', slot))).toBe(9); expect(d.dungeonLevel).toBe(9); }
      expect(f.getPendingGear().length).toBe(0);
    }
    expect(fails).toBeGreaterThan(40);
    expect(lands).toBeGreaterThan(0);
  });

  it('fallen heroes can be picked: any hero of the run party', () => {
    const f = started(new Map());
    drop(f);
    expect(f.assignGear(0, 'Priest')).toBe(true);
  });

  it('the boss reward goes to every hero, each on their own chance', () => {
    const levels = new Map<string, number>();
    const f = started(levels);
    drop(f, true);
    const p = f.getPendingGear()[0];
    expect(p.party).toBe(true);
    levels.set(gearKey('Mage', p.slot), 40);   // a hopeless slot keeps the 5% floor
    expect(f.assignGear(0, 'Warrior')).toBe(true);
    const drops = f.consumeGearDrops();
    expect(drops.map((d) => d.className)).toEqual(['Warrior', 'Mage', 'Priest']);
    expect(levels.get(gearKey('Warrior', p.slot))).toBe(1);
    expect(levels.get(gearKey('Priest', p.slot))).toBe(1);
  });

  it('Auto suggests the hero with the best chance', () => {
    const levels = new Map<string, number>();
    const f = started(levels);
    for (const slot of [GearSlot.Weapon, GearSlot.Armor]) { levels.set(gearKey('Warrior', slot), 9); levels.set(gearKey('Mage', slot), 9); }
    drop(f);
    expect(f.getPendingGear()[0].suggested).toBe('Priest');
  });

  it('a pending boss reward survives a run save', () => {
    const f = started(new Map());
    drop(f, true);
    const cp = f.checkpoint();
    const back = parseRunSave(serializeRunSave({ flow: cp, units: [], gauge: 0 }))!;
    expect(back.flow.pendingGear?.[0].party).toBe(true);
  });

  it('outside permanent mode nothing changes: chance is 1 and levels are dungeon levels', () => {
    const f = new RunFlow();
    f.setStartParty(['Warrior']);
    f.start(5, false);
    expect(f.permanentGear()).toBe(false);
    expect(f.upgradeChanceFor('Warrior', GearSlot.Weapon)).toBe(1);
  });
});

describe('permanent gear in the run manager', () => {
  const mk = (store = new MemoryMetaStore()): RunManager => new RunManager(data, store, makeRunManagerOptions({ priestFromStart: true, gearChoice: true, permanentGear: true }));
  it('a landed upgrade is saved to the meta and the Equipment tab shows levels gained, not a shop', () => {
    const store = new MemoryMetaStore();
    const rm = mk(store);
    rm.startNewRun(21);
    (rm.getFlow() as unknown as { dropGear(b: boolean): void }).dropGear(false);
    const slot = rm.getPendingGear()[0].slot;
    expect(rm.assignPendingGear('Warrior')).toBe(true);
    expect(rm.getMeta().gearLevels.get(gearKey('Warrior', slot))).toBe(1);
    expect(parseMeta(store.load()!).meta.gearLevels.get(gearKey('Warrior', slot))).toBe(1);
    expect(rm.gearSlotLevel('Warrior', slot)).toBe(1);
    expect(rm.lastGearDropText).toContain('+1');
    rm.abandonRun();
    const snap = rm.getTempleSnapshot(1);
    const gear = snap.items.filter((i) => i.column === 0);
    expect(gear.length).toBeGreaterThan(0);
    expect(gear.every((i) => i.gained && !i.canBuy)).toBe(true);
    expect(gear.find((i) => i.id === `Gear:Warrior:${slot}`)?.level).toBe(1);
    expect(rm.templeBuy(`Gear:Warrior:${slot}`)).toBe(false);
  });
  it('Temple gear bought before this change carries over as levels gained', () => {
    const rm = mk(new MemoryMetaStore());
    rm.getMeta().gearLevels.set('Mage.Armor', 3);
    rm.startNewRun(21);
    expect(rm.gearSlotLevel('Mage', GearSlot.Armor)).toBe(3);
    expect(rm.getFlow().upgradeChanceFor('Mage', GearSlot.Armor)).toBeCloseTo(upgradeChance(3, 1));   // a level-3 slot is a long shot on floor 1
  });
});
