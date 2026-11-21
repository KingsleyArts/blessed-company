// Drawing helpers shared by the scene: Unreal linear colours to sRGB, a text pool (Text objects reused frame to frame, so the HUD can be
// "immediate mode" like the Unreal Canvas HUD without creating objects every frame), and text that shrinks to fit a rectangle.
import Phaser from 'phaser';
import type { Rect } from '../ui/hudLayout';

/** An Unreal FLinearColor (linear) as a 0xRRGGBB colour. */
export function lin(r: number, g: number, b: number): number {
  const ch = (x: number): number => Math.max(0, Math.min(255, Math.round(linToSrgb(x) * 255)));
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}
function linToSrgb(x: number): number {
  x = Math.max(0, Math.min(1, x));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export const kGold = lin(0.86, 0.66, 0.24);
export const kGoldDim = lin(0.45, 0.34, 0.14);
export const kPanelFill = lin(0.045, 0.035, 0.055);
export const kBarFill = lin(0.04, 0.03, 0.05);
export const kTextLight = lin(0.95, 0.93, 0.88);
export const kTextDim = lin(0.62, 0.6, 0.58);

/** Units/TolUnit.cpp RoleColor: a portrait matches its body. */
export function classColor(cls: string): [number, number, number] {
  if (cls === 'Warrior' || cls === 'Barbarian') return [0.8, 0.2, 0.2];
  if (cls === 'Priest') return [0.9, 0.9, 0.3];
  if (cls === 'Mage') return [0.3, 0.4, 0.9];
  return [0.3, 0.8, 0.4];
}
export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

// A serif like the director's in-run mockup (Nov 21). Not Georgia: its old-style digits make 0 read as o and 1 as I in the HUD's numbers.
export const kFont = '"Palatino Linotype", "Book Antiqua", Palatino, "Times New Roman", serif';
/** The Unreal medium font is about 16 px tall at text scale 1. */
export const kBaseFontPx = 16;

const kTextPadX = 2;
const kTextPadY = 3;

/** The scale (at most 1) at which a text's letters fit w x h; its transparent padding may overhang. */
export function fitScale(t: Phaser.GameObjects.Text, w: number, h: number): number {
  const tw = t.width - 2 * kTextPadX, th = t.height - 2 * kTextPadY;
  if (!(tw > 0) || !(th > 0)) return 1;
  return Math.min(1, Math.max(0, w) / tw, Math.max(0, h) / th);
}

interface Slot { t: Phaser.GameObjects.Text; used: boolean; text: string; size: number; color: string; bold: boolean }

export class TextPool {
  private slots = new Map<string, Slot>();
  constructor(private readonly scene: Phaser.Scene, private readonly depth: number, private readonly resolution: number) {}

  begin(): void { for (const s of this.slots.values()) s.used = false; }
  end(): void { for (const s of this.slots.values()) if (!s.used && s.t.visible) s.t.setVisible(false); }

  private get(key: string, text: string, px: number, color: number, bold: boolean): Slot {
    let s = this.slots.get(key);
    const col = hex(color);
    if (!s) {
      // The padding keeps tall letters and descenders inside the text's own image: without it, some fonts lose their edges.
      const t = this.scene.add.text(0, 0, text, { fontFamily: kFont, fontSize: `${px}px`, color: col, fontStyle: bold ? 'bold' : 'normal', padding: { x: kTextPadX, y: kTextPadY } });
      t.setResolution(this.resolution);
      t.setDepth(this.depth);
      s = { t, used: true, text, size: px, color: col, bold };
      this.slots.set(key, s);
    }
    s.used = true;
    if (s.text !== text) { s.t.setText(text); s.text = text; }
    if (Math.abs(s.size - px) > 0.25) { s.t.setFontSize(px); s.size = px; }
    if (s.color !== col) { s.t.setColor(col); s.color = col; }
    if (s.bold !== bold) { s.t.setFontStyle(bold ? 'bold' : 'normal'); s.bold = bold; }
    s.t.setVisible(true);
    return s;
  }

  /** Text at (x, y) with an origin; size in px. */
  at(key: string, text: string, x: number, y: number, px: number, color: number, ox = 0, oy = 0, alpha = 1, bold = false): Phaser.GameObjects.Text {
    const s = this.get(key, text, px, color, bold);
    s.t.setOrigin(ox, oy).setPosition(x, y).setAlpha(alpha).setScale(1);
    return s.t;
  }

  /** Text centred in R, shrunk to fit its width (DrawCentered / DrawTextFit). */
  centered(key: string, text: string, r: Rect, px: number, color: number, alpha = 1, bold = false): void {
    const t = this.at(key, text, r.x + r.w / 2, r.y + r.h / 2, px, color, 0.5, 0.5, alpha, bold);
    t.setScale(fitScale(t, r.w * 0.96, r.h));
  }

  /** Text vertically centred in R, left (or right) aligned, shrunk until it fits R both ways, so it is never cut off or runs over. */
  fit(key: string, text: string, r: Rect, px: number, color: number, right = false, alpha = 1): void {
    const t = this.at(key, text, right ? r.right() : r.x, r.y + r.h / 2, px, color, right ? 1 : 0, 0.5, alpha);
    t.setScale(fitScale(t, r.w, r.h));
  }
}

export function outline(g: Phaser.GameObjects.Graphics, r: Rect, color: number, t: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(r.x, r.y, r.w, t);
  g.fillRect(r.x, r.bottom() - t, r.w, t);
  g.fillRect(r.x, r.y + t, t, r.h - 2 * t);
  g.fillRect(r.right() - t, r.y + t, t, r.h - 2 * t);
}

export function box(g: Phaser.GameObjects.Graphics, r: Rect, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(r.x, r.y, r.w, r.h);
}
