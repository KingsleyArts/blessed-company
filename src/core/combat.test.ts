// Port of tests/combat/tests.cpp (Unreal reference): one named test per rule. Numbers come from data/*.csv through the
// CombatData readers; the only literals are tolerances.
import { describe, it } from 'vitest';
import { CombatLog, logEntry } from './combatSupport';
import { CombatSim, FightState, defaultCombatConfig, kHealBase, runFightHeadless, type WaveSpec } from './combatSim';
import { DamageTag, kNoUnit } from './eventBus';
import { ModKind, ModSource, StatId } from './statResolver';
import {
  CHECK, Cls, EffectDuration, EffectValue, Enemy, Freeze, NEAR, Place, StepTicks, cloneData, data, dist,
} from './combatTestKit';

const FightLog = (seed: number): string => runFightHeadless(data, seed, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']).logText;

function dataWithTauntFlatBonus() {
  const d = cloneData();
  for (const a of d.abilities) if (a.Name === 'Taunt') a.EffectIds = ['Taunt_3', 'Taunt_1', 'Taunt_2'];
  return d;
}

describe('combat: data readers', () => {
  it('DataReadersLoadAllTables', () => {
    CHECK(data.classes.length && data.enemies.length && data.abilities.length && data.effects.length);
    CHECK(Cls('Warrior').RoleTag === 'Tank');
    CHECK(Cls('Warrior').AbilityId === 'Taunt');
    CHECK(Cls('Priest').RoleTag === 'Healer');
    CHECK(Enemy('Grunt').RoleTag === 'Melee');
    CHECK(Enemy('Brute').Taunts);
    CHECK(Enemy('Shaman').PreferredDistMax < 0);
    const taunt = data.findAbility('Taunt');
    CHECK(taunt && taunt.EffectIds.join('|') === 'Taunt_3|Taunt_1|Taunt_2');   // director Nov 20: threat to highest +1, then the forced attack
    const e = data.findEffect('Taunt_1');
    CHECK(e && e.Type === 'AddThreat' && e.TargetSelector === 'AllEnemies');
  });
});

describe('combat: loop', () => {
  it('FixedStepIsOneThirtiethSecond', () => {
    const s = new CombatSim(data, 1);
    NEAR(s.config().dt, 1 / 30, 1e-12);
    s.addPartyUnit('Warrior');
    s.addEnemy('Grunt', 1);
    s.startFight();
    StepTicks(s, 90);
    CHECK(s.tickCount() === 90);
    NEAR(s.getTime(), 3.0, 1e-9);
  });
  it('SameSeedGivesIdenticalFight', () => {
    for (const seed of [1, 2, 77]) {
      const a = FightLog(seed);
      CHECK(a !== '');
      CHECK(a === FightLog(seed));
    }
  });
});

describe('combat: damage pipeline', () => {
  it('DamageAppliesDefensePercent', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    const def = Cls('Warrior').BaseStats.DefensePct;
    const dealt = s.dealDamage(g, w, 1.0, DamageTag.Auto);
    NEAR(dealt, Enemy('Grunt').BaseStats.Damage * (1 - def / 100), 1e-9);
    NEAR(s.getUnit(w)!.hp, Cls('Warrior').BaseStats.HP - dealt, 1e-9);
  });
  it('DamageRaisesDealtAndTakenEvents', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    let dealt = 0, taken = 0, amount = 0;
    s.getBus().subscribe('DamageDealt', (e) => { ++dealt; amount = e.amount; });
    s.getBus().subscribe('DamageTaken', (e) => { ++taken; CHECK(e.target === w); });
    const got = s.dealDamage(g, w, 1.0, DamageTag.Auto);
    CHECK(dealt === 1 && taken === 1);
    NEAR(amount, got, 1e-12);
  });
  it('FortitudeBlocksFlatButNeverBelowOne', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    s.mutableUnit(w)!.fortitude = 1000;
    NEAR(s.dealDamage(g, w, 1.0, DamageTag.Auto), 1.0, 1e-12);
  });
  it('CritMultipliesByCritFactor', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    const mage = s.mutableUnit(m)!;
    mage.stats.addModifier(StatId.CritChance, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
    mage.stats.addModifier(StatId.CritFactor, ModKind.Flat, 0.5, ModSource.GoldUpgrade);
    let sawCrit = false;
    s.getBus().subscribe('DamageDealt', (e) => { sawCrit = e.crit; });
    const got = s.dealDamage(m, g, 1.0, DamageTag.Auto);
    const base = Cls('Mage').BaseStats.Damage * (1 - Enemy('Grunt').BaseStats.DefensePct / 100);
    CHECK(sawCrit);
    NEAR(got, base * 2.0, 1e-9);
  });
  it('DeathRaisesUnitDiedAndEnemyKilled', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    let died = 0, killed = 0;
    s.getBus().subscribe('UnitDied', (e) => { ++died; CHECK(e.wasEnemy && e.killer === m); });
    s.getBus().subscribe('EnemyKilled', () => { ++killed; });
    s.dealDamage(m, g, 1000.0, DamageTag.Ability);
    CHECK(!s.getUnit(g)!.alive);
    CHECK(died === 1 && killed === 1 && s.getEnemiesKilled() === 1);
  });
  it('EnemyStatsScaleByCompoundingFloorFactor', () => {
    const s = new CombatSim(data, 1);
    const g1 = s.addEnemy('Grunt', 1);
    const g3 = s.addEnemy('Grunt', 3);
    const f = Math.pow(s.config().floorScaling, 2);
    NEAR(s.maxHp(s.getUnit(g1)!), Enemy('Grunt').BaseStats.HP, 1e-9);
    NEAR(s.maxHp(s.getUnit(g3)!), Enemy('Grunt').BaseStats.HP * f, 1e-6);
    NEAR(s.getUnit(g3)!.stats.get(StatId.Damage), Enemy('Grunt').BaseStats.Damage * f, 1e-6);
    NEAR(s.getUnit(g3)!.hp, s.maxHp(s.getUnit(g3)!), 1e-9);
  });
});

