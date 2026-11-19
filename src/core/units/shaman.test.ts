// Port of tests/units/shaman/tests.cpp: the enemy Shaman (healer role) in the data-driven combat core.
// (Its ReadFile pins match nothing in the shipped data, so the plain data is used.)
import { describe, it } from 'vitest';
import { Behavior, CombatSim, FightState, defaultCombatConfig, kHealBase, runFightHeadless, type Unit } from '../combatSim';
import { LogKind } from '../combatSupport';
import { DamageTag, kNoUnit, type UnitId } from '../eventBus';
import { ModKind, ModSource, StatId } from '../statResolver';
import { CHECK, Cls, Enemy, Freeze, NEAR, Place, StepSeconds, data } from '../combatTestKit';

const Dist = (a: Unit, b: Unit) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const Frac = (s: CombatSim, id: UnitId) => s.getUnit(id)!.hp / s.maxHp(s.getUnit(id)!);
const SetFrac = (s: CombatSim, id: UnitId, frac: number) => { s.mutableUnit(id)!.hp = frac * s.maxHp(s.getUnit(id)!); };
const U = (s: CombatSim, id: UnitId) => s.getUnit(id)!;
const shamanHealValue = () => data.findEffect('ShamanHeal_1')!.Value;
/** A frozen Warrior far from everything: keeps the fight valid without touching the Shaman. */
function addBystander(s: CombatSim): UnitId {
  const w = s.addPartyUnit('Warrior');
  Freeze(s, w);
  Place(s, w, -1150, 650);
  return w;
}

describe('units: Shaman data', () => {
  it('ShamanDataRowMatchesTheDocs', () => {
    const e = Enemy('Shaman');
    CHECK(e.RoleTag === 'Healer');
    CHECK(!e.Taunts && !e.IsBoss && !e.IsElite);
    NEAR(e.MoveSpeed, 240, 1e-6);
    NEAR(e.AttackRange, 600, 1e-6);
    NEAR(e.PreferredDistMin, 500, 1e-6);
    CHECK(e.PreferredDistMax < 0);
    NEAR(e.RetreatDistance, 400, 1e-6);
    CHECK(e.MoveSpeed < Cls('Warrior').MoveSpeed);
    CHECK(e.BaseStats.HP > 0 && e.BaseStats.HP < Enemy('Brute').BaseStats.HP);
    CHECK(e.BaseStats.Damage > 0 && e.BaseStats.Damage < Enemy('Grunt').BaseStats.Damage);
    CHECK(e.BaseStats.AttackPerSec > 0);
  });
  it('ShamanStatsScaleByCompoundingFloorFactor', () => {
    const s = new CombatSim(data, 1);
    const a = s.addEnemy('Shaman', 1);
    const b = s.addEnemy('Shaman', 4);
    const f = Math.pow(s.config().floorScaling, 3);
    const e = Enemy('Shaman');
    NEAR(s.maxHp(U(s, a)), e.BaseStats.HP, 1e-6);
    NEAR(U(s, a).stats.get(StatId.Damage), e.BaseStats.Damage, 1e-6);
    NEAR(s.maxHp(U(s, b)), e.BaseStats.HP * f, 1e-6);
    NEAR(U(s, b).stats.get(StatId.Damage), e.BaseStats.Damage * f, 1e-6);
    NEAR(U(s, b).stats.get(StatId.AttackSpeed), e.BaseStats.AttackPerSec, 1e-9);
    NEAR(U(s, b).stats.get(StatId.Range), e.AttackRange, 1e-9);
    CHECK(U(s, a).healer && !U(s, a).archer && U(s, a).enemy);
    CHECK(U(s, a).behavior === Behavior.Backline);
  });
  it('ShamanHealAmountComesFromDataAndScalesWithFloor', () => {
    for (const floor of [1, 6]) {
      const s = new CombatSim(data, 1);
      const sh = s.addEnemy('Shaman', floor);
      const br = s.addEnemy('Brute', floor);
      Freeze(s, sh); Freeze(s, br);
      Place(s, sh, 800, 0); Place(s, br, 1000, 0);
      SetFrac(s, br, 0.5);
      addBystander(s);
      let healed = -1;
      s.getBus().subscribe('HealApplied', (e) => { if (e.source === sh && healed < 0) healed = e.effectiveAmount; });
      s.startFight();
      StepSeconds(s, 2);
      NEAR(healed, shamanHealValue() * kHealBase * Math.pow(1.25, floor - 1), 1e-9, `floor ${floor}`);
    }
  });
});

