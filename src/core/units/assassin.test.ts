// Port of tests/units/assassin/tests.cpp: data row, auto attack, Execute, crit, lifesteal, positioning, targeting, fights.
import { describe, it } from 'vitest';
import { Behavior, CombatSim, FightState, runFightHeadless } from '../combatSim';
import { DamageTag, kNoUnit, type UnitId } from '../eventBus';
import { ModKind, ModSource, StatId } from '../statResolver';
import { CHECK, Cls, Dummy, Enemy, Freeze, NEAR, Place, StepSeconds, data } from '../combatTestKit';

const kDt = 1 / 30;
const H = (x: number, y: number): number => Math.sqrt(x * x + y * y);

class Duel {
  sim: CombatSim;
  a: UnitId;
  e: UnitId;
  constructor(enemyName = 'Grunt', seed = 1) {
    this.sim = new CombatSim(data, seed);
    this.a = this.sim.addPartyUnit('Assassin');
    this.e = Dummy(this.sim, enemyName, 120, 0);
    Place(this.sim, this.a, 0, 0);
    Freeze(this.sim, this.a);
    this.sim.startFight();
  }
  A() { return this.sim.mutableUnit(this.a)!; }
  E() { return this.sim.mutableUnit(this.e)!; }
}
const executeScale = (): number => {
  const ex = data.findAbility('Execute');
  return ex ? data.findEffect(ex.EffectIds[0])?.Value ?? 0 : 0;
};
function castTimes(s: CombatSim, caster: UnitId, seconds: number): number[] {
  const times: number[] = [];
  s.getBus().subscribe('AbilityCast', (ev) => { if (ev.caster === caster) times.push(s.getTime()); });
  StepSeconds(s, seconds);
  return times;
}

describe('units: Assassin data and base stats', () => {
  it('ClassRowIsAssassinMeleeDpsWithExecute', () => {
    const c = Cls('Assassin');
    CHECK(c.RoleTag === 'MeleeDPS');
    CHECK(c.AbilityId === 'Execute');
    CHECK(c.AutoActionId === 'FastMelee');
    CHECK(data.findAbility('Execute') !== undefined);
  });
  it('BaseStatsComeFromDataAndMatchDesignTable', () => {
    const c = Cls('Assassin');
    const s = new CombatSim(data, 1);
    const u = s.getUnit(s.addPartyUnit('Assassin'))!;
    NEAR(s.maxHp(u), c.BaseStats.HP, 1e-9);
    NEAR(u.hp, c.BaseStats.HP, 1e-9);
    NEAR(u.stats.get(StatId.Damage), c.BaseStats.Damage, 1e-9);
    NEAR(u.stats.get(StatId.AttackSpeed), c.BaseStats.AttackPerSec, 1e-9);
    NEAR(u.stats.get(StatId.DefensePercent), c.BaseStats.DefensePct, 1e-9);
    NEAR(u.stats.get(StatId.Threat), c.BaseThreat, 1e-9);
    NEAR(u.threatMult, c.ThreatMultiplier, 1e-9);
    NEAR(u.stats.get(StatId.Range), c.AttackRange, 1e-9);
    NEAR(u.moveSpeed, c.MoveSpeed, 1e-9);
    NEAR(u.stats.get(StatId.CritChance), 0, 1e-12);
    CHECK(u.abilityId === 'Execute');
    NEAR(c.BaseStats.HP, 80, 1e-6);
    NEAR(c.BaseStats.Damage, 14, 1e-6);
    NEAR(c.BaseStats.AttackPerSec, 1.4, 1e-6);
    NEAR(c.BaseStats.DefensePct, 0, 1e-6);
    const ex = data.findAbility('Execute');
    CHECK(ex && Math.abs(ex.Cooldown - 8) < 1e-6);
  });
  it('AssassinIsFragileAndHardHitting', () => {
    const a = Cls('Assassin');
    for (const o of ['Warrior', 'Priest', 'Barbarian', 'Summoner']) CHECK(a.BaseStats.HP <= Cls(o).BaseStats.HP, o);
    CHECK(a.BaseStats.Damage > Cls('Warrior').BaseStats.Damage);
    CHECK(a.BaseStats.Damage > Cls('Barbarian').BaseStats.Damage);
    for (const o of ['Warrior', 'Priest', 'Barbarian', 'Summoner', 'Mage']) CHECK(a.BaseStats.AttackPerSec > Cls(o).BaseStats.AttackPerSec, o);
  });
  it('AllowedStatsAndTriggerModesFromData', () => {
    const c = Cls('Assassin');
    for (const st of ['Damage', 'AttackSpeed', 'Health', 'DefensePct', 'HealthRegen', 'CooldownReduction', 'CritChance', 'CritFactor',
      'Lifesteal', 'RapidFireChance', 'RapidFireDuration']) CHECK(c.AllowedStats.includes(st), st);
    for (const st of ['Threat', 'Range', 'HealPower', 'Fortitude', 'Thorns', 'DeathDefy', 'RendArmorChance']) CHECK(!c.AllowedStats.includes(st), st);
    CHECK(c.AllowedTriggerModes.length === 4);
    CHECK(c.AllowedTargetTypes.length === 5);
  });
  it('ExecuteIsOneDamageEffectOnWeakestEnemy', () => {
    const ex = data.findAbility('Execute');
    CHECK(ex && ex.EffectIds.length === 1);
    const e = ex ? data.findEffect(ex.EffectIds[0]) : undefined;
    CHECK(e !== undefined);
    if (!e) return;
    CHECK(e.Type === 'Damage');
    CHECK(e.TargetSelector === 'WeakestEnemy');
    CHECK(e.Value > 0);
    CHECK(e.Value > 1);
  });
});

