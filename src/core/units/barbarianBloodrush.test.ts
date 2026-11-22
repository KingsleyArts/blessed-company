// Barbarian tank kit (director Nov 21): passive 1.5x threat, Rage (threat burst, x2 while active), Bloodrush (rush, 180% damage, x3 threat).
import { describe, it } from 'vitest';
import { CombatSim } from '../combatSim';
import { DamageTag, kNoUnit } from '../eventBus';
import { StatId } from '../statResolver';
import { CHECK, Freeze, NEAR, Place, StepTicks, data } from '../combatTestKit';

const tough = (s: CombatSim, id: number, hp = 1e7): void => {
  s.mutableUnit(id)!.stats.setBase(StatId.Health, hp);
  s.mutableUnit(id)!.hp = hp;
};

describe('units: Barbarian Bloodrush and Rage', () => {
  it('DataValuesMatchTheSpec', () => {
    const rage = data.findAbility('Rage')!;
    const br = data.findAbility('Bloodrush')!;
    NEAR(rage.Cooldown, 16, 1e-9);
    NEAR(br.Cooldown, 8, 1e-9);
    NEAR(br.ThreatMultiplier, 3, 1e-9);
    NEAR(data.findEffect('Bloodrush_1')!.Value, 1.8, 1e-6);
    NEAR(data.findEffect('Rage_1')!.Value, 0.3, 1e-6);
    NEAR(data.findEffect('Rage_2')!.Value, 0.2, 1e-6);
    NEAR(data.findEffect('Rage_3')!.Value, 2, 1e-6);
    NEAR(data.findClassRow('Barbarian')!.ThreatMultiplier, 1.5, 1e-6);
    CHECK(data.findClassRow('Barbarian')!.ExtraAbilityIds.includes('Bloodrush'));
  });
  it('BloodrushPrefersTheEnemyAttackingAVulnerableAlly', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const m = s.addPartyUnit('Mage');
    const near = s.addEnemy('Grunt', 1);
    const far = s.addEnemy('Grunt', 1);
    for (const id of [b, m, near, far]) { Freeze(s, id); tough(s, id); }
    Place(s, b, 0, 0);
    Place(s, m, 900, 0);
    Place(s, near, 300, 0);
    Place(s, far, 850, 0);
    s.mutableUnit(far)!.target = m;
    s.mutableUnit(near)!.target = b;
    s.startFight();
    let chosen = kNoUnit;
    for (let i = 0; i < 20 * 30 && chosen === kNoUnit; ++i) {
      s.step();
      if (s.getUnit(b)!.rushLeft > 0) chosen = s.getUnit(b)!.rushTarget;
    }
    CHECK(chosen === far);
  });
  it('RageBurstGivesThreatWithoutDamageAndSetsTheThreatMultiplier', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    const e1 = s.addEnemy('Grunt', 1);
    const e2 = s.addEnemy('Grunt', 1);
    for (const id of [b, e1, e2]) { Freeze(s, id); tough(s, id); }
    Place(s, b, 0, 0);
    Place(s, e1, 100, 0);
    Place(s, e2, -100, 0);
    let rageDamage = 0;
    s.getBus().subscribe('AbilityCast', (a) => { if (a.caster === b && a.abilityId === 'Rage') rageDamage = -1; });
    s.startFight();
    let before = 0;
    for (let i = 0; i < 20 * 30 && s.getUnit(b)!.rageThreatLeft <= 0; ++i) { before = s.getUnit(b)!.threatGenerated; s.step(); }
    const u = s.getUnit(b)!;
    CHECK(rageDamage === -1 && u.rageThreatLeft > 0);
    NEAR(u.rageThreatMult, 2, 1e-6);
    CHECK(u.threatGenerated - before >= 2 * u.stats.get(StatId.Damage) - 1e-6);   // 100% of a normal attack per enemy, no damage needed
  });
  it('BloodrushRefundsItsCooldownWhenNoTargetExists', () => {
    const s = new CombatSim(data, 1);
    const b = s.addPartyUnit('Barbarian');
    Freeze(s, b);
    s.startFight();
    StepTicks(s, 5);
    CHECK(s.getUnit(b)!.rushLeft === 0);
  });
});

describe('units: Barbarian threat table', () => {
  it('ThreatPerDamageIs1_5_3_4_5_And9', () => {
    const s = new CombatSim(data, 3);
    const b = s.addPartyUnit('Barbarian');
    const e = s.addEnemy('Grunt', 1);
    for (const id of [b, e]) { Freeze(s, id); tough(s, id); }
    Place(s, b, 0, 0);
    Place(s, e, 100, 0);
    const threatStat = s.getUnit(b)!.stats.get(StatId.Threat);
    let hits: { amount: number; tags: number }[] = [];
    let cast = false;
    s.getBus().subscribe('DamageDealt', (d) => { if (d.source === b) hits.push({ amount: d.amount, tags: d.tags }); });
    s.getBus().subscribe('AbilityCast', (a) => { if (a.caster === b) cast = true; });
    s.startFight();
    const seen = new Map<string, number>();
    for (let i = 0; i < 40 * 30; ++i) {
      const before = s.getUnit(b)!.threatGenerated;
      const rage = s.getUnit(b)!.rageThreatLeft > 0;
      hits = [];
      cast = false;
      s.step();
      if (hits.length !== 1 || cast) continue;
      const ratio = (s.getUnit(b)!.threatGenerated - before) / hits[0].amount / threatStat;
      const key = `${hits[0].tags & DamageTag.Ability ? 'ability' : 'basic'}${rage ? '+rage' : ''}`;
      seen.set(key, ratio);
    }
    NEAR(seen.get('basic') ?? -1, 1.5, 1e-3);
    NEAR(seen.get('basic+rage') ?? -1, 3, 1e-3);
    NEAR(seen.get('ability') ?? -1, 4.5, 1e-3);
    NEAR(seen.get('ability+rage') ?? -1, 9, 1e-3);
  });
});
