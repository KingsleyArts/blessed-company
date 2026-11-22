// Port of tests/units/priest/tests.cpp: heal-or-smite rule, Group Heal, positioning, revive, joining a built fight,
// determinism, floor-2 rescue pack. The C++ "REPORT" lines are information, not checks, and are not printed here.
import { describe, it } from 'vitest';
import { Behavior, CombatSim, FightState, defaultCombatConfig, kHealBase, runFightHeadless, type WaveSpec } from '../combatSim';
import { CombatData } from '../combatData';
import { DamageTag, kNoUnit, type DamageDealt, type UnitId } from '../eventBus';
import { ModKind, ModSource, StatId } from '../statResolver';
import { CHECK, NEAR, StepSeconds, pinnedData } from '../combatTestKit';
import { installShippedCastTimes } from '../castTimes';

const data = pinnedData;
const Cls = (n: string) => data.findClassRow(n)!;
const Enemy = (n: string) => data.findEnemy(n)!;
const EffectValue = (n: string) => data.findEffect(n)?.Value ?? 0;
const Place = (s: CombatSim, id: UnitId, x: number, y: number) => { const u = s.mutableUnit(id)!; u.x = x; u.y = y; };
const Freeze = (s: CombatSim, id: UnitId) => { s.mutableUnit(id)!.moveSpeed = 0; };
const StepN = (s: CombatSim, n: number) => { for (let i = 0; i < n; ++i) s.step(); };
const U = (s: CombatSim, id: UnitId) => s.mutableUnit(id)!;
const Frac = (s: CombatSim, id: UnitId) => s.getUnit(id)!.hp / s.maxHp(s.getUnit(id)!);
const DistU = (s: CombatSim, a: UnitId, b: UnitId) => {
  const ua = s.getUnit(a)!, ub = s.getUnit(b)!;
  return Math.sqrt((ua.x - ub.x) ** 2 + (ua.y - ub.y) ** 2);
};
const GroupHealCd = () => data.findAbility('GroupHeal')!.Cooldown;

/** Frozen scene: Priest (-800,0), Warrior (-800,-200), Grunt (-200,0): 600 from the Priest, in Range, out of retreat. */
function makeScene(s: CombatSim, withEnemy = true) {
  const p = s.addPartyUnit('Priest');
  const w = s.addPartyUnit('Warrior');
  Freeze(s, p); Freeze(s, w);
  Place(s, p, -800, 0); Place(s, w, -800, -200);
  let g = kNoUnit;
  if (withEnemy) { g = s.addEnemy('Grunt', 1); Freeze(s, g); Place(s, g, -200, 0); }
  return { p, w, g };
}
function countHealsAndSmites(s: CombatSim, priest: UnitId, ticks: number) {
  let heals = 0, smites = 0;
  s.getBus().subscribe('HealApplied', (e) => { if (e.source === priest) ++heals; });
  s.getBus().subscribe('DamageDealt', (e) => { if (e.source === priest && e.tags & DamageTag.Smite) ++smites; });
  StepN(s, ticks);
  return { heals, smites };
}

describe('units: Priest data', () => {
  it('PriestBaseStatsComeFromDataAndMatchTheDesignNumbers', () => {
    const c = Cls('Priest');
    CHECK(c.RoleTag === 'Healer');
    NEAR(c.BaseStats.HP, 100, 1e-9);
    NEAR(c.BaseStats.Damage, 3, 1e-9);
    NEAR(c.BaseStats.AttackPerSec, 0.8, 1e-6);
    NEAR(c.BaseStats.DefensePct, 0, 1e-9);
    NEAR(c.BaseThreat, 1, 1e-9);
    NEAR(c.ThreatMultiplier, 1, 1e-9);
    NEAR(c.MoveSpeed, 280, 1e-9);
    NEAR(c.AttackRange, 700, 1e-9);
    NEAR(c.PreferredDistMin, 600, 1e-9);
    NEAR(c.PreferredDistMax, 700, 1e-9);
    NEAR(c.RetreatDistance, 500, 1e-9);
    CHECK(c.AutoActionId === 'HealOrSmite');
    CHECK(c.AbilityId === 'GroupHeal');
    CHECK(c.RetreatDistance > Cls('Mage').RetreatDistance && c.RetreatDistance > Cls('Summoner').RetreatDistance);
    CHECK(c.MoveSpeed > Cls('Mage').MoveSpeed);
    const s = new CombatSim(data, 1);
    const u = s.getUnit(s.addPartyUnit('Priest'))!;
    NEAR(s.maxHp(u), c.BaseStats.HP, 1e-9);
    NEAR(u.hp, c.BaseStats.HP, 1e-9);
    NEAR(u.stats.get(StatId.Damage), c.BaseStats.Damage, 1e-9);
    NEAR(u.stats.get(StatId.AttackSpeed), c.BaseStats.AttackPerSec, 1e-9);
    NEAR(u.stats.get(StatId.Range), c.AttackRange, 1e-9);
    NEAR(u.stats.get(StatId.Threat), c.BaseThreat, 1e-9);
    NEAR(u.stats.get(StatId.HealPower), 0, 1e-9);
    CHECK(u.healer && u.behavior === Behavior.Backline && !u.enemy);
    NEAR(u.moveSpeed, c.MoveSpeed, 1e-9);
    NEAR(u.retreat, c.RetreatDistance, 1e-9);
  });
  it('GroupHealAbilityIsDataDriven', () => {
    const a = data.findAbility('GroupHeal');
    CHECK(a !== undefined);
    if (a) {
      NEAR(a.Cooldown, 10, 1e-9);
      CHECK(a.EffectIds.length === 1 && a.EffectIds[0] === 'GroupHeal_1');
    }
    const e = data.findEffect('GroupHeal_1');
    CHECK(e && e.Type === 'Heal' && e.TargetSelector === 'AllAllies');
    CHECK(EffectValue('GroupHeal_1') > 0);
    NEAR(kHealBase, 8, 1e-12);
  });
});

