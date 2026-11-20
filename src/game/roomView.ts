// The visible rooms and the room-to-room walk (UI/TolRoomView.cpp). The room the party stands in is a "module" at the world origin
// (checkered floor, walls with a doorway where the floor has a door, a green door mat in the doorway); every room behind one of its doors
// is drawn next to it, dimmed. A move plays: WalkOut (to the doorway) -> Pan (the camera slides to the next room while the party keeps
// walking in) -> Recenter (the new room becomes the origin) -> WalkIn (to the formation) -> done(), which starts the room's fight.
import type { Floor } from '../core/floorGenerator';
import type { RunManager, TransitionHook, WalkStep } from '../core/runManager';
import { Camera, regionFromRect, type Vec3 } from '../ui/cameraMath';
import type { Rect } from '../ui/hudLayout';
import { artKeys, rgbToInt, scatterWallProps, themeById, type Prop, type RoomArt } from '../ui/roomTheme';
import type { Img, RoomCanvas } from './roomCanvas';

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
// Neighbouring rooms are hidden (director, Nov 20: rooms framed in darkness; the next room shows only during the pan, fading in).
const kDim = 0;
/** The dark haze framing the room view: how deep it reaches in from each edge (fraction of the shorter side) and its strength. */
const kHazeDepth = 0.16;
const kHazeAlpha = 0.85;
const kFadeRate = 1.5;
const kSlotSpacing = 110;
const kWalkTimeout = 30;
const kThemeId = 1;   // tol.RoomTheme default: goblin cave
const kVoid = 0x050506;
// ---- tile-set art (Nov 20): one floor or wall texture covers this many world units (about the hero sprites' pixel density) ----
const kArtWorld = 400;
/** The rubble trim: world length of one strip image, and how far in front of the wall face it stands. */
const kTrimLen = 720;
const kTrimInset = 18;

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

  /** Looks up a loaded texture image by key (set by the scene); a theme's art is used only when all of it is loaded. */
  artImage: (key: string) => Img | undefined = () => undefined;

  draw(rc: RoomCanvas, area: Rect, dpr: number): void {
    this.dirty = false;
    this.rc = rc;
    this.area = area;
    rc.begin(area, dpr);
    rc.fillPoly([{ x: area.x, y: area.y }, { x: area.right(), y: area.y }, { x: area.right(), y: area.bottom() }, { x: area.x, y: area.bottom() }], kVoid);
    const theme = themeById(kThemeId);
    this.art = theme.art && artKeys(theme.art).every((k) => this.artImage(k)) ? theme.art : undefined;
    // Far rooms first (north before south), so nearer walls cover farther floors.
    const mods = [...this.modules.values()].sort((a, b) => a.gy - b.gy || a.gx - b.gx);
    for (const m of mods) if (m.brightness > 0.01) this.drawModule(m);
    rc.edgeHaze(area, Math.min(area.w, area.h) * kHazeDepth, kVoid, kHazeAlpha);
    rc.end();
  }

  private rc!: RoomCanvas;
  private area!: Rect;
  private art: RoomArt | undefined;
  private img(key: string): Img { return this.artImage(key)!; }

  private quad(pts: Vec3[], color: number): void {
    const p = pts.map((q) => this.project(q.x, q.y, q.z));
    if (p.some((q) => q.depth <= 0)) return;
    this.rc.fillPoly(p, color);
  }

  /** Paints a textured rectangle in the world: `origin` + u * uAxis + v * vAxis for u in [u0, u1], v in [v0, v1] (world units). The
   *  texture repeats every texU x texV world units, anchored at the origin; `pick` chooses the image per repeat (floor variants). The
   *  rectangle is cut at every repeat and at most every `cell` units, so each affine piece stays close to the true perspective. */
  private plane(pick: (iu: number, iv: number) => Img, origin: Vec3, uAxis: Vec3, vAxis: Vec3, u0: number, u1: number, v0: number, v1: number,
    texU: number, texV: number, shade: number, cell = 200): void {
    const cuts = (a: number, b: number, rep: number): number[] => {
      const out = [a];
      let x = a;
      while (x < b - 1e-6) {
        const nextRep = (Math.floor(x / rep + 1e-9) + 1) * rep;
        x = Math.min(b, nextRep, x + cell);
        out.push(x);
      }
      return out;
    };
    const us = cuts(u0, u1, texU), vs = cuts(v0, v1, texV);
    const at = (u: number, v: number): { x: number; y: number; depth: number } => this.project(
      origin.x + uAxis.x * u + vAxis.x * v, origin.y + uAxis.y * u + vAxis.y * v, origin.z + uAxis.z * u + vAxis.z * v);
    for (let a = 0; a + 1 < us.length; ++a) {
      for (let b = 0; b + 1 < vs.length; ++b) {
        const ua = us[a], ub = us[a + 1], va = vs[b], vb = vs[b + 1];
        const iu = Math.floor((ua + ub) / 2 / texU), iv = Math.floor((va + vb) / 2 / texV);
        const base = pick(iu, iv);
        const im = this.rc.shaded(base, shade);
        const sx = (u: number): number => ((u - iu * texU) / texU) * base.width;
        const sy = (v: number): number => ((v - iv * texV) / texV) * base.height;
        const d = [at(ua, va), at(ub, va), at(ub, vb), at(ua, vb)];
        if (d.some((q) => q.depth <= 0)) continue;
        // Skip pieces wholly outside the room view (most of the dimmed neighbouring rooms).
        const A = this.area;
        if (d.every((q) => q.x < A.x) || d.every((q) => q.x > A.right()) || d.every((q) => q.y < A.y) || d.every((q) => q.y > A.bottom())) continue;
        this.rc.texQuad(im, [{ x: sx(ua), y: sy(va) }, { x: sx(ub), y: sy(va) }, { x: sx(ub), y: sy(vb) }, { x: sx(ua), y: sy(vb) }], d);
      }
    }
  }

  private box(x0: number, y0: number, x1: number, y1: number, h: number, top: number, front: number, side: number, cx: number): void {
    // Top, the camera-facing front (+Y) and the side facing the room centre.
    if (x1 - x0 <= 0 || y1 - y0 <= 0) return;
    if (cx > x1) this.quad([{ x: x1, y: y0, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x1, y: y1, z: h }, { x: x1, y: y0, z: h }], side);
    else if (cx < x0) this.quad([{ x: x0, y: y0, z: 0 }, { x: x0, y: y1, z: 0 }, { x: x0, y: y1, z: h }, { x: x0, y: y0, z: h }], side);
    this.quad([{ x: x0, y: y1, z: 0 }, { x: x1, y: y1, z: 0 }, { x: x1, y: y1, z: h }, { x: x0, y: y1, z: h }], front);
    this.quad([{ x: x0, y: y0, z: h }, { x: x1, y: y0, z: h }, { x: x1, y: y1, z: h }, { x: x0, y: y1, z: h }], top);
  }

  /** The textured wall box: the same faces as box(), with the theme's wall textures (texture anchored to the module origin `o`). */
  private boxTex(o: { x: number; y: number }, x0: number, y0: number, x1: number, y1: number, h: number, cx: number, k: number,
    shades: [number, number, number] = [1, 0.78, 0.6]): void {
    if (x1 - x0 <= 0 || y1 - y0 <= 0) return;
    const a = this.art!;
    const topImg = this.img(a.wallTop);
    const one = (im: Img) => () => im;
    const T = kArtWorld;
    // The wall face art (Nov 20) is drawn once from the top of a full-height wall to the floor, square, repeating sideways. Low boxes
    // (the curb) and themes without face art use the wall-top texture on their faces.
    const faceArt = a.wallFace !== undefined && h >= kWallH;
    const faceImg = this.img(faceArt ? a.wallFace! : a.wallTop);
    const F = faceArt ? h : T;
    const down: Vec3 = { x: 0, y: 0, z: -1 };
    const xf = cx > x1 ? x1 : cx < x0 ? x0 : undefined;
    // Faces and the thin tops bend little under this camera, so they are cut only at texture repeats.
    if (xf !== undefined) this.plane(one(faceImg), { x: xf, y: o.y, z: h }, { x: 0, y: 1, z: 0 }, down, y0 - o.y, y1 - o.y, 0, h, F, F, shades[2] * k, T);
    this.plane(one(faceImg), { x: o.x, y: y1, z: h }, { x: 1, y: 0, z: 0 }, down, x0 - o.x, x1 - o.x, 0, h, F, F, shades[1] * k, T);
    this.plane(one(topImg), { x: o.x, y: o.y, z: h }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, x0 - o.x, x1 - o.x, y0 - o.y, y1 - o.y, T, T, shades[0] * k, T);
  }

  private drawModule(m: Module): void {
    const theme = themeById(kThemeId);
    const k = m.brightness;
    const o = this.moduleOrigin(m.node);
    const art = this.art;
    const tileA = rgbToInt(theme.base[0], k);
    const tileB = rgbToInt(theme.base[1], k);
    const wallTop = rgbToInt(theme.base[2], k * 1.15);
    const wallFront = rgbToInt(theme.base[2], k * 0.8);
    const wallSide = rgbToInt(theme.base[2], k * 0.6);
    const curb = rgbToInt(theme.base[3], k);
    const mat = rgbToInt(theme.base[4], k);
    const prop = rgbToInt(theme.base[5], k);
    const propDark = rgbToInt(theme.base[5], k * 0.7);
    // Floor: textured cells (a variant per cell, fixed per room) or the checkered tiles.
    if (art) {
      const floors = art.floor.map((key) => this.img(key));
      const total = art.floorWeights.reduce((x, y) => x + y, 0);
      const pick = (iu: number, iv: number): Img => {
        let r = (hash3(m.node, iu, iv) / 4294967296) * total;
        for (let i = 0; i < floors.length; ++i) { r -= art.floorWeights[i]; if (r < 0) return floors[i]; }
        return floors[0];
      };
      this.plane(pick, { x: o.x - kHx, y: o.y - kHy, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0, 2 * kHx, 0, 2 * kHy, kArtWorld, kArtWorld, k);
    } else {
      for (let ty = 0; ty < kTilesY; ++ty) {
        for (let tx = 0; tx < kTilesX; ++tx) {
          const x0 = o.x - kHx + tx * kTile;
          const y0 = o.y - kHy + ty * kTile;
          this.quad([{ x: x0, y: y0, z: 0 }, { x: x0 + kTile, y: y0, z: 0 }, { x: x0 + kTile, y: y0 + kTile, z: 0 }, { x: x0, y: y0 + kTile, z: 0 }],
            (tx + ty) % 2 === 0 ? tileA : tileB);
        }
      }
    }
    const hasDoor = (d: number): boolean => ((m.doorMask >> d) & 1) === 1;
    const half = kDoorW / 2;
    // Door mats in the doorways (the cave's worn threshold runs through the doorway, its moss edges against the wall ends).
    for (let d = 0; d < 4; ++d) {
      if (!hasDoor(d)) continue;
      const dv = dirVec(d);
      const pv = perpVec(d);
      const e0 = edgeOf(d);
      const e1 = e0 + kWallT;
      const a = { x: o.x + dv.x * e0 - pv.x * half, y: o.y + dv.y * e0 - pv.y * half };
      const b = { x: o.x + dv.x * e1 + pv.x * half, y: o.y + dv.y * e1 + pv.y * half };
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      if (art) {
        const im = this.img(art.doorway);
        // u runs through the doorway (image left to right), v across it (image top to bottom = the door's width).
        if (isSide(d)) this.plane(() => im, { x: x0, y: y0, z: 1 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0, x1 - x0, 0, y1 - y0, kDoorW, kDoorW, k);
        else this.plane(() => im, { x: x0, y: y0, z: 1 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, 0, y1 - y0, 0, x1 - x0, kDoorW, kDoorW, k);
      } else this.quad([{ x: x0, y: y0, z: 1 }, { x: x1, y: y0, z: 1 }, { x: x1, y: y1, z: 1 }, { x: x0, y: y1, z: 1 }], mat);
    }
    const sortedProps = [...m.props].sort((a, b) => a.y - b.y);
    if (!art) for (const p of sortedProps.filter((q) => q.y < 0)) this.drawProp(p, o, prop, propDark);
    // North wall (far), split at the doorway.
    const ox0 = o.x - kHx - kWallT, ox1 = o.x + kHx + kWallT;
    const ny0 = o.y - kHy - kWallT, ny1 = o.y - kHy;
    const wall = (x0: number, y0: number, x1: number, y1: number): void => {
      if (art) this.boxTex(o, x0, y0, x1, y1, kWallH, o.x, k);
      else this.box(x0, y0, x1, y1, kWallH, wallTop, wallFront, wallSide, o.x);
    };
    if (hasDoor(0)) {
      wall(ox0, ny0, o.x - half, ny1);
      wall(o.x + half, ny0, ox1, ny1);
    } else wall(ox0, ny0, ox1, ny1);
    // West and east walls.
    for (const d of [3, 1]) {
      const x0 = d === 3 ? o.x - kHx - kWallT : o.x + kHx;
      const x1 = x0 + kWallT;
      const y0 = o.y - kHy, y1 = o.y + kHy;
      if (hasDoor(d)) {
        wall(x0, y0, x1, o.y - half);
        wall(x0, o.y + half, x1, y1);
      } else wall(x0, y0, x1, y1);
    }
    if (art) {
      this.drawTrim(m, o, k);
      this.drawArtProps(m, o, k, sortedProps);
    } else for (const p of sortedProps.filter((q) => q.y >= 0)) this.drawProp(p, o, prop, propDark);
    // South: a low curb so it never hides units at the bottom edge.
    const sy0 = o.y + kHy, sy1 = o.y + kHy + kWallT;
    const curbBox = (x0: number, x1: number): void => {
      if (art) this.boxTex(o, x0, sy0, x1, sy1, kCurbH, o.x, k, [0.75, 0.6, 0.5]);
      else this.box(x0, sy0, x1, sy1, kCurbH, curb, curb, curb, o.x);
    };
    if (hasDoor(2)) {
      curbBox(ox0, o.x - half);
      curbBox(o.x + half, ox1);
    } else curbBox(ox0, ox1);
  }

  /** The rubble strip standing at the foot of the north, west and east walls (skipping doorways), to blend wall into floor. */
  private drawTrim(m: Module, o: { x: number; y: number }, k: number): void {
    const im = this.img(this.art!.trim);
    const h = kTrimLen * (im.height / im.width);
    const half = kDoorW / 2;
    const down: Vec3 = { x: 0, y: 0, z: -1 };
    const spans = (len: number, door: boolean): [number, number][] => (door ? [[0, len / 2 - half], [len / 2 + half, len]] : [[0, len]]);
    const run = (origin: Vec3, axis: Vec3, len: number, door: boolean, shade: number): void => {
      for (const [a, b] of spans(len, door)) this.plane(() => im, origin, axis, down, a, b, 0, h, kTrimLen, h, shade * k, kTrimLen);
    };
    const hasDoor = (d: number): boolean => ((m.doorMask >> d) & 1) === 1;
    run({ x: o.x - kHx, y: o.y - kHy + kTrimInset, z: h }, { x: 1, y: 0, z: 0 }, 2 * kHx, hasDoor(0), 1);
    run({ x: o.x - kHx + kTrimInset, y: o.y - kHy, z: h }, { x: 0, y: 1, z: 0 }, 2 * kHy, hasDoor(3), 0.85);
    run({ x: o.x + kHx - kTrimInset, y: o.y - kHy, z: h }, { x: 0, y: 1, z: 0 }, 2 * kHy, hasDoor(1), 0.85);
  }

  /** Standing props as upright sprites (one picked per scattered spot, fixed per room), plus two torches on the far wall. */
  private drawArtProps(m: Module, o: { x: number; y: number }, k: number, props: Prop[]): void {
    const art = this.art!;
    const upright = (key: string, height: number, x: number, y: number, z: number, shade: number): void => {
      const im = this.img(key);
      const w = height * (im.width / im.height);
      this.plane(() => im, { x: x - w / 2, y, z: z + height }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 0, w, 0, height, w, height, shade * k, 400);
    };
    if (art.torch) {
      for (const side of [-1, 1]) upright(art.torch.key, art.torch.height, o.x + side * kHx * 0.5, o.y - kHy + 2, 90, 1);
    }
    const total = art.props.reduce((s, p) => s + p.weight, 0);
    props.forEach((p) => {
      let r = (hash3(m.node, Math.round(p.x), Math.round(p.y)) / 4294967296) * total;
      let pick = art.props[0];
      for (const q of art.props) { r -= q.weight; if (r < 0) { pick = q; break; } }
      upright(pick.key, pick.height * (0.85 + 0.3 * (p.sz - 25) / 70), o.x + p.x, o.y + p.y, 0, 0.95);
    });
  }

  private drawProp(p: Prop, o: { x: number; y: number }, top: number, side: number): void {
    const x = o.x + p.x, y = o.y + p.y;
    const c = Math.cos((p.yawDeg * Math.PI) / 180), s = Math.sin((p.yawDeg * Math.PI) / 180);
    const corner = (u: number, v: number, z: number): Vec3 => ({ x: x + u * c - v * s, y: y + u * s + v * c, z });
    const hw = p.sx / 2, hd = p.sy / 2;
    const base = [corner(-hw, -hd, 0), corner(hw, -hd, 0), corner(hw, hd, 0), corner(-hw, hd, 0)];
    const topQ = base.map((q) => ({ ...q, z: p.sz }));
    // Two faces toward the camera, then the top.
    for (let i = 0; i < 4; ++i) {
      const a = base[i], b = base[(i + 1) % 4];
      if ((a.y + b.y) / 2 - y > 0.01) this.quad([a, b, { ...b, z: p.sz }, { ...a, z: p.sz }], side);   // faces the camera (+Y)
    }
    this.quad(topQ, top);
  }
}

/** A stable 32-bit hash of three integers (floor variant and prop picks). */
function hash3(a: number, b: number, c: number): number {
  let h = 2166136261 ^ (a | 0);
  h = Math.imul(h ^ (b | 0), 16777619);
  h = Math.imul(h ^ (c | 0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}
