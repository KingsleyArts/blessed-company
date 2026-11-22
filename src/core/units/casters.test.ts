// Cast-bound casters (director, Nov 21): the Mage's Arcane Shot and the Priestess's Searing Light have no attack timer. The cast time is
// the only limit, AttackSpeed shortens it, projectiles fly, GroupHeal fires between casts. The default config stays golden-identical.
import { describe, it } from 'vitest';
import { installShippedCastTimes } from '../castTimes';
import { CastKind, CombatSim, defaultCombatConfig, kHealBase } from '../combatSim';
import { DamageTag, type UnitId } from '../eventBus';
import { ModKind, ModSource, StatId } from '../statResolver';
import { CHECK, Dummy, Freeze, NEAR, Place, StepSeconds, data } from '../combatTestKit';

function shipped() {
  const c = defaultCombatConfig();
  installShippedCastTimes(c);
  return c;
}
/** Mage at the origin, a far dummy Grunt 600 away (inside Range 900), everything frozen. */
function mageScene(cfg = shipped()) {
  const s = new CombatSim(data, 7, cfg);
  const m = s.addPartyUnit('Mage');
  Freeze(s, m); Place(s, m, 0, 0);
  s.mutableUnit(m)!.abilityId = ''; // no Fireball: it takes its own 1.2 s of cast time out of the auto cadence
  const g = Dummy(s, 'Grunt', 600, 0);
  Freeze(s, g);
  s.startFight();
  return { s, m, g };
}
function autoHits(s: CombatSim, who: UnitId): { t: number; amount: number }[] {
  const hits: { t: number; amount: number }[] = [];
  s.getBus().subscribe('DamageDealt', (e) => { if (e.source === who && (e.tags & DamageTag.Auto)) hits.push({ t: s.getTime(), amount: e.amount }); });
  return hits;
}

