// Port of tests/combat/tests.cpp, part 3 (random placement, Miracle Gauge and miracles, cast times, tank target rules).
import { describe, it } from 'vitest';
import { installShippedCastTimes } from './castTimes';
import { CastKind, CombatSim, FightState, defaultCombatConfig, kHealBase } from './combatSim';
import { DamageTag, kNoUnit, type UnitId } from './eventBus';
import { MiracleGauge, MiracleKind, MiracleResult, defaultMiracleConfig } from './miracleGauge';
import { CHECK, EffectValue, Freeze, NEAR, Place, data } from './combatTestKit';

const H = (x: number, y: number): number => Math.sqrt(x * x + y * y);

describe('combat: random enemy placement', () => {
  it('RandomEnemyPlacementKeepsAwayFromTheRallyPointAndEachOther', () => {
    const c = defaultCombatConfig();
    c.randomEnemySpawn = true;
    for (let door = -1; door < 4; ++door) {
      let n = 0;
      let ok = true;
      for (let seed = 1; seed <= 150; ++seed) {
        const s = new CombatSim(data, seed, c);
        s.setPartyEntry(door);
        s.addPartyUnit('Warrior');
        for (let i = 0; i < 5; ++i) s.addEnemy(i === 4 ? 'Archer' : 'Grunt', 1);
        s.addEnemy('Grunt', 1, true);
        const r = s.partyRallyPoint();
        const e = s.getUnits().filter((u) => u.enemy);
        CHECK(e.length === 6);
        for (let i = 0; i < e.length; ++i) {
          if (Math.abs(e[i].x) > c.arenaW * 0.5 - c.enemyEdgeMargin + 1e-9) ok = false;
          if (Math.abs(e[i].y) > c.arenaH * 0.5 - c.enemyEdgeMargin + 1e-9) ok = false;
          if (H(e[i].x - r.x, e[i].y - r.y) < c.enemyMinRallyDistance - 1e-9) ok = false;
          for (let j = 0; j < i; ++j) if (H(e[i].x - e[j].x, e[i].y - e[j].y) < c.enemyMinSpacing - 1e-9) ok = false;
          ++n;
        }
      }
      CHECK(ok, `door ${door}`);
      const a = new CombatSim(data, 1, c);
      const b = new CombatSim(data, 2, c);
      a.setPartyEntry(door); b.setPartyEntry(door);
      a.addEnemy('Grunt', 1); b.addEnemy('Grunt', 1);
      CHECK(a.getUnit(0)!.x !== b.getUnit(0)!.x || a.getUnit(0)!.y !== b.getUnit(0)!.y);
      CHECK(n === 150 * 6);
    }
  });
  it('RandomEnemyPlacementIsReproducibleAndPerFight', () => {
    const c = defaultCombatConfig();
    c.randomEnemySpawn = true;
    const positions = (seed: number, fights: number): number[] => {
      const out: number[] = [];
      const s = new CombatSim(data, seed, c);
      s.setPartyEntry(3);
      s.addPartyUnit('Warrior');
      for (let f = 0; f < fights; ++f) {
        if (f > 0) s.prepareNextFight();
        s.addEnemy('Grunt', 1);
        s.addEnemy('Grunt', 1);
        for (const u of s.getUnits()) if (u.enemy && !u.removed) out.push(u.x, u.y);
      }
      return out;
    };
    CHECK(JSON.stringify(positions(7, 3)) === JSON.stringify(positions(7, 3)));
    CHECK(JSON.stringify(positions(7, 3)) !== JSON.stringify(positions(8, 3)));
    const p = positions(7, 2);
    CHECK(p.length === 8);
    CHECK(p[0] !== p[4] || p[1] !== p[5]);
    const x = new CombatSim(data, 3);
    const y = new CombatSim(data, 3);
    x.addPartyUnit('Warrior'); y.addPartyUnit('Warrior');
    x.addEnemy('Grunt', 1); y.addEnemy('Grunt', 1);
    x.runToEnd(); y.runToEnd();
    CHECK(x.getTime() === y.getTime());
  });
});

