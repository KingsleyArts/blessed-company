// Port of tests/stat-resolver-event-bus/tests.cpp (resolver + event bus + class data), same cases and numbers.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyClassBase, findClass, parseClassDataCsv, threatWeight } from './classData';
import { classDataFromRecord } from './dataTypes';
import { csvToRecords } from './csv';
import { EventBus, eventDefaults, type ListenerHandle } from './eventBus';
import { ModKind, ModSource, StatId, StatResolver } from './statResolver';

const near = (a: number, b: number, eps = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(eps);
const nearF = (a: number, b: number): void => near(a, b, 1e-5); // class rows hold floats

describe('StatResolver', () => {
  it('formula order: (base + flat) * (1 + percent) * product(multipliers), with a per-stat cache', () => {
    const r = new StatResolver();
    r.setBase(StatId.Damage, 10);
    r.addModifier(StatId.Damage, ModKind.Flat, 5, ModSource.GoldUpgrade);
    r.addModifier(StatId.Damage, ModKind.Flat, 5, ModSource.Gear);
    r.addModifier(StatId.Damage, ModKind.Percent, 0.2, ModSource.Essence);
    r.addModifier(StatId.Damage, ModKind.Percent, 0.3, ModSource.Relic);
    r.addModifier(StatId.Damage, ModKind.Multiplier, 2, ModSource.Buff);
    r.addModifier(StatId.Damage, ModKind.Multiplier, 1.5, ModSource.Enrage);
    near(r.get(StatId.Damage), 90); // 20 * 1.5 * 3
    near(r.get(StatId.Health), 0);

    const before = r.recomputeCount();
    r.get(StatId.Damage);
    expect(r.recomputeCount()).toBe(before);
    r.addModifier(StatId.Damage, ModKind.Flat, 1, ModSource.Gear);
    r.get(StatId.Damage);
    expect(r.recomputeCount()).toBe(before + 1);
    r.get(StatId.Health);
    const afterHealth = r.recomputeCount();
    r.addModifier(StatId.Damage, ModKind.Flat, 1, ModSource.Gear);
    r.get(StatId.Health);
    expect(r.recomputeCount()).toBe(afterHealth); // modifying Damage does not dirty Health
  });

  it('removal by source and by id', () => {
    const r = new StatResolver();
    r.setBase(StatId.Health, 100);
    r.addModifier(StatId.Health, ModKind.Flat, 10, ModSource.GoldUpgrade);
    r.addModifier(StatId.Health, ModKind.Percent, 0.5, ModSource.Essence);
    r.addModifier(StatId.Damage, ModKind.Flat, 3, ModSource.Essence);
    near(r.get(StatId.Health), 165);
    near(r.get(StatId.Damage), 3);
    expect(r.modifierCountForSource(ModSource.Essence)).toBe(2);
    expect(r.removeBySource(ModSource.Essence)).toBe(2);
    near(r.get(StatId.Health), 110);
    near(r.get(StatId.Damage), 0);
    expect(r.modifierCount()).toBe(1);
    expect(r.removeBySource(ModSource.Essence)).toBe(0);
    const id = r.addModifier(StatId.Health, ModKind.Flat, 40, ModSource.Gear);
    near(r.get(StatId.Health), 150);
    expect(r.removeModifier(id)).toBe(true);
    expect(r.removeModifier(id)).toBe(false);
    near(r.get(StatId.Health), 110);
  });

  it('timed modifiers expire; permanent ones stay', () => {
    const r = new StatResolver();
    r.setBase(StatId.AttackSpeed, 1);
    r.addModifier(StatId.AttackSpeed, ModKind.Multiplier, 2, ModSource.Buff, 5);
    r.addModifier(StatId.AttackSpeed, ModKind.Flat, 0.5, ModSource.Gear);
    near(r.get(StatId.AttackSpeed), 3);
    expect(r.tick(2)).toBe(0);
    near(r.get(StatId.AttackSpeed), 3);
    expect(r.tick(3)).toBe(1);
    near(r.get(StatId.AttackSpeed), 1.5);
    expect(r.modifierCount()).toBe(1);
    expect(r.tick(1000)).toBe(0);
    near(r.get(StatId.AttackSpeed), 1.5);
  });

  it('clamps to the configured limits and invalidates the cache when limits change', () => {
    const r = new StatResolver();
    r.setBase(StatId.CritChance, 0.5);
    r.setLimits(StatId.CritChance, 0, 1);
    r.addModifier(StatId.CritChance, ModKind.Flat, 0.9, ModSource.GoldUpgrade);
    near(r.get(StatId.CritChance), 1);
    r.addModifier(StatId.CritChance, ModKind.Flat, -3, ModSource.Buff);
    near(r.get(StatId.CritChance), 0);
    r.setLimits(StatId.CritChance, -10, 10);
    near(r.get(StatId.CritChance), -1.6);
  });
});

describe('EventBus', () => {
  it('delivers in subscription order, by type, and unsubscribes', () => {
    const bus = new EventBus();
    const log: string[] = [];
    bus.subscribe('DamageDealt', (e) => log.push(`A:${Math.trunc(e.amount)}`));
    bus.subscribe('DamageDealt', () => log.push('B'));
    bus.subscribe('DamageDealt', () => log.push('C'));
    bus.subscribe('HealApplied', () => log.push('heal'));
    const d = { ...eventDefaults.DamageDealt, source: 1, target: 2, amount: 7 };
    bus.raise('DamageDealt', d);
    expect(log).toEqual(['A:7', 'B', 'C']);

    log.length = 0;
    const h: ListenerHandle = bus.subscribe('DamageDealt', () => log.push('D'));
    expect(bus.unsubscribe('DamageDealt', h)).toBe(true);
    bus.raise('DamageDealt', d);
    expect(log.length).toBe(3);
  });

  it('never re-enters: a raise inside a listener is queued until the current event finishes', () => {
    const bus = new EventBus();
    const log: string[] = [];
    let insideDamageDelivery = false;
    bus.subscribe('DamageDealt', () => {
      insideDamageDelivery = true;
      log.push('dmg1-start');
      bus.raise('UnitDied', { ...eventDefaults.UnitDied, unit: 2 });
      log.push('dmg1-end');
      expect(bus.pendingCount()).toBe(1);
      insideDamageDelivery = false;
    });
    bus.subscribe('DamageDealt', () => log.push('dmg2'));
    bus.subscribe('UnitDied', () => {
      expect(insideDamageDelivery).toBe(false);
      log.push('died');
      bus.raise('EnemyKilled', { ...eventDefaults.EnemyKilled, enemy: 2 });
      log.push('died-end');
    });
    bus.subscribe('EnemyKilled', () => log.push('killed'));
    bus.raise('DamageDealt', eventDefaults.DamageDealt);
    expect(log).toEqual(['dmg1-start', 'dmg1-end', 'dmg2', 'died', 'died-end', 'killed']);
    expect(bus.isDelivering()).toBe(false);
    expect(bus.pendingCount()).toBe(0);
  });

  it('copies the payload at raise time and skips listeners added during delivery', () => {
    const bus = new EventBus();
    const seen: number[] = [];
    const ev = { ...eventDefaults.DamageDealt, amount: 1 };
    bus.subscribe('DamageDealt', (e) => {
      seen.push(e.amount);
      bus.subscribe('DamageDealt', (e2) => seen.push(100 + e2.amount));
    });
    bus.raise('DamageDealt', ev);
    ev.amount = 99; // mutation after raise must not leak into queued deliveries
    expect(seen).toEqual([1]); // the late listener waits for the next event
    bus.raise('DamageDealt', { ...ev, amount: 2 });
    expect(seen).toEqual([1, 2, 102]);
  });

  it('unsubscribing from inside a listener takes effect for later events', () => {
    const bus = new EventBus();
    const log: string[] = [];
    let h: ListenerHandle = 0;
    h = bus.subscribe('FightStarted', () => {
      log.push('once');
      bus.unsubscribe('FightStarted', h);
    });
    bus.raise('FightStarted', eventDefaults.FightStarted);
    bus.raise('FightStarted', eventDefaults.FightStarted);
    expect(log).toEqual(['once']);
  });
});

describe('class data and the threat model (decision Nov 12)', () => {
  it('Warrior threat 1.5 is the Threat STAT; the hidden multiplier lives on the row', () => {
    const rows = parseClassDataCsv(
      'Name,RoleTag,BaseHP,BaseDamage,BaseAttackPerSec,BaseDefensePct,BaseThreat,ThreatMultiplier\n' +
        'Warrior,Tank,200,6,1.0,20,1.5,1.0\n' +
        'Barbarian,MeleeDPS,160,9,1.0,10,1.0,1.2\n' +
        'Mage,RangedDPS,80,16,0.7,0,1.0,1.0\n',
    );
    expect(rows.length).toBe(3);
    const war = findClass(rows, 'Warrior')!;
    const barb = findClass(rows, 'Barbarian')!;

    const rw = new StatResolver();
    applyClassBase(rw, war);
    near(rw.get(StatId.Threat), 1.5);
    near(rw.get(StatId.Health), 200);
    nearF(threatWeight(rw, war), 1.5);

    const rb = new StatResolver();
    applyClassBase(rb, barb);
    near(rb.get(StatId.Threat), 1); // the hidden 1.2 is NOT the stat...
    near(rb.get(StatId.Health), 160);
    nearF(threatWeight(rb, barb), 1.2); // ...it only shows up in the weight

    rw.addModifier(StatId.Threat, ModKind.Percent, 0.2, ModSource.Essence);
    nearF(threatWeight(rw, war), 1.8);
    rb.addModifier(StatId.Threat, ModKind.Percent, 0.2, ModSource.Essence);
    near(rb.get(StatId.Threat), 1.2);
    nearF(threatWeight(rb, barb), 1.44);

    const rows2 = parseClassDataCsv('Name,BaseThreat,ThreatMultiplier\nBarbarian,1.0,1.35\n');
    expect(rows2.length).toBe(1);
    const r2 = new StatResolver();
    applyClassBase(r2, rows2[0]);
    nearF(threatWeight(r2, rows2[0]), 1.35);

    // Malformed rows are skipped; column order does not matter.
    const rows3 = parseClassDataCsv('Name,BaseHP,BaseThreat\nOk,10,1.0\nBroken,abc,1.0\nShort\n');
    expect(rows3.length).toBe(1);
    expect(rows3[0].Name).toBe('Ok');
  });

  it('the real data/ClassData.csv: 6 classes, spec values, via both the native reader and the generated record loader', () => {
    const text = readFileSync('data/ClassData.csv', 'utf8');
    const viaReader = parseClassDataCsv(text);
    const viaRecords = csvToRecords(text).map(classDataFromRecord);
    expect(viaReader.length).toBe(6);
    expect(viaRecords.length).toBe(6);
    for (const rows of [viaReader, viaRecords]) {
      for (const c of rows) {
        near(c.BaseThreat, c.Name === 'Warrior' ? 1.5 : 1);
        nearF(c.ThreatMultiplier, c.Name === 'Barbarian' ? 1.5 : 1);
        expect(c.BaseStats.HP).toBeGreaterThan(0);
        const r = new StatResolver();
        applyClassBase(r, c);
        near(r.get(StatId.Health), c.BaseStats.HP);
      }
      const war = findClass(rows, 'Warrior')!;
      near(war.BaseStats.HP, 250);
      near(war.BaseStats.DefensePct, 40);
    }
    // The two loaders agree on every numeric field they share.
    viaReader.forEach((a, i) => {
      const b = viaRecords[i];
      expect([a.Name, a.BaseStats, a.BaseThreat, a.ThreatMultiplier, a.MoveSpeed, a.AttackRange, a.PreferredDistMin, a.PreferredDistMax, a.RetreatDistance])
        .toEqual([b.Name, b.BaseStats, b.BaseThreat, b.ThreatMultiplier, b.MoveSpeed, b.AttackRange, b.PreferredDistMin, b.PreferredDistMax, b.RetreatDistance]);
    });
    // Lists and enums come through the record loader.
    const priest = findClass(viaRecords, 'Priest')!;
    expect(priest.RoleTag).toBe('Healer');
    expect(priest.AllowedStats).toContain('HealPower');
    near(priest.SmiteThreshold, 0.85, 1e-6);
    expect(findClass(viaRecords, 'Warrior')!.AllowedTargetTypes).toEqual([]);
  });
});