describe('combat: heal pipeline', () => {
  it('HealClampsToMissingHpAndRaisesEvent', () => {
    const s = new CombatSim(data, 1);
    const p = s.addPartyUnit('Priest');
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    let events = 0, last = 0;
    s.getBus().subscribe('HealApplied', (e) => { ++events; last = e.effectiveAmount; });
    NEAR(s.applyHeal(p, w, kHealBase), 0, 1e-12);
    CHECK(events === 0);
    const hit = s.dealDamage(g, w, 1.0, DamageTag.Auto);
    CHECK(hit < kHealBase);
    NEAR(s.applyHeal(p, w, kHealBase), hit, 1e-9);
    CHECK(events === 1);
    NEAR(last, hit, 1e-9);
    NEAR(s.getUnit(w)!.hp, s.maxHp(s.getUnit(w)!), 1e-9);
  });
  it('HealPowerScalesHeal', () => {
    const s = new CombatSim(data, 1);
    const p = s.addPartyUnit('Priest');
    const w = s.addPartyUnit('Warrior');
    s.mutableUnit(w)!.hp = 1;
    s.mutableUnit(p)!.stats.addModifier(StatId.HealPower, ModKind.Flat, 0.5, ModSource.Essence);
    NEAR(s.applyHeal(p, w, kHealBase), kHealBase * 1.5, 1e-9);
  });
});

