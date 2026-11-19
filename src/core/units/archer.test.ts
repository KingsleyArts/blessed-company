// Port of tests/units/archer/tests.cpp: the enemy Archer (role Ranged). COMBAT-HOOKS 8b numbers are asserted as literals.
// The two ARCHER_PENDING_TESTS (rules the core does not implement, expected to fail) are kept as it.skip.
import { describe, it } from 'vitest';
import { Behavior, CombatSim, FightState } from '../combatSim';
import { DamageTag, kNoUnit, type UnitId } from '../eventBus';
import { StatId } from '../statResolver';
import { CHECK, Enemy, Freeze, NEAR, Place, StepRunning as StepN, Ticks, Tough, data, dist } from '../combatTestKit';

const ArcherRow = () => Enemy('Archer');
const H = (x: number, y: number): number => Math.sqrt(x * x + y * y);

describe('units: Archer data', () => {
  it('ArcherDataRowMatchesDocs', () => {
    const a = ArcherRow();
    CHECK(a.RoleTag === 'Ranged');
    CHECK(!a.Taunts && !a.IsBoss && !a.IsElite);
    NEAR(a.MoveSpeed, 240, 1e-6);
    NEAR(a.AttackRange, 800, 1e-6);
    NEAR(a.PreferredDistMin, 600, 1e-6);
    NEAR(a.PreferredDistMax, 750, 1e-6);
    NEAR(a.RetreatDistance, 450, 1e-6);
    CHECK(a.BaseStats.HP > 0 && a.BaseStats.Damage > 0 && a.BaseStats.AttackPerSec > 0);
    CHECK(a.RetreatDistance < a.PreferredDistMin);
    CHECK(a.PreferredDistMin < a.PreferredDistMax);
    CHECK(a.PreferredDistMax <= a.AttackRange);
    CHECK(a.MoveSpeed < data.findClassRow('Warrior')!.MoveSpeed);
  });
  it('ArcherSpawnsAsRangedUnitNotHealer', () => {
    const s = new CombatSim(data, 1);
    const u = s.getUnit(s.addEnemy('Archer', 1))!;
    CHECK(u.enemy && !u.summon);
    CHECK(u.archer);
    CHECK(!u.healer);
    CHECK(!u.taunts && !u.elite && !u.boss);
    CHECK(u.behavior === Behavior.Caster);
    NEAR(u.moveSpeed, ArcherRow().MoveSpeed, 1e-6);
    NEAR(u.prefMin, ArcherRow().PreferredDistMin, 1e-6);
    NEAR(u.prefMax, ArcherRow().PreferredDistMax, 1e-6);
    NEAR(u.retreat, ArcherRow().RetreatDistance, 1e-6);
    NEAR(u.stats.get(StatId.Range), ArcherRow().AttackRange, 1e-6);
    NEAR(s.maxHp(u), ArcherRow().BaseStats.HP, 1e-9);
    NEAR(u.stats.get(StatId.Damage), ArcherRow().BaseStats.Damage, 1e-9);
    NEAR(u.stats.get(StatId.AttackSpeed), ArcherRow().BaseStats.AttackPerSec, 1e-9);
    NEAR(u.hp, s.maxHp(u), 1e-9);
    const g = s.addEnemy('Grunt', 1);
    const sh = s.addEnemy('Shaman', 1);
    const br = s.addEnemy('Brute', 1);
    CHECK(!s.getUnit(g)!.archer && !s.getUnit(sh)!.archer && !s.getUnit(br)!.archer);
  });
  it('FloorScalingIsCompoundingOnHpAndDamageOnly', () => {
    for (const floorNo of [1, 2, 3, 5, 10]) {
      const s = new CombatSim(data, 1);
      const u = s.getUnit(s.addEnemy('Archer', floorNo))!;
      const f = Math.pow(1.25, floorNo - 1);
      NEAR(s.maxHp(u), ArcherRow().BaseStats.HP * f, 1e-6);
      NEAR(u.hp, ArcherRow().BaseStats.HP * f, 1e-6);
      NEAR(u.stats.get(StatId.Damage), ArcherRow().BaseStats.Damage * f, 1e-6);
      NEAR(u.stats.get(StatId.AttackSpeed), ArcherRow().BaseStats.AttackPerSec, 1e-9);
      NEAR(u.stats.get(StatId.DefensePercent), ArcherRow().BaseStats.DefensePct, 1e-9);
      NEAR(u.stats.get(StatId.Range), ArcherRow().AttackRange, 1e-9);
      NEAR(u.moveSpeed, ArcherRow().MoveSpeed, 1e-6);
    }
  });
});

