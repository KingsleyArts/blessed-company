// FloorGenerator port (FloorGenerator.h/.cpp). Floors are a grid of rooms joined by N/E/S/W doors. Same operation order as
// the C++ so equal seeds give identical floors (golden fixtures in spec-tests/core). Pure rules code: no Phaser imports.
import { Rng, floorSeed as floorSeedOf } from './rng';

export { Rng, floorSeed } from './rng';

// ---------------------------------------------------------------- Types
// Rest is RETIRED (never generated); the value stays so Boss and Exit keep their numbers.
export enum RoomType { Combat = 0, Elite = 1, Treasure = 2, Rest = 3, Boss = 4, Exit = 5 }
export const kRoomTypeCount = 6;
export const kRollableRoomTypes = 3; // Combat, Elite, Treasure

export enum EnemyType { Grunt = 0, Brute = 1, Archer = 2, Shaman = 3 }
export const kEnemyTypeCount = 4;

export interface EnemyPack {
  size: number;
  counts: [number, number, number, number]; // indexed by EnemyType; sums to size
}
export const emptyPack = (): EnemyPack => ({ size: 0, counts: [0, 0, 0, 0] });

/** gy grows DOWN the screen: North is gy-1, South is gy+1, East is gx+1, West is gx-1. */
export enum Dir { North = 0, East = 1, South = 2, West = 3 }
export const kDirCount = 4;
export const dirDx = (d: Dir): number => (d === Dir.East ? 1 : d === Dir.West ? -1 : 0);
export const dirDy = (d: Dir): number => (d === Dir.South ? 1 : d === Dir.North ? -1 : 0);
export const oppositeDir = (d: Dir): Dir => ((d + 2) % kDirCount) as Dir;
export const dirName = (d: Dir): string => ['North', 'East', 'South', 'West'][d] ?? '?';

export interface Node {
  id: number;
  gx: number;
  gy: number;
  type: RoomType;
  door: [number, number, number, number]; // neighbour room id behind the N/E/S/W door, -1 = wall
  next: number[]; // ALL adjacent room ids (the doors, in N,E,S,W order)
  pack: EnemyPack;
  hasReinforcements: boolean;
  reinforcements: EnemyPack;
  hasCrystal: boolean;
  revealed: boolean; // VISITED
  known: boolean; // drawn on the map: visited rooms and every room next to a visited room
  isStart: boolean;
  shape: number; // bit d set (1 << Dir) when the room has a door in direction d
  isDeadEnd: boolean;
  isRescueRoom: boolean;
}

export interface Floor {
  number: number;
  seed: bigint; // map-stream seed used for this floor
  isBoss: boolean;
  scaling: number;
  nodes: Node[]; // node id == index; ids are row-major (gy, then gx)
  cols: number;
  rows: number;
  startNode: number;
  crystalNode: number;
  crystalRequiresBossKill: boolean;
  totalEnemies: number;
  killQuota: number;
  roomRoll: number;
  usedFallbackLayout: boolean;
  rescueNode: number;
  isTutorial: boolean;
  isRescueLayout: boolean;
}

export const kShapeCount = 13;
export const kDirBit = (d: Dir): number => 1 << d;
export const kShapeMasks: readonly number[] = [
  0b1111,
  0b1001, 0b0011, 0b1100, 0b0110, // corners
  0b1011, 0b1110, 0b1101, 0b0111, // three-ways
  0b0001, 0b0010, 0b0100, 0b1000, // dead ends
];
export const kNonDeadEndShapeCount = 9;
export const shapeOpenCount = (mask: number): number => {
  let c = 0;
  for (; mask; mask >>= 1) c += mask & 1;
  return c;
};
export const isValidShapeMask = (mask: number): boolean => kShapeMasks.includes(mask);

// ---------------------------------------------------------------- Config
export interface WeightTier {
  maxFloor: number; // tier applies while floor <= maxFloor
  weights: [number, number, number]; // Combat, Elite, Treasure (raw; normalized at use)
}