describe('units: Shaman healing rule', () => {
  it('ShamanHealsTheLowestHpFractionEnemyAllyWhileAnyIsHurt', () => {
    const s = new CombatSim(data, 1);
    const sh = s.addEnemy('Shaman', 1);
    const gr = s.addEnemy('Grunt', 1);
    const br = s.addEnemy('Brute', 1);
    for (const id of [sh, gr, br]) Freeze(s, id);
    Place(s, sh, 800, 0); Place(s, gr, 900, -300); Place(s, br, 900, 300);
    s.mutableUnit(gr)!.hp = 100;
    s.mutableUnit(br)!.hp = 250;
    addBystander(s);
    let firstTarget = kNoUnit, heals = 0;
    s.getBus().subscribe('HealApplied', (e) => {
      if (e.source !== sh) return;
      if (firstTarget === kNoUnit) firstTarget = e.target;
      ++heals;
    });
    s.startFight();
    StepSeconds(s, 2);
    CHECK(firstTarget === br);
    CHECK(heals >= 1);
    StepSeconds(s, 150);
    CHECK(Frac(s, br) > 0.85 - 1e-9 && Frac(s, gr) > 0.85 - 1e-9);
    NEAR(U(s, sh).hp, s.maxHp(U(s, sh)), 1e-9);
  });
  it('ShamanHealCadenceIsItsAttackSpeed', () => {
    const s = new CombatSim(data, 1);
    const sh = s.addEnemy('Shaman', 1);
    const br = s.addEnemy('Brute', 1);
    Freeze(s, sh); Freeze(s, br);
    Place(s, sh, 800, 0); Place(s, br, 1000, 0);
    s.mutableUnit(br)!.hp = 1;
    addBystander(s);
    const times: number[] = [];
    s.getBus().subscribe('HealApplied', (e) => { if (e.source === sh) times.push(s.getTime()); });
    s.startFight();
    StepSeconds(s, 10);
    const interval = 1 / Enemy('Shaman').BaseStats.AttackPerSec;
    CHECK(times.length >= 7 && times.length <= 9);
    for (let i = 1; i < times.length; ++i) NEAR(times[i] - times[i - 1], interval, 0.07);
    NEAR(U(s, sh).healDone / 10, shamanHealValue() * kHealBase * Enemy('Shaman').BaseStats.AttackPerSec, 0.3);
  });
  it('ShamanHealsOnlyBelowEightyFivePercentAndNeverOverheals', () => {
    const s = new CombatSim(data, 1);
    const sh = s.addEnemy('Shaman', 1);
    const br = s.addEnemy('Brute', 1);
    Freeze(s, sh); Freeze(s, br);
    Place(s, sh, 800, 0); Place(s, br, 1000, 0);
    SetFrac(s, br, 0.9);
    addBystander(s);
    let heals = 0;
    s.getBus().subscribe('HealApplied', (e) => { if (e.source === sh) ++heals; });
    s.startFight();
    StepSeconds(s, 6);
    CHECK(heals === 0);
    SetFrac(s, br, 0.84);
    StepSeconds(s, 3);
    CHECK(heals >= 1);
    const t = new CombatSim(data, 1);
    const sh2 = t.addEnemy('Shaman', 1);
    const gr = t.addEnemy('Grunt', 1);
    Freeze(t, sh2); Freeze(t, gr);
    Place(t, sh2, 800, 0); Place(t, gr, 900, 0);
    t.mutableUnit(gr)!.stats.addModifier(StatId.Health, ModKind.Flat, -(Enemy('Grunt').BaseStats.HP - 10), ModSource.Buff);
    t.mutableUnit(gr)!.hp = 8;
    let amount = -1;
    t.getBus().subscribe('HealApplied', (e) => { if (e.source === sh2 && amount < 0) amount = e.effectiveAmount; });
    addBystander(t);
    t.startFight();
    StepSeconds(t, 2);
    NEAR(amount, 2, 1e-9);
    NEAR(U(t, gr).hp, t.maxHp(U(t, gr)), 1e-9);
  });
  it('ShamanHealsItselfWhenItIsTheOnlyHurtEnemy', () => {
    const s = new CombatSim(data, 1);
    const sh = s.addEnemy('Shaman', 1);
    Freeze(s, sh);
    Place(s, sh, 800, 0);
    SetFrac(s, sh, 0.5);
    s.addPartyUnit('Warrior');
    Freeze(s, 1);
    Place(s, 1, -800, 0);
    s.startFight();
    StepSeconds(s, 3);
    CHECK(U(s, sh).hp > 0.5 * s.maxHp(U(s, sh)) + 1e-9);
    CHECK(U(s, sh).healDone > 0);
  });
  it('ShamanDoesNotHealPartyUnitsOrSummonsOnlyItsOwnSide', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    Freeze(s, w); Freeze(s, sh);
    Place(s, w, 0, 0); Place(s, sh, 500, 0);
    SetFrac(s, w, 0.3);
    s.mutableUnit(w)!.hp = 0.3 * s.maxHp(U(s, w));
    const before = U(s, w).hp;
    let healsOnParty = 0;
    s.getBus().subscribe('HealApplied', (e) => { if (e.target === w) ++healsOnParty; });
    s.startFight();
    StepSeconds(s, 4);
    CHECK(healsOnParty === 0);
    CHECK(U(s, w).hp <= before + 1e-9);
  });
  it('ShamanDoesNotHealAnAllyOutsideItsRangeButWalksToIt', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    const br = s.addEnemy('Brute', 1);
    Freeze(s, w); Freeze(s, br);
    Place(s, w, -1100, 0); Place(s, br, 1100, 600); Place(s, sh, 1100, -600);
    SetFrac(s, br, 0.5);
    let heals = 0, firstHealDist = -1;
    s.getBus().subscribe('HealApplied', (e) => {
      if (e.source !== sh) return;
      if (heals++ === 0) firstHealDist = Dist(U(s, sh), U(s, e.target));
    });
    s.startFight();
    StepSeconds(s, 0.5);
    CHECK(heals === 0);
    StepSeconds(s, 12);
    CHECK(heals >= 1);
    CHECK(firstHealDist > 0 && firstHealDist <= Enemy('Shaman').AttackRange + 1e-6);
  });
  it('ShamanSmitesWhenNobodyIsHurtAndIsIdleWhenNothingIsInRange', () => {
    {
      const s = new CombatSim(data, 1);
      const w = s.addPartyUnit('Warrior');
      const sh = s.addEnemy('Shaman', 1);
      Freeze(s, w); Freeze(s, sh);
      Place(s, w, 0, 0); Place(s, sh, 550, 0);
      let smites = 0, heals = 0, other = 0, first = -1;
      s.getBus().subscribe('DamageDealt', (e) => {
        if (e.source !== sh) return;
        if (e.tags & DamageTag.Smite) { ++smites; if (first < 0) first = e.amount; } else ++other;
      });
      s.getBus().subscribe('HealApplied', (e) => { if (e.source === sh) ++heals; });
      s.startFight();
      StepSeconds(s, 5);
      CHECK(smites >= 3 && smites <= 5);
      CHECK(heals === 0 && other === 0);
      NEAR(first, Enemy('Shaman').BaseStats.Damage * (1 - Cls('Warrior').BaseStats.DefensePct / 100), 1e-9);
    }
    {
      const s = new CombatSim(data, 1);
      const w = s.addPartyUnit('Warrior');
      const sh = s.addEnemy('Shaman', 1);
      Freeze(s, w); Freeze(s, sh);
      Place(s, w, -1000, 0); Place(s, sh, 1000, 0);
      s.startFight();
      StepSeconds(s, 5);
      NEAR(U(s, sh).damageDone, 0, 1e-12);
      NEAR(U(s, sh).healDone, 0, 1e-12);
      NEAR(U(s, w).hp, s.maxHp(U(s, w)), 1e-12);
    }
  });
});

