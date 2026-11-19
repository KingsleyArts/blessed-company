// The visible rooms and the room-to-room walk (UI/TolRoomView.cpp). The room the party stands in is a "module" at the world origin
// (checkered floor, walls with a doorway where the floor has a door, a green door mat in the doorway); every room behind one of its doors
// is drawn next to it, dimmed. A move plays: WalkOut (to the doorway) -> Pan (the camera slides to the next room while the party keeps
// walking in) -> Recenter (the new room becomes the origin) -> WalkIn (to the formation) -> done(), which starts the room's fight.
import Phaser from 'phaser';
import type { Floor } from '../core/floorGenerator';
import type { RunManager, TransitionHook, WalkStep } from '../core/runManager';
import { Camera, regionFromRect, type Vec3 } from '../ui/cameraMath';
import type { Rect } from '../ui/hudLayout';
import { rgbToInt, scatterWallProps, themeById, type Prop } from '../ui/roomTheme';

// ---- camera (UI/TolRoomView.cpp) ----
export const kPitchDeg = 58;
export const kHFovDeg = 50;
// ---- room (the combat arena is 2400 x 1400 centred on the origin) ----
const kTilesX = 16;
const kTilesY = 10;
const kTile = 160;
const kWallT = 120;
const kWallH = 260;
const kCurbH = 40;
const kDoorW = 400;
export const kHx = (kTilesX * kTile) / 2;
export const kHy = (kTilesY * kTile) / 2;
const kPitchX = 2 * (kHx + kWallT);
const kPitchY = 2 * (kHy + kWallT);
// ---- walk ----
const kWalkSpeed = 1000;
const kPanSeconds = 0.75;
const kDim = 0.22;
const kFadeRate = 1.5;
const kSlotSpacing = 110;
const kWalkTimeout = 30;
const kThemeId = 1;   // tol.RoomTheme default: goblin cave
const kVoid = 0x050506;

const dirVec = (d: number): { x: number; y: number } => [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][d];
const isSide = (d: number): boolean => d === 1 || d === 3;
const edgeOf = (d: number): number => (isSide(d) ? kHx : kHy);
const pitchOf = (d: number): number => (isSide(d) ? kPitchX : kPitchY);
const perpVec = (d: number): { x: number; y: number } => (isSide(d) ? { x: 0, y: 1 } : { x: 1, y: 0 });

interface Module { node: number; doorMask: number; gx: number; gy: number; brightness: number; target: number; props: Prop[] }

export interface Walker { name: string; x: number; y: number; formation: { x: number; y: number }; waypoints: { x: number; y: number }[] }

enum Phase { Idle, WalkOut, Pan, WalkIn }

export class RoomView implements TransitionHook {
  readonly camera = new Camera(kPitchDeg, kHFovDeg, 1920, 1080);
  private modules = new Map<number, Module>();
  private centerNode = -1;
  private floorRef: Floor | undefined;
  private seed = 0n;
  pan = { x: 0, y: 0 };
  private phase = Phase.Idle;
  private steps: WalkStep[] = [];
  private stepIndex = 0;
  private timeScale = 1;
  private panT = 0;
  private panFrom = { x: 0, y: 0 };
  private panTo = { x: 0, y: 0 };
  private phaseTime = 0;
  walkers: Walker[] = [];
  private doneFn: (() => void) | undefined;
  private dirty = true;
  private lastArea = '';

  constructor(private readonly rm: RunManager) {}

  isTransitioning(): boolean { return this.phase !== Phase.Idle; }
  /** Where staged enemies of the destination room stand, relative to the room at the origin. */
  stagedOffset(): { x: number; y: number } {
    if (this.phase === Phase.Idle || this.phase === Phase.WalkIn) return { x: 0, y: 0 };
    const s = this.steps[this.steps.length - 1];
    const o = this.moduleOrigin(s.toNode);
    return o;
  }
  walkerPos(name: string): { x: number; y: number } | undefined {
    if (this.phase === Phase.Idle) return undefined;
    const w = this.walkers.find((q) => q.name === name);
    return w ? { x: w.x, y: w.y } : undefined;
  }

  /** Re-fit the camera to the room area of the HUD layout (call on resize). */
  fit(area: Rect, cw: number, ch: number): void {
    const key = `${area.x}|${area.y}|${area.w}|${area.h}|${cw}|${ch}`;
    if (key === this.lastArea) return;
    this.lastArea = key;
    this.camera.canvasW = cw;
    this.camera.canvasH = ch;
    this.camera.fit({ hx: kHx, hy: kHy, wallT: kWallT, wallH: kWallH }, regionFromRect(area.x, area.y, area.w, area.h, cw, ch));
    this.dirty = true;
  }