describe('units: Assassin auto attack', () => {
  it('AutoAttackHitsInMeleeRangeForBaseDamage', () => {
    const d = new Duel('Brute');
    let got = -1, tags = 0, hits = 0;
    d.sim.getBus().subscribe('DamageDealt', (ev) => { if (ev.source === d.a && ev.target === d.e) { got = ev.amount; tags = ev.tags; ++hits; } });
    StepSeconds(d.sim, 1.5);
    CHECK(hits >= 1);
    NEAR(got, Cls('Assassin').BaseStats.Damage * (1 - Enemy('Brute').BaseStats.DefensePct / 100), 1e-9);
    CHECK((tags & DamageTag.Auto) !== 0);
    CHECK((tags & DamageTag.Ability) === 0);
  });
  it('AutoAttackRateMatchesAttackSpeed', () => {
    const d = new Duel('Grunt');
    let attacks = 0;
    d.sim.getBus().subscribe('AttackStarted', (ev) => { if (ev.attacker === d.a) ++attacks; });
    const secs = 7;
    StepSeconds(d.sim, secs);
    const ideal = secs * Cls('Assassin').BaseStats.AttackPerSec;
    CHECK(attacks >= Math.trunc(ideal) - 1);
    CHECK(attacks <= Math.ceil(ideal));
    CHECK(attacks > secs * Cls('Warrior').BaseStats.AttackPerSec);
  });
  it('AutoAttackDoesNotCritWithoutCritChance', () => {
    const d = new Duel('Grunt');
    let crits = 0, hits = 0;
    d.sim.getBus().subscribe('DamageDealt', (ev) => { if (ev.source === d.a) { ++hits; if (ev.crit) ++crits; } });
    StepSeconds(d.sim, 7);
    CHECK(hits > 5);
    CHECK(crits === 0);
  });
  it('NoAttackWhenTargetOutOfMeleeRange', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    const e = Dummy(s, 'Grunt', 500, 0);
    Place(s, a, 0, 0);
    Freeze(s, a);
    s.startFight();
    let hits = 0;
    s.getBus().subscribe('DamageDealt', (ev) => { if (ev.source === a) ++hits; });
    StepSeconds(s, 3);
    CHECK(hits === 0);
    Place(s, e, 120, 0);
    StepSeconds(s, 1.5);
    CHECK(hits >= 1);
  });
  it('AutoAttackBuildsThreatAtPlainRate', () => {
    const d = new Duel('Grunt');
    StepSeconds(d.sim, 3);
    const e = d.E();
    const dmg = e.damageFrom.length > d.a ? e.damageFrom[d.a] : 0;
    CHECK(dmg > 0);
    NEAR(d.sim.threatOn(d.e, d.a), dmg, 1e-9);
  });
});