describe('units: Priest heal-or-smite', () => {
  it('SmiteThresholdIsEightyFivePercentAndLivesInPriestDataRow', () => {
    NEAR(Cls('Priest').SmiteThreshold, 0.85, 1e-6);
    NEAR(defaultCombatConfig().smiteThreshold, 0.85, 1e-12);
  });
  it('ThresholdBoundaryHealsBelowAndSmitesAtOrAbove', () => {
    for (const [frac, heals] of [[0.80, true], [0.84, true], [0.849, true], [0.85, false], [0.86, false], [1.0, false]] as const) {
      const s = new CombatSim(data, 1);
      const sc = makeScene(s);
      U(s, sc.w).hp = s.maxHp(s.getUnit(sc.w)!) * frac;
      s.startFight();
      const r = countHealsAndSmites(s, sc.p, 45);
      if (heals) CHECK(r.heals === 1 && r.smites === 0, `frac ${frac}`);
      else CHECK(r.heals === 0 && r.smites === 1, `frac ${frac}`);
    }
  });
  it('ThresholdFollowsTheDataValue', () => {
    const d2 = new CombatData();
    d2.classes = structuredClone(data.classes);
    d2.enemies = data.enemies;
    d2.abilities = data.abilities;
    d2.effects = data.effects;
    for (const r of d2.classes) if (r.Name === 'Priest') r.SmiteThreshold = 0.5;
    const s = new CombatSim(d2, 1);
    const sc = makeScene(s);
    U(s, sc.w).hp = s.maxHp(s.getUnit(sc.w)!) * 0.7;
    s.startFight();
    const r = countHealsAndSmites(s, sc.p, 45);
    CHECK(r.heals === 0 && r.smites === 1);
  });
  it('HealTargetIsTheLowestHpFractionAllyNotLowestAbsoluteHp', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    const m = s.addPartyUnit('Mage');
    Freeze(s, m);
    Place(s, m, -800, 200);
    U(s, sc.w).hp = s.maxHp(s.getUnit(sc.w)!) * 0.6;
    U(s, m).hp = s.maxHp(s.getUnit(m)!) * 0.7;
    CHECK(s.getUnit(m)!.hp < s.getUnit(sc.w)!.hp);
    let first = kNoUnit;
    s.getBus().subscribe('HealApplied', (e) => { if (first === kNoUnit && e.source === sc.p) first = e.target; });
    s.startFight();
    StepN(s, 45);
    CHECK(first === sc.w);
  });
  it('PriestHealsItselfWhenItIsTheOnlyHurtUnit', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    U(s, sc.p).hp = 50;
    let target = kNoUnit, amount = 0;
    s.getBus().subscribe('HealApplied', (e) => { if (target === kNoUnit) { target = e.target; amount = e.effectiveAmount; } });
    s.startFight();
    StepN(s, 45);
    CHECK(target === sc.p);
    NEAR(amount, kHealBase, 1e-9);
  });
  it('AutoHealIsEightClampedToMissingHpAndRespectsAttackSpeed', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    U(s, sc.w).hp = 1;
    const amounts: number[] = [], times: number[] = [];
    s.getBus().subscribe('HealApplied', (e) => { if (e.source === sc.p) { amounts.push(e.effectiveAmount); times.push(s.getTime()); } });
    s.startFight();
    StepN(s, 180);
    const interval = 1 / Cls('Priest').BaseStats.AttackPerSec;
    CHECK(amounts.length >= 4 && amounts.length <= 5);
    for (const a of amounts) NEAR(a, kHealBase, 1e-9);
    if (times.length >= 2) NEAR(times[1] - times[0], interval, 0.05);
    const s2 = new CombatSim(data, 1);
    const sc2 = makeScene(s2);
    const w2 = U(s2, sc2.w);
    w2.hp = s2.maxHp(w2) * 0.84;
    CHECK(s2.maxHp(w2) - w2.hp > kHealBase);
    w2.hp = s2.maxHp(w2) - 3;
    s2.startFight();
    const r = countHealsAndSmites(s2, sc2.p, 45);
    CHECK(r.heals === 0 && r.smites === 1);
  });
  it('HealPowerRaisesTheAutoHeal', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    U(s, sc.p).stats.addModifier(StatId.HealPower, ModKind.Flat, 0.5, ModSource.GoldUpgrade);
    U(s, sc.w).hp = 1;
    let amount = 0;
    s.getBus().subscribe('HealApplied', (e) => { if (amount === 0) amount = e.effectiveAmount; });
    s.startFight();
    StepN(s, 45);
    NEAR(amount, kHealBase * 1.5, 1e-9);
  });
  it('DeadAlliesAreNotHealTargets', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    s.dealDamage(sc.g, sc.w, 1000, DamageTag.Auto);
    CHECK(!s.getUnit(sc.w)!.alive);
    s.startFight();
    const r = countHealsAndSmites(s, sc.p, 45);
    CHECK(r.heals === 0 && r.smites === 1);
  });
  it('HealRaisesHealingThreatOnEveryEnemy', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    const g2 = s.addEnemy('Grunt', 1);
    Freeze(s, g2);
    Place(s, g2, 800, 600);
    U(s, sc.w).hp = 1;
    s.startFight();
    let healed = 0;
    s.getBus().subscribe('HealApplied', (e) => { if (e.source === sc.p) healed += e.effectiveAmount; });
    StepN(s, 45);
    CHECK(healed > 0);
    NEAR(s.threatOn(sc.g, sc.p), healed * s.config().healThreatFactor, 1e-9);
    NEAR(s.threatOn(g2, sc.p), healed * s.config().healThreatFactor, 1e-9);
  });
});