describe('combat: Miracle Gauge and miracles', () => {
  it('MiracleGaugeFillsCapsSpendsAndResets', () => {
    const c = defaultMiracleConfig();
    const g = new MiracleGauge(c);
    NEAR(g.value(), 0, 1e-9);
    CHECK(!g.canAfford(MiracleKind.DivineShield) && !g.spend(MiracleKind.DivineShield));
    for (let i = 0; i < 200; ++i) g.addHit();
    NEAR(g.value(), 200 * c.fillPerHit, 1e-9);
    CHECK(g.canAfford(MiracleKind.DivineShield) && !g.canAfford(MiracleKind.DivineHealing));
    CHECK(g.spend(MiracleKind.DivineShield));
    NEAR(g.value(), 200 * c.fillPerHit - c.shieldCost, 1e-9);
    for (let i = 0; i < 500; ++i) g.addHit();
    NEAR(g.value(), c.capacity, 1e-9);
    NEAR(g.fraction(), 1, 1e-9);
    g.reset();
    NEAR(g.value(), 0, 1e-9);
  });
  it('MiracleGaugeFillsOnlyFromPartyActions', () => {
    const sim = new CombatSim(data, 11);
    const w = sim.addPartyUnit('Warrior');
    sim.addPartyUnit('Mage');
    const g = sim.addEnemy('Grunt', 1);
    sim.startFight();
    NEAR(sim.getGauge().value(), 0, 1e-9);
    sim.dealDamage(w, g, 0.1, DamageTag.None);
    NEAR(sim.getGauge().value(), sim.config().miracle.fillPerHit, 1e-9);
    const before = sim.getGauge().value();
    sim.dealDamage(g, w, 0.1, DamageTag.None);
    NEAR(sim.getGauge().value(), before, 1e-9);
    sim.mutableUnit(w)!.hp = 10;
    sim.applyHeal(w, w, 5);
    NEAR(sim.getGauge().value(), before + sim.config().miracle.fillPerHeal, 1e-9);
    NEAR(sim.config().miracle.fillPerHeal, 0, 1e-12);
  });
  it('DivineSmiteHitsAnEnemyForAShareOfItsMaxHp', () => {
    const sim = new CombatSim(data, 15);
    const w = sim.addPartyUnit('Warrior');
    const g = sim.addEnemy('Grunt', 1);
    sim.startFight();
    sim.mutableGauge().add(100);
    CHECK(sim.castMiracle(MiracleKind.DivineSmite, w) === MiracleResult.NoTarget);
    CHECK(sim.castMiracle(MiracleKind.DivineHealing, g) === MiracleResult.NoTarget);
    NEAR(sim.getGauge().value(), 100, 1e-9);
    const maxHp = sim.maxHp(sim.getUnit(g)!);
    const on = { id: kNoUnit as UnitId };
    CHECK(sim.castMiracle(MiracleKind.DivineSmite, g, on) === MiracleResult.Cast);
    CHECK(on.id === g);
    NEAR(sim.getUnit(g)!.hp, maxHp * (1 - sim.config().miracle.smiteFractionOfMax), 1e-6);
    NEAR(sim.getGauge().value(), 100 - sim.config().miracle.smiteCost, 1e-9);
    sim.mutableUnit(g)!.hp = 1;
    sim.mutableGauge().add(100);
    CHECK(sim.castMiracle(MiracleKind.DivineSmite, g) === MiracleResult.Cast);
    CHECK(!sim.getUnit(g)!.alive);
  });
  it('DivineSmiteGroundAreaHitsOnlyEnemiesInsideTheRing', () => {
    const sim = new CombatSim(data, 16);
    sim.addPartyUnit('Warrior');
    const g1 = sim.addEnemy('Grunt', 1);
    const g2 = sim.addEnemy('Grunt', 1);
    sim.startFight();
    sim.mutableGauge().add(100);
    const x1 = sim.getUnit(g1)!.x, y1 = sim.getUnit(g1)!.y;
    const none: UnitId[] = [];
    CHECK(sim.castSmiteAt(x1 + 1e6, y1, none) === MiracleResult.Cast && none.length === 0);
    NEAR(sim.getGauge().value(), 100 - sim.config().miracle.smiteCost, 1e-9);
    sim.mutableGauge().add(100);
    sim.mutableUnit(g2)!.x = x1 + 10 * sim.config().miracle.smiteRadius;
    sim.mutableUnit(g2)!.y = y1;
    const hit: UnitId[] = [];
    CHECK(sim.castSmiteAt(x1, y1, hit) === MiracleResult.Cast);
    CHECK(hit.length === 1 && hit[0] === g1);
    CHECK(sim.getUnit(g2)!.hp >= sim.maxHp(sim.getUnit(g2)!) - 1e-9);
    sim.mutableUnit(g2)!.x = x1 + 1;
    sim.mutableUnit(g2)!.y = y1;
    sim.mutableGauge().add(100);
    CHECK(sim.castSmiteAt(x1, y1, hit) === MiracleResult.Cast && hit.length === 2);
  });
  it('DivineHealingGoesToTheMostInjuredHeroAndCostsGauge', () => {
    const sim = new CombatSim(data, 12);
    const w = sim.addPartyUnit('Warrior');
    const m = sim.addPartyUnit('Mage');
    sim.addEnemy('Grunt', 1);
    sim.startFight();
    CHECK(sim.castMiracle(MiracleKind.DivineHealing) === MiracleResult.NotEnoughGauge);
    sim.mutableGauge().add(100);
    CHECK(sim.castMiracle(MiracleKind.DivineHealing) === MiracleResult.NoTarget);
    NEAR(sim.getGauge().value(), 100, 1e-9);
    sim.mutableUnit(w)!.hp = 0.5 * sim.maxHp(sim.getUnit(w)!);
    sim.mutableUnit(m)!.hp = 0.2 * sim.maxHp(sim.getUnit(m)!);
    const mageMax = sim.maxHp(sim.getUnit(m)!);
    CHECK(sim.castMiracle(MiracleKind.DivineHealing) === MiracleResult.Cast);
    NEAR(sim.getUnit(m)!.hp, (0.2 + sim.config().miracle.healingFractionOfMax) * mageMax, 1e-6);
    NEAR(sim.getUnit(w)!.hp, 0.5 * sim.maxHp(sim.getUnit(w)!), 1e-6);
    NEAR(sim.getGauge().value(), 100 - sim.config().miracle.healingCost, 1e-9);
    CHECK(sim.castMiracle(MiracleKind.DivineHealing, w) === MiracleResult.Cast);
    sim.mutableGauge().add(100);
    sim.mutableUnit(m)!.hp = sim.maxHp(sim.getUnit(m)!);
    CHECK(sim.castMiracle(MiracleKind.DivineHealing, m) === MiracleResult.NoTarget);
    const v = sim.getGauge().value();
    sim.mutableUnit(w)!.hp = 1;
    CHECK(sim.castMiracle(MiracleKind.DivineHealing) === MiracleResult.Cast);
    NEAR(sim.getGauge().value(), v - sim.config().miracle.healingCost, 1e-9);
  });
  it('DivineShieldBlocksDamageThenExpires', () => {
    const sim = new CombatSim(data, 13);
    const w = sim.addPartyUnit('Warrior');
    sim.addPartyUnit('Mage');
    const g = sim.addEnemy('Grunt', 1);
    sim.startFight();
    sim.mutableGauge().add(100);
    CHECK(sim.castMiracle(MiracleKind.DivineShield, w) === MiracleResult.Cast);
    CHECK(sim.castMiracle(MiracleKind.DivineShield, w) === MiracleResult.NoTarget);
    const hp = sim.getUnit(w)!.hp;
    NEAR(sim.dealDamage(g, w, 1.0, DamageTag.None), 0, 1e-9);
    NEAR(sim.getUnit(w)!.hp, hp, 1e-9);
    const ticks = Math.ceil(sim.config().miracle.shieldSeconds / sim.config().dt) + 2;
    for (let i = 0; i < ticks && sim.getState() === FightState.Running; ++i) sim.step();
    NEAR(sim.getUnit(w)!.shieldLeft, 0, 1e-9);
    CHECK(sim.dealDamage(g, w, 1.0, DamageTag.None) > 0 || sim.getUnit(w)!.hp < hp + 1e-9);
  });
  it('MiraclesRefuseOutsideAFightAndAfterTheGaugeResets', () => {
    const sim = new CombatSim(data, 14);
    sim.addPartyUnit('Warrior');
    sim.addEnemy('Grunt', 1);
    sim.mutableGauge().add(100);
    CHECK(sim.castMiracle(MiracleKind.DivineShield) === MiracleResult.FightNotRunning);
    NEAR(sim.getGauge().value(), 100, 1e-9);
    sim.startFight();
    sim.runToEnd();
    CHECK(sim.castMiracle(MiracleKind.DivineShield) === MiracleResult.FightNotRunning);
  });
});