export interface Config {
  bossInterval: number;
  scalePerFloor: number;
  bossSpike: number;
  killQuotaFraction: number;
  roomCountMin: number;
  roomCountMax: number;
  layoutAttempts: number;
  eliteMaxFraction: number;
  eliteMinFloor: number;
  hasPriest: boolean;
  weightTiers: WeightTier[];
  packSizeMin: number[]; // indexed by RoomType
  packSizeMax: number[];
  enemyWeights: number[]; // indexed by EnemyType
  rescueFloor: number;
  tutorialFloor: number;
  tutorialCrystalMaxDistance: number;
  tutorialRoomCountMin: number;
  tutorialRoomCountMax: number;
  tutorialPackMin: number;
  tutorialPackMax: number;
  combatReinforcementChance: number;
  reinforcementSize: number;
}

const INT_MAX = 2147483647;

export function defaultConfig(): Config {
  return {
    bossInterval: 10,
    scalePerFloor: 0.08,
    bossSpike: 1.5,
    killQuotaFraction: 0.4,
    roomCountMin: 10,
    roomCountMax: 20,
    layoutAttempts: 200,
    eliteMaxFraction: 0.2,
    eliteMinFloor: 3,
    hasPriest: false,
    weightTiers: [
      { maxFloor: 2, weights: [55, 10, 15] },
      { maxFloor: INT_MAX, weights: [45, 20, 10] },
    ],
    packSizeMin: [2, 4, 0, 0, 5, 0],
    packSizeMax: [4, 5, 0, 0, 5, 0],
    enemyWeights: [40, 20, 25, 15],
    rescueFloor: 2,
    tutorialFloor: 1,
    tutorialCrystalMaxDistance: 2,
    tutorialRoomCountMin: 5,
    tutorialRoomCountMax: 8,
    tutorialPackMin: 1,
    tutorialPackMax: 2,
    combatReinforcementChance: 0.3,
    reinforcementSize: 2,
  };
}

/** Default config with overrides (the C++ tests copy-and-modify Config). */
export const makeConfig = (over: Partial<Config> = {}): Config => ({ ...defaultConfig(), ...over });

/** The floor size rolls (testing builds tune them). Counts are main rooms; the generator adds dead-end side rooms on top. */
export interface FloorSize { min: number; max: number; tutorialMin: number; tutorialMax: number }
export const kFloorSizeLow = 1;
export const kFloorSizeHigh = 40;

export function floorSizeOf(c: Config): FloorSize {
  return { min: c.roomCountMin, max: c.roomCountMax, tutorialMin: c.tutorialRoomCountMin, tutorialMax: c.tutorialRoomCountMax };
}
export const defaultFloorSize = (): FloorSize => floorSizeOf(defaultConfig());

/** Whole numbers in range, each max at least its min. */
export function normalizeFloorSize(s: FloorSize): FloorSize {
  const c = (v: number): number => Math.min(kFloorSizeHigh, Math.max(kFloorSizeLow, Math.trunc(v)));
  const min = c(s.min);
  const tutorialMin = c(s.tutorialMin);
  return { min, max: Math.max(min, c(s.max)), tutorialMin, tutorialMax: Math.max(tutorialMin, c(s.tutorialMax)) };
}

export function withFloorSize(c: Config, s: FloorSize): Config {
  return { ...c, roomCountMin: s.min, roomCountMax: s.max, tutorialRoomCountMin: s.tutorialMin, tutorialRoomCountMax: s.tutorialMax };
}

// ---------------------------------------------------------------- Simple API
export function isBossFloor(floorNumber: number, cfg: Config = defaultConfig()): boolean {
  return cfg.bossInterval > 0 && floorNumber > 0 && floorNumber % cfg.bossInterval === 0;
}

export function scalingMultiplier(floorNumber: number, cfg: Config = defaultConfig()): number {
  const steps = floorNumber > 1 ? floorNumber - 1 : 0;
  let m = Math.pow(1 + cfg.scalePerFloor, steps);
  if (isBossFloor(floorNumber, cfg)) m *= cfg.bossSpike;
  return m;
}