describe('units: Archer attack and positioning', () => {
  it('AttacksFromDistanceAndHitIsInstant', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w);
    Place(s, w, -300, 0);
    Place(s, a, 400, 0);
    let attackTick = -1, damageTick = -1, hitAmount = 0, hits = 0;
    s.getBus().subscribe('AttackStarted', (e) => {
      if (e.attacker === a && attackTick < 0) { attackTick = s.tickCount(); CHECK(e.target === w); }
    });
    s.getBus().subscribe('DamageDealt', (e) => {
      if (e.source === a) {
        ++hits;
        if (damageTick < 0) { damageTick = s.tickCount(); hitAmount = e.amount; }
        CHECK((e.tags & DamageTag.Auto) !== 0);
        CHECK(e.target === w);
      }
    });
    s.startFight();
    const hpBefore = s.getUnit(w)!.hp;
    let checkedInstant = false;
    for (let i = 0; i < Ticks(s, 6); ++i) {
      s.step();
      if (damageTick === s.tickCount() && !checkedInstant) {
        NEAR(hpBefore - s.getUnit(w)!.hp, hitAmount, 1e-9);
        checkedInstant = true;
      }
    }
    CHECK(checkedInstant);
    CHECK(attackTick > 0 && attackTick === damageTick);
    const interval = 1 / ArcherRow().BaseStats.AttackPerSec;
    const expectFirst = Math.ceil(interval / s.config().dt - 1e-6);
    CHECK(Math.abs(damageTick - expectFirst) <= 1);
    const def = data.findClassRow('Warrior')!.BaseStats.DefensePct;
    NEAR(hitAmount, ArcherRow().BaseStats.Damage * (1 - def / 100), 1e-9);
    CHECK(hits === Math.floor(6 * ArcherRow().BaseStats.AttackPerSec + 1e-6));
    NEAR(dist(s, a, w), 700, 1e-6);
  });
  it('HitsFromBeyondMeleeReachUpToRangeButNotBeyond', () => {
    for (const d of [799, 801]) {
      const s = new CombatSim(data, 1);
      const w = s.addPartyUnit('Warrior');
      const a = s.addEnemy('Archer', 1);
      Freeze(s, w);
      Freeze(s, a);
      Place(s, w, -400, 0);
      Place(s, a, -400 + d, 0);
      let hits = 0;
      s.getBus().subscribe('DamageDealt', (e) => { if (e.source === a) ++hits; });
      s.startFight();
      StepN(s, Ticks(s, 5));
      if (d < 800) CHECK(hits >= 3); else CHECK(hits === 0);
    }
  });
  it('ApproachesUntilInsideBandThenStops', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w);
    Tough(s, w);
    Place(s, w, -1000, 0);
    Place(s, a, 200, 0);
    let firstHitDist = -1;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === a && firstHitDist < 0) firstHitDist = dist(s, a, w); });
    s.startFight();
    StepN(s, Ticks(s, 8));
    const d = dist(s, a, w);
    CHECK(d >= ArcherRow().PreferredDistMin - 1e-6 && d <= ArcherRow().PreferredDistMax + 1e-6);
    CHECK(d >= s.config().boundFactor * ArcherRow().PreferredDistMax - 1);
    CHECK(firstHitDist > 0 && firstHitDist <= ArcherRow().AttackRange + 1e-6);
    StepN(s, Ticks(s, 4));
    NEAR(dist(s, a, w), d, 1.0);
  });
  it('MovesNoFasterThanItsMoveSpeed', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w);
    Tough(s, w);
    Place(s, w, -1000, 0);
    Place(s, a, 200, 0);
    s.startFight();
    const maxStep = ArcherRow().MoveSpeed * s.config().dt;
    let travelled = 0;
    let px = s.getUnit(a)!.x, py = s.getUnit(a)!.y;
    let ok = true;
    for (let i = 0; i < Ticks(s, 2); ++i) {
      s.step();
      const u = s.getUnit(a)!;
      const step = H(u.x - px, u.y - py);
      if (step > maxStep + 1e-6) ok = false;
      travelled += step;
      px = u.x;
      py = u.y;
    }
    CHECK(ok);
    NEAR(travelled, ArcherRow().MoveSpeed * 2, 6.0);
  });
  it('RetreatsWhenApproachedAndKeepsShooting', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w);
    Tough(s, w);
    Place(s, w, -800, 0);
    Place(s, a, -500, 0);
    let hits = 0;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === a) ++hits; });
    s.startFight();
    const maxStep = ArcherRow().MoveSpeed * s.config().dt;
    let px = s.getUnit(a)!.x, py = s.getUnit(a)!.y;
    let ok = true;
    for (let i = 0; i < Ticks(s, 5); ++i) {
      s.step();
      const u = s.getUnit(a)!;
      if (H(u.x - px, u.y - py) > maxStep + 1e-6) ok = false;
      px = u.x;
      py = u.y;
    }
    CHECK(ok);
    const d = dist(s, a, w);
    CHECK(d >= ArcherRow().RetreatDistance);
    CHECK(d < ArcherRow().PreferredDistMin + 10);
    CHECK(s.getUnit(a)!.x > -500);
    CHECK(hits >= 3);
  });
  it('RetreatTriggersJustInsideRetreatDistanceOnly', () => {
    const retreat = ArcherRow().RetreatDistance;
    for (const d of [retreat - 10, retreat + 10]) {
      const s = new CombatSim(data, 1);
      const w = s.addPartyUnit('Warrior');
      const a = s.addEnemy('Archer', 1);
      Freeze(s, w);
      Tough(s, w);
      Place(s, w, -800, 0);
      Place(s, a, -800 + d, 0);
      s.startFight();
      StepN(s, Ticks(s, 2));
      const moved = s.getUnit(a)!.x - (-800 + d);
      if (d < retreat) CHECK(moved > 50); else NEAR(moved, 0, 1e-6);
    }
  });
  it('RetreatsFromNearestEnemyNotFromItsTarget', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w); Freeze(s, m); Tough(s, w); Tough(s, m);
    Place(s, w, -400, 0);
    Place(s, m, 0, 0);
    Place(s, a, 300, 0);
    s.dealDamage(w, a, 5.0, DamageTag.Auto);
    s.startFight();
    StepN(s, 1);
    CHECK(s.getUnit(a)!.target === w);
    const before = dist(s, a, m);
    StepN(s, Ticks(s, 1));
    CHECK(dist(s, a, m) > before + 100);
  });
  it('CorneredArcherStaysInsideArenaAndKeepsShooting', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w);
    Tough(s, w);
    const edge = s.config().arenaW * 0.5;
    Place(s, w, edge - 300, 0);
    Place(s, a, edge - 10, 0);
    let hits = 0;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === a) ++hits; });
    s.startFight();
    StepN(s, Ticks(s, 6));
    const u = s.getUnit(a)!;
    CHECK(u.x <= edge + 1e-6 && u.x >= -edge - 1e-6);
    CHECK(Math.abs(u.y) <= s.config().arenaH * 0.5 + 1e-6);
    CHECK(hits >= Math.floor(6 * ArcherRow().BaseStats.AttackPerSec + 1e-6) - 1);
  });
  it('ArcherEndsUpBehindTheMeleeEnemies', () => {
    const s = new CombatSim(data, 3);
    const w = s.addPartyUnit('Warrior');
    Freeze(s, w);
    Tough(s, w);
    Place(s, w, -800, 0);
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    const a = s.addEnemy('Archer', 1);
    const br = s.addEnemy('Brute', 1);
    s.startFight();
    StepN(s, Ticks(s, 10));
    const melee = data.findEnemy('Grunt')!.AttackRange;
    for (const m of [g1, g2, br]) CHECK(dist(s, m, w) <= melee + 1);
    CHECK(dist(s, a, w) >= ArcherRow().RetreatDistance);
    CHECK(dist(s, a, w) <= ArcherRow().PreferredDistMax + 1);
    for (const m of [g1, g2, br]) CHECK(dist(s, a, w) > dist(s, m, w) + 300);
  });
});

