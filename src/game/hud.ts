// The combat HUD (UI/TolHud.cpp) drawn on the canvas: top bar (floor, room, Faith and Essence), pause / speed / Auto, the three miracle
// buttons and the Miracle Gauge, the mini-map with fog, the arrow pad and Teleport, the Essence menu, the portrait strip, the gear toast
// and (paused, testing builds) the tuning menu. Every rectangle comes from hudLayout.ts; clicks hit-test the same rectangles.
import Phaser from 'phaser';
import type { CombatSim, Unit } from '../core/combatSim';
import { RoomType } from '../core/floorGenerator';
import { MiracleKind, MiracleResult, miracleName, miracleTargetsEnemy } from '../core/miracleGauge';
import type { FloorSnapshot, RunManager, SidebarSnapshot } from '../core/runManager';
import { amountLabel, amountValue, formatBonusChange, formatBuyButton, formatCount, formatValueChange, roomLabel, statDisplayName } from '../core/uiText';
import {
  MapGeometry, Rect, UiState, arrowRect, computeEssenceLayout, computeLayout, computeMinimapRegions, computeRoomControls, cooldownFraction,
  fillFraction, portraitAt, type Layout,
} from '../ui/hudLayout';
import { TextPool, box, classColor, kBarFill, kBaseFontPx, kGold, kGoldDim, kPanelFill, kTextDim, kTextLight, lin, outline } from './draw';
import type { RoomView } from './roomView';
import { spriteSizes } from './heroMotion';
import { loadTuning, saveTuning } from './localStore';
import { spriteTuning, type UnitView } from './unitView';

export interface HudOptions { testing: boolean }

/** A tuning row. `id` is what the saved values are keyed by, so keep ids stable; `tab`: 0 party and miracles, 1 enemies, 2 sprites. */
interface TuneDef { id: string; name: string; step: number; min: number; max: number; tab: number }
const kTune: TuneDef[] = [
  { id: 'enemyMult', name: 'Enemy health and damage x', step: 0.1, min: 0.3, max: 4, tab: 1 },
  { id: 'castTime', name: 'Cast times and windups x (0 = instant)', step: 0.25, min: 0, max: 3, tab: 0 },
  { id: 'partyHeal', name: 'Party healing x', step: 0.1, min: 0, max: 3, tab: 0 },
  { id: 'gaugeFill', name: 'Miracle gauge fill per hit', step: 0.05, min: 0.05, max: 2, tab: 0 },
  { id: 'miracleCost', name: 'Miracle costs x', step: 0.25, min: 0.25, max: 3, tab: 0 },
  { id: 'smiteRadius', name: 'Smite radius (world units)', step: 25, min: 100, max: 900, tab: 0 },
  { id: 'hurtSeconds', name: 'Hurt sprite shows for (s)', step: 0.05, min: 0.05, max: 1.5, tab: 1 },
  { id: 'hurtCooldown', name: 'Hurt sprite cooldown (s between flinches)', step: 0.25, min: 0, max: 5, tab: 1 },
  { id: 'enemySprites', name: 'All enemy sprites x', step: 0.05, min: 0.5, max: 2, tab: 2 },
  { id: 'partySprites', name: 'All party sprites x', step: 0.05, min: 0.5, max: 2, tab: 2 },
  ...['Warrior', 'Mage', 'Assassin', 'Priest', 'Grunt', 'Archer', 'Brute', 'Shaman'].map((n) => ({
    id: `size:${n}`, name: `${n === 'Priest' ? 'Priestess' : n} size x`, step: 0.05, min: 0.3, max: 3, tab: 2,
  })),
];
const kTuneTabs = ['Party and miracles', 'Enemies', 'Sprites'];

type Hit = { rect: Rect; action: () => void; prio: number };

export class Hud {
  readonly ui = new UiState();
  private g: Phaser.GameObjects.Graphics;
  private hits: Hit[] = [];
  private mouse = { x: -1, y: -1 };
  private snap!: FloorSnapshot;
  private side: SidebarSnapshot | undefined;
  private previewCost: number[] = [];
  private previewBought: number[] = [];
  private sideDirty = true;
  private sideTimer = 0;
  private flashRow = -1;
  private flashAge = 9;
  private flashRefused = false;
  private armed: MiracleKind | undefined;
  private tuneTab = 0;
  private tuneValue: number[] = [];
  private copiedLeft = 0;
  private tuneTouched = false;
  private tuneInit = false;
  private resetArmedLeft = 0;
  /** Set while a DOM overlay (results card, Temple) covers the room: the HUD skips the room-area hit boxes. */
  overlayOpen = false;
  /** Set while the Temple is up with no run in progress: the HUD draws nothing (the Temple page covers the screen). */
  preRun = false;
  layout!: Layout;
  scale = 1;

  constructor(scene: Phaser.Scene, private readonly rm: RunManager, private readonly room: RoomView, private readonly units: UnitView,
    private readonly texts: TextPool, private readonly opts: HudOptions) {
    this.g = scene.add.graphics().setDepth(500);
    rm.onChange(() => { this.sideDirty = true; });
  }

  private sim(): CombatSim | undefined { return this.rm.getSim(); }

  private party(): Unit[] {
    const sim = this.sim();
    if (!sim) return [];
    return sim.getUnits().filter((u) => !u.enemy && !u.summon && !u.removed).slice(0, 6);
  }

  // ------------------------------------------------------------------------------------------ per frame
  update(dt: number, w: number, h: number): void {
    this.snap = this.rm.getFloorSnapshot();
    if (this.snap.runActive || this.snap.runEnded) this.ui.autoOn = this.snap.auto;
    const party = this.party();
    this.ui.clampSelection(party.length);
    this.layout = computeLayout(w, h, party.length);
    this.scale = Math.min(1.5, Math.max(0.6, h / 1080));
    this.resetArmedLeft = Math.max(0, this.resetArmedLeft - dt);
    this.copiedLeft = Math.max(0, this.copiedLeft - dt);
    if (this.opts.testing && !this.tuneInit) this.tuneClick('init');
    this.flashAge += dt;
    this.refreshSidebar(dt);
    if (this.armed !== undefined && !this.rm.miracleReady(this.armed)) this.armed = undefined;
    // The HUD owns the combat speed (0 while paused) and holds the Auto bot while paused.
    this.rm.setCombatSpeed(this.ui.effectiveSpeed());
    this.rm.setPaused(this.ui.paused);
    this.tunePush();
    // Smite aim ring follows the pointer over the room.
    this.units.smiteAim = undefined;
    if (this.armed !== undefined && miracleTargetsEnemy(this.armed) && this.layout.roomArea.contains(this.mouse.x, this.mouse.y)) {
      this.units.smiteAim = this.room.groundAt(this.mouse.x, this.mouse.y, 100);
    }
  }