describe('units: Shaman threat and priority', () => {
  it('ShamanHealsGenerateNoThreatAnywhere', () => {
    const s = new CombatSim(data, 1);
    const pr = s.addPartyUnit('Priest');
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    const br = s.addEnemy('Brute', 1);
    for (const id of [pr, w, sh, br]) Freeze(s, id);
    Place(s, pr, -900, 0); Place(s, w, -800, 300); Place(s, sh, 900, 0); Place(s, br, 800, -300);
    SetFrac(s, br, 0.5);
    s.mutableUnit(w)!.hp = 0.5 * s.maxHp(U(s, w));
    s.startFight();
    StepSeconds(s, 4);
    CHECK(U(s, sh).healDone > 0);
    NEAR(U(s, sh).threatGenerated, 0, 1e-12);
    for (const u of s.getUnits()) for (let i = 0; i < u.threat.length; ++i) if (i === sh) NEAR(u.threat[i], 0, 1e-12);
    CHECK(U(s, pr).healDone > 0);
    NEAR(s.threatOn(br, pr), U(s, pr).healDone * s.config().healThreatFactor, 1e-9);
    NEAR(s.threatOn(sh, pr), U(s, pr).healDone * s.config().healThreatFactor, 1e-9);
  });
  it('ShamanIsAPriorityTargetOnlyThroughHealerFirstTargeting', () => {
    for (const mode of [0, 1]) {
      const s = new CombatSim(data, 1);
      const m = s.addPartyUnit('Mage');
      const gr = s.addEnemy('Grunt', 1);
      const sh = s.addEnemy('Shaman', 1);
      for (const id of [m, gr, sh]) Freeze(s, id);
      Place(s, m, -400, 0); Place(s, gr, 200, 0); Place(s, sh, 700, 0); Place(s, sh, 450, 0);
      if (mode === 1) s.mutableUnit(m)!.targetTypes = ['HealerFirst', 'Closest'];
      s.startFight();
      StepSeconds(s, 0.1);
      CHECK(U(s, m).target === (mode === 0 ? gr : sh), `mode ${mode}`);
    }
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const gr = s.addEnemy('Grunt', 1);
    const sh = s.addEnemy('Shaman', 1);
    for (const id of [m, gr, sh]) Freeze(s, id);
    Place(s, m, -400, 0); Place(s, gr, 200, 0); Place(s, sh, 450, 0);
    s.mutableUnit(m)!.targetTypes = ['Weakest'];
    s.startFight();
    StepSeconds(s, 0.1);
    CHECK(U(s, m).target === (Enemy('Shaman').BaseStats.HP > Enemy('Grunt').BaseStats.HP ? gr : sh));
  });
  it('KillingTheShamanStopsItsHealsAndShortensTheFight', () => {
    const run = (killShamanFirst: boolean) => {
      const s = new CombatSim(data, 5);
      s.addPartyUnit('Warrior');
      const m = s.addPartyUnit('Mage');
      s.addEnemy('Grunt', 1);
      s.addEnemy('Grunt', 1);
      s.addEnemy('Shaman', 1);
      if (killShamanFirst) s.mutableUnit(m)!.targetTypes = ['HealerFirst', 'Closest'];
      s.startFight();
      const st = s.runToEnd();
      return { st, secs: s.getTime() };
    };
    const a = run(false), b = run(true);
    CHECK(a.st !== FightState.TimedOut && b.st !== FightState.TimedOut);
    CHECK(b.st === FightState.Won);
    CHECK(b.secs < 2 * a.secs);
  });
});

