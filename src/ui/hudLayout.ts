// Pure HUD layout math, ported from UI/TolHudLayout.h, TolMapLayout.h, TolEssenceLayout.h and TolHudMath.h. Every rectangle is derived from
// the canvas size, so the same numbers drive drawing, hit boxes and the room camera framing (the room is fitted into roomArea).
// No Phaser here: the scenes draw from these rectangles and tests can pin them.

export class Rect {
  constructor(public x = 0, public y = 0, public w = 0, public h = 0) {}
  right(): number { return this.x + this.w; }
  bottom(): number { return this.y + this.h; }
  contains(px: number, py: number): boolean { return px >= this.x && px < this.x + this.w && py >= this.y && py < this.y + this.h; }
}

export const kMaxPortraits = 6;

export interface PortraitSlot { portrait: Rect; cooldown: Rect; hp: Rect; hpText: Rect }

export interface Layout {
  topBar: Rect;
  pause: Rect; speed: Rect; autoBtn: Rect;
  healBtn: Rect; shieldBtn: Rect; smiteBtn: Rect;
  gauge: Rect;
  minimap: Rect;
  essence: Rect;
  roomArea: Rect;
  controlBand: Rect;
  portraitStrip: Rect;
  slots: PortraitSlot[];
  slotCount: number;
}

/** ComputeLayout: the HUD frame for a w x h canvas and `partyCount` portraits. */
export function computeLayout(w: number, h: number, partyCount: number): Layout {
  const slotCount = Math.max(0, Math.min(kMaxPortraits, partyCount));
  const topH = 0.065 * h;
  const topBar = new Rect(0, 0, w, topH);
  const colX = 0.715 * w;
  const colW = 0.275 * w;
  const gap = 0.012 * h;
  const minimap = new Rect(colX, topH + gap, colW, 0.34 * h);
  const essence = new Rect(colX, minimap.bottom() + gap, colW, 0.985 * h - (minimap.bottom() + gap));
  const bh = 0.05 * h;
  const by = topH + gap;
  const bx = 0.012 * w;
  const bgap = 0.008 * h;
  const pause = new Rect(bx, by, bh * 1.25, bh);
  const speed = new Rect(pause.right() + bgap, by, bh * 2.2, bh);
  const autoBtn = new Rect(speed.right() + bgap, by, bh * 2.2, bh);
  const healBtn = new Rect(autoBtn.right() + bgap * 3, by, bh * 2.6, bh);
  const shieldBtn = new Rect(healBtn.right() + bgap, by, bh * 2.6, bh);
  const smiteBtn = new Rect(shieldBtn.right() + bgap, by, bh * 2.6, bh);
  const gauge = new Rect(smiteBtn.right() + bgap * 2, by + bh * 0.3, bh * 3.4, bh * 0.4);

  const barGap = 0.004 * h;
  const cdH = 0.012 * h;
  const hpH = 0.014 * h;
  const textH = 0.02 * h;
  const margin = 0.012 * h;
  const chrome = cdH + barGap + barGap + hpH + barGap + textH + margin;
  let p = 0.105 * h;
  const n = Math.max(1, slotCount);
  p = Math.min(p, (0.68 * w) / (n * 1.15));
  const sgap = 0.15 * p;
  const stripTop = h - chrome - p;
  const x0 = 0.012 * w;
  const slots: PortraitSlot[] = [];
  for (let i = 0; i < slotCount; ++i) {
    const x = x0 + i * (p + sgap);
    const portrait = new Rect(x, stripTop + cdH + barGap, p, p);
    const cooldown = new Rect(x, stripTop, p, cdH);
    const hp = new Rect(x, portrait.bottom() + barGap, p, hpH);
    const hpText = new Rect(x, hp.bottom() + barGap, p, textH);
    slots.push({ portrait, cooldown, hp, hpText });
  }
  const portraitStrip = new Rect(x0, stripTop, slotCount > 0 ? slotCount * (p + sgap) - sgap : 0, h - margin - stripTop);
  const roomTop = by + bh + 0.01 * h;
  const roomBottom = h - (chrome + 0.105 * h);
  const roomArea = new Rect(0.005 * w, roomTop, colX - 0.01 * w, roomBottom - roomTop);
  const controlBand = new Rect(roomArea.x, roomBottom, roomArea.w, Math.max(0, h - margin - roomBottom));
  return { topBar, pause, speed, autoBtn, healBtn, shieldBtn, smiteBtn, gauge, minimap, essence, roomArea, controlBand, portraitStrip, slots, slotCount };
}

export function portraitAt(L: Layout, px: number, py: number): number {
  for (let i = 0; i < L.slotCount; ++i) {
    const s = L.slots[i];
    if (new Rect(s.cooldown.x, s.cooldown.y, s.portrait.w, s.hp.bottom() - s.cooldown.y).contains(px, py)) return i;
  }
  return -1;
}

export function cooldownFraction(remaining: number, total: number): number {
  if (!(total > 0) || Number.isNaN(remaining)) return 1;
  return Math.min(1, Math.max(0, 1 - remaining / total));
}