export function normalizedRoomWeights(floorNumber: number, cfg: Config = defaultConfig()): [number, number, number] {
  const third = 100 / kRollableRoomTypes;
  if (cfg.weightTiers.length === 0) return [third, third, third];
  let tier = cfg.weightTiers[cfg.weightTiers.length - 1];
  for (const t of cfg.weightTiers) {
    if (floorNumber <= t.maxFloor) {
      tier = t;
      break;
    }
  }
  let sum = 0;
  for (const w of tier.weights) sum += w > 0 ? w : 0;
  if (sum <= 0) return [third, third, third];
  return tier.weights.map((x) => ((x > 0 ? x : 0) * 100) / sum) as [number, number, number];
}

/** Boss floors have no quota. An Elite counts as 1 kill per enemy; the quota never exceeds the enemies outside non-rescue Elite rooms. */
export function computeKillQuota(floor: Floor, cfg: Config = defaultConfig()): number {
  if (floor.isBoss || floor.totalEnemies <= 0) return 0;
  let q = Math.ceil(cfg.killQuotaFraction * floor.totalEnemies - 1e-9);
  if (q < 1) q = 1;
  if (q > floor.totalEnemies) q = floor.totalEnemies;
  let avoidable = floor.totalEnemies;
  for (const n of floor.nodes) {
    if (n.type === RoomType.Elite && !n.isRescueRoom) avoidable -= n.pack.size + n.reinforcements.size;
  }
  if (avoidable < 1) avoidable = 1;
  if (q > avoidable) q = avoidable;
  return q;
}

// ---------------------------------------------------------------- Layout building
function rollPack(rng: Rng, mix: ArrayLike<number>, size: number): EnemyPack {
  const p = emptyPack();
  p.size = size;
  for (let i = 0; i < size; i++) p.counts[rng.pickWeighted(mix, kEnemyTypeCount)] += 1;
  return p;
}

const kGrid = 96;
const kMaxRoll = 40;

class Layout {
  mask = new Int32Array(kGrid * kGrid).fill(-1);
  nonDeadEnds = 0;
  startX = kGrid / 2;
  startY = kGrid / 2;
  bx0 = kGrid / 2;
  bx1 = kGrid / 2;
  by0 = kGrid / 2;
  by1 = kGrid / 2;

  /** Mirrors the C++ `at(x, y) = v`: the bounding box grows on EVERY write, tentative ones included. */
  set(x: number, y: number, v: number): void {
    this.bx0 = Math.min(this.bx0, x);
    this.bx1 = Math.max(this.bx1, x);
    this.by0 = Math.min(this.by0, y);
    this.by1 = Math.max(this.by1, y);
    this.mask[y * kGrid + x] = v;
  }
  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= kGrid || y >= kGrid ? -1 : this.mask[y * kGrid + x];
  }
  /** bit d of must = a placed neighbour opens toward the cell; bit d of mustNot = a placed neighbour has a wall toward it. */
  constraints(x: number, y: number): { must: number; mustNot: number } {
    let must = 0;
    let mustNot = 0;
    for (let d = 0; d < kDirCount; d++) {
      const nm = this.get(x + dirDx(d), y + dirDy(d));
      if (nm < 0) continue;
      if (nm & kDirBit(oppositeDir(d))) must |= 1 << d;
      else mustNot |= 1 << d;
    }
    return { must, mustNot };
  }
}

const fits = (shape: number, must: number, mustNot: number): boolean => (shape & must) === must && (shape & mustNot) === 0;

/** Empty cells that some placed room opens toward, in row-major order. */
function pendingCells(L: Layout): [number, number][] {
  const out: [number, number][] = [];
  for (let y = L.by0 - 1; y <= L.by1 + 1; y++) {
    for (let x = L.bx0 - 1; x <= L.bx1 + 1; x++) {
      if (L.get(x, y) >= 0) continue;
      if (L.constraints(x, y).must) out.push([x, y]);
    }
  }
  return out;
}

type LayoutKind = 'Normal' | 'Rescue';

