// Port of tests/units/brute/tests.cpp: the Brute (slow, high HP, melee tank enemy) and its party taunt.
import { describe, it } from 'vitest';
import { Behavior, CombatSim, FightState, runFightHeadless } from '../combatSim';
import { DamageTag, kNoUnit } from '../eventBus';
import { StatId } from '../statResolver';
import { CHECK, Cls, Enemy, Freeze, NEAR, Place, StepSeconds, StepTicks, data, dist } from '../combatTestKit';

function timeToRange(enemyName: string, maxSeconds: number): number {
  const s = new CombatSim(data, 1);
  const w = s.addPartyUnit('Warrior');
  const e = s.addEnemy(enemyName, 1);
  Freeze(s, w);
  Place(s, w, 0, 0);
  Place(s, e, 1000, 0);
  s.startFight();
  const range = Enemy(enemyName).AttackRange;
  while (s.getTime() < maxSeconds && s.getState() === FightState.Running) {
    s.step();
    if (dist(s, e, w) <= range + 1e-6) return s.getTime();
  }
  return -1;
}
function bruteFight(seed: number, floor: number) {
  const r = runFightHeadless(data, seed, ['Warrior', 'Mage'], ['Brute'], floor);
  return { log: r.logText + r.summary, state: r.state, killed: r.enemiesKilled };
}
const tauntDuration = (): number => data.findEffect('BruteTaunt_1')!.Duration;

describe('units: Brute data and stats', () => {
  it('BruteRowIsATankThatTaunts', () => {
    const b = Enemy('Brute');
    CHECK(b.RoleTag === 'Tank');
    CHECK(b.Taunts);
    CHECK(!b.IsBoss && !b.IsElite);
    CHECK(!Enemy('Grunt').Taunts && !Enemy('Archer').Taunts && !Enemy('Shaman').Taunts);
  });
  it('BruteIsSlowAndHighHpComparedToTheRoster', () => {
    const b = Enemy('Brute');
    for (const other of ['Grunt', 'Archer', 'Shaman']) {
      CHECK(b.BaseStats.HP > Enemy(other).BaseStats.HP);
      CHECK(b.MoveSpeed < Enemy(other).MoveSpeed + 1e-6);
    }
    CHECK(b.MoveSpeed < Enemy('Grunt').MoveSpeed);
    CHECK(b.BaseStats.AttackPerSec < Enemy('Grunt').BaseStats.AttackPerSec);
    CHECK(b.BaseStats.HP > Cls('Warrior').BaseStats.HP);
    CHECK(b.BaseStats.HP > 0 && b.BaseStats.Damage > 0 && b.BaseStats.AttackPerSec > 0);
  });
  it('BruteMovementRowMatchesCombatHooksTable', () => {
    const b = Enemy('Brute');
    NEAR(b.MoveSpeed, 220, 1e-6);
    NEAR(b.AttackRange, 150, 1e-6);
    NEAR(b.PreferredDistMax, 150, 1e-6);
    NEAR(b.PreferredDistMin, 0, 1e-6);
    NEAR(b.RetreatDistance, 0, 1e-6);
    CHECK(b.MoveSpeed < Cls('Warrior').MoveSpeed);
  });
  it('BruteSpawnsWithDataStatsOnFloorOne', () => {
    const s = new CombatSim(data, 1);
    const u = s.getUnit(s.addEnemy('Brute', 1))!;
    const b = Enemy('Brute');
    CHECK(u.enemy && !u.summon);
    NEAR(s.maxHp(u), b.BaseStats.HP, 1e-6);
    NEAR(u.hp, b.BaseStats.HP, 1e-6);
    NEAR(u.stats.get(StatId.Damage), b.BaseStats.Damage, 1e-6);
    NEAR(u.stats.get(StatId.AttackSpeed), b.BaseStats.AttackPerSec, 1e-6);
    NEAR(u.stats.get(StatId.DefensePercent), b.BaseStats.DefensePct, 1e-6);
    NEAR(u.stats.get(StatId.Range), b.AttackRange, 1e-6);
    NEAR(u.moveSpeed, b.MoveSpeed, 1e-6);
    NEAR(u.retreat, 0, 1e-9);
    CHECK(u.behavior === Behavior.Melee);
    CHECK(u.taunts);
  });
  it('BruteHpAndDamageScaleByCompoundingFloorFactorOnly', () => {
    const s = new CombatSim(data, 1);
    const id1 = s.addEnemy('Brute', 1);
    const id5 = s.addEnemy('Brute', 5);
    const id10 = s.addEnemy('Brute', 10);
    const b = Enemy('Brute');
    NEAR(s.config().floorScaling, 1.25, 1e-12);
    const f5 = Math.pow(1.25, 4);
    const f10 = Math.pow(1.25, 9);
    NEAR(s.maxHp(s.getUnit(id1)!), b.BaseStats.HP, 1e-6);
    NEAR(s.maxHp(s.getUnit(id5)!), b.BaseStats.HP * f5, 1e-4);
    NEAR(s.getUnit(id5)!.hp, b.BaseStats.HP * f5, 1e-4);
    NEAR(s.getUnit(id5)!.stats.get(StatId.Damage), b.BaseStats.Damage * f5, 1e-6);
    NEAR(s.maxHp(s.getUnit(id10)!), b.BaseStats.HP * f10, 1e-4);
    const u5 = s.getUnit(id5)!;
    NEAR(u5.stats.get(StatId.DefensePercent), b.BaseStats.DefensePct, 1e-9);
    NEAR(u5.stats.get(StatId.AttackSpeed), b.BaseStats.AttackPerSec, 1e-9);
    NEAR(u5.stats.get(StatId.Range), b.AttackRange, 1e-9);
    NEAR(u5.moveSpeed, b.MoveSpeed, 1e-9);
  });
});

