// The healer Summoner and tank Barbarian (director, Nov 21): the Summoner fires Spirit Bolt itself while its spirits heal the most hurt
// ally; the Barbarian is a front-line tank with Rage. The Nov 12 versions stay covered by summoner.test.ts and barbarian.test.ts.
import { describe, it } from 'vitest';
import { Behavior, CombatSim, kHealBase } from '../combatSim';
import { DamageTag } from '../eventBus';
import { CHECK, Dummy, Freeze, NEAR, Place, StepSeconds, data } from '../combatTestKit';

/** Summoner at the origin, a hurt Warrior beside it, a far Grunt dummy in bolt range; everything frozen. */
function scene(warriorHpShare = 0.5) {
  const s = new CombatSim(data, 3);
  const su = s.addPartyUnit('Summoner');
  const w = s.addPartyUnit('Warrior');
  Freeze(s, su); Freeze(s, w);
  Place(s, su, 0, 0); Place(s, w, 100, 100);
  const g = Dummy(s, 'Grunt', 600, 0);
  Freeze(s, g);
  s.mutableUnit(su)!.abilityId = ''; // no Greater Spirit unless a test casts it
  s.startFight();
  s.mutableUnit(w)!.hp = s.maxHp(s.getUnit(w)!) * warriorHpShare;
  return { s, su, w, g };
}

describe('healer Summoner', () => {
  it('IsAHealerWhoFiresSpiritBoltItself', () => {
    const row = data.findClassRow('Summoner')!;
    CHECK(row.RoleTag === 'Healer' && row.AutoActionId === 'SpiritBolt', 'row');
    const { s, su, g } = scene(1);
    CHECK(s.getUnit(su)!.behavior === Behavior.Backline, 'backline');
    const hits: { amount: number; tags: number }[] = [];
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === su) hits.push({ amount: e.amount, tags: e.tags }); });
    StepSeconds(s, 10);
    CHECK(hits.length >= 7, `bolts ${hits.length}`);
    NEAR(hits[0].amount, row.BaseStats.Damage, 1e-6, 'bolt');
    CHECK((hits[0].tags & DamageTag.Auto) !== 0 && (hits[0].tags & DamageTag.Summon) === 0, 'tags');
    CHECK(s.getUnit(g)!.hp < s.maxHp(s.getUnit(g)!), 'the Grunt took damage');
  });

  it('TheWeaponSpiritHealsTheMostHurtAllyAndNeverAttacks', () => {
    const { s, su, w } = scene(0.5);
    const spirit = s.getUnits().find((u) => u.weapon && u.owner === su)!;
    const heals: { src: number; amount: number }[] = [];
    s.getBus().subscribe('HealApplied', (e) => heals.push({ src: e.source, amount: e.effectiveAmount }));
    const spiritHits: number[] = [];
    s.getBus().subscribe('DamageDealt', (e) => { if (e.source === spirit.id) spiritHits.push(e.amount); });
    const before = s.getUnit(w)!.hp;
    StepSeconds(s, 6);
    CHECK(spiritHits.length === 0, 'spirit never damages');
    CHECK(heals.length >= 4 && heals.every((h) => h.src === su), `heals credit the Summoner: ${heals.length}`);
    NEAR(heals[0].amount, kHealBase * s.config().spiritHealScale, 1e-6, 'pulse');
    CHECK(s.getUnit(w)!.hp > before, 'the Warrior healed');
  });

  it('NothingHurtMeansNoHealing', () => {
    const { s } = scene(1);
    let heals = 0;
    s.getBus().subscribe('HealApplied', () => { ++heals; });
    StepSeconds(s, 5);
    CHECK(heals === 0, 'no heals');
  });

  it('GreaterSpiritIsABiggerHealer', () => {
    const { s, su, w } = scene(0.2);
    s.mutableUnit(w)!.hp = 1; // keep her hurt for a long time
    s.mutableUnit(su)!.abilityId = 'GreaterSpirit';
    CHECK(s.forceCastAbility(su), 'cast');
    const big = s.getUnits().find((u) => u.greater && u.alive)!;
    CHECK(big.spiritHeals, 'healing');
    const heals: number[] = [];
    s.getBus().subscribe('HealApplied', (e) => heals.push(e.effectiveAmount));
    StepSeconds(s, 5);
    CHECK(Math.max(...heals) >= kHealBase * s.config().greaterSpiritHealScale - 1e-6, 'a big pulse');
    CHECK(Math.max(...heals) > 0, 'healed');
  });

  it('SpiritsSitBetweenTheSummonerAndTheAllyTheyHealAndIdleInsideASmallRadius', () => {
    const { s, su, w } = scene(0.3);
    Place(s, w, 700, -300); // far from the Summoner at the origin
    s.mutableUnit(w)!.hp = 5;
    const spirit = s.getUnits().find((u) => u.weapon && u.owner === su)!;
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    StepSeconds(s, 3);
    const mid = { x: (s.getUnit(su)!.x + s.getUnit(w)!.x) / 2, y: (s.getUnit(su)!.y + s.getUnit(w)!.y) / 2 };
    const r = s.config().spiritHealIdleRadius;
    CHECK(dist(spirit, mid) <= r * 0.25 + 1, 'midway between the Summoner and the ally');
    CHECK(dist(spirit, s.getUnit(su)!) > 300, 'not glued to the Summoner');
    // A target switch that keeps the ideal spot inside the idle radius moves nothing.
    const before = { x: spirit.x, y: spirit.y };
    Place(s, w, 700 + r, -300); // the midpoint shifts by r / 2
    StepSeconds(s, 1);
    CHECK(dist(spirit, before) < 1e-6, 'stayed put inside the radius');
    s.mutableUnit(w)!.hp = s.maxHp(s.getUnit(w)!); // everyone healthy: it drifts home
    StepSeconds(s, 4);
    CHECK(dist(spirit, s.getUnit(su)!) < 250, 'back beside the Summoner');
  });

  it('TheTuningMultipliersScaleSpiritHealing', () => {
    const run = (mult: number) => {
      const { s, w } = scene(0.5);
      s.mutableConfig().abilityPowerMult.set('SpiritHeal', mult);
      s.mutableUnit(w)!.hp = 1;
      let first = 0;
      s.getBus().subscribe('HealApplied', (e) => { if (!first) first = e.effectiveAmount; });
      StepSeconds(s, 3);
      return first;
    };
    NEAR(run(2), run(1) * 2, 1e-6, 'x2');
  });
});

describe('tank Barbarian', () => {
  it('IsAFrontlineTankWithRage', () => {
    const row = data.findClassRow('Barbarian')!;
    CHECK(row.RoleTag === 'Tank' && row.AbilityId === 'Rage' && row.BaseStats.HP > 160 && row.BaseStats.DefensePct > 10, 'row');
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    CHECK(s.getUnit(b)!.behavior === Behavior.Frontline, 'frontline');
    CHECK(!s.getUnit(b)!.healer, 'not a healer');
  });
});
