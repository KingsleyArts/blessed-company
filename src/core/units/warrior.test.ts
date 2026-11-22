// Port of tests/units/warrior/tests.cpp: the Warrior as data/*.csv and DESIGN-DECISIONS 7 describe it. Taunt is the only
// ability; Cleave is disabled (rows kept, granted explicitly below so the AreaAroundSelf mechanism stays proven).
import { describe, it } from 'vitest';
import { CombatSim, FightState, defaultCombatConfig, runFightHeadless } from '../combatSim';
import { installShippedCastTimes } from '../castTimes';
import { DamageTag } from '../eventBus';
import { CHECK, Cls, EffectDuration, EffectValue, Freeze, NEAR, Place, StepSeconds, StepTicks, cloneData, data } from '../combatTestKit';

const Warrior = () => Cls('Warrior');
function dataWithCleave() {
  const d = cloneData();
  for (const r of d.classes) if (r.Name === 'Warrior') r.ExtraAbilityIds = ['Cleave'];
  d.findAbility('Cleave')!.EffectIds = ['Cleave_1', 'Cleave_2'];   // the flat threat row is kept and proven; the shipped Cleave is damage only (Nov 22)
  return d;
}

describe('units: Warrior', () => {
  it('WarriorRowKeepsTauntStatsAndThreat', () => {
    const w = Warrior();
    CHECK(w.RoleTag === 'Tank');
    CHECK(w.AbilityId === 'Taunt');
    NEAR(w.BaseThreat, 1.5, 1e-6);
    NEAR(w.ThreatMultiplier, 1.0, 1e-6);
    CHECK(w.AllowedStats.includes('Threat'));
    CHECK(w.AllowedStats.length === 14);
    const t = data.findAbility('Taunt');
    CHECK(t && t.EffectIds.join('|') === 'Taunt_3|Taunt_1|Taunt_2');   // director Nov 20: threat to highest +1, then the forced attack
    NEAR(EffectValue('Taunt_1'), 1, 1e-9);
    CHECK(w.ExtraAbilityIds.join('|') === 'Cleave');   // Nov 22: the second ability slot
    const forced = data.findEffect('Taunt_3');
    CHECK(forced && forced.Type === 'ApplyModifier' && forced.Stat === 'Taunt' && forced.Duration > 0);
    CHECK(t && forced && t.Cooldown > forced.Duration);
  });
  it('CleaveWhenGrantedIsTheSecondAbilitySlotWithItsOwnTimer', () => {
    const c = data.findAbility('Cleave');
    CHECK(c && c.Cooldown > 0);
    const d = dataWithCleave();
    CHECK(d.findClassRow('Warrior')!.ExtraAbilityIds.length === 1);
    const s = new CombatSim(d, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    Place(s, w, 0, 0);
    Place(s, g, 100, 0);
    s.startFight();
    CHECK(s.forceCastAbility(w));
    CHECK(s.forceCastAbility(w, 'Cleave'));
    CHECK(!s.forceCastAbility(w, 'NoSuchAbility'));
  });
  it('CleaveHitsOnlyEnemiesInsideTheRadiusAndAddsThreatOnEach', () => {
    const s = new CombatSim(dataWithCleave(), 1);
    const w = s.addPartyUnit('Warrior');
    const a = s.addEnemy('Grunt', 1);
    const b = s.addEnemy('Grunt', 1);
    const far = s.addEnemy('Grunt', 1);
    const radius = EffectDuration('Cleave_1');
    Place(s, w, 0, 0);
    Place(s, a, 120, 0);
    Place(s, b, 0, radius - 5);
    Place(s, far, radius + 100, 0);
    s.startFight();
    CHECK(s.forceCastAbility(w, 'Cleave'));
    CHECK(s.getUnit(a)!.hp < s.maxHp(s.getUnit(a)!));
    CHECK(s.getUnit(b)!.hp < s.maxHp(s.getUnit(b)!));
    NEAR(s.getUnit(far)!.hp, s.maxHp(s.getUnit(far)!), 1e-9);
    CHECK(s.threatOn(a, w) > 0 && s.threatOn(b, w) > 0);
    NEAR(s.threatOn(far, w), 0, 1e-9);
    const dmg = s.maxHp(s.getUnit(a)!) - s.getUnit(a)!.hp;
    NEAR(s.threatOn(a, w), dmg * Warrior().BaseThreat * Warrior().ThreatMultiplier + EffectValue('Cleave_2'), 1e-9);
  });
  it('TauntForcesAllEnemiesIncludingLaterSpawnsThenEnds', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    for (let i = 0; i < 3; ++i) s.addEnemy('Grunt', 1);
    Freeze(s, w); Freeze(s, m);
    Place(s, w, -600, 0); Place(s, m, -300, 0);
    for (const u of s.getUnits()) if (u.enemy) { u.moveSpeed = 0; s.dealDamage(m, u.id, 1.0, DamageTag.Auto); }
    const dur = EffectDuration('Taunt_3');
    s.scheduleWave(1, ['Grunt'], 1);
    s.startFight();
    CHECK(s.forceCastAbility(w));
    StepTicks(s, 45);
    let enemies = 0;
    for (const u of s.getUnits()) if (u.enemy && u.alive) { ++enemies; CHECK(u.target === w); }
    CHECK(enemies === 4);
    StepTicks(s, Math.trunc(dur / s.config().dt) + 5);
    CHECK(s.getUnit(w)!.tauntEnemiesLeft === 0);
    // Director Nov 20: Taunt also raised the Warrior to the top of every threat table (+1), so when the forced attack ends the first
    // three enemies stay on the Warrior.
    for (const u of s.getUnits()) if (u.enemy && u.alive && u.id < 5) CHECK(u.target === w);
  });
  it('TauntCastsOnCooldownDuringARealFight', () => {
    const s = new CombatSim(data, 5);
    s.addPartyUnit('Warrior');
    s.addPartyUnit('Mage');
    for (let i = 0; i < 3; ++i) s.addEnemy('Grunt', 1);
    const times: number[] = [];
    s.getBus().subscribe('AbilityCast', (a) => { if (a.abilityId === 'Taunt') times.push(s.getTime()); });
    s.startFight();
    s.runToEnd();
    CHECK(times.length > 0);
    CHECK(times[0] < 6);
    const cd = data.findAbility('Taunt')!.Cooldown;
    for (let i = 1; i < times.length; ++i) CHECK(times[i] - times[i - 1] >= cd - 0.05);
  });
  it('WarriorHoldsThePackAgainstAMageOverManySeeds', () => {
    let onMage = 0, onWarrior = 0, len = 0, wins = 0;
    const seeds = 30;
    for (let seed = 1; seed <= seeds; ++seed) {
      const s = new CombatSim(data, seed);
      const w = s.addPartyUnit('Warrior');
      const m = s.addPartyUnit('Mage');
      for (let i = 0; i < 3; ++i) s.addEnemy('Grunt', 1);
      s.getBus().subscribe('AttackStarted', (at) => {
        const u = s.getUnit(at.attacker);
        if (!u || !u.enemy || s.getTime() > 10) return;
        if (at.target === m) ++onMage;
        else if (at.target === w) ++onWarrior;
      });
      s.startFight();
      s.runToEnd();
      len += s.getTime();
      if (s.getState() === FightState.Won) ++wins;
    }
    CHECK(wins === seeds);
    CHECK(onWarrior > 0);
    CHECK(onMage <= 0.1 * (onMage + onWarrior));
    CHECK(len / seeds > 12);
  });
  it('WarriorFightsAreDeterministic', () => {
    for (const seed of [3, 17]) {
      const a = runFightHeadless(data, seed, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']);
      const b = runFightHeadless(data, seed, ['Warrior', 'Mage'], ['Grunt', 'Grunt', 'Grunt']);
      CHECK(a.logText === b.logText);
    }
  });
  it('CleaveTakesASwingLikeAnAttack (swingAbilities): same timer and windup, no cast time, damage only', () => {
    const run = (on: boolean): { cleaves: number; strikes: number; firstCleave: number } => {
      const d = cloneData();
      if (!on) d.findClassRow('Warrior')!.ExtraAbilityIds = [];   // the baseline: no Cleave at all
      const cfg = defaultCombatConfig();
      installShippedCastTimes(cfg);
      cfg.abilityCastTimes.set('Cleave', 5.0);   // a leftover cast time must not matter: a swing ability uses the weapon's windup
      if (on) cfg.swingAbilities = ['Cleave'];
      const s = new CombatSim(d, 1, cfg);
      const w = s.addPartyUnit('Warrior');
      Freeze(s, w);
      Place(s, w, 0, 0);
      const g = s.addEnemy('Grunt', 1);
      Freeze(s, g);
      Place(s, g, 100, 0);
      s.mutableUnit(g)!.hp = 1e6;
      s.startFight();
      let cleaves = 0, strikes = 0, firstCleave = -1;
      s.getBus().subscribe('AbilityCast', (e) => { if (e.abilityId === 'Cleave') { cleaves++; if (firstCleave < 0) firstCleave = s.tickCount(); } });
      s.getBus().subscribe('DamageDealt', (e) => { if (e.source === w && (e.tags & DamageTag.Auto) !== 0) strikes++; });
      StepSeconds(s, 12);
      return { cleaves, strikes, firstCleave };
    };
    const off = run(false), on = run(true);
    CHECK(on.cleaves >= 3 && on.cleaves <= 5);   // 3 s cooldown over 12 s
    CHECK(on.firstCleave > 0 && on.firstCleave <= 105);   // ready after its 3 s cooldown (plus the swing windup), not the 5 s leftover cast time
    CHECK(on.strikes + on.cleaves >= off.strikes - 2 && on.strikes + on.cleaves <= off.strikes + 1);   // each Cleave replaced a normal swing
    CHECK(on.strikes < off.strikes);
    CHECK(off.cleaves === 0);
  });
});
