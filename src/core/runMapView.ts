// RunMapView port (Core/RunMapView.h): what the mini-map may show, with the fog rule applied, so the UI cannot leak hidden rooms.
//   * only known rooms are listed (visited ones plus their neighbours); type is shown for every known room
//   * a visited room shows all its doors; a known, unvisited room only the doors to visited rooms
//   * crystal icon only once the crystal is found; rescue flag on a known room
import { RoomType, kDirCount } from './floorGenerator';
import type { RunFlow } from './runFlow';

export interface RoomView {
  id: number;
  gx: number;
  gy: number;
  type: RoomType;
  visited: boolean;
  known: boolean;
  cleared: boolean;
  current: boolean;
  /** N, E, S, W as visible on the map. */
  doors: [boolean, boolean, boolean, boolean];
  crystalIcon: boolean;
  rescue: boolean;
}

export interface MapView {
  runActive: boolean;
  floorNumber: number;
  boss: boolean;
  cols: number;
  rows: number;
  rooms: RoomView[];
  currentRoom: number;
  kills: number;
  quota: number;
  quotaMet: boolean;
  crystalFound: boolean;
  crystalRoom: number;
  bossKilled: boolean;
  canTeleport: boolean;
  inCrystalRoom: boolean;
  rescueOutstanding: boolean;
  fightPending: boolean;
  gold: number;
  essence: number;
}

export function buildMapView(flow: RunFlow): MapView {
  const f = flow.currentFloor();
  const v: MapView = {
    runActive: flow.active(),
    floorNumber: flow.getRun().floorNumber,
    boss: f.isBoss,
    cols: f.cols,
    rows: f.rows,
    rooms: [],
    currentRoom: flow.currentNode(),
    kills: flow.getFloorKills(),
    quota: flow.quota(),
    quotaMet: flow.quotaMet(),
    crystalFound: flow.isCrystalFound(),
    crystalRoom: flow.isCrystalFound() ? f.crystalNode : -1,
    bossKilled: flow.isBossKilled(),
    canTeleport: flow.canTeleport(),
    inCrystalRoom: flow.isCrystalFound() && flow.inCrystalRoom(),
    rescueOutstanding: flow.rescueOutstanding(),
    fightPending: flow.fightPending(),
    gold: flow.getRun().gold,
    essence: flow.getRun().essence,
  };
  for (const n of f.nodes) {
    if (!n.known && !n.revealed) continue;
    const doors: [boolean, boolean, boolean, boolean] = [false, false, false, false];
    for (let d = 0; d < kDirCount; ++d) {
      const nb = n.door[d];
      if (nb < 0) continue;
      doors[d] = n.revealed || f.nodes[nb].revealed;
    }
    v.rooms.push({
      id: n.id, gx: n.gx, gy: n.gy, type: n.type, visited: n.revealed, known: true, cleared: flow.isCleared(n.id),
      current: n.id === flow.currentNode(), doors, crystalIcon: flow.isCrystalFound() && n.id === f.crystalNode,
      rescue: n.isRescueRoom,
    });
  }
  return v;
}
