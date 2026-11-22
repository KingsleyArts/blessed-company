// Director Nov 22: the Greater Spirit is only called when someone needs healing; the standard spirit smites like the Priest when every
// ally is at or above the smite threshold (85%); enemy health and damage grow per floor by separate rates.
import { describe, it } from 'vitest';
import { CombatSim, defaultCombatConfig } from '../combatSim';
import { installShippedCastTimes } from '../castTimes';
import { DamageTag } from '../eventBus';
import { StatId } from '../statResolver';
import { CHECK, Dummy, Freeze, NEAR, Place, StepSeconds, data } from '../combatTestKit';

function scene(share: number, withGreater: boolean) {
  const s = new CombatSim(data, 3);
  const su = s.addPartyUnit('Summoner');
  const w = s.addPartyUnit('Warrior');
  Freeze(s, su); Freeze(s, w);
  Place(s, su, 0, 0); Place(s, w, 100, 100);
  const g = Dummy(s, 'Grunt', 600, 0);
  Freeze(s, g);
  if (!withGreater) s.mutableUnit(su)!.abilityId = '';
  s.startFight();
  s.mutableUnit(w)!.hp = s.maxHp(s.getUnit(w)!) * share;
  return { s, su, w, g };
}

describe('Summoner spirits', () => {
  it('GreaterSpiritWaitsWhileEveryoneIsHealthy', () => {
    const { s, su } = scene(1, true);
    let casts = 0;
    s.getBus().subscribe('AbilityCast', (a) => { if (a.caster === su && a.abilityId === 'GreaterSpirit') ++casts; });
    StepSeconds(s, 60);
    CHECK(casts === 0, `casts ${casts}`);
  });
  it('GreaterSpiritIsCalledOnceSomeoneIsHurt', () => {
    const { s, su } = scene(0.5, true);
    let casts = 0;
    s.getBus().subscribe('AbilityCast', (a) => { if (a.caster === su && a.abilityId === 'GreaterSpirit') ++casts; });
    s.mutableUnit(su)!.hp = s.maxHp(s.getUnit(su)!);
    // keep the Warrior hurt so the condition holds when the cooldown is up
    for (let i = 0; i < 60 * 30; ++i) { s.getUnit(1)!.hp = Math.min(s.getUnit(1)!.hp, s.maxHp(s.getUnit(1)!) * 0.5); s.step(); }
    CHECK(casts >= 1, `casts ${casts}`);
  });
  it('StandardSpiritSmitesWhenEveryoneIsAtOrAboveTheThreshold', () => {
    const { s, su, g } = scene(0.9, false);
    const spirit = s.getUnits().find((u) => u.weapon && u.owner === su)!;
    const hits: number[] = [];
    const tags: number[] = [];
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === spirit.id) { hits.push(e.amount); tags.push(e.tags); } });
    StepSeconds(s, 6);
    CHECK(hits.length >= 3, `smites ${hits.length}`);
    CHECK((tags[0] & DamageTag.Summon) !== 0 && (tags[0] & DamageTag.Smite) !== 0, 'tags');
    CHECK(s.getUnit(g)!.hp < s.maxHp(s.getUnit(g)!), 'the Grunt took damage');
  });
  it('StandardSpiritHealsBelowTheThresholdAndDoesNotSmite', () => {
    const { s, su, w } = scene(0.5, false);
    const spirit = s.getUnits().find((u) => u.weapon && u.owner === su)!;
    let smites = 0;
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === spirit.id) ++smites; });
    const before = s.getUnit(w)!.hp;
    StepSeconds(s, 3);
    CHECK(smites === 0, 'no smite while someone is hurt');
    CHECK(s.getUnit(w)!.hp > before, 'healed');
  });
});

describe('floor scaling', () => {
  it('HealthAndDamageGrowByTheirOwnRatePerFloor', () => {
    const s = new CombatSim(data, 1);
    s.mutableConfig().floorHealthScaling = 1.5;
    s.mutableConfig().floorDamageScaling = 1.1;
    const e = s.addEnemy('Grunt', 3);
    const row = data.findEnemy('Grunt')!;
    NEAR(s.maxHp(s.getUnit(e)!), row.BaseStats.HP * 1.5 * 1.5, 1e-6);
    NEAR(s.getUnit(e)!.stats.get(StatId.Damage), row.BaseStats.Damage * 1.1 * 1.1, 1e-6);
  });
  it('UnsetRatesFallBackToTheSharedFloorScaling', () => {
    const s = new CombatSim(data, 1);
    const e = s.addEnemy('Grunt', 3);
    const row = data.findEnemy('Grunt')!;
    const f = Math.pow(s.config().floorScaling, 2);
    NEAR(s.maxHp(s.getUnit(e)!), row.BaseStats.HP * f, 1e-6);
    NEAR(s.getUnit(e)!.stats.get(StatId.Damage), row.BaseStats.Damage * f, 1e-6);
  });
});

describe('Spirit Bolt casts like Arcane Shot', () => {
  const shipped = () => { const c = defaultCombatConfig(); installShippedCastTimes(c); return c; };
  const bolts = (cls: string) => {
    const s = new CombatSim(data, 7, shipped());
    const p = s.addPartyUnit(cls);
    const g = Dummy(s, 'Grunt', 600, 0);
    Freeze(s, p); Freeze(s, g);
    Place(s, p, 0, 0);
    s.mutableUnit(p)!.abilityId = '';
    s.startFight();
    let flew = false;
    const hits: number[] = [];
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === p) hits.push(e.amount); });
    for (let i = 0; i < 20 * 30; ++i) { s.step(); if (s.getProjectiles().some((q) => q.source === p)) flew = true; }
    return { flew, hits };
  };
  it('FliesAsAProjectileAndHitsLighterThanArcaneShot', () => {
    const su = bolts('Summoner');
    const mage = bolts('Mage');
    CHECK(su.flew && su.hits.length > 3, 'summoner bolts fly');
    CHECK(su.hits[0] < mage.hits[0], `${su.hits[0]} vs ${mage.hits[0]}`);
    CHECK(su.hits.reduce((a, b) => a + b, 0) < mage.hits.reduce((a, b) => a + b, 0), 'less damage per second');
  });
  it('GreaterSpiritWaitsForTheNextFightWhenCombatEnds', () => {
    const { s, su, g } = scene(0.5, true);
    s.mutableConfig().greaterSpiritPersists = true;
    s.forceCastAbility(su, 'GreaterSpirit');
    StepSeconds(s, 2.5);   // the cast lands; the spirit is out
    const gs = () => s.getUnits().find((u) => u.greater && u.alive);
    CHECK(!!gs(), 'greater spirit is out');
    const left = gs()!.lifeLeft;
    s.mutableUnit(g)!.hp = 0; s.mutableUnit(g)!.alive = false;   // the Grunt falls: the fight is won
    for (let i = 0; i < 90 && !s.finished(); ++i) s.step();
    CHECK(s.finished(), 'fight over');
    CHECK(!!gs(), 'greater spirit survives the end of combat');
    StepSeconds(s, 5);
    CHECK(Math.abs(gs()!.lifeLeft - left) < 0.5, `duration paused ${gs()!.lifeLeft} vs ${left}`);
    s.prepareNextFight();
    s.startFight();
    const sp = gs();
    CHECK(!!sp && sp.owner === su, 'it is back for the next fight');
    CHECK(sp!.lifeLeft <= left + 1e-6 && sp!.lifeLeft > left - 1, 'duration carried');
  });
});