describe('combat: threat', () => {
  it('ThreatIsDamageTimesThreatStatTimesClassMultiplier', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const b = s.addPartyUnit('Barbarian');
    const g = s.addEnemy('Grunt', 1);
    const dw = s.dealDamage(w, g, 1.0, DamageTag.Auto);
    const db = s.dealDamage(b, g, 1.0, DamageTag.Auto);
    NEAR(s.threatOn(g, w), dw * Cls('Warrior').BaseThreat * Cls('Warrior').ThreatMultiplier, 1e-9);
    NEAR(s.threatOn(g, b), db * Cls('Barbarian').BaseThreat * Cls('Barbarian').ThreatMultiplier, 1e-9);
    CHECK(Cls('Barbarian').ThreatMultiplier > Cls('Mage').ThreatMultiplier);
  });
  it('HealingAddsQuarterOfEffectiveHealToEveryEnemy', () => {
    const s = new CombatSim(data, 1);
    const p = s.addPartyUnit('Priest');
    const w = s.addPartyUnit('Warrior');
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    s.mutableUnit(w)!.hp = s.maxHp(s.getUnit(w)!) - 6;
    const eff = s.applyHeal(p, w, kHealBase);
    NEAR(eff, 6, 1e-9);
    NEAR(s.threatOn(g1, p), eff * s.config().healThreatFactor, 1e-9);
    NEAR(s.threatOn(g2, p), eff * s.config().healThreatFactor, 1e-9);
    NEAR(s.config().healThreatFactor, 0.25, 1e-12);
  });
  it('TauntRaisesThreatToHighestPlusFlatOnEveryEnemy', () => {
    const s = new CombatSim(dataWithTauntFlatBonus(), 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    s.dealDamage(m, g1, 1.0, DamageTag.Auto);
    s.dealDamage(m, g1, 1.0, DamageTag.Auto);
    s.dealDamage(m, g2, 1.0, DamageTag.Auto);
    const top1 = s.threatOn(g1, m);
    const top2 = s.threatOn(g2, m);
    CHECK(s.forceCastAbility(w));
    const flat = EffectValue('Taunt_1');
    NEAR(s.threatOn(g1, w), top1 + flat, 1e-9);
    NEAR(s.threatOn(g2, w), top2 + flat, 1e-9);
  });
  it('TauntShortDamageReductionExpires', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, w);
    Freeze(s, g);
    Place(s, w, -2000, 0);
    s.startFight();
    CHECK(s.forceCastAbility(w));
    const red = EffectValue('Taunt_2');
    const plain = Enemy('Grunt').BaseStats.Damage * (1 - Cls('Warrior').BaseStats.DefensePct / 100);
    NEAR(s.dealDamage(g, w, 1.0, DamageTag.Auto), plain * (1 - red), 1e-9);
    StepTicks(s, Math.ceil(EffectDuration('Taunt_2') / s.config().dt) + 2);
    NEAR(s.dealDamage(g, w, 1.0, DamageTag.Auto), plain, 1e-9);
  });
  it('EnemyAttacksHighestThreatPartyUnit', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    s.dealDamage(m, g, 1.0, DamageTag.Auto);
    s.startFight();
    s.step();
    CHECK(s.getUnit(g)!.target === m);
    s.forceCastAbility(w);
    s.step();
    CHECK(s.getUnit(g)!.target === w);
  });
  it('TankTargetsEnemyItHasLowestThreatOn', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    s.dealDamage(w, g1, 1.0, DamageTag.Auto);
    s.startFight();
    s.step();
    CHECK(s.getUnit(w)!.target === g2);
    s.dealDamage(w, g2, 5.0, DamageTag.Auto);
    s.step();
    CHECK(s.getUnit(w)!.target === g1);
  });
  it('PartyDefaultTargetIsClosestEnemy', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const far = s.addEnemy('Grunt', 1);
    const near = s.addEnemy('Grunt', 1);
    Place(s, m, 0, 0);
    Place(s, far, 600, 0);
    Place(s, near, 300, 300);
    s.startFight();
    s.step();
    CHECK(s.getUnit(m)!.target === near);
  });
  it('SummonThreatIsHalfShareToOwner', () => {
    const s = new CombatSim(data, 1);
    const su = s.addPartyUnit('Summoner');
    const g = s.addEnemy('Grunt', 1);
    Place(s, su, 0, 0);
    Place(s, g, 100, 0);
    s.startFight();
    let weapon = kNoUnit;
    for (const u of s.getUnits()) if (u.summon && u.weapon) weapon = u.id;
    CHECK(weapon !== kNoUnit);
    const full = s.dealDamage(weapon, g, 1.0, DamageTag.Summon);
    NEAR(s.threatOn(g, su), full * Cls('Summoner').BaseThreat * Cls('Summoner').ThreatMultiplier, 1e-9);
    const before = s.threatOn(g, su);
    CHECK(s.forceCastAbility(su));
    let spirit = kNoUnit;
    for (const u of s.getUnits()) if (u.summon && u.greater) spirit = u.id;
    CHECK(spirit !== kNoUnit);
    const d = s.dealDamage(spirit, g, 1.0, DamageTag.Summon);
    NEAR(s.threatOn(g, su) - before, d * Cls('Summoner').BaseThreat * Cls('Summoner').ThreatMultiplier * s.config().summonThreatShare, 1e-9);
  });
});

describe('combat: movement', () => {
  it('MeleeUnitClosesAtItsMoveSpeed', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, g);
    Place(s, w, -1000, 0);
    Place(s, g, 1000, 0);
    s.startFight();
    StepTicks(s, 30);
    NEAR(s.getUnit(w)!.x, -1000 + Cls('Warrior').MoveSpeed, 2.0);
    StepTicks(s, 30 * 8);
    CHECK(dist(s, w, g) <= Cls('Warrior').AttackRange + 1e-6);
  });
  it('RangedUnitRetreatsFromEnemyInsideRetreatDistance', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, g);
    Place(s, m, 0, 0);
    Place(s, g, 200, 0);
    s.startFight();
    StepTicks(s, 30 * 6);
    CHECK(dist(s, m, g) >= Cls('Mage').RetreatDistance - 1.0);
  });
  it('RangedUnitApproachesUntilInsideRange', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, g);
    Place(s, m, -1100, 0);
    Place(s, g, 1100, 0);
    s.startFight();
    StepTicks(s, 30 * 10);
    const d = dist(s, m, g);
    CHECK(d <= Cls('Mage').AttackRange + 1e-6);
    CHECK(d >= Cls('Mage').PreferredDistMin - 1e-6);
  });
  it('SeparationKeepsUnitsFromStacking', () => {
    const s = new CombatSim(data, 1);
    const a = s.addEnemy('Grunt', 1);
    const b = s.addEnemy('Grunt', 1);
    s.addPartyUnit('Warrior');
    Freeze(s, a);
    Freeze(s, b);
    Place(s, a, 0, 0);
    Place(s, b, 0, 0);
    s.startFight();
    s.step();
    CHECK(dist(s, a, b) >= s.config().separation - 1e-6);
  });
  it('UnitsStayInsideTheArena', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    Place(s, m, 0, 0);
    Place(s, g, 100, 0);
    s.startFight();
    let ok = true;
    for (let i = 0; i < 30 * 10; i++) {
      s.step();
      for (const u of s.getUnits()) {
        if (Math.abs(u.x) > s.config().arenaW * 0.5 + 1e-6 || Math.abs(u.y) > s.config().arenaH * 0.5 + 1e-6) ok = false;
      }
    }
    CHECK(ok);
  });
});

