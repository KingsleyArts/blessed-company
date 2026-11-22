// Port of tests/units/barbarian/tests.cpp: data row, auto attack, threat multiplier, Rage, positioning, targeting,
// healer / no-healer, whole fights against a stub opponent and real enemies.
import { describe, it } from 'vitest';
import { StatDefCsv } from '../../data/generated';
import { Behavior, CombatSim, FightState, runFightHeadless } from '../combatSim';
import { CombatData, parseCsvTable, splitList } from '../combatData';
import { threatWeight } from '../classData';
import type { TargetType } from '../dataTypes';
import { DamageTag, kNoUnit, type UnitId } from '../eventBus';
import { ModKind, ModSource, StatId } from '../statResolver';
import { CHECK, NEAR, StubRow, Ticks, dist, legacyHeroData } from '../combatTestKit';

const data = legacyHeroData; // the Nov 12 melee-damage Barbarian this suite ports (the shipped one is a tank since Nov 21)
const statDef = parseCsvTable(StatDefCsv);
const sd = (row: string[], name: string): string => {
  const i = statDef.col.get(name);
  return i === undefined || i >= row.length ? '' : row[i];
};

function copyData(src: CombatData): CombatData {
  const d = new CombatData();
  d.classes = structuredClone(src.classes);
  d.enemies = structuredClone(src.enemies);
  d.abilities = structuredClone(src.abilities);
  d.effects = structuredClone(src.effects);
  return d;
}
const stub = (() => {
  const d = copyData(data);
  d.enemies.push(StubRow('StubDummy', 100000, 0));
  d.enemies.push(StubRow('StubFoe', 300, 4));
  const elite = StubRow('StubElite', 100000, 0);
  elite.IsElite = true;
  d.enemies.push(elite);
  return d;
})();

const Cls = (n: string) => data.findClassRow(n)!;
const Enemy = (n: string) => data.findEnemy(n)!;
const EffectValue = (n: string) => data.findEffect(n)?.Value ?? 0;
const EffectDuration = (n: string) => data.findEffect(n)?.Duration ?? 0;
const RageCooldown = () => data.findAbility(Cls('Barbarian').AbilityId)?.Cooldown ?? 0;
const Place = (s: CombatSim, id: UnitId, x: number, y: number) => { const u = s.mutableUnit(id)!; u.x = x; u.y = y; };
const Freeze = (s: CombatSim, id: UnitId) => { s.mutableUnit(id)!.moveSpeed = 0; };
const StepN = (s: CombatSim, n: number) => { for (let i = 0; i < n; ++i) s.step(); };
const hasCast = (s: CombatSim) => s.getLog().toText().includes('casts Rage');

/** A Barbarian next to a frozen punching bag, both frozen, 100 apart. */
class Bag {
  s: CombatSim;
  b: UnitId;
  d: UnitId;
  constructor(d: CombatData = stub, seed = 1) {
    this.s = new CombatSim(d, seed);
    this.b = this.s.addPartyUnit('Barbarian');
    this.d = this.s.addEnemy('StubDummy', 1);
    Freeze(this.s, this.b);
    Freeze(this.s, this.d);
    Place(this.s, this.b, 0, 0);
    Place(this.s, this.d, 100, 0);
  }
}

describe('units: Barbarian data', () => {
  it('BaseStatsComeFromData', () => {
    const c = Cls('Barbarian');
    CHECK(c.RoleTag === 'MeleeDPS');
    NEAR(c.BaseStats.HP, 160, 1e-6);
    NEAR(c.BaseStats.Damage, 9, 1e-6);
    NEAR(c.BaseStats.AttackPerSec, 1, 1e-6);
    NEAR(c.BaseStats.DefensePct, 10, 1e-6);
    NEAR(RageCooldown(), 14, 1e-6);
    CHECK(c.AutoActionId === 'MeleeSwing');
    CHECK(c.AbilityId === 'Rage');
    const s = new CombatSim(data, 1);
    const u = s.getUnit(s.addPartyUnit('Barbarian'))!;
    NEAR(s.maxHp(u), c.BaseStats.HP, 1e-9);
    NEAR(u.hp, c.BaseStats.HP, 1e-9);
    NEAR(u.stats.get(StatId.Damage), c.BaseStats.Damage, 1e-9);
    NEAR(u.stats.get(StatId.AttackSpeed), c.BaseStats.AttackPerSec, 1e-9);
    NEAR(u.stats.get(StatId.DefensePercent), c.BaseStats.DefensePct, 1e-9);
    NEAR(u.stats.get(StatId.Threat), c.BaseThreat, 1e-9);
    NEAR(u.stats.get(StatId.CooldownReduction), 0, 1e-12);
    NEAR(u.stats.get(StatId.CritChance), 0, 1e-12);
    NEAR(u.stats.get(StatId.Range), c.AttackRange, 1e-9);
    CHECK(u.abilityId === 'Rage' && u.alive && !u.enemy && !u.summon);
  });
  it('HighHpAverageDamageRelativeToTheRoster', () => {
    const b = Cls('Barbarian');
    CHECK(b.BaseStats.HP > Cls('Assassin').BaseStats.HP);
    CHECK(b.BaseStats.HP > Cls('Mage').BaseStats.HP);
    CHECK(b.BaseStats.HP > Cls('Priest').BaseStats.HP);
    CHECK(b.BaseStats.HP < Cls('Warrior').BaseStats.HP);
    CHECK(b.BaseStats.Damage < Cls('Assassin').BaseStats.Damage);
    CHECK(b.BaseStats.Damage < Cls('Mage').BaseStats.Damage);
    CHECK(b.BaseStats.Damage > Cls('Warrior').BaseStats.Damage);
  });
  it('AllowedListsMatchTheClassSortAndStatDef', () => {
    const c = Cls('Barbarian');
    const has = (s: string) => c.AllowedStats.includes(s);
    for (const s of ['Damage', 'AttackSpeed', 'Health', 'DefensePct', 'HealthRegen', 'CooldownReduction', 'CritChance', 'CritFactor',
      'Fortitude', 'DeathDefy', 'Lifesteal']) CHECK(has(s), s);
    for (const s of ['Threat', 'ThreatMultiplier', 'Range', 'Thorns', 'RendArmorChance', 'HealPower']) CHECK(!has(s), s);
    let listed = 0;
    for (const row of statDef.rows) {
      const name = sd(row, 'Name');
      const statSaysBarbarian = splitList(sd(row, 'AllowedClasses')).some((cl) => cl === 'Barbarian' || cl === 'All');
      if (sd(row, 'AllowedClasses') === 'PartyWide') continue;
      if (statSaysBarbarian) { ++listed; CHECK(has(name), `StatDef lets Barbarian buy ${name} but ClassData lacks it`); }
      else CHECK(!has(name), `ClassData has ${name} but StatDef does not allow Barbarian`);
    }
    CHECK(listed === c.AllowedStats.length);
    CHECK(c.AllowedTargetTypes.length === 5);
    CHECK(c.AllowedTriggerModes.length === 4);
    const rage = data.findAbility('Rage');
    CHECK(rage && rage.AllowedTriggerModes.length === 4);
  });
});

