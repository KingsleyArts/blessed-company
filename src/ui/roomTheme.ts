// The look of a room as data (UI/TolRoomTheme.h): six colours and how many rock props to scatter along the walls. Props stand only in the
// strip between the arena and the walls and never in a doorway, from a seed made of the run seed and the room id, so a room looks the
// same every time it is drawn.

export type Rgb = [number, number, number];
export interface RoomTheme { name: string; base: Rgb[]; propsPerRoom: number }   // base: tile A, tile B, wall, curb, door mat, props

export const kThemes: RoomTheme[] = [
  { name: 'Brick', base: [[0.55, 0.28, 0.14], [0.43, 0.21, 0.11], [0.42, 0.10, 0.09], [0.28, 0.07, 0.07], [0.20, 0.36, 0.14], [0.30, 0.30, 0.30]], propsPerRoom: 0 },
  { name: 'Goblin Cave', base: [[0.30, 0.27, 0.22], [0.24, 0.22, 0.18], [0.20, 0.17, 0.15], [0.14, 0.12, 0.10], [0.16, 0.30, 0.12], [0.26, 0.23, 0.20]], propsPerRoom: 16 },
];

/** tol.RoomTheme default 1: goblin cave. */
export const themeById = (id: number): RoomTheme => kThemes[Math.max(0, Math.min(kThemes.length - 1, id))];

export interface Prop { x: number; y: number; sx: number; sy: number; sz: number; yawDeg: number }

const M64 = (1n << 64n) - 1n;

function next(s: { v: bigint }): bigint {   // xorshift64*
  s.v ^= s.v >> 12n;
  s.v = (s.v ^ (s.v << 25n)) & M64;
  s.v ^= s.v >> 27n;
  return (s.v * 2685821657736338717n) & M64;
}
const unit = (s: { v: bigint }): number => Number(next(s) >> 11n) / 9007199254740992;

export function scatterWallProps(seed: bigint, nodeId: number, hx: number, hy: number, doorMask: number, doorW: number, margin: number, count: number): Prop[] {
  const out: Prop[] = [];
  const s = { v: ((seed * 0x9e3779b97f4a7c15n) & M64) ^ ((BigInt(nodeId + 1) * 0xd1b54a32d192ed03n) & M64) ^ 0x6f61c7afn };
  if (s.v === 0n) s.v = 1n;
  const foot = margin * 0.9;
  for (let i = 0; i < count * 4 && out.length < count; ++i) {
    const wall = Number(next(s) % 4n);
    const t = unit(s) * 2 - 1;
    const w = foot * (0.45 + 0.55 * unit(s));
    const d = foot * (0.45 + 0.55 * unit(s));
    const h = 25 + 70 * unit(s);
    const yaw = unit(s) * 90;
    const radius = 0.5 * Math.sqrt(w * w + d * d);
    if (radius > margin * 0.5) continue;
    const horizontal = wall === 0 || wall === 2;
    const along = t * ((horizontal ? hx : hy) - margin);
    if ((doorMask >> wall) & 1 && Math.abs(along) < doorW * 0.5 + radius + 10) continue;
    const across = (horizontal ? hy : hx) - margin * 0.5;
    out.push({
      x: horizontal ? along : wall === 1 ? across : -across,
      y: horizontal ? (wall === 2 ? across : -across) : along,
      sx: w, sy: d, sz: h, yawDeg: yaw,
    });
  }
  return out;
}

export const rgbToInt = (c: Rgb, k = 1): number => {
  const ch = (x: number): number => Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, x * k), 1 / 2.2) * 255)));
  return (ch(c[0]) << 16) | (ch(c[1]) << 8) | ch(c[2]);
};