describe('units: Assassin Execute', () => {
  it('ExecuteDealsScaleTimesDamageAsAbilityHit', () => {
    const d = new Duel('Brute');
    let got = -1, tags = 0, casts = 0;
    d.sim.getBus().subscribe('AbilityCast', (ev) => { if (ev.caster === d.a && ev.abilityId === 'Execute') ++casts; });
    d.sim.getBus().subscribe('DamageDealt', (ev) => { if (ev.source === d.a) { got = ev.amount; tags = ev.tags; } });
    CHECK(d.sim.forceCastAbility(d.a));
    CHECK(casts === 1);
    NEAR(got, executeScale() * Cls('Assassin').BaseStats.Damage * (1 - Enemy('Brute').BaseStats.DefensePct / 100), 1e-9);
    CHECK((tags & DamageTag.Ability) !== 0);
    CHECK((tags & DamageTag.Auto) === 0);
  });
  it('ExecuteDamageScalesWithDamageStat', () => {
    const d = new Duel('Grunt');
    d.A().stats.addModifier(StatId.Damage, ModKind.Percent, 0.5, ModSource.GoldUpgrade);
    const before = d.E().hp;
    CHECK(d.sim.forceCastAbility(d.a));
    NEAR(before - d.E().hp, executeScale() * Cls('Assassin').BaseStats.Damage * 1.5, 1e-9);
  });
  it('ExecuteHitsWeakestEnemyInRangeNotTheAutoTarget', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    Place(s, a, 0, 0);
    Freeze(s, a);
    const nearFull = Dummy(s, 'Grunt', 0, 100, 5000);
    const farWeak = Dummy(s, 'Grunt', 140, 0, 5000);
    const midHigh = Dummy(s, 'Grunt', 0, -120, 5000);
    s.mutableUnit(farWeak)!.hp = 1000;
    s.mutableUnit(midHigh)!.hp = 3000;
    s.startFight();
    s.step();
    CHECK(s.getUnit(a)!.target === nearFull);
    const victims: UnitId[] = [];
    s.getBus().subscribe('DamageDealt', (ev) => { if (ev.source === a && ev.tags & DamageTag.Ability) victims.push(ev.target); });
    CHECK(s.forceCastAbility(a));
    CHECK(victims.length === 1 && victims[0] === farWeak);
  });
  it('ExecuteIgnoresWeakestEnemyOutOfRange', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    Place(s, a, 0, 0);
    Freeze(s, a);
    const inRange = Dummy(s, 'Grunt', 120, 0, 5000);
    const outOfRange = Dummy(s, 'Grunt', 600, 0, 5000);
    s.mutableUnit(outOfRange)!.hp = 10;
    s.startFight();
    const before = s.getUnit(outOfRange)!.hp;
    CHECK(s.forceCastAbility(a));
    NEAR(s.getUnit(outOfRange)!.hp, before, 1e-12);
    CHECK(s.getUnit(inRange)!.hp < 5000);
  });
  it('ExecuteKillsLowHpEnemyAndCreditsTheKill', () => {
    const d = new Duel('Grunt');
    d.E().hp = executeScale() * Cls('Assassin').BaseStats.Damage * 0.5;
    let killer = kNoUnit, victim = kNoUnit, killedEvents = 0;
    d.sim.getBus().subscribe('EnemyKilled', (ev) => { killer = ev.killer; victim = ev.enemy; ++killedEvents; });
    CHECK(d.sim.forceCastAbility(d.a));
    CHECK(!d.E().alive);
    CHECK(killedEvents === 1);
    CHECK(killer === d.a && victim === d.e);
    CHECK(d.sim.getEnemiesKilled() === 1);
    CHECK(d.sim.getUnit(d.a)!.kills === 1);
  });
  it('ExecuteHasNoLowHpThresholdOrBonusInCore', () => {
    const full = new Duel('Grunt');
    const low = new Duel('Grunt');
    const hit = executeScale() * Cls('Assassin').BaseStats.Damage;
    low.E().hp = 3000;
    const f0 = full.E().hp, l0 = low.E().hp;
    full.sim.forceCastAbility(full.a);
    low.sim.forceCastAbility(low.a);
    NEAR(f0 - full.E().hp, hit, 1e-9);
    NEAR(l0 - low.E().hp, hit, 1e-9);
  });
  it('ExecuteOverkillIsClampedToRemainingHp', () => {
    const d = new Duel('Grunt');
    d.E().hp = 5;
    let dealt = 0;
    d.sim.getBus().subscribe('DamageDealt', (ev) => { if (ev.source === d.a) dealt = ev.amount; });
    d.sim.forceCastAbility(d.a);
    NEAR(dealt, 5, 1e-9);
  });
  it('ExecuteAddsThreatForTheAbilityDamage', () => {
    const d = new Duel('Grunt');
    CHECK(d.sim.forceCastAbility(d.a));
    NEAR(d.sim.threatOn(d.e, d.a), executeScale() * Cls('Assassin').BaseStats.Damage, 1e-9);
  });
  it('ExecuteCastsOnCooldownEveryEightSeconds', () => {
    const d = new Duel('Grunt');
    const cd = data.findAbility('Execute')!.Cooldown;
    const t = castTimes(d.sim, d.a, cd * 3 + 0.5);
    CHECK(t.length === 3);
    t.forEach((x, i) => NEAR(x, cd * (i + 1), kDt * 1.01));
  });
  it('ExecuteDoesNotCastBeforeCooldownIsUp', () => {
    const d = new Duel('Grunt');
    CHECK(castTimes(d.sim, d.a, data.findAbility('Execute')!.Cooldown - 0.2).length === 0);
  });
  it('CooldownReductionShortensExecuteCooldown', () => {
    const d = new Duel('Grunt');
    d.A().stats.addModifier(StatId.CooldownReduction, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
    const cd = data.findAbility('Execute')!.Cooldown;
    const t = castTimes(d.sim, d.a, cd * 0.5 * 2 + 0.2);
    CHECK(t.length === 2);
    if (t.length === 2) {
      NEAR(t[0], cd / 2, kDt * 1.01);
      NEAR(t[1], cd, kDt * 1.01);
    }
  });
  it('ExecuteWaitsForATargetInRangeAndKeepsCooldownReady', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    const e = Dummy(s, 'Grunt', 500, 0);
    Place(s, a, 0, 0);
    Freeze(s, a);
    s.startFight();
    let casts = 0;
    s.getBus().subscribe('AbilityCast', (ev) => { if (ev.caster === a) ++casts; });
    StepSeconds(s, data.findAbility('Execute')!.Cooldown + 2);
    CHECK(casts === 0);
    Place(s, e, 120, 0);
    s.step();
    s.step();
    CHECK(casts === 1);
  });
  it('ExecuteTriggerModesFollowTheCombatHooksConditions', () => {
    const cd = data.findAbility('Execute')!.Cooldown;
    {
      const d = new Duel('Grunt');
      d.A().trigger = 'SaveForBossOrElite';
      StepSeconds(d.sim, cd + 1);
      CHECK(!d.sim.getLog().toText().includes('casts Execute'));
      d.E().elite = true;
      d.sim.step();
      CHECK(d.sim.getLog().toText().includes('casts Execute'));
    }
    {
      const s = new CombatSim(data, 1);
      const a = s.addPartyUnit('Assassin');
      Place(s, a, 0, 0);
      Freeze(s, a);
      s.mutableUnit(a)!.trigger = 'PackIsLarge';
      Dummy(s, 'Grunt', 120, 0);
      Dummy(s, 'Grunt', 0, 120);
      s.startFight();
      StepSeconds(s, cd + 1);
      CHECK(!s.getLog().toText().includes('casts Execute'));
      Dummy(s, 'Grunt', 0, -120);
      s.step();
      CHECK(s.getLog().toText().includes('casts Execute'));
    }
    {
      const d = new Duel('Grunt');
      d.A().trigger = 'AllyIsLow';
      StepSeconds(d.sim, cd + 1);
      CHECK(!d.sim.getLog().toText().includes('casts Execute'));
      d.A().hp = d.sim.maxHp(d.A()) * 0.3;
      d.sim.step();
      CHECK(d.sim.getLog().toText().includes('casts Execute'));
    }
  });
});

