// RunState port (Core/RunState.h): engine-agnostic state of one run. Pure rules code: no Phaser imports.
import { defaultConfig, generate, revealNode, type Config, type Floor } from './floorGenerator';
import { u64 } from './rng';

export interface RunState {
  seed: bigint;
  /** 0 = no run in progress. */
  floorNumber: number;
  currentNode: number;
  floor: Floor;
  party: string[];
  gold: number;
  essence: number;
  active: boolean;
}

/** The C++ default-constructed Floor (no nodes). */
export function emptyFloor(): Floor {
  return {
    number: 0, seed: 0n, isBoss: false, scaling: 1, nodes: [], cols: 0, rows: 0, startNode: 0, crystalNode: -1,
    crystalRequiresBossKill: false, totalEnemies: 0, killQuota: 0, roomRoll: 0, usedFallbackLayout: false, rescueNode: -1,
    isTutorial: false, isRescueLayout: false,
  };
}

export function makeRunState(): RunState {
  return { seed: 0n, floorNumber: 0, currentNode: -1, floor: emptyFloor(), party: [], gold: 0, essence: 0, active: false };
}

/** Starts a run at floor 1; the start node is entered (revealed) immediately. Mutates `run` in place. */
export function startRun(run: RunState, seed: bigint | number, party: string[], cfg: Config = defaultConfig()): void {
  Object.assign(run, makeRunState());
  run.seed = u64(seed);
  run.party = [...party];
  run.active = true;
  run.floorNumber = 1;
  run.floor = generate(run.seed, 1, cfg);
  run.currentNode = run.floor.startNode;
  revealNode(run.floor, run.currentNode);
}

/** Moves to a room next to the current one. Returns false (and does nothing) otherwise. */
export function enterNode(run: RunState, nodeId: number): boolean {
  if (!run.active || run.currentNode < 0) return false;
  const cur = run.floor.nodes[run.currentNode];
  for (const n of cur.next) {
    if (n === nodeId) {
      run.currentNode = nodeId;
      revealNode(run.floor, nodeId);
      return true;
    }
  }
  return false;
}

/** Loads the next floor (same run seed, so the same seed replays the same tower). */
export function nextFloor(run: RunState, cfg: Config = defaultConfig()): void {
  if (!run.active) return;
  ++run.floorNumber;
  run.floor = generate(run.seed, run.floorNumber, cfg);
  run.currentNode = run.floor.startNode;
  revealNode(run.floor, run.currentNode);
}

export function endRun(run: RunState): void {
  run.active = false;
}