function stepsToFirstDamageFrom(s: CombatSim, src: UnitId): number {
  let hits = 0;
  s.getBus().subscribe('DamageDealt', (e) => { if (e.source === src) ++hits; });
  s.startFight();
  for (let i = 1; i <= 2000 && s.getState() === FightState.Running; ++i) {
    s.step();
    if (hits > 0) return i;
  }
  return -1;
}

describe('combat: cast times and windups', () => {
  it('MeleeWindupDelaysTheFirstSwingByTheWindup', () => {
    const run = (windup: number): number => {
      const cfg = defaultCombatConfig();
      if (windup > 0) cfg.autoWindups.set('Warrior', windup);
      const s = new CombatSim(data, 21, cfg);
      const w = s.addPartyUnit('Warrior');
      const g = s.addEnemy('Grunt', 1);
      Place(s, w, 0, 0); Place(s, g, 100, 0);
      Freeze(s, w); Freeze(s, g);
      return stepsToFirstDamageFrom(s, w);
    };
    const instant = run(0), slow = run(0.5);
    const dt = defaultCombatConfig().dt;
    CHECK(instant > 0 && slow > 0);
    CHECK(slow - instant >= Math.trunc(0.5 / dt) - 1);
    CHECK(slow - instant <= Math.trunc(0.5 / dt) + 2);
  });
  it('WindupFizzlesWhenTheTargetDiesFirstAndRefundsTheSwing', () => {
    const cfg = defaultCombatConfig();
    cfg.autoWindups.set('Warrior', 0.5);
    const s = new CombatSim(data, 22, cfg);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const g = s.addEnemy('Grunt', 1);
    const far = s.addEnemy('Grunt', 1);
    Place(s, w, 0, 0); Place(s, g, 100, 0); Place(s, m, -400, 0); Place(s, far, 3000, 0);
    Freeze(s, w); Freeze(s, g); Freeze(s, m); Freeze(s, far);
    let warriorHits = 0;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === w) ++warriorHits; });
    s.startFight();
    for (let i = 0; i < 400 && s.getUnit(w)!.castKind === CastKind.None; ++i) s.step();
    CHECK(s.getUnit(w)!.castKind === CastKind.Auto);
    s.dealDamage(m, g, 1000, DamageTag.Auto);
    CHECK(!s.getUnit(g)!.alive);
    for (let i = 0; i < 40; ++i) s.step();
    CHECK(warriorHits === 0);
    CHECK(s.getUnit(w)!.castKind === CastKind.None);
  });
  it('AbilityCastTimeLandsLateAndStartsTheCooldownAtOnce', () => {
    const cfg = defaultCombatConfig();
    cfg.abilityCastTimes.set('GroupHeal', 1.5);
    const s = new CombatSim(data, 23, cfg);
    const p = s.addPartyUnit('Priest');
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    Place(s, p, 0, 0); Place(s, w, 100, 0); Place(s, g, 3000, 0);
    Freeze(s, p); Freeze(s, w); Freeze(s, g);
    s.mutableUnit(w)!.hp = 1;
    s.startFight();
    s.mutableUnit(p)!.abilityTimer = 10;
    s.step();
    CHECK(s.getUnit(p)!.castKind === CastKind.Ability);
    CHECK(s.getUnit(p)!.abilityTimer < 1);
    CHECK(s.getUnit(w)!.hp < 2);
    const amount = EffectValue('GroupHeal_1') * kHealBase;
    for (let i = 0; i < Math.trunc(1.5 / s.config().dt) + 2; ++i) s.step();
    CHECK(s.getUnit(w)!.hp >= 1 + amount - 1e-6);
    CHECK(s.getUnit(p)!.castKind === CastKind.None);
  });
  it('AbilityCastFizzlesWithNoTargetAndRefundsTheCooldown', () => {
    const cfg = defaultCombatConfig();
    cfg.abilityCastTimes.set('Fireball', 1.0);
    const s = new CombatSim(data, 24, cfg);
    const m = s.addPartyUnit('Mage');
    const w = s.addPartyUnit('Warrior');
    const g = s.addEnemy('Grunt', 1);
    const far = s.addEnemy('Grunt', 1);
    Place(s, m, 0, 0); Place(s, g, 300, 0); Place(s, w, -300, 0); Place(s, far, 3000, 0);
    Freeze(s, m); Freeze(s, g); Freeze(s, w); Freeze(s, far);
    s.startFight();
    s.mutableUnit(m)!.abilityTimer = 9;
    for (let i = 0; i < 20 && s.getUnit(m)!.castKind !== CastKind.Ability; ++i) s.step();
    CHECK(s.getUnit(m)!.castKind === CastKind.Ability);
    s.dealDamage(w, g, 1000, DamageTag.Auto);
    for (let i = 0; i < 40; ++i) s.step();
    CHECK(s.getUnit(m)!.castKind === CastKind.None);
  });
  it('ShippedCastTimesInstallAndTheDefaultStaysInstant', () => {
    const plain = defaultCombatConfig();
    CHECK(plain.autoWindups.size === 0 && plain.abilityCastTimes.size === 0);
    const shipped = defaultCombatConfig();
    installShippedCastTimes(shipped);
    // Nov 21: GroupHeal is instant (it fires between the Priestess's auto casts); Mage and Priest are cast-bound, not windups.
    CHECK(!shipped.abilityCastTimes.has('GroupHeal') && !shipped.abilityCastTimes.has('Taunt') && !shipped.abilityCastTimes.has('Rage'));
    NEAR(shipped.abilityCastTimes.get('Fireball')!, 1.2, 1e-9);
    CHECK(shipped.autoWindups.get('Warrior')! > 0 && shipped.autoWindups.get('Grunt')! > 0);
    CHECK(!shipped.autoWindups.has('Mage') && !shipped.autoWindups.has('Priest'));
    CHECK(shipped.autoCastTimes.get('Mage')! > 0 && shipped.autoCastTimes.get('Priest')! > 0);
    CHECK(shipped.projectileSpeed > 0 && shipped.projectileUnits.includes('Mage'));
  });
  it('TuningScalesCastTimesAndPartyHealing', () => {
    const cfg = defaultCombatConfig();
    cfg.abilityCastTimes.set('GroupHeal', 1.5);
    cfg.castTimeScale = 0;
    cfg.partyHealMult = 0.5;
    const s = new CombatSim(data, 25, cfg);
    const p = s.addPartyUnit('Priest');
    const w = s.addPartyUnit('Warrior');
    s.addEnemy('Grunt', 1);
    s.mutableUnit(w)!.hp = 1;
    s.startFight();
    s.mutableUnit(p)!.abilityTimer = 10;
    CHECK(s.forceCastAbility(p));
    NEAR(s.getUnit(w)!.hp, 1 + 0.5 * EffectValue('GroupHeal_1') * kHealBase, 1e-6);
    s.mutableConfig().castTimeScale = 2;
    NEAR(s.config().castTimeScale, 2, 1e-12);
  });
});

