// Port of tests/combat/tests.cpp, part 2 (shared-core pass, setters, Cleave, Taunt rework, rally and placement).
import { describe, it } from 'vitest';
import { CombatSim, FightState, defaultCombatConfig, runFightHeadless } from './combatSim';
import { DamageTag, kNoUnit } from './eventBus';
import { hypot } from './fmath';
import { ModSource, StatId } from './statResolver';
import {
  CHECK, Cls, EffectDuration, EffectValue, Enemy, Freeze, NEAR, Place, StepTicks, Tough, cloneData, data,
} from './combatTestKit';

const lround = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));
/** Data with the Nov 12 Taunt (forced attack only, no threat raise), for tests of the forced-attack mechanism by itself. */
const forcedOnlyTaunt = () => {
  const d = cloneData();
  d.findAbility('Taunt')!.EffectIds = ['Taunt_3', 'Taunt_2'];
  return d;
};
const grantCleave = (s: CombatSim, w: number): void => { s.mutableUnit(w)!.extraAbilities.push({ id: 'Cleave', timer: 0 }); };

describe('combat: shared-core pass', () => {
  it('AttackRateEqualsAttackPerSecWithoutDroppingTheRemainder', () => {
    for (const cls of ['Mage', 'Warrior', 'Assassin']) {
      const s = new CombatSim(data, 1);
      const p = s.addPartyUnit(cls);
      const e = s.addEnemy('Brute', 1);
      s.mutableUnit(e)!.stats.setBase(StatId.Health, 1e9);
      s.mutableUnit(e)!.hp = 1e9;
      s.mutableUnit(p)!.stats.setBase(StatId.Health, 1e9);
      s.mutableUnit(p)!.hp = 1e9;
      Freeze(s, p);
      Freeze(s, e);
      Place(s, p, 0, 0);
      Place(s, e, 100, 0);
      let attacks = 0;
      s.getBus().subscribe('AttackStarted', (a) => { if (a.attacker === p) ++attacks; });
      s.startFight();
      const seconds = 300;
      StepTicks(s, lround(seconds / s.config().dt));
      NEAR(attacks, s.getUnit(p)!.stats.get(StatId.AttackSpeed) * seconds, 1.01, cls);
    }
  });
  it('RageOnCooldownNeedsAnEnemyInRange', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, b);
    Freeze(s, g);
    Place(s, b, -1000, 0);
    Place(s, g, 1000, 0);
    let casts = 0;
    s.getBus().subscribe('AbilityCast', (a) => { if (a.caster === b) ++casts; });
    s.startFight();
    StepTicks(s, Math.trunc((data.findAbility('Rage')!.Cooldown + 3) / s.config().dt));
    CHECK(casts === 0);
    Place(s, g, -1000 + 100, 0);
    StepTicks(s, 2);
    CHECK(casts === 1);
  });
  it('BuffRecastRefreshesInsteadOfStacking', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    s.addEnemy('Grunt', 1);
    s.startFight();
    const base = s.getUnit(b)!.stats.get(StatId.AttackSpeed);
    CHECK(s.forceCastAbility(b));
    CHECK(s.forceCastAbility(b));
    NEAR(s.getUnit(b)!.stats.get(StatId.AttackSpeed), base * (1 + EffectValue('Rage_1')), 1e-9);
    CHECK(s.getUnit(b)!.stats.modifierCountForSource(ModSource.Buff) === 1);
    StepTicks(s, Math.trunc((EffectDuration('Rage_1') - 1) / s.config().dt));
    CHECK(s.forceCastAbility(b));
    StepTicks(s, Math.trunc(2 / s.config().dt));
    NEAR(s.getUnit(b)!.stats.get(StatId.AttackSpeed), base * (1 + EffectValue('Rage_1')), 1e-9);
  });
  it('RageLifestealIsSeparateFromTheLifestealStatField', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    s.addEnemy('Grunt', 1);
    s.startFight();
    CHECK(s.forceCastAbility(b));
    NEAR(s.getUnit(b)!.rageLifesteal, EffectValue('Rage_2'), 1e-9);
    NEAR(s.getUnit(b)!.lifesteal, 0, 1e-12);
    StepTicks(s, Math.trunc((EffectDuration('Rage_2') + 0.5) / s.config().dt));
    NEAR(s.getUnit(b)!.rageLifesteal, 0, 1e-12);
  });
  it('SetTargetPrioritiesAndTriggerModeSetters', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const w = s.addPartyUnit('Warrior');
    const e = s.addEnemy('Grunt', 1);
    CHECK(s.setTargetPriorities(m, ['Weakest', 'Closest']));
    CHECK(s.getUnit(m)!.targetTypes.length === 2 && s.getUnit(m)!.targetTypes[0] === 'Weakest');
    CHECK(s.setTriggerMode(m, 'PackIsLarge'));
    CHECK(s.getUnit(m)!.trigger === 'PackIsLarge');
    CHECK(!s.setTargetPriorities(m, []));
    CHECK(!s.setTargetPriorities(e, ['Closest']));
    CHECK(!s.setTriggerMode(e, 'OnCooldown'));
    CHECK(!s.setTargetPriorities(99, ['Closest']));
    CHECK(s.getUnit(m)!.targetTypes.length === 2);
    CHECK(s.setTargetPriorities(w, ['Strongest']));
    const near = s.addEnemy('Grunt', 1);
    const far = s.addEnemy('Grunt', 1);
    for (const id of [m, e, near, far, w]) Freeze(s, id);
    Place(s, m, 0, 0);
    Place(s, e, 5000, 5000);
    s.mutableUnit(e)!.alive = false;
    Place(s, near, 300, 0);
    Place(s, far, 600, 0);
    s.mutableUnit(far)!.hp = 5;
    s.startFight();
    s.step();
    CHECK(s.getUnit(m)!.target === far);
    CHECK(s.setTargetPriorities(m, ['Closest']));
    s.step();
    CHECK(s.getUnit(m)!.target === near);
    const d2 = cloneData();
    for (const r of d2.classes) if (r.Name === 'Mage') { r.AllowedTargetTypes = ['Closest']; r.AllowedTriggerModes = ['OnCooldown']; }
    const s2 = new CombatSim(d2, 1);
    const m2 = s2.addPartyUnit('Mage');
    CHECK(!s2.setTargetPriorities(m2, ['Weakest']));
    CHECK(!s2.setTriggerMode(m2, 'AllyIsLow'));
    CHECK(s2.setTargetPriorities(m2, ['Closest']));
  });
  it('SmiteThresholdComesFromTheClassDataRow', () => {
    NEAR(Cls('Priest').SmiteThreshold, 0.85, 1e-6);
    const a = new CombatSim(data, 1);
    NEAR(a.getUnit(a.addPartyUnit('Priest'))!.smiteThreshold, 0.85, 1e-12);
    const d2 = cloneData();
    for (const r of d2.classes) if (r.Name === 'Priest') r.SmiteThreshold = Math.fround(0.6);
    const b = new CombatSim(d2, 1);
    NEAR(b.getUnit(b.addPartyUnit('Priest'))!.smiteThreshold, 0.6, 1e-6);
    for (const r of d2.classes) if (r.Name === 'Priest') r.SmiteThreshold = -1;
    const c = new CombatSim(d2, 1);
    NEAR(c.getUnit(c.addPartyUnit('Priest'))!.smiteThreshold, defaultCombatConfig().smiteThreshold, 1e-12);
    CHECK(Cls('Summoner').AbilityId === 'GreaterSpirit' && Cls('Summoner').ExtraAbilityIds.length === 0);
    CHECK(Cls('Warrior').ExtraAbilityIds.length === 0);
  });
  it('RangedUnitsKeepRetreatingUntilPreferredDistMin', () => {
    for (const cls of ['Mage', 'Priest', 'Summoner']) {
      const s = new CombatSim(data, 1);
      const p = s.addPartyUnit(cls);
      const e = s.addEnemy('Brute', 1);
      Freeze(s, e);
      s.mutableUnit(e)!.stats.setBase(StatId.Health, 1e9);
      s.mutableUnit(e)!.hp = 1e9;
      const row = Cls(cls);
      Place(s, e, 0, 0);
      Place(s, p, -(row.RetreatDistance - 50), 0);
      s.startFight();
      StepTicks(s, 30 * 6);
      const u = s.getUnit(p)!;
      CHECK(Math.sqrt(u.x * u.x + u.y * u.y) >= row.PreferredDistMin - 1, cls);
    }
  });
  it('TauntedPartyIgnoresOtherEnemiesUntilItEnds', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    const br = s.addEnemy('Brute', 1);
    Freeze(s, m); Freeze(s, g); Freeze(s, br);
    Place(s, m, 0, 0);
    Place(s, g, 200, 0);
    Place(s, br, 700, 0);
    s.startFight();
    CHECK(s.forceCastAbility(br));
    s.step();
    CHECK(s.getUnit(m)!.target === br && s.getUnit(m)!.tauntForced);
    StepTicks(s, Math.trunc((EffectDuration('BruteTaunt_1') + 0.5) / s.config().dt));
    CHECK(s.getUnit(m)!.target === g && !s.getUnit(m)!.tauntForced);
  });
});