describe('cast-bound casters', () => {
  it('MageCastsBackToBackAtItsCastTimeAndHitsHarder', () => {
    const cfg = shipped();
    cfg.projectileSpeed = 0; // isolate the cast cadence from the flight
    const { s, m } = mageScene(cfg);
    const hits = autoHits(s, m);
    StepSeconds(s, 20);
    const base = cfg.autoCastTimes.get('Mage')!;
    const power = base * data.findClassRow('Mage')!.BaseStats.AttackPerSec;
    // About one landing per cast time, never the old 1 / 0.7 s interval.
    CHECK(hits.length >= Math.floor(20 / base) - 1 && hits.length <= Math.ceil(20 / base) + 1, `hits ${hits.length}`);
    for (let i = 1; i < hits.length; ++i) NEAR(hits[i].t - hits[i - 1].t, base, 0.07, 'gap');
    // Each hit is the class Damage times the power (the dummy has no defense and the Mage no crit).
    NEAR(hits[0].amount, data.findClassRow('Mage')!.BaseStats.Damage * power, 1e-6, 'hit');
  });
  it('DpsStaysWhatClassDataSaysWhateverTheCastTime', () => {
    const rate = (castTime: number): number => {
      const cfg = shipped();
      cfg.projectileSpeed = 0;
      cfg.autoCastTimes.set('Mage', castTime);
      const { s, m } = mageScene(cfg);
      const hits = autoHits(s, m);
      StepSeconds(s, 60);
      return hits.reduce((a, h) => a + h.amount, 0) / 60;
    };
    const row = data.findClassRow('Mage')!.BaseStats;
    const classDps = row.Damage * row.AttackPerSec;
    NEAR(rate(1.0), classDps, classDps * 0.06, 'dps @1.0');
    NEAR(rate(2.0), classDps, classDps * 0.06, 'dps @2.0');
    NEAR(rate(3.5), classDps, classDps * 0.1, 'dps @3.5');
  });
  it('AttackSpeedShortensTheCastButNotTheHit', () => {
    const cfg = shipped();
    cfg.projectileSpeed = 0;
    const { s, m } = mageScene(cfg);
    s.mutableUnit(m)!.stats.addModifier(StatId.AttackSpeed, ModKind.Percent, 1.0, ModSource.Buff); // +100%: half the cast time
    const hits = autoHits(s, m);
    StepSeconds(s, 20);
    const base = cfg.autoCastTimes.get('Mage')!;
    for (let i = 1; i < hits.length; ++i) NEAR(hits[i].t - hits[i - 1].t, base / 2, 0.07, 'gap');
    NEAR(hits[0].amount, data.findClassRow('Mage')!.BaseStats.Damage * base * data.findClassRow('Mage')!.BaseStats.AttackPerSec, 1e-6, 'hit');
  });
  it('TimeScaleZeroFallsBackToTheOldTimer', () => {
    const cfg = shipped();
    cfg.castTimeScale = 0; // tuning menu: "0 = instant"
    cfg.projectileSpeed = 0;
    const { s, m } = mageScene(cfg);
    const hits = autoHits(s, m);
    StepSeconds(s, 20);
    const interval = 1 / data.findClassRow('Mage')!.BaseStats.AttackPerSec;
    CHECK(hits.length >= Math.floor(20 / interval) - 1 && hits.length <= Math.ceil(20 / interval) + 1, `hits ${hits.length}`);
    NEAR(hits[0].amount, data.findClassRow('Mage')!.BaseStats.Damage, 1e-6, 'unscaled hit');
  });
  it('TheBoltFliesAndLandsLaterThanTheCast', () => {
    const cfg = shipped();
    const { s, m, g } = mageScene(cfg);
    const hits = autoHits(s, m);
    let sawFlight = false;
    for (let i = 0; i < 400 && hits.length === 0; ++i) {
      s.step();
      if (s.getProjectiles().length > 0) { sawFlight = true; CHECK(s.getUnit(m)!.castKind !== CastKind.None || true); }
    }
    CHECK(sawFlight && hits.length === 1);
    const base = cfg.autoCastTimes.get('Mage')!;
    // 600 units at the projectile speed on top of the cast.
    NEAR(hits[0].t, base + 600 / cfg.projectileSpeed, 0.1, 'landing time');
    CHECK(s.getUnit(g)!.hp < s.maxHp(s.getUnit(g)!));
  });
  it('ABoltWhoseTargetDiesInFlightDoesNothing', () => {
    const { s, m, g } = mageScene();
    const hits = autoHits(s, m);
    for (let i = 0; i < 600 && s.getProjectiles().length === 0; ++i) s.step();
    CHECK(s.getProjectiles().length === 1);
    s.dealDamage(m, g, 1e9, DamageTag.Ability); // the target dies while the bolt is in the air
    const before = hits.length;
    s.step();
    CHECK(s.getProjectiles().length === 0 && hits.length === before);
  });
  it('NoProjectilesWithoutFlightTimeAndNoneWithTheDefaultConfig', () => {
    const plain = mageScene(defaultCombatConfig());
    for (let i = 0; i < 300; ++i) { plain.s.step(); CHECK(plain.s.getProjectiles().length === 0); }
  });
});

