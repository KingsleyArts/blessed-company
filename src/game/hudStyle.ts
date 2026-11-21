// The in-run HUD's look (director's mockup, Nov 21): deep purple plates, bronze and gold frames, gems and small icons. Everything is drawn
// in code on a Graphics object, so it stays sharp at any screen size and sits exactly on the rectangles from hudLayout.ts.
import Phaser from 'phaser';
import type { Rect } from '../ui/hudLayout';

type G = Phaser.GameObjects.Graphics;

export const kHud = {
  ink: 0x0d0814,
  bar: 0x1b1029,
  panel: 0x1d1329,
  well: 0x130c1d,
  plum: 0x2c1c42,
  plumLit: 0x46306a,
  banner: 0x3b2763,
  bronze: 0xa86f38,
  gold: 0xe6b866,
  goldLit: 0xffe6a8,
  goldBtn: 0xc99a3c,
  steel: 0x3a3442,
  muted: 0x6d6475,
  hp: 0x4fce5a,
  hpDark: 0x1f6e2c,
};

export interface PlateOpts { edge?: number; inner?: number; radius?: number; sheen?: number; alpha?: number }

/** A framed plate: dark rim, bronze edge, filled face, soft light on the upper half and a thin inner line. */
export function plate(g: G, r: Rect, S: number, fill: number, o: PlateOpts = {}): void {
  const rad = Math.max(1, Math.min(o.radius ?? 6 * S, r.w / 2, r.h / 2));
  const t = Math.max(1.5, 2 * S);
  const a = o.alpha ?? 1;
  g.fillStyle(kHud.ink, 0.85 * a).fillRoundedRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2, rad + 1);
  g.fillStyle(o.edge ?? kHud.bronze, a).fillRoundedRect(r.x, r.y, r.w, r.h, rad);
  const fx = r.x + t, fy = r.y + t, fw = Math.max(1, r.w - 2 * t), fh = Math.max(1, r.h - 2 * t);
  const fr = Math.max(1, Math.min(rad - t * 0.5, fw / 2, fh / 2));
  g.fillStyle(fill, a).fillRoundedRect(fx, fy, fw, fh, fr);
  const sheen = o.sheen ?? 0.09;
  if (sheen > 0) g.fillStyle(0xffffff, sheen * a).fillRoundedRect(fx, fy, fw, fh * 0.48, Math.min(fr, fh * 0.24));
  if (o.inner !== undefined) g.lineStyle(Math.max(1, 0.75 * S), o.inner, 0.6 * a).strokeRoundedRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1, fr);
}

/** Small gold diamond ornament. */
export function stud(g: G, cx: number, cy: number, s: number, color = kHud.goldLit): void {
  poly(g, [[cx, cy - s], [cx + s, cy], [cx, cy + s], [cx - s, cy]], color);
}

export function poly(g: G, pts: number[][], color: number, alpha = 1): void {
  g.fillStyle(color, alpha).fillPoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
}

/** A large ornate panel: double gold frame, corner brackets, and studs on the top and bottom edges. */
export function ornatePanel(g: G, r: Rect, S: number): void {
  plate(g, r, S, kHud.panel, { edge: kHud.bronze, radius: 8 * S, sheen: 0 });
  const t = Math.max(1.5, 2 * S);
  const inset = 4 * S + t;
  g.lineStyle(Math.max(1, S), kHud.gold, 0.75).strokeRoundedRect(r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset, 5 * S);
  const c = 15 * S;
  const w = Math.max(2, 2.5 * S);
  g.lineStyle(w, kHud.gold, 1);
  for (const [x, y, dx, dy] of [[r.x, r.y, 1, 1], [r.right(), r.y, -1, 1], [r.x, r.bottom(), 1, -1], [r.right(), r.bottom(), -1, -1]]) {
    const ox = x + dx * t, oy = y + dy * t;
    g.lineBetween(ox, oy, ox + dx * c, oy);
    g.lineBetween(ox, oy, ox, oy + dy * c);
    stud(g, ox + dx * 2 * S, oy + dy * 2 * S, 3 * S);
  }
  stud(g, r.x + r.w / 2, r.y + 1, 4.5 * S);
  stud(g, r.x + r.w / 2, r.bottom() - 1, 6 * S);
}

/** A faceted gem. */
export function gem(g: G, cx: number, cy: number, rx: number, ry: number, light: number, mid: number, dark: number): void {
  const top = [cx, cy - ry], right = [cx + rx, cy - ry * 0.15], bottom = [cx, cy + ry], left = [cx - rx, cy - ry * 0.15];
  const core = [cx, cy - ry * 0.15];
  poly(g, [left, top, core], light);
  poly(g, [top, right, core], mid);
  poly(g, [left, core, bottom], mid);
  poly(g, [core, right, bottom], dark);
}
export const blueGem = (g: G, cx: number, cy: number, rx: number, ry: number): void => gem(g, cx, cy, rx, ry, 0xb9e6ff, 0x4f9ff0, 0x2358c4);
export const goldGem = (g: G, cx: number, cy: number, rx: number, ry: number): void => gem(g, cx, cy, rx, ry, 0xfff0b0, 0xf2b53a, 0xb96f16);

export type IconName = 'sword' | 'swords' | 'speed' | 'heart' | 'shield' | 'cooldown' | 'crit' | 'cross' | 'sun';