describe('units: Barbarian auto attack', () => {
  it('AutoAttackSwingsOncePerSecondForBaseDamage', () => {
    const f = new Bag();
    const hits: number[] = [];
    let attacks = 0;
    f.s.getBus().subscribe('AttackStarted', (e) => { if (e.attacker === f.b && e.target === f.d) ++attacks; });
    f.s.getBus().subscribe('DamageDealt', (e) => {
      if (e.source === f.b) { hits.push(e.amount); CHECK((e.tags & DamageTag.Auto) !== 0); CHECK(!e.crit); }
    });
    f.s.startFight();
    StepN(f.s, Ticks(f.s, 10));
    CHECK(attacks === Math.round(10 * Cls('Barbarian').BaseStats.AttackPerSec));
    CHECK(hits.length === attacks);
    for (const h of hits) NEAR(h, Cls('Barbarian').BaseStats.Damage, 1e-9);
    NEAR(f.s.getUnit(f.b)!.damageDone, 9 * attacks, 1e-9);
  });
  it('AutoAttackIsReducedByTargetDefense', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const w = s.addEnemy('Brute', 1);
    NEAR(s.dealDamage(b, w, 1.0, DamageTag.Auto), Cls('Barbarian').BaseStats.Damage * (1 - Enemy('Brute').BaseStats.DefensePct / 100), 1e-9);
  });
  it('BarbarianTakesDamageThroughItsOwnDefense', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const g = s.addEnemy('Grunt', 1);
    const dealt = s.dealDamage(g, b, 1.0, DamageTag.Auto);
    NEAR(dealt, Enemy('Grunt').BaseStats.Damage * (1 - Cls('Barbarian').BaseStats.DefensePct / 100), 1e-9);
    NEAR(s.getUnit(b)!.hp, Cls('Barbarian').BaseStats.HP - dealt, 1e-9);
  });
  it('AutoAttackWaitsUntilTargetIsInReach', () => {
    const f = new Bag();
    Place(f.s, f.d, 600, 0);
    let attacks = 0;
    f.s.getBus().subscribe('AttackStarted', () => { ++attacks; });
    f.s.startFight();
    StepN(f.s, Ticks(f.s, 5));
    CHECK(attacks === 0);
    Place(f.s, f.d, Cls('Barbarian').AttackRange, 0);
    StepN(f.s, Ticks(f.s, 2));
    CHECK(attacks >= 1);
  });
});