describe('combat: abilities as data', () => {
  it('AbilityCastsOnlyAfterItsCooldownFromData', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    s.mutableUnit(g)!.stats.setBase(StatId.Health, 1.0e9);
    s.mutableUnit(g)!.hp = 1.0e9;
    Freeze(s, w);
    Freeze(s, g);
    Place(s, w, 0, 0);
    Place(s, g, 400, 0);
    let castTick = -1;
    s.getBus().subscribe('AbilityCast', () => { if (castTick < 0) castTick = s.tickCount(); });
    s.startFight();
    const cd = data.findAbility(Cls('Mage').AbilityId)!.Cooldown;
    StepTicks(s, Math.trunc(cd / s.config().dt) - 2);
    CHECK(castTick < 0);
    StepTicks(s, 6);
    CHECK(castTick > 0);
    CHECK(castTick * s.config().dt >= cd - 0.05);
  });
  it('DamageEffectFireballHitsAreaAroundTarget', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    const g3 = s.addEnemy('Grunt', 1);
    Place(s, m, 0, 0);
    Place(s, g1, 600, 0);
    Place(s, g2, 600, 150);
    Place(s, g3, 600, 900);
    s.startFight();
    CHECK(s.forceCastAbility(m));
    const expected = EffectValue('Fireball_1') * Cls('Mage').BaseStats.Damage * (1 - Enemy('Grunt').BaseStats.DefensePct / 100);
    NEAR(s.maxHp(s.getUnit(g1)!) - s.getUnit(g1)!.hp, expected, 1e-9);
    NEAR(s.maxHp(s.getUnit(g2)!) - s.getUnit(g2)!.hp, expected, 1e-9);
    NEAR(s.maxHp(s.getUnit(g3)!) - s.getUnit(g3)!.hp, 0, 1e-9);
  });
  it('PrimaryAbilityCooldownReadAccessor', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    Place(s, w, -2000, 0);
    Place(s, m, -2000, 600);
    Place(s, g, 2000, 0);
    Freeze(s, w);
    Freeze(s, m);
    Freeze(s, g);
    s.startFight();
    const cw = s.primaryAbilityCooldown(w);
    const cm0 = s.primaryAbilityCooldown(m);
    CHECK(cw.valid && cm0.valid);
    NEAR(cw.total, data.findAbility(Cls('Warrior').AbilityId)!.Cooldown, 1e-9);
    NEAR(cw.remaining, 0, 1e-9);
    NEAR(cm0.remaining, cm0.total, 1e-9);
    StepTicks(s, 30);
    const cm1 = s.primaryAbilityCooldown(m);
    CHECK(cm1.remaining < cm0.remaining - 0.9 && cm1.remaining > 0);
    NEAR(cm1.total, cm0.total, 1e-9);
    CHECK(!s.primaryAbilityCooldown(kNoUnit).valid);
    CHECK(!s.primaryAbilityCooldown(999).valid);
  });
  it('ExecuteHitsWeakestEnemy', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    Place(s, a, 0, 0);
    Place(s, g1, 100, 0);
    Place(s, g2, 100, 100);
    s.mutableUnit(g2)!.hp = 100;
    s.startFight();
    CHECK(s.forceCastAbility(a));
    CHECK(s.getUnit(g2)!.hp < 100);
    NEAR(s.getUnit(g1)!.hp, s.maxHp(s.getUnit(g1)!), 1e-9);
  });
  it('GroupHealHealsEveryLivingAlly', () => {
    const s = new CombatSim(data, 1);
    const p = s.addPartyUnit('Priest');
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    s.addEnemy('Grunt', 1);
    s.mutableUnit(w)!.hp = 1;
    s.mutableUnit(m)!.hp = 1;
    s.startFight();
    CHECK(s.forceCastAbility(p));
    const amount = EffectValue('GroupHeal_1') * kHealBase;
    NEAR(s.getUnit(w)!.hp, 1 + amount, 1e-9);
    NEAR(s.getUnit(m)!.hp, 1 + amount, 1e-9);
  });
  it('ApplyModifierRageBuffsAttackSpeedThenExpires', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, b);
    Freeze(s, g);
    Place(s, b, -2000, 0);
    s.startFight();
    const base = s.getUnit(b)!.stats.get(StatId.AttackSpeed);
    CHECK(s.forceCastAbility(b));
    NEAR(s.getUnit(b)!.stats.get(StatId.AttackSpeed), base * (1 + EffectValue('Rage_1')), 1e-9);
    CHECK(s.getUnit(b)!.rageLifesteal > 0);
    StepTicks(s, Math.ceil(EffectDuration('Rage_1') / s.config().dt) + 2);
    NEAR(s.getUnit(b)!.stats.get(StatId.AttackSpeed), base, 1e-9);
  });
  it('SpawnSummonCreatesTimedSpiritThatCannotBeTargetedWhilePartyLives', () => {
    const s = new CombatSim(data, 1);
    const su = s.addPartyUnit('Summoner');
    const g = s.addEnemy('Grunt', 1);
    Place(s, su, 0, 0);
    Place(s, g, 100, 0);
    s.startFight();
    CHECK(s.forceCastAbility(su));
    let spirit = kNoUnit;
    for (const u of s.getUnits()) if (u.summon && u.greater) spirit = u.id;
    CHECK(spirit !== kNoUnit);
    s.step();
    CHECK(s.getUnit(g)!.target === su);
    StepTicks(s, Math.trunc(s.getUnit(spirit)!.lifeLeft / s.config().dt) + 3);
    CHECK(!s.getUnit(spirit)!.alive);
  });
});