describe('units: Shaman positioning', () => {
  it('ShamanApproachesUntilItIsWithinRangeOfItsTargetButStaysOutOfMelee', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    Freeze(s, w);
    Place(s, w, -800, 0); Place(s, sh, 1100, 0);
    s.startFight();
    StepSeconds(s, 10);
    const d = Dist(U(s, sh), U(s, w));
    CHECK(d <= Enemy('Shaman').AttackRange + 1e-6);
    CHECK(d >= Enemy('Shaman').PreferredDistMin - 1);
  });
  it('ShamanRetreatsOutOfFourHundredWhenAnEnemyIsCloser', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    Freeze(s, w);
    Place(s, w, 0, 0); Place(s, sh, 300, 0);
    s.startFight();
    StepSeconds(s, 0.3);
    CHECK(Dist(U(s, sh), U(s, w)) > 300 + 1e-6);
    StepSeconds(s, 3);
    const d = Dist(U(s, sh), U(s, w));
    CHECK(d >= Enemy('Shaman').PreferredDistMin - 1);
    CHECK(d <= Enemy('Shaman').AttackRange + 1e-6);
    CHECK(Enemy('Shaman').MoveSpeed < Cls('Warrior').MoveSpeed);
  });
  it('ShamanDoesNotMoveInsideTheQuietBandBetweenRetreatAndRange', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    Freeze(s, w);
    Place(s, w, 0, 0); Place(s, sh, 450, 0);
    s.startFight();
    StepSeconds(s, 3);
    NEAR(U(s, sh).x, 450, 1e-6);
    NEAR(U(s, sh).y, 0, 1e-6);
  });
  it('ShamanStaysInsideTheArenaWhileRetreating', () => {
    const s = new CombatSim(data, 1);
    s.addPartyUnit('Assassin');
    const sh = s.addEnemy('Shaman', 1);
    Place(s, sh, 1150, 0);
    s.startFight();
    let outside = 0;
    for (let i = 0; i < 30 * 12; ++i) {
      s.step();
      const u = U(s, sh);
      if (!(Math.abs(u.x) <= s.config().arenaW * 0.5 + 1e-6 && Math.abs(u.y) <= s.config().arenaH * 0.5 + 1e-6)) ++outside;
      if (!u.alive) break;
    }
    CHECK(outside === 0);
  });
});