  project(x: number, y: number, z = 0): { x: number; y: number; depth: number } {
    return this.camera.project({ x, y, z }, { x: this.pan.x, y: this.pan.y, z: 0 });
  }
  groundAt(px: number, py: number, z = 100): { x: number; y: number } | undefined {
    return this.camera.groundAt(px, py, z, { x: this.pan.x, y: this.pan.y, z: 0 });
  }

  // ---------------------------------------------------------------- modules
  private moduleOrigin(node: number): { x: number; y: number } {
    const f = this.floorRef;
    if (!f || this.centerNode < 0 || node < 0) return { x: 0, y: 0 };
    const c = f.nodes[this.centerNode];
    const n = f.nodes[node];
    return { x: (n.gx - c.gx) * kPitchX, y: (n.gy - c.gy) * kPitchY };
  }

  private buildModule(node: number): Module {
    const f = this.floorRef!;
    const n = f.nodes[node];
    let mask = 0;
    for (let d = 0; d < 4; ++d) if (n.door[d] >= 0) mask |= 1 << d;
    const theme = themeById(kThemeId);
    const props = theme.propsPerRoom > 0 ? scatterWallProps(this.seed, node, kHx, kHy, mask, kDoorW, 100, theme.propsPerRoom) : [];
    return { node, doorMask: mask, gx: n.gx, gy: n.gy, brightness: 1, target: 1, props };
  }

  private ensureModulesAround(node: number): void {
    const f = this.floorRef;
    if (!f) return;
    const want = [node, ...f.nodes[node].door.filter((d) => d >= 0)];
    for (const id of want) {
      if (!this.modules.has(id)) {
        const m = this.buildModule(id);
        m.brightness = id === this.centerNode ? 1 : 0;
        this.modules.set(id, m);
      }
      this.modules.get(id)!.target = id === node ? 1 : kDim;
    }
    this.dirty = true;
  }

  private pruneModulesAround(node: number): void {
    const f = this.floorRef!;
    const keep = new Set([node, ...f.nodes[node].door.filter((d) => d >= 0)]);
    for (const id of [...this.modules.keys()]) if (!keep.has(id)) this.modules.delete(id);
  }

  /** The run changed rooms without a walk (new run, new floor): rebuild around its current room. */
  rebuildForRun(): void {
    this.abortTransition();
    this.modules.clear();
    const flow = this.rm.getFlow();
    if (!flow.active() && !this.floorRef) return;
    if (flow.active()) {
      this.floorRef = flow.currentFloor();
      this.seed = flow.getRun().seed;
      this.centerNode = flow.currentNode();
    }
    if (!this.floorRef || this.centerNode < 0) return;
    this.pan = { x: 0, y: 0 };
    this.ensureModulesAround(this.centerNode);
    for (const m of this.modules.values()) m.brightness = m.target;
  }

  /** Per frame while idle: if the run moved without a walk (new run, new floor, teleport), rebuild around its room. */
  syncToRun(): void {
    if (this.phase !== Phase.Idle) return;
    const flow = this.rm.getFlow();
    if (!flow.active()) return;
    if (this.floorRef !== flow.currentFloor() || this.centerNode !== flow.currentNode()) this.rebuildForRun();
  }

  // ---------------------------------------------------------------- transition (TransitionHook)
  play(steps: WalkStep[], speed: number, done: () => void): void {
    this.steps = steps;
    this.stepIndex = 0;
    this.timeScale = speed;
    this.doneFn = done;
    this.floorRef = this.rm.getFlow().currentFloor();
    this.collectWalkers();
    if (this.walkers.length === 0) {
      // Nobody can walk (cannot happen in a live run): jump.
      this.centerNode = steps[steps.length - 1].toNode;
      this.rebuildAroundCenter();
      this.finishWalk();
      return;
    }
    this.beginStep();
  }

  cancel(): void { this.abortTransition(); }

  private abortTransition(): void {
    this.phase = Phase.Idle;
    this.doneFn = undefined;
    this.walkers = [];
    this.pan = { x: 0, y: 0 };
    this.dirty = true;
  }

  private collectWalkers(): void {
    const sim = this.rm.getSim();
    this.walkers = [];
    if (!sim) return;
    const formation = new Map(this.rm.partyFormation().map((p) => [p.name, p]));
    for (const u of sim.getUnits()) {
      if (u.enemy || u.summon || u.removed || !u.alive) continue;
      const f = formation.get(u.name);
      this.walkers.push({ name: u.name, x: u.x, y: u.y, formation: f ? { x: f.x, y: f.y } : { x: u.x, y: u.y }, waypoints: [] });
    }
  }

