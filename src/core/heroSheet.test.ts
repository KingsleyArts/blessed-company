// The Heroes screen's sheets (Nov 19): the stats shown are the stats a hero starts a fight with (class base + Temple blessings +
// Temple gear), Crit Factor starts at 150% once unlocked, and the party rules hold.
import { describe, expect, it } from 'vitest';
import { data } from './combatTestKit';
import { heroStatLines } from './heroSheet';
import { MemoryMetaStore, RunManager } from './runManager';

const value = (rm: RunManager, cls: string, key: string): string =>
  rm.getHeroes().find((h) => h.className === cls)!.stats.find((s) => s.key === key)!.value;

describe('hero sheets', () => {
  it('a new save shows the class base stats, crit stats locked, and who is owned', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    const heroes = rm.getHeroes();
    expect(heroes.map((h) => h.className)).toEqual(['Warrior', 'Mage', 'Assassin', 'Priest', 'Barbarian', 'Summoner']);
    const w = heroes[0];
    expect(w.stats.map((s) => [s.key, s.value])).toEqual([
      ['Health', '250'], ['Damage', '6'], ['AttackSpeed', '1.00/s'], ['DefensePct', '40%'], ['CritChance', 'Locked'], ['CritFactor', 'Locked'],
    ]);
    expect(w.role).toBe('Tank');
    expect(w.skills.map((s) => s.name)).toEqual(['Sword Strike', 'Taunt']);   // Cleave exists in AbilityData but no class lists it (ClassData ExtraAbilityIds is empty)
    expect(heroes.filter((h) => h.owned).map((h) => h.className)).toEqual(['Warrior', 'Mage', 'Assassin']);
    expect(heroes.find((h) => h.className === 'Priest')!.note).toBe('Rescue her on floor 2');
    expect(heroes.find((h) => h.className === 'Barbarian')!.owned).toBe(false);
  });

  it('Crit Factor starts at 150% once unlocked (director, Nov 19)', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    rm.getMeta().gold = 1e9;
    expect(rm.templeBuy('Stat:CritFactor')).toBe(true);
    expect(value(rm, 'Warrior', 'CritFactor')).toBe('150%');
    expect(rm.templeBuy('Level:CritFactor', 10)).toBe(true);
    expect(value(rm, 'Warrior', 'CritFactor')).not.toBe('150%');
  });

  it('the sheet equals the hero at the start of a real fight, after blessings and gear', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    rm.getMeta().gold = 1e9;
    for (const id of ['Stat:CritChance', 'Stat:CritFactor', 'Stat:DefensePct']) expect(rm.templeBuy(id), id).toBe(true);
    for (const id of ['Level:Damage', 'Level:Health', 'Level:AttackSpeed', 'Level:CritChance', 'Level:CritFactor', 'Level:DefensePct']) {
      expect(rm.templeBuy(id, 7), id).toBe(true);
    }
    for (const id of ['Gear:Warrior:0', 'Gear:Warrior:1', 'Gear:Mage:0', 'Gear:Assassin:1']) expect(rm.templeBuy(id), id).toBe(true);
    expect(rm.setParty(['Warrior', 'Mage', 'Assassin'])).toBe(true);
    const sheets = rm.getHeroes();
    expect(sheets[0].stats.find((s) => s.key === 'Damage')!.value).not.toBe('6');   // the purchases moved the numbers
    rm.startRunWithFights(4);
    const sim = rm.getSim()!;
    const unlocked = (stat: string): boolean => rm.getMeta().unlockedStats.includes(stat);
    for (const u of sim.getUnits().filter((x) => !x.enemy && !x.summon)) {
      const sheet = sheets.find((h) => h.className === u.name)!;
      expect(heroStatLines(u.stats, unlocked), u.name).toEqual(sheet.stats);
    }
  });

  it('party rules: 1 to 3 owned heroes, no repeats; Auto Party takes a tank, a healer, then damage', () => {
    const rm = new RunManager(data, new MemoryMetaStore());
    expect(rm.setParty([])).toBe(false);
    expect(rm.setParty(['Warrior', 'Warrior'])).toBe(false);
    expect(rm.setParty(['Warrior', 'Barbarian'])).toBe(false);
    expect(rm.setParty(['Priest'])).toBe(false);
    expect(rm.setParty(['Assassin'])).toBe(true);
    expect(rm.getHeroes().filter((h) => h.active).map((h) => h.className)).toEqual(['Assassin']);
    expect(rm.autoParty()).toEqual(['Warrior', 'Mage', 'Assassin']);
    rm.getMeta().priestUnlocked = true;
    expect(rm.autoParty()).toEqual(['Warrior', 'Priest', 'Mage']);
  });
});