describe('units: Brute movement and attacks', () => {
  it('BruteMovesAtItsDataMoveSpeedTowardItsTarget', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const b = s.addEnemy('Brute', 1);
    Freeze(s, w);
    Place(s, w, 0, 0);
    Place(s, b, 1000, 0);
    s.startFight();
    StepTicks(s, 30);
    NEAR(s.getUnit(b)!.x, 1000 - Enemy('Brute').MoveSpeed, 1.0);
    NEAR(s.getUnit(b)!.y, 0, 1e-6);
  });
  it('BruteClosesToMeleeRangeAndStaysEngaged', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const b = s.addEnemy('Brute', 1);
    Freeze(s, w);
    Place(s, w, 0, 0);
    Place(s, b, 1000, 0);
    s.startFight();
    for (let i = 0; i < 300 && s.getState() === FightState.Running; ++i) s.step();
    CHECK(s.getUnit(b)!.alive);
    const d = dist(s, b, w);
    CHECK(d <= Enemy('Brute').AttackRange + 1e-6);
    CHECK(d >= s.config().separation - 1);
  });
  it('BruteArrivesLaterThanAGruntBecauseItIsSlower', () => {
    const tBrute = timeToRange('Brute', 15);
    const tGrunt = timeToRange('Grunt', 15);
    CHECK(tBrute > 0 && tGrunt > 0);
    CHECK(tBrute > tGrunt);
    const ideal = (1000 - Enemy('Brute').AttackRange) / Enemy('Brute').MoveSpeed;
    CHECK(tBrute >= ideal - 0.1 && tBrute <= ideal + 0.5);
  });
  it('BruteDoesNotAttackBeyondRangeButHitsWhenInRange', () => {
    {
      const s = new CombatSim(data, 1);
      const w = s.addPartyUnit('Warrior');
      const b = s.addEnemy('Brute', 1);
      Freeze(s, w); Freeze(s, b);
      Place(s, w, 0, 0);
      Place(s, b, Enemy('Brute').AttackRange + 200, 0);
      let hits = 0;
      s.getBus().subscribe('DamageDealt', (e) => { if (e.source === b) ++hits; });
      s.startFight();
      StepTicks(s, 240);
      CHECK(hits === 0);
    }
    {
      const s = new CombatSim(data, 1);
      const w = s.addPartyUnit('Warrior');
      const b = s.addEnemy('Brute', 1);
      Freeze(s, w); Freeze(s, b);
      Place(s, w, 0, 0);
      Place(s, b, 110, 0);
      s.mutableUnit(w)!.abilityId = '';
      let hits = 0, lastAmount = 0;
      s.getBus().subscribe('DamageDealt', (e) => { if (e.source === b) { ++hits; lastAmount = e.amount; } });
      s.startFight();
      const seconds = 10;
      StepTicks(s, seconds * 30);
      CHECK(Math.abs(hits - seconds * Enemy('Brute').BaseStats.AttackPerSec) <= 1);
      CHECK(hits >= 1);
      NEAR(lastAmount, Enemy('Brute').BaseStats.Damage * (1 - Cls('Warrior').BaseStats.DefensePct / 100), 1e-9);
    }
  });
  it('BruteTakesLessDamageFromItsDefensePercent', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const b = s.addEnemy('Brute', 1);
    const dealt = s.dealDamage(m, b, 1.0, DamageTag.Auto);
    NEAR(dealt, Cls('Mage').BaseStats.Damage * (1 - Enemy('Brute').BaseStats.DefensePct / 100), 1e-9);
    NEAR(s.getUnit(b)!.hp, Enemy('Brute').BaseStats.HP - dealt, 1e-9);
  });
  it('BruteAttacksTheHighestThreatPartyUnit', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const b = s.addEnemy('Brute', 1);
    s.dealDamage(m, b, 1.0, DamageTag.Auto);
    s.startFight();
    s.step();
    CHECK(s.getUnit(b)!.target === m);
    CHECK(w !== m);
  });
  it('WarriorTauntPullsTheBrute', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const b = s.addEnemy('Brute', 1);
    s.dealDamage(m, b, 1.0, DamageTag.Auto);
    Freeze(s, w); Freeze(s, m); Freeze(s, b);
    Place(s, w, -600, 0); Place(s, m, -300, 0); Place(s, b, 300, 0);
    s.startFight();
    s.step();
    CHECK(s.getUnit(b)!.target === m);
    CHECK(s.forceCastAbility(w));
    s.step();
    CHECK(s.getUnit(b)!.target === w);
    StepTicks(s, 180);
    CHECK(s.getUnit(b)!.target === m);
  });
  it('BruteTauntFlagDoesNotChangeThreatTables', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const b = s.addEnemy('Brute', 1);
    const g = s.addEnemy('Grunt', 1);
    s.startFight();
    StepTicks(s, 5);
    for (const [e, p] of [[b, w], [b, m], [g, w], [g, m]]) NEAR(s.threatOn(e, p), 0, 1e-12);
  });
  it('EnrageRaisesTheBrutesDamageTenPercentPerStep', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const b = s.addEnemy('Brute', 1);
    Freeze(s, w); Freeze(s, b);
    Place(s, w, -1000, 0);
    Place(s, b, 1000, 0);
    s.startFight();
    const base = Enemy('Brute').BaseStats.Damage;
    while (s.getTime() < 44) s.step();
    NEAR(s.getUnit(b)!.stats.get(StatId.Damage), base, 1e-9);
    while (s.getTime() < 46) s.step();
    NEAR(s.getUnit(b)!.stats.get(StatId.Damage), base * 1.1, 1e-9);
    while (s.getTime() < 51) s.step();
    NEAR(s.getUnit(b)!.stats.get(StatId.Damage), base * 1.2, 1e-9);
  });
});

