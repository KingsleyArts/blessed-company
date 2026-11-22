// The Auto button's three modes (director, Nov 22): safe, balanced, greedy. The default (no mode) is the Unreal behaviour pinned elsewhere.
import { describe, expect, it } from 'vitest';
import { RoomType } from './floorGenerator';
import { FightResult, RunFlow } from './runFlow';
import { AutoAction, chooseAuto, defaultAutoParams, type AutoMode } from './runAuto';

function win(flow: RunFlow): void {
  const spec = flow.pendingFightSpec();
  const n = spec.enemies.length;
  for (let i = 0; i < n; ++i) flow.onEnemyKilled();
  flow.onFightFinished(FightResult.Won);
}

/** Plays floor 1 with the given mode, instant wins; returns the room types in visit order and whether the floor was fully cleared at the teleport. */
function playFloor(seed: number, mode: AutoMode): { visited: RoomType[]; unvisitedAtTeleport: number; teleported: boolean } {
  const flow = new RunFlow();
  flow.start(seed, true);
  const visited: RoomType[] = [];
  for (let step = 0; step < 400 && flow.active() && flow.getRun().floorNumber === 1; ++step) {
    if (flow.fightPending()) { win(flow); continue; }
    const d = chooseAuto(flow, 1.0, defaultAutoParams(), mode);
    if (d.action === AutoAction.None) break;
    if (d.action === AutoAction.Teleport) {
      const f = flow.currentFloor();
      const left = f.nodes.filter((n) => !n.revealed).length;
      return { visited, unvisitedAtTeleport: left, teleported: true };
    }
    flow.travel(d.step);
    visited.push(flow.currentFloor().nodes[flow.getRun().currentNode].type);
  }
  return { visited, unvisitedAtTeleport: -1, teleported: false };
}

describe('Auto modes', () => {
  it('safe takes no treasure detours (only rooms it must cross) and balanced takes more treasure', () => {
    let safe = 0, balanced = 0, greedy = 0;
    for (let seed = 1; seed <= 40; ++seed) {
      safe += playFloor(seed, 'safe').visited.filter((t) => t === RoomType.Treasure).length;
      balanced += playFloor(seed, 'balanced').visited.filter((t) => t === RoomType.Treasure).length;
      greedy += playFloor(seed, 'greedy').visited.filter((t) => t === RoomType.Treasure).length;
    }
    expect(safe).toBeLessThan(balanced);
    expect(balanced).toBeLessThanOrEqual(greedy);
  });

  it('greedy clears every room before it teleports', () => {
    let done = 0;
    for (let seed = 1; seed <= 40; ++seed) {
      const r = playFloor(seed, 'greedy');
      if (!r.teleported) continue;
      expect(r.unvisitedAtTeleport).toBe(0);
      ++done;
    }
    expect(done).toBeGreaterThan(10);
  });

  it('greedy visits at least as many rooms as balanced, balanced no more elites than greedy', () => {
    let g = 0, b = 0, ge = 0, be = 0;
    for (let seed = 1; seed <= 40; ++seed) {
      const rg = playFloor(seed, 'greedy'), rb = playFloor(seed, 'balanced');
      g += rg.visited.length; b += rb.visited.length;
      ge += rg.visited.filter((t) => t === RoomType.Elite).length;
      be += rb.visited.filter((t) => t === RoomType.Elite).length;
    }
    expect(g).toBeGreaterThanOrEqual(b);
    expect(be).toBeLessThanOrEqual(ge);
  });
});
