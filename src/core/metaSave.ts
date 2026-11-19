// MetaSave port (Core/MetaSave.h): permanent (cross-run) data and its plain text serializer. Pure rules code: no Phaser imports.
// Format: one "key=value" per line, first real line "TolMeta=<version>". Unknown keys and blank / '#' lines are ignored; an
// unreadable value keeps its default and adds a warning. A file without the header is rejected (fresh meta, ok == false).
// The browser store (localStorage) lives outside src/core and uses serializeMeta / parseMeta unchanged.
import { cTrim, parseLongStrict, strtod } from './cstd';
import { fmtF } from './printf';

export interface MetaSave {
  /** Permanent currency, shown as FAITH, saved as "faith" (v1: "gold"). */
  gold: number;
  /** The party's own money (Gold wallet, v2). */
  partyGold: number;
  priestUnlocked: boolean;
  bestFloor: number;
  unlockedStats: string[];
  /** "Warrior.Weapon" -> Temple level. Iterated in sorted key order (std::map) when it matters. */
  gearLevels: Map<string, number>;
  partyLuck: Map<string, number>;
  activeParty: string[];
  statLevels: Map<string, number>;
  masterVolume: number;
  defaultSpeed: number;
}

export function makeMeta(): MetaSave {
  return {
    gold: 0, partyGold: 0, priestUnlocked: false, bestFloor: 0, unlockedStats: [], gearLevels: new Map(), partyLuck: new Map(),
    activeParty: [], statLevels: new Map(), masterVolume: 1.0, defaultSpeed: 1,
  };
}

export function cloneMeta(m: MetaSave): MetaSave {
  return {
    ...m, unlockedStats: [...m.unlockedStats], gearLevels: new Map(m.gearLevels), partyLuck: new Map(m.partyLuck),
    activeParty: [...m.activeParty], statLevels: new Map(m.statLevels),
  };
}

/** Wipes progress (gold, Priest unlock, best floor, Temple buys, party); settings stay. */
export function resetProgress(m: MetaSave): void {
  m.gold = 0;
  m.partyGold = 0;
  m.activeParty = [];
  m.priestUnlocked = false;
  m.bestFloor = 0;
  m.unlockedStats = [];
  m.gearLevels = new Map();
  m.partyLuck = new Map();
  m.statLevels = new Map();
}

/** std::map's order (byte-wise for ASCII keys). */
export const sortedKeys = (m: ReadonlyMap<string, number>): string[] => [...m.keys()].sort();