describe('units: Assassin crit and lifesteal', () => {
  it('CritChanceOneCritsAutoAndExecuteWithBaseFactor', () => {
    const d = new Duel('Grunt');
    d.A().stats.addModifier(StatId.CritChance, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
    let autoDmg = 0, autoCrit = false;
    d.sim.getBus().subscribe('DamageDealt', (ev) => { if (ev.source === d.a && ev.tags & DamageTag.Auto) { autoDmg = ev.amount; autoCrit = ev.crit; } });
    StepSeconds(d.sim, 1.5);
    CHECK(autoCrit);
    NEAR(autoDmg, Cls('Assassin').BaseStats.Damage * d.sim.config().baseCritFactor, 1e-9);
    const before = d.E().hp;
    d.sim.forceCastAbility(d.a);
    NEAR(before - d.E().hp, executeScale() * Cls('Assassin').BaseStats.Damage * d.sim.config().baseCritFactor, 1e-9);
  });
  it('CritFactorStatRaisesCritDamage', () => {
    const d = new Duel('Grunt');
    d.A().stats.addModifier(StatId.CritChance, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
    d.A().stats.addModifier(StatId.CritFactor, ModKind.Flat, 0.5, ModSource.GoldUpgrade);
    const before = d.E().hp;
    d.sim.forceCastAbility(d.a);
    NEAR(before - d.E().hp, executeScale() * Cls('Assassin').BaseStats.Damage * (d.sim.config().baseCritFactor + 0.5), 1e-9);
  });
  it('CritChanceIsAProbabilityAndCappedAtOne', () => {
    const d = new Duel('Grunt');
    d.A().stats.addModifier(StatId.CritChance, ModKind.Flat, 0.5, ModSource.GoldUpgrade);
    let crits = 0;
    const n = 2000;
    for (let i = 0; i < n; ++i) {
      d.E().hp = 100000;
      let crit = false;
      const id = d.sim.getBus().subscribe('DamageDealt', (ev) => { crit = ev.crit; });
      d.sim.dealDamage(d.a, d.e, 1.0, DamageTag.Auto);
      d.sim.getBus().unsubscribe('DamageDealt', id);
      if (crit) ++crits;
    }
    CHECK(crits > n * 0.45 && crits < n * 0.55);
    d.A().stats.addModifier(StatId.CritChance, ModKind.Flat, 5.0, ModSource.GoldUpgrade);
    NEAR(d.A().stats.get(StatId.CritChance), 1, 1e-12);
  });
  it('LifestealHealsAFractionOfDamageDealt', () => {
    const d = new Duel('Grunt');
    d.A().hp = 40;
    d.A().lifesteal = 0.25;
    let healSrc = kNoUnit, healTgt = kNoUnit, healAmt = 0;
    d.sim.getBus().subscribe('HealApplied', (ev) => { healSrc = ev.source; healTgt = ev.target; healAmt = ev.effectiveAmount; });
    const dealt = d.sim.dealDamage(d.a, d.e, 1.0, DamageTag.Auto);
    NEAR(healAmt, dealt * 0.25, 1e-9);
    CHECK(healSrc === d.a && healTgt === d.a);
    NEAR(d.A().hp, 40 + dealt * 0.25, 1e-9);
    NEAR(d.A().healDone, dealt * 0.25, 1e-9);
  });
  it('LifestealAlsoAppliesToExecuteAndClampsToMissingHp', () => {
    const d = new Duel('Grunt');
    d.A().lifesteal = 0.5;
    const max = d.sim.maxHp(d.A());
    d.A().hp = max - 1;
    d.sim.forceCastAbility(d.a);
    NEAR(d.A().hp, max, 1e-9);
    d.A().hp = 10;
    d.sim.forceCastAbility(d.a);
    NEAR(d.A().hp, 10 + executeScale() * Cls('Assassin').BaseStats.Damage * 0.5, 1e-9);
  });
  it('LifestealHealingAddsNoHealingThreat', () => {
    const d = new Duel('Grunt');
    d.A().hp = 40;
    d.A().lifesteal = 0.5;
    const dealt = d.sim.dealDamage(d.a, d.e, 1.0, DamageTag.Auto);
    NEAR(d.sim.threatOn(d.e, d.a), dealt, 1e-9);
  });
  it('NoLifestealByDefault', () => {
    const d = new Duel('Grunt');
    d.A().hp = 40;
    d.sim.dealDamage(d.a, d.e, 1.0, DamageTag.Auto);
    NEAR(d.A().hp, 40, 1e-12);
  });
});

describe('units: Assassin movement and targeting', () => {
  it('AssassinMovesAtItsMoveSpeedTowardTheTarget', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    Dummy(s, 'Grunt', 800, 0);
    Place(s, a, -800, 0);
    s.startFight();
    const u = s.getUnit(a)!;
    const x0 = u.x, y0 = u.y;
    StepSeconds(s, 1);
    NEAR(H(u.x - x0, u.y - y0), Cls('Assassin').MoveSpeed, Cls('Assassin').MoveSpeed * kDt * 1.5);
    CHECK(u.x > x0);
  });
  it('AssassinClosesToMeleeRangeAndStaysEngaged', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    const e = Dummy(s, 'Grunt', 800, 0);
    Place(s, a, -800, 0);
    s.startFight();
    const u = s.getUnit(a)!;
    const en = s.getUnit(e)!;
    const range = Cls('Assassin').AttackRange;
    const speed = Cls('Assassin').MoveSpeed;
    let engagedAt = -1;
    for (let i = 0; i < 240 && engagedAt < 0; ++i) {
      s.step();
      if (H(u.x - en.x, u.y - en.y) <= range + 1e-6) engagedAt = s.getTime();
    }
    const expected = (1600 - range) / speed;
    CHECK(engagedAt > 0);
    CHECK(engagedAt >= expected - 0.1);
    CHECK(engagedAt <= expected + 0.6);
    StepSeconds(s, 4);
    CHECK(H(u.x - en.x, u.y - en.y) <= range + 1e-6);
  });
  it('AssassinNeverRetreatsFromAnEnemyThatIsClose', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    const e = Dummy(s, 'Grunt', 110, 0);
    Place(s, a, 0, 0);
    s.startFight();
    const u = s.getUnit(a)!;
    const en = s.getUnit(e)!;
    StepSeconds(s, 4);
    CHECK(H(u.x - en.x, u.y - en.y) <= Cls('Assassin').AttackRange);
    NEAR(Cls('Assassin').RetreatDistance, 0, 1e-9);
    NEAR(Cls('Assassin').PreferredDistMin, 0, 1e-9);
    NEAR(Cls('Assassin').PreferredDistMax, Cls('Assassin').AttackRange, 1e-9);
  });
  it('AssassinIsTheFastestUnitAndOutrunsEnemyMelee', () => {
    const a = Cls('Assassin').MoveSpeed;
    for (const c of ['Warrior', 'Priest', 'Barbarian', 'Summoner', 'Mage']) CHECK(a > Cls(c).MoveSpeed, c);
    for (const e of ['Grunt', 'Brute', 'Archer', 'Shaman']) CHECK(a > Enemy(e).MoveSpeed, e);
  });
  it('AssassinUsesMeleeBehaviorNotTankOrCaster', () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    CHECK(s.getUnit(a)!.behavior === Behavior.Melee);
    CHECK(!s.getUnit(a)!.healer);
  });
  const frozenAssassin = () => {
    const s = new CombatSim(data, 1);
    const a = s.addPartyUnit('Assassin');
    Place(s, a, 0, 0);
    Freeze(s, a);
    return { s, a };
  };
  it('DefaultTargetPriorityIsClosestEnemy', () => {
    const { s, a } = frozenAssassin();
    Dummy(s, 'Grunt', 140, 0);
    const nearer = Dummy(s, 'Grunt', 0, 100);
    s.startFight();
    s.step();
    CHECK(s.getUnit(a)!.targetTypes.length === 1 && s.getUnit(a)!.targetTypes[0] === 'Closest');
    CHECK(s.getUnit(a)!.target === nearer);
  });
  it('AssassinIgnoresThreatWhenChoosingATarget', () => {
    const { s, a } = frozenAssassin();
    const far = Dummy(s, 'Grunt', 140, 0);
    const nearer = Dummy(s, 'Grunt', 0, 100);
    s.startFight();
    s.mutableUnit(far)!.threat = [0, 0, 0, 0];
    s.mutableUnit(far)!.threat[a] = 9999;
    s.step();
    CHECK(s.getUnit(a)!.target === nearer);
  });
  it('WeakestPriorityPicksLowestHpEnemy', () => {
    const { s, a } = frozenAssassin();
    Dummy(s, 'Grunt', 0, 100, 5000);
    const weak = Dummy(s, 'Grunt', 140, 0, 5000);
    s.mutableUnit(weak)!.hp = 100;
    s.mutableUnit(a)!.targetTypes = ['Weakest'];
    s.startFight();
    s.step();
    CHECK(s.getUnit(a)!.target === weak);
  });
  it('StrongestPriorityPicksHighestHpEnemy', () => {
    const { s, a } = frozenAssassin();
    Dummy(s, 'Grunt', 0, 100, 5000);
    const strong = Dummy(s, 'Brute', 140, 0, 9000);
    s.mutableUnit(a)!.targetTypes = ['Strongest'];
    s.startFight();
    s.step();
    CHECK(s.getUnit(a)!.target === strong);
  });
  it('HealerFirstAndArcherFirstPriorities', () => {
    const { s, a } = frozenAssassin();
    Dummy(s, 'Grunt', 0, 100);
    const healer = Dummy(s, 'Shaman', 140, 0);
    const archer = Dummy(s, 'Archer', 0, -140);
    s.mutableUnit(a)!.targetTypes = ['HealerFirst', 'Closest'];
    s.startFight();
    s.step();
    CHECK(s.getUnit(a)!.target === healer);
    s.mutableUnit(a)!.targetTypes = ['ArcherFirst', 'Closest'];
    s.step();
    CHECK(s.getUnit(a)!.target === archer);
  });
  it('PriorityListFallsThroughWhenNoValidEnemy', () => {
    const { s, a } = frozenAssassin();
    const g = Dummy(s, 'Grunt', 100, 0);
    s.mutableUnit(a)!.targetTypes = ['HealerFirst', 'ArcherFirst'];
    s.startFight();
    s.step();
    CHECK(s.getUnit(a)!.target === g);
  });
  it('AutoAttackGoesToChosenTargetWhileExecuteGoesToWeakest', () => {
    const { s, a } = frozenAssassin();
    const nearFull = Dummy(s, 'Grunt', 0, 100, 5000);
    const farWeak = Dummy(s, 'Grunt', 140, 0, 5000);
    s.mutableUnit(farWeak)!.hp = 4000;
    s.startFight();
    const hits: [UnitId, boolean][] = [];
    s.getBus().subscribe('DamageDealt', (ev) => { if (ev.source === a) hits.push([ev.target, (ev.tags & DamageTag.Ability) !== 0]); });
    StepSeconds(s, 1.5);
    s.forceCastAbility(a);
    CHECK(hits.length >= 2);
    for (let i = 0; i + 1 < hits.length; ++i) CHECK(hits[i][0] === nearFull && !hits[i][1]);
    CHECK(hits.length > 0 && hits[hits.length - 1][0] === farWeak && hits[hits.length - 1][1]);
  });
});