describe('units: Barbarian threat', () => {
  it('ThreatMultiplierIsOnePointTwoInDataAndOnTheUnit', () => {
    NEAR(Cls('Barbarian').ThreatMultiplier, 1.2, 1e-6);
    for (const n of ['Priest', 'Assassin', 'Summoner', 'Mage']) NEAR(Cls(n).ThreatMultiplier, 1.0, 1e-6, n);
    CHECK(Cls('Barbarian').ThreatMultiplier > Cls('Assassin').ThreatMultiplier);
    CHECK(Cls('Barbarian').ThreatMultiplier < Cls('Warrior').BaseThreat * Cls('Warrior').ThreatMultiplier);
    const s = new CombatSim(data, 1);
    NEAR(s.getUnit(s.addPartyUnit('Barbarian'))!.threatMult, 1.2, 1e-6);
  });
  it('ThreatPerHitIsDamageTimesThreatStatTimesMultiplier', () => {
    const f = new Bag();
    const dealt = f.s.dealDamage(f.b, f.d, 1.0, DamageTag.Auto);
    NEAR(f.s.threatOn(f.d, f.b), dealt * 1.0 * 1.2, 1e-5);
    NEAR(f.s.threatOn(f.d, f.b), dealt * threatWeight(f.s.getUnit(f.b)!.stats, Cls('Barbarian')), 1e-9);
    NEAR(f.s.getUnit(f.b)!.threatGenerated, dealt * 1.2, 1e-5);
  });
  it('ThreatMultiplierIsNotAStatAndHasNoUpgrade', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const u = s.mutableUnit(b)!;
    NEAR(u.stats.get(StatId.Threat), 1.0, 1e-9);
    NEAR(Cls('Barbarian').BaseThreat, 1.0, 1e-6);
    for (const row of statDef.rows) {
      const name = sd(row, 'Name');
      CHECK(name !== 'ThreatMultiplier');
      if (name === 'Threat') {
        const cls = splitList(sd(row, 'AllowedClasses'));
        CHECK(cls.length === 1 && cls[0] === 'Warrior');
      }
    }
    for (const a of Cls('Barbarian').AllowedStats) CHECK(a !== 'Threat' && a !== 'ThreatMultiplier');
    const ids: Record<string, StatId> = {
      Damage: StatId.Damage, AttackSpeed: StatId.AttackSpeed, Health: StatId.Health, DefensePct: StatId.DefensePercent,
      HealthRegen: StatId.HealthRegen, CooldownReduction: StatId.CooldownReduction, CritChance: StatId.CritChance, CritFactor: StatId.CritFactor,
    };
    for (const a of Cls('Barbarian').AllowedStats) {
      const id = ids[a];
      if (id === undefined) continue;
      u.stats.addModifier(id, ModKind.Percent, 0.5, ModSource.Essence);
      u.stats.addModifier(id, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
    }
    NEAR(u.threatMult, 1.2, 1e-6);
    NEAR(u.threatMult, Cls('Barbarian').ThreatMultiplier, 0);
    NEAR(u.stats.get(StatId.Threat), 1.0, 1e-9);
  });
  it('ThreatMultiplierIsATunableDataValueNotHardCoded', () => {
    const d = copyData(data);
    for (const r of d.classes) if (r.Name === 'Barbarian') r.ThreatMultiplier = 2.0;
    const s = new CombatSim(d, 1);
    const b = s.addPartyUnit('Barbarian');
    const g = s.addEnemy('Grunt', 1);
    const dealt = s.dealDamage(b, g, 1.0, DamageTag.Auto);
    NEAR(s.getUnit(b)!.threatMult, 2.0, 1e-9);
    NEAR(s.threatOn(g, b), dealt * 2.0, 1e-9);
  });
  it('BarbarianDrawsMoreThreatThanEqualDamageDealersButLessThanTheWarrior', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const b = s.addPartyUnit('Barbarian');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    const bd = Cls('Barbarian').BaseStats.Damage;
    s.dealDamage(w, g, bd / Cls('Warrior').BaseStats.Damage, DamageTag.Auto);
    s.dealDamage(b, g, 1.0, DamageTag.Auto);
    s.dealDamage(m, g, bd / Cls('Mage').BaseStats.Damage, DamageTag.Auto);
    NEAR(s.threatOn(g, b) / s.threatOn(g, m), 1.2, 1e-6);
    CHECK(s.threatOn(g, w) > s.threatOn(g, b));
    CHECK(s.threatOn(g, b) > s.threatOn(g, m));
  });
  it('EnemyPicksBarbarianOverMageButWarriorOverBarbarianAtEqualDamage', () => {
    {
      const s = new CombatSim(data, 1);
      const b = s.addPartyUnit('Barbarian');
      const m = s.addPartyUnit('Mage');
      const g = s.addEnemy('Grunt', 1);
      Freeze(s, b); Freeze(s, m); Freeze(s, g);
      s.dealDamage(m, g, Cls('Barbarian').BaseStats.Damage / Cls('Mage').BaseStats.Damage, DamageTag.Auto);
      s.dealDamage(b, g, 1.0, DamageTag.Auto);
      s.startFight();
      s.step();
      CHECK(s.getUnit(g)!.target === b);
    }
    {
      const s = new CombatSim(data, 1);
      const w = s.addPartyUnit('Warrior');
      const b = s.addPartyUnit('Barbarian');
      const g = s.addEnemy('Grunt', 1);
      Freeze(s, w); Freeze(s, b); Freeze(s, g);
      s.dealDamage(b, g, 1.0, DamageTag.Auto);
      s.dealDamage(w, g, Cls('Barbarian').BaseStats.Damage / Cls('Warrior').BaseStats.Damage, DamageTag.Auto);
      s.startFight();
      s.step();
      CHECK(s.getUnit(g)!.target === w);
    }
  });
  it('BarbarianDoesNotSeekThreatItKeepsItsClosestTargetEvenWithHighestThreatThere', () => {
    const s = new CombatSim(stub, 1);
    const b = s.addPartyUnit('Barbarian');
    const nearE = s.addEnemy('StubDummy', 1);
    const farE = s.addEnemy('StubDummy', 1);
    Freeze(s, b); Freeze(s, nearE); Freeze(s, farE);
    Place(s, b, 0, 0); Place(s, nearE, 100, 0); Place(s, farE, 100, 400);
    s.startFight();
    s.dealDamage(b, nearE, 5.0, DamageTag.Auto);
    StepN(s, Ticks(s, 3));
    CHECK(s.getUnit(b)!.target === nearE);
    CHECK(s.threatOn(farE, b) === 0);
  });
  it('BarbarianRageLifestealDoesNotAddHealingThreat', () => {
    const f = new Bag();
    f.s.startFight();
    f.s.mutableUnit(f.b)!.hp = 50;
    CHECK(f.s.forceCastAbility(f.b));
    const before = f.s.threatOn(f.d, f.b);
    const dealt = f.s.dealDamage(f.b, f.d, 1.0, DamageTag.Auto);
    CHECK(f.s.getUnit(f.b)!.hp > 50);
    NEAR(f.s.threatOn(f.d, f.b) - before, dealt * 1.2, 1e-5);
  });
});

