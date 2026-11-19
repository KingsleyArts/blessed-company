// Port of tests/floor-generator/tests.cpp (Unreal reference), same rules and the same seed counts.
// Floors are a GRID of rooms joined by N/E/S/W doors (DESIGN-DECISIONS 8). One named test per rule.
import { describe, it } from 'vitest';
import {
  Dir, EnemyType, RoomType, computeKillQuota, defaultConfig, dirDx, dirDy, doorDistances, findPath, generate, isBossFloor,
  isReachable, isValidShapeMask, kDirBit, kDirCount, kEnemyTypeCount, kRollableRoomTypes, kShapeCount, kShapeMasks, makeConfig,
  normalizedRoomWeights, oppositeDir, revealNeighbors, revealNode, roomAt, scalingMultiplier, shapeOpenCount,
  type Config, type Floor,
} from './floorGenerator';
import { canonicalFloor } from './goldenFloor';

/** C++-style CHECK: far cheaper than expect() inside the multi-thousand-floor sweeps; the message is the original assertion. */
function CHECK(cond: boolean, what: string): void {
  if (!cond) throw new Error(`FAILED: ${what}`);
}
const big = (_k: string, v: unknown): unknown => (typeof v === 'bigint' ? v.toString() : v);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a, big) === JSON.stringify(b, big);

const floorsEqual = (a: Floor, b: Floor): boolean => canonicalFloor(a) === canonicalFloor(b) && a.scaling === b.scaling;
const genP = (seed: number, floor: number, hasPriest: boolean, cfg: Config = defaultConfig()): Floor => generate(seed, floor, { ...cfg, hasPriest });
const countType = (f: Floor, t: RoomType): number => f.nodes.filter((n) => n.type === t).length;
const eliteCapOf = (frac: number, rooms: number): number => Math.max(1, Math.floor(frac * rooms + 1e-9));

/** The layout rules, checked on any floor. */
function checkLayoutRules(f: Floor): void {
  let nonDead = 0;
  for (const n of f.nodes) {
    CHECK(isValidShapeMask(n.shape), "expect(isValidShapeMask(n.shape)).toBe(true)");
    CHECK((n.isDeadEnd) === (shapeOpenCount(n.shape) === 1), "expect(n.isDeadEnd).toBe(shapeOpenCount(n.shape) === 1)");
    nonDead += n.isDeadEnd ? 0 : 1;
    for (let d = 0; d < kDirCount; d++) {
      const open = (n.shape & kDirBit(d)) !== 0;
      const other = roomAt(f, n.gx + dirDx(d), n.gy + dirDy(d));
      CHECK((n.door[d] >= 0) === (open), "expect(n.door[d] >= 0).toBe(open)");
      if (other < 0) { CHECK(!(open), "expect(open).toBe(false)"); continue; }
      CHECK((open) === ((f.nodes[other].shape & kDirBit(oppositeDir(d))) !== 0), "expect(open).toBe((f.nodes[other].shape & kDirBit(oppositeDir(d))) !== 0)"); // a wall never faces an opening
      CHECK((n.door[d] === other) === (open), "expect(n.door[d] === other).toBe(open)");
    }
    CHECK(isReachable(f, f.startNode, n.id), "expect(isReachable(f, f.startNode, n.id)).toBe(true)");
  }
  CHECK(nonDead === f.roomRoll || f.isBoss, "expect(nonDead === f.roomRoll || f.isBoss).toBe(true)");
}

/** Floors 1..maxFloor for seeds 1..seeds, hasPriest both ways (floors 1 and 2 are normal in one pass, tutorial/rescue in the other). */
function forEachFloor(seeds: number, maxFloor: number, fn: (seed: number, floor: number, f: Floor) => void): void {
  for (let hp = 0; hp <= 1; hp++) {
    const cfg = makeConfig({ hasPriest: hp === 1 });
    for (let s = 1; s <= seeds; s++) for (let fl = 1; fl <= maxFloor; fl++) fn(s, fl, generate(s, fl, cfg));
  }
}
const isOrdinary = (f: Floor): boolean => !f.isBoss && !f.isTutorial && !f.isRescueLayout;

/** Every room except the walled-off ones is reachable from the start without entering a walled-off room. */
function reachableAvoiding(f: Floor, walled: number[]): boolean {
  const blocked = new Set(walled);
  const seen = new Set<number>([f.startNode]);
  const q = [f.startNode];
  for (let i = 0; i < q.length; i++) {
    for (const v of f.nodes[q[i]].next) if (!seen.has(v) && !blocked.has(v)) { seen.add(v); q.push(v); }
  }
  return f.nodes.every((n) => blocked.has(n.id) || seen.has(n.id));
}