describe('units: Priest smite', () => {
  it('SmiteIsAWeakRangedAttackTaggedSmiteAndAuto', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    const hits: DamageDealt[] = [];
    let heals = 0;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === sc.p) hits.push({ ...e }); });
    s.getBus().subscribe('HealApplied', () => { ++heals; });
    s.startFight();
    StepN(s, 180);
    CHECK(hits.length >= 4 && hits.length <= 5);
    CHECK(heals === 0);
    for (const h of hits) {
      CHECK((h.tags & DamageTag.Smite) !== 0);
      CHECK((h.tags & DamageTag.Auto) !== 0);
      CHECK((h.tags & DamageTag.Ability) === 0);
      CHECK(h.target === sc.g);
      NEAR(h.amount, Cls('Priest').BaseStats.Damage * (1 - Enemy('Grunt').BaseStats.DefensePct / 100), 1e-9);
      CHECK(!h.crit);
    }
    CHECK(Cls('Priest').BaseStats.Damage < Cls('Mage').BaseStats.Damage / 2);
    CHECK(Cls('Priest').BaseStats.Damage < Cls('Warrior').BaseStats.Damage);
    CHECK(Cls('Priest').AttackRange > Cls('Warrior').AttackRange * 3);
    CHECK(DistU(s, sc.p, sc.g) > Enemy('Grunt').AttackRange);
  });
  it('SmiteDamageUsesTheDamageStatAndTargetDefense', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s, false);
    const b = s.addEnemy('Brute', 1);
    Freeze(s, b);
    Place(s, b, -200, 0);
    U(s, sc.p).stats.addModifier(StatId.Damage, ModKind.Flat, 3, ModSource.Essence);
    let amount = 0;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === sc.p && amount === 0) amount = e.amount; });
    s.startFight();
    StepN(s, 45);
    NEAR(amount, (Cls('Priest').BaseStats.Damage + 3) * (1 - Enemy('Brute').BaseStats.DefensePct / 100), 1e-9);
  });
  it('SmiteThreatIsDamageTimesThreatStatTimesMultiplier', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    let dealt = 0;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === sc.p) dealt += e.amount; });
    s.startFight();
    StepN(s, 90);
    CHECK(dealt > 0);
    NEAR(s.threatOn(sc.g, sc.p), dealt * Cls('Priest').BaseThreat * Cls('Priest').ThreatMultiplier, 1e-9);
    CHECK(Cls('Priest').BaseStats.Damage * 1.0 < Cls('Warrior').BaseStats.Damage * Cls('Warrior').BaseThreat);
  });
  it('SmiteNeverFiresWhileAnAllyIsHurtAndHealNeverFiresWhenEveryoneIsHigh', () => {
    let smites = 0, heals = 0, violations = 0;
    for (let seed = 1; seed <= 30; ++seed) {
      const s = new CombatSim(data, seed);
      s.addPartyUnit('Warrior');
      const p = s.addPartyUnit('Priest');
      s.addPartyUnit('Mage');
      s.addEnemy('Grunt', 1);
      s.addEnemy('Grunt', 1);
      s.addEnemy('Brute', 1);
      let castTick = -1;
      const thr = s.config().smiteThreshold;
      s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === p) castTick = s.tickCount(); });
      s.getBus().subscribe('DamageDealt', (e) => {
        if (e.source !== p) return;
        if (!(e.tags & DamageTag.Smite) || !(e.tags & DamageTag.Auto)) ++violations;
        ++smites;
        for (const u of s.getUnits()) {
          if (u.enemy || u.summon || !u.alive) continue;
          if (u.hp / s.maxHp(u) < thr - 1e-9) ++violations;
        }
      });
      s.getBus().subscribe('HealApplied', (e) => {
        if (e.source !== p) return;
        if (s.tickCount() === castTick) return;
        ++heals;
        const t = s.getUnit(e.target)!;
        const prior = (t.hp - e.effectiveAmount) / s.maxHp(t);
        if (prior >= thr - 1e-9) ++violations;
        for (const u of s.getUnits()) {
          if (u.enemy || u.summon || !u.alive || u.id === e.target) continue;
          if (u.hp / s.maxHp(u) < prior - 1e-9) ++violations;
        }
      });
      s.startFight();
      s.runToEnd();
    }
    CHECK(violations === 0);
    CHECK(heals > 0);
    CHECK(smites > 0);
  });
  it('PriestWithNoEnemyInRangeAndNobodyHurtDoesNothing', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    Place(s, sc.g, 1000, 0);
    s.startFight();
    const r = countHealsAndSmites(s, sc.p, 120);
    CHECK(r.heals === 0 && r.smites === 0);
  });
  it('HurtAllyOutOfRangeBlocksSmiteAndPriestWalksToItThenHeals', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    Place(s, sc.w, 1200, 0);
    U(s, sc.w).hp = 20;
    s.startFight();
    const r = countHealsAndSmites(s, sc.p, 90);
    CHECK(r.heals === 0 && r.smites === 0);
    const s2 = new CombatSim(data, 1);
    const sc2 = makeScene(s2);
    U(s2, sc2.p).moveSpeed = Cls('Priest').MoveSpeed;
    Place(s2, sc2.p, -400, 0);
    Place(s2, sc2.w, -1200, 0);
    Place(s2, sc2.g, 800, 0);
    U(s2, sc2.w).hp = 20;
    s2.startFight();
    CHECK(DistU(s2, sc2.p, sc2.w) > Cls('Priest').AttackRange);
    const r2 = countHealsAndSmites(s2, sc2.p, 240);
    CHECK(r2.heals > 0);
    CHECK(DistU(s2, sc2.p, sc2.w) <= Cls('Priest').AttackRange + 1e-6);
  });
  it('SmiteTargetsTheClosestEnemy', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    const far = s.addEnemy('Grunt', 1);
    Freeze(s, far);
    Place(s, far, -150, 400);
    Place(s, far, -300, 450);
    CHECK(DistU(s, sc.p, far) > DistU(s, sc.p, sc.g));
    CHECK(DistU(s, sc.p, far) < Cls('Priest').AttackRange);
    let first = kNoUnit;
    s.getBus().subscribe('DamageDealt', (e) => { if (first === kNoUnit && e.source === sc.p) first = e.target; });
    s.startFight();
    StepN(s, 45);
    CHECK(first === sc.g);
  });
  it('SmiteRaisesNoHealEventSoAnEchoListenerCannotStackFromIt', () => {
    const s = new CombatSim(data, 1);
    makeScene(s);
    let heals = 0;
    s.getBus().subscribe('HealApplied', () => { ++heals; });
    s.startFight();
    StepN(s, 240);
    CHECK(heals === 0);
  });
});