function layoutValid(L: Layout, target: number, kind: LayoutKind): boolean {
  let nonDead = 0;
  for (let y = L.by0; y <= L.by1; y++) {
    for (let x = L.bx0; x <= L.bx1; x++) {
      const m = L.get(x, y);
      if (m < 0) continue;
      if (!isValidShapeMask(m)) return false;
      if (shapeOpenCount(m) > 1) nonDead++;
      for (let d = 0; d < kDirCount; d++) {
        const nm = L.get(x + dirDx(d), y + dirDy(d));
        const open = (m & kDirBit(d)) !== 0;
        if (nm < 0) {
          if (open) return false;
          continue;
        }
        if (open !== ((nm & kDirBit(oppositeDir(d))) !== 0)) return false;
      }
    }
  }
  if (nonDead !== target) return false;
  const sm = L.get(L.startX, L.startY);
  if (sm < 0) return false;
  if (kind === 'Normal') return shapeOpenCount(sm) > 1;
  if (shapeOpenCount(sm) !== 1) return false;
  for (let d = 0; d < kDirCount; d++) {
    if (!(sm & (1 << d))) continue;
    const nm = L.get(L.startX + dirDx(d), L.startY + dirDy(d));
    return nm >= 0 && shapeOpenCount(nm) > 1;
  }
  return false;
}

/** Grows one candidate layout into `L`. Returns false when no shape fits a cell or the forced cells overshoot the roll. */
function buildLayout(rng: Rng, target: number, L: Layout, kind: LayoutKind): boolean {
  if (kind === 'Normal') {
    L.set(L.startX, L.startY, kShapeMasks[rng.nextInt(0, kNonDeadEndShapeCount - 1)]);
  } else {
    const d = rng.nextInt(0, kDirCount - 1);
    L.set(L.startX, L.startY, 1 << d);
    const shapes: number[] = [];
    for (let s = 0; s < kNonDeadEndShapeCount; s++) if (kShapeMasks[s] & kDirBit(oppositeDir(d))) shapes.push(kShapeMasks[s]);
    L.set(L.startX + dirDx(d), L.startY + dirDy(d), shapes[rng.nextInt(0, shapes.length - 1)]);
  }
  L.nonDeadEnds = 1;
  for (let guard = 0; guard < 4 * kGrid * kGrid; guard++) {
    const pending = pendingCells(L);
    if (pending.length === 0) return L.nonDeadEnds === target;
    // Cells with two or more neighbours opening toward them are forced non-dead-end rooms and go first.
    const forced = pending.filter(([px, py]) => shapeOpenCount(L.constraints(px, py).must) >= 2);
    const pool = forced.length === 0 ? pending : forced;
    const cell = pool[rng.nextInt(0, pool.length - 1)];
    const { must, mustNot } = L.constraints(cell[0], cell[1]);
    const cand: number[] = [];
    const capping = L.nonDeadEnds >= target;
    for (let s = 0; s < kShapeCount; s++) {
      const dead = s >= kNonDeadEndShapeCount;
      if (capping && !dead) continue;
      if (!capping && dead) continue;
      if (fits(kShapeMasks[s], must, mustNot)) cand.push(kShapeMasks[s]);
    }
    if (cand.length === 0) return false;
    // Look-ahead: forced cells still waiting each cost one more non-dead-end room.
    const ok: number[] = [];
    for (const m of cand) {
      L.set(cell[0], cell[1], m);
      let extra = 0;
      if (!capping) {
        for (const [px, py] of pendingCells(L)) if (shapeOpenCount(L.constraints(px, py).must) >= 2) extra++;
      }
      L.set(cell[0], cell[1], -1);
      if (capping || L.nonDeadEnds + 1 + extra <= target) ok.push(m);
    }
    if (ok.length === 0) return false;
    const pick = ok[rng.nextInt(0, ok.length - 1)];
    L.set(cell[0], cell[1], pick);
    if (shapeOpenCount(pick) > 1) L.nonDeadEnds++;
  }
  return false;
}

