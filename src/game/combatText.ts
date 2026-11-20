// Readability in pile-ups (director, Nov 20): fewer, merged combat numbers, fewer health bars, coloured rings under the feet. Display
// only; the fight itself is unchanged. Each fix has an on/off switch in the testing builds' tuning menu (Readability tab).
// No Phaser imports, so the rules here are unit-tested.

/** The switches (the tuning menu writes them live). */
export const readability = { mergeNumbers: true, fewerBars: true, footRings: true };

/** Hits on one unit within this many seconds of its number appearing add into that number. */
export const kMergeWindow = 0.4;
/** At most this many numbers float over one unit at once (the oldest goes first). */
export const kMaxPerUnit = 3;
/** With fewer bars on: an enemy's bar shows for this long after it is hit; a hero's bar shows only below this health fraction. */
export const kBarRecentSeconds = 3;
export const kHeroBarBelow = 0.35;
/** With merging on, heal numbers are drawn smaller and this far to the side (unscaled px), apart from the damage numbers. */
export const kHealSize = 0.8;
export const kHealOffsetPx = 34;
const kMaxEntries = 48;

/** `label`: a word such as a miracle's name (never merged). */
export type FloatKind = 'damage' | 'crit' | 'heal' | 'label';

export interface FloatEntry {
  unit: number;
  kind: FloatKind;
  amount: number;
  x: number;
  y: number;
  text: string;
  color: number;
  age: number;
  jitter: number;
  size: number;
  /** Sideways offset (unscaled px), heals only. */
  dx: number;
}

/** Adds a number. With `merge`, a hit lands in the unit's newest number of the same kind if that is younger than kMergeWindow (crits and
 *  labels always get their own), and a unit never has more than kMaxPerUnit numbers. Mutates `entries`. */
export function pushFloat(entries: FloatEntry[], e: FloatEntry, merge: boolean, format: (amount: number, kind: FloatKind) => string): void {
  if (merge && e.kind !== 'crit' && e.kind !== 'label') {
    for (let i = entries.length - 1; i >= 0; --i) {
      const o = entries[i];
      if (o.unit === e.unit && o.kind === e.kind && o.age < kMergeWindow) {
        o.amount += e.amount;
        o.text = format(o.amount, o.kind);
        return;
      }
    }
  }
  entries.push(e);
  if (merge) {
    let count = 0;
    for (const o of entries) if (o.unit === e.unit) ++count;
    for (let i = 0; count > kMaxPerUnit && i < entries.length;) {
      if (entries[i].unit === e.unit) { entries.splice(i, 1); --count; } else ++i;
    }
  }
  while (entries.length > kMaxEntries) entries.shift();
}

/** Whether a unit's health bar shows. Full-health units never show one. */
export function barVisible(enemy: boolean, hpFraction: number, secondsSinceHit: number, fewer: boolean): boolean {
  if (hpFraction >= 1) return false;
  if (!fewer) return true;
  return enemy ? secondsSinceHit < kBarRecentSeconds : hpFraction < kHeroBarBelow;
}