describe('units: Priest Group Heal', () => {
  it('GroupHealHealsEveryLivingAllyBySettingTimesBaseHealAndSkipsTheDead', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    const m = s.addPartyUnit('Mage');
    Freeze(s, m);
    Place(s, m, -800, 200);
    U(s, sc.w).hp = 1;
    U(s, sc.p).hp = 50;
    s.dealDamage(sc.g, m, 1000, DamageTag.Auto);
    CHECK(!s.getUnit(m)!.alive);
    s.startFight();
    let heals = 0;
    s.getBus().subscribe('HealApplied', () => { ++heals; });
    CHECK(s.forceCastAbility(sc.p));
    const amount = EffectValue('GroupHeal_1') * kHealBase;
    NEAR(s.getUnit(sc.w)!.hp, 1 + amount, 1e-9);
    NEAR(s.getUnit(sc.p)!.hp, 50 + amount, 1e-9);
    CHECK(heals === 2);
    CHECK(!s.getUnit(m)!.alive && s.getUnit(m)!.hp === 0);
    NEAR(amount, 9.6, 1e-6);
  });
  it('GroupHealClampsToMissingHpAndScalesWithHealPower', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    U(s, sc.w).hp = s.maxHp(s.getUnit(sc.w)!) - 5;
    U(s, sc.p).hp = 1;
    U(s, sc.p).stats.addModifier(StatId.HealPower, ModKind.Flat, 0.5, ModSource.GoldUpgrade);
    s.startFight();
    s.forceCastAbility(sc.p);
    NEAR(s.getUnit(sc.w)!.hp, s.maxHp(s.getUnit(sc.w)!), 1e-9);
    NEAR(s.getUnit(sc.p)!.hp, 1 + EffectValue('GroupHeal_1') * kHealBase * 1.5, 1e-9);
  });
  it('GroupHealFiresOnCooldownFromDataAndRepeats', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    U(s, sc.w).hp = 1;
    const casts: number[] = [];
    s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === sc.p && e.abilityId === 'GroupHeal') casts.push(s.getTime()); });
    s.startFight();
    const cd = GroupHealCd();
    StepN(s, Math.trunc((cd * 2 + 1) / s.config().dt));
    CHECK(casts.length === 2);
    if (casts.length === 2) {
      CHECK(casts[0] > cd - 0.15 && casts[0] < cd + 0.15);
      NEAR(casts[1] - casts[0], cd, 0.15);
    }
  });
  it('CooldownReductionSpeedsUpGroupHeal', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    U(s, sc.p).stats.addModifier(StatId.CooldownReduction, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
    const casts: number[] = [];
    s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === sc.p) casts.push(s.getTime()); });
    s.startFight();
    StepN(s, 180);
    CHECK(casts.length === 1);
    if (casts.length) NEAR(casts[0], GroupHealCd() / 2, 0.15);
  });
  it('GroupHealRaisesHealingThreatPerHeal', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    U(s, sc.w).hp = 1;
    U(s, sc.p).hp = 1;
    s.startFight();
    let healed = 0;
    s.getBus().subscribe('HealApplied', (e) => { healed += e.effectiveAmount; });
    s.forceCastAbility(sc.p);
    CHECK(healed > 0);
    NEAR(s.threatOn(sc.g, sc.p), healed * s.config().healThreatFactor, 1e-9);
  });
  it('GroupHealIsSpentEvenWhenNobodyIsHurt', () => {
    const s = new CombatSim(data, 1);
    makeScene(s);
    let casts = 0, heals = 0;
    s.getBus().subscribe('AbilityCast', () => { ++casts; });
    s.getBus().subscribe('HealApplied', () => { ++heals; });
    s.startFight();
    StepN(s, 330);
    CHECK(casts === 1);
    CHECK(heals === 0);
  });
  it('GroupHealWithAllyIsLowTriggerWaitsForUnderFortyPercent', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    U(s, sc.p).trigger = 'AllyIsLow';
    U(s, sc.p).abilityTimer = 100;
    let casts = 0;
    s.getBus().subscribe('AbilityCast', () => { ++casts; });
    s.startFight();
    StepN(s, 30);
    CHECK(casts === 0);
    U(s, sc.w).hp = s.maxHp(s.getUnit(sc.w)!) * 0.5;
    StepN(s, 5);
    CHECK(casts === 0);
    U(s, sc.w).hp = s.maxHp(s.getUnit(sc.w)!) * 0.3;
    StepN(s, 5);
    CHECK(casts === 1);
  });
});