/** Deterministic staircase fallback; always valid for any target >= 1. */
function buildFallback(target: number, L: Layout, kind: LayoutKind): boolean {
  let x = L.startX;
  let y = L.startY;
  if (kind === 'Rescue') {
    L.set(x, y, kDirBit(Dir.East));
    x += 1;
  }
  for (let i = 0; i < target; i++) {
    let m: number;
    if (kind === 'Rescue') {
      m = i === 0 ? kDirBit(Dir.West) | kDirBit(Dir.South)
        : i % 2 === 1 ? kDirBit(Dir.North) | kDirBit(Dir.East) : kDirBit(Dir.West) | kDirBit(Dir.South);
      L.set(x, y, m);
      if (i % 2 === 0) y += 1;
      else x += 1;
      continue;
    }
    if (i === 0) m = kDirBit(Dir.South) | kDirBit(Dir.East);
    else if (i % 2 === 1) m = kDirBit(Dir.West) | kDirBit(Dir.South);
    else m = kDirBit(Dir.North) | kDirBit(Dir.East);
    L.set(x, y, m);
    if (i % 2 === 0) x += 1;
    else y += 1;
  }
  L.nonDeadEnds = target;
  for (const [px, py] of pendingCells(L)) L.set(px, py, L.constraints(px, py).must); // a single incoming opening: a dead end facing back
  return layoutValid(L, target, kind);
}

// ---------------------------------------------------------------- Helpers
export function doorDistances(floor: Floor, from: number): number[] {
  const n = floor.nodes.length;
  const dist: number[] = new Array<number>(n).fill(-1);
  if (from < 0 || from >= n) return dist;
  const queue = [from];
  dist[from] = 0;
  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];
    for (const v of floor.nodes[u].next) {
      if (v >= 0 && v < n && dist[v] < 0) {
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

export function isReachable(floor: Floor, from: number, to: number): boolean {
  const n = floor.nodes.length;
  if (from < 0 || from >= n || to < 0 || to >= n) return false;
  return doorDistances(floor, from)[to] >= 0;
}

export function roomAt(floor: Floor, gx: number, gy: number): number {
  for (const n of floor.nodes) if (n.gx === gx && n.gy === gy) return n.id;
  return -1;
}

export function revealNeighbors(floor: Floor, nodeId: number): void {
  if (nodeId < 0 || nodeId >= floor.nodes.length) return;
  for (const nx of floor.nodes[nodeId].next) if (nx >= 0 && nx < floor.nodes.length) floor.nodes[nx].known = true;
}

/** Fog rule: entering a room marks it visited and known, and marks its neighbours known. */
export function revealNode(floor: Floor, nodeId: number): void {
  if (nodeId < 0 || nodeId >= floor.nodes.length) return;
  const n = floor.nodes[nodeId];
  n.revealed = true;
  n.known = true;
  revealNeighbors(floor, nodeId);
}

/** Click-to-travel: shortest walk passing only through VISITED rooms; the final room may be known but unvisited. Ties broken N,E,S,W. */
export function findPath(floor: Floor, from: number, to: number): number[] {
  const n = floor.nodes.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return [];
  const dest = floor.nodes[to];
  if (!dest.known && !dest.revealed) return [];
  const prev: number[] = new Array<number>(n).fill(-2);
  const queue = [from];
  prev[from] = -1;
  for (let i = 0; i < queue.length && prev[to] === -2; i++) {
    const u = queue[i];
    for (const v of floor.nodes[u].next) {
      if (v < 0 || v >= n || prev[v] !== -2) continue;
      if (v !== to && !floor.nodes[v].revealed) continue;
      prev[v] = u;
      queue.push(v);
    }
  }
  if (prev[to] === -2) return [];
  const path: number[] = [];
  for (let v = to; v !== from; v = prev[v]) path.unshift(v);
  return path;
}

function newNode(): Node {
  return {
    id: 0, gx: 0, gy: 0, type: RoomType.Combat, door: [-1, -1, -1, -1], next: [], pack: emptyPack(),
    hasReinforcements: false, reinforcements: emptyPack(), hasCrystal: false, revealed: false, known: false,
    isStart: false, shape: 0, isDeadEnd: false, isRescueRoom: false,
  };
}

function newFloor(): Floor {
  return {
    number: 0, seed: 0n, isBoss: false, scaling: 1, nodes: [], cols: 0, rows: 0, startNode: 0, crystalNode: -1,
    crystalRequiresBossKill: false, totalEnemies: 0, killQuota: 0, roomRoll: 0, usedFallbackLayout: false,
    rescueNode: -1, isTutorial: false, isRescueLayout: false,
  };
}

/** Turns a finished Layout into the floor's nodes: row-major ids, doors from the shape masks, start node, fog on the start. */
function materialize(L: Layout, f: Floor): void {
  let minX = INT_MAX, minY = INT_MAX, maxX = 0, maxY = 0;
  for (let y = L.by0; y <= L.by1; y++) {
    for (let x = L.bx0; x <= L.bx1; x++) {
      if (L.get(x, y) < 0) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  f.cols = maxX - minX + 1;
  f.rows = maxY - minY + 1;
  const idAt: number[] = new Array<number>(f.cols * f.rows).fill(-1);
  let nextId = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) if (L.get(x, y) >= 0) idAt[(y - minY) * f.cols + (x - minX)] = nextId++;
  }
  f.nodes = Array.from({ length: nextId }, newNode);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const m = L.get(x, y);
      if (m < 0) continue;
      const id = idAt[(y - minY) * f.cols + (x - minX)];
      const n = f.nodes[id];
      n.id = id;
      n.gx = x - minX;
      n.gy = y - minY;
      n.shape = m;
      n.isDeadEnd = shapeOpenCount(m) === 1;
      for (let d = 0; d < kDirCount; d++) {
        if (!(m & (1 << d))) continue;
        const b = idAt[(y + dirDy(d) - minY) * f.cols + (x + dirDx(d) - minX)];
        n.door[d] = b;
        n.next.push(b);
      }
    }
  }
  f.startNode = idAt[(L.startY - minY) * f.cols + (L.startX - minX)];
  f.nodes[f.startNode].isStart = true;
  revealNode(f, f.startNode);
}