describe('units: Archer targeting', () => {
  it('TargetsHighestThreatNotClosest', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const p = s.addPartyUnit('Priest');
    const a = s.addEnemy('Archer', 1);
    for (const id of [w, m, p]) { Freeze(s, id); Tough(s, id); }
    Place(s, w, -100, 0);
    Place(s, m, -300, 200);
    Place(s, p, -300, -200);
    Place(s, a, 400, 0);
    Tough(s, a);
    s.startFight();
    s.dealDamage(m, a, 1.0, DamageTag.Auto);
    StepN(s, 1);
    CHECK(s.threatOn(a, m) > 0 && s.threatOn(a, w) === 0);
    CHECK(s.getUnit(a)!.target === m);
    s.dealDamage(w, a, 20.0, DamageTag.Auto);
    CHECK(s.threatOn(a, w) > s.threatOn(a, m));
    StepN(s, 1);
    CHECK(s.getUnit(a)!.target === w);
    let onTarget = 0, offTarget = 0;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === a) { if (e.target === w) ++onTarget; else ++offTarget; } });
    StepN(s, Ticks(s, 6));
    CHECK(onTarget >= 3 && offTarget === 0);
  });
  it('HealingThreatCanPullTheArcher', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const p = s.addPartyUnit('Priest');
    const a = s.addEnemy('Archer', 1);
    for (const id of [w, p]) { Freeze(s, id); Tough(s, id); }
    Place(s, w, -100, 0);
    Place(s, p, -300, 100);
    Place(s, a, 500, 0);
    s.startFight();
    s.mutableUnit(w)!.hp -= 50;
    const healed = s.applyHeal(p, w, 8.0);
    CHECK(healed > 0);
    NEAR(s.threatOn(a, p), healed * s.config().healThreatFactor, 1e-9);
    StepN(s, 1);
    CHECK(s.getUnit(a)!.target === p);
  });
  it('NoThreatMeansDeterministicTieBreakAmongLivingParty', () => {
    for (const seed of [1, 9, 123]) {
      const picks: UnitId[] = [kNoUnit, kNoUnit];
      for (let run = 0; run < 2; ++run) {
        const s = new CombatSim(data, seed);
        const w = s.addPartyUnit('Warrior');
        const m = s.addPartyUnit('Mage');
        const pr = s.addPartyUnit('Priest');
        const a = s.addEnemy('Archer', 1);
        for (const id of [w, m, pr]) Freeze(s, id);
        Place(s, a, 400, 0);
        s.startFight();
        StepN(s, 1);
        picks[run] = s.getUnit(a)!.target;
        CHECK(picks[run] === w || picks[run] === m || picks[run] === pr);
      }
      CHECK(picks[0] === picks[1]);
    }
  });
  it('RetargetsToNextThreatWhenTargetDies', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const p = s.addPartyUnit('Priest');
    const a = s.addEnemy('Archer', 1);
    for (const id of [w, m, p]) Freeze(s, id);
    Place(s, w, -100, 0);
    Place(s, m, -200, 150);
    Place(s, p, -300, -150);
    Place(s, a, 400, 0);
    s.startFight();
    s.dealDamage(m, a, 3.0, DamageTag.Auto);
    s.dealDamage(p, a, 1.0, DamageTag.Auto);
    StepN(s, 1);
    CHECK(s.getUnit(a)!.target === m);
    s.dealDamage(a, m, 1000, DamageTag.Auto);
    CHECK(!s.getUnit(m)!.alive);
    StepN(s, 1);
    CHECK(s.getUnit(a)!.target === p);
    s.dealDamage(a, p, 1000, DamageTag.Auto);
    StepN(s, 1);
    CHECK(s.getUnit(a)!.target === w);
  });
  it('ArcherDoesNotHealAllies', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w);
    Tough(s, w);
    s.mutableUnit(g)!.hp = 10;
    Freeze(s, g);
    Place(s, a, 400, 0);
    Place(s, w, -300, 0);
    let archerHeals = 0, archerDamage = 0;
    s.getBus().subscribe('HealApplied', (e) => { if (e.source === a) ++archerHeals; });
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === a) ++archerDamage; });
    s.startFight();
    StepN(s, Ticks(s, 5));
    CHECK(archerHeals === 0);
    CHECK(archerDamage > 0);
    NEAR(s.getUnit(g)!.hp, 10, 1e-9);
  });
});

