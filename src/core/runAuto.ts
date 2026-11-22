// RunAuto port (Core/RunAuto.h): the Auto behaviour as a pure function (the bot and the UI's Auto button share it).
// Looks only at what the player could know (fog). Rules, first that applies wins:
//   1. teleport as soon as RunFlow.canTeleport
//   2. quota not met and an unvisited Treasure next door: take it
//   3. Priest rescue outstanding: the rescue room when known and reachable, else explore the cheapest unvisited room
//   4. quota met: the crystal room when found; otherwise explore until found
//   5. quota not met: cheapest unvisited Combat/Boss, else cheapest non-Elite, an Elite last
// Path cost: visited rooms 1, entering unvisited rooms by type. Ties go to the lowest room id.
import { RoomType, type Node } from './floorGenerator';
import { neighborsOf, type RunFlow } from './runFlow';

export interface AutoParams {
  costVisited: number;
  costFight: number;
  costElite: number;
  costRescue: number;
  costOther: number;
}
/** What the Auto button optimizes (director, Nov 22); undefined keeps the original Unreal behaviour the parity soaks pin.
 *  safe: kill quota and the next floor above all else; never a treasure detour, never an optional Elite.
 *  balanced: quota first, Elites avoided, Treasure grabbed when no Elite fight is involved, then the next floor.
 *  greedy: clear the whole floor before leaving, nearest room first (adjacent rooms, then anything nearby), ties Treasure, Combat, Elite. */
export type AutoMode = 'safe' | 'balanced' | 'greedy';
export const kAutoModes: AutoMode[] = ['safe', 'balanced', 'greedy'];

export const defaultAutoParams = (): AutoParams => ({ costVisited: 1, costFight: 10, costElite: 200, costRescue: 10, costOther: 2 });

export enum AutoAction { None, Teleport, Move }
export enum AutoReason { None, Teleport, Treasure, Rescue, ExploreForRescue, Crystal, ExploreForCrystal, Fight, Explore }

export function autoReasonName(r: AutoReason): string {
  switch (r) {
    case AutoReason.None: return 'none';
    case AutoReason.Teleport: return 'teleport';
    case AutoReason.Treasure: return 'treasure';
    case AutoReason.Rescue: return 'rescue';
    case AutoReason.ExploreForRescue: return 'explore for the rescue room';
    case AutoReason.Crystal: return 'crystal';
    case AutoReason.ExploreForCrystal: return 'explore for the crystal';
    case AutoReason.Fight: return 'fight for the quota';
    case AutoReason.Explore: return 'explore';
  }
  return '?';
}

export interface AutoDecision {
  action: AutoAction;
  step: number;
  target: number;
  reason: AutoReason;
}

const INT_MAX = 2147483647;

function autoEnterCost(flow: RunFlow, n: Node, p: AutoParams): number {
  if (n.revealed) return p.costVisited;
  switch (n.type) {
    case RoomType.Elite: return n.isRescueRoom && flow.rescueOutstanding() ? p.costRescue : p.costElite;
    case RoomType.Combat:
    case RoomType.Boss: return p.costFight;
    default: return p.costOther;
  }
}