  private beginStep(): void {
    this.phase = Phase.WalkOut;
    this.phaseTime = 0;
    this.rm.clearNonPartyActors();
    const s = this.steps[this.stepIndex];
    const d = s.dir;
    const dv = dirVec(d);
    const pv = perpVec(d);
    const n = this.walkers.length;
    // Line up across the doorway, then walk straight through it.
    this.walkers.forEach((w, i) => {
      const off = (i - (n - 1) / 2) * kSlotSpacing;
      const inside = edgeOf(d) - 160;
      const beyond = pitchOf(d) - edgeOf(d) + 220;
      w.waypoints = [
        { x: dv.x * inside + pv.x * off, y: dv.y * inside + pv.y * off },
        { x: dv.x * beyond + pv.x * off, y: dv.y * beyond + pv.y * off },
      ];
    });
    this.ensureModulesAround(this.centerNode);
    if (!this.modules.has(s.toNode)) {
      const m = this.buildModule(s.toNode);
      m.brightness = kDim;
      this.modules.set(s.toNode, m);
    }
  }

  private beginPan(): void {
    const s = this.steps[this.stepIndex];
    this.phase = Phase.Pan;
    this.panT = 0;
    this.panFrom = { ...this.pan };
    this.panTo = this.moduleOrigin(s.toNode);
    for (const m of this.modules.values()) m.target = m.node === s.toNode ? 1 : kDim;
    const target = this.modules.get(s.toNode);
    if (target) target.target = 1;
  }

  private recenter(): void {
    const s = this.steps[this.stepIndex];
    const o = this.moduleOrigin(s.toNode);
    for (const w of this.walkers) {
      w.x -= o.x;
      w.y -= o.y;
      w.waypoints = w.waypoints.map((p) => ({ x: p.x - o.x, y: p.y - o.y }));
    }
    this.centerNode = s.toNode;
    this.pan = { x: 0, y: 0 };
    this.rebuildAroundCenter();
    ++this.stepIndex;
    if (this.stepIndex < this.steps.length) this.beginStep();
    else this.beginWalkIn();
  }

  private rebuildAroundCenter(): void {
    const old = new Map(this.modules);
    this.modules.clear();
    const f = this.floorRef!;
    const want = [this.centerNode, ...f.nodes[this.centerNode].door.filter((d) => d >= 0)];
    for (const id of want) {
      const m = old.get(id) ?? this.buildModule(id);
      if (!old.has(id)) m.brightness = 0;
      m.target = id === this.centerNode ? 1 : kDim;
      this.modules.set(id, m);
    }
    this.pruneModulesAround(this.centerNode);
    this.dirty = true;
  }

  private beginWalkIn(): void {
    this.phase = Phase.WalkIn;
    this.phaseTime = 0;
    const formation = new Map(this.rm.partyFormation().map((p) => [p.name, p]));
    for (const w of this.walkers) {
      const f = formation.get(w.name);
      if (f) w.formation = { x: f.x, y: f.y };
      w.waypoints = [w.formation];
    }
  }

  private finishWalk(): void {
    const pos = new Map(this.walkers.map((w) => [w.name, { x: w.x, y: w.y }]));
    this.rm.commitPartyPositions(pos);
    this.phase = Phase.Idle;
    this.walkers = [];
    const done = this.doneFn;
    this.doneFn = undefined;
    done?.();
  }