  draw(): void {
    const g = this.g;
    g.clear();
    this.hits = [];
    const L = this.layout;
    const S = this.scale;
    // The pre-run Temple is a full-screen page with its own currencies (director, Nov 19): the HUD draws nothing under it.
    if (this.preRun) return;
    this.drawTopBar(L, S);
    this.drawButtons(L, S);
    this.drawMinimap(L, S);
    this.drawEssence(L, S);
    this.drawRoomControls(L, S);
    if (this.opts.testing && this.ui.paused && !this.snap.runEnded && !this.overlayOpen) this.drawTune(L, S);
    this.drawPortraits(L, S);
    this.drawGearToast(L, S);
  }

  // ------------------------------------------------------------------------------------------ input
  pointerMove(x: number, y: number): void { this.mouse = { x, y }; }

  pointerDown(x: number, y: number): boolean {
    this.mouse = { x, y };
    const sorted = [...this.hits].sort((a, b) => b.prio - a.prio);
    for (const h of sorted) {
      if (h.rect.contains(x, y)) {
        h.action();
        return true;
      }
    }
    // Smite: a click anywhere in the room strikes there.
    if (!this.overlayOpen && this.armed !== undefined && miracleTargetsEnemy(this.armed) && this.layout.roomArea.contains(x, y)) {
      const gp = this.room.groundAt(x, y, 100);
      if (gp) this.castSmite(gp.x, gp.y);
      return true;
    }
    return false;
  }

  key(code: string): void {
    if (this.overlayOpen) return;
    if (code === 'Digit1' || code === 'Numpad1') this.arm(MiracleKind.DivineHealing);
    else if (code === 'Digit2' || code === 'Numpad2') this.arm(MiracleKind.DivineShield);
    else if (code === 'Digit3' || code === 'Numpad3') this.arm(MiracleKind.DivineSmite);
    const dirs: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
    if (code in dirs && this.arrowOk(dirs[code])) this.rm.moveDirection(dirs[code]);
  }

  private hit(rect: Rect, prio: number, action: () => void): void {
    this.hits.push({ rect, action, prio });
  }

  // ------------------------------------------------------------------------------------------ helpers
  private frame(r: Rect, fill: number, fillA: number, hover: boolean, active: boolean): void {
    box(this.g, r, fill, fillA);
    if (hover) box(this.g, r, 0xffffff, 0.1);
    outline(this.g, r, active || hover ? lin(1, 0.82, 0.35) : kGold, Math.max(2, 2 * this.scale));
  }

  private panel(r: Rect, title: string): void {
    const S = this.scale;
    box(this.g, r, kPanelFill);
    const t = Math.max(2, 2 * S);
    outline(this.g, r, kGold, t);
    const inset = 4 * S + t;
    outline(this.g, new Rect(r.x + inset, r.y + inset, r.w - 2 * inset, r.h - 2 * inset), kGoldDim, Math.max(1, S));
    const c = 7 * S;
    this.g.fillStyle(kGold, 1);
    for (const [x, y] of [[r.x, r.y], [r.right() - c, r.y], [r.x, r.bottom() - c], [r.right() - c, r.bottom() - c]]) this.g.fillRect(x, y, c, c);
    this.texts.at(`panel${r.x}|${r.y}`, title, r.x + inset + 8 * S, r.y + inset + 6 * S, kBaseFontPx * 1.4 * S, kGold);
    box(this.g, new Rect(r.x + inset + 6 * S, r.y + inset + 28 * S, r.w - 2 * (inset + 6 * S), Math.max(1, S)), kGoldDim);
  }