describe('floor generator (ported C++ rules)', () => {
  it('determinism: same seed and floor give the same floor; different seeds differ', () => {
    for (const s of [0n, 1n, 12345n, 0xdeadbeefcafen]) {
      for (let fl = 1; fl <= 30; fl++) CHECK(floorsEqual(generate(s, fl), generate(s, fl)), "expect(floorsEqual(generate(s, fl), generate(s, fl))).toBe(true)");
    }
    CHECK(!(floorsEqual(generate(1, 3), generate(2, 3))), "expect(floorsEqual(generate(1, 3), generate(2, 3))).toBe(false)");
  });

  it('adjacent floors differ and have different seeds', () => {
    for (let fl = 1; fl < 20; fl++) {
      const a = generate(777, fl);
      const b = generate(777, fl + 1);
      CHECK(!(floorsEqual(a, b)), "expect(floorsEqual(a, b)).toBe(false)");
      CHECK((a.seed) !== (b.seed), "expect(a.seed).not.toBe(b.seed)");
    }
  });

  it('connectivity: 500 seeds x floors 1-10, every room reachable, crystal reachable', () => {
    forEachFloor(500, 10, (_s, _fl, f) => {
      const d = doorDistances(f, f.startNode);
      CHECK((d.length) === (f.nodes.length), "expect(d.length).toBe(f.nodes.length)");
      for (const n of f.nodes) {
        CHECK((d[n.id]) >= (0), "expect(d[n.id]).toBeGreaterThanOrEqual(0)");
        CHECK(isReachable(f, f.startNode, n.id), "expect(isReachable(f, f.startNode, n.id)).toBe(true)");
        CHECK((n.next.length) > (0), "expect(n.next.length).toBeGreaterThan(0)");
      }
      CHECK(f.crystalNode >= 0 && isReachable(f, f.startNode, f.crystalNode), "expect(f.crystalNode >= 0 && isReachable(f, f.startNode, f.crystalNode)).toBe(true)");
    });
  });

  it('doors are symmetric, match the grid, and next lists exactly the doors; grid bounds are tight', () => {
    forEachFloor(500, 10, (_s, _fl, f) => {
      f.nodes.forEach((n, idx) => {
        CHECK((n.id) === (idx), "expect(n.id).toBe(idx)");
        CHECK(n.gx >= 0 && n.gx < f.cols && n.gy >= 0 && n.gy < f.rows, "expect(n.gx >= 0 && n.gx < f.cols && n.gy >= 0 && n.gy < f.rows).toBe(true)");
        const doors: number[] = [];
        for (let d = 0; d < kDirCount; d++) {
          const b = n.door[d];
          if (b < 0) continue;
          CHECK(b < f.nodes.length && b !== n.id, "expect(b < f.nodes.length && b !== n.id).toBe(true)");
          const m = f.nodes[b];
          CHECK(m.gx === n.gx + dirDx(d) && m.gy === n.gy + dirDy(d), "expect(m.gx === n.gx + dirDx(d) && m.gy === n.gy + dirDy(d)).toBe(true)");
          CHECK((m.door[oppositeDir(d)]) === (n.id), "expect(m.door[oppositeDir(d)]).toBe(n.id)");
          doors.push(b);
        }
        CHECK(same(doors, n.next), "expect(doors).toEqual(n.next)");
        for (const o of f.nodes) CHECK(o.id === n.id || o.gx !== n.gx || o.gy !== n.gy, "expect(o.id === n.id || o.gx !== n.gx || o.gy !== n.gy).toBe(true)");
        CHECK((roomAt(f, n.gx, n.gy)) === (n.id), "expect(roomAt(f, n.gx, n.gy)).toBe(n.id)");
      });
      const maxX = Math.max(...f.nodes.map((n) => n.gx));
      const maxY = Math.max(...f.nodes.map((n) => n.gy));
      const minX = Math.min(...f.nodes.map((n) => n.gx));
      const minY = Math.min(...f.nodes.map((n) => n.gy));
      CHECK(same([f.cols, f.rows, minX, minY], [maxX + 1, maxY + 1, 0, 0]), "expect([f.cols, f.rows, minX, minY]).toEqual([maxX + 1, maxY + 1, 0, 0])");
      CHECK((roomAt(f, -1, 0)) === (-1), "expect(roomAt(f, -1, 0)).toBe(-1)");
    });
    CHECK((oppositeDir(Dir.North)) === (Dir.South), "expect(oppositeDir(Dir.North)).toBe(Dir.South)");
    CHECK((oppositeDir(Dir.East)) === (Dir.West), "expect(oppositeDir(Dir.East)).toBe(Dir.West)");
  });

  it('only the 13 tiles exist and every one is used; no straight corridors', () => {
    const allowed = new Set([0b1111, 0b1001, 0b0011, 0b1100, 0b0110, 0b1011, 0b1110, 0b1101, 0b0111, 0b0001, 0b0010, 0b0100, 0b1000]);
    CHECK(allowed.size === 13 && kShapeCount === 13, "expect(allowed.size === 13 && kShapeCount === 13).toBe(true)");
    for (let i = 0; i < kShapeCount; i++) CHECK(allowed.has(kShapeMasks[i]), "expect(allowed.has(kShapeMasks[i])).toBe(true)");
    CHECK(!(allowed.has(kDirBit(Dir.North) | kDirBit(Dir.South))), "expect(allowed.has(kDirBit(Dir.North) | kDirBit(Dir.South))).toBe(false)");
    CHECK(!(allowed.has(kDirBit(Dir.East) | kDirBit(Dir.West))), "expect(allowed.has(kDirBit(Dir.East) | kDirBit(Dir.West))).toBe(false)");
    const seen = new Set<number>();
    forEachFloor(2000, 9, (_s, _fl, f) => {
      for (const n of f.nodes) {
        CHECK(allowed.has(n.shape), "expect(allowed.has(n.shape)).toBe(true)");
        let mask = 0;
        for (let d = 0; d < kDirCount; d++) if (n.door[d] >= 0) mask |= 1 << d;
        CHECK((mask) === (n.shape), "expect(mask).toBe(n.shape)");
        CHECK((n.isDeadEnd) === (shapeOpenCount(n.shape) === 1), "expect(n.isDeadEnd).toBe(shapeOpenCount(n.shape) === 1)");
        seen.add(n.shape);
      }
    });
    CHECK((seen.size) === (13), "expect(seen.size).toBe(13)");
  });

  it('the start room is one of the 9 non-dead-end shapes, exactly one, except the rescue floor', () => {
    const starts = new Set<number>();
    forEachFloor(2000, 9, (_s, _fl, f) => {
      const s = f.nodes[f.startNode];
      if (f.isRescueLayout) { CHECK(s.isStart && s.isDeadEnd, "expect(s.isStart && s.isDeadEnd).toBe(true)"); return; }
      CHECK(s.isStart && !s.isDeadEnd && shapeOpenCount(s.shape) >= 2, "expect(s.isStart && !s.isDeadEnd && shapeOpenCount(s.shape) >= 2).toBe(true)");
      CHECK((f.nodes.filter((r) => r.isStart).length) === (1), "expect(f.nodes.filter((r) => r.isStart).length).toBe(1)");
      starts.add(s.shape);
    });
    CHECK((starts.size) === (9), "expect(starts.size).toBe(9)");
  });

  it('non-dead-end room count equals the roll (10-20); dead ends come on top; the whole range is rolled', () => {
    const cfg = defaultConfig();
    CHECK(same([cfg.roomCountMin, cfg.roomCountMax], [10, 20]), "expect([cfg.roomCountMin, cfg.roomCountMax]).toEqual([10, 20])");
    const hist = new Map<number, number>();
    forEachFloor(2000, 9, (_s, _fl, f) => {
      if (!isOrdinary(f)) return;
      const dead = f.nodes.filter((n) => n.isDeadEnd).length;
      const nonDead = f.nodes.length - dead;
      CHECK(nonDead >= cfg.roomCountMin && nonDead <= cfg.roomCountMax, "expect(nonDead >= cfg.roomCountMin && nonDead <= cfg.roomCountMax).toBe(true)");
      CHECK((nonDead) === (f.roomRoll), "expect(nonDead).toBe(f.roomRoll)");
      CHECK((dead) >= (1), "expect(dead).toBeGreaterThanOrEqual(1)");
      hist.set(nonDead, (hist.get(nonDead) ?? 0) + 1);
    });
    for (let r = 10; r <= 20; r++) CHECK((hist.get(r) ?? 0) > (0), "expect(hist.get(r) ?? 0).toBeGreaterThan(0)");
  });

  it('no opening faces a wall or an empty cell, and no wall faces an opening', () => {
    let edges = 0;
    forEachFloor(3000, 9, (_s, _fl, f) => {
      for (const n of f.nodes) {
        for (let d = 0; d < kDirCount; d++) {
          const open = (n.shape & kDirBit(d)) !== 0;
          const other = roomAt(f, n.gx + dirDx(d), n.gy + dirDy(d));
          if (other < 0) { CHECK(!(open), "expect(open).toBe(false)"); continue; }
          CHECK((open) === ((f.nodes[other].shape & kDirBit(oppositeDir(d))) !== 0), "expect(open).toBe((f.nodes[other].shape & kDirBit(oppositeDir(d))) !== 0)");
          CHECK((n.door[d] === other) === (open), "expect(n.door[d] === other).toBe(open)");
          edges++;
        }
      }
    });
    CHECK((edges) > (0), "expect(edges).toBeGreaterThan(0)");
  });

  it('all rooms are reachable from the start', () => {
    forEachFloor(2000, 9, (_s, _fl, f) => {
      const d = doorDistances(f, f.startNode);
      for (const n of f.nodes) CHECK((d[n.id]) >= (0), "expect(d[n.id]).toBeGreaterThanOrEqual(0)");
    });
  });

  it('fallback layout is valid and bounded (zero redraws), and the normal path rarely needs it', () => {
    let fallbacks = 0;
    let rescueFallbacks = 0;
    for (let hp = 0; hp <= 1; hp++) {
      const cfg = makeConfig({ layoutAttempts: 0, hasPriest: hp === 1 });
      for (let seed = 1; seed <= 300; seed++) {
        for (let fl = 1; fl <= 9; fl++) {
          const f = generate(seed, fl, cfg);
          CHECK(f.usedFallbackLayout, "expect(f.usedFallbackLayout).toBe(true)");
          fallbacks++;
          rescueFallbacks += f.isRescueLayout ? 1 : 0;
          checkLayoutRules(f);
          const lo = f.isTutorial ? cfg.tutorialRoomCountMin : cfg.roomCountMin;
          const hi = f.isTutorial ? cfg.tutorialRoomCountMax : cfg.roomCountMax;
          CHECK(f.roomRoll >= lo && f.roomRoll <= hi, "expect(f.roomRoll >= lo && f.roomRoll <= hi).toBe(true)");
          const st = f.nodes[f.startNode];
          CHECK((st.isDeadEnd) === (f.isRescueLayout), "expect(st.isDeadEnd).toBe(f.isRescueLayout)");
          if (f.isRescueLayout) {
            CHECK(st.next.length === 1 && st.next[0] === f.rescueNode && !f.nodes[f.rescueNode].isDeadEnd, "expect(st.next.length === 1 && st.next[0] === f.rescueNode && !f.nodes[f.rescueNode].isDeadEnd).toBe(true)");
          }
          CHECK(floorsEqual(f, generate(seed, fl, cfg)), "expect(floorsEqual(f, generate(seed, fl, cfg))).toBe(true)");
        }
      }
    }
    CHECK(same([fallbacks, rescueFallbacks], [5400, 300]), "expect([fallbacks, rescueFallbacks]).toEqual([5400, 300])");
    let used = 0;
    let all = 0;
    forEachFloor(2000, 9, (_s, _fl, f) => { used += f.usedFallbackLayout ? 1 : 0; all++; });
    CHECK((used * 100) <= (all), "expect(used * 100).toBeLessThanOrEqual(all)"); // at most 1 percent
  });

  it('floor 10 (boss) keeps its layout and map-stream packs (golden values from before the rework)', () => {
    const golden = [
      { seed: 1, c: [2, 2, 1, 0], floorSeed: 8699986946485820811n },
      { seed: 2, c: [4, 0, 1, 0], floorSeed: 637141866433132751n },
      { seed: 3, c: [1, 2, 1, 1], floorSeed: 16435871523617079444n },
      { seed: 777, c: [2, 1, 2, 0], floorSeed: 16646954223701729392n },
    ];
    for (const g of golden) {
      const f = generate(g.seed, 10);
      CHECK(f.isBoss && f.nodes.length === 2 && f.cols === 2 && f.rows === 1 && f.startNode === 0 && f.crystalNode === 1, "expect(f.isBoss && f.nodes.length === 2 && f.cols === 2 && f.rows === 1 && f.startNode === 0 && f.crystalNode === 1).toBe(true)");
      CHECK((f.seed) === (g.floorSeed), "expect(f.seed).toBe(g.floorSeed)");
      CHECK(same([f.totalEnemies, f.killQuota, f.crystalRequiresBossKill], [5, 0, true]), "expect([f.totalEnemies, f.killQuota, f.crystalRequiresBossKill]).toEqual([5, 0, true])");
      CHECK(same(f.nodes[0].pack.counts, g.c), "expect(f.nodes[0].pack.counts).toEqual(g.c)");
      CHECK((f.nodes[0].door[Dir.East]) === (1), "expect(f.nodes[0].door[Dir.East]).toBe(1)");
      CHECK((f.nodes[1].door[Dir.West]) === (0), "expect(f.nodes[1].door[Dir.West]).toBe(0)");
    }
  });

  it('crystal rules: exactly one, never in the start room, hidden, and its location varies', () => {
    forEachFloor(500, 10, (_s, _fl, f) => {
      const crystals = f.nodes.filter((n) => n.hasCrystal);
      CHECK((crystals.length) === (1), "expect(crystals.length).toBe(1)");
      CHECK((crystals[0].id) === (f.crystalNode), "expect(crystals[0].id).toBe(f.crystalNode)");
      CHECK(f.crystalNode >= 0 && f.crystalNode < f.nodes.length, "expect(f.crystalNode >= 0 && f.crystalNode < f.nodes.length).toBe(true)");
      CHECK((f.crystalNode) !== (f.startNode), "expect(f.crystalNode).not.toBe(f.startNode)");
      CHECK((f.nodes[f.crystalNode].type) !== (RoomType.Boss), "expect(f.nodes[f.crystalNode].type).not.toBe(RoomType.Boss)");
      CHECK(!(f.nodes[f.crystalNode].revealed), "expect(f.nodes[f.crystalNode].revealed).toBe(false)");
    });
    const where = new Set<number>();
    for (let s = 1; s <= 200; s++) where.add(generate(s, 3).crystalNode);
    CHECK((where.size) >= (6), "expect(where.size).toBeGreaterThanOrEqual(6)");
  });

  it('kill quota: about 40 percent, capped to the avoidable enemies; the fraction is data-driven', () => {
    const cfg = defaultConfig();
    forEachFloor(500, 10, (_s, _fl, f) => {
      if (f.isBoss) return;
      let sum = 0;
      for (const n of f.nodes) {
        sum += n.pack.size + n.reinforcements.size;
        CHECK((n.pack.counts.reduce((a, b) => a + b, 0)) === (n.pack.size), "expect(n.pack.counts.reduce((a, b) => a + b, 0)).toBe(n.pack.size)");
      }
      CHECK((sum) === (f.totalEnemies), "expect(sum).toBe(f.totalEnemies)");
      CHECK((f.totalEnemies) > (0), "expect(f.totalEnemies).toBeGreaterThan(0)");
      CHECK((f.killQuota) === (computeKillQuota(f, cfg)), "expect(f.killQuota).toBe(computeKillQuota(f, cfg))");
      const ratio = f.killQuota / f.totalEnemies;
      CHECK(f.killQuota >= 1 && f.killQuota <= f.totalEnemies, "expect(f.killQuota >= 1 && f.killQuota <= f.totalEnemies).toBe(true)");
      let eliteEnemies = 0;
      for (const n of f.nodes) if (n.type === RoomType.Elite && !n.isRescueRoom) eliteEnemies += n.pack.size + n.reinforcements.size;
      CHECK(ratio >= cfg.killQuotaFraction - 1e-9 || f.killQuota === f.totalEnemies - eliteEnemies, "expect(ratio >= cfg.killQuotaFraction - 1e-9 || f.killQuota === f.totalEnemies - eliteEnemies).toBe(true)");
      CHECK((f.killQuota) <= (cfg.killQuotaFraction * f.totalEnemies + 1), "expect(f.killQuota).toBeLessThanOrEqual(cfg.killQuotaFraction * f.totalEnemies + 1)");
    });
    const f = generate(5, 2, makeConfig({ killQuotaFraction: 0.5 }));
    CHECK((f.killQuota) >= (Math.trunc((f.totalEnemies + 1) / 2) - 1), "expect(f.killQuota).toBeGreaterThanOrEqual(Math.trunc((f.totalEnemies + 1) / 2) - 1)");
    CHECK((f.killQuota) <= (Math.trunc(f.totalEnemies / 2) + 1), "expect(f.killQuota).toBeLessThanOrEqual(Math.trunc(f.totalEnemies / 2) + 1)");
  });

  it('boss interval and scaling', () => {
    for (const fl of [0, 1, 9, 11]) CHECK(!(isBossFloor(fl)), "expect(isBossFloor(fl)).toBe(false)");
    CHECK(isBossFloor(10) && isBossFloor(20), "expect(isBossFloor(10) && isBossFloor(20)).toBe(true)");
    const five = makeConfig({ bossInterval: 5 });
    CHECK(isBossFloor(5, five) && isBossFloor(10, five) && isBossFloor(10, defaultConfig()), "expect(isBossFloor(5, five) && isBossFloor(10, five) && isBossFloor(10, defaultConfig())).toBe(true)");
    for (let fl = 1; fl <= 30; fl++) {
      const f = generate(99, fl);
      CHECK((f.isBoss) === (isBossFloor(fl)), "expect(f.isBoss).toBe(isBossFloor(fl))");
      CHECK((f.nodes.filter((n) => n.type === RoomType.Boss).length) === (f.isBoss ? 1 : 0), "expect(f.nodes.filter((n) => n.type === RoomType.Boss).length).toBe(f.isBoss ? 1 : 0)");
    }
    const near = (a: number, b: number): void => CHECK((Math.abs(a - b)) < (1e-12), "expect(Math.abs(a - b)).toBeLessThan(1e-12)");
    near(scalingMultiplier(1), 1);
    near(scalingMultiplier(2), 1.08);
    near(scalingMultiplier(5), Math.pow(1.08, 4));
    CHECK((scalingMultiplier(3)) > (scalingMultiplier(2)), "expect(scalingMultiplier(3)).toBeGreaterThan(scalingMultiplier(2))");
    near(scalingMultiplier(10), Math.pow(1.08, 9) * defaultConfig().bossSpike);
    CHECK((scalingMultiplier(10)) > (Math.pow(1.08, 9)), "expect(scalingMultiplier(10)).toBeGreaterThan(Math.pow(1.08, 9))");
  });

  it('boss floors: arena + Exit, no roll, crystal only after the boss dies, no quota (intervals 10, 5, 7)', () => {
    for (const interval of [10, 5, 7]) {
      for (let hp = 0; hp <= 1; hp++) {
        const cfg = makeConfig({ bossInterval: interval, hasPriest: hp === 1 });
        for (let s = 1; s <= 100; s++) {
          for (let fl = 1; fl <= 30; fl++) {
            const f = generate(s, fl, cfg);
            CHECK((f.isBoss) === (fl % interval === 0), "expect(f.isBoss).toBe(fl % interval === 0)");
            if (!f.isBoss) continue;
            CHECK(f.nodes.length === 2 && f.cols === 2 && f.rows === 1, "expect(f.nodes.length === 2 && f.cols === 2 && f.rows === 1).toBe(true)");
            CHECK(f.roomRoll === 0 && !f.usedFallbackLayout && !f.isTutorial && !f.isRescueLayout && f.rescueNode === -1, "expect(f.roomRoll === 0 && !f.usedFallbackLayout && !f.isTutorial && !f.isRescueLayout && f.rescueNode === -1).toBe(true)");
            checkLayoutRules(f);
            const arena = f.nodes[f.startNode];
            CHECK(arena.type === RoomType.Boss && arena.isStart && arena.revealed && arena.known, "expect(arena.type === RoomType.Boss && arena.isStart && arena.revealed && arena.known).toBe(true)");
            CHECK(!arena.hasCrystal && !arena.hasReinforcements, "expect(!arena.hasCrystal && !arena.hasReinforcements).toBe(true)");
            CHECK((arena.pack.size) === (cfg.packSizeMax[RoomType.Boss]), "expect(arena.pack.size).toBe(cfg.packSizeMax[RoomType.Boss])");
            CHECK(arena.isDeadEnd && arena.shape === kDirBit(Dir.East), "expect(arena.isDeadEnd && arena.shape === kDirBit(Dir.East)).toBe(true)");
            const ex = f.nodes[f.crystalNode];
            CHECK(f.crystalNode === 1 && ex.type === RoomType.Exit && ex.hasCrystal && ex.pack.size === 0 && !ex.isStart, "expect(f.crystalNode === 1 && ex.type === RoomType.Exit && ex.hasCrystal && ex.pack.size === 0 && !ex.isStart).toBe(true)");
            CHECK(ex.isDeadEnd && ex.shape === kDirBit(Dir.West), "expect(ex.isDeadEnd && ex.shape === kDirBit(Dir.West)).toBe(true)");
            CHECK(f.crystalRequiresBossKill, "expect(f.crystalRequiresBossKill).toBe(true)");
            CHECK(same(arena.next, [1]), "expect(arena.next).toEqual([1])");
            CHECK(same(ex.next, [0]), "expect(ex.next).toEqual([0])");
            CHECK(arena.door[Dir.East] === 1 && ex.door[Dir.West] === 0, "expect(arena.door[Dir.East] === 1 && ex.door[Dir.West] === 0).toBe(true)");
            CHECK(ex.known && !ex.revealed, "expect(ex.known && !ex.revealed).toBe(true)");
            CHECK(same([f.killQuota, computeKillQuota(f, cfg)], [0, 0]), "expect([f.killQuota, computeKillQuota(f, cfg)]).toEqual([0, 0])");
            CHECK((f.totalEnemies) === (arena.pack.size), "expect(f.totalEnemies).toBe(arena.pack.size)");
            CHECK((countType(f, RoomType.Elite) + countType(f, RoomType.Treasure)) === (0), "expect(countType(f, RoomType.Elite) + countType(f, RoomType.Treasure)).toBe(0)");
          }
        }
      }
    }
    const n = generate(1, 3);
    CHECK(!n.crystalRequiresBossKill && n.killQuota >= 1, "expect(!n.crystalRequiresBossKill && n.killQuota >= 1).toBe(true)");
  });

  it('room type rules: start is Combat, Elite cap and spacing, Treasure spacing, no Rest', () => {
    const cfg = defaultConfig();
    forEachFloor(500, 10, (_s, _fl, f) => {
      if (f.isBoss) return;
      CHECK((f.nodes[f.startNode].type) === (RoomType.Combat), "expect(f.nodes[f.startNode].type).toBe(RoomType.Combat)");
      let elites = 0;
      for (const n of f.nodes) {
        CHECK(([RoomType.Combat, RoomType.Elite, RoomType.Treasure]).includes(n.type), "expect([RoomType.Combat, RoomType.Elite, RoomType.Treasure]).toContain(n.type)");
        if (n.type === RoomType.Elite) {
          elites++;
          CHECK(n.hasReinforcements && n.reinforcements.size > 0, "expect(n.hasReinforcements && n.reinforcements.size > 0).toBe(true)");
          for (const nb of n.next) CHECK((f.nodes[nb].type) !== (RoomType.Elite), "expect(f.nodes[nb].type).not.toBe(RoomType.Elite)");
        }
        if (n.type === RoomType.Treasure) {
          for (const nb of n.next) CHECK((f.nodes[nb].type) !== (RoomType.Treasure), "expect(f.nodes[nb].type).not.toBe(RoomType.Treasure)");
          CHECK(n.pack.size === 0 && !n.hasReinforcements, "expect(n.pack.size === 0 && !n.hasReinforcements).toBe(true)");
        }
        if ((n.type === RoomType.Combat || n.type === RoomType.Elite) && !(f.isRescueLayout && n.isStart)) CHECK((n.pack.size) > (0), "expect(n.pack.size).toBeGreaterThan(0)");
      }
      CHECK((elites) <= (eliteCapOf(cfg.eliteMaxFraction, f.nodes.length)), "expect(elites).toBeLessThanOrEqual(eliteCapOf(cfg.eliteMaxFraction, f.nodes.length))");
      CHECK((countType(f, RoomType.Rest)) === (0), "expect(countType(f, RoomType.Rest)).toBe(0)");
    });
  });

  it('fog: only the start is visited; it and its neighbours are known; revealing a room reveals its neighbours', () => {
    forEachFloor(100, 10, (_s, _fl, f) => {
      const start = f.nodes[f.startNode];
      CHECK(start.revealed && start.known, "expect(start.revealed && start.known).toBe(true)");
      for (const n of f.nodes) {
        if (n.isStart) continue;
        CHECK(!(n.revealed), "expect(n.revealed).toBe(false)");
        CHECK((n.known) === (start.next.includes(n.id)), "expect(n.known).toBe(start.next.includes(n.id))");
      }
    });
    const f = generate(3, 1);
    const a = f.nodes[f.startNode].next[0];
    CHECK(!(f.nodes[a].revealed), "expect(f.nodes[a].revealed).toBe(false)");
    revealNode(f, a);
    CHECK(f.nodes[a].revealed && f.nodes[a].known, "expect(f.nodes[a].revealed && f.nodes[a].known).toBe(true)");
    for (const nb of f.nodes[a].next) CHECK(f.nodes[nb].known, "expect(f.nodes[nb].known).toBe(true)");
    const g = generate(3, 1);
    const b = g.nodes[g.startNode].next[0];
    revealNeighbors(g, b);
    CHECK(!(g.nodes[b].revealed), "expect(g.nodes[b].revealed).toBe(false)");
    for (const nb of g.nodes[b].next) CHECK(g.nodes[nb].known, "expect(g.nodes[nb].known).toBe(true)");
  });

  it('path finding walks only through visited rooms (final room may be known, unvisited)', () => {
    const f = genP(11, 1, true);
    const start = f.startNode;
    CHECK(same(findPath(f, start, start), []), "expect(findPath(f, start, start)).toEqual([])");
    CHECK(same(findPath(f, start, -1), []), "expect(findPath(f, start, -1)).toEqual([])");
    CHECK(same(findPath(f, start, 9999), []), "expect(findPath(f, start, 9999)).toEqual([])");
    const unknown = f.nodes.find((n) => !n.known)?.id ?? -1;
    CHECK((unknown) >= (0), "expect(unknown).toBeGreaterThanOrEqual(0)");
    CHECK(same(findPath(f, start, unknown), []), "expect(findPath(f, start, unknown)).toEqual([])");
    const a = f.nodes[start].next[0];
    CHECK(same(findPath(f, start, a), [a]), "expect(findPath(f, start, a)).toEqual([a])");
    let cur = a;
    const chain = [a];
    revealNode(f, a);
    for (let step = 0; step < 3; step++) {
      const nxt = f.nodes[cur].next.find((nb) => !f.nodes[nb].revealed) ?? -1;
      if (nxt < 0) break;
      revealNode(f, nxt);
      chain.push(nxt);
      cur = nxt;
    }
    CHECK((chain.length) >= (3), "expect(chain.length).toBeGreaterThanOrEqual(3)");
    const back = findPath(f, cur, start);
    CHECK(back.length > 0 && back[back.length - 1] === start, "expect(back.length > 0 && back[back.length - 1] === start).toBe(true)");
    for (let i = 0; i + 1 < back.length; i++) CHECK(f.nodes[back[i]].revealed, "expect(f.nodes[back[i]].revealed).toBe(true)");
    CHECK((back.length) <= (chain.length), "expect(back.length).toBeLessThanOrEqual(chain.length)");
    let at = cur;
    for (const step of back) {
      CHECK((f.nodes[at].next).includes(step), "expect(f.nodes[at].next).toContain(step)");
      at = step;
    }
    const frontier = f.nodes.find((n) => n.known && !n.revealed)?.id ?? -1;
    CHECK((frontier) >= (0), "expect(frontier).toBeGreaterThanOrEqual(0)");
    const toFrontier = findPath(f, start, frontier);
    CHECK(toFrontier.length > 0 && toFrontier[toFrontier.length - 1] === frontier, "expect(toFrontier.length > 0 && toFrontier[toFrontier.length - 1] === frontier).toBe(true)");
    for (let i = 0; i + 1 < toFrontier.length; i++) CHECK(f.nodes[toFrontier[i]].revealed, "expect(f.nodes[toFrontier[i]].revealed).toBe(true)");
    for (const n of f.nodes) if (!n.known && !n.revealed) CHECK(same(findPath(f, start, n.id), []), "expect(findPath(f, start, n.id)).toEqual([])");

    const g = genP(11, 1, true);
    for (const n of g.nodes) n.known = true;
    const dist = doorDistances(g, g.startNode);
    for (const n of g.nodes) {
      if (dist[n.id] >= 2) CHECK(same(findPath(g, g.startNode, n.id), []), "expect(findPath(g, g.startNode, n.id)).toEqual([])");
      if (dist[n.id] === 1) CHECK((findPath(g, g.startNode, n.id).length) === (1), "expect(findPath(g, g.startNode, n.id).length).toBe(1)");
    }
    const all = generate(21, 4);
    for (const n of all.nodes) { n.revealed = true; n.known = true; }
    for (const n of all.nodes) {
      const p = findPath(all, all.startNode, n.id);
      CHECK((p.length) === (doorDistances(all, all.startNode)[n.id]), "expect(p.length).toBe(doorDistances(all, all.startNode)[n.id])");
      CHECK(same(p, findPath(all, all.startNode, n.id)), "expect(p).toEqual(findPath(all, all.startNode, n.id))");
    }
  });

  it('room weights are normalized per tier (Rest is gone)', () => {
    const cfg = defaultConfig();
    CHECK(kRollableRoomTypes === 3 && cfg.weightTiers[0].weights.length === 3, "expect(kRollableRoomTypes === 3 && cfg.weightTiers[0].weights.length === 3).toBe(true)");
    for (const fl of [1, 2, 3, 5, 10, 50]) {
      const w = normalizedRoomWeights(fl, cfg);
      for (const x of w) CHECK((x) > (0), "expect(x).toBeGreaterThan(0)");
      CHECK((Math.abs(w.reduce((a, b) => a + b, 0) - 100)) < (1e-9), "expect(Math.abs(w.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(1e-9)");
    }
    CHECK((Math.abs(normalizedRoomWeights(1, cfg)[0] - (55 * 100) / 80)) < (1e-9), "expect(Math.abs(normalizedRoomWeights(1, cfg)[0] - (55 * 100) / 80)).toBeLessThan(1e-9)");
    CHECK((Math.abs(normalizedRoomWeights(3, cfg)[1] - (20 * 100) / 75)) < (1e-9), "expect(Math.abs(normalizedRoomWeights(3, cfg)[1] - (20 * 100) / 75)).toBeLessThan(1e-9)");
  });
});