describe('combat: tank target rules', () => {
  it('WarriorHandlesMeleeFoesBeforeChasingArchers', () => {
    const s = new CombatSim(data, 26);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const a = s.addEnemy('Archer', 1);
    const g = s.addEnemy('Grunt', 1);
    Place(s, w, 0, 0); Place(s, m, -300, 0); Place(s, a, 200, 0); Place(s, g, 1200, 0);
    Freeze(s, w); Freeze(s, m); Freeze(s, a); Freeze(s, g);
    s.startFight();
    s.step();
    CHECK(s.getUnit(w)!.target === g);
    s.dealDamage(m, g, 1e6, DamageTag.Auto);
    s.step();
    CHECK(s.getUnit(w)!.target === a);
  });
  it('WarriorGoesForAnArcherShootingAnAllyOnceMeleeFoesAreOnHim', () => {
    const s = new CombatSim(data, 27);
    const w = s.addPartyUnit('Warrior');
    const m = s.addPartyUnit('Mage');
    const a = s.addEnemy('Archer', 1);
    const g = s.addEnemy('Grunt', 1);
    Place(s, w, 0, 0); Place(s, m, -300, 0); Place(s, a, 900, 0); Place(s, g, 500, 0);
    s.dealDamage(w, g, 1.0, DamageTag.Auto);
    s.dealDamage(m, a, 5.0, DamageTag.Auto);
    s.startFight();
    s.step();
    s.step();
    CHECK(s.getUnit(g)!.target === w);
    CHECK(s.getUnit(a)!.target === m);
    CHECK(s.getUnit(w)!.target === a);
  });
});