  private tickWalkers(dt: number): boolean {
    let moving = false;
    const step = kWalkSpeed * this.timeScale * dt;
    for (const w of this.walkers) {
      let left = step;
      while (left > 0 && w.waypoints.length > 0) {
        const t = w.waypoints[0];
        const dx = t.x - w.x;
        const dy = t.y - w.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= left) {
          w.x = t.x;
          w.y = t.y;
          left -= dist;
          w.waypoints.shift();
        } else {
          w.x += (dx / dist) * left;
          w.y += (dy / dist) * left;
          left = 0;
        }
      }
      if (w.waypoints.length > 0) moving = true;
    }
    return moving;
  }

  /** Per frame (unscaled seconds). */
  update(dt: number): void {
    // Brightness of modules that appear or dim without a pan.
    for (const m of this.modules.values()) {
      if (m.brightness !== m.target && this.phase !== Phase.Pan) {
        const d = m.target - m.brightness;
        const stepB = kFadeRate * dt;
        m.brightness = Math.abs(d) <= stepB ? m.target : m.brightness + Math.sign(d) * stepB;
        this.dirty = true;
      }
    }
    if (this.phase === Phase.Idle) return;
    this.phaseTime += dt;
    const moving = this.tickWalkers(dt);
    if (this.phaseTime > kWalkTimeout) {
      // Safety: a walk that has not finished by then is finished at once.
      while ((this.phase as Phase) !== Phase.Idle && (this.phase as Phase) !== Phase.WalkIn) this.recenter();
      for (const w of this.walkers) { w.x = w.formation.x; w.y = w.formation.y; }
      this.finishWalk();
      return;
    }
    if (this.phase === Phase.WalkOut) {
      const s = this.steps[this.stepIndex];
      const d = s.dir;
      const dv = dirVec(d);
      // The moment the first member touches the doorway edge the pan starts.
      const touched = this.walkers.some((w) => w.x * dv.x + w.y * dv.y >= edgeOf(d) - 20);
      if (touched || !moving) this.beginPan();
    } else if (this.phase === Phase.Pan) {
      const s = this.steps[this.stepIndex];
      this.panT += dt * this.timeScale / kPanSeconds;
      const t = Math.min(1, this.panT);
      const e = t * t * (3 - 2 * t);
      this.pan = { x: this.panFrom.x + (this.panTo.x - this.panFrom.x) * e, y: this.panFrom.y + (this.panTo.y - this.panFrom.y) * e };
      for (const m of this.modules.values()) {
        const from = m.node === this.centerNode ? 1 : kDim;
        const to = m.node === s.toNode ? 1 : kDim;
        m.brightness = from + (to - from) * e;
      }
      this.dirty = true;
      if (t >= 1) this.recenter();
    } else if (this.phase === Phase.WalkIn) {
      if (!moving) this.finishWalk();
    }
  }

  // ---------------------------------------------------------------- drawing
  needsRedraw(): boolean { return this.dirty; }

  draw(g: Phaser.GameObjects.Graphics, area: Rect): void {
    this.dirty = false;
    g.clear();
    g.fillStyle(kVoid, 1);
    g.fillRect(area.x, area.y, area.w, area.h);
    // Far rooms first (north before south), so nearer walls cover farther floors.
    const mods = [...this.modules.values()].sort((a, b) => a.gy - b.gy || a.gx - b.gx);
    for (const m of mods) if (m.brightness > 0.01) this.drawModule(g, m);
  }

  private quad(g: Phaser.GameObjects.Graphics, pts: Vec3[], color: number): void {
    const p = pts.map((q) => this.project(q.x, q.y, q.z));
    if (p.some((q) => q.depth <= 0)) return;
    g.fillStyle(color, 1);
    g.fillPoints(p.map((q) => new Phaser.Geom.Point(q.x, q.y)), true);
  }

  private box(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, h: number, top: number, front: number, side: number, cx: number): void {
    // Top, the camera-facing front (+Y) and the side facing the room centre.
    if (x1 - x0 <= 0 || y1 - y0 <= 0) return;
    if (cx > x1) this.quad(g, [{ x: x1, y: y0, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x1, y: y1, z: h }, { x: x1, y: y0, z: h }], side);
    else if (cx < x0) this.quad(g, [{ x: x0, y: y0, z: 0 }, { x: x0, y: y1, z: 0 }, { x: x0, y: y1, z: h }, { x: x0, y: y0, z: h }], side);
    this.quad(g, [{ x: x0, y: y1, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x1, y: y1, z: h }, { x: x0, y: y1, z: h }], front);
    this.quad(g, [{ x: x0, y: y0, z: h }, { x: x1, y: y0, z: h }, { x: x1, y: y1, z: h }, { x: x0, y: y1, z: h }], top);
  }

  private drawModule(g: Phaser.GameObjects.Graphics, m: Module): void {
    const theme = themeById(kThemeId);
    const k = m.brightness;
    const o = this.moduleOrigin(m.node);
    const tileA = rgbToInt(theme.base[0], k);
    const tileB = rgbToInt(theme.base[1], k);
    const wallTop = rgbToInt(theme.base[2], k * 1.15);
    const wallFront = rgbToInt(theme.base[2], k * 0.8);
    const wallSide = rgbToInt(theme.base[2], k * 0.6);
    const curb = rgbToInt(theme.base[3], k);
    const mat = rgbToInt(theme.base[4], k);
    const prop = rgbToInt(theme.base[5], k);
    const propDark = rgbToInt(theme.base[5], k * 0.7);
    // Floor tiles.
    for (let ty = 0; ty < kTilesY; ++ty) {
      for (let tx = 0; tx < kTilesX; ++tx) {
        const x0 = o.x - kHx + tx * kTile;
        const y0 = o.y - kHy + ty * kTile;
        this.quad(g, [{ x: x0, y: y0, z: 0 }, { x: x0 + kTile, y: y0, z: 0 }, { x: x0 + kTile, y: y0 + kTile, z: 0 }, { x: x0, y: y0 + kTile, z: 0 }],
          (tx + ty) % 2 === 0 ? tileA : tileB);
      }
    }
    const hasDoor = (d: number): boolean => ((m.doorMask >> d) & 1) === 1;
    const half = kDoorW / 2;
    // Door mats in the doorways.
    for (let d = 0; d < 4; ++d) {
      if (!hasDoor(d)) continue;
      const dv = dirVec(d);
      const pv = perpVec(d);
      const e0 = edgeOf(d);
      const e1 = e0 + kWallT;
      const a = { x: o.x + dv.x * e0 - pv.x * half, y: o.y + dv.y * e0 - pv.y * half };
      const b = { x: o.x + dv.x * e1 + pv.x * half, y: o.y + dv.y * e1 + pv.y * half };
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      this.quad(g, [{ x: x0, y: y0, z: 1 }, { x: x1, y: y0, z: 1 }, { x: x1, y: y1, z: 1 }, { x: x0, y: y1, z: 1 }], mat);
    }
    // Props along the walls (back half first).
    const sortedProps = [...m.props].sort((a, b) => a.y - b.y);
    for (const p of sortedProps.filter((q) => q.y < 0)) this.drawProp(g, p, o, prop, propDark);
    // North wall (far), split at the doorway.
    const ox0 = o.x - kHx - kWallT, ox1 = o.x + kHx + kWallT;
    const ny0 = o.y - kHy - kWallT, ny1 = o.y - kHy;
    if (hasDoor(0)) {
      this.box(g, ox0, ny0, o.x - half, ny1, kWallH, wallTop, wallFront, wallSide, o.x);
      this.box(g, o.x + half, ny0, ox1, ny1, kWallH, wallTop, wallFront, wallSide, o.x);
    } else this.box(g, ox0, ny0, ox1, ny1, kWallH, wallTop, wallFront, wallSide, o.x);
    // West and east walls.
    for (const d of [3, 1]) {
      const x0 = d === 3 ? o.x - kHx - kWallT : o.x + kHx;
      const x1 = x0 + kWallT;
      const y0 = o.y - kHy, y1 = o.y + kHy;
      if (hasDoor(d)) {
        this.box(g, x0, y0, x1, o.y - half, kWallH, wallTop, wallFront, wallSide, o.x);
        this.box(g, x0, o.y + half, x1, y1, kWallH, wallTop, wallFront, wallSide, o.x);
      } else this.box(g, x0, y0, x1, y1, kWallH, wallTop, wallFront, wallSide, o.x);
    }
    for (const p of sortedProps.filter((q) => q.y >= 0)) this.drawProp(g, p, o, prop, propDark);
    // South: a low curb so it never hides units at the bottom edge.
    const sy0 = o.y + kHy, sy1 = o.y + kHy + kWallT;
    if (hasDoor(2)) {
      this.box(g, ox0, sy0, o.x - half, sy1, kCurbH, curb, curb, curb, o.x);
      this.box(g, o.x + half, sy0, ox1, sy1, kCurbH, curb, curb, curb, o.x);
    } else this.box(g, ox0, sy0, ox1, sy1, kCurbH, curb, curb, curb, o.x);
  }

  private drawProp(g: Phaser.GameObjects.Graphics, p: Prop, o: { x: number; y: number }, top: number, side: number): void {
    const x = o.x + p.x, y = o.y + p.y;
    const c = Math.cos((p.yawDeg * Math.PI) / 180), s = Math.sin((p.yawDeg * Math.PI) / 180);
    const corner = (u: number, v: number, z: number): Vec3 => ({ x: x + u * c - v * s, y: y + u * s + v * c, z });
    const hw = p.sx / 2, hd = p.sy / 2;
    const base = [corner(-hw, -hd, 0), corner(hw, -hd, 0), corner(hw, hd, 0), corner(-hw, hd, 0)];
    const topQ = base.map((q) => ({ ...q, z: p.sz }));
    // Two faces toward the camera, then the top.
    for (let i = 0; i < 4; ++i) {
      const a = base[i], b = base[(i + 1) % 4];
      if ((a.y + b.y) / 2 - y > 0.01) this.quad(g, [a, b, { ...b, z: p.sz }, { ...a, z: p.sz }], side);   // faces the camera (+Y)
    }
    this.quad(g, topQ, top);
  }
}