describe('combat: enrage', () => {
  it('EnrageRaisesEnemyDamageTenPercentEveryFiveSecondsFrom45s', () => {
    const s = new CombatSim(data, 1);
    s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, 0);
    Freeze(s, g);
    Place(s, 0, -1200, -700);
    Place(s, g, 1200, 700);
    const base = s.getUnit(g)!.stats.get(StatId.Damage);
    const steps: number[] = [];
    s.getBus().subscribe('EnrageTick', (e) => { steps.push(e.step); });
    s.startFight();
    const per = Math.trunc(1 / s.config().dt);
    StepTicks(s, 44 * per);
    CHECK(s.getEnrageStep() === 0);
    NEAR(s.getUnit(g)!.stats.get(StatId.Damage), base, 1e-9);
    StepTicks(s, per + 1);
    CHECK(s.getEnrageStep() === 1);
    NEAR(s.getUnit(g)!.stats.get(StatId.Damage), base * 1.1, 1e-9);
    StepTicks(s, 5 * per);
    CHECK(s.getEnrageStep() === 2);
    NEAR(s.getUnit(g)!.stats.get(StatId.Damage), base * 1.2, 1e-9);
    CHECK(steps.length === 2 && steps[0] === 1 && steps[1] === 2);
  });
  it('RunawayGuardEndsAStuckFightAsTimedOutAndEnrageKeepsStepping', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, w);
    Freeze(s, g);
    Place(s, w, -1200, -700);
    Place(s, g, 1200, 700);
    s.startFight();
    CHECK(s.runToEnd() === FightState.TimedOut);
    CHECK(s.getTime() >= s.config().runawayGuardSeconds - 1e-9);
    CHECK(s.config().runawayGuardSeconds >= 600);
    CHECK(s.getEnrageStep() > 100);
  });
});

