// Roster port (Core/Roster.h): which heroes are owned and which go on the next expedition (draft rules, Nov 18).
// Warrior, Mage and Assassin are owned from the start; the Priestess once rescued. Up to kActiveSlots active, at least one.
import type { MetaSave } from './metaSave';

export const kActiveSlots = 3;
export const rosterPriestClass = (): string => 'Priest';

export function ownedHeroes(m: MetaSave): string[] {
  const v = ['Warrior', 'Mage', 'Assassin'];
  if (m.priestUnlocked) v.push(rosterPriestClass());
  return v;
}

export const rosterOwns = (m: MetaSave, hero: string): boolean => ownedHeroes(m).includes(hero);

/** The saved party cleaned up: unowned and duplicates dropped, capped, default when empty. */
export function activeParty(m: MetaSave): string[] {
  const out: string[] = [];
  for (const h of m.activeParty) {
    if (out.length >= kActiveSlots) break;
    if (rosterOwns(m, h) && !out.includes(h)) out.push(h);
  }
  if (out.length === 0) {
    out.push('Warrior', 'Mage');
    if (m.priestUnlocked) out.push(rosterPriestClass());
  }
  return out;
}

export const rosterIsActive = (m: MetaSave, hero: string): boolean => activeParty(m).includes(hero);

export enum RosterResult { Added, Removed, NotOwned, PartyFull, LastHero }

export function toggleActiveHero(m: MetaSave, hero: string): RosterResult {
  if (!rosterOwns(m, hero)) return RosterResult.NotOwned;
  const v = activeParty(m);
  const i = v.indexOf(hero);
  if (i >= 0) {
    if (v.length <= 1) return RosterResult.LastHero;
    v.splice(i, 1);
    m.activeParty = v;
    return RosterResult.Removed;
  }
  if (v.length >= kActiveSlots) return RosterResult.PartyFull;
  v.push(hero);
  m.activeParty = v;
  return RosterResult.Added;
}
