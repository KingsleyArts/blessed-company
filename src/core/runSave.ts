// Run saves (director, Nov 19: closing the app ended the run). A save is taken at safe moments only: the start of a run or floor,
// after a room is entered without a fight, and after a fight is won. Closing the app mid-fight resumes at the last one, so the party
// walks back into that fight. The text is JSON with a version; 64-bit values are written as decimal strings. Pure rules code.
import type { FloorSize } from './floorGenerator';
import type { FlowCheckpoint } from './runFlow';

export const kRunSaveVersion = 1;

/** One party unit's condition at the save. */
export interface SavedUnit { name: string; hp: number; alive: boolean }

export interface RunCheckpoint {
  flow: FlowCheckpoint;
  /** Party units at the save; empty means "as a new run starts" (full health), used before the first fight has made any units. */
  units: SavedUnit[];
  gauge: number;
}

type Json = Record<string, unknown>;

export function serializeRunSave(cp: RunCheckpoint): string {
  const f = cp.flow;
  return JSON.stringify({
    v: kRunSaveVersion,
    flow: { ...f, seed: f.seed.toString(), gearRng: f.gearRng.toString() },
    units: cp.units,
    gauge: cp.gauge,
  });
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: unknown): x is number => Number.isInteger(x);
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const isStr = (x: unknown): x is string => typeof x === 'string';
const isIntList = (x: unknown): x is number[] => Array.isArray(x) && x.every(isInt);
const isPairList = (x: unknown): x is [string, number][] =>
  Array.isArray(x) && x.every((p) => Array.isArray(p) && p.length === 2 && isStr(p[0]) && isNum(p[1]));

function u64Text(x: unknown): bigint | undefined {
  if (!isStr(x) || !/^\d{1,20}$/.test(x)) return undefined;
  const v = BigInt(x);
  return v < 2n ** 64n ? v : undefined;
}

/** A saved floor size: absent in older saves (undefined), null when damaged. */
function floorSizeField(x: unknown): FloorSize | undefined | null {
  if (x === undefined) return undefined;
  if (typeof x !== 'object' || x === null) return null;
  const s = x as Json;
  if (!isInt(s.min) || !isInt(s.max) || !isInt(s.tutorialMin) || !isInt(s.tutorialMax)) return null;
  if (s.min < 1 || s.max < s.min || s.tutorialMin < 1 || s.tutorialMax < s.tutorialMin) return null;
  return { min: s.min, max: s.max, tutorialMin: s.tutorialMin, tutorialMax: s.tutorialMax };
}

/** Parses a run save; undefined when it is missing, from another version, or damaged in any way. */
export function parseRunSave(text: string | undefined): RunCheckpoint | undefined {
  if (!text) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Json;
  if (r.v !== kRunSaveVersion || typeof r.flow !== 'object' || r.flow === null) return undefined;
  const f = r.flow as Json;
  const seed = u64Text(f.seed);
  const gearRng = u64Text(f.gearRng);
  if (seed === undefined || gearRng === undefined) return undefined;
  if (!isInt(f.floorNumber) || !isInt(f.currentNode) || !isNum(f.gold) || !isNum(f.essence)) return undefined;
  if (!Array.isArray(f.party) || !f.party.every(isStr)) return undefined;
  if (!isIntList(f.revealed) || !isIntList(f.known) || !isIntList(f.cleared)) return undefined;
  if (!isBool(f.crystalFound) || !isBool(f.bossKilled) || !isBool(f.priestRescued)) return undefined;
  if (!isInt(f.floorKills) || !isInt(f.runKills) || !isInt(f.roomsCleared) || !isNum(f.essenceEarned) || !isNum(f.essenceSpent)) return undefined;
  if (!isPairList(f.dungeonGear)) return undefined;
  if (!Array.isArray(f.sidebar)) return undefined;
  const sidebar: FlowCheckpoint['sidebar'] = [];
  for (const c of f.sidebar as unknown[]) {
    if (typeof c !== 'object' || c === null) return undefined;
    const cj = c as Json;
    if (!isStr(cj.className) || !isPairList(cj.ranks)) return undefined;
    sidebar.push({ className: cj.className, ranks: cj.ranks.map(([k, v]) => [k, v] as [string, number]) });
  }
  const floorSize = floorSizeField(f.floorSize);
  if (floorSize === null) return undefined;
  if (f.priestStartTutorial !== undefined && !isBool(f.priestStartTutorial)) return undefined;
  if (!Array.isArray(r.units) || !isNum(r.gauge)) return undefined;
  const units: SavedUnit[] = [];
  for (const u of r.units as unknown[]) {
    if (typeof u !== 'object' || u === null) return undefined;
    const uj = u as Json;
    if (!isStr(uj.name) || !isNum(uj.hp) || !isBool(uj.alive)) return undefined;
    units.push({ name: uj.name, hp: uj.hp, alive: uj.alive });
  }
  return {
    flow: {
      ...(floorSize ? { floorSize } : {}),
      ...(f.priestStartTutorial === undefined ? {} : { priestStartTutorial: f.priestStartTutorial }),
      seed, gearRng,
      floorNumber: f.floorNumber, currentNode: f.currentNode, party: [...(f.party as string[])], gold: f.gold, essence: f.essence,
      revealed: f.revealed, known: f.known, cleared: f.cleared,
      crystalFound: f.crystalFound, bossKilled: f.bossKilled, floorKills: f.floorKills, runKills: f.runKills, roomsCleared: f.roomsCleared,
      priestRescued: f.priestRescued, essenceEarned: f.essenceEarned, essenceSpent: f.essenceSpent,
      sidebar, dungeonGear: f.dungeonGear.map(([k, v]) => [k, v] as [string, number]),
    },
    units,
    gauge: r.gauge,
  };
}