describe('combat: lifecycle', () => {
  it('FightEndsInWinWhenAllEnemiesDie', () => {
    const r = runFightHeadless(data, 3, ['Warrior', 'Barbarian', 'Assassin', 'Mage'], ['Grunt']);
    CHECK(r.state === FightState.Won);
    CHECK(r.enemiesKilled === 1);
    CHECK(r.partyAlive > 0);
    CHECK(r.logText.includes('WIN'));
  });
  it('FightEndsInWipeWhenPartyDiesAndNamesCauseOfDeath', () => {
    const r = runFightHeadless(data, 3, ['Mage'], ['Grunt', 'Grunt', 'Grunt']);
    CHECK(r.state === FightState.Wiped);
    CHECK(r.partyAlive === 0);
    CHECK(r.firstDeath.valid && r.firstDeath.victim === 0);
    CHECK(r.firstDeath.topSource > 0);
    CHECK(r.logText.includes('WIPE'));
    CHECK(r.logText.includes('First to fall'));
  });
  it('PostWinReviveNeedsALivingPriest', () => {
    {
      const s = new CombatSim(data, 1);
      s.addPartyUnit('Priest');
      s.addPartyUnit('Barbarian');
      const m = s.addPartyUnit('Mage');
      s.addEnemy('Grunt', 1);
      s.startFight();
      s.mutableUnit(m)!.alive = false;
      s.mutableUnit(m)!.hp = 0;
      CHECK(s.runToEnd() === FightState.Won);
      CHECK(s.postWinRevive() === 1);
      CHECK(s.getUnit(m)!.alive && s.getUnit(m)!.hp === 1);
    }
    {
      const s = new CombatSim(data, 1);
      s.addPartyUnit('Warrior');
      s.addPartyUnit('Barbarian');
      const m = s.addPartyUnit('Mage');
      s.addEnemy('Grunt', 1);
      s.startFight();
      s.mutableUnit(m)!.alive = false;
      s.mutableUnit(m)!.hp = 0;
      CHECK(s.runToEnd() === FightState.Won);
      CHECK(s.postWinRevive() === 0);
      CHECK(!s.getUnit(m)!.alive);
    }
  });
  it('RestRoomHealsThirtyPercentAndRevivesWithoutPriest', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    s.mutableUnit(w)!.hp = 10;
    s.mutableUnit(m)!.alive = false;
    s.mutableUnit(m)!.hp = 0;
    CHECK(s.restRoom() === 1);
    NEAR(s.getUnit(w)!.hp, 10 + s.config().restHealPct * s.maxHp(s.getUnit(w)!), 1e-9);
    CHECK(s.getUnit(m)!.alive && s.getUnit(m)!.hp === 1);
    NEAR(s.config().restHealPct, 0.3, 1e-12);
  });
  it('HpCarriesOverToTheNextFight', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const b = s.addPartyUnit('Barbarian');
    s.addEnemy('Grunt', 1);
    s.startFight();
    CHECK(s.runToEnd() === FightState.Won);
    const hpW = s.getUnit(w)!.hp;
    const hpB = s.getUnit(b)!.hp;
    s.prepareNextFight();
    CHECK(s.getState() === FightState.NotStarted);
    NEAR(s.getUnit(w)!.hp, hpW, 1e-12);
    NEAR(s.getUnit(b)!.hp, hpB, 1e-12);
    s.addEnemy('Grunt', 1);
    s.startFight();
    CHECK(s.runToEnd() === FightState.Won);
  });
  it('ReinforcementWaveDelaysTheWinAndCountsTowardTheKillQuota', () => {
    const wave: WaveSpec = { atSeconds: 10, enemies: ['Grunt', 'Grunt'], floorNumber: 1 };
    const r = runFightHeadless(data, 5, ['Warrior', 'Barbarian', 'Assassin', 'Mage'], ['Grunt'], 1, [wave]);
    CHECK(r.state === FightState.Won);
    CHECK(r.seconds >= wave.atSeconds);
    CHECK(r.enemiesKilled === 3);
    CHECK(r.logText.includes('Reinforcement wave'));
  });
  it('ReinforcementsJoinTheSameThreatTables', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    s.scheduleWave(1, ['Grunt'], 1);
    s.startFight();
    StepTicks(s, 31);
    let late = kNoUnit;
    for (const u of s.getUnits()) if (u.enemy && u.id !== g) late = u.id;
    CHECK(late !== kNoUnit);
    s.dealDamage(w, g, 1.0, DamageTag.Auto);
    s.step();
    CHECK(s.getUnit(w)!.target === late);
  });
});