  private triangle(cx: number, cy: number, half: number, d: number, color: number, alpha = 1): void {
    const pts = [
      [[cx, cy - half], [cx + half, cy + half], [cx - half, cy + half]],
      [[cx + half, cy], [cx - half, cy + half], [cx - half, cy - half]],
      [[cx, cy + half], [cx - half, cy - half], [cx + half, cy - half]],
      [[cx - half, cy], [cx + half, cy - half], [cx + half, cy + half]],
    ][d];
    this.g.fillStyle(color, alpha).fillTriangle(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
  }

  private diamond(cx: number, cy: number, rx: number, ry: number, color: number, alpha = 1): void {
    this.g.fillStyle(color, alpha).fillPoints([
      new Phaser.Geom.Point(cx, cy - ry), new Phaser.Geom.Point(cx + rx, cy), new Phaser.Geom.Point(cx, cy + ry), new Phaser.Geom.Point(cx - rx, cy),
    ], true);
  }

  private currentRoom(): FloorSnapshot['rooms'][number] | undefined {
    return this.snap.rooms.find((r) => r.id === this.snap.currentRoom || r.current);
  }

  private inCrystalRoom(): boolean { return this.snap.crystalFound && this.snap.crystalRoom >= 0 && this.snap.crystalRoom === this.snap.currentRoom; }

  arrowOk(d: number): boolean {
    const r = this.currentRoom();
    return !!r && this.snap.runActive && !this.snap.fightPending && r.doors[d] && !this.rm.isTransitioning();
  }

  private teleportOk(): boolean {
    return this.snap.runActive && this.snap.canTeleport && this.inCrystalRoom() && !this.snap.fightPending && !this.rm.isTransitioning();
  }

  // ------------------------------------------------------------------------------------------ top bar and buttons
  private drawTopBar(L: Layout, S: number): void {
    const g = this.g;
    box(g, L.topBar, lin(0.04, 0.03, 0.05), 0.95);
    box(g, new Rect(0, L.topBar.bottom() - Math.max(2, 2 * S), L.topBar.w, Math.max(2, 2 * S)), kGold);
    const pad = 0.012 * L.topBar.w;
    const run = this.rm.getFlow().getRun();
    this.texts.at('tb.floor', run.active ? `Floor ${run.floorNumber}` : 'Floor -', pad, L.topBar.y + 0.08 * L.topBar.h, kBaseFontPx * 1.8 * S, kTextLight);
    let roomText = '-';
    const cur = this.currentRoom();
    if (this.snap.runActive && cur) {
      roomText = roomLabel(cur.type, cur.rescue, this.snap.boss);
      if (this.inCrystalRoom()) roomText += ' - crystal';
    }
    this.texts.at('tb.room', roomText, pad, L.topBar.y + 0.6 * L.topBar.h, kBaseFontPx * 1.15 * S, kTextDim);
    const pill = (key: string, right: number, label: string, value: number, icon: number): number => {
      const text = `${label} ${formatCount(value)}`;
      const ph = 0.62 * L.topBar.h;
      const t = this.texts.at(key, text, 0, 0, kBaseFontPx * 1.5 * S, kTextLight, 0, 0.5);
      const pw = t.width + ph + 22 * S;
      const r = new Rect(right - pw, (L.topBar.h - ph) / 2, pw, ph);
      box(g, r, kBarFill, 0.96);
      outline(g, r, kGoldDim, Math.max(1, S));
      const is = ph * 0.46;
      g.fillStyle(icon, 1).fillRect(r.x + 0.5 * ph - 0.5 * is + 4 * S, r.y + (ph - is) / 2, is, is);
      t.setPosition(r.x + ph + 6 * S, r.y + ph / 2);
      return r.x;
    };
    let edge = L.topBar.w - pad;
    edge = pill('tb.ess', edge, 'Essence', this.snap.runActive ? this.snap.essence : run.essence, lin(0.95, 0.75, 0.2)) - 12 * S;
    pill('tb.faith', edge, 'Faith', this.rm.getMeta().gold, lin(0.45, 0.7, 1));
  }

  private drawButtons(L: Layout, S: number): void {
    const g = this.g;
    const btn = lin(0.07, 0.05, 0.07);
    const hov = (r: Rect): boolean => r.contains(this.mouse.x, this.mouse.y);
    this.frame(L.pause, btn, 0.92, hov(L.pause), this.ui.paused);
    if (this.ui.paused) this.texts.centered('b.pause', 'Play', L.pause, kBaseFontPx * 1.1 * S, kTextLight);
    else {
      this.texts.centered('b.pause', '', L.pause, 1, kTextLight);
      const bw = L.pause.w * 0.12, bh = L.pause.h * 0.46, cy = L.pause.y + (L.pause.h - bh) / 2;
      g.fillStyle(kTextLight, 1).fillRect(L.pause.x + L.pause.w / 2 - bw * 1.6, cy, bw, bh).fillRect(L.pause.x + L.pause.w / 2 + bw * 0.6, cy, bw, bh);
    }
    this.frame(L.speed, btn, 0.92, hov(L.speed), false);
    this.texts.centered('b.speed', `${this.ui.speedMultiplier()}x`, L.speed, kBaseFontPx * 1.5 * S, kTextLight);
    const autoOn = this.ui.autoOn;
    this.frame(L.autoBtn, autoOn ? lin(0.08, 0.22, 0.1) : btn, 0.95, hov(L.autoBtn), autoOn);
    const dot = L.autoBtn.h * 0.26;
    g.fillStyle(autoOn ? lin(0.3, 1, 0.4) : lin(0.35, 0.35, 0.35), 1).fillRect(L.autoBtn.x + 0.14 * L.autoBtn.h, L.autoBtn.y + (L.autoBtn.h - dot) / 2, dot, dot);
    this.texts.centered('b.auto', 'Auto', new Rect(L.autoBtn.x + 0.4 * L.autoBtn.h, L.autoBtn.y, L.autoBtn.w - 0.4 * L.autoBtn.h, L.autoBtn.h), kBaseFontPx * 1.5 * S, kTextLight);
    this.hit(L.pause, 1, () => this.ui.togglePause());
    this.hit(L.speed, 1, () => this.ui.cycleSpeed(this.opts.testing ? 4 : 3));
    this.hit(L.autoBtn, 1, () => {
      if (this.snap.runActive) this.rm.setAuto(!this.snap.auto);
      else this.ui.autoOn = !this.ui.autoOn;
    });
    // Miracles and the gauge.
    const sim = this.sim();
    const gv = sim ? sim.getGauge().value() : 0;
    const gc = sim ? sim.getGauge().capacity() : 100;
    const miracle = (r: Rect, name: string, kind: MiracleKind, accent: number): void => {
      const can = this.rm.miracleReady(kind);
      const armed = this.armed === kind;
      this.frame(r, armed ? lin(0.3, 0.26, 0.05) : can ? lin(0.1, 0.09, 0.2) : lin(0.05, 0.04, 0.06), 0.95, can && hov(r), armed);
      this.texts.centered(`b.m${kind}`, `${name} ${sim ? Math.trunc(sim.getGauge().cost(kind)) : 0}`, r, kBaseFontPx * 1.25 * S, can ? accent : lin(0.45, 0.45, 0.45));
      this.hit(r, 1, () => this.arm(kind));
    };
    miracle(L.healBtn, 'Heal', MiracleKind.DivineHealing, lin(0.5, 1, 0.6));
    miracle(L.shieldBtn, 'Shield', MiracleKind.DivineShield, lin(0.55, 0.8, 1));
    miracle(L.smiteBtn, 'Smite', MiracleKind.DivineSmite, lin(1, 0.75, 0.35));
    if (this.armed !== undefined) {
      const foe = miracleTargetsEnemy(this.armed);
      const banner = new Rect(L.roomArea.x, L.roomArea.y, L.roomArea.w, L.roomArea.h * 0.06);
      this.texts.centered('b.banner', `${miracleName(this.armed)}: click ${foe ? 'the ground to strike the area' : 'a hero portrait'} (press the button again to cancel)`,
        banner, kBaseFontPx * 1.4 * S, lin(1, 0.95, 0.5));
    }
    box(g, L.gauge, lin(0.04, 0.03, 0.06), 0.9);
    const f = gc > 0 ? Math.min(1, Math.max(0, gv / gc)) : 0;
    box(g, new Rect(L.gauge.x, L.gauge.y, L.gauge.w * f, L.gauge.h), lin(0.95, 0.85, 0.4), 0.95);
    g.lineStyle(1, lin(0.7, 0.6, 0.3), 0.9).strokeRect(L.gauge.x, L.gauge.y, L.gauge.w, L.gauge.h);
    this.texts.fit('b.gauge', `Miracle ${Math.trunc(gv)} / ${Math.trunc(gc)}`, new Rect(L.gauge.x, L.gauge.bottom() + 1, L.gauge.w, L.gauge.h * 1.4), kBaseFontPx * S, kTextLight);
  }

  private arm(kind: MiracleKind): void {
    if (this.armed === kind) {
      this.armed = undefined;   // pressing the armed miracle again cancels it
      return;
    }
    if (!this.rm.miracleReady(kind)) {
      this.armed = undefined;
      return;
    }
    this.armed = kind;
  }

  private castOnHero(unitId: number): void {
    if (this.armed === undefined) return;
    const kind = this.armed;
    const r = this.rm.castMiracle(kind, unitId);
    if (r.result === MiracleResult.Cast) {
      this.armed = undefined;
      this.units.addEntry(r.on, kind === MiracleKind.DivineHealing ? 'Divine Healing' : 'Divine Shield',
        kind === MiracleKind.DivineShield ? lin(0.55, 0.85, 1) : lin(1, 0.9, 0.4), 1.5);
    }
  }

  private castSmite(x: number, y: number): void {
    const r = this.rm.castSmiteAt(x, y);
    if (r.result === MiracleResult.Cast) {
      this.armed = undefined;
      this.units.smiteFlash = { x, y, age: 0 };
      for (const id of r.hit) this.units.addEntry(id, 'SMITE', lin(1, 0.9, 0.4), 1.5);
    }
  }

  // ------------------------------------------------------------------------------------------ mini-map
  private drawRoomIcon(type: RoomType, rescue: boolean, crystal: boolean, R: Rect, a: number, S: number, key: string): void {
    const g = this.g;
    const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    const H = 0.3 * R.h;
    const th = Math.max(1, 0.12 * R.h);
    if (rescue) {
      this.diamond(cx, cy, 1.25 * H, 1.45 * H, lin(1, 0.88, 0.15), a);
      if (R.h >= 14 * S) this.texts.centered(key + 'i', '!', new Rect(cx - H, cy - H, 2 * H, 2 * H), kBaseFontPx * 0.9 * S, lin(0.15, 0.1, 0), a, true);
    } else {
      switch (type) {
        case RoomType.Combat:
          g.lineStyle(th, lin(0.92, 0.92, 0.97), a).lineBetween(cx - H, cy - H, cx + H, cy + H).lineBetween(cx - H, cy + H, cx + H, cy - H);
          break;
        case RoomType.Elite:
          this.diamond(cx, cy, 1.15 * H, 1.4 * H, lin(0.95, 0.15, 0.15), a);
          g.fillStyle(lin(0.1, 0, 0), a).fillRect(cx - 0.5 * H, cy - 0.25 * H, 0.3 * H, 0.3 * H).fillRect(cx + 0.2 * H, cy - 0.25 * H, 0.3 * H, 0.3 * H);
          break;
        case RoomType.Treasure:
          g.fillStyle(lin(0.95, 0.72, 0.18), a).fillRect(cx - H, cy - 0.6 * H, 2 * H, 1.3 * H);
          g.fillStyle(lin(0.45, 0.25, 0.05), a).fillRect(cx - H, cy - 0.15 * H, 2 * H, 0.28 * H);
          g.fillStyle(lin(1, 0.95, 0.6), a).fillRect(cx - 0.18 * H, cy - 0.2 * H, 0.36 * H, 0.38 * H);
          break;
        case RoomType.Rest:
          g.fillStyle(lin(0.3, 0.92, 0.4), a).fillRect(cx - H, cy - 0.3 * H, 2 * H, 0.6 * H).fillRect(cx - 0.3 * H, cy - H, 0.6 * H, 2 * H);
          break;
        case RoomType.Boss:
          this.diamond(cx, cy, 1.6 * H, 1.5 * H, lin(0.8, 0.1, 0.35), a);
          if (R.h >= 14 * S) this.texts.centered(key + 'i', 'B', new Rect(cx - H, cy - H, 2 * H, 2 * H), kBaseFontPx * 0.9 * S, 0xffffff, a, true);
          break;
        case RoomType.Exit:
          this.triangle(cx, cy, 1.2 * H, 0, lin(0.3, 0.95, 0.5), a);
          break;
      }
    }
    if (crystal) {
      const rr = 0.26 * R.h;
      this.diamond(R.right() - rr * 0.9, R.y + rr * 1.15, rr, rr * 1.2, lin(0.35, 0.7, 1), a);
    }
  }

  private drawMinimap(L: Layout, S: number): void {
    const run = this.snap.runActive;
    this.panel(L.minimap, run ? `Floor ${this.snap.floorNumber}` : 'Floor -');
    const reg = computeMinimapRegions(L.minimap, S);
    if (!run) {
      this.texts.centered('mm.none', 'No run', reg.map, kBaseFontPx * 0.95 * S, lin(0.5, 0.48, 0.46), 0.6);
      return;
    }
    const q = this.snap.boss ? (this.snap.bossKilled ? 'Boss defeated' : 'Defeat the boss')
      : `Kills ${this.snap.kills} / ${this.snap.quota}${this.snap.quotaMet ? '  quota met' : ''}`;
    this.texts.at('mm.quota', q, reg.quota.x, reg.quota.y, kBaseFontPx * 1.2 * S, this.snap.quotaMet ? lin(0.4, 1, 0.5) : kTextLight);
    this.texts.at('mm.crystal', this.snap.crystalFound ? 'Crystal found' : 'Crystal ?', reg.quota.right(), reg.quota.y + S, kBaseFontPx * 1.1 * S,
      this.snap.crystalFound ? lin(0.45, 0.75, 1) : kTextDim, 1, 0);
    const G = new MapGeometry(reg.map, this.snap.cols, this.snap.rows);
    if (!G.valid()) return;
    const hoverId = G.roomAt(this.snap.rooms, this.mouse.x, this.mouse.y);
    for (const r of this.snap.rooms) {
      const col = r.visited ? lin(0.5, 0.52, 0.62) : lin(0.3, 0.3, 0.36);
      for (let d = 0; d < 4; ++d) if (r.doors[d]) box(this.g, G.corridor(r.gx, r.gy, d), col, r.visited ? 1 : 0.8);
    }
    const th = Math.max(1, 1.5 * S);
    for (const r of this.snap.rooms) {
      const Q = G.roomRect(r.gx, r.gy);
      const current = r.id === this.snap.currentRoom || r.current;
      let fill: number, edge: number, fillA = 1, iconA = 1;
      if (current) { fill = lin(0.6, 0.45, 0.1); edge = lin(1, 0.86, 0.3); }
      else if (r.visited && r.cleared) { fill = lin(0.18, 0.34, 0.24); edge = lin(0.45, 0.72, 0.52); }
      else if (r.visited) { fill = lin(0.26, 0.28, 0.4); edge = lin(0.58, 0.6, 0.8); }
      else { fill = lin(0.07, 0.07, 0.09); fillA = 0.9; edge = lin(0.38, 0.38, 0.46); iconA = 0.55; }
      if (current) {
        const gl = 0.09 * G.pitch;
        box(this.g, new Rect(Q.x - gl, Q.y - gl, Q.w + 2 * gl, Q.h + 2 * gl), lin(1, 0.8, 0.25), 0.3);
      }
      box(this.g, Q, fill, fillA);
      outline(this.g, Q, edge, current ? 2 * th : th);
      this.drawRoomIcon(r.type, r.rescue, r.crystalIcon, Q, iconA, S, `mm${r.id}`);
      if (current) {
        const hh = Math.max(3 * S, 0.14 * G.pitch);
        this.triangle(Q.x + Q.w / 2, Q.y - 0.12 * G.pitch - hh / 2, hh, 2, lin(1, 0.95, 0.6));
      } else {
        const can = !this.snap.fightPending && !this.rm.isTransitioning();
        if (r.id === hoverId && can) outline(this.g, Q, 0xffffff, 2 * th, 0.95);
        const id = r.id;
        this.hit(new Rect(Q.x - 0.06 * G.pitch, Q.y - 0.06 * G.pitch, Q.w + 0.12 * G.pitch, Q.h + 0.12 * G.pitch), 1, () => {
          if (!this.snap.fightPending) this.rm.moveToRoom(id);
        });
      }
    }
  }

  // ------------------------------------------------------------------------------------------ arrows and Teleport
  private drawRoomControls(L: Layout, S: number): void {
    if (!this.snap.runActive) return;
    const C = computeRoomControls(L);
    for (let d = 0; d < 4; ++d) {
      const R = arrowRect(C, d);
      const on = this.arrowOk(d);
      const hover = on && R.contains(this.mouse.x, this.mouse.y);
      box(this.g, R, on ? lin(0.09, 0.06, 0.08) : lin(0.05, 0.05, 0.06), on ? 0.93 : 0.6);
      if (hover) box(this.g, R, 0xffffff, 0.14);
      outline(this.g, R, on ? (hover ? lin(1, 0.85, 0.4) : kGold) : lin(0.3, 0.3, 0.32), Math.max(2, 2 * S), on ? 1 : 0.6);
      this.triangle(R.x + R.w / 2, R.y + R.h / 2, 0.27 * R.w, d, on ? lin(1, 0.93, 0.7) : lin(0.35, 0.35, 0.38), on ? 1 : 0.7);
      if (on) this.hit(R, 1, () => { if (this.arrowOk(d)) this.rm.moveDirection(d); });
    }
    const tp = this.teleportOk();
    const T = C.teleport;
    const hover = tp && T.contains(this.mouse.x, this.mouse.y);
    box(this.g, T, tp ? lin(0.08, 0.2, 0.45) : lin(0.06, 0.06, 0.08), tp ? 0.96 : 0.75);
    if (hover) box(this.g, T, 0xffffff, 0.14);
    outline(this.g, T, tp ? lin(0.5, 0.8, 1) : lin(0.3, 0.3, 0.34), Math.max(2, 2 * S), tp ? 1 : 0.7);
    this.diamond(T.x + 0.5 * T.h, T.y + 0.5 * T.h, 0.22 * T.h, 0.3 * T.h, tp ? lin(0.45, 0.78, 1) : lin(0.3, 0.32, 0.38));
    this.texts.centered('rc.tp', 'Teleport up', new Rect(T.x + T.h, T.y, T.w - T.h, T.h), kBaseFontPx * 1.4 * S, tp ? kTextLight : kTextDim);
    if (tp) this.hit(T, 1, () => { if (this.teleportOk()) this.rm.teleportUp(); });
  }

  // ------------------------------------------------------------------------------------------ Essence menu
  private refreshSidebar(dt: number): void {
    this.sideTimer -= dt;
    if (!this.sideDirty && this.sideTimer > 0) return;
    this.sideDirty = false;
    this.sideTimer = 0.25;
    let s = this.rm.getSidebarSnapshot(this.ui.selected);
    if (!s.valid && this.ui.selected !== 0) {
      s = this.rm.getSidebarSnapshot(0);
      if (s.valid) this.ui.selected = 0;
    }
    this.side = s;
    this.previewCost = [];
    this.previewBought = [];
    const amount = amountValue(this.ui.amountMode);
    for (const row of s.rows) {
      let cost = row.nextCost;
      let bought = row.canBuy ? 1 : 0;
      if (row.canBuy && amount !== 1) {
        const p = this.rm.previewBuy(s.characterIndex, row.stat, amount);
        if (p.bought > 0) { cost = p.spent; bought = p.bought; }
      }
      this.previewCost.push(cost);
      this.previewBought.push(bought);
    }
  }

  private drawEssence(L: Layout, S: number): void {
    const side = this.side;
    const ok = !!side && side.valid;
    this.panel(L.essence, ok ? `Essence: ${formatCount(side.essence)}` : 'Essence');
    if (!ok) {
      this.texts.centered('es.none', 'No run', L.essence, kBaseFontPx * 0.95 * S, lin(0.5, 0.48, 0.46), 0.6);
      return;
    }
    const E = computeEssenceLayout(L.essence, side.rows.length, S);
    const line = Math.max(1, S);
    const member = side.party[side.characterIndex];
    const cls = member ? member.className : side.characterName;
    const col = classColor(cls);
    box(this.g, E.portrait, lin(col[0] * 0.28, col[1] * 0.28, col[2] * 0.28));
    this.texts.centered('es.init', cls.slice(0, 1).toUpperCase(), E.portrait, kBaseFontPx * 1.9 * S, lin(col[0], col[1], col[2]), 1, true);
    outline(this.g, E.portrait, lin(1, 0.82, 0.3), Math.max(2, 2 * S));
    this.texts.fit('es.name', displayName(side.characterName), E.nameText, kBaseFontPx * 1.9 * S, kTextLight);
    this.texts.fit('es.class', displayName(cls), E.classText, kBaseFontPx * 1.3 * S, lin(col[0], col[1], col[2]), false, 0.6);
    box(this.g, E.gearSlot, kBarFill, 0.96);
    outline(this.g, E.gearSlot, kGoldDim, line);
    const gearText = (n: string, lv: number, drops: number): string => (drops > 0 ? `${n} ${lv} (+${drops})` : `${n} ${lv}`);
    const half = new Rect(E.gearSlot.x + 6 * S, E.gearSlot.y, E.gearSlot.w - 12 * S, 0.5 * E.gearSlot.h);
    this.texts.fit('es.w', gearText('Weapon', side.weaponLevel, side.weaponDrops), half, kBaseFontPx * 1.05 * S, kTextLight);
    this.texts.fit('es.a', gearText('Armor', side.armorLevel, side.armorDrops), new Rect(half.x, half.y + half.h, half.w, half.h), kBaseFontPx * 1.05 * S, kTextLight);
    for (let i = 0; i < E.rows.length && i < side.rows.length; ++i) {
      const R = E.rows[i];
      const row = side.rows[i];
      box(this.g, R.row, kBarFill, 0.96);
      outline(this.g, R.row, kGoldDim, line);
      if (i === this.flashRow && this.flashAge < 0.45) {
        const a = 0.45 * (1 - this.flashAge / 0.45);
        box(this.g, R.row, this.flashRefused ? lin(1, 0.15, 0.1) : lin(0.3, 1, 0.4), a);
      }
      const max = row.maxRank > 0 && row.rank >= row.maxRank;
      this.texts.fit(`es.n${i}`, statDisplayName(row.stat), R.name, kBaseFontPx * 1.4 * S, kTextLight, false, 0.6);
      this.texts.fit(`es.v${i}`, row.showValue ? formatValueChange(row.valueNow, row.valueNext) : formatBonusChange(row.currentBonus, row.nextBonus, row.unit),
        R.values, kBaseFontPx * 1.2 * S, lin(1, 0.9, 0.55), false, 0.6);
      this.texts.fit(`es.r${i}`, `Rank ${row.rank}/${row.maxRank}`, R.rank, kBaseFontPx * 1.05 * S, lin(0.75, 0.73, 0.7), false, 0.3);
      this.texts.fit(`es.x${i}`, !row.canBuy && !max ? row.reason : '', R.note, kBaseFontPx * 0.95 * S, lin(0.95, 0.5, 0.45), false, 0.6);
      const want = amountValue(this.ui.amountMode);
      const full = want < 0 || (this.previewBought[i] ?? 0) >= want;
      const on = row.canBuy && full;
      const hover = on && R.button.contains(this.mouse.x, this.mouse.y);
      box(this.g, R.button, on ? lin(0.5, 0.36, 0.07) : lin(0.07, 0.065, 0.07), on ? 0.98 : 0.85);
      if (on) box(this.g, new Rect(R.button.x, R.button.y, R.button.w, 0.4 * R.button.h), lin(1, 0.9, 0.5), 0.18);
      if (hover) box(this.g, R.button, 0xffffff, 0.16);
      outline(this.g, R.button, on ? (hover ? lin(1, 0.92, 0.55) : lin(1, 0.82, 0.3)) : lin(0.3, 0.3, 0.32), Math.max(2, 2 * S), on ? 1 : 0.7);
      const cost = on ? this.previewCost[i] ?? row.nextCost : row.nextCost;
      const bought = on ? this.previewBought[i] ?? 0 : 0;
      const label = formatBuyButton(max, cost, bought);
      const ic = max ? 0 : 0.38 * R.button.h;
      const t = this.texts.at(`es.b${i}`, label, 0, 0, kBaseFontPx * 1.45 * S, on ? lin(1, 0.97, 0.88) : kTextDim, 0, 0.5);
      const maxW = R.button.w - 10 * S;
      const gap = max ? 0 : 7 * S;
      const scale = t.width + ic + gap > maxW ? maxW / (t.width + ic + gap) : 1;
      t.setScale(scale);
      const total = t.width * scale + ic + gap;
      const x0 = R.button.x + (R.button.w - total) / 2;
      if (!max) this.diamond(x0 + ic / 2, R.button.y + R.button.h / 2, ic / 2, ic * 0.62, on ? lin(0.55, 0.8, 1) : lin(0.25, 0.3, 0.4));
      t.setPosition(x0 + ic + gap, R.button.y + R.button.h / 2);
      const stat = row.stat;
      if (on) this.hit(R.button, 1, () => this.buy(stat));
    }
    for (let i = 0; i < 4; ++i) {
      const B = E.amount[i];
      const active = i === this.ui.amountMode;
      const hover = B.contains(this.mouse.x, this.mouse.y);
      box(this.g, B, active ? lin(0.32, 0.23, 0.05) : lin(0.07, 0.05, 0.07), active ? 0.97 : 0.92);
      if (hover) box(this.g, B, 0xffffff, 0.12);
      outline(this.g, B, active ? lin(1, 0.85, 0.4) : hover ? kGold : kGoldDim, Math.max(2, 2 * S));
      this.texts.centered(`es.am${i}`, amountLabel(i), B, kBaseFontPx * 1.5 * S, active ? kTextLight : kTextDim);
      this.hit(B, 1, () => { this.ui.amountMode = i; this.sideDirty = true; });
    }
  }

  private buy(stat: string): void {
    const side = this.side;
    if (!side || !side.valid) return;
    const row = side.rows.findIndex((r) => r.stat === stat);
    if (row < 0) return;
    const r = this.rm.buyStat(side.characterIndex, stat, amountValue(this.ui.amountMode));
    this.flashRow = row;
    this.flashAge = 0;
    this.flashRefused = r.bought <= 0;
    this.sideDirty = true;
    this.refreshSidebar(0);
  }

  // ------------------------------------------------------------------------------------------ portraits
  private drawPortraits(L: Layout, S: number): void {
    const sim = this.sim();
    if (!sim) return;
    const party = this.party();
    const hoverSlot = portraitAt(L, this.mouse.x, this.mouse.y);
    for (let i = 0; i < L.slotCount && i < party.length; ++i) {
      const u = party[i];
      const s = L.slots[i];
      const col = classColor(u.name);
      const selected = i === this.ui.selected;
      const dead = !u.alive;
      box(this.g, s.cooldown, lin(0.1, 0.05, 0.15), 0.95);
      const cd = sim.primaryAbilityCooldown(u.id);
      if (u.castKind !== 0 && u.castTotal > 0 && !dead) {
        const f = Math.min(1, Math.max(0, 1 - u.castLeft / u.castTotal));
        box(this.g, new Rect(s.cooldown.x, s.cooldown.y, s.cooldown.w * f, s.cooldown.h), lin(1, 0.8, 0.2));
      } else if (cd.valid && !dead) {
        const f = cooldownFraction(cd.remaining, cd.total);
        box(this.g, new Rect(s.cooldown.x, s.cooldown.y, s.cooldown.w * f, s.cooldown.h), f >= 1 ? lin(0.8, 0.5, 1) : lin(0.58, 0.25, 0.9));
      }
      outline(this.g, s.cooldown, 0x000000, Math.max(1, S), 0.9);
      if (selected) {
        const gl = 5 * S;
        box(this.g, new Rect(s.portrait.x - gl, s.portrait.y - gl, s.portrait.w + 2 * gl, s.portrait.h + 2 * gl), lin(1, 0.8, 0.3), 0.35);
      }
      box(this.g, s.portrait, dead ? lin(0.07, 0.07, 0.07) : lin(col[0] * 0.28, col[1] * 0.28, col[2] * 0.28));
      this.texts.centered(`pt.i${i}`, u.name.slice(0, 1).toUpperCase(), s.portrait, s.portrait.h * 0.62, dead ? lin(0.35, 0.35, 0.35) : lin(col[0], col[1], col[2]), 1, true);
      if (selected) outline(this.g, s.portrait, lin(1, 0.82, 0.3), Math.max(3, 3 * S));
      else outline(this.g, s.portrait, i === hoverSlot ? 0xffffff : lin(col[0] * 0.7, col[1] * 0.7, col[2] * 0.7), Math.max(2, 2 * S), i === hoverSlot ? 0.9 : 1);
      const maxHp = sim.maxHp(u);
      const f = fillFraction(u.hp, maxHp);
      box(this.g, s.hp, lin(0.18, 0.18, 0.18), 0.95);
      if (f > 0) box(this.g, new Rect(s.hp.x, s.hp.y, s.hp.w * f, s.hp.h), lin(0.15, 0.8, 0.2));
      outline(this.g, s.hp, 0x000000, Math.max(1, S), 0.9);
      this.texts.centered(`pt.hp${i}`, `${Math.ceil(Math.max(0, u.hp))} / ${Math.round(maxHp)}`, s.hpText, kBaseFontPx * 1.1 * S, kTextLight);
      const whole = new Rect(s.cooldown.x, s.cooldown.y, s.portrait.w, s.hp.bottom() - s.cooldown.y);
      if (this.armed !== undefined && !miracleTargetsEnemy(this.armed) && !dead) outline(this.g, whole, lin(1, 0.85, 0.3), 3, 0.95);
      else if (u.shieldLeft > 0) outline(this.g, whole, lin(0.45, 0.8, 1), 3, 0.95);
      const id = u.id;
      this.hit(whole, 1, () => {
        if (this.armed !== undefined && !miracleTargetsEnemy(this.armed)) this.castOnHero(id);
        this.ui.select(i, party.length);
        this.sideDirty = true;
      });
    }
  }

  private drawGearToast(L: Layout, S: number): void {
    const text = this.rm.lastGearDropText;
    const age = this.rm.time() - this.rm.lastGearDropTime;
    if (text === '' || this.snap.runEnded || age < 0 || age > 4) return;
    const fade = age > 3 ? 4 - age : 1;
    const w = Math.min(0.8 * L.roomArea.w, 620 * S);
    const h = 42 * S;
    const r = new Rect(L.roomArea.x + 0.5 * (L.roomArea.w - w), L.roomArea.y + 14 * S, w, h);
    box(this.g, r, lin(0.05, 0.04, 0.06), 0.9 * fade);
    outline(this.g, r, kGold, Math.max(1, S), fade);
    this.texts.centered('toast', text, r, kBaseFontPx * 1.3 * S, lin(1, 0.92, 0.6), fade);
  }

  // ------------------------------------------------------------------------------------------ tuning menu (testing builds, paused)
  private tunePush(): void {
    if (!this.tuneTouched) return;
    spriteTuning.hurtSeconds = this.tuneValue[6];
    spriteTuning.hurtCooldown = this.tuneValue[7];
    spriteSizes.enemy = this.tuneValue[8];
    spriteSizes.party = this.tuneValue[9];
    kTune.forEach((d, i) => { if (d.id.startsWith('size:')) spriteSizes.unit[d.id.slice(5)] = this.tuneValue[i]; });
    const sim = this.sim();
    if (!sim) return;
    const c = sim.mutableConfig();
    c.enemyStatMult = this.tuneValue[0];
    c.castTimeScale = this.tuneValue[1];
    c.partyHealMult = this.tuneValue[2];
    const base = defaultMiracle;
    const m = sim.getGauge().mutableConfig();
    m.fillPerHit = this.tuneValue[3];
    m.healingCost = base.healingCost * this.tuneValue[4];
    m.shieldCost = base.shieldCost * this.tuneValue[4];
    m.smiteCost = base.smiteCost * this.tuneValue[4];
    c.miracle.smiteRadius = this.tuneValue[5];
  }

  /** The shipped value of every row. */
  private tuneDefaults(): number[] {
    return kTune.map((d) => {
      switch (d.id) {
        case 'enemyMult': return this.rm.opts.enemyMult;
        case 'gaugeFill': return defaultMiracle.fillPerHit;
        case 'smiteRadius': return defaultMiracle.smiteRadius;
        case 'hurtSeconds': return 0.3;
      }
      return 1;
    });
  }

  /** The rows that differ from the shipped values, by id (what is saved, and what Copy puts on the clipboard). */
  private tuneChanged(): Record<string, number> {
    const def = this.tuneDefaults();
    const out: Record<string, number> = {};
    kTune.forEach((d, i) => { if (Math.abs(this.tuneValue[i] - def[i]) > 1e-9) out[d.id] = this.tuneValue[i]; });
    return out;
  }

  private tuneClick(which: string): void {
    if (!this.tuneInit) {
      // Shipped values, then whatever was saved in earlier test sessions (director, Nov 20).
      this.tuneInit = true;
      this.tuneValue = this.tuneDefaults();
      const saved = loadTuning();
      kTune.forEach((d, i) => {
        const v = saved[d.id];
        if (v !== undefined) this.tuneValue[i] = Math.round(Math.min(d.max, Math.max(d.min, v)) * 100) / 100;
      });
      this.tuneTouched = Object.keys(saved).length > 0;
      this.tunePush();
    }
    const sim = this.sim();
    if (which === 'Fill') sim?.getGauge().add(sim.getGauge().capacity());
    else if (which === 'Heal') sim?.getUnits().forEach((u) => { if (!u.enemy && !u.summon && !u.removed && u.alive) u.hp = sim.maxHp(u); });
    else if (which === 'KillAll' || which === 'HealFoes') {
      const foes = sim ? sim.getUnits().filter((u) => u.enemy && !u.removed && u.alive).map((u) => u.id) : [];
      for (const id of foes) {
        if (which === 'KillAll') sim!.dealDamage(-1, id, 1e9, 1);
        else { const u = sim!.getUnit(id)!; u.hp = sim!.maxHp(u); }
      }
    } else if (which.startsWith('Tab')) this.tuneTab = Number(which.slice(3));
    else if (which === 'Copy') {
      const text = JSON.stringify(this.tuneChanged(), null, 1);
      void navigator.clipboard?.writeText(text).catch(() => undefined);
      console.info(`Tuning values:
${text}`);
      this.copiedLeft = 2;
    }
    else if (which === 'ResetAll') {
      if (this.resetArmedLeft <= 0) { this.resetArmedLeft = 4; return; }
      this.resetArmedLeft = 0;
      if (this.ui.paused) this.ui.togglePause();
      this.armed = undefined;
      this.rm.resetAllProgress();
    } else if (which === 'Reset') {
      this.tuneValue = this.tuneDefaults();
      this.tuneTouched = true;
      this.tunePush();
      this.tuneTouched = false;
      saveTuning({});
    } else {
      const [row, sign] = which.split(':');
      const i = Number(row);
      const d = kTune[i];
      if (d) {
        const next = this.tuneValue[i] + (sign === '+' ? d.step : -d.step);
        this.tuneValue[i] = Math.round(Math.min(d.max, Math.max(d.min, next)) * 100) / 100;
        this.tuneTouched = true;
        this.tunePush();
        saveTuning(this.tuneChanged());
      }
    }
  }

  private drawTune(L: Layout, S: number): void {
    if (!this.tuneInit) this.tuneClick('init');
    const rows = kTune.map((d, i) => ({ d, i })).filter((r) => r.d.tab === this.tuneTab);
    const area = L.roomArea;
    // Long tabs (Sprites) lay their rows out in two columns so the panel still fits a phone held sideways.
    const cols = rows.length > 6 ? 2 : 1;
    const perCol = Math.ceil(rows.length / cols);
    const w = cols > 1 ? area.w * 0.96 : Math.min(area.w * 0.9, Math.max(area.w * 0.6, 420));
    const rowH = Math.max(18, area.h * 0.075);
    const pad = rowH * 0.5;
    const h = pad + rowH * 1.2 + rowH * 1.1 + perCol * rowH * 1.15 + rowH * 1.4 + rowH * 1.4 + rowH + pad;
    const panel = new Rect(area.x + (area.w - w) / 2, area.y + Math.max(0, (area.h - h) / 2), w, Math.min(h, area.h));
    box(this.g, panel, lin(0.03, 0.03, 0.05), 0.93);
    outline(this.g, panel, lin(1, 0.82, 0.35), 2);
    this.hit(panel, 2, () => undefined);   // swallow clicks on the panel
    const title = new Rect(panel.x + pad, panel.y + pad * 0.5, panel.w - 2 * pad, rowH * 1.1);
    this.texts.fit('tu.title', 'Tuning (testing builds only): changes apply live, enemy stats from the next spawn', title, kBaseFontPx * 1.2 * S, lin(1, 0.9, 0.5));
    const nt = kTuneTabs.length;
    const tw = (panel.w - 2 * pad - pad * 0.5 * (nt - 1)) / nt;
    const tabs = kTuneTabs.map((_, k) => new Rect(panel.x + pad + k * (tw + pad * 0.5), title.bottom() + pad * 0.25, tw, rowH * 0.95));
    kTuneTabs.forEach((n, k) => {
      this.frame(tabs[k], k === this.tuneTab ? lin(0.3, 0.26, 0.05) : lin(0.07, 0.05, 0.07), 0.97, tabs[k].contains(this.mouse.x, this.mouse.y), k === this.tuneTab);
      this.texts.centered(`tu.tab${k}`, n, tabs[k], kBaseFontPx * 1.15 * S, kTextLight);
      this.hit(tabs[k], 3, () => this.tuneClick(`Tab${k}`));
    });
    const top = tabs[0].bottom() + pad * 0.5;
    let y = top;
    const btn = rowH * 0.95;
    const colW = (panel.w - 2 * pad - pad * (cols - 1)) / cols;
    rows.forEach(({ d, i }, n) => {
      const col = Math.floor(n / perCol);
      const y = top + (n % perCol) * rowH * 1.15;
      const left = panel.x + pad + col * (colW + pad);
      const right = left + colW;
      const plus = new Rect(right - btn, y, btn, rowH);
      const value = new Rect(plus.x - btn * 2.2, y, btn * 2.2, rowH);
      const minus = new Rect(value.x - btn, y, btn, rowH);
      const label = new Rect(left, y, minus.x - left - pad * 0.5, rowH);
      this.texts.fit(`tu.l${i}`, d.name, label, kBaseFontPx * 1.1 * S, kTextLight);
      this.frame(minus, lin(0.07, 0.05, 0.07), 0.95, minus.contains(this.mouse.x, this.mouse.y), false);
      this.texts.centered(`tu.m${i}`, '-', minus, kBaseFontPx * 1.4 * S, kTextLight);
      this.texts.centered(`tu.v${i}`, i === 5 ? this.tuneValue[i].toFixed(0) : this.tuneValue[i].toFixed(2), value, kBaseFontPx * 1.2 * S, lin(0.6, 1, 0.7));
      this.frame(plus, lin(0.07, 0.05, 0.07), 0.95, plus.contains(this.mouse.x, this.mouse.y), false);
      this.texts.centered(`tu.p${i}`, '+', plus, kBaseFontPx * 1.4 * S, kTextLight);
      this.hit(minus, 3, () => this.tuneClick(`${i}:-`));
      this.hit(plus, 3, () => this.tuneClick(`${i}:+`));
    });
    y = top + perCol * rowH * 1.15 + rowH * 0.2;
    const aw = (panel.w - 2 * pad - pad) / 3;
    const copy = this.copiedLeft > 0 ? 'Copied (also in the console)' : 'Copy changed values';
    const labels = [['Fill miracle gauge', 'Heal party to full', 'Reset tuning'], ['Kill all enemies', 'Heal enemies to full', 'Reset tuning'],
      [copy, 'Kill all enemies', 'Reset tuning']][this.tuneTab];
    const boxes = [['Fill', 'Heal', 'Reset'], ['KillAll', 'HealFoes', 'Reset'], ['Copy', 'KillAll', 'Reset']][this.tuneTab];
    for (let k = 0; k < 3; ++k) {
      const r = new Rect(panel.x + pad + k * (aw + pad * 0.5), y, aw, rowH * 1.1);
      this.frame(r, lin(0.1, 0.09, 0.2), 0.95, r.contains(this.mouse.x, this.mouse.y), false);
      this.texts.centered(`tu.a${k}`, labels[k], r, kBaseFontPx * 1.1 * S, kTextLight);
      const which = boxes[k];
      this.hit(r, 3, () => this.tuneClick(which));
    }
    const reset = new Rect(panel.x + pad, y + rowH * 1.1 + pad * 0.4, panel.w - 2 * pad, rowH * 1.1);
    const armedR = this.resetArmedLeft > 0;
    this.frame(reset, armedR ? lin(0.5, 0.05, 0.05) : lin(0.22, 0.05, 0.05), 0.97, reset.contains(this.mouse.x, this.mouse.y), armedR);
    this.texts.centered('tu.reset', armedR ? 'Click again to ERASE all saved progress and restart' : 'Reset ALL progress (Faith, Gold, unlocks, Temple) - debug',
      reset, kBaseFontPx * 1.1 * S, lin(1, 0.8, 0.8));
    this.hit(reset, 3, () => this.tuneClick('ResetAll'));
    const hint = new Rect(panel.x + pad, reset.bottom() + pad * 0.3, panel.w - 2 * pad, rowH * 0.9);
    this.texts.fit('tu.hint', 'Changes are saved on this device until Reset tuning, which restores the shipped numbers.', hint, kBaseFontPx * S, kTextDim);
  }
}

import { defaultMiracleConfig } from '../core/miracleGauge';
const defaultMiracle = defaultMiracleConfig();

/** The Priest class shows as "Priestess". */
export const displayName = (cls: string): string => (cls === 'Priest' ? 'Priestess' : cls);