describe('combat: Warrior Cleave (disabled; mechanism kept proven)', () => {
  it('CleaveIsDisabledButItsRowsStayInData', () => {
    CHECK(Cls('Warrior').ExtraAbilityIds.length === 0);
    CHECK(Cls('Warrior').AbilityId === 'Taunt');
    const c = data.findAbility('Cleave');
    CHECK(c && c.Cooldown > 0 && c.EffectIds.length);
    const e = data.findEffect('Cleave_1');
    CHECK(e && e.Type === 'Damage' && e.TargetSelector === 'AreaAroundSelf' && e.Value > 0 && e.Duration > 0);
    CHECK(Cls('Warrior').AllowedStats.includes('Threat'));
  });
  it('CleaveHitsEveryEnemyInAreaAroundWarriorAndNoneOutside', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    grantCleave(s, w);
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    const g3 = s.addEnemy('Grunt', 1);
    const radius = EffectDuration('Cleave_1');
    Place(s, w, 0, 0);
    Place(s, g1, 100, 0);
    Place(s, g2, 0, radius - 10);
    Place(s, g3, radius + 50, 0);
    s.startFight();
    CHECK(s.forceCastAbility(w, 'Cleave'));
    const dmg = EffectValue('Cleave_1') * Cls('Warrior').BaseStats.Damage * (1 - Enemy('Grunt').BaseStats.DefensePct / 100);
    CHECK(dmg > 0);
    NEAR(s.maxHp(s.getUnit(g1)!) - s.getUnit(g1)!.hp, dmg, 1e-9);
    NEAR(s.maxHp(s.getUnit(g2)!) - s.getUnit(g2)!.hp, dmg, 1e-9);
    NEAR(s.maxHp(s.getUnit(g3)!) - s.getUnit(g3)!.hp, 0, 1e-9);
    NEAR(s.threatOn(g3, w), 0, 1e-9);
  });
  it('CleaveThreatFollowsDamageRuleThenFlatBonusOnEachHitEnemy', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    grantCleave(s, w);
    const m = s.addPartyUnit('Mage');
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    Place(s, w, 0, 0);
    Place(s, g1, 100, 0);
    Place(s, g2, -100, 100);
    s.startFight();
    s.dealDamage(m, g1, 2.0, DamageTag.Auto);
    const mageOnG1 = s.threatOn(g1, m);
    CHECK(s.forceCastAbility(w, 'Cleave'));
    const dmg = EffectValue('Cleave_1') * Cls('Warrior').BaseStats.Damage * (1 - Enemy('Grunt').BaseStats.DefensePct / 100);
    const fromDamage = dmg * Cls('Warrior').BaseThreat * Cls('Warrior').ThreatMultiplier;
    const flat = EffectValue('Cleave_2');
    NEAR(s.threatOn(g2, w), fromDamage + flat, 1e-9);
    NEAR(s.threatOn(g1, w), Math.max(mageOnG1, fromDamage) + flat, 1e-9);
    CHECK(s.threatOn(g1, w) > s.threatOn(g1, m));
    NEAR(s.threatOn(g1, m), mageOnG1, 1e-9);
  });
  it('CleaveCooldownComesFromDataAndEachCastWaitsForIt', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    grantCleave(s, w);
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, w);
    Freeze(s, g);
    Place(s, w, 0, 0);
    Place(s, g, 200, 0);
    const ticks: number[] = [];
    s.getBus().subscribe('AbilityCast', (a) => { if (a.abilityId === 'Cleave') ticks.push(s.tickCount()); });
    s.startFight();
    const cd = data.findAbility('Cleave')!.Cooldown;
    StepTicks(s, Math.trunc((cd - 0.2) / s.config().dt));
    CHECK(ticks.length === 0);
    while (ticks.length === 0 && s.tickCount() < 1000) s.step();
    CHECK(ticks.length === 1);
    CHECK(ticks[0] * s.config().dt >= cd - 0.05);
    StepTicks(s, Math.trunc((cd - 0.3) / s.config().dt));
    CHECK(ticks.length === 1);
    while (ticks.length === 1 && s.tickCount() < 2000) s.step();
    CHECK(ticks.length === 2);
    CHECK((ticks[1] - ticks[0]) * s.config().dt >= cd - 0.05);
  });
  it('CleaveOnlyCastsWithAnEnemyInItsArea', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    grantCleave(s, w);
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, w);
    Freeze(s, g);
    Place(s, w, -1000, 0);
    Place(s, g, 1000, 0);
    let casts = 0;
    s.getBus().subscribe('AbilityCast', (a) => { if (a.abilityId === 'Cleave') ++casts; });
    s.startFight();
    const cd = data.findAbility('Cleave')!.Cooldown;
    StepTicks(s, Math.trunc((cd * 2 + 1) / s.config().dt));
    CHECK(casts === 0);
    CHECK(!s.forceCastAbility(w, 'Cleave'));
    NEAR(s.getUnit(g)!.hp, s.maxHp(s.getUnit(g)!), 1e-9);
    Place(s, g, -1000 + EffectDuration('Cleave_1') - 10, 0);
    StepTicks(s, 2);
    CHECK(casts === 1);
  });
  it('CleaveFightsAreDeterministicAndStillWin', () => {
    const d = cloneData();
    for (const r of d.classes) if (r.Name === 'Warrior') r.ExtraAbilityIds = ['Cleave'];
    for (const seed of [1, 9, 42]) {
      const a = runFightHeadless(d, seed, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']);
      const b = runFightHeadless(d, seed, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']);
      CHECK(a.logText === b.logText);
      CHECK(a.state === FightState.Won);
      CHECK(a.logText.includes('casts Cleave'));
    }
    CHECK(!runFightHeadless(data, 1, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']).logText.includes('casts Cleave'));
  });
});

describe('combat: Warrior Taunt rework', () => {
  it('WarriorTauntRaisesThreatToEachEnemysHighestPlusOne (director, Nov 20)', () => {
    CHECK(data.findAbility('Taunt')!.EffectIds.includes('Taunt_1'), 'Taunt_1 is in the Taunt EffectIds');
    NEAR(EffectValue('Taunt_1'), 1, 1e-9);
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = [s.addEnemy('Grunt', 1), s.addEnemy('Grunt', 1), s.addEnemy('Grunt', 1)];
    Freeze(s, w); Freeze(s, m);
    g.forEach((x, i) => { Freeze(s, x); Tough(s, x); s.dealDamage(m, x, 1.0 * (i + 1), DamageTag.Auto); });
    s.dealDamage(w, g[2], 1.0, DamageTag.Auto);
    // Nobody can reach anybody: the threat only moves by the Taunt.
    Place(s, w, -3000, 0); Place(s, m, -3000, 600);
    g.forEach((x, i) => Place(s, x, 3000, 300 * i));
    s.startFight();
    const before = g.map((x) => [s.threatOn(x, w), s.threatOn(x, m)]);
    CHECK(s.forceCastAbility(w));
    g.forEach((x, i) => NEAR(s.threatOn(x, w), Math.max(before[i][0], before[i][1]) + 1, 1e-9, `enemy ${i}`));
    g.forEach((x, i) => NEAR(s.threatOn(x, m), before[i][1], 1e-9, `mage threat on enemy ${i} unchanged`));
    // After the forced attack ends, the Warrior still leads every threat table, so the enemies stay on it.
    StepTicks(s, Math.trunc((EffectDuration('Taunt_3') + 0.5) / s.config().dt));
    NEAR(s.getUnit(w)!.tauntEnemiesLeft, 0, 1e-9);
    for (const x of g) CHECK(s.getUnit(x)!.target === w);
  });
  it('WarriorTauntForcesEveryEnemyAndEndsAfterItsDuration', () => {
    // The forced attack alone (the Nov 12 Taunt): without the threat raise, the enemies go back to the Mage when it ends.
    const s = new CombatSim(forcedOnlyTaunt(), 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = [s.addEnemy('Grunt', 1), s.addEnemy('Grunt', 1), s.addEnemy('Grunt', 1)];
    Freeze(s, w); Freeze(s, m);
    for (const x of g) { Freeze(s, x); s.dealDamage(m, x, 1.0, DamageTag.Auto); }
    Place(s, w, -600, 0); Place(s, m, -300, 0);
    g.forEach((x, i) => Place(s, x, 100 + 50 * i, 0));
    s.startFight();
    s.step();
    for (const x of g) CHECK(s.getUnit(x)!.target === m);
    CHECK(s.forceCastAbility(w));
    NEAR(s.getUnit(w)!.tauntEnemiesLeft, EffectDuration('Taunt_3'), 1e-9);
    s.step();
    for (const x of g) CHECK(s.getUnit(x)!.target === w);
    StepTicks(s, Math.trunc((EffectDuration('Taunt_3') - 0.4) / s.config().dt));
    for (const x of g) CHECK(s.getUnit(x)!.target === w);
    StepTicks(s, Math.trunc(0.8 / s.config().dt));
    NEAR(s.getUnit(w)!.tauntEnemiesLeft, 0, 1e-9);
    for (const x of g) CHECK(s.getUnit(x)!.target === m);
  });
  it('WarriorTauntAlsoForcesEnemiesThatSpawnWhileItLasts', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, w); Freeze(s, m); Freeze(s, g);
    Place(s, w, 0, 0); Place(s, m, -300, 0); Place(s, g, 100, 0);
    s.dealDamage(m, g, 1.0, DamageTag.Auto);
    const dur = EffectDuration('Taunt_3');
    s.scheduleWave(1, ['Grunt', 'Grunt'], 1);
    s.scheduleWave(dur + 2, ['Grunt'], 1);
    s.startFight();
    CHECK(s.forceCastAbility(w));
    StepTicks(s, Math.trunc(1.5 / s.config().dt));
    let forced = 0;
    for (const u of s.getUnits()) if (u.enemy && u.alive) { ++forced; CHECK(u.target === w); }
    CHECK(forced === 3);
    StepTicks(s, Math.trunc((dur + 2.5 - 1.5) / s.config().dt));
    CHECK(s.getUnit(w)!.tauntEnemiesLeft === 0);
    let late = 0;
    for (const u of s.getUnits()) {
      if (!u.enemy || !u.alive || u.id <= g) continue;
      ++late;
      CHECK(u.target === kNoUnit || u.target === w || u.target === m);
    }
    CHECK(late === 3);
  });
  it('WarriorTauntKeepsEnemyMovementAndRangeRules', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    Freeze(s, w); Freeze(s, m);
    Place(s, w, -800, 0); Place(s, m, -800, 400); Place(s, g, 800, 0);
    s.startFight();
    CHECK(s.forceCastAbility(w));
    const W = s.getUnit(w)!;
    const gu = s.getUnit(g)!;
    const d0 = hypot(gu.x - W.x, gu.y - W.y);
    StepTicks(s, 30);
    CHECK(gu.target === w);
    CHECK(hypot(gu.x - W.x, gu.y - W.y) < d0 - 1);
    CHECK(Math.abs(gu.x - 800) <= Enemy('Grunt').MoveSpeed * 1.05);
    NEAR(W.hp, s.maxHp(W), 1e-9);
  });
  it('WarriorTauntFirstCastNeedsAnEnemyInRangeThenWaitsForItsCooldown', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    s.mutableUnit(g)!.stats.setBase(StatId.Health, 1e9);
    s.mutableUnit(g)!.hp = 1e9;
    Freeze(s, w); Freeze(s, g);
    Place(s, w, -1000, 0); Place(s, g, 1000, 0);
    const ticks: number[] = [];
    s.getBus().subscribe('AbilityCast', (a) => { if (a.abilityId === 'Taunt') ticks.push(s.tickCount()); });
    s.startFight();
    StepTicks(s, 90);
    CHECK(ticks.length === 0);
    Place(s, g, -1000 + Cls('Warrior').AttackRange - 20, 0);
    StepTicks(s, 2);
    CHECK(ticks.length === 1);
    const cd = data.findAbility('Taunt')!.Cooldown;
    StepTicks(s, Math.trunc((cd - 0.5) / s.config().dt));
    CHECK(ticks.length === 1);
    while (ticks.length === 1 && s.tickCount() < 3000) s.step();
    CHECK(ticks.length === 2);
    CHECK((ticks[1] - ticks[0]) * s.config().dt >= cd - 0.05);
    CHECK(cd >= EffectDuration('Taunt_3'));
  });
  it('WarriorTauntIsReadyAgainAfterPrepareNextFightAndEndsWithTheFight', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    s.addEnemy('Grunt', 1);
    s.startFight();
    CHECK(s.forceCastAbility(w));
    CHECK(s.getUnit(w)!.tauntEnemiesLeft > 0);
    s.prepareNextFight();
    CHECK(s.getUnit(w)!.tauntEnemiesLeft === 0);
    NEAR(s.getUnit(w)!.abilityTimer, data.findAbility('Taunt')!.Cooldown, 1e-9);
  });
  it('WarriorTauntFightsKeepTheMageUntouchedAndAreDeterministic', () => {
    let onMage = 0, onWar = 0;
    for (let seed = 1; seed <= 20; ++seed) {
      const s = new CombatSim(data, seed);
      const w = s.addPartyUnit('Warrior');
      const m = s.addPartyUnit('Mage');
      for (let i = 0; i < 3; ++i) s.addEnemy('Grunt', 1);
      s.getBus().subscribe('AttackStarted', (a) => {
        const at = s.getUnit(a.attacker);
        if (!at || !at.enemy || s.getTime() > 10) return;
        if (a.target === m) ++onMage;
        else if (a.target === w) ++onWar;
      });
      s.startFight();
      s.runToEnd();
      CHECK(s.getState() === FightState.Won, `seed ${seed}`);
    }
    CHECK(onWar > 0);
    CHECK(onMage === 0);
    for (const seed of [2, 11]) {
      const a = runFightHeadless(data, seed, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']);
      const b = runFightHeadless(data, seed, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']);
      CHECK(a.logText === b.logText);
      CHECK(a.logText.includes('casts Taunt'));
    }
  });
});