function shieldShape(cx: number, cy: number, s: number): number[][] {
  return [[cx - s * 0.85, cy - s * 0.7], [cx, cy - s], [cx + s * 0.85, cy - s * 0.7], [cx + s * 0.75, cy + s * 0.2], [cx, cy + s], [cx - s * 0.75, cy + s * 0.2]];
}

function blade(g: G, cx: number, cy: number, s: number, flip: number, color: number): void {
  const tipX = cx + flip * s, tipY = cy - s;
  const baseX = cx - flip * s * 0.45, baseY = cy + s * 0.45;
  const w = Math.max(1.5, s * 0.22);
  g.lineStyle(w, color, 1).lineBetween(baseX, baseY, tipX, tipY);
  g.lineStyle(w * 0.9, kHud.gold, 1).lineBetween(baseX - flip * s * 0.28, baseY - s * 0.28, baseX + flip * s * 0.28, baseY + s * 0.28);
  g.lineStyle(w * 1.1, kHud.bronze, 1).lineBetween(baseX, baseY, cx - flip * s * 0.9, cy + s * 0.9);
}

/** A small icon centred on (cx, cy), `s` from centre to edge. */
export function icon(g: G, name: IconName, cx: number, cy: number, s: number, color = 0xf1ece4): void {
  const w = Math.max(1.5, s * 0.26);
  switch (name) {
    case 'sword': blade(g, cx, cy, s, 1, color); break;
    case 'swords': blade(g, cx, cy, s, 1, color); blade(g, cx, cy, s, -1, color); break;
    case 'speed':
      g.lineStyle(w, color, 1);
      for (const dx of [-0.65, 0.05]) {
        g.lineBetween(cx + dx * s, cy - s * 0.7, cx + (dx + 0.6) * s, cy);
        g.lineBetween(cx + (dx + 0.6) * s, cy, cx + dx * s, cy + s * 0.7);
      }
      break;
    case 'heart':
      g.fillStyle(color, 1).fillCircle(cx - s * 0.42, cy - s * 0.3, s * 0.5).fillCircle(cx + s * 0.42, cy - s * 0.3, s * 0.5);
      poly(g, [[cx - s * 0.9, cy - s * 0.1], [cx + s * 0.9, cy - s * 0.1], [cx, cy + s * 0.9]], color);
      break;
    case 'shield':
      poly(g, shieldShape(cx, cy, s), color);
      poly(g, shieldShape(cx, cy, s * 0.62), kHud.plum);
      poly(g, [[cx, cy - s * 0.62], [cx + s * 0.53, cy - s * 0.43], [cx + s * 0.46, cy + s * 0.12], [cx, cy + s * 0.62]], color, 0.75);
      break;
    case 'cooldown':
      g.lineStyle(w, color, 1).beginPath().arc(cx, cy, s * 0.72, -2.4, 2.1, false).strokePath();
      poly(g, [[cx - s, cy - s * 0.85], [cx - s * 0.2, cy - s * 0.7], [cx - s * 0.75, cy - s * 0.1]], color);
      break;
    case 'crit':
      poly(g, [[cx + s * 0.25, cy - s], [cx - s * 0.65, cy + s * 0.15], [cx - s * 0.05, cy + s * 0.15], [cx - s * 0.25, cy + s], [cx + s * 0.65, cy - s * 0.2], [cx + s * 0.05, cy - s * 0.2]], color);
      break;
    case 'cross':
      g.fillStyle(0x1f8a35, 1).fillRoundedRect(cx - s, cy - s * 0.42, 2 * s, s * 0.84, s * 0.14).fillRoundedRect(cx - s * 0.42, cy - s, s * 0.84, 2 * s, s * 0.14);
      g.fillStyle(color, 1).fillRect(cx - s * 0.82, cy - s * 0.27, 1.64 * s, s * 0.54).fillRect(cx - s * 0.27, cy - s * 0.82, s * 0.54, 1.64 * s);
      break;
    case 'sun':
      for (let k = 0; k < 8; ++k) {
        const a = (k * Math.PI) / 4;
        const len = k % 2 === 0 ? s : s * 0.68;
        const px = -Math.sin(a) * s * 0.17, py = Math.cos(a) * s * 0.17;
        poly(g, [[cx + px, cy + py], [cx + Math.cos(a) * len, cy + Math.sin(a) * len], [cx - px, cy - py]], color);
      }
      g.fillStyle(0xfff4c9, 1).fillCircle(cx, cy, s * 0.26);
      break;
  }
}

/** A hero's stat row icon. */
export function statIcon(stat: string): IconName {
  if (stat.includes('AttackSpeed')) return 'speed';
  if (stat.includes('Crit')) return 'crit';
  if (stat.includes('Damage')) return 'sword';
  if (stat.includes('Health')) return 'heart';
  if (stat.includes('Cooldown')) return 'cooldown';
  return 'shield';
}

/** The winged frame ends of the Miracle gauge. */
export function wing(g: G, x: number, cy: number, s: number, dir: number): void {
  for (let k = 0; k < 3; ++k) {
    const y = cy - s * 0.5 + k * s * 0.42;
    const len = s * (1.25 - k * 0.3);
    poly(g, [[x, y], [x + dir * len, y - s * 0.28], [x + dir * len * 0.72, y + s * 0.2]], k === 0 ? kHud.goldLit : kHud.gold);
  }
}