/** 1x, 2x, 4x, and 10x for testing builds only. */
export const kSpeedSteps = [1, 2, 4, 10];

/** UiState: what the buttons change. */
export class UiState {
  speedIndex = 0;
  paused = false;
  autoOn = false;
  selected = 0;
  amountMode = 0;
  speedMultiplier(): number { return kSpeedSteps[Math.max(0, Math.min(3, this.speedIndex))]; }
  effectiveSpeed(): number { return this.paused ? 0 : this.speedMultiplier(); }
  cycleSpeed(steps = 3): void {
    steps = Math.max(1, Math.min(4, steps));
    this.speedIndex = (this.speedIndex + 1) % steps;
    this.paused = false;
  }
  togglePause(): void { this.paused = !this.paused; }
  select(slot: number, partyCount: number): void { if (slot >= 0 && slot < partyCount) this.selected = slot; }
  clampSelection(partyCount: number): void {
    this.selected = partyCount <= 0 ? 0 : Math.max(0, Math.min(partyCount - 1, this.selected));
  }
}

// ---------------------------------------------------------------- HUD math (TolHudMath.h)
export function fillFraction(hp: number, maxHp: number): number {
  if (!(maxHp > 0) || Number.isNaN(hp)) return 0;
  return Math.min(1, Math.max(0, hp / maxHp));
}

/** UI scale from the canvas height: 1.0 at 1080, clamped to 0.6..1.5. */
export const scaleForHeight = (h: number): number => Math.min(1.5, Math.max(0.6, h / 1080));

/** Deterministic horizontal jitter in [-range, range] from a running counter. */
export function jitter(counter: number, range: number): number {
  const h = Math.floor(Math.imul(counter >>> 0, 2654435761) >>> 0) >>> 16;
  const unit = (h & 0xff) / 255;
  return (unit * 2 - 1) * range;
}

export interface FloatAnim { rise: number; alpha: number; scale: number; done: boolean }

export function floatAnimAt(age: number, duration: number, riseMax: number): FloatAnim {
  if (!(duration > 0) || age >= duration) return { rise: riseMax, alpha: 0, scale: 1, done: true };
  const t = Math.min(1, Math.max(0, age / duration));
  const inv = 1 - t;
  return {
    rise: riseMax * (1 - inv * inv),
    alpha: t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4,
    scale: t < 0.15 ? 1 + 0.3 * (1 - t / 0.15) : 1,
    done: false,
  };
}

// ---------------------------------------------------------------- arrows, Teleport, mini-map (TolMapLayout.h)
export interface RoomControls { up: Rect; left: Rect; right: Rect; down: Rect; teleport: Rect }

export function computeRoomControls(L: Layout): RoomControls {
  const band = L.controlBand;
  const s = 0.44 * band.h;
  const g = 0.1 * s;
  const padW = 3 * s + 2 * g;
  const padH = 2 * s + g;
  const x0 = band.right() - padW;
  const y0 = band.y + (band.h - padH) * 0.5;
  const up = new Rect(x0 + s + g, y0, s, s);
  const left = new Rect(x0, y0 + s + g, s, s);
  const down = new Rect(x0 + s + g, y0 + s + g, s, s);
  const right = new Rect(x0 + 2 * (s + g), y0 + s + g, s, s);
  const stripRight = L.slotCount > 0 ? L.portraitStrip.right() : band.x;
  const gap = 0.5 * s;
  const avail = x0 - gap - (stripRight + gap);
  const tw = Math.max(0, Math.min(avail, 0.3 * band.w));
  const th = 0.8 * s;
  const teleport = new Rect(x0 - gap - tw, band.y + (band.h - th) * 0.5, tw, th);
  return { up, left, right, down, teleport };
}

export const arrowRect = (C: RoomControls, d: number): Rect => [C.up, C.right, C.down, C.left][d];

export interface MinimapRegions { quota: Rect; map: Rect }

export function computeMinimapRegions(panel: Rect, scale: number): MinimapRegions {
  const t = Math.max(2, 2 * scale);
  const inset = 4 * scale + t;
  const pad = inset + 6 * scale;
  const ruleY = panel.y + inset + 6 * scale + 22 * scale;
  const quota = new Rect(panel.x + pad, ruleY + 3 * scale, panel.w - 2 * pad, 20 * scale);
  const top = quota.bottom() + 4 * scale;
  const bottom = panel.bottom() - inset - 4 * scale;
  return { quota, map: new Rect(panel.x + pad, top, panel.w - 2 * pad, Math.max(0, bottom - top)) };
}