describe('units: Assassin fights', () => {
  const duelFight = (enemy: string, seed: number) => runFightHeadless(data, seed, ['Assassin'], [enemy]);
  it('FightVsGruntIsWonAndLogsIdenticalOnRepeat', () => {
    const a = duelFight('Grunt', 7);
    const b = duelFight('Grunt', 7);
    CHECK(a.logText !== '');
    CHECK(a.logText === b.logText);
    CHECK(a.summary === b.summary);
    CHECK(a.ticks === b.ticks);
    CHECK(a.state === FightState.Won);
    CHECK(a.enemiesKilled === 1);
    CHECK(a.partyAlive === 1);
    CHECK(a.logText.includes('Assassin#0 hits Grunt#1'));
  });
  it('LongFightVsBruteUsesExecuteAndLogsIdenticalOnRepeat', () => {
    const a = duelFight('Brute', 11);
    const b = duelFight('Brute', 11);
    CHECK(a.logText === b.logText);
    CHECK(a.state === FightState.Won);
    CHECK(a.logText.includes('Assassin#0 casts Execute'));
    CHECK(a.logText.includes('[ability]'));
    CHECK(a.seconds > data.findAbility('Execute')!.Cooldown);
  });
  it('FightWithCritsIsStillDeterministicPerSeed', () => {
    const run = (seed: number): string => {
      const s = new CombatSim(data, seed);
      const a = s.addPartyUnit('Assassin');
      s.addEnemy('Brute', 1);
      s.mutableUnit(a)!.stats.addModifier(StatId.CritChance, ModKind.Flat, 0.4, ModSource.GoldUpgrade);
      s.mutableUnit(a)!.lifesteal = 0.1;
      s.startFight();
      s.runToEnd();
      return s.getLog().toText();
    };
    const x1 = run(3);
    CHECK(x1 === run(3));
    CHECK(x1.includes('(crit)'));
    CHECK(x1.includes(' heals '));
  });
  it('AssassinDiesFirstAmongThePartyWhenFocusedAndNoOneElseDoes', () => {
    const r = runFightHeadless(data, 1, ['Assassin'], ['Grunt', 'Grunt', 'Grunt']);
    CHECK(r.state === FightState.Wiped);
    CHECK(r.firstDeath.valid);
    CHECK(r.partyAlive === 0);
  });
});