const mapsEqual = (a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const arraysEqual = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export function metaEquals(a: MetaSave, b: MetaSave): boolean {
  return a.gold === b.gold && a.partyGold === b.partyGold && a.priestUnlocked === b.priestUnlocked && a.bestFloor === b.bestFloor &&
    arraysEqual(a.unlockedStats, b.unlockedStats) && mapsEqual(a.gearLevels, b.gearLevels) && mapsEqual(a.partyLuck, b.partyLuck) &&
    mapsEqual(a.statLevels, b.statLevels) && a.masterVolume === b.masterVolume && a.defaultSpeed === b.defaultSpeed &&
    arraysEqual(a.activeParty, b.activeParty);
}

export const kMetaVersion = 2;
export const kMetaMaxGold = 2000000000;

export function serializeMeta(m: MetaSave): string {
  let out = `TolMeta=${kMetaVersion}\n`;
  out += `faith=${m.gold}\n`;
  out += `partyGold=${m.partyGold}\n`;
  out += `priestUnlocked=${m.priestUnlocked ? '1' : '0'}\n`;
  out += `bestFloor=${m.bestFloor}\n`;
  out += `unlockedStats=${m.unlockedStats.join('|')}\n`;
  out += `activeParty=${m.activeParty.join('|')}\n`;
  const levels = (key: string, mp: ReadonlyMap<string, number>): void => {
    const parts: string[] = [];
    for (const k of sortedKeys(mp)) {
      const v = mp.get(k)!;
      if (v > 0) parts.push(`${k}:${v}`);
    }
    out += `${key}=${parts.join('|')}\n`;
  };
  levels('gearLevels', m.gearLevels);
  levels('partyLuck', m.partyLuck);
  levels('statLevels', m.statLevels);
  out += `masterVolume=${fmtF(m.masterVolume, 4)}\n`;
  out += `defaultSpeed=${m.defaultSpeed}\n`;
  return out;
}

export interface MetaParseResult {
  meta: MetaSave;
  ok: boolean;
  warnings: string[];
}

const fresh = (): MetaParseResult => ({ meta: makeMeta(), ok: false, warnings: [] });

/** Splits on '|' and trims each cell (empty cells dropped by the callers). */
const cells = (val: string): string[] => val.split('|').map(cTrim);

export function parseMeta(text: string): MetaParseResult {
  const r: MetaParseResult = { meta: makeMeta(), ok: false, warnings: [] };
  let header = false;
  for (const raw of text.split('\n')) {
    const line = cTrim(raw);
    if (line === '' || line[0] === '#') continue;
    const eq = line.indexOf('=');
    if (eq < 0) {
      if (!header) return fresh();
      r.warnings.push(`ignored line without '=': ${line.slice(0, 40)}`);
      continue;
    }
    const key = cTrim(line.slice(0, eq));
    const val = cTrim(line.slice(eq + 1));
    if (!header) {
      const v = parseLongStrict(val);
      if (key !== 'TolMeta' || v === undefined || v < 1) return fresh();
      header = true;
      if (v > kMetaVersion) r.warnings.push('file is from a newer version; unknown keys ignored');
      continue;
    }
    const bad = (name: string): void => {
      r.warnings.push(`bad ${name}: ${val.slice(0, 24)}`);
    };
    if (key === 'partyGold') {
      let iv = parseLongStrict(val);
      if (iv === undefined) { bad('partyGold'); continue; }
      if (iv < 0 || iv > kMetaMaxGold) { r.warnings.push('partyGold out of range, clamped'); iv = iv < 0 ? 0 : kMetaMaxGold; }
      r.meta.partyGold = iv;
    } else if (key === 'faith' || key === 'gold') {
      let iv = parseLongStrict(val);
      if (iv === undefined) { bad('faith'); continue; }
      if (iv < 0 || iv > kMetaMaxGold) { r.warnings.push('gold out of range, clamped'); iv = iv < 0 ? 0 : kMetaMaxGold; }
      r.meta.gold = iv;
    } else if (key === 'priestUnlocked') {
      const iv = parseLongStrict(val);
      if (iv === undefined || (iv !== 0 && iv !== 1)) { bad('priestUnlocked'); continue; }
      r.meta.priestUnlocked = iv === 1;
    } else if (key === 'bestFloor') {
      let iv = parseLongStrict(val);
      if (iv === undefined) { bad('bestFloor'); continue; }
      if (iv < 0 || iv > 100000) { r.warnings.push('bestFloor out of range, clamped'); iv = iv < 0 ? 0 : 100000; }
      r.meta.bestFloor = iv;
    } else if (key === 'unlockedStats') {
      for (const t of cells(val)) if (t !== '') r.meta.unlockedStats.push(t);
    } else if (key === 'activeParty') {
      for (const t of cells(val)) if (t !== '' && r.meta.activeParty.length < 8) r.meta.activeParty.push(t);
    } else if (key === 'gearLevels' || key === 'partyLuck' || key === 'statLevels') {
      const dst = key === 'gearLevels' ? r.meta.gearLevels : key === 'partyLuck' ? r.meta.partyLuck : r.meta.statLevels;
      for (const t of cells(val)) {
        if (t === '') continue;
        const colon = t.lastIndexOf(':');
        let lv = colon <= 0 ? undefined : parseLongStrict(t.slice(colon + 1));
        if (lv === undefined) {
          r.warnings.push(`bad ${key} entry: ${t.slice(0, 24)}`);
          continue;
        }
        const cap = key === 'statLevels' ? 100000 : 1000;
        if (lv < 0 || lv > cap) { r.warnings.push(`${key} level out of range, clamped`); lv = lv < 0 ? 0 : cap; }
        dst.set(t.slice(0, colon), lv);
      }
    } else if (key === 'masterVolume') {
      const p = strtod(val);
      if (val === '' || p === undefined || p.end !== val.length || Number.isNaN(p.value)) { bad('masterVolume'); continue; }
      r.meta.masterVolume = p.value < 0 ? 0 : p.value > 1 ? 1 : p.value;
    } else if (key === 'defaultSpeed') {
      const iv = parseLongStrict(val);
      if (iv === undefined || (iv !== 1 && iv !== 2 && iv !== 4)) { bad('defaultSpeed'); continue; }
      r.meta.defaultSpeed = iv;
    }
    // unknown keys: ignored on purpose (forward compatibility)
  }
  if (!header) return fresh();
  r.ok = true;
  return r;
}
