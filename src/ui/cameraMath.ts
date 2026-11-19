// Pinhole camera that frames the room (UI/TolCameraMath.h). World axes are the sim's: X right on screen (party left, enemies right),
// Y toward the viewer (North = -Y is the far wall), Z up. The camera looks down at kPitchDeg; fitCamera finds the closest distance at
// which the whole room box fits a screen region, centred in it. project() maps a world point to canvas pixels.

export interface Vec3 { x: number; y: number; z: number }
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a: Vec3, s: number): Vec3 => v(a.x * s, a.y * s, a.z * s);
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const rad = (d: number): number => (d * Math.PI) / 180;

export interface CamBasis { forward: Vec3; right: Vec3; up: Vec3 }

/** Unreal yaw -90 (looking along -Y in Unreal) maps to looking toward -Y here too: the far wall is North (-Y). */
export function basisForPitch(pitchDeg: number): CamBasis {
  const c = Math.cos(rad(pitchDeg));
  const s = Math.sin(rad(pitchDeg));
  return { forward: v(0, -c, -s), right: v(1, 0, 0), up: v(0, -s, c) };
}

export interface NdcRegion { u0: number; u1: number; v0: number; v1: number }
export interface RoomBox { hx: number; hy: number; wallT: number; wallH: number }

export class Camera {
  pos: Vec3 = v(0, 0, 0);
  constructor(readonly pitchDeg: number, readonly hfovDeg: number, public canvasW: number, public canvasH: number) {}
  get basis(): CamBasis { return basisForPitch(this.pitchDeg); }
  get aspect(): number { return this.canvasW / this.canvasH; }

  /** Canvas pixels and depth (depth <= 0: behind the camera). */
  project(p: Vec3, offset: Vec3 = v(0, 0, 0)): { x: number; y: number; depth: number } {
    const b = this.basis;
    const tH = Math.tan(rad(this.hfovDeg) * 0.5);
    const tV = tH / this.aspect;
    const d = sub(p, add(this.pos, offset));
    const depth = dot(d, b.forward);
    if (depth <= 1e-6) return { x: -1e9, y: -1e9, depth };
    const nx = dot(d, b.right) / (depth * tH);
    const ny = dot(d, b.up) / (depth * tV);
    return { x: (nx + 1) * 0.5 * this.canvasW, y: (1 - ny) * 0.5 * this.canvasH, depth };
  }

  /** The ground point (z = groundZ) under a canvas pixel, or undefined. */
  groundAt(px: number, py: number, groundZ: number, offset: Vec3 = v(0, 0, 0)): { x: number; y: number } | undefined {
    const b = this.basis;
    const tH = Math.tan(rad(this.hfovDeg) * 0.5);
    const tV = tH / this.aspect;
    const nx = (px / this.canvasW) * 2 - 1;
    const ny = 1 - (py / this.canvasH) * 2;
    const dir = add(add(b.forward, mul(b.right, nx * tH)), mul(b.up, ny * tV));
    const origin = add(this.pos, offset);
    if (Math.abs(dir.z) < 1e-9) return undefined;
    const t = (groundZ - origin.z) / dir.z;
    if (t <= 0) return undefined;
    return { x: origin.x + dir.x * t, y: origin.y + dir.y * t };
  }

  /** FitCamera: the closest distance at which the room box fits `region`, centred in it. Returns whether it fits. */
  fit(room: RoomBox, region: NdcRegion): boolean {
    const b = this.basis;
    const tH = Math.tan(rad(this.hfovDeg) * 0.5);
    const tV = tH / this.aspect;
    const ox = room.hx + room.wallT;
    const oy = room.hy + room.wallT;
    const corners: Vec3[] = [];
    for (const z of [0, room.wallH]) for (const x of [-ox, ox]) for (const y of [-oy, oy]) corners.push(v(x, y, z));
    const cu = (region.u0 + region.u1) * 0.5;
    const cv = (region.v0 + region.v1) * 0.5;
    const rw = region.u1 - region.u0;
    const rh = region.v1 - region.v0;
    const place = (dist: number): { pos: Vec3; su: number; sv: number } => {
      let a = -cu * dist * tH;
      let bb = -cv * dist * tV;
      let pos = v(0, 0, 0);
      let su = 0;
      let sv = 0;
      for (let it = 0; it < 8; ++it) {
        pos = add(add(mul(b.forward, -dist), mul(b.right, a)), mul(b.up, bb));
        let minU = 1e18, maxU = -1e18, minV = 1e18, maxV = -1e18;
        for (const c of corners) {
          const d = sub(c, pos);
          const depth = dot(d, b.forward);
          const nx = depth > 1e-6 ? dot(d, b.right) / (depth * tH) : 1e9;
          const ny = depth > 1e-6 ? dot(d, b.up) / (depth * tV) : 1e9;
          minU = Math.min(minU, nx); maxU = Math.max(maxU, nx);
          minV = Math.min(minV, ny); maxV = Math.max(maxV, ny);
        }
        su = maxU - minU;
        sv = maxV - minV;
        const du = (minU + maxU) * 0.5 - cu;
        const dv = (minV + maxV) * 0.5 - cv;
        if (Math.abs(du) < 1e-7 && Math.abs(dv) < 1e-7) break;
        a += du * dist * tH;
        bb += dv * dist * tV;
      }
      return { pos, su, sv };
    };
    let lo = 100;
    let hi = 200000;
    for (let i = 0; i < 60; ++i) {
      const mid = 0.5 * (lo + hi);
      const r = place(mid);
      if (r.su <= rw && r.sv <= rh) hi = mid;
      else lo = mid;
    }
    const f = place(hi);
    this.pos = f.pos;
    return f.su <= rw * (1 + 1e-6) && f.sv <= rh * (1 + 1e-6);
  }
}

/** A canvas pixel rect to an NDC region. */
export function regionFromRect(x: number, y: number, w: number, h: number, cw: number, ch: number): NdcRegion {
  return { u0: (2 * x) / cw - 1, u1: (2 * (x + w)) / cw - 1, v1: 1 - (2 * y) / ch, v0: 1 - (2 * (y + h)) / ch };
}
