// Port of tests/units/summoner/tests.cpp: the Summoner with the Nov 12 weapon spirit (the standard spirit is its weapon and
// fires the bolt; Summon Greater Spirit is the only ability). Positioning, spirit lifecycle, threat and determinism.
import { describe, it } from 'vitest';
import { Behavior, CombatSim, FightState, runFightHeadless, type Unit } from '../combatSim';
import { CombatData } from '../combatData';
import { DamageTag, kNoUnit, type UnitId } from '../eventBus';
import { ModKind, ModSource, StatId } from '../statResolver';
import { CHECK, Enemy, Freeze, NEAR, Place, StepSeconds, StepTicks, StubRow, legacyHeroData as data, llround } from '../combatTestKit';

// The Nov 12 support Summoner whose weapon spirit attacks (the shipped one is a healer since Nov 21; see summonerHealer.test.ts).
const Cls = (n: string) => data.findClassRow(n)!;

const EffectDuration = (n: string) => data.findEffect(n)?.Duration ?? 0;
function copyData(src: CombatData): CombatData {
  const d = new CombatData();
  d.classes = structuredClone(src.classes);
  d.enemies = structuredClone(src.enemies);
  d.abilities = structuredClone(src.abilities);
  d.effects = structuredClone(src.effects);
  return d;
}
/** Dummy: huge HP, never moves, hits for 1 within 150. Stub: a weak melee chaser so a whole fight reaches a result. */
const td = (() => {
  const d = copyData(data);
  const dummy = StubRow('Dummy', 1000000, 1);
  dummy.MoveSpeed = 0;
  d.enemies.push(dummy);
  const stub = StubRow('Stub', 250, 2);
  stub.MoveSpeed = 280;
  d.enemies.push(stub);
  return d;
})();

const U = (s: CombatSim, id: UnitId) => s.getUnit(id)!;
const M = (s: CombatSim, id: UnitId) => s.mutableUnit(id)!;
const Dist = (a: Unit, b: Unit) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const LiveSpirits = (s: CombatSim) => s.getUnits().filter((u) => u.summon && u.alive).map((u) => u.id);
const CountSpiritsEver = (s: CombatSim) => s.getUnits().filter((u) => u.summon).length;
const WeaponOf = (s: CombatSim, owner: UnitId) => s.getUnits().find((u) => u.summon && u.weapon && u.alive && u.owner === owner)?.id ?? kNoUnit;
const GreaterOf = (s: CombatSim, owner: UnitId) => s.getUnits().find((u) => u.summon && u.greater && u.alive && u.owner === owner)?.id ?? kNoUnit;
const CountGreaterEver = (s: CombatSim) => s.getUnits().filter((u) => u.summon && u.greater).length;
const bolt = DamageTag.Summon | DamageTag.Auto;

/** A frozen duel: Summoner at the origin, Dummy 600 away (inside Range 800, outside melee), fight started. */
class Duel {
  sim: CombatSim;
  su: UnitId;
  dummy: UnitId;
  constructor(seed = 1) {
    this.sim = new CombatSim(td, seed);
    this.su = this.sim.addPartyUnit('Summoner');
    this.dummy = this.sim.addEnemy('Dummy', 1);
    Place(this.sim, this.su, 0, 0);
    Place(this.sim, this.dummy, 600, 0);
    Freeze(this.sim, this.su);
    Freeze(this.sim, this.dummy);
    this.sim.startFight();
  }
}