export class MapGeometry {
  cols = 0; rows = 0; pitch = 0; ox = 0; oy = 0; roomW = 0; roomH = 0; corridorT = 0;
  constructor(public area: Rect, cols: number, rows: number) {
    if (cols <= 0 || rows <= 0 || area.w <= 0 || area.h <= 0) return;
    this.cols = cols;
    this.rows = rows;
    this.pitch = Math.min(area.w / cols, area.h / rows);
    this.ox = area.x + (area.w - cols * this.pitch) * 0.5;
    this.oy = area.y + (area.h - rows * this.pitch) * 0.5;
    this.roomW = 0.72 * this.pitch;
    this.roomH = 0.58 * this.pitch;
    this.corridorT = Math.max(2, 0.12 * this.pitch);
  }
  valid(): boolean { return this.cols > 0 && this.rows > 0 && this.pitch > 0; }
  roomRect(gx: number, gy: number): Rect {
    const cx = this.ox + gx * this.pitch;
    const cy = this.oy + gy * this.pitch;
    return new Rect(cx + (this.pitch - this.roomW) * 0.5, cy + (this.pitch - this.roomH) * 0.5, this.roomW, this.roomH);
  }
  corridor(gx: number, gy: number, d: number): Rect {
    const r = this.roomRect(gx, gy);
    const gapX = this.pitch - this.roomW;
    const gapY = this.pitch - this.roomH;
    const t = this.corridorT;
    switch (d) {
      case 0: return new Rect(r.x + (r.w - t) * 0.5, r.y - gapY, t, gapY);
      case 2: return new Rect(r.x + (r.w - t) * 0.5, r.bottom(), t, gapY);
      case 1: return new Rect(r.right(), r.y + (r.h - t) * 0.5, gapX, t);
      default: return new Rect(r.x - gapX, r.y + (r.h - t) * 0.5, gapX, t);
    }
  }
  /** Id of the known room under (px, py) (grown a little to be forgiving), or -1. */
  roomAt(rooms: readonly { id: number; gx: number; gy: number }[], px: number, py: number): number {
    if (!this.valid()) return -1;
    const grow = 0.06 * this.pitch;
    for (const r of rooms) {
      const q = this.roomRect(r.gx, r.gy);
      if (new Rect(q.x - grow, q.y - grow, q.w + 2 * grow, q.h + 2 * grow).contains(px, py)) return r.id;
    }
    return -1;
  }
}

// ---------------------------------------------------------------- Essence menu (TolEssenceLayout.h)
export const kMaxEssenceRows = 6;

export interface EssenceRow { row: Rect; name: Rect; values: Rect; button: Rect; rank: Rect; note: Rect }

export interface EssenceLayout {
  panel: Rect;
  portrait: Rect; nameText: Rect; classText: Rect; gearSlot: Rect;
  rows: EssenceRow[];
  amount: Rect[];
}

export function computeEssenceLayout(panel: Rect, rowCount: number, scale: number): EssenceLayout {
  rowCount = Math.max(0, Math.min(kMaxEssenceRows, rowCount));
  const pad = 14 * scale;
  const innerX = panel.x + pad;
  const innerW = Math.max(1, panel.w - 2 * pad);
  const top = panel.y + 42 * scale;
  const ps = Math.min(0.22 * panel.w, 0.13 * panel.h);
  const portrait = new Rect(innerX, top, ps, ps);
  const tx = innerX + ps + 10 * scale;
  const gw = 0.36 * innerW;
  const gearSlot = new Rect(innerX + innerW - gw, top, gw, ps);
  const tw = Math.max(1, gearSlot.x - 8 * scale - tx);
  const nameText = new Rect(tx, top + 0.04 * ps, tw, 0.5 * ps);
  const classText = new Rect(tx, top + 0.54 * ps, tw, 0.4 * ps);
  const ah = Math.min(46 * scale, 0.085 * panel.h);
  const ag = 8 * scale;
  const ay = panel.bottom() - pad - ah;
  const aw = (innerW - ag * 3) / 4;
  const amount = [0, 1, 2, 3].map((i) => new Rect(innerX + i * (aw + ag), ay, aw, ah));
  const rTop = top + ps + 10 * scale;
  const rBottom = ay - 10 * scale;
  const areaH = Math.max(0, rBottom - rTop);
  const rowGap = 6 * scale;
  const slotH = Math.min(92 * scale, areaH / Math.max(1, rowCount));
  const rowH = Math.max(1, slotH - rowGap);
  const rows: EssenceRow[] = [];
  for (let i = 0; i < rowCount; ++i) {
    const row = new Rect(innerX, rTop + i * slotH, innerW, rowH);
    const topLine = 0.6 * rowH;
    const bw = 0.3 * innerW;
    const bh = 0.92 * topLine;
    const button = new Rect(row.right() - bw - 4 * scale, row.y + 0.5 * (topLine - bh) + 2 * scale, bw, bh);
    const name = new Rect(row.x + 8 * scale, row.y + 0.08 * rowH, 0.28 * innerW, topLine);
    const values = new Rect(name.right(), row.y + 0.08 * rowH, button.x - name.right() - 4 * scale, topLine);
    const rank = new Rect(row.x + 8 * scale, row.y + topLine, 0.16 * innerW, rowH - topLine);
    const note = new Rect(rank.right(), row.y + topLine, row.right() - rank.right() - 4 * scale, rowH - topLine);
    rows.push({ row, name, values, button, rank, note });
  }
  return { panel, portrait, nameText, classText, gearSlot, rows, amount };
}