describe('combat: review fixes (G2 round 2)', () => {
  it('EffectDraftValuesLiveInDataNotCpp', () => {
    for (const n of ['Taunt_1', 'Taunt_2', 'GroupHeal_1', 'Execute_1', 'Rage_1', 'Rage_2', 'SummonSpirit_1', 'Fireball_1']) {
      const e = data.findEffect(n);
      CHECK(e && e.Value >= 0, n);
    }
    NEAR(EffectValue('Taunt_1'), 1, 1e-9);   // director Nov 20: highest threat +1
    NEAR(EffectValue('Taunt_2'), 0.3, 1e-6);
    NEAR(EffectDuration('Taunt_2'), 4, 1e-9);
    NEAR(EffectValue('Rage_1'), 0.5, 1e-6);
    NEAR(EffectDuration('Rage_2'), 5, 1e-9);
    NEAR(EffectDuration('SummonSpirit_1'), 10, 1e-9);
  });
  it('UnconfiguredEffectDoesNothingAndIsLoggedOnce', () => {
    const d = cloneData();
    for (const e of d.effects) if (e.Name === 'Fireball_1') e.Value = -1;
    const s = new CombatSim(d, 1);
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    Place(s, m, 0, 0);
    Place(s, g, 100, 0);
    Freeze(s, m);
    Freeze(s, g);
    s.startFight();
    const hp = s.getUnit(g)!.hp;
    CHECK(s.forceCastAbility(m));
    CHECK(s.forceCastAbility(m));
    NEAR(s.getUnit(g)!.hp, hp, 1e-12);
    const log = s.getLog().toText();
    const first = log.indexOf('Fireball_1 is not configured');
    CHECK(first >= 0);
    CHECK(log.indexOf('Fireball_1 is not configured', first + 1) < 0);
  });
  it('PrepareNextFightResetsCountersAndCauseOfDeath', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    s.addEnemy('Grunt', 1);
    s.startFight();
    CHECK(s.runToEnd() === FightState.Won);
    const u = s.getUnit(w)!;
    CHECK(u.damageTaken > 0 && u.damageDone > 0 && u.kills === 1);
    s.prepareNextFight();
    CHECK(u.damageTaken === 0 && u.damageDone === 0 && u.kills === 0);
    CHECK(u.healDone === 0 && u.threatGenerated === 0 && u.damageFrom.length === 0);
    const a = s.addEnemy('Archer', 1);
    s.startFight();
    s.mutableUnit(w)!.hp = 0.5;
    s.dealDamage(a, w, 1.0, DamageTag.Auto);
    CHECK(s.getFirstDeath().valid);
    CHECK(s.getFirstDeath().text.includes('Archer'));
    CHECK(!s.getFirstDeath().text.includes('Grunt'));
    CHECK(!s.summaryText().includes('Grunt'));
    CHECK(!s.getLog().toText().includes('Grunt'));
  });
  it('StuckFightLogsTimeoutNotWipe', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, w);
    Freeze(s, g);
    Place(s, w, -1200, -700);
    Place(s, g, 1200, 700);
    s.startFight();
    CHECK(s.runToEnd() === FightState.TimedOut);
    const log = s.getLog().toText();
    CHECK(log.includes('FightEnded: TIMEOUT'));
    CHECK(!log.includes('FightEnded: WIPE'));
    CHECK(s.getUnit(w)!.alive || s.getUnit(w)!.hp === 0);
  });
  it('RetiredUnitsAreCompactedAndIdsRestart', () => {
    const s = new CombatSim(data, 9);
    const w = s.addPartyUnit('Warrior');
    s.addPartyUnit('Barbarian');
    s.addPartyUnit('Mage');
    let early = 0, late = 0;
    for (let fight = 0; fight < 60; ++fight) {
      s.addEnemy('Grunt', 1);
      s.addEnemy('Archer', 1);
      s.addEnemy('Grunt', 1);
      CHECK(s.getUnit(3) && s.getUnit(3)!.enemy && s.getUnit(3)!.id === 3);
      s.startFight();
      const t0 = performance.now();
      s.runToEnd();
      const us = ((performance.now() - t0) * 1000) / Math.max(1, s.tickCount());
      if (fight < 10) early += us;
      if (fight >= 50) late += us;
      s.restRoom();
      s.restRoom();
      s.restRoom();
      s.restRoom();
      s.prepareNextFight();
      CHECK(s.getUnits().length === 3);
    }
    CHECK(s.getUnit(w)!.name === 'Warrior');
    CHECK(late < early * 3 + 50);
  });
  it('PriestHoldsBackWhenNobodyIsHurt', () => {
    const s = new CombatSim(data, 1);
    s.addPartyUnit('Warrior');
    const p = s.addPartyUnit('Priest');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, g);
    Place(s, g, 1000, 0);
    s.startFight();
    const x0 = s.getUnit(p)!.x, y0 = s.getUnit(p)!.y;
    StepTicks(s, 90);
    NEAR(s.getUnit(p)!.x, x0, 1e-6);
    NEAR(s.getUnit(p)!.y, y0, 1e-6);
  });
  it('LifestealHealsDoNotRaiseHealingThreat', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const g = s.addEnemy('Grunt', 1);
    s.mutableUnit(b)!.hp = 10;
    s.mutableUnit(b)!.lifesteal = 0.5;
    s.mutableUnit(b)!.rageLifestealLeft = 5;
    let heals = 0;
    s.getBus().subscribe('HealApplied', () => { ++heals; });
    const dealt = s.dealDamage(b, g, 1.0, DamageTag.Auto);
    CHECK(heals === 1);
    CHECK(s.getUnit(b)!.hp > 10);
    NEAR(s.threatOn(g, b), dealt * s.getUnit(b)!.stats.get(StatId.Threat) * s.getUnit(b)!.threatMult, 1e-9);
    const before = s.threatOn(g, b);
    const eff = s.applyHeal(b, b, 1.0);
    CHECK(eff > 0);
    NEAR(s.threatOn(g, b) - before, eff * s.config().healThreatFactor, 1e-9);
  });
  it('UnknownEnemyInAWaveIsWarnedAndWavesKeepTheirOwnFloor', () => {
    const s = new CombatSim(data, 1);
    s.addPartyUnit('Warrior');
    s.addEnemy('Grunt', 1);
    s.scheduleWave(1, ['Nope'], 1);
    s.scheduleWave(2, ['Grunt'], 5);
    s.startFight();
    StepTicks(s, 70);
    CHECK(s.getLog().toText().includes("WARNING: unknown enemy 'Nope'"));
    let late;
    for (const u of s.getUnits()) if (u.enemy && u.id > 1) late = u;
    CHECK(late !== undefined);
    if (late) NEAR(s.maxHp(late), Enemy('Grunt').BaseStats.HP * Math.pow(s.config().floorScaling, 4), 1e-6);
  });
  it('BoxedInWarriorAttacksAnyEnemyInReachAndTheFightEnds', () => {
    const orders = [['Brute', 'Brute', 'Shaman', 'Shaman'], ['Shaman', 'Shaman', 'Brute', 'Brute'], ['Brute', 'Shaman', 'Brute', 'Shaman']];
    for (const enemies of orders) {
      for (const seed of [1, 2, 3]) {
        const s = new CombatSim(data, seed);
        const w = s.addPartyUnit('Warrior');
        s.addPartyUnit('Priest');
        s.addPartyUnit('Summoner');
        for (const e of enemies) s.addEnemy(e, 1);
        s.startFight();
        CHECK(s.runToEnd() !== FightState.TimedOut);
        CHECK(s.getUnit(w)!.damageDone > 0);
      }
    }
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const far = s.addEnemy('Grunt', 1);
    const near = s.addEnemy('Grunt', 1);
    Freeze(s, w);
    Freeze(s, far);
    Freeze(s, near);
    Place(s, w, 0, 0);
    Place(s, near, 100, 0);
    Place(s, far, 1000, 0);
    s.startFight();
    s.dealDamage(w, near, 1.0, DamageTag.Auto);
    StepTicks(s, 60);
    CHECK(s.getUnit(w)!.target === far);
    CHECK(s.getUnit(near)!.hp < s.maxHp(s.getUnit(near)!) - 1e-9 || !s.getUnit(near)!.alive);
    CHECK(s.threatOn(near, w) > 0);
  });
});

