// Save slots in the browser (director, Nov 19). Each slot keeps three localStorage keys: the meta (currencies, upgrades, roster, the
// same text the single save used), the run save (runSave.ts; absent with no run in progress) and the slot card info (name, last
// saved, play time, where, party). Storage can be missing or throw (private windows, blocked site data); everything then lives in
// memory for the session. A save from before slots existed becomes slot 1.
import type { MetaStore } from '../core/runManager';

export const kSlotCount = 9;
export const kSlotsPerPage = 3;

const kLegacyKey = 'blessed-company.meta';
const kPrefix = 'blessed-company.slot';
const kLastKey = 'blessed-company.lastSlot';

export interface SlotInfo {
  name: string;
  /** Last saved, ms since 1970. */
  savedAt: number;
  playSeconds: number;
  /** "Temple" or "Goblin Cave - Floor 3". */
  location: string;
  /** Where the slot was saved, for the card picture. */
  place: 'temple' | 'cave';
  party: string[];
}

const memory = new Map<string, string>();
function get(key: string): string | undefined {
  try {
    const v = window.localStorage.getItem(key);
    return v ?? undefined;
  } catch {
    return memory.get(key);
  }
}
function set(key: string, value: string | undefined): void {
  if (value === undefined) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* session only */
  }
}
const key = (slot: number, part: 'meta' | 'run' | 'info'): string => `${kPrefix}${slot + 1}.${part}`;

export function defaultSlotName(slot: number): string {
  return slot === 0 ? 'Blessed Company' : `Save ${slot + 1}`;
}

function parseInfo(text: string | undefined, slot: number): SlotInfo | undefined {
  if (!text) return undefined;
  try {
    const o = JSON.parse(text) as Partial<SlotInfo>;
    return {
      name: typeof o.name === 'string' && o.name.trim() !== '' ? o.name.slice(0, 24) : defaultSlotName(slot),
      savedAt: typeof o.savedAt === 'number' ? o.savedAt : 0,
      playSeconds: typeof o.playSeconds === 'number' && o.playSeconds >= 0 ? o.playSeconds : 0,
      location: typeof o.location === 'string' ? o.location : 'Temple',
      place: o.place === 'cave' ? 'cave' : 'temple',
      party: Array.isArray(o.party) ? o.party.filter((p): p is string => typeof p === 'string').slice(0, 4) : [],
    };
  } catch {
    return undefined;
  }
}

/** The meta store the run manager reads and writes: whichever slot is selected (none selected reads as "no save"). */
export class SlotStore implements MetaStore {
  slot: number | undefined;

  load(): string | undefined { return this.slot === undefined ? undefined : get(key(this.slot, 'meta')); }
  save(text: string): void { if (this.slot !== undefined) set(key(this.slot, 'meta'), text); }
  keepCorrupt(text: string): void { if (this.slot !== undefined) set(`${key(this.slot, 'meta')}.corrupt`, text); }

  /** A slot is in use when it has progress or a card. */
  used(slot: number): boolean { return get(key(slot, 'meta')) !== undefined || get(key(slot, 'info')) !== undefined; }
  anyUsed(): boolean {
    for (let i = 0; i < kSlotCount; ++i) if (this.used(i)) return true;
    return false;
  }
  firstEmpty(): number | undefined {
    for (let i = 0; i < kSlotCount; ++i) if (!this.used(i)) return i;
    return undefined;
  }

  info(slot: number): SlotInfo | undefined {
    if (!this.used(slot)) return undefined;
    return parseInfo(get(key(slot, 'info')), slot) ?? {
      name: defaultSlotName(slot), savedAt: 0, playSeconds: 0, location: 'Temple', place: 'temple', party: [],
    };
  }
  setInfo(slot: number, info: SlotInfo): void { set(key(slot, 'info'), JSON.stringify(info)); }

  runSave(slot: number): string | undefined { return get(key(slot, 'run')); }
  setRunSave(slot: number, text: string | undefined): void { set(key(slot, 'run'), text); }

  /** Erases the slot: progress, run save and card. */
  erase(slot: number): void {
    for (const p of ['meta', 'run', 'info'] as const) set(key(slot, p), undefined);
  }

  lastSlot(): number | undefined {
    const n = Number(get(kLastKey));
    return Number.isInteger(n) && n >= 0 && n < kSlotCount && this.used(n) ? n : undefined;
  }
  setLastSlot(slot: number): void { set(kLastKey, String(slot)); }

  /** Moves a save from before slots existed into slot 1 (only when slot 1 is empty). */
  migrateLegacy(): void {
    const old = get(kLegacyKey);
    if (old === undefined || this.used(0)) return;
    set(key(0, 'meta'), old);
    this.setInfo(0, { name: defaultSlotName(0), savedAt: Date.now(), playSeconds: 0, location: 'Temple', place: 'temple', party: [] });
    if (get(key(0, 'meta')) === old) set(kLegacyKey, undefined);   // only removed once the copy is safely in place
  }
}