describe('units: Summoner base stats and data', () => {
  it('BaseStatsComeFromClassDataRow', () => {
    const row = Cls('Summoner');
    CHECK(row.RoleTag === 'Support');
    CHECK(row.AutoActionId === 'RangedBolt');
    CHECK(row.AbilityId === 'GreaterSpirit');
    CHECK(row.ExtraAbilityIds.length === 0);
    const s = new CombatSim(data, 1);
    const u = U(s, s.addPartyUnit('Summoner'));
    CHECK(u && !u.enemy && !u.summon && u.alive);
    NEAR(s.maxHp(u), row.BaseStats.HP, 1e-9);
    NEAR(u.hp, row.BaseStats.HP, 1e-9);
    NEAR(u.stats.get(StatId.Damage), row.BaseStats.Damage, 1e-9);
    NEAR(u.stats.get(StatId.AttackSpeed), row.BaseStats.AttackPerSec, 1e-9);
    NEAR(u.stats.get(StatId.DefensePercent), row.BaseStats.DefensePct, 1e-9);
    NEAR(u.stats.get(StatId.Threat), row.BaseThreat, 1e-9);
    NEAR(u.stats.get(StatId.Range), row.AttackRange, 1e-9);
    NEAR(u.moveSpeed, row.MoveSpeed, 1e-9);
    NEAR(u.prefMin, row.PreferredDistMin, 1e-9);
    NEAR(u.prefMax, row.PreferredDistMax, 1e-9);
    NEAR(u.retreat, row.RetreatDistance, 1e-9);
    NEAR(u.threatMult, row.ThreatMultiplier, 1e-9);
    CHECK(u.abilityId === 'GreaterSpirit' && u.extraAbilities.length === 0);
    CHECK(u.hasWeaponSpirit);
    CHECK(u.behavior === Behavior.Caster);
    CHECK(!u.healer);
    CHECK(u.trigger === 'OnCooldown');
    CHECK(u.targetTypes.length === 1 && u.targetTypes[0] === 'Closest');
    NEAR(u.stats.get(StatId.SpiritDamage), 0, 1e-12);
    NEAR(u.stats.get(StatId.SpiritDuration), 0, 1e-12);
    const m = new CombatSim(data, 1);
    CHECK(!U(m, m.addPartyUnit('Mage')).hasWeaponSpirit);
  });
  it('DataMatchesDocNumbers', () => {
    const r = Cls('Summoner');
    NEAR(r.BaseStats.HP, 90, 1e-6);
    NEAR(r.BaseStats.Damage, 8, 1e-6);
    NEAR(r.BaseStats.AttackPerSec, 0.9, 1e-6);
    NEAR(r.BaseStats.DefensePct, 0, 1e-6);
    NEAR(r.MoveSpeed, 270, 1e-6);
    NEAR(r.AttackRange, 800, 1e-6);
    NEAR(r.PreferredDistMin, 450, 1e-6);
    NEAR(r.PreferredDistMax, 700, 1e-6);
    NEAR(r.RetreatDistance, 350, 1e-6);
    const ab = data.findAbility('GreaterSpirit');
    CHECK(ab && ab.Cooldown === 30 && ab.EffectIds.length === 1);
    const e = data.findEffect('GreaterSpirit_1');
    CHECK(e && e.Type === 'SpawnSummon' && e.AbilityId === 'GreaterSpirit' && e.Stat === 'Greater');
    CHECK(data.findAbility('SummonSpirit') !== undefined);
    for (const c of data.classes) {
      CHECK(c.AbilityId !== 'SummonSpirit', c.Name);
      for (const x of c.ExtraAbilityIds) CHECK(x !== 'SummonSpirit', c.Name);
    }
    CHECK(r.RetreatDistance < Cls('Priest').RetreatDistance);
    CHECK(r.MoveSpeed < Cls('Warrior').MoveSpeed);
    CHECK(r.AllowedStats.includes('SpiritDamage') && r.AllowedStats.includes('SpiritDuration'));
    CHECK(r.AllowedStats.length === 15 && r.AllowedStats.includes('HealPower'));   // Heal Power joined Nov 22 (a healer stat)
    CHECK(r.AllowedTargetTypes.length > 0);
  });
});