describe('units: Shaman death', () => {
  it('ShamanDyingMidHealStopsHealingAndRaisesTheDeathEvents', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    const br = s.addEnemy('Brute', 1);
    for (const id of [w, sh, br]) Freeze(s, id);
    Place(s, w, -900, 0); Place(s, sh, 800, 0); Place(s, br, 1000, 0);
    s.mutableUnit(br)!.hp = 100;
    let heals = 0, died = 0, killed = 0;
    s.getBus().subscribe('HealApplied', (e) => {
      if (e.source !== sh) return;
      ++heals;
      if (heals === 1) s.dealDamage(w, sh, 1e6, DamageTag.Ability);
    });
    s.getBus().subscribe('UnitDied', (e) => { if (e.unit === sh) { ++died; CHECK(e.wasEnemy && e.killer === w); } });
    s.getBus().subscribe('EnemyKilled', (e) => { if (e.enemy === sh) ++killed; });
    s.startFight();
    StepSeconds(s, 3);
    const brHp = U(s, br).hp;
    StepSeconds(s, 10);
    CHECK(heals === 1);
    CHECK(died === 1 && killed === 1);
    CHECK(!U(s, sh).alive);
    NEAR(U(s, br).hp, brHp, 1e-9);
    CHECK(s.getEnemiesKilled() >= 1);
    CHECK(s.getLog().toText().includes('dies'));
  });
  it('HealOnAnAllyThatDiedThisTickDoesNothing', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    const gr = s.addEnemy('Grunt', 1);
    s.dealDamage(w, gr, 1e6, DamageTag.Ability);
    let heals = 0;
    s.getBus().subscribe('HealApplied', () => { ++heals; });
    NEAR(s.applyHeal(sh, gr, kHealBase), 0, 1e-12);
    CHECK(heals === 0);
    CHECK(!U(s, gr).alive);
  });
  it('AllEnemiesDeadThroughShamanLastStillWinsTheFight', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    s.startFight();
    s.dealDamage(w, sh, 1e6, DamageTag.Ability);
    s.step();
    CHECK(s.getState() === FightState.Won);
    CHECK(s.getEnemiesKilled() === 1);
  });
});