/** Dijkstra (O(n^2) selection, lowest index on ties); expands only from the current room and visited rooms. */
export function autoSearch(flow: RunFlow, p: AutoParams): { dist: number[]; prev: number[] } {
  const f = flow.currentFloor();
  const n = f.nodes.length;
  const dist = new Array<number>(n).fill(INT_MAX);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[flow.currentNode()] = 0;
  for (let iter = 0; iter < n; ++iter) {
    let u = -1;
    for (let i = 0; i < n; ++i) if (!done[i] && dist[i] !== INT_MAX && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    if (u !== flow.currentNode() && !f.nodes[u].revealed) continue;
    for (const v of neighborsOf(f, u)) {
      const vn = f.nodes[v];
      if (!vn.known && !vn.revealed) continue;
      const w = dist[u] + autoEnterCost(flow, vn, p);
      if (w < dist[v]) {
        dist[v] = w;
        prev[v] = u;
      }
    }
  }
  return { dist, prev };
}

function autoBestUnvisited(flow: RunFlow, dist: number[], pred: (n: Node) => boolean): number {
  let best = -1;
  for (const n of flow.currentFloor().nodes) {
    if (n.revealed || !n.known || !pred(n)) continue;
    const d = dist[n.id];
    if (d === INT_MAX) continue;
    if (best < 0 || d < dist[best]) best = n.id;
  }
  return best;
}

/** Greedy Auto: the nearest unvisited room (every room costs one step, so adjacent rooms come first), ties Treasure, Combat, Elite, Boss last.
 *  Undefined when every known room has been visited. */
function greedyChoice(flow: RunFlow): AutoDecision | undefined {
  const f = flow.currentFloor();
  const { dist, prev } = autoSearch(flow, { costVisited: 1, costFight: 1, costElite: 1, costRescue: 1, costOther: 1 });
  const rank = (n: Node): number => n.type === RoomType.Treasure ? 0 : n.type === RoomType.Elite ? 2 : n.type === RoomType.Boss ? 3 : 1;
  let best = -1;
  for (const n of f.nodes) {
    if (n.revealed || !n.known || dist[n.id] === INT_MAX) continue;
    if (best < 0 || dist[n.id] < dist[best] || (dist[n.id] === dist[best] && rank(n) < rank(f.nodes[best]))) best = n.id;
  }
  if (best < 0) return undefined;
  let step = best;
  while (prev[step] !== flow.currentNode() && prev[step] >= 0) step = prev[step];
  const t = f.nodes[best].type;
  return { action: AutoAction.Move, step, target: best, reason: t === RoomType.Treasure ? AutoReason.Treasure : t === RoomType.Combat || t === RoomType.Boss ? AutoReason.Fight : AutoReason.Explore };
}

/** partyHpFraction is kept for the call sites (unused: there is no Rest room). */
export function chooseAuto(flow: RunFlow, _partyHpFraction: number, p: AutoParams = defaultAutoParams(), mode?: AutoMode): AutoDecision {
  const out: AutoDecision = { action: AutoAction.None, step: -1, target: -1, reason: AutoReason.None };
  if (!flow.active() || flow.fightPending()) return out;
  if (mode === 'greedy') {
    const g = greedyChoice(flow);
    if (g) return g;   // nothing left to clear: fall through to the crystal and the teleport
  }
  if (flow.canTeleport()) {
    out.action = AutoAction.Teleport;
    out.reason = AutoReason.Teleport;
    return out;
  }
  const f = flow.currentFloor();
  const { dist, prev } = autoSearch(flow, p);
  let target = -1;
  let why = AutoReason.None;
  const pick = (t: number, r: AutoReason): void => {
    if (target < 0 && t >= 0) {
      target = t;
      why = r;
    }
  };
  const any = (): boolean => true;

  const calm = mode === 'safe' || mode === 'balanced';   // Elites are a last resort for these
  if (target < 0 && !flow.quotaMet() && mode !== 'safe') {
    for (const a of flow.adjacent()) {
      const n = f.nodes[a];
      if (n.type === RoomType.Treasure && !n.revealed) {
        pick(a, AutoReason.Treasure);
        break;
      }
    }
  }
  if (target < 0 && flow.rescueOutstanding()) {
    const r = f.nodes[f.rescueNode];
    if (r.known && !r.revealed && dist[r.id] !== INT_MAX) pick(r.id, AutoReason.Rescue);
    else pick(autoBestUnvisited(flow, dist, any), AutoReason.ExploreForRescue);
  }
  if (target < 0 && flow.quotaMet() && mode === 'balanced') pick(autoBestUnvisited(flow, dist, (n) => n.type === RoomType.Treasure), AutoReason.Treasure);   // a treasure room never means an Elite fight
  if (target < 0 && flow.quotaMet()) {
    if (flow.isCrystalFound() && flow.currentNode() !== f.crystalNode && dist[f.crystalNode] !== INT_MAX) {
      pick(f.crystalNode, AutoReason.Crystal);
    } else if (!flow.isCrystalFound()) {
      if (calm) pick(autoBestUnvisited(flow, dist, (n) => n.type !== RoomType.Elite || n.isRescueRoom), AutoReason.ExploreForCrystal);
      pick(autoBestUnvisited(flow, dist, any), AutoReason.ExploreForCrystal);
    }
  }
  if (target < 0 && !flow.quotaMet()) {
    pick(autoBestUnvisited(flow, dist, (n) => n.type === RoomType.Combat || n.type === RoomType.Boss), AutoReason.Fight);
    pick(autoBestUnvisited(flow, dist, (n) => n.type !== RoomType.Elite), AutoReason.Explore);
    pick(autoBestUnvisited(flow, dist, (n) => n.type === RoomType.Elite), AutoReason.Fight);
  }
  if (target < 0) pick(autoBestUnvisited(flow, dist, any), AutoReason.Explore);
  if (target < 0) return out;

  let step = target;
  while (prev[step] !== flow.currentNode() && prev[step] >= 0) step = prev[step];
  out.action = AutoAction.Move;
  out.step = step;
  out.target = target;
  out.reason = why;
  return out;
}