describe('units: Summoner weapon spirit', () => {
  it('WeaponSpiritExistsFromFightStartWithNoCooldownOrDuration', () => {
    const s = new CombatSim(td, 1);
    const su = s.addPartyUnit('Summoner');
    s.addEnemy('Dummy', 1);
    CHECK(WeaponOf(s, su) === kNoUnit);
    let casts = 0;
    s.getBus().subscribe('AbilityCast', () => { ++casts; });
    s.startFight();
    const sp = WeaponOf(s, su);
    CHECK(sp !== kNoUnit);
    const w = U(s, sp);
    CHECK(w.summon && !w.enemy && !w.greater && w.alive && w.name === 'Spirit' && w.owner === su);
    CHECK(w.abilityId === '' && w.extraAbilities.length === 0);
    CHECK(w.lifeLeft > 1.0e9);
    NEAR(s.maxHp(w), s.config().spiritHp, 1e-9);
    CHECK(casts === 0);
    StepSeconds(s, 20);
    CHECK(U(s, sp).alive);
    CHECK(WeaponOf(s, su) === sp);
    CHECK(casts === 0);
    CHECK(s.getLog().toText().includes('Spirit#'));
  });
  it('SummonerNeverAttacksItselfOnlyTheSpiritsBoltDamages', () => {
    const d = new Duel();
    const sp = WeaponOf(d.sim, d.su);
    let fromSummoner = 0, fromSpirit = 0, attacksBySummoner = 0, attacksBySpirit = 0, tagsOk = true;
    d.sim.getBus().subscribe('DamageDealt', (e) => {
      if (e.source === d.su) ++fromSummoner;
      if (e.source === sp) {
        ++fromSpirit;
        if (!(e.tags & DamageTag.Auto) || !(e.tags & DamageTag.Summon) || e.tags & DamageTag.Ability) tagsOk = false;
      }
    });
    d.sim.getBus().subscribe('AttackStarted', (e) => {
      if (e.attacker === d.su) ++attacksBySummoner;
      if (e.attacker === sp) ++attacksBySpirit;
    });
    StepSeconds(d.sim, 10);
    CHECK(fromSummoner === 0 && attacksBySummoner === 0);
    CHECK(fromSpirit > 0 && attacksBySpirit === fromSpirit);
    CHECK(tagsOk);
    CHECK(Math.abs(fromSpirit - 10 * Cls('Summoner').BaseStats.AttackPerSec) <= 1);
    CHECK(U(d.sim, d.su).damageDone === 0);
    CHECK(U(d.sim, sp).damageDone > 0);
  });
  it('SpiritBoltDamageIsTheSummonersDamageStatPlusSpiritDamage', () => {
    const d = new Duel();
    const sp = WeaponOf(d.sim, d.su);
    const base = Cls('Summoner').BaseStats.Damage;
    NEAR(U(d.sim, sp).stats.get(StatId.Damage), base, 1e-9);
    M(d.sim, d.su).stats.addModifier(StatId.Damage, ModKind.Percent, 0.5, ModSource.GoldUpgrade);
    d.sim.step();
    NEAR(U(d.sim, sp).stats.get(StatId.Damage), base * 1.5, 1e-9);
    NEAR(d.sim.dealDamage(sp, d.dummy, 1.0, bolt), base * 1.5, 1e-9);
    M(d.sim, d.su).stats.addModifier(StatId.SpiritDamage, ModKind.Flat, 12, ModSource.GoldUpgrade);
    d.sim.step();
    NEAR(U(d.sim, sp).stats.get(StatId.Damage), base * 1.5 + 12, 1e-9);
    NEAR(d.sim.dealDamage(sp, d.dummy, 1.0, bolt), base * 1.5 + 12, 1e-9);
    NEAR(U(d.sim, d.su).stats.get(StatId.Damage), base * 1.5, 1e-9);
  });
  it('SpiritBoltUsesSummonersAttackSpeedCritAndRange', () => {
    {
      const d = new Duel();
      M(d.sim, d.su).stats.addModifier(StatId.AttackSpeed, ModKind.Percent, 1.0, ModSource.GoldUpgrade);
      let hits = 0;
      d.sim.getBus().subscribe('DamageDealt', (e) => { if (U(d.sim, e.source).summon) ++hits; });
      StepSeconds(d.sim, 10);
      CHECK(Math.abs(hits - 10 * Cls('Summoner').BaseStats.AttackPerSec * 2) <= 1.5);
    }
    {
      const d = new Duel();
      M(d.sim, d.su).stats.addModifier(StatId.CritChance, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
      d.sim.step();
      const sp = WeaponOf(d.sim, d.su);
      const crit = U(d.sim, d.su).stats.get(StatId.CritFactor);
      NEAR(d.sim.dealDamage(sp, d.dummy, 1.0, bolt), Cls('Summoner').BaseStats.Damage * crit, 1e-9);
    }
    for (const upgraded of [false, true]) {
      const s = new CombatSim(td, 1);
      const su = s.addPartyUnit('Summoner');
      const d = s.addEnemy('Dummy', 1);
      const range = Cls('Summoner').AttackRange;
      Place(s, su, 0, 0);
      Place(s, d, -(range + 50), 0);
      Freeze(s, su); Freeze(s, d);
      if (upgraded) M(s, su).stats.addModifier(StatId.Range, ModKind.Flat, 300, ModSource.GoldUpgrade);
      let hits = 0;
      s.getBus().subscribe('DamageDealt', (e) => { if (U(s, e.source).summon) ++hits; });
      s.startFight();
      StepSeconds(s, 5);
      if (upgraded) CHECK(hits > 0, 'upgraded'); else CHECK(hits === 0, 'base range');
    }
  });
  it('SpiritStandsAtAFixedOffsetFromItsMovingSummoner', () => {
    const s = new CombatSim(td, 1);
    const su = s.addPartyUnit('Summoner');
    const d = s.addEnemy('Dummy', 1);
    Place(s, su, -1100, 0);
    Place(s, d, 400, 0);
    Freeze(s, d);
    s.startFight();
    const sp = WeaponOf(s, su);
    let offsetOk = true, moving = 0;
    for (let i = 0; i < 150; ++i) {
      s.step();
      const o = U(s, su), w = U(s, sp);
      if (Math.abs(w.x - (o.x + s.config().spiritSpawnOffset)) > 1e-6 || Math.abs(w.y - o.y) > 1e-6) offsetOk = false;
      if (w.moveSpeed !== 0) ++moving;
    }
    CHECK(offsetOk);
    CHECK(moving === 0);
    CHECK(Math.abs(U(s, su).x + 1100) > 100);
  });
  it('SpiritThreatIsFullForWeaponSpiritAndHalfForGreater', () => {
    const d = new Duel();
    M(d.sim, d.su).stats.addModifier(StatId.Threat, ModKind.Flat, 1.0, ModSource.GoldUpgrade);
    d.sim.step();
    const sp = WeaponOf(d.sim, d.su);
    const mult = 2.0 * Cls('Summoner').ThreatMultiplier;
    const before = U(d.sim, d.su).threatGenerated;
    const dmg = d.sim.dealDamage(sp, d.dummy, 1.0, bolt);
    NEAR(d.sim.threatOn(d.dummy, d.su), dmg * mult, 1e-9);
    NEAR(U(d.sim, d.su).threatGenerated - before, dmg * mult, 1e-9);
    NEAR(d.sim.threatOn(d.dummy, sp), 0, 1e-12);
    d.sim.forceCastAbility(d.su);
    const gr = GreaterOf(d.sim, d.su);
    CHECK(gr !== kNoUnit);
    const t0 = d.sim.threatOn(d.dummy, d.su);
    const gd = d.sim.dealDamage(gr, d.dummy, 1.0, bolt);
    NEAR(d.sim.threatOn(d.dummy, d.su) - t0, gd * mult * d.sim.config().summonThreatShare, 1e-9);
    NEAR(d.sim.config().summonThreatShare, 0.5, 1e-12);
  });
  it('SpiritThreatInRealFightGrowsOwnerTableOnly', () => {
    const d = new Duel();
    StepSeconds(d.sim, 8);
    const sp = WeaponOf(d.sim, d.su);
    const spirit = U(d.sim, sp);
    CHECK(spirit.damageDone > 0);
    NEAR(d.sim.threatOn(d.dummy, sp), 0, 1e-12);
    NEAR(d.sim.threatOn(d.dummy, d.su), spirit.damageDone * Cls('Summoner').BaseThreat * Cls('Summoner').ThreatMultiplier, 1e-6);
  });
  it('EnemiesNeverTargetTheSpiritWhilePartyLives', () => {
    const s = new CombatSim(td, 1);
    const su = s.addPartyUnit('Summoner');
    const w = s.addPartyUnit('Warrior');
    const st = s.addEnemy('Stub', 1);
    Place(s, su, -900, 0); Place(s, w, -900, 500); Place(s, st, 0, 0);
    Freeze(s, su); Freeze(s, w);
    s.startFight();
    const sp = WeaponOf(s, su);
    Place(s, sp, 100, 0);
    StepSeconds(s, 3);
    CHECK(U(s, st).target === su || U(s, st).target === w);
    NEAR(U(s, sp).hp, s.maxHp(U(s, sp)), 1e-9);
    s.dealDamage(w, su, 1e4, DamageTag.Auto);
    CHECK(!U(s, su).alive);
    CHECK(!U(s, sp).alive);
    StepSeconds(s, 2);
    CHECK(U(s, st).target === w);
  });
  it('SpiritVanishesWithTheSummonerQuietly', () => {
    const s = new CombatSim(td, 1);
    const su = s.addPartyUnit('Summoner');
    const w = s.addPartyUnit('Warrior');
    const d = s.addEnemy('Dummy', 1);
    Place(s, su, 0, 0); Place(s, w, 0, 400); Place(s, d, 600, 0);
    Freeze(s, su); Freeze(s, w); Freeze(s, d);
    s.startFight();
    const sp = WeaponOf(s, su);
    s.forceCastAbility(su);
    const gr = GreaterOf(s, su);
    let died = 0, enemyKilled = 0;
    s.getBus().subscribe('UnitDied', (e) => { if (e.unit === sp || e.unit === gr) ++died; });
    s.getBus().subscribe('EnemyKilled', () => { ++enemyKilled; });
    s.dealDamage(w, su, 1e4, DamageTag.Auto);
    CHECK(!U(s, su).alive);
    CHECK(s.getFirstDeath().valid && s.getFirstDeath().victim === su);
    CHECK(!U(s, sp).alive && U(s, sp).removed);
    CHECK(!U(s, gr).alive && U(s, gr).removed);
    CHECK(s.getLog().toText().includes('vanishes (its Summoner died)'));
    CHECK(died === 0 && enemyKilled === 0);
    StepSeconds(s, 3);
    CHECK(s.getState() === FightState.Running);
    CHECK(U(s, sp).damageDone === 0);
  });
  it('SummonerAloneWipesWithItsSpiritAndSpiritDeathIsQuiet', () => {
    {
      const d = new Duel();
      const sp = WeaponOf(d.sim, d.su);
      d.sim.dealDamage(d.dummy, d.su, 1e4, DamageTag.Auto);
      CHECK(!U(d.sim, sp).alive);
      d.sim.step();
      CHECK(d.sim.getState() === FightState.Wiped);
      CHECK(U(d.sim, sp).removed);
      CHECK(d.sim.getFirstDeath().victim === d.su);
    }
    {
      const d = new Duel();
      const sp = WeaponOf(d.sim, d.su);
      let partyDied = 0, enemyKilled = 0;
      d.sim.getBus().subscribe('UnitDied', (e) => { if (e.unit === sp) ++partyDied; });
      d.sim.getBus().subscribe('EnemyKilled', () => { ++enemyKilled; });
      const hp = U(d.sim, d.su).hp;
      d.sim.dealDamage(d.dummy, sp, 1e4, DamageTag.Auto);
      CHECK(!U(d.sim, sp).alive);
      CHECK(partyDied === 0 && enemyKilled === 0 && !d.sim.getFirstDeath().valid);
      NEAR(U(d.sim, d.su).hp, hp, 1e-12);
      StepSeconds(d.sim, 1);
      CHECK(d.sim.getState() === FightState.Running && U(d.sim, d.su).alive);
    }
    {
      const d = new Duel();
      const sp = WeaponOf(d.sim, d.su);
      d.sim.dealDamage(d.su, d.dummy, 1e9, DamageTag.Auto);
      d.sim.step();
      CHECK(d.sim.getState() === FightState.Won);
      CHECK(LiveSpirits(d.sim).length === 0);
      CHECK(U(d.sim, sp).removed);
    }
  });
  it('SpiritIsNotRevivedByRestRoomOrPostWinRevive', () => {
    const s = new CombatSim(td, 1);
    const su = s.addPartyUnit('Summoner');
    const pr = s.addPartyUnit('Priest');
    const d = s.addEnemy('Dummy', 1);
    Place(s, su, 0, 0); Place(s, pr, 0, 300); Place(s, d, 600, 0);
    Freeze(s, su); Freeze(s, pr); Freeze(s, d);
    s.startFight();
    const sp = WeaponOf(s, su);
    s.dealDamage(d, sp, 1e4, DamageTag.Auto);
    s.dealDamage(su, d, 1e9, DamageTag.Ability);
    s.step();
    CHECK(s.getState() === FightState.Won);
    CHECK(s.postWinRevive() === 0);
    CHECK(!U(s, sp).alive);
    s.restRoom();
    CHECK(!U(s, sp).alive);
  });
});

describe('units: Summoner lifecycle between fights', () => {
  it('WeaponSpiritRespawnsForTheNextFightAndStatsCarryOver', () => {
    const s = new CombatSim(td, 1);
    const su = s.addPartyUnit('Summoner');
    const d = s.addEnemy('Dummy', 1);
    Place(s, su, 0, 0); Place(s, d, 600, 0);
    Freeze(s, su); Freeze(s, d);
    M(s, su).stats.addModifier(StatId.SpiritDamage, ModKind.Flat, 9, ModSource.GoldUpgrade);
    s.startFight();
    StepSeconds(s, 2);
    CHECK(LiveSpirits(s).length === 1);
    s.dealDamage(su, d, 1e9, DamageTag.Ability);
    s.step();
    CHECK(s.getState() === FightState.Won);
    CHECK(LiveSpirits(s).length === 0);
    s.prepareNextFight();
    CHECK(s.getUnits().length === 1);
    CHECK(CountSpiritsEver(s) === 0);
    CHECK(s.getUnit(su) && U(s, su).alive && U(s, su).id === 0);
    NEAR(U(s, su).abilityTimer, 0, 1e-12);
    CHECK(!s.getLog().toText().includes('Spirit'));
    const d2 = s.addEnemy('Dummy', 1);
    Place(s, su, 0, 0); Place(s, d2, 600, 0);
    Freeze(s, su); Freeze(s, d2);
    s.startFight();
    CHECK(LiveSpirits(s).length === 1 && CountSpiritsEver(s) === 1);
    const sp = WeaponOf(s, su);
    CHECK(sp !== kNoUnit);
    StepSeconds(s, 1);
    NEAR(U(s, sp).stats.get(StatId.Damage), Cls('Summoner').BaseStats.Damage + 9, 1e-9);
    NEAR(U(s, sp).hp, s.config().spiritHp, 1e-9);
  });
  it('PrepareNextFightAfterWipeAlsoClearsSpirits', () => {
    const d = new Duel();
    d.sim.dealDamage(d.dummy, d.su, 1e4, DamageTag.Auto);
    d.sim.step();
    CHECK(d.sim.getState() === FightState.Wiped);
    d.sim.prepareNextFight();
    CHECK(CountSpiritsEver(d.sim) === 0);
    CHECK(d.sim.getUnits().length === 1);
  });
  it('NoSpiritGrowthOver60Fights', () => {
    const s = new CombatSim(td, 3);
    s.addPartyUnit('Summoner');
    s.addPartyUnit('Priest');
    let bad = 0;
    for (let fight = 0; fight < 60; ++fight) {
      s.addEnemy('Stub', 1);
      s.addEnemy('Stub', 1);
      s.startFight();
      if (LiveSpirits(s).length !== 1) ++bad;
      if (s.getUnits().length !== 5) ++bad;
      s.runToEnd();
      if (s.getState() !== FightState.Won) ++bad;
      if (LiveSpirits(s).length !== 0) ++bad;
      s.postWinRevive();
      s.prepareNextFight();
      if (s.getUnits().length !== 2) ++bad;
      if (CountSpiritsEver(s) !== 0) ++bad;
    }
    CHECK(bad === 0);
  });
});

describe('units: Summoner Greater Spirit', () => {
  it('GreaterSpiritCastsOnItsDataCooldownAndRepeats', () => {
    const d = new Duel();
    const cd = data.findAbility('GreaterSpirit')!.Cooldown;
    let casts = 0;
    d.sim.getBus().subscribe('AbilityCast', (e) => { if (e.caster === d.su && e.abilityId === 'GreaterSpirit') ++casts; });
    const cdTicks = llround(cd / d.sim.config().dt);
    StepTicks(d.sim, cdTicks - 2);
    CHECK(casts === 0 && GreaterOf(d.sim, d.su) === kNoUnit);
    StepTicks(d.sim, 4);
    CHECK(casts === 1 && GreaterOf(d.sim, d.su) !== kNoUnit);
    StepTicks(d.sim, cdTicks);
    CHECK(casts === 2);
    CHECK(d.sim.getLog().toText().includes('casts GreaterSpirit'));
    CHECK(!d.sim.forceCastAbility(d.su, 'SummonSpirit'));
  });
  it('GreaterSpiritTriggerModesGateTheCast', () => {
    const wait = data.findAbility('GreaterSpirit')!.Cooldown + 1;
    {
      const d = new Duel();
      M(d.sim, d.su).trigger = 'SaveForBossOrElite';
      StepSeconds(d.sim, wait);
      CHECK(CountGreaterEver(d.sim) === 0);
    }
    {
      const d = new Duel();
      M(d.sim, d.su).trigger = 'PackIsLarge';
      StepSeconds(d.sim, wait);
      CHECK(CountGreaterEver(d.sim) === 0);
      const e2 = d.sim.addEnemy('Dummy', 1);
      const e3 = d.sim.addEnemy('Dummy', 1);
      Freeze(d.sim, e2); Freeze(d.sim, e3);
      StepSeconds(d.sim, 1);
      CHECK(CountGreaterEver(d.sim) === 1);
    }
    {
      const d = new Duel();
      M(d.sim, d.su).trigger = 'AllyIsLow';
      StepSeconds(d.sim, wait);
      CHECK(CountGreaterEver(d.sim) === 0);
      M(d.sim, d.su).hp = 0.3 * d.sim.maxHp(U(d.sim, d.su));
      StepSeconds(d.sim, 1);
      CHECK(CountGreaterEver(d.sim) === 1);
    }
  });
  it('AtMostOneWeaponAndOneGreaterSpiritAndRecastReplacesOnlyTheGreater', () => {
    const d = new Duel();
    const sp = WeaponOf(d.sim, d.su);
    for (let i = 0; i < 3; ++i) d.sim.forceCastAbility(d.su);
    let standard = 0, greater = 0;
    for (const id of LiveSpirits(d.sim)) if (U(d.sim, id).greater) ++greater; else ++standard;
    CHECK(standard === 1 && greater === 1);
    CHECK(LiveSpirits(d.sim).length === 2);
    CHECK(WeaponOf(d.sim, d.su) === sp);
    CHECK(d.sim.getLog().toText().includes('is replaced by a new cast'));
    let died = 0;
    d.sim.getBus().subscribe('UnitDied', () => { ++died; });
    d.sim.forceCastAbility(d.su);
    CHECK(died === 0);
    const old = copyData(td);
    for (const r of old.classes) if (r.Name === 'Summoner') r.AbilityId = 'SummonSpirit';
    const s = new CombatSim(old, 1);
    const su = s.addPartyUnit('Summoner');
    s.addEnemy('Dummy', 1);
    s.startFight();
    const w0 = WeaponOf(s, su);
    s.forceCastAbility(su);
    CHECK(WeaponOf(s, su) === w0 && LiveSpirits(s).length === 1);
  });
  it('GreaterSpiritStatsDurationAndSpiritStatRules', () => {
    const d = new Duel();
    M(d.sim, d.su).stats.addModifier(StatId.SpiritDuration, ModKind.Flat, 5, ModSource.GoldUpgrade);
    M(d.sim, d.su).stats.addModifier(StatId.SpiritDamage, ModKind.Flat, 12, ModSource.GoldUpgrade);
    d.sim.forceCastAbility(d.su);
    const sp = WeaponOf(d.sim, d.su);
    const gr = GreaterOf(d.sim, d.su);
    const c = d.sim.config();
    CHECK(c.greaterSpiritHp > c.spiritHp && c.greaterSpiritDamage > c.spiritDamage);
    NEAR(d.sim.maxHp(U(d.sim, gr)), c.greaterSpiritHp, 1e-9);
    NEAR(U(d.sim, gr).lifeLeft, EffectDuration('GreaterSpirit_1') + 5, 1e-9);
    CHECK(U(d.sim, sp).lifeLeft > 1.0e9);
    NEAR(U(d.sim, gr).stats.get(StatId.Damage), c.greaterSpiritDamage + 12, 1e-9);
    d.sim.step();
    NEAR(U(d.sim, sp).stats.get(StatId.Damage), Cls('Summoner').BaseStats.Damage + 12, 1e-9);
    StepSeconds(d.sim, EffectDuration('GreaterSpirit_1') + 5 - 1);
    CHECK(U(d.sim, gr).alive);
    StepSeconds(d.sim, 2);
    CHECK(!U(d.sim, gr).alive && U(d.sim, gr).removed);
    CHECK(U(d.sim, sp).alive);
    CHECK(d.sim.getLog().toText().includes('fades away'));
    CHECK(d.sim.getState() === FightState.Running && !d.sim.getFirstDeath().valid);
  });
});

describe('units: Summoner positioning', () => {
  it('ApproachesIntoBandAtMoveSpeedAndTheSpiritBoltsOnlyInRange', () => {
    const s = new CombatSim(td, 1);
    const su = s.addPartyUnit('Summoner');
    const d = s.addEnemy('Dummy', 1);
    Place(s, su, -1100, 0);
    Place(s, d, 400, 0);
    Freeze(s, d);
    const range = Cls('Summoner').AttackRange;
    let inRangeOnHit = true, hits = 0;
    s.startFight();
    const sp = WeaponOf(s, su);
    s.getBus().subscribe('DamageDealt', (e) => {
      if (e.source !== sp) return;
      ++hits;
      if (Dist(U(s, sp), U(s, d)) > range + 1e-6) inRangeOnHit = false;
    });
    const x0 = U(s, su).x;
    StepSeconds(s, 1);
    NEAR(Math.abs(U(s, su).x - x0), Cls('Summoner').MoveSpeed, 1.0);
    CHECK(hits === 0);
    StepSeconds(s, 6);
    const dist = Dist(U(s, su), U(s, d));
    CHECK(dist >= Cls('Summoner').PreferredDistMin && dist <= Cls('Summoner').PreferredDistMax);
    CHECK(dist <= range);
    CHECK(hits > 0 && inRangeOnHit);
  });
  it('RetreatsFromEnemyInsideRetreatDistanceAndHoldsOutsideIt', () => {
    const retreat = Cls('Summoner').RetreatDistance;
    {
      const s = new CombatSim(td, 1);
      const su = s.addPartyUnit('Summoner');
      const d = s.addEnemy('Dummy', 1);
      Place(s, su, -300, 0); Place(s, d, 0, 0);
      Freeze(s, d);
      s.startFight();
      StepSeconds(s, 4);
      const dist = Dist(U(s, su), U(s, d));
      CHECK(dist > retreat);
      CHECK(dist >= Cls('Summoner').PreferredDistMin - 1);
    }
    {
      const s = new CombatSim(td, 1);
      const su = s.addPartyUnit('Summoner');
      const d = s.addEnemy('Dummy', 1);
      Place(s, su, -400, 0); Place(s, d, 0, 0);
      Freeze(s, d);
      s.startFight();
      StepSeconds(s, 3);
      NEAR(U(s, su).x, -400, 1e-6);
      NEAR(U(s, su).y, 0, 1e-6);
    }
  });
  it('RetreatCostsAttacksBecauseItIsSlowerThanAChasingGrunt', () => {
    CHECK(Cls('Summoner').MoveSpeed < Enemy('Grunt').MoveSpeed);
    const s = new CombatSim(data, 1);
    const su = s.addPartyUnit('Summoner');
    const g = s.addEnemy('Grunt', 1);
    Place(s, su, -200, 0); Place(s, g, 0, 0);
    s.startFight();
    StepSeconds(s, 8);
    CHECK(Dist(U(s, su), U(s, g)) < Cls('Summoner').RetreatDistance + 100);
  });
  it('StaysInsideTheArenaAndSoDoesItsSpirit', () => {
    const s = new CombatSim(td, 1);
    s.addPartyUnit('Summoner');
    const d = s.addEnemy('Stub', 1);
    Place(s, 0, -1190, 0);
    Place(s, d, -1100, 0);
    s.startFight();
    let inside = true;
    for (let i = 0; i < 300 && s.getState() === FightState.Running; ++i) {
      s.step();
      for (const u of s.getUnits()) {
        if (!u.alive) continue;
        if (Math.abs(u.x) > s.config().arenaW * 0.5 + 1e-6 || Math.abs(u.y) > s.config().arenaH * 0.5 + 1e-6) inside = false;
      }
    }
    CHECK(inside);
  });
});

describe('units: Summoner fights', () => {
  const stubFight = (seed: number) => {
    const s = new CombatSim(td, seed);
    const su = s.addPartyUnit('Summoner');
    s.addEnemy('Stub', 1);
    let spiritHits = 0, summonerHits = 0;
    s.getBus().subscribe('DamageDealt', (e) => {
      const src = s.getUnit(e.source);
      if (src && src.summon && src.owner === su) ++spiritHits;
      if (e.source === su) ++summonerHits;
    });
    s.startFight();
    const result = s.runToEnd();
    const leak = s.getUnits().some((u) => u.summon && u.alive);
    return { log: s.getLog().toText(), result, spiritHits, summonerHits, leak };
  };
  it('LoneSummonerWinsThroughItsSpiritAndLogsAreIdenticalRunToRun', () => {
    for (const seed of [1, 2, 77]) {
      const a = stubFight(seed);
      const b = stubFight(seed);
      CHECK(a.log !== '');
      CHECK(a.log === b.log);
      CHECK(a.result === FightState.Won && b.result === FightState.Won);
      CHECK(a.spiritHits === b.spiritHits && a.spiritHits > 0);
      CHECK(a.summonerHits === 0 && b.summonerHits === 0);
      CHECK(!a.leak && !b.leak);
      CHECK(a.log.includes('Spirit#'));
      CHECK(!a.log.includes('casts SummonSpirit'));
    }
    const party = ['Warrior', 'Summoner', 'Priest'];
    const g3 = ['Grunt', 'Grunt', 'Grunt'];
    CHECK(runFightHeadless(data, 9, party, g3).logText === runFightHeadless(data, 9, party, g3).logText);
  });
});