describe('units: Priest positioning', () => {
  it('PriestRetreatsToTheHoldDistanceWhenAnEnemyIsInsideRetreatDistance', () => {
    const s = new CombatSim(data, 1);
    const p = s.addPartyUnit('Priest');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, g);
    Place(s, p, -800, 0);
    Place(s, g, -500, 0);
    s.startFight();
    CHECK(DistU(s, p, g) < Cls('Priest').RetreatDistance);
    StepN(s, 150);
    const hold = Math.max(Cls('Priest').PreferredDistMin, Cls('Priest').RetreatDistance * s.config().retreatHoldFactor);
    CHECK(DistU(s, p, g) >= Cls('Priest').RetreatDistance);
    CHECK(DistU(s, p, g) <= hold + 3);
  });
  it('PriestHoldsItsPositionWhenNobodyIsHurtAndNoEnemyIsClose', () => {
    const s = new CombatSim(data, 1);
    const p = s.addPartyUnit('Priest');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, g);
    Place(s, g, 1000, 0);
    s.startFight();
    const x0 = s.getUnit(p)!.x, y0 = s.getUnit(p)!.y;
    StepN(s, 120);
    NEAR(s.getUnit(p)!.x, x0, 1e-6);
    NEAR(s.getUnit(p)!.y, y0, 1e-6);
  });
  it('PriestKeepsFarthestFromTheEnemyAmongTheParty', () => {
    let ticks = 0, farthest = 0;
    for (let seed = 1; seed <= 20; ++seed) {
      const s = new CombatSim(data, seed);
      const w = s.addPartyUnit('Warrior');
      const p = s.addPartyUnit('Priest');
      const m = s.addPartyUnit('Mage');
      for (let i = 0; i < 3; ++i) s.addEnemy('Grunt', 1);
      s.startFight();
      const nearest = (u: { x: number; y: number }) => {
        let d = 1e9;
        for (const e of s.getUnits()) if (e.enemy && e.alive) d = Math.min(d, Math.sqrt((e.x - u.x) ** 2 + (e.y - u.y) ** 2));
        return d;
      };
      while (s.getState() === FightState.Running && s.tickCount() < 20000) {
        s.step();
        const pu = s.getUnit(p)!;
        if (!pu.alive) break;
        ++ticks;
        const wu = s.getUnit(w)!, mu = s.getUnit(m)!;
        const dp = nearest(pu);
        if ((!wu.alive || dp >= nearest(wu) - 1) && (!mu.alive || dp >= nearest(mu) - 1)) ++farthest;
      }
    }
    CHECK(ticks > 0);
    CHECK(farthest * 100 >= ticks * 40);
  });
});

