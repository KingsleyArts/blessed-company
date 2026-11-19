// CastTimes.h port: the shipped cast-time and windup table (director, Nov 18). Core tests leave CombatConfig's tables empty
// (instant actions); the combat scene calls installShippedCastTimes. ALL NUMBERS ARE PLACEHOLDERS to tune with the soak.
import type { CombatConfig } from './combatSim';

export function installShippedCastTimes(cfg: CombatConfig): void {
  // Auto actions, by unit name: melee swings are short, bolts a little longer.
  cfg.autoWindups = new Map([
    ['Warrior', 0.3], ['Barbarian', 0.3], ['Assassin', 0.15], ['Mage', 0.4], ['Priest', 0.4],
    ['Grunt', 0.3], ['Brute', 0.5], ['Archer', 0.5], ['Shaman', 0.6],
  ]);
  // Abilities, by ability name. Taunt and Rage stay instant (buffs; the tank must hold aggro on time).
  cfg.abilityCastTimes = new Map([
    ['GroupHeal', 1.5], ['Fireball', 1.2], ['Execute', 0.4], ['GreaterSpirit', 2.0], ['Cleave', 0.4],
  ]);
}
