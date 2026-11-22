// CastTimes.h port: the shipped cast-time and windup table (director, Nov 18). Core tests leave CombatConfig's tables empty
// (instant actions); the combat scene calls installShippedCastTimes. ALL NUMBERS ARE PLACEHOLDERS to tune with the soak.
import type { CombatConfig } from './combatSim';

export function installShippedCastTimes(cfg: CombatConfig): void {
  // Auto actions of the melee classes and enemies, by unit name: a short windup inside the attack-speed interval.
  cfg.autoWindups = new Map([
    ['Warrior', 0.3], ['Barbarian', 0.3], ['Assassin', 0.15],
    ['Grunt', 0.3], ['Brute', 0.5], ['Archer', 0.5], ['Shaman', 0.6],
  ]);
  // Casters (director, Nov 21): Arcane Shot (Mage) and Searing Light (Priestess) have NO attack timer. They cast back to back and
  // the cast time is the only limit; AttackSpeed shortens it. DRAFT cast times in seconds at the class's base AttackSpeed; each
  // landing is scaled by cast time x base AttackSpeed (Mage 2.0 x 0.7 = 1.4x damage, Priestess 1.6 x 0.8 = 1.28x damage and heal),
  // so DPS and healing per second stay what ClassData says and only the chunkiness changes.
  cfg.autoCastTimes = new Map([['Mage', 2.0], ['Priest', 1.6], ['Summoner', 1.5]]);
  // Spirit Bolt (director Nov 22) casts like Arcane Shot. DRAFT 1.5 s x base AttackSpeed 0.9 = 1.35x of the Summoner's lower Damage 8
  // (about 10.8 per bolt, 7.2 per second against the Mage's 22.4 and 11.2), since the Summoner is a healer.
  // Arcane Shot and Searing Light's bolt fly to the target (DRAFT speed, world units per second); Searing Light's heal lands instantly.
  cfg.projectileUnits = ['Mage', 'Priest', 'Summoner'];
  cfg.projectileSpeed = 1400.0;
  // Abilities, by ability name. Taunt, Rage and GroupHeal stay instant: Taunt and Rage are buffs (the tank must hold aggro on time),
  // and GroupHeal fires in the gap between a caster's auto casts (an ability never starts during another cast).
  cfg.abilityCastTimes = new Map([
    ['Fireball', 1.2], ['Execute', 0.4], ['GreaterSpirit', 2.0], ['Cleave', 0.4],
  ]);
}

/** The Nov 18 table exactly as the C++ build ships it: the golden combat fixtures (spec-tests/combat, built from CombatSim.h) were recorded
 *  with it, so combatScenario.ts installs THIS one. Never edit it without regenerating the fixtures (tools/golden/build_combat_golden.ps1). */
export function installLegacyCastTimes(cfg: CombatConfig): void {
  cfg.autoWindups = new Map([
    ['Warrior', 0.3], ['Barbarian', 0.3], ['Assassin', 0.15], ['Mage', 0.4], ['Priest', 0.4],
    ['Grunt', 0.3], ['Brute', 0.5], ['Archer', 0.5], ['Shaman', 0.6],
  ]);
  cfg.abilityCastTimes = new Map([
    ['GroupHeal', 1.5], ['Fireball', 1.2], ['Execute', 0.4], ['GreaterSpirit', 2.0], ['Cleave', 0.4],
  ]);
}