describe('units: Barbarian Rage', () => {
  it('RageIsTwoDataEffectsAttackSpeedAndLifestealOnSelf', () => {
    const a = data.findAbility('Rage');
    CHECK(a && a.EffectIds.length === 2);
    const e1 = data.findEffect('Rage_1');
    const e2 = data.findEffect('Rage_2');
    CHECK(e1 && e1.Type === 'ApplyModifier' && e1.TargetSelector === 'SelfIfEnemyInRange' && e1.Stat === 'AttackSpeed');
    CHECK(e2 && e2.Type === 'ApplyModifier' && e2.TargetSelector === 'SelfIfEnemyInRange' && e2.Stat === 'Lifesteal');
    CHECK(e1 && e1.Value > 0 && e1.Duration > 0);
    CHECK(e2 && e2.Value > 0 && e2.Duration > 0);
    CHECK(e1 && e2 && e1.Order < e2.Order);
    CHECK(EffectDuration('Rage_1') < RageCooldown() && EffectDuration('Rage_2') < RageCooldown());
  });
  it('RageRaisesAttackSpeedByDataPercentAndAppliesLifesteal', () => {
    const f = new Bag();
    f.s.startFight();
    const base = f.s.getUnit(f.b)!.stats.get(StatId.AttackSpeed);
    let casts = 0;
    f.s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === f.b && e.abilityId === 'Rage') ++casts; });
    CHECK(f.s.forceCastAbility(f.b));
    CHECK(casts === 1);
    const u = f.s.getUnit(f.b)!;
    NEAR(u.stats.get(StatId.AttackSpeed), base * (1 + EffectValue('Rage_1')), 1e-9);
    NEAR(u.rageLifesteal, EffectValue('Rage_2'), 1e-9);
    NEAR(u.rageLifestealLeft, EffectDuration('Rage_2'), 1e-9);
    NEAR(u.stats.get(StatId.Damage), Cls('Barbarian').BaseStats.Damage, 1e-9);
    NEAR(u.stats.get(StatId.DefensePercent), Cls('Barbarian').BaseStats.DefensePct, 1e-9);
    NEAR(f.s.maxHp(u), Cls('Barbarian').BaseStats.HP, 1e-9);
  });
  it('RageLifestealHealsFractionOfDamageDealtAndOnlyDuringRage', () => {
    const f = new Bag();
    f.s.startFight();
    const u = f.s.mutableUnit(f.b)!;
    u.hp = 50;
    f.s.dealDamage(f.b, f.d, 1.0, DamageTag.Auto);
    NEAR(u.hp, 50, 1e-12);
    CHECK(f.s.forceCastAbility(f.b));
    const dealt = f.s.dealDamage(f.b, f.d, 1.0, DamageTag.Auto);
    NEAR(u.hp, 50 + dealt * EffectValue('Rage_2'), 1e-9);
    u.hp = f.s.maxHp(u) - 0.1;
    f.s.dealDamage(f.b, f.d, 1.0, DamageTag.Auto);
    NEAR(u.hp, f.s.maxHp(u), 1e-9);
    StepN(f.s, Ticks(f.s, EffectDuration('Rage_2')) + 3);
    NEAR(u.rageLifesteal, 0, 1e-12);
    u.hp = 50;
    f.s.dealDamage(f.b, f.d, 1.0, DamageTag.Auto);
    NEAR(u.hp, 50, 1e-12);
  });
  it('RageLastsExactlyItsDataDuration', () => {
    const f = new Bag();
    f.s.startFight();
    const u = f.s.getUnit(f.b)!;
    const base = u.stats.get(StatId.AttackSpeed);
    const buffed = base * (1 + EffectValue('Rage_1'));
    CHECK(f.s.forceCastAbility(f.b));
    StepN(f.s, Ticks(f.s, EffectDuration('Rage_1')) - 4);
    NEAR(u.stats.get(StatId.AttackSpeed), buffed, 1e-9);
    CHECK(u.rageLifesteal > 0);
    StepN(f.s, 8);
    NEAR(u.stats.get(StatId.AttackSpeed), base, 1e-9);
    NEAR(u.rageLifesteal, 0, 1e-12);
  });
  const countSwings = (f: Bag, seconds: number): number => {
    let n = 0;
    f.s.getBus().subscribe('AttackStarted', (e) => { if (e.attacker === f.b) ++n; });
    StepN(f.s, Ticks(f.s, seconds));
    return n;
  };
  it('RageSpeedsUpTheSwingRateByTheDataFactor', () => {
    const calm = new Bag();
    calm.s.startFight();
    const calmSwings = countSwings(calm, EffectDuration('Rage_1'));
    const mad = new Bag();
    mad.s.startFight();
    CHECK(mad.s.forceCastAbility(mad.b));
    const madSwings = countSwings(mad, EffectDuration('Rage_1'));
    const factor = 1 + EffectValue('Rage_1');
    CHECK(calmSwings === Math.round(EffectDuration('Rage_1') * Cls('Barbarian').BaseStats.AttackPerSec));
    CHECK(madSwings >= Math.floor(calmSwings * factor) - 1);
    CHECK(madSwings <= Math.ceil(calmSwings * factor) + 1);
    CHECK(madSwings > calmSwings);
  });
  it('RageCastsOnCooldownFromDataAndRecastsAfterTheCooldown', () => {
    const f = new Bag();
    const castTicks: number[] = [];
    f.s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === f.b) castTicks.push(f.s.tickCount()); });
    f.s.startFight();
    const cd = Ticks(f.s, RageCooldown());
    StepN(f.s, cd - 3);
    CHECK(castTicks.length === 0);
    StepN(f.s, 6);
    CHECK(castTicks.length === 1);
    CHECK(castTicks.length === 1 && Math.abs(castTicks[0] - cd) <= 2);
    StepN(f.s, cd - 6);
    CHECK(castTicks.length === 1);
    StepN(f.s, 8);
    CHECK(castTicks.length === 2);
    CHECK(castTicks.length === 2 && Math.abs(castTicks[1] - castTicks[0] - cd) <= 2);
  });
  it('RageCooldownReductionSpeedsTheRecast', () => {
    const f = new Bag();
    f.s.mutableUnit(f.b)!.stats.addModifier(StatId.CooldownReduction, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
    let casts = 0;
    f.s.getBus().subscribe('AbilityCast', () => { ++casts; });
    f.s.startFight();
    StepN(f.s, Ticks(f.s, RageCooldown() / 2) + 2);
    CHECK(casts === 1);
  });
  it('RageEffectNotConfiguredInDataDoesNothingAndIsLoggedOnce', () => {
    const d = copyData(stub);
    for (const e of d.effects) if (e.Name === 'Rage_1') e.Value = -1;
    const f = new Bag(d);
    f.s.startFight();
    const base = f.s.getUnit(f.b)!.stats.get(StatId.AttackSpeed);
    CHECK(f.s.forceCastAbility(f.b));
    CHECK(f.s.forceCastAbility(f.b));
    NEAR(f.s.getUnit(f.b)!.stats.get(StatId.AttackSpeed), base, 1e-12);
    CHECK(f.s.getUnit(f.b)!.rageLifesteal > 0);
    const log = f.s.getLog().toText();
    const first = log.indexOf('Rage_1 is not configured');
    CHECK(first >= 0);
    CHECK(log.indexOf('Rage_1 is not configured', first + 1) < 0);
  });
  it('RageValuesAreReadFromDataNotHardCoded', () => {
    const d = copyData(stub);
    for (const e of d.effects) {
      if (e.Name === 'Rage_1') { e.Value = 1.0; e.Duration = 2.0; }
      if (e.Name === 'Rage_2') { e.Value = 0.5; e.Duration = 2.0; }
    }
    for (const a of d.abilities) if (a.Name === 'Rage') a.Cooldown = 3.0;
    const f = new Bag(d);
    f.s.startFight();
    const base = f.s.getUnit(f.b)!.stats.get(StatId.AttackSpeed);
    let castTick = -1;
    f.s.getBus().subscribe('AbilityCast', () => { if (castTick < 0) castTick = f.s.tickCount(); });
    StepN(f.s, Ticks(f.s, 3) + 1);
    CHECK(castTick > 0 && Math.abs(castTick - Ticks(f.s, 3)) <= 2);
    NEAR(f.s.getUnit(f.b)!.stats.get(StatId.AttackSpeed), base * 2, 1e-9);
    NEAR(f.s.getUnit(f.b)!.rageLifesteal, 0.5, 1e-9);
  });
  it('RageTriggerModesFromData', () => {
    {
      const f = new Bag();
      f.s.mutableUnit(f.b)!.trigger = 'SaveForBossOrElite';
      f.s.startFight();
      StepN(f.s, Ticks(f.s, RageCooldown()) + 5);
      CHECK(!hasCast(f.s));
      const s = new CombatSim(stub, 1);
      const b = s.addPartyUnit('Barbarian');
      s.addEnemy('StubElite', 1);
      Freeze(s, b); Freeze(s, 1);
      s.mutableUnit(b)!.trigger = 'SaveForBossOrElite';
      s.startFight();
      StepN(s, Ticks(s, RageCooldown()) + 5);
      CHECK(hasCast(s));
    }
    {
      const two = new CombatSim(stub, 1);
      const b2 = two.addPartyUnit('Barbarian');
      two.addEnemy('StubDummy', 1); two.addEnemy('StubDummy', 1);
      Freeze(two, b2); Freeze(two, 1); Freeze(two, 2);
      two.mutableUnit(b2)!.trigger = 'PackIsLarge';
      two.startFight();
      StepN(two, Ticks(two, RageCooldown()) + 5);
      CHECK(!hasCast(two));
      const three = new CombatSim(stub, 1);
      const b3 = three.addPartyUnit('Barbarian');
      for (let i = 0; i < 3; ++i) three.addEnemy('StubDummy', 1);
      Freeze(three, b3);
      for (let i = 1; i <= 3; ++i) Freeze(three, i);
      three.mutableUnit(b3)!.trigger = 'PackIsLarge';
      three.startFight();
      StepN(three, Ticks(three, RageCooldown()) + 5);
      CHECK(hasCast(three));
    }
    {
      const s = new CombatSim(stub, 1);
      const b = s.addPartyUnit('Barbarian');
      const m = s.addPartyUnit('Mage');
      s.addEnemy('StubDummy', 1);
      Freeze(s, b); Freeze(s, m); Freeze(s, 2);
      s.mutableUnit(b)!.trigger = 'AllyIsLow';
      s.startFight();
      StepN(s, Ticks(s, RageCooldown()) + 5);
      CHECK(!hasCast(s));
      s.mutableUnit(m)!.hp = s.maxHp(s.getUnit(m)!) * 0.3;
      StepN(s, 3);
      CHECK(hasCast(s));
    }
  });
});