describe('units: Brute fights', () => {
  it('FightAgainstStubPartyIsIdenticalOnTwoRuns', () => {
    for (const seed of [1, 2, 99]) {
      const a = bruteFight(seed, 1);
      const b = bruteFight(seed, 1);
      CHECK(a.log !== '');
      CHECK(a.log === b.log);
      CHECK(a.state === b.state && a.killed === b.killed);
      CHECK(a.state === FightState.Won, `seed ${seed}`);
      CHECK(a.killed === 1);
    }
    const log = bruteFight(1, 1).log;
    CHECK(log.includes('Brute#'));
    CHECK(log.includes('dies (killed by'));
    CHECK(log.includes('FightEnded: WIN'));
  });
  it('BruteFightMixedWithGruntsIsIdenticalOnTwoRuns', () => {
    const e = ['Brute', 'Grunt', 'Grunt'];
    const a = runFightHeadless(data, 7, ['Warrior', 'Mage'], e, 3).logText;
    const b = runFightHeadless(data, 7, ['Warrior', 'Mage'], e, 3).logText;
    CHECK(a !== '');
    CHECK(a === b);
  });
  it('BruteFightNeverTimesOutOverSeeds', () => {
    for (let seed = 1; seed <= 20; ++seed) {
      const st = bruteFight(seed, 1).state;
      CHECK(st === FightState.Won || st === FightState.Wiped);
    }
  });
});