describe('combat: log', () => {
  it('CombatLogIsARingBuffer', () => {
    const log = new CombatLog(5);
    for (let i = 0; i < 12; ++i) {
      const e = logEntry({ tick: i });
      e.text = `e${i}`;
      log.add(e);
    }
    CHECK(log.getEntries().length === 5);
    CHECK(log.totalAdded() === 12);
    CHECK(log.getEntries()[0].tick === 7);
    CHECK(log.getEntries()[4].tick === 11);
  });
  it('G2FightWritesLogWithEveryEventKind', () => {
    const r = runFightHeadless(data, 42, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']);
    CHECK(r.state === FightState.Won || r.state === FightState.Wiped);
    for (const k of ['FightStarted', 'hits', 'FightEnded', 'dies']) CHECK(r.logText.includes(k), k);
  });
});

describe('combat: soak', () => {
  it('SoakSeededFightsNeverTimeOutAndAreDeterministic', () => {
    const parties = [['Warrior', 'Mage'], ['Warrior', 'Priest', 'Mage', 'Barbarian'], ['Warrior', 'Priest', 'Assassin', 'Summoner']];
    const guard = defaultCombatConfig().runawayGuardSeconds;
    for (const party of parties) {
      for (let seed = 1; seed <= 100; ++seed) {
        const a = runFightHeadless(data, seed, party, ['Grunt', 'Grunt', 'Grunt']);
        const b = runFightHeadless(data, seed, party, ['Grunt', 'Grunt', 'Grunt']);
        CHECK(a.state !== FightState.TimedOut, `seed ${seed}`);
        CHECK(a.seconds < guard);
        CHECK(a.logText === b.logText);
        CHECK(a.state === b.state && a.ticks === b.ticks);
      }
    }
  });
});