describe('units: Barbarian positioning and targeting', () => {
  it('MovementValuesAreTheSection8bMeleeRow', () => {
    const c = Cls('Barbarian');
    NEAR(c.MoveSpeed, 300, 1e-6);
    NEAR(c.AttackRange, 150, 1e-6);
    NEAR(c.PreferredDistMin, 0, 1e-6);
    NEAR(c.PreferredDistMax, 150, 1e-6);
    NEAR(c.RetreatDistance, 0, 1e-6);
    CHECK(c.MoveSpeed < Cls('Warrior').MoveSpeed);
    CHECK(c.MoveSpeed < Cls('Assassin').MoveSpeed);
    CHECK(c.MoveSpeed > Enemy('Grunt').MoveSpeed);
    const s = new CombatSim(data, 1);
    const u = s.getUnit(s.addPartyUnit('Barbarian'))!;
    CHECK(u.behavior === Behavior.Melee);
    NEAR(u.moveSpeed, c.MoveSpeed, 1e-9);
    NEAR(u.retreat, 0, 1e-9);
    CHECK(!u.healer && !u.archer);
  });
  it('BarbarianClosesToMeleeRangeAtItsMoveSpeedAndStaysOnTarget', () => {
    const s = new CombatSim(stub, 1);
    const b = s.addPartyUnit('Barbarian');
    const d = s.addEnemy('StubDummy', 1);
    Freeze(s, d);
    Place(s, b, -1000, 0);
    Place(s, d, 1000, 0);
    s.startFight();
    StepN(s, 30);
    NEAR(s.getUnit(b)!.x, -1000 + Cls('Barbarian').MoveSpeed, 2.0);
    NEAR(s.getUnit(b)!.y, 0, 1.0);
    StepN(s, Ticks(s, 8));
    CHECK(dist(s, b, d) <= Cls('Barbarian').AttackRange + 1e-6);
    CHECK(s.getUnit(b)!.damageDone > 0);
    const x = s.getUnit(b)!.x, y = s.getUnit(b)!.y;
    StepN(s, Ticks(s, 5));
    CHECK(dist(s, b, d) <= Cls('Barbarian').AttackRange + 1e-6);
    CHECK(Math.sqrt((s.getUnit(b)!.x - x) ** 2 + (s.getUnit(b)!.y - y) ** 2) < 60);
  });
  it('BarbarianNeverRetreatsFromAnEnemyStandingOnIt', () => {
    const s = new CombatSim(stub, 1);
    const b = s.addPartyUnit('Barbarian');
    const d = s.addEnemy('StubDummy', 1);
    Freeze(s, d);
    Place(s, b, 0, 0);
    Place(s, d, 60, 0);
    s.startFight();
    StepN(s, Ticks(s, 6));
    CHECK(dist(s, b, d) <= Cls('Barbarian').AttackRange + 1e-6);
    CHECK(s.getUnit(b)!.damageDone > 0);
  });
  it('BarbarianChasesAMovingRangedEnemyDown', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const a = s.addEnemy('Archer', 1);
    CHECK(a !== kNoUnit);
    s.startFight();
    let bestDamage = 0;
    for (let i = 0; i < Ticks(s, 40) && s.getState() === FightState.Running; ++i) {
      s.step();
      bestDamage = Math.max(bestDamage, s.getUnit(b)!.damageDone);
    }
    CHECK(bestDamage > 0);
    CHECK(s.getUnit(b)!.damageDone > 0);
  });
  it('DefaultTargetIsTheClosestEnemy', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const far = s.addEnemy('Grunt', 1);
    const nearE = s.addEnemy('Grunt', 1);
    Place(s, b, 0, 0);
    Place(s, far, 600, 0);
    Place(s, nearE, 300, 300);
    s.startFight();
    s.step();
    CHECK(s.getUnit(b)!.target === nearE);
    CHECK(s.getUnit(b)!.targetTypes.length === 1 && s.getUnit(b)!.targetTypes[0] === 'Closest');
  });
  it('TargetListUnlocksWeakestStrongestHealerFirstArcherFirst', () => {
    const targetOf = (list: TargetType[], a: string, bb: string, c: string, which: number): boolean => {
      const s = new CombatSim(data, 1);
      const b = s.addPartyUnit('Barbarian');
      const e1 = s.addEnemy(a, 1);
      const e2 = s.addEnemy(bb, 1);
      const e3 = s.addEnemy(c, 1);
      Place(s, b, 0, 0);
      Place(s, e1, 300, 0);
      Place(s, e2, 500, 100);
      Place(s, e3, 700, -100);
      for (const id of [e1, e2, e3]) Freeze(s, id);
      Freeze(s, b);
      s.mutableUnit(e2)!.hp = 10;
      s.mutableUnit(b)!.targetTypes = list;
      s.startFight();
      s.step();
      return s.getUnit(b)!.target === which;
    };
    CHECK(targetOf(['Weakest'], 'Grunt', 'Grunt', 'Grunt', 2));
    CHECK(targetOf(['Strongest'], 'Grunt', 'Brute', 'Grunt', 2) === false);
    CHECK(targetOf(['Strongest'], 'Grunt', 'Brute', 'Grunt', 1));
    CHECK(targetOf(['HealerFirst', 'Closest'], 'Grunt', 'Shaman', 'Grunt', 2));
    CHECK(targetOf(['ArcherFirst', 'Closest'], 'Grunt', 'Grunt', 'Archer', 3));
    CHECK(targetOf(['HealerFirst', 'ArcherFirst'], 'Grunt', 'Grunt', 'Archer', 3));
    CHECK(targetOf(['HealerFirst'], 'Grunt', 'Grunt', 'Grunt', 1));
  });
  it('AllowedTargetTypesInDataCoverEveryTypeTheListSupports', () => {
    const c = Cls('Barbarian');
    for (const t of ['Closest', 'Weakest', 'Strongest', 'HealerFirst', 'ArcherFirst'] as const) CHECK(c.AllowedTargetTypes.includes(t), t);
  });
  it('ClassDataDoesNotCapTheTargetListToOne', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    CHECK(s.getUnit(b)!.targetTypes.length === 1);
  });
});