// ---------------------------------------------------------------- Elite rules (DESIGN-DECISIONS 8, Nov 12-13)
describe('floor generator: Elites, rescue floor, tutorial floor (ported C++ rules)', () => {
  it('no Elite rooms on floor 1', () => {
    for (let hp = 0; hp <= 1; hp++) {
      for (let s = 1; s <= 500; s++) {
        const f = genP(s, 1, hp === 1);
        CHECK((countType(f, RoomType.Elite)) === (0), "expect(countType(f, RoomType.Elite)).toBe(0)");
        CHECK((f.rescueNode) === (-1), "expect(f.rescueNode).toBe(-1)");
        for (const n of f.nodes) CHECK(!(n.isRescueRoom), "expect(n.isRescueRoom).toBe(false)");
      }
    }
  });

  it('floor 2 without the Priest starts in an empty dead end next to the single Elite rescue room', () => {
    CHECK(defaultConfig().rescueFloor === 2 && !defaultConfig().hasPriest, "expect(defaultConfig().rescueFloor === 2 && !defaultConfig().hasPriest).toBe(true)");
    const startShapes = new Set<number>();
    const rescueShapes = new Set<number>();
    for (let lowered = 0; lowered <= 1; lowered++) {
      const c = makeConfig({ hasPriest: false, ...(lowered ? { eliteMinFloor: 1 } : {}) });
      for (let s = 1; s <= 3000; s++) {
        const f = generate(s, 2, c);
        CHECK(!f.isBoss && f.isRescueLayout && !f.isTutorial, "expect(!f.isBoss && f.isRescueLayout && !f.isTutorial).toBe(true)");
        checkLayoutRules(f);
        const st = f.nodes[f.startNode];
        CHECK(st.isStart && st.isDeadEnd && st.type === RoomType.Combat && st.pack.size === 0 && !st.hasReinforcements && !st.hasCrystal, "expect(st.isStart && st.isDeadEnd && st.type === RoomType.Combat && st.pack.size === 0 && !st.hasReinforcements && !st.hasCrystal).toBe(true)");
        CHECK(same(st.next, [f.rescueNode]), "expect(st.next).toEqual([f.rescueNode])");
        startShapes.add(st.shape);
        CHECK((countType(f, RoomType.Elite)) === (1), "expect(countType(f, RoomType.Elite)).toBe(1)");
        const flagged = f.nodes.filter((n) => n.isRescueRoom);
        CHECK((flagged.length) === (1), "expect(flagged.length).toBe(1)");
        CHECK((flagged[0].type) === (RoomType.Elite), "expect(flagged[0].type).toBe(RoomType.Elite)");
        CHECK((f.rescueNode) >= (0), "expect(f.rescueNode).toBeGreaterThanOrEqual(0)");
        const r = f.nodes[f.rescueNode];
        CHECK(r.type === RoomType.Elite && r.isRescueRoom && !r.isStart && !r.isDeadEnd, "expect(r.type === RoomType.Elite && r.isRescueRoom && !r.isStart && !r.isDeadEnd).toBe(true)");
        CHECK(r.door.includes(f.startNode), "expect(r.door.includes(f.startNode)).toBe(true)");
        rescueShapes.add(r.shape);
        CHECK(r.pack.size > 0 && r.hasReinforcements && r.reinforcements.size > 0, "expect(r.pack.size > 0 && r.hasReinforcements && r.reinforcements.size > 0).toBe(true)");
        CHECK(f.roomRoll >= c.roomCountMin && f.roomRoll <= c.roomCountMax, "expect(f.roomRoll >= c.roomCountMin && f.roomRoll <= c.roomCountMax).toBe(true)");
        CHECK(isReachable(f, f.startNode, f.rescueNode), "expect(isReachable(f, f.startNode, f.rescueNode)).toBe(true)");
        CHECK((f.crystalNode) !== (f.startNode), "expect(f.crystalNode).not.toBe(f.startNode)");
        CHECK((f.killQuota) === (computeKillQuota(f, c)), "expect(f.killQuota).toBe(computeKillQuota(f, c))");
        CHECK((f.killQuota) >= (1), "expect(f.killQuota).toBeGreaterThanOrEqual(1)");
        CHECK(floorsEqual(f, generate(s, 2, c)), "expect(floorsEqual(f, generate(s, 2, c))).toBe(true)");
      }
    }
    CHECK(same([startShapes.size, rescueShapes.size], [4, 9]), "expect([startShapes.size, rescueShapes.size]).toEqual([4, 9])");
    for (let s = 1; s <= 500; s++) {
      const g = genP(s, 2, true);
      CHECK(countType(g, RoomType.Elite) === 0 && g.rescueNode === -1 && !g.isRescueLayout, "expect(countType(g, RoomType.Elite) === 0 && g.rescueNode === -1 && !g.isRescueLayout).toBe(true)");
      for (const n of g.nodes) CHECK(!(n.isRescueRoom), "expect(n.isRescueRoom).toBe(false)");
      CHECK(!g.nodes[g.startNode].isDeadEnd && g.nodes[g.startNode].pack.size > 0, "expect(!g.nodes[g.startNode].isDeadEnd && g.nodes[g.startNode].pack.size > 0).toBe(true)");
      CHECK((g.killQuota) >= (1), "expect(g.killQuota).toBeGreaterThanOrEqual(1)");
      CHECK(floorsEqual(g, genP(s, 2, true)), "expect(floorsEqual(g, genP(s, 2, true))).toBe(true)");
    }
    for (let s = 1; s <= 50; s++) {
      const f = generate(s, 2, makeConfig({ rescueFloor: 0 }));
      CHECK(f.rescueNode === -1 && countType(f, RoomType.Elite) === 0 && !f.isRescueLayout, "expect(f.rescueNode === -1 && countType(f, RoomType.Elite) === 0 && !f.isRescueLayout).toBe(true)");
    }
  });

  it('floors 3+: Elites may block paths but every room stays reachable and the quota avoids Elites', () => {
    const cfg = defaultConfig();
    let floorsWithElite = 0;
    let blockingFloors = 0;
    for (let hp = 0; hp <= 1; hp++) {
      for (let s = 1; s <= 500; s++) {
        for (let fl = 3; fl <= 12; fl++) {
          const f = genP(s, fl, hp === 1);
          if (f.isBoss) { CHECK((countType(f, RoomType.Elite)) === (0), "expect(countType(f, RoomType.Elite)).toBe(0)"); continue; }
          const elites: number[] = [];
          for (const n of f.nodes) {
            if (n.type !== RoomType.Elite) continue;
            elites.push(n.id);
            CHECK(!n.isRescueRoom && !n.isStart, "expect(!n.isRescueRoom && !n.isStart).toBe(true)");
            CHECK(n.pack.size > 0 && n.hasReinforcements, "expect(n.pack.size > 0 && n.hasReinforcements).toBe(true)");
            for (const nb of n.next) CHECK((f.nodes[nb].type) !== (RoomType.Elite), "expect(f.nodes[nb].type).not.toBe(RoomType.Elite)");
          }
          CHECK((f.rescueNode) === (-1), "expect(f.rescueNode).toBe(-1)");
          CHECK((elites.length) <= (eliteCapOf(cfg.eliteMaxFraction, f.nodes.length)), "expect(elites.length).toBeLessThanOrEqual(eliteCapOf(cfg.eliteMaxFraction, f.nodes.length))");
          CHECK(reachableAvoiding(f, []), "expect(reachableAvoiding(f, [])).toBe(true)");
          CHECK(f.crystalNode >= 0 && f.crystalNode !== f.startNode, "expect(f.crystalNode >= 0 && f.crystalNode !== f.startNode).toBe(true)");
          if (elites.some((e) => !reachableAvoiding(f, [e]))) blockingFloors++;
          let avoidable = 0;
          for (const n of f.nodes) if (n.type !== RoomType.Elite) avoidable += n.pack.size + n.reinforcements.size;
          CHECK(f.killQuota <= avoidable && f.killQuota >= 1, "expect(f.killQuota <= avoidable && f.killQuota >= 1).toBe(true)");
          floorsWithElite += elites.length ? 1 : 0;
          const dist = doorDistances(f, f.startNode);
          for (const n of f.nodes) {
            CHECK((dist[n.id]) >= (0), "expect(dist[n.id]).toBeGreaterThanOrEqual(0)");
            for (let d = 0; d < kDirCount; d++) if (n.door[d] >= 0) CHECK((f.nodes[n.door[d]].door[oppositeDir(d)]) === (n.id), "expect(f.nodes[n.door[d]].door[oppositeDir(d)]).toBe(n.id)");
          }
        }
      }
    }
    CHECK((floorsWithElite) > (0), "expect(floorsWithElite).toBeGreaterThan(0)");
    CHECK((blockingFloors) > (0), "expect(blockingFloors).toBeGreaterThan(0)");
  });

  it('crystal is in any non-start room (Elite, Treasure, dead end, rescue room included) and reachable', () => {
    let inElite = 0, inTreasure = 0, inDeadEnd = 0, inRescue = 0;
    forEachFloor(3000, 9, (_s, _fl, f) => {
      const crystals = f.nodes.filter((n) => n.hasCrystal).length;
      CHECK(crystals === 1 && f.crystalNode >= 0 && f.crystalNode !== f.startNode && f.nodes[f.crystalNode].hasCrystal, "expect(crystals === 1 && f.crystalNode >= 0 && f.crystalNode !== f.startNode && f.nodes[f.crystalNode].hasCrystal).toBe(true)");
      CHECK(isReachable(f, f.startNode, f.crystalNode) && !f.crystalRequiresBossKill, "expect(isReachable(f, f.startNode, f.crystalNode) && !f.crystalRequiresBossKill).toBe(true)");
      const c = f.nodes[f.crystalNode];
      inElite += c.type === RoomType.Elite ? 1 : 0;
      inTreasure += c.type === RoomType.Treasure ? 1 : 0;
      inDeadEnd += c.isDeadEnd ? 1 : 0;
      inRescue += c.isRescueRoom ? 1 : 0;
    });
    CHECK(inElite > 0 && inTreasure > 0 && inDeadEnd > 0 && inRescue > 0, "expect(inElite > 0 && inTreasure > 0 && inDeadEnd > 0 && inRescue > 0).toBe(true)");
    for (let s = 1; s <= 50; s++) {
      const f = generate(s, 10);
      CHECK(f.crystalNode === 1 && f.nodes[1].type === RoomType.Exit && f.crystalRequiresBossKill, "expect(f.crystalNode === 1 && f.nodes[1].type === RoomType.Exit && f.crystalRequiresBossKill).toBe(true)");
    }
  });

  it('Rest rooms never generate (floors 1-30, both flags, 1500 seeds)', () => {
    let rooms = 0;
    forEachFloor(1500, 30, (_s, _fl, f) => {
      for (const n of f.nodes) { CHECK((n.type) !== (RoomType.Rest), "expect(n.type).not.toBe(RoomType.Rest)"); rooms++; }
    });
    CHECK((rooms) > (0), "expect(rooms).toBeGreaterThan(0)");
    for (const t of defaultConfig().weightTiers) CHECK((t.weights.length) === (kRollableRoomTypes), "expect(t.weights.length).toBe(kRollableRoomTypes)");
  });

  it('Elite adjacency and cap over 3000 seeds, floors 1-9', () => {
    const cfg = defaultConfig();
    for (let s = 1; s <= 3000; s++) {
      for (let fl = 1; fl <= 9; fl++) {
        for (let hp = 0; hp <= 1; hp++) {
          const f = genP(s, fl, hp === 1);
          CHECK((f.nodes[f.startNode].type) === (RoomType.Combat), "expect(f.nodes[f.startNode].type).toBe(RoomType.Combat)");
          const cap = eliteCapOf(cfg.eliteMaxFraction, f.nodes.length);
          let elites = 0;
          for (const n of f.nodes) {
            if (n.type === RoomType.Elite) {
              elites++;
              if (!n.isRescueRoom) CHECK((fl) >= (cfg.eliteMinFloor), "expect(fl).toBeGreaterThanOrEqual(cfg.eliteMinFloor)");
            }
            for (const nb of n.next) {
              const t = f.nodes[nb].type;
              if (n.type === RoomType.Elite) CHECK((t) !== (RoomType.Elite), "expect(t).not.toBe(RoomType.Elite)");
              if (n.type === RoomType.Treasure) CHECK((t) !== (RoomType.Treasure), "expect(t).not.toBe(RoomType.Treasure)");
            }
          }
          CHECK(elites <= cap || (fl === 2 && elites === 1), "expect(elites <= cap || (fl === 2 && elites === 1)).toBe(true)");
          CHECK(reachableAvoiding(f, []), "expect(reachableAvoiding(f, [])).toBe(true)");
          CHECK(f.killQuota === computeKillQuota(f, cfg) && f.killQuota >= 1, "expect(f.killQuota === computeKillQuota(f, cfg) && f.killQuota >= 1).toBe(true)");
          CHECK(floorsEqual(f, genP(s, fl, hp === 1)), "expect(floorsEqual(f, genP(s, fl, hp === 1))).toBe(true)");
        }
      }
    }
  });

  it('every floor 1-30, both ways, 1000 seeds, obeys the layout, Elite cap, crystal and quota rules', () => {
    const base = defaultConfig();
    let boss = 0, rescue = 0, tutorial = 0;
    forEachFloor(1000, 30, (s, fl, f) => {
      checkLayoutRules(f);
      CHECK((f.isBoss) === (fl % 10 === 0), "expect(f.isBoss).toBe(fl % 10 === 0)");
      const st = f.nodes[f.startNode];
      CHECK(st.isStart && st.revealed && st.known, "expect(st.isStart && st.revealed && st.known).toBe(true)");
      CHECK((st.isDeadEnd) === (f.isBoss || f.isRescueLayout), "expect(st.isDeadEnd).toBe(f.isBoss || f.isRescueLayout)");
      boss += f.isBoss ? 1 : 0; rescue += f.isRescueLayout ? 1 : 0; tutorial += f.isTutorial ? 1 : 0;
      CHECK((countType(f, RoomType.Elite)) <= (eliteCapOf(base.eliteMaxFraction, f.nodes.length)), "expect(countType(f, RoomType.Elite)).toBeLessThanOrEqual(eliteCapOf(base.eliteMaxFraction, f.nodes.length))");
      CHECK(f.nodes.filter((n) => n.hasCrystal).length === 1 && f.crystalNode !== f.startNode && isReachable(f, f.startNode, f.crystalNode), "expect(f.nodes.filter((n) => n.hasCrystal).length === 1 && f.crystalNode !== f.startNode && isReachable(f, f.startNode, f.crystalNode)).toBe(true)");
      CHECK((f.crystalRequiresBossKill) === (f.isBoss), "expect(f.crystalRequiresBossKill).toBe(f.isBoss)");
      CHECK(f.isBoss ? f.killQuota === 0 : f.killQuota >= 1, "expect(f.isBoss ? f.killQuota === 0 : f.killQuota >= 1).toBe(true)");
      CHECK(f.rescueNode >= 0 ? fl === 2 && f.isRescueLayout : !f.isRescueLayout, "expect(f.rescueNode >= 0 ? fl === 2 && f.isRescueLayout : !f.isRescueLayout).toBe(true)");
      if (s <= 100) CHECK(floorsEqual(f, genP(s, fl, !(f.isTutorial || f.isRescueLayout) && fl <= 2)), "expect(floorsEqual(f, genP(s, fl, !(f.isTutorial || f.isRescueLayout) && fl <= 2))).toBe(true)");
    });
    CHECK(same([boss, rescue, tutorial], [6000, 1000, 1000]), "expect([boss, rescue, tutorial]).toEqual([6000, 1000, 1000])");
  });

  it('floor 1 without the Priest is a Grunt-only tutorial: smaller roll, no Elites, no waves, small packs', () => {
    const cfg = defaultConfig();
    CHECK(same([cfg.tutorialFloor, cfg.tutorialRoomCountMin, cfg.tutorialRoomCountMax], [1, 5, 8]), "expect([cfg.tutorialFloor, cfg.tutorialRoomCountMin, cfg.tutorialRoomCountMax]).toEqual([1, 5, 8])");
    const hist = new Map<number, number>();
    let treasure = 0;
    for (let s = 1; s <= 3000; s++) {
      const f = genP(s, 1, false);
      CHECK(f.isTutorial && !f.isRescueLayout && !f.isBoss, "expect(f.isTutorial && !f.isRescueLayout && !f.isBoss).toBe(true)");
      checkLayoutRules(f);
      CHECK(f.roomRoll >= cfg.tutorialRoomCountMin && f.roomRoll <= cfg.tutorialRoomCountMax, "expect(f.roomRoll >= cfg.tutorialRoomCountMin && f.roomRoll <= cfg.tutorialRoomCountMax).toBe(true)");
      hist.set(f.roomRoll, (hist.get(f.roomRoll) ?? 0) + 1);
      CHECK(!f.nodes[f.startNode].isDeadEnd && f.nodes[f.startNode].type === RoomType.Combat, "expect(!f.nodes[f.startNode].isDeadEnd && f.nodes[f.startNode].type === RoomType.Combat).toBe(true)");
      CHECK((countType(f, RoomType.Elite) + countType(f, RoomType.Rest)) === (0), "expect(countType(f, RoomType.Elite) + countType(f, RoomType.Rest)).toBe(0)");
      treasure += countType(f, RoomType.Treasure);
      let enemies = 0;
      for (const n of f.nodes) {
        CHECK(!n.hasReinforcements && n.reinforcements.size === 0, "expect(!n.hasReinforcements && n.reinforcements.size === 0).toBe(true)");
        CHECK((n.pack.counts[EnemyType.Grunt]) === (n.pack.size), "expect(n.pack.counts[EnemyType.Grunt]).toBe(n.pack.size)");
        for (let t = 1; t < kEnemyTypeCount; t++) CHECK((n.pack.counts[t]) === (0), "expect(n.pack.counts[t]).toBe(0)");
        if (n.type === RoomType.Combat) CHECK(n.pack.size >= cfg.tutorialPackMin && n.pack.size <= cfg.tutorialPackMax, "expect(n.pack.size >= cfg.tutorialPackMin && n.pack.size <= cfg.tutorialPackMax).toBe(true)");
        enemies += n.pack.size;
      }
      CHECK(enemies === f.totalEnemies && f.killQuota >= 1 && f.killQuota === computeKillQuota(f, cfg), "expect(enemies === f.totalEnemies && f.killQuota >= 1 && f.killQuota === computeKillQuota(f, cfg)).toBe(true)");
      CHECK(floorsEqual(f, genP(s, 1, false)), "expect(floorsEqual(f, genP(s, 1, false))).toBe(true)");
      const g = genP(s, 1, true);
      CHECK(!g.isTutorial && g.roomRoll >= cfg.roomCountMin && g.roomRoll <= cfg.roomCountMax, "expect(!g.isTutorial && g.roomRoll >= cfg.roomCountMin && g.roomRoll <= cfg.roomCountMax).toBe(true)");
    }
    for (let r = cfg.tutorialRoomCountMin; r <= cfg.tutorialRoomCountMax; r++) CHECK((hist.get(r) ?? 0) > (0), "expect(hist.get(r) ?? 0).toBeGreaterThan(0)");
    CHECK((treasure) > (0), "expect(treasure).toBeGreaterThan(0)");
    let waves = 0, nonGrunt = 0;
    for (let s = 1; s <= 300; s++) {
      for (const n of genP(s, 1, true).nodes) { waves += n.hasReinforcements ? 1 : 0; nonGrunt += n.pack.size - n.pack.counts[0]; }
    }
    CHECK(waves > 0 && nonGrunt > 0, "expect(waves > 0 && nonGrunt > 0).toBe(true)");
  });

  it('Elite cap is 20 percent of the rooms, and the avoidable-enemies quota cap never binds in practice', () => {
    const cfg = defaultConfig();
    CHECK((Math.abs(cfg.eliteMaxFraction - 0.2)) < (1e-12), "expect(Math.abs(cfg.eliteMaxFraction - 0.2)).toBeLessThan(1e-12)");
    let binds = 0;
    forEachFloor(1000, 29, (_s, _fl, f) => {
      if (f.isBoss) return;
      CHECK((countType(f, RoomType.Elite)) <= (eliteCapOf(0.2, f.nodes.length)), "expect(countType(f, RoomType.Elite)).toBeLessThanOrEqual(eliteCapOf(0.2, f.nodes.length))");
      let q = Math.ceil(cfg.killQuotaFraction * f.totalEnemies - 1e-9);
      if (q < 1) q = 1;
      if (q > f.totalEnemies) q = f.totalEnemies;
      if (f.killQuota < q) binds++;
    });
    CHECK((binds) === (0), "expect(binds).toBe(0)"); // the C++ run reports 0 of 54000 floors
  });

  it('room type frequencies follow the weight tiers within a loose tolerance (dead ends use the same table)', () => {
    const cfg = defaultConfig();
    for (let tier = 0; tier <= 1; tier++) {
      const fl = tier === 0 ? 1 : 5;
      const counts = [0, 0, 0];
      const deadCounts = [0, 0, 0];
      let total = 0, deadTotal = 0;
      for (let s = 1; s <= 3000; s++) {
        for (const n of genP(s, fl, true, cfg).nodes) {
          if (n.isStart) continue;
          counts[n.type]++; total++;
          if (n.isDeadEnd) { deadCounts[n.type]++; deadTotal++; }
        }
      }
      const w = normalizedRoomWeights(fl, cfg);
      for (let t = 0; t < kRollableRoomTypes; t++) {
        const got = (100 * counts[t]) / total;
        const gotDead = (100 * deadCounts[t]) / deadTotal;
        if (t === RoomType.Combat) CHECK((got) >= (w[0] - 3), "expect(got).toBeGreaterThanOrEqual(w[0] - 3)");
        else if (t === RoomType.Elite) {
          if (tier === 0) CHECK((counts[t]) === (0), "expect(counts[t]).toBe(0)");
          else { CHECK((got) <= (w[1]), "expect(got).toBeLessThanOrEqual(w[1])"); CHECK((got) >= (3), "expect(got).toBeGreaterThanOrEqual(3)"); }
        } else { CHECK((got) <= (w[t] + 1), "expect(got).toBeLessThanOrEqual(w[t] + 1)"); CHECK((got) >= (w[t] * 0.5), "expect(got).toBeGreaterThanOrEqual(w[t] * 0.5)"); }
        CHECK((Math.abs(gotDead - got)) < (8), "expect(Math.abs(gotDead - got)).toBeLessThan(8)");
      }
    }
  });

  it('the Priest flag only changes floors 1 (tutorial) and 2 (rescue layout)', () => {
    for (let s = 1; s <= 200; s++) {
      for (let fl = 1; fl <= 12; fl++) {
        const a = genP(s, fl, false);
        const b = genP(s, fl, true);
        CHECK((floorsEqual(a, b)) === (fl > 2), "expect(floorsEqual(a, b)).toBe(fl > 2)");
        CHECK(floorsEqual(a, genP(s, fl, false)) && floorsEqual(b, genP(s, fl, true)), "expect(floorsEqual(a, genP(s, fl, false)) && floorsEqual(b, genP(s, fl, true))).toBe(true)");
      }
    }
    CHECK(floorsEqual(generate(7, 2), genP(7, 2, false)), "expect(floorsEqual(generate(7, 2), genP(7, 2, false))).toBe(true)");
  });

  it('connectivity and doors also hold with the Priest, floors 1-12', () => {
    for (let s = 1; s <= 500; s++) {
      for (let fl = 1; fl <= 12; fl++) {
        const f = genP(s, fl, true);
        const d = doorDistances(f, f.startNode);
        for (const n of f.nodes) {
          CHECK((d[n.id]) >= (0), "expect(d[n.id]).toBeGreaterThanOrEqual(0)");
          const doors: number[] = [];
          for (let k = 0; k < kDirCount; k++) {
            const b = n.door[k];
            if (b < 0) continue;
            const m = f.nodes[b];
            CHECK(m.gx === n.gx + dirDx(k) && m.gy === n.gy + dirDy(k), "expect(m.gx === n.gx + dirDx(k) && m.gy === n.gy + dirDy(k)).toBe(true)");
            CHECK((m.door[oppositeDir(k)]) === (n.id), "expect(m.door[oppositeDir(k)]).toBe(n.id)");
            doors.push(b);
          }
          CHECK(same(doors, n.next), "expect(doors).toEqual(n.next)");
        }
        CHECK(f.crystalNode >= 0 && isReachable(f, f.startNode, f.crystalNode), "expect(f.crystalNode >= 0 && isReachable(f, f.startNode, f.crystalNode)).toBe(true)");
      }
    }
  });

  it('a huge roomCountMax is clamped (roll <= 40) and stays inside the grid', () => {
    for (const attempts of [0, 200]) {
      const cfg = makeConfig({ roomCountMin: 100, roomCountMax: 100, layoutAttempts: attempts });
      for (let hp = 0; hp <= 1; hp++) {
        for (let seed = 1; seed <= 40; seed++) {
          for (const fl of [1, 2, 3, 5]) {
            const f = genP(seed, fl, hp === 1, cfg);
            CHECK(f.roomRoll >= 1 && f.roomRoll <= 40, "expect(f.roomRoll >= 1 && f.roomRoll <= 40).toBe(true)");
            checkLayoutRules(f);
            CHECK(floorsEqual(f, genP(seed, fl, hp === 1, cfg)), "expect(floorsEqual(f, genP(seed, fl, hp === 1, cfg))).toBe(true)");
          }
        }
      }
    }
  });

  it('rescueFloor == tutorialFloor: the rescue floor wins and keeps its wave', () => {
    const base = defaultConfig();
    const cfg = makeConfig({ tutorialFloor: base.rescueFloor });
    for (let seed = 1; seed <= 200; seed++) {
      const f = genP(seed, cfg.rescueFloor, false, cfg);
      CHECK(!f.isTutorial && f.isRescueLayout, "expect(!f.isTutorial && f.isRescueLayout).toBe(true)");
      CHECK(f.roomRoll >= cfg.roomCountMin && f.roomRoll <= cfg.roomCountMax, "expect(f.roomRoll >= cfg.roomCountMin && f.roomRoll <= cfg.roomCountMax).toBe(true)");
      const r = f.nodes[f.rescueNode];
      CHECK(r.type === RoomType.Elite && r.hasReinforcements && r.reinforcements.size > 0, "expect(r.type === RoomType.Elite && r.hasReinforcements && r.reinforcements.size > 0).toBe(true)");
      checkLayoutRules(f);
    }
  });

  it('tutorial crystal sits 1-2 doors from the start; other floors keep it anywhere; 0 switches the rule off', () => {
    const dist = (f: Floor, id: number): number => doorDistances(f, f.startNode)[id];
    let cfg: Config = makeConfig({ hasPriest: false });
    let atOne = 0, atTwo = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const f = generate(seed, cfg.tutorialFloor, cfg);
      CHECK(f.isTutorial && f.crystalNode >= 0 && f.crystalNode !== f.startNode, "expect(f.isTutorial && f.crystalNode >= 0 && f.crystalNode !== f.startNode).toBe(true)");
      const d = dist(f, f.crystalNode);
      CHECK(d >= 1 && d <= 2, "expect(d >= 1 && d <= 2).toBe(true)");
      atOne += d === 1 ? 1 : 0; atTwo += d === 2 ? 1 : 0;
      CHECK(f.nodes[f.crystalNode].hasCrystal, "expect(f.nodes[f.crystalNode].hasCrystal).toBe(true)");
    }
    CHECK(atOne > 0 && atTwo > 0, "expect(atOne > 0 && atTwo > 0).toBe(true)");
    let far = 0;
    for (let seed = 1; seed <= 200; seed++) { const f = generate(seed, 3, cfg); far += dist(f, f.crystalNode) > 2 ? 1 : 0; }
    CHECK((far) > (20), "expect(far).toBeGreaterThan(20)");
    cfg = { ...cfg, tutorialCrystalMaxDistance: 0 };
    let farTutorial = 0;
    for (let seed = 1; seed <= 200; seed++) { const f = generate(seed, 1, cfg); farTutorial += dist(f, f.crystalNode) > 2 ? 1 : 0; }
    CHECK((farTutorial) > (0), "expect(farTutorial).toBeGreaterThan(0)");
    cfg = { ...cfg, tutorialCrystalMaxDistance: 2, hasPriest: true };
    for (let seed = 1; seed <= 200; seed++) {
      const f = generate(seed, 1, cfg);
      CHECK(!(f.isTutorial), "expect(f.isTutorial).toBe(false)");
      const d = dist(f, f.crystalNode);
      CHECK(d >= 1 && d <= 2, "expect(d >= 1 && d <= 2).toBe(true)");
    }
  });
});