// ---------------------------------------------------------------- generate
export function generate(runSeed: bigint | number, floorNumber: number, cfg: Config = defaultConfig()): Floor {
  const f = newFloor();
  f.number = floorNumber;
  f.seed = floorSeedOf(runSeed, floorNumber);
  f.isBoss = isBossFloor(floorNumber, cfg);
  f.scaling = scalingMultiplier(floorNumber, cfg);

  const rng = new Rng(f.seed); // map stream only

  if (f.isBoss) {
    // Boss floor: arena (start, dead end East) + Exit room (dead end West) holding the crystal. No roll, no quota.
    const L = new Layout();
    L.set(L.startX, L.startY, kDirBit(Dir.East));
    L.set(L.startX + 1, L.startY, kDirBit(Dir.West));
    materialize(L, f);
    const arena = f.nodes[f.startNode];
    const exitRoom = f.nodes[arena.door[Dir.East]];
    arena.type = RoomType.Boss;
    exitRoom.type = RoomType.Exit;
    exitRoom.hasCrystal = true;
    const bi = RoomType.Boss;
    const size = cfg.packSizeMax[bi] <= 0 ? 0 : rng.nextInt(cfg.packSizeMin[bi], cfg.packSizeMax[bi]);
    arena.pack = size > 0 ? rollPack(rng, cfg.enemyWeights, size) : emptyPack();
    f.crystalNode = exitRoom.id;
    f.crystalRequiresBossKill = true;
    f.totalEnemies = size;
    f.killQuota = 0;
    f.roomRoll = 0;
    return f;
  }

  const rescueLayout = cfg.rescueFloor > 0 && floorNumber === cfg.rescueFloor && !cfg.hasPriest;
  const tutorial = cfg.tutorialFloor > 0 && floorNumber === cfg.tutorialFloor && !cfg.hasPriest && !rescueLayout;
  const kind: LayoutKind = rescueLayout ? 'Rescue' : 'Normal';
  f.isTutorial = tutorial;
  f.isRescueLayout = rescueLayout;

  // --- 1. Layout
  const rollMin = Math.min(kMaxRoll, Math.max(1, tutorial ? cfg.tutorialRoomCountMin : cfg.roomCountMin));
  const rollMax = Math.min(kMaxRoll, Math.max(rollMin, tutorial ? cfg.tutorialRoomCountMax : cfg.roomCountMax));
  const roll = rng.nextInt(rollMin, rollMax);
  let L = new Layout();
  let built = false;
  for (let attempt = 0; attempt < cfg.layoutAttempts && !built; attempt++) {
    L = new Layout(); // buildLayout starts from a fresh Layout{}
    built = buildLayout(rng, roll, L, kind) && layoutValid(L, roll, kind);
  }
  if (!built) {
    L = new Layout();
    buildFallback(roll, L, kind);
    f.usedFallbackLayout = true;
  }
  f.roomRoll = roll;
  materialize(L, f);

  // --- 2. Room types
  const weights = normalizedRoomWeights(floorNumber, cfg);
  const roomCount = f.nodes.length;
  const eliteCap = Math.max(1, Math.floor(cfg.eliteMaxFraction * roomCount + 1e-9));
  const typed: boolean[] = new Array<boolean>(roomCount).fill(false);
  f.nodes[f.startNode].type = RoomType.Combat;
  typed[f.startNode] = true;
  if (rescueLayout) {
    const start = f.nodes[f.startNode];
    const r = f.nodes[start.next[0]];
    r.type = RoomType.Elite;
    r.isRescueRoom = true;
    typed[r.id] = true;
    f.rescueNode = r.id;
  }
  const neighborHas = (n: Node, t: RoomType): boolean => n.next.some((nb) => typed[nb] && f.nodes[nb].type === t);
  const elitesAllowed = floorNumber >= cfg.eliteMinFloor && !rescueLayout && !tutorial;
  let elites = 0;
  for (const n of f.nodes) {
    if (typed[n.id]) continue;
    let t = rng.pickWeighted(weights, kRollableRoomTypes) as RoomType;
    if (t === RoomType.Elite && (!elitesAllowed || elites >= eliteCap || neighborHas(n, RoomType.Elite))) t = RoomType.Combat;
    if (t === RoomType.Treasure && neighborHas(n, RoomType.Treasure)) t = RoomType.Combat;
    if (t === RoomType.Elite) elites++;
    n.type = t;
    typed[n.id] = true;
  }

  // --- 3. Enemy packs and reinforcement waves
  const mix = tutorial ? [1, 0, 0, 0] : cfg.enemyWeights;
  f.totalEnemies = 0;
  for (const n of f.nodes) {
    let lo = cfg.packSizeMin[n.type];
    let hi = cfg.packSizeMax[n.type];
    if (tutorial && n.type === RoomType.Combat) {
      lo = cfg.tutorialPackMin;
      hi = cfg.tutorialPackMax;
    }
    const emptyStart = rescueLayout && n.isStart;
    const size = emptyStart || hi <= 0 ? 0 : rng.nextInt(lo, hi);
    n.pack = size > 0 ? rollPack(rng, mix, size) : emptyPack();

    n.hasReinforcements = false;
    n.reinforcements = emptyPack();
    if (n.type === RoomType.Elite) n.hasReinforcements = true;
    else if (n.type === RoomType.Combat && !n.isStart && !tutorial) n.hasReinforcements = rng.chance(cfg.combatReinforcementChance);
    if (n.hasReinforcements && cfg.reinforcementSize > 0) n.reinforcements = rollPack(rng, mix, cfg.reinforcementSize);
    else n.hasReinforcements = false;
    f.totalEnemies += n.pack.size + n.reinforcements.size;
  }

  // --- 4. Hidden teleport crystal
  {
    let eligible: number[] = f.nodes.filter((n) => !n.isStart).map((n) => n.id);
    const nearCrystal = cfg.tutorialFloor > 0 && floorNumber === cfg.tutorialFloor && !rescueLayout;
    if (nearCrystal && cfg.tutorialCrystalMaxDistance > 0) {
      const dist = doorDistances(f, f.startNode); // same breadth-first distances as the C++ inline loop
      const near = eligible.filter((id) => dist[id] >= 1 && dist[id] <= cfg.tutorialCrystalMaxDistance);
      if (near.length > 0) eligible = near;
    }
    if (eligible.length === 0) eligible.push(f.startNode);
    const pick = eligible[rng.nextInt(0, eligible.length - 1)];
    f.crystalNode = pick;
    f.nodes[pick].hasCrystal = true;
  }

  // --- 5. Kill quota
  f.killQuota = computeKillQuota(f, cfg);
  return f;
}