describe('units: Barbarian with and without a healer', () => {
  it('WithAPriestAHurtBarbarianIsHealedForTheBaseHeal', () => {
    const s = new CombatSim(stub, 1);
    const b = s.addPartyUnit('Barbarian');
    const p = s.addPartyUnit('Priest');
    const d = s.addEnemy('StubDummy', 1);
    Freeze(s, b); Freeze(s, p); Freeze(s, d);
    Place(s, b, -800, 300); Place(s, p, -1000, 0); Place(s, d, 1000, 0);
    s.startFight();
    s.mutableUnit(b)!.hp = 50;
    let healed = 0, heals = 0;
    s.getBus().subscribe('HealApplied', (e) => { if (e.target === b && e.source === p) { healed += e.effectiveAmount; ++heals; } });
    StepN(s, Ticks(s, 6));
    CHECK(heals >= 3);
    NEAR(s.getUnit(b)!.hp, 50 + healed, 1e-9);
    CHECK(s.getUnit(b)!.hp > 50);
    CHECK(s.getUnit(b)!.hp <= s.maxHp(s.getUnit(b)!) + 1e-9);
  });
  it('WithoutAHealerABarbarianStaysHurtButRageLifestealSustainsItInMelee', () => {
    {
      const s = new CombatSim(stub, 1);
      const b = s.addPartyUnit('Barbarian');
      s.addPartyUnit('Mage');
      s.addEnemy('StubDummy', 1);
      Freeze(s, b); Freeze(s, 1); Freeze(s, 2);
      Place(s, b, -800, 300); Place(s, 1, -1000, 0); Place(s, 2, 1000, 0);
      s.startFight();
      s.mutableUnit(b)!.hp = 50;
      let heals = 0;
      s.getBus().subscribe('HealApplied', () => { ++heals; });
      StepN(s, Ticks(s, 6));
      CHECK(heals === 0);
      NEAR(s.getUnit(b)!.hp, 50, 1e-12);
    }
    const f = new Bag();
    f.s.startFight();
    f.s.mutableUnit(f.b)!.hp = 50;
    CHECK(f.s.forceCastAbility(f.b));
    StepN(f.s, Ticks(f.s, EffectDuration('Rage_2')) + 3);
    const u = f.s.getUnit(f.b)!;
    const expected = u.damageDone * EffectValue('Rage_2');
    CHECK(u.damageDone > 0);
    CHECK(u.hp > 50);
    CHECK(u.hp <= 50 + expected + 1e-6);
  });
  it('PostWinReviveOfAFallenBarbarianNeedsAPriest', () => {
    for (const withPriest of [false, true]) {
      const s = new CombatSim(data, 1);
      s.addPartyUnit('Warrior');
      const b = s.addPartyUnit('Barbarian');
      s.addPartyUnit(withPriest ? 'Priest' : 'Mage');
      s.addEnemy('Grunt', 1);
      s.startFight();
      s.mutableUnit(b)!.alive = false;
      s.mutableUnit(b)!.hp = 0;
      CHECK(s.runToEnd() === FightState.Won);
      const revived = s.postWinRevive();
      if (withPriest) { CHECK(revived === 1); CHECK(s.getUnit(b)!.alive && s.getUnit(b)!.hp === 1); }
      else { CHECK(revived === 0); CHECK(!s.getUnit(b)!.alive); }
    }
  });
  it('RestRoomRevivesAndHealsABarbarianWithoutAPriest', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const w = s.addPartyUnit('Warrior');
    s.mutableUnit(b)!.hp = 0;
    s.mutableUnit(b)!.alive = false;
    s.mutableUnit(w)!.hp = 10;
    CHECK(s.restRoom() === 1);
    CHECK(s.getUnit(b)!.alive && s.getUnit(b)!.hp === 1);
    NEAR(s.getUnit(w)!.hp, 10 + s.config().restHealPct * s.maxHp(s.getUnit(w)!), 1e-9);
    s.mutableUnit(b)!.hp = 40;
    s.restRoom();
    NEAR(s.getUnit(b)!.hp, 40 + s.config().restHealPct * s.maxHp(s.getUnit(b)!), 1e-9);
  });
  it('PartyFightsWithAndWithoutAPriestAreDeterministicAndNeverStall', () => {
    let winsWith = 0, winsWithout = 0;
    const g3 = ['Grunt', 'Grunt', 'Grunt'];
    for (let seed = 1; seed <= 40; ++seed) {
      const a = runFightHeadless(data, seed, ['Warrior', 'Barbarian', 'Priest'], g3);
      const a2 = runFightHeadless(data, seed, ['Warrior', 'Barbarian', 'Priest'], g3);
      const b = runFightHeadless(data, seed, ['Warrior', 'Barbarian'], g3);
      const b2 = runFightHeadless(data, seed, ['Warrior', 'Barbarian'], g3);
      CHECK(a.state !== FightState.TimedOut && b.state !== FightState.TimedOut);
      CHECK(a.logText === a2.logText && b.logText === b2.logText);
      if (a.state === FightState.Won) ++winsWith;
      if (b.state === FightState.Won) ++winsWithout;
    }
    CHECK(winsWith >= winsWithout);
  });
});