describe('units: Priest revive, rest and joining', () => {
  const killEnemyAndEndFight = (s: CombatSim, attacker: UnitId, enemy: UnitId) => {
    s.dealDamage(attacker, enemy, 10000, DamageTag.Ability);
    s.step();
  };
  it('PostFightReviveNeedsALivingPriest', () => {
    {
      const s = new CombatSim(data, 1);
      const sc = makeScene(s);
      const m = s.addPartyUnit('Mage');
      Freeze(s, m);
      s.dealDamage(sc.g, sc.w, 10000, DamageTag.Auto);
      s.startFight();
      killEnemyAndEndFight(s, m, sc.g);
      CHECK(s.getState() === FightState.Won);
      CHECK(s.postWinRevive() === 1);
      CHECK(s.getUnit(sc.w)!.alive);
      NEAR(s.getUnit(sc.w)!.hp, 1, 1e-9);
    }
    {
      const s = new CombatSim(data, 1);
      const sc = makeScene(s);
      const m = s.addPartyUnit('Mage');
      Freeze(s, m);
      s.dealDamage(sc.g, sc.w, 10000, DamageTag.Auto);
      s.dealDamage(sc.g, sc.p, 10000, DamageTag.Auto);
      s.startFight();
      killEnemyAndEndFight(s, m, sc.g);
      CHECK(s.getState() === FightState.Won);
      CHECK(s.postWinRevive() === 0);
      CHECK(!s.getUnit(sc.w)!.alive && !s.getUnit(sc.p)!.alive);
      CHECK(s.getLog().toText().includes('No Priest alive'));
    }
    {
      const s = new CombatSim(data, 1);
      const sc = makeScene(s);
      s.startFight();
      s.dealDamage(sc.g, sc.w, 10000, DamageTag.Auto);
      s.dealDamage(sc.g, sc.p, 10000, DamageTag.Auto);
      s.step();
      CHECK(s.getState() === FightState.Wiped);
      CHECK(s.postWinRevive() === 0);
    }
  });
  it('RestRoomRecoversALostPriestAndHealsThirtyPercent', () => {
    const s = new CombatSim(data, 1);
    const sc = makeScene(s);
    const m = s.addPartyUnit('Mage');
    Freeze(s, m);
    U(s, m).hp = 10;
    s.dealDamage(sc.g, sc.w, 10000, DamageTag.Auto);
    s.dealDamage(sc.g, sc.p, 10000, DamageTag.Auto);
    s.startFight();
    killEnemyAndEndFight(s, m, sc.g);
    CHECK(s.postWinRevive() === 0);
    const mageMax = s.maxHp(s.getUnit(m)!);
    CHECK(s.restRoom() === 2);
    CHECK(s.getUnit(sc.p)!.alive && s.getUnit(sc.w)!.alive);
    NEAR(s.getUnit(sc.p)!.hp, 1, 1e-9);
    NEAR(s.getUnit(m)!.hp, 10 + s.config().restHealPct * mageMax, 1e-9);
    NEAR(s.config().restHealPct, 0.30, 1e-12);
    s.prepareNextFight();
    const g2 = s.addEnemy('Grunt', 1);
    s.startFight();
    s.dealDamage(g2, s.getUnit(1)!.id, 10000, DamageTag.Auto);
    killEnemyAndEndFight(s, 0, g2);
    if (s.getState() === FightState.Won) CHECK(s.postWinRevive() >= 1);
  });
  it('PriestJoinsWarriorAndMageAtFightStartWithFullStatsAndHp', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    s.addEnemy('Grunt', 2);
    s.startFight();
    CHECK(s.getState() === FightState.Running);
    CHECK(w === 0 && m === 1);
    const s2 = new CombatSim(data, 1);
    s2.addPartyUnit('Warrior');
    s2.addPartyUnit('Mage');
    const p = s2.addPartyUnit('Priest');
    CHECK(p === 2);
    const pu = s2.getUnit(p);
    CHECK(pu && pu.alive && pu.healer);
    NEAR(pu!.hp, Cls('Priest').BaseStats.HP, 1e-9);
    NEAR(s2.maxHp(pu!), Cls('Priest').BaseStats.HP, 1e-9);
    NEAR(pu!.stats.get(StatId.Damage), Cls('Priest').BaseStats.Damage, 1e-9);
    NEAR(pu!.x, s2.config().partySpawnX, 1e-9);
    CHECK(DistU(s2, p, 0) < Cls('Priest').AttackRange && DistU(s2, p, 1) < Cls('Priest').AttackRange);
  });
  it('PriestJoiningAfterPrepareNextFightIsFullHpWhileOthersCarryOverTheirHp', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, w); Freeze(s, m);
    Place(s, w, -800, -200);
    Place(s, m, -800, 200);
    Freeze(s, g);
    Place(s, g, 800, 0);
    s.dealDamage(g, w, 12, DamageTag.Auto);
    s.dealDamage(g, m, 3, DamageTag.Auto);
    const wHp = s.getUnit(w)!.hp, mHp = s.getUnit(m)!.hp;
    s.startFight();
    killEnemyAndEndFight(s, m, g);
    CHECK(s.getState() === FightState.Won);
    CHECK(s.postWinRevive() === 0);
    s.prepareNextFight();
    const p = s.addPartyUnit('Priest');
    CHECK(p === 2);
    NEAR(s.getUnit(0)!.hp, wHp, 1e-9);
    NEAR(s.getUnit(1)!.hp, mHp, 1e-9);
    CHECK(s.getUnit(0)!.hp < s.maxHp(s.getUnit(0)!));
    NEAR(s.getUnit(p)!.hp, Cls('Priest').BaseStats.HP, 1e-9);
    NEAR(s.maxHp(s.getUnit(p)!), Cls('Priest').BaseStats.HP, 1e-9);
    CHECK(s.getUnit(p)!.alive);
    NEAR(s.getUnit(p)!.x, s.config().partySpawnX, 1e-9);
    const g2 = s.addEnemy('Grunt', 2);
    Freeze(s, g2);
    Place(s, g2, 800, 0);
    CHECK(Frac(s, 0) < s.config().smiteThreshold);
    let healed = kNoUnit;
    s.getBus().subscribe('HealApplied', (e) => { if (healed === kNoUnit && e.source === p) healed = e.target; });
    const lowest = Frac(s, 0) <= Frac(s, 1) ? 0 : 1;
    s.startFight();
    StepN(s, 60);
    CHECK(healed === lowest);
  });
  it('PriestAddedMidFightJoinsTheThreatTablesAndStartsHealing', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 2);
    Freeze(s, w); Freeze(s, m); Freeze(s, g);
    Place(s, w, -800, -200);
    Place(s, m, -800, 200);
    Place(s, g, 800, 0);
    U(s, w).hp = 20;
    s.startFight();
    StepN(s, 60);
    const p = s.addPartyUnit('Priest');
    CHECK(p === 3);
    NEAR(s.getUnit(p)!.hp, Cls('Priest').BaseStats.HP, 1e-9);
    CHECK(s.getUnit(p)!.alive);
    let healed = kNoUnit;
    s.getBus().subscribe('HealApplied', (e) => { if (healed === kNoUnit && e.source === p) healed = e.target; });
    StepN(s, 60);
    CHECK(healed === w);
    CHECK(s.threatOn(g, p) > 0);
    CHECK(s.getState() === FightState.Running);
  });
});