describe('units: Shaman fights', () => {
  const stubFightLog = (seed: number) => {
    const s = new CombatSim(data, seed);
    s.addPartyUnit('Warrior');
    s.addPartyUnit('Mage');
    s.addEnemy('Grunt', 1);
    s.addEnemy('Shaman', 1);
    s.startFight();
    const st = s.runToEnd();
    const log = s.getLog().toText();
    let sawSmite = false;
    for (const e of s.getLog().getEntries()) {
      if (e.kind === LogKind.Damage && e.source >= 0 && s.getUnit(e.source) && s.getUnit(e.source)!.name === 'Shaman') sawSmite = true;
    }
    return { log, st, sawHeal: log.includes('heals'), sawSmite };
  };
  it('ShamanFightAgainstAStubOpponentRunsTwiceWithIdenticalLogs', () => {
    for (const seed of [1, 7, 42]) {
      const a = stubFightLog(seed);
      const b = stubFightLog(seed);
      CHECK(a.log !== '');
      CHECK(a.log === b.log);
      CHECK(a.st === b.st && a.st !== FightState.TimedOut);
      CHECK(a.sawHeal && b.sawHeal);
      CHECK(a.sawSmite);
    }
  });
  it('ShamanPacksLengthenFightsButStayWinnableForWarriorPlusMageOnFloorOne', () => {
    const party = ['Warrior', 'Mage'];
    const seeds = 100;
    const measure = (pack: string[]) => {
      const p = { wins: 0, wipes: 0, timeouts: 0, meanSec: 0, maxSec: 0 };
      let total = 0;
      for (let seed = 1; seed <= seeds; ++seed) {
        const r = runFightHeadless(data, seed, party, pack, 1);
        if (r.state === FightState.Won) ++p.wins;
        else if (r.state === FightState.Wiped) ++p.wipes;
        else ++p.timeouts;
        total += r.seconds;
        p.maxSec = Math.max(p.maxSec, r.seconds);
      }
      p.meanSec = total / seeds;
      return p;
    };
    const packs = [
      ['Grunt', 'Grunt', 'Grunt'],
      ['Grunt', 'Grunt', 'Shaman'],
      ['Grunt', 'Shaman', 'Shaman'],
      ['Grunt', 'Brute', 'Shaman'],
      ['Grunt', 'Archer', 'Shaman'],
      ['Grunt', 'Grunt', 'Shaman', 'Shaman'],
      ['Shaman', 'Shaman', 'Shaman'],
    ];
    let base = measure(packs[0]);
    packs.forEach((units, i) => {
      const p = i === 0 ? base : measure(units);
      CHECK(p.timeouts === 0, units.join('+'));
      CHECK(p.maxSec < defaultCombatConfig().runawayGuardSeconds, units.join('+'));
      if (i === 0) { base = p; return; }
      if (units.includes('Shaman')) {
        CHECK(p.wins > 0, units.join('+'));
        if (i <= 2) CHECK(p.wins >= 50, units.join('+'));
      }
    });
    const one = measure(['Grunt', 'Grunt', 'Shaman']);
    CHECK(one.meanSec > base.meanSec - 1e-9);
  });
});

describe('units: Shaman formerly pending, now implemented', () => {
  it('ShamanRetreatEndsAtItsPreferredFiveHundred', () => {
    const s = new CombatSim(data, 1);
    const w = s.addPartyUnit('Warrior');
    const sh = s.addEnemy('Shaman', 1);
    Freeze(s, w);
    Place(s, w, 0, 0); Place(s, sh, 300, 0);
    s.startFight();
    StepSeconds(s, 5);
    CHECK(Dist(U(s, sh), U(s, w)) >= Enemy('Shaman').PreferredDistMin - 1);
  });
  it('ShamanHealComesFromDataNotACppConstant', () => {
    const e = data.findEffect('ShamanHeal_1');
    CHECK(e !== undefined);
    if (e) CHECK(e.Type === 'Heal' && e.Value > 0);
    CHECK(Enemy('Shaman').AutoActionId === 'ShamanHeal');
  });
  it('ShamanHealScalesWithFloor', () => {
    const healed = [0, 0];
    let k = 0;
    for (const floor of [1, 6]) {
      const s = new CombatSim(data, 1);
      const a = s.addEnemy('Shaman', floor);
      const b = s.addEnemy('Brute', floor);
      addBystander(s);
      Freeze(s, a); Freeze(s, b);
      Place(s, a, 800, 0); Place(s, b, 1000, 0);
      SetFrac(s, b, 0.5);
      const slot = k;
      s.getBus().subscribe('HealApplied', (e) => { if (e.source === a && healed[slot] === 0) healed[slot] = e.effectiveAmount; });
      s.startFight();
      StepSeconds(s, 2);
      ++k;
    }
    CHECK(healed[0] > 0);
    NEAR(healed[1] / healed[0], Math.pow(1.25, 5), 1e-9);
  });
  it('ShamanHealRaisesNoThreat', () => {
    const s = new CombatSim(data, 1);
    const m = s.addPartyUnit('Mage');
    const sh = s.addEnemy('Shaman', 1);
    const br = s.addEnemy('Brute', 1);
    for (const id of [m, sh, br]) Freeze(s, id);
    Place(s, m, -800, 0); Place(s, sh, 700, 0); Place(s, br, 900, 0);
    SetFrac(s, br, 0.5);
    s.startFight();
    StepSeconds(s, 3);
    CHECK(U(s, sh).healDone > 0);
    NEAR(U(s, sh).threatGenerated, 0, 1e-12);
  });
});