describe('units: Brute enemy taunt', () => {
  it('BruteTauntIsDataDrivenAbility', () => {
    CHECK(Enemy('Brute').AbilityId === 'BruteTaunt');
    const a = data.findAbility('BruteTaunt');
    CHECK(a && a.Cooldown > 0 && a.EffectIds.length === 1 && a.EffectIds[0] === 'BruteTaunt_1');
    const e = data.findEffect('BruteTaunt_1');
    CHECK(e && e.Type === 'ApplyModifier' && e.Stat === 'Taunt' && e.Duration > 0);
    CHECK(Enemy('Grunt').AbilityId === '');
  });
  const setup = () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const grunt = s.addEnemy('Grunt', 1);
    const brute = s.addEnemy('Brute', 1);
    Freeze(s, m); Freeze(s, grunt); Freeze(s, brute);
    Place(s, m, 0, 0);
    Place(s, grunt, 300, 0);
    Place(s, brute, 700, 0);
    s.startFight();
    return { s, m, grunt, brute };
  };
  it('BruteTauntPullsPartyTargetingOffACloserEnemy', () => {
    const { s, m, grunt, brute } = setup();
    s.step();
    CHECK(s.getUnit(m)!.target === grunt);
    CHECK(s.forceCastAbility(brute));
    s.step();
    CHECK(s.getUnit(m)!.target === brute);
  });
  it('TauntEndsAfterItsDurationAndPartyReturnsToNormalRules', () => {
    const { s, m, grunt, brute } = setup();
    s.forceCastAbility(brute);
    s.step();
    CHECK(s.getUnit(m)!.target === brute);
    StepSeconds(s, tauntDuration() - 0.5);
    CHECK(s.getUnit(m)!.target === brute);
    StepSeconds(s, 1.0);
    CHECK(s.getUnit(m)!.target === grunt);
  });
  it('BruteTauntEndsWhenTheBruteDies', () => {
    const { s, m, grunt, brute } = setup();
    s.forceCastAbility(brute);
    s.step();
    CHECK(s.getUnit(m)!.target === brute);
    s.dealDamage(m, brute, 1e6, DamageTag.Ability);
    CHECK(!s.getUnit(brute)!.alive);
    s.step();
    CHECK(s.getUnit(m)!.target === grunt);
  });
  it('ClosestBruteWinsWhenSeveralTaunt', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const farBrute = s.addEnemy('Brute', 1);
    const nearBrute = s.addEnemy('Brute', 1);
    const grunt = s.addEnemy('Grunt', 1);
    for (const id of [m, farBrute, nearBrute, grunt]) Freeze(s, id);
    Place(s, m, 0, 0);
    Place(s, grunt, 200, 0);
    Place(s, nearBrute, 600, 0);
    Place(s, farBrute, 900, 0);
    s.startFight();
    s.forceCastAbility(farBrute);
    s.forceCastAbility(nearBrute);
    s.step();
    CHECK(s.getUnit(m)!.target === nearBrute);
  });
  it('TauntForcesTheWholePartyIncludingTheWarrior', () => {
    const s = new CombatSim(data, 1);
    const war = s.addPartyUnit('Warrior');
    const assassin = s.addPartyUnit('Assassin');
    const priest = s.addPartyUnit('Priest');
    const grunt = s.addEnemy('Grunt', 1);
    const brute = s.addEnemy('Brute', 1);
    for (const id of [war, assassin, priest, grunt, brute]) Freeze(s, id);
    Place(s, war, 100, 0);
    Place(s, assassin, 0, 0);
    Place(s, priest, -400, 0);
    Place(s, grunt, 200, 0);
    Place(s, brute, 800, 0);
    s.startFight();
    s.step();
    CHECK(s.getUnit(war)!.target === grunt);
    s.forceCastAbility(brute);
    s.step();
    CHECK(s.getUnit(war)!.target === brute);
    CHECK(s.getUnit(assassin)!.target === brute);
    CHECK(s.getUnit(priest)!.target === brute);
  });
  it('TauntedWarriorDoesNotUseTheInReachFallback', () => {
    const s = new CombatSim(data, 1);
    const war = s.addPartyUnit('Warrior');
    const grunt = s.addEnemy('Grunt', 1);
    const brute = s.addEnemy('Brute', 1);
    Freeze(s, war); Freeze(s, grunt); Freeze(s, brute);
    Place(s, war, 0, 0);
    Place(s, grunt, 100, 0);
    Place(s, brute, 900, 0);
    s.startFight();
    s.forceCastAbility(brute);
    StepSeconds(s, 1.5);
    NEAR(s.getUnit(war)!.damageDone, 0, 1e-12);
  });
  it('TauntedMageWalksTowardTheBruteNotTheCloserGrunt', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const grunt = s.addEnemy('Grunt', 1);
    const brute = s.addEnemy('Brute', 1);
    Freeze(s, grunt); Freeze(s, brute);
    Place(s, m, -1100, 400);
    Place(s, grunt, 0, 0);
    Place(s, brute, 800, 400);
    s.startFight();
    s.forceCastAbility(brute);
    s.mutableUnit(brute)!.tauntLeft = 100;
    StepTicks(s, 30);
    CHECK(s.getUnit(m)!.target === brute);
    StepTicks(s, 180);
    CHECK(s.getUnit(brute)!.hp < s.maxHp(s.getUnit(brute)!));
  });
  it('EnemyArrivingDuringATauntIsIgnoredUntilTheTauntEnds', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const war = s.addPartyUnit('Warrior');
    const brute = s.addEnemy('Brute', 1);
    Freeze(s, m); Freeze(s, war); Freeze(s, brute);
    Place(s, m, 0, 0);
    Place(s, war, -300, 300);
    Place(s, brute, 800, 0);
    s.scheduleWave(1.0, ['Grunt'], 1);
    s.startFight();
    s.forceCastAbility(brute);
    StepSeconds(s, 1.2);
    let grunt = kNoUnit;
    for (const u of s.getUnits()) if (u.enemy && u.name === 'Grunt') grunt = u.id;
    CHECK(grunt !== kNoUnit);
    if (grunt === kNoUnit) return;
    Place(s, grunt, 150, 0);
    Freeze(s, grunt);
    StepSeconds(s, 0.5);
    CHECK(s.getUnit(m)!.target === brute);
    CHECK(s.getUnit(war)!.target === brute);
    NEAR(s.getUnit(grunt)!.hp, s.maxHp(s.getUnit(grunt)!), 1e-9);
    StepSeconds(s, tauntDuration());
    CHECK(s.getUnit(m)!.target === grunt);
  });
  it('BruteRecastsItsTauntOnCooldown', () => {
    const s = new CombatSim(data, 1);
    s.addPartyUnit('Warrior');
    const brute = s.addEnemy('Brute', 1);
    Freeze(s, brute);
    Place(s, brute, 800, 0);
    let casts = 0;
    s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === brute) ++casts; });
    s.startFight();
    const cd = data.findAbility('BruteTaunt')!.Cooldown;
    StepSeconds(s, cd - 0.5);
    CHECK(casts === 0);
    StepSeconds(s, 1.0);
    CHECK(casts === 1);
    StepSeconds(s, cd);
    CHECK(casts === 2);
  });
});
