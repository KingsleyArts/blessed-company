// Run gear (director, Nov 21): in choice mode a found piece of gear waits for the player to pick the hero; otherwise it goes to the random
// hero as before. The random rolls are drawn either way, so the stream (and the soaks) never change.
import { describe, expect, it } from 'vitest';
import { RunFlow } from './runFlow';
import { parseRunSave, serializeRunSave } from './runSave';
import { GearSlot, gearKey } from './temple';

const drop = (f: RunFlow): void => (f as unknown as { dropGear(): void }).dropGear();
function started(choice: boolean): RunFlow {
  const f = new RunFlow();
  f.setGearChoice(choice);
  f.setStartParty(['Warrior', 'Mage', 'Priest']);
  f.start(5, false);
  return f;
}

describe('run gear choice', () => {
  it('without choice mode the gear goes straight to a random hero', () => {
    const f = started(false);
    drop(f);
    expect(f.getPendingGear()).toEqual([]);
    expect(f.consumeGearDrops().length).toBe(1);
    expect([...f.getDungeonGear().values()]).toEqual([1]);
  });

  it('in choice mode it waits, then goes to the hero the player picks', () => {
    const f = started(true);
    drop(f);
    expect(f.getDungeonGear().size).toBe(0);
    expect(f.consumeGearDrops()).toEqual([]);
    const pending = [...f.getPendingGear()];
    expect(pending.length).toBe(1);
    expect(f.assignGear(0, 'Nobody')).toBe(false);   // not in the party
    expect(f.assignGear(3, 'Mage')).toBe(false);      // no such piece
    expect(f.assignGear(0, 'Mage')).toBe(true);
    expect(f.getPendingGear().length).toBe(0);
    expect(f.getDungeonGear().get(gearKey('Mage', pending[0].slot))).toBe(1);
    expect(f.consumeGearDrops()).toEqual([{ className: 'Mage', slot: pending[0].slot, dungeonLevel: 1 }]);
  });

  it('the same seed rolls the same pieces in both modes, and the suggested hero is the old random pick', () => {
    const a = started(false), b = started(true);
    for (let i = 0; i < 6; ++i) { drop(a); drop(b); }
    const auto = a.consumeGearDrops();
    expect(b.getPendingGear().map((p) => [p.suggested, p.slot])).toEqual(auto.map((d) => [d.className, d.slot]));
  });

  it('pending gear survives a checkpoint and a run save, and pieces stack on one hero', () => {
    const f = started(true);
    drop(f); drop(f); drop(f);
    const cp = f.checkpoint();
    const back = parseRunSave(serializeRunSave({ flow: cp, units: [], gauge: 0 }))!;
    expect(back.flow.pendingGear).toEqual(cp.pendingGear);
    const g = new RunFlow();
    g.setGearChoice(true);
    g.setStartParty(['Warrior', 'Mage', 'Priest']);
    expect(g.restore(back.flow)).toBe(true);
    expect(g.getPendingGear()).toEqual(f.getPendingGear());
    const slot = g.getPendingGear()[0].slot;
    for (let i = 0; i < 3; ++i) g.assignGear(0, 'Warrior');
    const weapon = g.getDungeonGear().get(gearKey('Warrior', GearSlot.Weapon)) ?? 0;
    const armor = g.getDungeonGear().get(gearKey('Warrior', GearSlot.Armor)) ?? 0;
    expect(weapon + armor).toBe(3);
    expect(slot === GearSlot.Weapon || slot === GearSlot.Armor).toBe(true);
  });
});