describe('units: Priest fights', () => {
  const trio = (seed: number) => runFightHeadless(data, seed, ['Warrior', 'Priest', 'Mage'], ['Grunt', 'Grunt', 'Grunt']);
  it('FightWithPriestVsGruntStubRunsTwiceWithIdenticalLogs', () => {
    for (const seed of [1, 2, 3, 77, 12345]) {
      const a = trio(seed);
      const b = trio(seed);
      CHECK(a.logText !== '');
      CHECK(a.logText === b.logText);
      CHECK(a.state === b.state);
      CHECK(a.state !== FightState.TimedOut);
      CHECK(a.logText.includes('heals'));
    }
    CHECK(trio(1).state === FightState.Won);
  });
  it('MidFightJoinIsDeterministicToo', () => {
    const midFightJoinLog = (seed: number) => {
      const s = new CombatSim(data, seed);
      s.addPartyUnit('Warrior');
      s.addPartyUnit('Mage');
      for (let i = 0; i < 3; ++i) s.addEnemy('Grunt', 2);
      s.startFight();
      StepN(s, 90);
      s.addPartyUnit('Priest');
      s.runToEnd();
      return s.getLog().toText();
    };
    for (const seed of [1, 9]) CHECK(midFightJoinLog(seed) === midFightJoinLog(seed));
  });
  it('ReportFloor2RescueFightWinRateAndLength', () => {
    const runPack = (party: string[], pack: string[], floor: number, seeds: number, waves: WaveSpec[] = []) => {
      const r = { n: 0, timeouts: 0 };
      for (let seed = 1; seed <= seeds; ++seed) {
        const s = new CombatSim(data, seed);
        for (const p of party) s.addPartyUnit(p);
        for (const e of pack) s.addEnemy(e, floor);
        for (const w of waves) s.scheduleWave(w.atSeconds, w.enemies, floor);
        s.startFight();
        s.runToEnd();
        ++r.n;
        if (s.getState() !== FightState.Won && s.getState() !== FightState.Wiped) ++r.timeouts;
      }
      return r;
    };
    const seeds = 50;
    const pack = ['Grunt', 'Grunt', 'Brute', 'Shaman'];
    const withP = runPack(['Warrior', 'Priest', 'Mage'], pack, 2, seeds);
    const without = runPack(['Warrior', 'Mage'], pack, 2, seeds);
    runPack(['Warrior', 'Priest', 'Mage'], ['Grunt', 'Grunt', 'Grunt'], 2, seeds);
    runPack(['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt'], 2, seeds);
    const elite2 = runPack(['Warrior', 'Priest', 'Mage'], ['Grunt', 'Grunt', 'Brute', 'Archer'], 2, seeds);
    const waved = runPack(['Warrior', 'Priest', 'Mage'], pack, 2, seeds, [{ atSeconds: 12, enemies: ['Grunt', 'Archer'], floorNumber: 2 }]);
    CHECK(withP.timeouts === 0 && without.timeouts === 0 && elite2.timeouts === 0 && waved.timeouts === 0);
    CHECK(withP.n === seeds);
  });
  it('healerSmitesWhenIdle: heals the ally in Range even when the most hurt one is out of Range', () => {
    const run = (flag: boolean): number => {
      const cfg = defaultCombatConfig();
      cfg.healerSmitesWhenIdle = flag;
      const s = new CombatSim(data, 1, cfg);
      const p = s.addPartyUnit('Priest');
      const near = s.addPartyUnit('Warrior');
      const far = s.addPartyUnit('Mage');
      Freeze(s, p); Freeze(s, near); Freeze(s, far);
      Place(s, p, 0, 0); Place(s, near, 300, 0); Place(s, far, -1100, 0);
      const g = s.addEnemy('Grunt', 1);
      Freeze(s, g);
      Place(s, g, 1100, 600);
      s.startFight();
      s.mutableUnit(near)!.hp = 0.5 * s.maxHp(s.getUnit(near)!);
      s.mutableUnit(far)!.hp = 0.1 * s.maxHp(s.getUnit(far)!);
      let healed = 0;
      s.getBus().subscribe('HealApplied', (e) => { if (e.source === p && e.target === near) healed++; });
      StepSeconds(s, 6);
      return healed;
    };
    CHECK(run(false) === 0);   // the old rule waits for the lowest-HP ally and heals nobody
    CHECK(run(true) > 0);
  });
  it('healerSmitesWhenIdle: a cornered Priestess does not shuffle toward a hurt ally she cannot reach safely', () => {
    const run = (flag: boolean): { flips: number; hits: number } => {
      const cfg = defaultCombatConfig();
      installShippedCastTimes(cfg);
      cfg.healerSmitesWhenIdle = flag;
      const s = new CombatSim(data, 1, cfg);
      const p = s.addPartyUnit('Priest');
      const w = s.addPartyUnit('Warrior');
      Freeze(s, w);
      Place(s, p, -1190, 0);
      Place(s, w, -150, 0);
      const g = s.addEnemy('Grunt', 1);
      Freeze(s, g);
      Place(s, g, -720, 0);   // between them, inside her retreat distance
      s.startFight();
      s.mutableUnit(w)!.hp = 0.3 * s.maxHp(s.getUnit(w)!);
      let hits = 0;
      s.getBus().subscribe('DamageDealt', (e) => { if (e.source === p) hits++; });
      let lastX = s.getUnit(p)!.x, dir = 0, flips = 0;
      for (let t = 0; t < 30 * 12; ++t) {
        s.step();
        const x = s.getUnit(p)!.x, d = Math.abs(x - lastX) < 0.01 ? 0 : Math.sign(x - lastX);
        if (d !== 0) { if (dir !== 0 && d !== dir) ++flips; dir = d; }
        lastX = x;
      }
      return { flips, hits };
    };
    const off = run(false), on = run(true);
    CHECK(on.flips <= 2);
    CHECK(off.flips > 10 && off.hits === 0);   // the old rule paced back and forth and never cast
    CHECK(on.hits > 0);   // she fights from where she stands
  });
});