describe('units: party ArcherFirst targeting', () => {
  it('PartyArcherFirstPicksArcherOverCloserEnemy', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    const a = s.addEnemy('Archer', 1);
    Freeze(s, m); Freeze(s, g); Freeze(s, a);
    Place(s, m, -800, 0);
    Place(s, g, -300, 0);
    Place(s, a, 800, 0);
    s.startFight();
    StepN(s, 1);
    CHECK(s.getUnit(m)!.target === g);
    s.mutableUnit(m)!.targetTypes = ['ArcherFirst'];
    StepN(s, 1);
    CHECK(s.getUnit(m)!.target === a);
  });
  it('ArcherFirstFallsThroughWhenNoArcherAlive', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    Freeze(s, m); Freeze(s, g1); Freeze(s, g2);
    Place(s, m, -800, 0);
    Place(s, g1, 100, 0);
    Place(s, g2, -100, 300);
    s.mutableUnit(m)!.targetTypes = ['ArcherFirst'];
    s.startFight();
    StepN(s, 1);
    CHECK(s.getUnit(m)!.target === g2);
    s.mutableUnit(g1)!.hp = 5;
    s.mutableUnit(m)!.targetTypes = ['ArcherFirst', 'Weakest'];
    StepN(s, 1);
    CHECK(s.getUnit(m)!.target === g1);
    const a = s.addEnemy('Archer', 1);
    Freeze(s, a);
    Place(s, a, 900, 0);
    StepN(s, 1);
    CHECK(s.getUnit(m)!.target === a);
  });
  it('ArcherFirstPicksClosestOfSeveralArchers', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const far = s.addEnemy('Archer', 1);
    const near = s.addEnemy('Archer', 1);
    Freeze(s, m); Freeze(s, far); Freeze(s, near);
    Place(s, m, -800, 0);
    Place(s, far, 900, 0);
    Place(s, near, 100, 200);
    s.mutableUnit(m)!.targetTypes = ['ArcherFirst'];
    s.startFight();
    StepN(s, 1);
    CHECK(s.getUnit(m)!.target === near);
  });
  it('ArcherFirstIgnoresShamanAndHealerFirstIgnoresArcher', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const sh = s.addEnemy('Shaman', 1);
    const a = s.addEnemy('Archer', 1);
    Freeze(s, m); Freeze(s, sh); Freeze(s, a);
    Place(s, m, -800, 0);
    Place(s, sh, 200, 0);
    Place(s, a, 600, 0);
    s.startFight();
    s.mutableUnit(m)!.targetTypes = ['ArcherFirst'];
    StepN(s, 1);
    CHECK(s.getUnit(m)!.target === a);
    s.mutableUnit(m)!.targetTypes = ['HealerFirst'];
    StepN(s, 1);
    CHECK(s.getUnit(m)!.target === sh);
  });
  it('WarriorIgnoresTargetListIncludingArcherFirst', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w); Freeze(s, g); Freeze(s, a);
    Place(s, w, -800, 0);
    Place(s, g, -400, 0);
    Place(s, a, 600, 0);
    s.mutableUnit(w)!.targetTypes = ['ArcherFirst'];
    s.startFight();
    StepN(s, 1);
    CHECK(s.getUnit(w)!.target === g);
    s.dealDamage(w, g, 1.0, DamageTag.Auto);
    StepN(s, 1);
    CHECK(s.getUnit(w)!.target === g);
    s.dealDamage(w, g, 1e6, DamageTag.Auto);
    StepN(s, 1);
    CHECK(s.getUnit(w)!.target === a);
  });
  it('ArcherFirstIsAllowedForEveryClassExceptWarrior', () => {
    for (const n of ['Priest', 'Assassin', 'Barbarian', 'Summoner', 'Mage']) {
      CHECK(data.findClassRow(n)?.AllowedTargetTypes.includes('ArcherFirst'), n);
    }
    CHECK(data.findClassRow('Warrior')!.AllowedTargetTypes.length === 0);
  });
  it('ArcherFirstMageFocusesArcherInLiveFight', () => {
    const s = new CombatSim(data, 4);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g1 = s.addEnemy('Grunt', 1);
    const g2 = s.addEnemy('Grunt', 1);
    const a = s.addEnemy('Archer', 1);
    Tough(s, w);
    Tough(s, m);
    s.mutableUnit(m)!.targetTypes = ['ArcherFirst'];
    s.mutableUnit(m)!.abilityId = '';
    s.startFight();
    for (let i = 0; i < Ticks(s, 12) && s.getUnit(a)!.alive && s.getState() === FightState.Running; ++i) StepN(s, 1);
    const ua = s.getUnit(a)!;
    CHECK(ua.damageFrom.length > m && ua.damageFrom[m] > 0);
    for (const g of [g1, g2]) {
      const ug = s.getUnit(g)!;
      NEAR(ug.damageFrom.length > m ? ug.damageFrom[m] : 0, 0, 1e-9);
    }
    if (ua.alive) CHECK(s.getUnit(m)!.target === a);
  });
});

