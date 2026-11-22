// The Heroes screen's hero sheets (director's mockup, Nov 19): every hero the game has, whether it is owned and in the party, and
// the stats it would start a fight with: the class base plus Temple blessings plus Temple gear (in-run Essence is not included).
// The numbers are read from a party unit built exactly as a fight builds it, so the screen cannot drift from combat. Hero levels
// were cut for the prototype (orchestrator's recommendation, Nov 19). Pure rules code: no Phaser imports.
import type { ClassDataRow } from './dataTypes';
import { StatId, type StatResolver } from './statResolver';

/** Every hero on the Heroes screen, in display order. Barbarian and Summoner have no way to be obtained yet (shown locked). */
export const kHeroOrder = ['Warrior', 'Mage', 'Assassin', 'Priest', 'Barbarian', 'Summoner'] as const;

export interface HeroStatLine {
  key: string;
  label: string;
  /** Formatted for the screen: "250", "1.00/s", "40%", "150%". */
  value: string;
  /** The stat is not unlocked in the Temple yet (shown as "Locked"). */
  locked: boolean;
}

export interface HeroSkill { id: string; name: string; text: string; kind: 'attack' | 'ability' }

export interface HeroSheet {
  className: string;
  /** Shown name ("Priestess" for the Priest class). */
  label: string;
  /** "Tank", "Healer", "Melee damage"... */
  role: string;
  owned: boolean;
  active: boolean;
  /** Why it cannot be picked ("Rescue her on floor 2"), empty when owned. */
  note: string;
  stats: HeroStatLine[];
  skills: HeroSkill[];
}

export function heroLabel(className: string): string {
  return className === 'Priest' ? 'Priestess' : className;
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'Tank': return 'Tank';
    case 'Healer': return 'Healer';
    case 'MeleeDPS': return 'Melee damage';
    case 'RangedDPS': return 'Ranged damage';
    case 'Support': return 'Support';
  }
  return role;
}

/** Auto Party's order of preference: a tank, a healer, then damage, then support. */
export function rolePriority(role: string): number {
  switch (role) {
    case 'Tank': return 0;
    case 'Healer': return 1;
    case 'RangedDPS': return 2;
    case 'MeleeDPS': return 3;
    case 'Support': return 4;
  }
  return 5;
}

/** Player-facing names and one-line descriptions for the abilities and attacks in AbilityData / ClassData (no numbers, so they cannot
 *  drift from the tuning). Unknown ids fall back to the id itself. */
const kSkillText: Record<string, [string, string]> = {
  MeleeStrike: ['Sword Strike', 'A steady melee attack.'],
  HealOrSmite: ['Searing Light', 'A cast that heals the most hurt ally the moment it finishes, or sends a bolt of light at an enemy when no one needs healing.'],
  FastMelee: ['Twin Blades', 'Quick melee attacks.'],
  MeleeSwing: ['Axe Swing', 'A strong melee attack that draws enemy attention.'],
  SpiritBolt: ['Spirit Bolt', "A ranged bolt of spirit energy: the cast takes a moment, then the green bolt flies to the target. Meanwhile the Summoner's spirit heals the most hurt ally."],
  RangedBolt: ['Arcane Shot', 'A ranged magic attack: the cast takes a moment, then the bolt flies to the target.'],
  Taunt: ['Taunt', 'Puts the Warrior at the top of every enemy\'s threat and forces them all to attack the Warrior for a few seconds, taking less damage meanwhile.'],
  Cleave: ['Cleave', 'Hits every enemy close by, holding their attention.'],
  GroupHeal: ['Prayer of Mending', 'Heals the whole party.'],
  Execute: ['Execute', 'A heavy strike on the weakest enemy.'],
  Rage: ['Rage', 'Roars to draw the attention of nearby enemies, then attacks faster, heals from the damage dealt and draws even more attention for a few seconds.'],
  Bloodrush: ['Bloodrush', 'Rushes an enemy, preferring one attacking a vulnerable ally, and lands a powerful blow that draws great attention.'],
  GreaterSpirit: ['Greater Spirit', 'Calls a powerful healing spirit for a while, beside the spirit that always heals alongside.'],
  Fireball: ['Fireball', 'Burns the target and the enemies around it.'],
};

export function skillOf(id: string, kind: HeroSkill['kind']): HeroSkill {
  const t = kSkillText[id];
  return { id, name: t ? t[0] : id, text: t ? t[1] : '', kind };
}

/** The class's attack, its ability and any extra abilities (ClassData AutoActionId, AbilityId, ExtraAbilityIds). */
export function heroSkills(row: ClassDataRow): HeroSkill[] {
  const out: HeroSkill[] = [];
  if (row.AutoActionId !== '') out.push(skillOf(row.AutoActionId, 'attack'));
  if (row.AbilityId !== '') out.push(skillOf(row.AbilityId, 'ability'));
  for (const x of row.ExtraAbilityIds) if (x !== '') out.push(skillOf(x, 'ability'));
  return out;
}

/** The six stat lines of the mockup, read from a party unit's resolved stats. `unlocked(stat)` says whether a Temple stat is unlocked. */
export function heroStatLines(stats: StatResolver, unlocked: (stat: string) => boolean): HeroStatLine[] {
  const g = (s: StatId): number => stats.get(s);
  const whole = (v: number): string => Math.round(v).toLocaleString('en-US');
  const pct = (v: number, digits: number): string => `${(Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;
  const line = (key: string, label: string, value: string, lockKey?: string): HeroStatLine => {
    const locked = lockKey !== undefined && !unlocked(lockKey);
    return { key, label, value: locked ? 'Locked' : value, locked };
  };
  return [
    line('Health', 'Health', whole(g(StatId.Health))),
    line('Damage', 'Damage', (Math.round(g(StatId.Damage) * 10) / 10).toString()),
    line('AttackSpeed', 'Attack Speed', `${g(StatId.AttackSpeed).toFixed(2)}/s`),
    line('DefensePct', 'Defense', pct(g(StatId.DefensePercent), 0)),
    line('CritChance', 'Crit Chance', pct(g(StatId.CritChance) * 100, 1), 'CritChance'),
    // Crit Factor starts at 150% of normal damage once unlocked (director, Nov 19; CombatConfig baseCritFactor).
    line('CritFactor', 'Crit Factor', pct(g(StatId.CritFactor) * 100, 0), 'CritFactor'),
  ];
}
