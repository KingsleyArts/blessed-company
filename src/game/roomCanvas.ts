// The room view's drawing surface (Nov 20, cave tile set): a 2D canvas the size of the room area, at device pixels, shown as one Phaser
// image. Graphics objects cannot texture-map, so the room is painted here: flat polygons for themes without art, and textures stretched
// onto the camera-projected floor, wall and prop quads (each quad split into two affine triangles; quads are kept small so the
// perspective error stays under a pixel or two). Pixel art stays crisp (no smoothing). Shading is baked into cached darkened copies of
// each image, so transparent props and trim darken correctly too.
import Phaser from 'phaser';
import type { Rect } from '../ui/hudLayout';

export interface Pt { x: number; y: number }
export type Img = HTMLImageElement | HTMLCanvasElement;

const kKey = 'room_canvas';
const kShadeSteps = 24;

export class RoomCanvas {
  private canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private tex: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private shadeCache = new Map<Img, HTMLCanvasElement[]>();

  constructor(scene: Phaser.Scene, depth: number) {
    if (scene.textures.exists(kKey)) scene.textures.remove(kKey);
    this.tex = scene.textures.createCanvas(kKey, 16, 16)!;
    this.canvas = this.tex.getSourceImage() as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = scene.add.image(0, 0, kKey).setOrigin(0, 0).setDepth(depth);
  }

  /** Sizes the canvas to the room area (CSS pixels) at `dpr`, clears it, and sets a transform so drawing uses scene (CSS) pixels. */
  begin(area: Rect, dpr: number): CanvasRenderingContext2D {
    const w = Math.max(1, Math.round(area.w * dpr));
    const h = Math.max(1, Math.round(area.h * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) this.tex.setSize(w, h);
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(dpr, 0, 0, dpr, -area.x * dpr, -area.y * dpr);
    c.imageSmoothingEnabled = false;
    this.image.setPosition(area.x, area.y).setDisplaySize(area.w, area.h);
    return c;
  }

  end(): void { this.tex.refresh(); }

  fillPoly(pts: Pt[], color: number): void {
    const c = this.ctx;
    c.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    c.beginPath();
    pts.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)));
    c.closePath();
    c.fill();
  }

  /** Darkness framing the area: each edge fades from `color` at `alpha` to clear over `depth` CSS pixels (corners get both). */
  edgeHaze(area: Rect, depth: number, color: number, alpha: number): void {
    const c = this.ctx;
    const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
    const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number): void => {
      const grad = c.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grad.addColorStop(0.45, `rgba(${r},${g},${b},${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      c.fillStyle = grad;
      c.fillRect(rx, ry, rw, rh);
    };
    const { x, y, w, h } = area;
    edge(x, y, x, y + depth, x, y, w, depth);
    edge(x, y + h, x, y + h - depth, x, y + h - depth, w, depth);
    edge(x, y, x + depth, y, x, y, depth, h);
    edge(x + w, y, x + w - depth, y, x + w - depth, y, depth, h);
  }

  /** `img` darkened to `shade` (0 black .. 1 as drawn), from a cache of kShadeSteps levels. */
  shaded(img: Img, shade: number): Img {
    const s = Math.round(Math.min(1, Math.max(0, shade)) * kShadeSteps);
    if (s >= kShadeSteps) return img;
    let list = this.shadeCache.get(img);
    if (!list) this.shadeCache.set(img, (list = []));
    let cv = list[s];
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const x = cv.getContext('2d')!;
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = `rgba(0,0,0,${1 - s / kShadeSteps})`;
      x.fillRect(0, 0, cv.width, cv.height);
      list[s] = cv;
    }
    return cv;
  }

  /** Draws the image region with corners s0..s3 (image pixels, in order) onto the screen quad d0..d3, as two affine triangles. */
  texQuad(img: Img, s: Pt[], d: Pt[]): void {
    this.texTri(img, s[0], s[1], s[2], d[0], d[1], d[2]);
    this.texTri(img, s[0], s[2], s[3], d[0], d[2], d[3]);
  }

  private texTri(img: Img, s0: Pt, s1: Pt, s2: Pt, d0: Pt, d1: Pt, d2: Pt): void {
    const den = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(den) < 1e-9) return;
    // Affine map: d = [a c e; b d f] * s, solved for both screen axes.
    const solve = (v0: number, v1: number, v2: number): [number, number, number] => [
      (v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / den,
      (v0 * (s2.x - s1.x) + v1 * (s0.x - s2.x) + v2 * (s1.x - s0.x)) / den,
      (v0 * (s1.x * s2.y - s2.x * s1.y) + v1 * (s2.x * s0.y - s0.x * s2.y) + v2 * (s0.x * s1.y - s1.x * s0.y)) / den,
    ];
    const [a, c, e] = solve(d0.x, d1.x, d2.x);
    const [b, dd, f] = solve(d0.y, d1.y, d2.y);
    // Clip to the triangle grown by about half a pixel, so neighbouring triangles overlap and no seam shows.
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const grow = (p: Pt): Pt => {
      const dx = p.x - cx, dy = p.y - cy;
      const l = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / l) * 0.6, y: p.y + (dy / l) * 0.6 };
    };
    const g0 = grow(d0), g1 = grow(d1), g2 = grow(d2);
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g0.x, g0.y);
    ctx.lineTo(g1.x, g1.y);
    ctx.lineTo(g2.x, g2.y);
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, dd, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
}