describe('units: Archer enrage and fights', () => {
  it('ArcherDamageGetsEnrageBonus', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w);
    Tough(s, w);
    Place(s, w, -300, 0);
    Place(s, a, 400, 0);
    s.startFight();
    const base = s.getUnit(a)!.stats.get(StatId.Damage);
    StepN(s, Ticks(s, 44));
    NEAR(s.getUnit(a)!.stats.get(StatId.Damage), base, 1e-9);
    StepN(s, Ticks(s, 2));
    CHECK(s.getEnrageStep() === 1);
    NEAR(s.getUnit(a)!.stats.get(StatId.Damage), base * 1.1, 1e-6);
    StepN(s, Ticks(s, 5));
    CHECK(s.getEnrageStep() === 2);
    NEAR(s.getUnit(a)!.stats.get(StatId.Damage), base * 1.2, 1e-6);
  });

  function runArcherFight(seed: number, floorNo: number) {
    const s = new CombatSim(data, seed);
    s.addPartyUnit('Warrior');
    s.addPartyUnit('Priest');
    s.addEnemy('Archer', floorNo);
    s.addEnemy('Archer', floorNo);
    const r = { log: '', state: FightState.NotStarted, archerHits: 0, farHits: 0, maxHitDist: 0, kills: 0 };
    s.getBus().subscribe('DamageDealt', (e) => {
      const src = s.getUnit(e.source);
      const tgt = s.getUnit(e.target);
      if (!src || !tgt || src.name !== 'Archer') return;
      ++r.archerHits;
      const d = H(src.x - tgt.x, src.y - tgt.y);
      if (d > data.findEnemy('Grunt')!.AttackRange) ++r.farHits;
      r.maxHitDist = Math.max(r.maxHitDist, d);
    });
    s.startFight();
    s.runToEnd();
    r.state = s.getState();
    r.log = s.getLog().toText();
    r.kills = s.getEnemiesKilled();
    return r;
  }
  it('FightVsStubOpponentRunsTwiceWithIdenticalLogs', () => {
    for (const seed of [1, 2, 77]) {
      const a = runArcherFight(seed, 2);
      const b = runArcherFight(seed, 2);
      CHECK(a.log !== '');
      CHECK(a.log === b.log);
      CHECK(a.state === b.state);
      CHECK(a.state === FightState.Won || a.state === FightState.Wiped);
      CHECK(a.archerHits > 0);
      CHECK(a.archerHits === b.archerHits);
      CHECK(a.maxHitDist <= ArcherRow().AttackRange + 1);
      CHECK(a.farHits > 0);
      CHECK(a.farHits === b.farHits);
    }
  });
  it('FightLogHasArcherSpawnAttackAndDeathLines', () => {
    const r = runArcherFight(5, 1);
    CHECK(r.log.includes('Archer#2 spawns'));
    CHECK(r.log.includes('Archer#2 attacks'));
    CHECK(r.log.includes('Archer#2 hits'));
    CHECK(r.state !== FightState.Won || r.log.includes('EnemyKilled: Archer#'));
    CHECK(r.log.includes('FightEnded'));
  });
});

describe('units: Archer pending rules (not implemented in the core; off by default in C++)', () => {
  it.skip('PENDING_ArcherKeepsLowerBandEdge', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const a = s.addEnemy('Archer', 1);
    Freeze(s, w);
    Tough(s, w);
    Place(s, w, -800, 0);
    Place(s, a, -280, 0);
    s.startFight();
    StepN(s, Ticks(s, 4));
    CHECK(dist(s, a, w) >= ArcherRow().PreferredDistMin - 1);
  });
  it.skip('PENDING_ArcherSpawnsBehindMelee', () => {
    const s = new CombatSim(data, 1);
    s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    const a = s.addEnemy('Archer', 1);
    CHECK(s.getUnit(a)!.x > s.getUnit(g)!.x);
  });
});