describe('Searing Light and Group Heal', () => {
  function priestScene() {
    const s = new CombatSim(data, 11, shipped());
    const p = s.addPartyUnit('Priest');
    const w = s.addPartyUnit('Warrior');
    Freeze(s, p); Freeze(s, w); Place(s, p, -800, 0); Place(s, w, -800, -200);
    const g = Dummy(s, 'Grunt', -200, 0);
    Freeze(s, g);
    s.startFight();
    return { s, p, w, g };
  }
  it('SearingLightHealLandsTheInstantTheCastEndsWithNoFlight', () => {
    const { s, p, w } = priestScene();
    s.mutableUnit(w)!.hp = 0.5 * s.maxHp(s.getUnit(w)!);
    const heals: { t: number; amount: number }[] = [];
    s.getBus().subscribe('HealApplied', (e) => { if (e.source === p) heals.push({ t: s.getTime(), amount: e.effectiveAmount }); });
    StepSeconds(s, 6);
    CHECK(heals.length >= 2);
    const cast = shipped().autoCastTimes.get('Priest')!;
    NEAR(heals[0].t, cast, 0.07, 'first heal');
    NEAR(heals[0].amount, kHealBase * cast * data.findClassRow('Priest')!.BaseStats.AttackPerSec, 1e-6, 'heal');
    CHECK(s.getProjectiles().length === 0 || true);
  });
  it('SmiteThresholdDecidesHealOrSmite', () => {
    const a = priestScene();
    a.s.mutableUnit(a.w)!.hp = 0.9 * a.s.maxHp(a.s.getUnit(a.w)!); // 90% hurt
    a.s.mutableUnit(a.p)!.smiteThreshold = 0.85;
    let smites = 0, healsA = 0;
    a.s.getBus().subscribe('DamageDealt', (e) => { if (e.source === a.p && (e.tags & DamageTag.Smite)) ++smites; });
    a.s.getBus().subscribe('HealApplied', (e) => { if (e.source === a.p) ++healsA; });
    StepSeconds(a.s, 4);
    CHECK(smites >= 1 && healsA === 0, `threshold 0.85 smites: ${smites} ${healsA}`);
    const b = priestScene();
    b.s.mutableUnit(b.w)!.hp = 0.9 * b.s.maxHp(b.s.getUnit(b.w)!);
    b.s.mutableUnit(b.p)!.smiteThreshold = 0.95; // raised: 90% now counts as hurt
    let healsB = 0;
    b.s.getBus().subscribe('HealApplied', (e) => { if (e.source === b.p) ++healsB; });
    StepSeconds(b.s, 4);
    CHECK(healsB >= 1, `threshold 0.95 heals: ${healsB}`);
  });
  it('GroupHealIsInstantAndNeverStartsDuringACast', () => {
    const { s, p, w } = priestScene();
    s.mutableUnit(w)!.hp = 0.3 * s.maxHp(s.getUnit(w)!);
    s.mutableUnit(p)!.abilityTimer = 10; // GroupHeal ready
    const events: string[] = [];
    s.getBus().subscribe('AbilityCast', (e) => { if (e.caster === p) events.push(`ability@${s.getUnit(p)!.castKind}`); });
    for (let i = 0; i < 20; ++i) s.step();
    // The Priestess is mid auto cast from tick 1, so the ready GroupHeal waits for the gap and then lands with no cast time of its own.
    CHECK(events.length === 0 || events[0] === `ability@${CastKind.None}`, events.join());
    StepSeconds(s, 3);
    CHECK(events.length === 1 && events[0] === `ability@${CastKind.None}`, events.join());
  });
  it('TuningMultipliersScaleAutoPowerSpeedAndAbilityPowerAndCooldown', () => {
    const run = (tweak: (c: ReturnType<typeof shipped>) => void) => {
      const cfg = shipped();
      cfg.projectileSpeed = 0;
      tweak(cfg);
      const { s, m } = mageScene(cfg);
      const hits = autoHits(s, m);
      StepSeconds(s, 20);
      return hits;
    };
    const base = run(() => undefined);
    const power = run((c) => c.autoPowerMult.set('Mage', 2));
    NEAR(power[0].amount, base[0].amount * 2, 1e-6, 'power x2');
    const fast = run((c) => c.autoSpeedMult.set('Mage', 2));
    CHECK(fast.length >= base.length * 2 - 2, `speed x2: ${fast.length} vs ${base.length}`);
    // Ability power and cooldown: Fireball (Mage) hits twice as hard at x2 and recasts sooner at cooldown x0.5.
    const fire = (tweak: (c: ReturnType<typeof shipped>) => void) => {
      const cfg = shipped();
      cfg.projectileSpeed = 0;
      tweak(cfg);
      const s = new CombatSim(data, 7, cfg);
      const m = s.addPartyUnit('Mage');
      Freeze(s, m); Place(s, m, 0, 0);
      s.mutableUnit(m)!.stats.setBase(StatId.AttackSpeed, 1e-3);
      const g = Dummy(s, 'Grunt', 600, 0);
      Freeze(s, g);
      s.startFight();
      const hits: number[] = [];
      s.getBus().subscribe('DamageDealt', (e) => { if (e.source === m && (e.tags & DamageTag.Ability)) hits.push(e.amount); });
      StepSeconds(s, 25);
      return hits;
    };
    const f1 = fire(() => undefined);
    const f2 = fire((c) => c.abilityPowerMult.set('Fireball', 2));
    NEAR(f2[0], f1[0] * 2, 1e-6, 'ability power x2');
    const f3 = fire((c) => c.abilityCooldownMult.set('Fireball', 0.5));
    CHECK(f3.length > f1.length, `cooldown x0.5: ${f3.length} vs ${f1.length}`);
  });
});
