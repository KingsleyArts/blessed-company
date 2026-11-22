// Roster port (Core/Roster.h): which heroes are owned and which go on the next expedition (draft rules, Nov 18).
// All six heroes are owned (director, Nov 21: unlock them all for the prototype; how they are earned is decided later). The default party is
// Warrior, Mage and Priestess (the Priestess joins it once granted; see runManager.grantStartingPriest). Up to kActiveSlots active, at least one.
import type { MetaSave } from './metaSave';

export const kActiveSlots = 3;
export const rosterPriestClass = (): string => 'Priest';

export const kAllHeroes = ['Warrior', 'Mage', 'Assassin', 'Priest', 'Barbarian', 'Summoner'];
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the save is kept so ownership can become progress-based again later
export function ownedHeroes(_m: MetaSave): string[] { return [...kAllHeroes]; }

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
    if (m.priestUnlocked) out.push(rosterPriestClass()); // the Priestess starts every game; soaks without her keep the Warrior + Mage start
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