describe('combat: rally point and random enemy placement', () => {
  it('DefaultSpawnsStayOnTheFixedSides', () => {
    const s = new CombatSim(data, 5);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    NEAR(s.getUnit(w)!.x, s.config().partySpawnX, 1e-9);
    NEAR(s.getUnit(m)!.x, s.config().partySpawnX, 1e-9);
    NEAR(s.getUnit(g)!.x, s.config().enemySpawnX, 1e-9);
    CHECK(s.partyEntry() === -1);
  });
  it('PartyRalliesJustInsideTheDoorItCameThrough', () => {
    const c = defaultCombatConfig();
    for (let door = 0; door < 4; ++door) {
      const s = new CombatSim(data, 9);
      s.setPartyEntry(door);
      const ids = ['Warrior', 'Mage', 'Priest', 'Assassin'].map((n) => s.addPartyUnit(n));
      for (let i = 0; i < 4; ++i) {
        const u = s.getUnit(ids[i])!;
        const off = (i - 1.5) * c.spawnSpacing;
        if (door === 0) { NEAR(u.y, -c.arenaH * 0.5 + c.rallyInsetY, 1e-9); NEAR(u.x, off, 1e-9); }
        if (door === 2) { NEAR(u.y, c.arenaH * 0.5 - c.rallyInsetY, 1e-9); NEAR(u.x, off, 1e-9); }
        if (door === 3) { NEAR(u.x, -c.arenaW * 0.5 + c.rallyInsetX, 1e-9); NEAR(u.y, off, 1e-9); }
        if (door === 1) { NEAR(u.x, c.arenaW * 0.5 - c.rallyInsetX, 1e-9); NEAR(u.y, off, 1e-9); }
        CHECK(Math.abs(u.x) <= c.arenaW * 0.5 && Math.abs(u.y) <= c.arenaH * 0.5);
      }
      s.prepareNextFight();
      const r = s.partyRallyPoint();
      const first = s.getUnit(0)!;
      CHECK(Math.abs(first.x - r.x) <= 1.5 * c.spawnSpacing + 1e-9 && Math.abs(first.y - r.y) <= 1.5 * c.spawnSpacing + 1e-9);
      s.setPartyEntry((door + 2) % 4);
      s.prepareNextFight();
      const n = s.partyRallyPoint();
      CHECK(Math.abs(n.x - r.x) + Math.abs(n.y - r.y) > 1);
    }
  });
});