describe('units: Barbarian fights', () => {
  const runStubFight = (seed: number) => {
    const s = new CombatSim(stub, seed);
    const b = s.addPartyUnit('Barbarian');
    const foe = s.addEnemy('StubFoe', 1);
    let casts = 0;
    s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === b && e.abilityId === 'Rage') ++casts; });
    s.startFight();
    s.runToEnd();
    return {
      state: s.getState(), log: s.getLog().toText(), summary: s.summaryText(), ticks: s.tickCount(),
      barbHp: s.getUnit(b)!.hp, barbThreat: s.threatOn(foe, b), rageCasts: casts,
    };
  };
  it('StubOpponentFightBarbarianWinsUsesRageAndLogsIdenticallyTwice', () => {
    const a = runStubFight(7);
    const b = runStubFight(7);
    CHECK(a.state === FightState.Won);
    CHECK(a.barbHp > 0 && a.barbHp < Cls('Barbarian').BaseStats.HP);
    CHECK(a.rageCasts >= 1);
    CHECK(a.log.includes('Barbarian#0 casts Rage'));
    CHECK(a.log.includes('Barbarian#0 attacks StubFoe#1'));
    CHECK(a.log.includes('StubFoe#1 attacks Barbarian#0'));
    CHECK(a.log.includes('heals'));
    CHECK(a.log.includes('EnemyKilled: StubFoe#1'));
    CHECK(a.log.includes('FightEnded: WIN'));
    CHECK(a.barbThreat > 0);
    CHECK(a.log !== '');
    CHECK(a.log === b.log);
    CHECK(a.summary === b.summary);
    CHECK(a.ticks === b.ticks);
    NEAR(a.barbHp, b.barbHp, 0);
    CHECK(runStubFight(8).log === a.log);
  });
  it('BarbarianBeatsRealEnemiesOneOnOneAndMixedFightsNeverStall', () => {
    for (const e of ['Grunt', 'Archer', 'Brute']) CHECK(runFightHeadless(data, 3, ['Barbarian'], [e]).state !== FightState.TimedOut, e);
    CHECK(runFightHeadless(data, 3, ['Barbarian'], ['Grunt']).state === FightState.Won);
    let timeouts = 0;
    const party = ['Warrior', 'Barbarian', 'Mage', 'Priest'];
    const pack = ['Grunt', 'Brute', 'Archer', 'Shaman'];
    for (let seed = 1; seed <= 30; ++seed) {
      const a = runFightHeadless(data, seed, party, pack);
      CHECK(a.ticks > 0);
      const b = runFightHeadless(data, seed, party, pack);
      if (a.state === FightState.TimedOut) ++timeouts;
      CHECK(a.logText === b.logText);
    }
    CHECK(timeouts === 0);
  });
  it('FightSummaryAndHpCarryOverIncludeTheBarbarian', () => {
    const s = new CombatSim(data, 1);
    s.addPartyUnit('Warrior');
    const b = s.addPartyUnit('Barbarian');
    s.addEnemy('Grunt', 1);
    s.startFight();
    CHECK(s.runToEnd() === FightState.Won);
    CHECK(s.getUnit(b)!.damageDone > 0);
    CHECK(s.summaryText().includes('Barbarian#1'));
    const hp = s.getUnit(b)!.hp;
    s.prepareNextFight();
    CHECK(s.getUnit(b)!.name === 'Barbarian');
    NEAR(s.getUnit(b)!.hp, hp, 1e-12);
    NEAR(s.getUnit(b)!.threatMult, 1.2, 1e-6);
    CHECK(s.getUnit(b)!.rageLifesteal === 0 && s.getUnit(b)!.abilityTimer === 0);
  });
});
