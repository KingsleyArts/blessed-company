// The combat HUD (UI/TolHud.cpp) drawn on the canvas: top bar (floor, room, Faith and Essence), pause / speed / Auto, the three miracle
// buttons and the Miracle Gauge, the mini-map with fog, the arrow pad and Teleport, the Essence menu, the portrait strip, the gear toast
// and (paused, testing builds) the tuning menu. Every rectangle comes from hudLayout.ts; clicks hit-test the same rectangles.
import Phaser from 'phaser';
import { CastKind, defaultCombatConfig, type CombatSim, type Unit } from '../core/combatSim';
import { RoomType } from '../core/floorGenerator';
import { MiracleKind, MiracleResult, miracleName, miracleTargetsEnemy } from '../core/miracleGauge';
import type { FloorSnapshot, RunManager, SidebarSnapshot } from '../core/runManager';
import { amountLabel, amountValue, formatBonusChange, formatBuyButton, formatCount, formatValueChange, roomLabel, statDisplayName } from '../core/uiText';
import {
  type EssenceLayout, MapGeometry, kVisibleEssenceRows, Rect, UiState, arrowRect, computeEssenceLayout, computeLayout, computeMinimapRegions, computeRoomControls, cooldownFraction,
  fillFraction, portraitAt, type Layout,
} from '../ui/hudLayout';
import { TextPool, box, classColor, fitScale, kBaseFontPx, kTextDim, kTextLight, lin, outline } from './draw';
import { HudGraphics, type IconName, blueGem, goldGem, icon, kHud, ornatePanel, plate, poly, statIcon, stud, wing } from './hudStyle';
import { themeById } from '../ui/roomTheme';
import { kThemeId, roomHaze, type RoomView } from './roomView';
import { heroLabel } from '../core/heroSheet';
import { GearSlot, gearKey } from '../core/temple';
import { readability } from './combatText';
import { heroFaceKey, spriteSizes } from './heroMotion';
import { loadTuning, saveTuning } from './localStore';
import { spriteTuning, type UnitView } from './unitView';

export interface HudOptions { testing: boolean }

/** A tuning row. `id` is what the saved values are keyed by, so keep ids stable; `tab`: 0 party and miracles, 1 enemies, 2 sprites and
 *  room, 3 readability. */
interface TuneDef { id: string; name: string; step: number; min: number; max: number; tab: number }
/** [class, basic attack name] for every hero (heroSheet kHeroOrder); the unit names the sim keys its multipliers by. */
const kTuneHeroes: [string, string][] = [['Warrior', 'Sword Strike'], ['Mage', 'Arcane Shot'], ['Assassin', 'Twin Blades'], ['Priest', 'Searing Light'],
  ['Barbarian', 'Axe Swing'], ['Summoner', 'Spirit Bolt']];
const kCastBound = ['Mage', 'Priest', 'Summoner'];
/** [AbilityData id, shown name] for every hero ability. Power scales its damage, heal or buff strength (Greater Spirit: its healing). */
const kTuneAbilities: [string, string][] = [['SpiritHeal', 'Spirit healing (standard spirit)'], ['Taunt', 'Taunt'], ['Cleave', 'Cleave'], ['Fireball', 'Fireball'], ['Execute', 'Execute'],
  ['GroupHeal', 'Prayer of Mending'], ['Rage', 'Rage'], ['Bloodrush', 'Bloodrush'], ['GreaterSpirit', 'Greater Spirit']];
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
  ...['Warrior', 'Mage', 'Assassin', 'Priest', 'Barbarian', 'Summoner', 'Grunt', 'Archer', 'Brute', 'Shaman'].map((n) => ({
    id: `size:${n}`, name: `${n === 'Priest' ? 'Priestess' : n} size x`, step: 0.05, min: 0.3, max: 3, tab: 2,
  })),
  { id: 'hazeDepth', name: 'Room haze depth (share of view)', step: 0.02, min: 0, max: 0.5, tab: 2 },
  { id: 'hazeAlpha', name: 'Room haze darkness at edge', step: 0.05, min: 0, max: 1, tab: 2 },
  // Readability switches (director, Nov 20: pile-ups): 1 on, 0 off; shown as On / Off.
  { id: 'show:merge', name: 'Merge combat numbers (one total per unit, heals to the side)', step: 1, min: 0, max: 1, tab: 3 },
  { id: 'show:bars', name: 'Fewer health bars (enemies just hit, heroes when low; thinner)', step: 1, min: 0, max: 1, tab: 3 },
  { id: 'show:rings', name: 'Rings under feet (gold party, red enemies)', step: 1, min: 0, max: 1, tab: 3 },
  // Appended last: tunePush reads the first rows by position. Searing Light heals while the most hurt ally is below this share of max HP.
  { id: 'smiteThreshold', name: 'Searing Light heals below (ally HP share; above it, it smites)', step: 0.05, min: 0, max: 1, tab: 0 },
  // Enemy growth per floor, health and damage apart (director Nov 22): each floor multiplies by this (shipped 1.25 for both).
  { id: 'floorHealth', name: 'Enemy health growth per floor (x each floor)', step: 0.01, min: 1, max: 1.6, tab: 1 },
  { id: 'floorDamage', name: 'Enemy damage growth per floor (x each floor)', step: 0.01, min: 1, max: 1.6, tab: 1 },
  // Heroes' basic attack / heal (tab 4) and abilities (tab 5). Adding a hero or an ability: add it to these two lists so it is tunable.
  ...kTuneHeroes.flatMap(([cls, attack]) => [
    { id: `atkPower:${cls}`, name: `${heroLabel(cls)} ${attack} power x`, step: 0.05, min: 0.1, max: 4, tab: 4 },
    { id: `atkSpeed:${cls}`, name: `${heroLabel(cls)} ${attack} speed x ${kCastBound.includes(cls) ? '(cast speed)' : '(attacks per second)'}`, step: 0.05, min: 0.25, max: 4, tab: 4 },
  ]),
  ...kTuneAbilities.flatMap(([id, name]) => [
    { id: `abPower:${id}`, name: `${name} power x`, step: 0.05, min: 0.1, max: 4, tab: 5 },
    ...(id === 'SpiritHeal' ? [] : [{ id: `abCooldown:${id}`, name: `${name} cooldown x`, step: 0.1, min: 0.1, max: 4, tab: 5 }]), // the standard spirit has no cooldown
  ]),
];
const kTuneTabs = ['Party and miracles', 'Enemies', 'Sprites and room', 'Readability', 'Attacks and speed', 'Abilities'];
const tuneRow = (id: string): number => kTune.findIndex((d) => d.id === id);

/** The icon and colour of each ability's tile (placeholder glyphs from the HUD's icon set until there is art). */
const kAbilityIcons: Record<string, [IconName, number]> = {
  Taunt: ['shield', 0x9fc4ff], Cleave: ['swords', 0xffb070], GroupHeal: ['cross', 0xf1ece4], Execute: ['sword', 0xff7a7a],
  Rage: ['crit', 0xff8040], Fireball: ['sun', 0xffa040], GreaterSpirit: ['heart', 0x9cf0c0],
};

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
  /** Essence menu scroll: the first stat row shown, the layout last drawn (for the wheel and the thumb) and a thumb drag in progress. */
  private essScroll = 0;
  private essFor = -1;
  private essLayout: EssenceLayout | undefined;
  private essPress: { stat: string | undefined; y0: number; scroll0: number; moved: boolean } | undefined;
  private flashAge = 9;
  private flashRefused = false;
  private armed: MiracleKind | undefined;
  private tuneTab = 0;
  /** Frames and badges drawn over the hero face images (depth 510), under the text (600). */
  private gTop: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;
  private faces = new Map<string, Phaser.GameObjects.Image>();
  private facesUsed = new Set<string>();
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
    this.g = scene.add.existing(new HudGraphics(scene)).setDepth(500);
    this.gTop = scene.add.existing(new HudGraphics(scene)).setDepth(520);
    this.scene = scene;
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
    this.gTop.clear();
    this.facesUsed.clear();
    this.hits = [];
    const L = this.layout;
    const S = this.scale;
    // The pre-run Temple is a full-screen page with its own currencies (director, Nov 19): the HUD draws nothing under it.
    if (this.preRun) {
      this.hideUnusedFaces();
      return;
    }
    this.drawTopBar(L, S);
    this.drawButtons(L, S);
    this.drawMinimap(L, S);
    this.drawEssence(L, S);
    this.drawRoomControls(L, S);
    if (this.opts.testing && this.ui.paused && !this.snap.runEnded && !this.overlayOpen) this.drawTune(L, S);
    this.drawPortraits(L, S);
    this.drawGearToast(L, S);
    this.drawGearChoice(L, S);
    this.hideUnusedFaces();
  }

  private hideUnusedFaces(): void {
    for (const [k, im] of this.faces) if (!this.facesUsed.has(k) && im.visible) im.setVisible(false);
  }

  /** Shows a hero's face in `r`; false when the art is not loaded (the caller draws the class initial). */
  private face(slot: string, cls: string, r: Rect, dead: boolean): boolean {
    const key = heroFaceKey(cls);
    if (!this.scene.textures.exists(key)) return false;
    let im = this.faces.get(slot);
    if (!im) {
      im = this.scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(510);
      this.faces.set(slot, im);
    }
    if (im.texture.key !== key) im.setTexture(key);
    im.setPosition(r.x, r.y).setDisplaySize(r.w, r.h).setVisible(true);
    if (dead) im.setTint(0x55505c); else im.clearTint();
    this.facesUsed.add(slot);
    return true;
  }

  // ------------------------------------------------------------------------------------------ input
  pointerMove(x: number, y: number): void {
    this.mouse = { x, y };
    const p = this.essPress, E = this.essLayout;
    if (!p || !E) return;
    // A swipe on the Essence menu (finger or mouse) scrolls its rows with the finger; a press that never moved is a tap.
    if (!p.moved && Math.abs(y - p.y0) > 8 * this.scale) p.moved = true;
    if (p.moved) this.essScroll = Math.max(0, Math.min(E.maxFirst, p.scroll0 - (y - p.y0) / Math.max(1, E.slotH)));
  }
  pointerUp(): void {
    const p = this.essPress;
    this.essPress = undefined;
    if (p && !p.moved && p.stat !== undefined) this.buy(p.stat);   // buying waits for the release so a swipe over a button does not buy
  }
  /** The mouse wheel over the Essence menu scrolls its stat rows; true when it was used. */
  wheel(x: number, y: number, deltaY: number): boolean {
    const E = this.essLayout;
    if (!E || E.maxFirst <= 0 || !E.panel.contains(x, y) || deltaY === 0) return false;
    this.essScroll = Math.max(0, Math.min(E.maxFirst, E.first + (deltaY > 0 ? 1 : -1)));
    return true;
  }
  /** An arrow on the Essence menu: scrolls most of a page (as the Temple's arrows do). */
  private essenceArrow(dir: number): void {
    const E = this.essLayout;
    if (!E) return;
    this.essScroll = Math.max(0, Math.min(E.maxFirst, E.first + dir * (kVisibleEssenceRows - 1)));
  }

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
  private frame(r: Rect, fill: number, _fillA: number, hover: boolean, active: boolean): void {
    plate(this.g, r, this.scale, fill, { edge: active || hover ? kHud.goldLit : kHud.bronze, inner: active ? kHud.goldLit : kHud.gold });
    if (hover) this.g.fillStyle(0xffffff, 0.08).fillRoundedRect(r.x, r.y, r.w, r.h, Math.min(6 * this.scale, r.h / 2));
  }

  /** An ornate panel with a title banner over its first 28 px (the space the panel layouts already leave for a title). */
  private panel(r: Rect, title: string): void {
    const S = this.scale;
    ornatePanel(this.g, r, S);
    const t = Math.max(2, 2 * S);
    const inset = 4 * S + t;
    const x0 = r.x + inset + 1, x1 = r.right() - inset - 1, y0 = r.y + inset + 1, y1 = r.y + inset + 27 * S, n = 7 * S;
    poly(this.g, [[x0, y0], [x1, y0], [x1, y1 - n], [x1 - n, y1], [x0 + n, y1], [x0, y1 - n]], kHud.banner);
    poly(this.g, [[x0, y0], [x1, y0], [x1, y0 + (y1 - y0) * 0.45], [x0, y0 + (y1 - y0) * 0.45]], 0xffffff, 0.06);
    this.g.lineStyle(Math.max(1, S), kHud.gold, 0.9).lineBetween(x0 + n, y1, x1 - n, y1);
    this.texts.fit(`panel${r.x}|${r.y}`, title, new Rect(r.x + inset + 12 * S, y0, r.w - 2 * inset - 24 * S, y1 - y0), kBaseFontPx * 1.4 * S, kHud.gold);
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
    const B = L.topBar;
    box(g, B, kHud.bar, 0.98);
    box(g, new Rect(0, 0, B.w, B.h * 0.45), kHud.plum, 0.35);
    const rule = Math.max(2, 2 * S);
    box(g, new Rect(0, B.bottom() - rule, B.w, rule), kHud.gold);
    box(g, new Rect(0, B.bottom() + 1, B.w, Math.max(1, S)), kHud.bronze, 0.8);
    const pad = 0.012 * B.w;
    const run = this.rm.getFlow().getRun();
    // The pennant with the wings.
    const pw = B.h * 1.02, px = pad, ph = B.h * 0.96;
    poly(g, [[px, 0], [px + pw, 0], [px + pw, ph * 0.76], [px + pw / 2, ph], [px, ph * 0.76]], kHud.bronze);
    const e = Math.max(1.5, 2 * S);
    poly(g, [[px + e, 0], [px + pw - e, 0], [px + pw - e, ph * 0.74], [px + pw / 2, ph - e * 1.3], [px + e, ph * 0.74]], kHud.banner);
    const mx = px + pw / 2, my = ph * 0.42;
    wing(g, mx - pw * 0.08, my, pw * 0.27, -1);
    wing(g, mx + pw * 0.08, my, pw * 0.27, 1);
    goldGem(g, mx, my, pw * 0.11, pw * 0.17);
    // Expedition, the place and the room.
    const tx = px + pw + 10 * S;
    let roomText = '-';
    const cur = this.currentRoom();
    if (this.snap.runActive && cur) {
      roomText = roomLabel(cur.type, cur.rescue, this.snap.boss);
      if (this.inCrystalRoom()) roomText += ' - crystal';
    }
    const tw = 0.37 * B.w - tx;
    this.texts.fit('tb.floor', 'Expedition', new Rect(tx, B.y + 0.03 * B.h, tw, 0.5 * B.h), Math.min(kBaseFontPx * 1.65 * S, 0.46 * B.h), kTextLight);
    this.texts.fit('tb.room', `${themeById(kThemeId).name} - ${roomText}`, new Rect(tx, B.y + 0.52 * B.h, tw, 0.42 * B.h), Math.min(kBaseFontPx * 1.05 * S, 0.38 * B.h), lin(0.78, 0.72, 0.62));
    // The floor plaque in the middle.
    const fw = 0.17 * B.w, fh = B.h * 0.76, fx = B.w * 0.5 - fw / 2, fy = (B.h - fh) / 2 - rule * 0.3, n = fh * 0.34;
    const hexPts = (i: number): number[][] => [[fx + n + i, fy + i], [fx + fw - n - i, fy + i], [fx + fw - i, fy + fh / 2], [fx + fw - n - i, fy + fh - i], [fx + n + i, fy + fh - i], [fx + i, fy + fh / 2]];
    for (const dir of [-1, 1]) {
      const a = dir < 0 ? fx - 5 * S : fx + fw + 5 * S;
      const b = a + dir * 0.055 * B.w;
      g.lineStyle(Math.max(1, S), kHud.gold, 0.8).lineBetween(a, fy + fh / 2, b, fy + fh / 2);
      stud(g, a, fy + fh / 2, 4 * S);
    }
    poly(g, hexPts(0), kHud.gold);
    poly(g, hexPts(Math.max(1.5, 2 * S)), kHud.banner);
    this.texts.centered('tb.plaque', run.active ? `Floor ${run.floorNumber}` : 'Floor -', new Rect(fx + n, fy, fw - 2 * n, fh), kBaseFontPx * 1.6 * S, kTextLight);
    const pill = (key: string, right: number, label: string, value: number, blue: boolean): number => {
      const text = `${label}  ${formatCount(value)}`;
      const h = 0.68 * B.h;
      const t = this.texts.at(key, text, 0, 0, Math.min(kBaseFontPx * 1.4 * S, 0.74 * h), kTextLight, 0, 0.5);
      const w = t.width + h + 20 * S;
      const q = new Rect(right - w, (B.h - h) / 2 - rule * 0.3, w, h);
      plate(g, q, S, kHud.well, { edge: kHud.gold, radius: h / 2, sheen: 0.05 });
      const gx = q.x + h * 0.56, gy = q.y + h / 2;
      if (blue) blueGem(g, gx, gy, h * 0.27, h * 0.38); else goldGem(g, gx, gy, h * 0.27, h * 0.38);
      t.setPosition(q.x + h + 4 * S, gy);
      return q.x;
    };
    let edge = B.w - pad;
    edge = pill('tb.ess', edge, 'Essence', this.snap.runActive ? this.snap.essence : run.essence, false) - 10 * S;
    pill('tb.faith', edge, 'Faith', this.rm.getMeta().gold, true);
  }

  private drawButtons(L: Layout, S: number): void {
    const g = this.g;
    const btn = kHud.plum;
    const hov = (r: Rect): boolean => r.contains(this.mouse.x, this.mouse.y);
    this.frame(L.pause, btn, 1, hov(L.pause), this.ui.paused);
    const pcx = L.pause.x + L.pause.w / 2, pcy = L.pause.y + L.pause.h / 2;
    if (this.ui.paused) this.triangle(pcx, pcy, L.pause.h * 0.22, 1, kTextLight);
    else {
      const bw = L.pause.w * 0.13, bh = L.pause.h * 0.46;
      g.fillStyle(kTextLight, 1).fillRect(pcx - bw * 1.45, pcy - bh / 2, bw, bh).fillRect(pcx + bw * 0.45, pcy - bh / 2, bw, bh);
    }
    this.frame(L.speed, btn, 1, hov(L.speed), false);
    this.texts.centered('b.speed', `${this.ui.speedMultiplier()}x`, new Rect(L.speed.x, L.speed.y, L.speed.w * 0.72, L.speed.h), kBaseFontPx * 1.4 * S, kTextLight);
    this.triangle(L.speed.x + L.speed.w * 0.79, L.speed.y + L.speed.h / 2, L.speed.h * 0.11, 2, kTextLight);
    const autoOn = this.ui.autoOn;
    this.frame(L.autoBtn, autoOn ? 0x2d5a35 : 0x4a3d45, 1, hov(L.autoBtn), autoOn);
    const dot = L.autoBtn.h * 0.11;
    g.fillStyle(autoOn ? lin(0.3, 1, 0.4) : kHud.muted, 1).fillCircle(L.autoBtn.x + 0.3 * L.autoBtn.h, L.autoBtn.y + L.autoBtn.h / 2, dot);
    this.texts.centered('b.auto', 'Auto', new Rect(L.autoBtn.x + 0.42 * L.autoBtn.h, L.autoBtn.y, L.autoBtn.w - 0.5 * L.autoBtn.h, L.autoBtn.h), kBaseFontPx * 1.35 * S, kTextLight);
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
    const miracle = (r: Rect, name: string, kind: MiracleKind, ic: 'cross' | 'shield' | 'sun', accent: number): void => {
      const can = this.rm.miracleReady(kind);
      const armed = this.armed === kind;
      this.frame(r, armed ? 0x6a4f16 : can ? kHud.plumLit : kHud.well, 1, can && hov(r), armed);
      const s = r.h * 0.27;
      icon(g, ic, r.x + r.h * 0.42, r.y + r.h / 2, s, can || armed ? accent : kHud.muted);
      this.texts.centered(`b.m${kind}`, `${name} ${sim ? Math.trunc(sim.getGauge().cost(kind)) : 0}`, new Rect(r.x + r.h * 0.74, r.y, r.w - r.h * 0.82, r.h),
        kBaseFontPx * 1.15 * S, can || armed ? kTextLight : lin(0.42, 0.4, 0.44));
      this.hit(r, 1, () => this.arm(kind));
    };
    miracle(L.healBtn, 'Heal', MiracleKind.DivineHealing, 'cross', 0x6df27f);
    miracle(L.shieldBtn, 'Shield', MiracleKind.DivineShield, 'shield', 0x69b8ff);
    miracle(L.smiteBtn, 'Smite', MiracleKind.DivineSmite, 'sun', 0xffb13d);
    if (this.armed !== undefined) {
      const foe = miracleTargetsEnemy(this.armed);
      const banner = new Rect(L.roomArea.x, L.roomArea.y, L.roomArea.w, L.roomArea.h * 0.06);
      this.texts.centered('b.banner', `${miracleName(this.armed)}: click ${foe ? 'the ground to strike the area' : 'a hero portrait'} (press the button again to cancel)`,
        banner, kBaseFontPx * 1.4 * S, lin(1, 0.95, 0.5));
    }
    // The wings sit inside the gauge's rectangle, so it takes no more room than before.
    const wingS = L.gauge.h * 0.8;
    const wingLen = wingS * 1.25;
    const G = new Rect(L.gauge.x + wingLen, L.gauge.y, L.gauge.w - 2 * wingLen, L.gauge.h);
    wing(g, G.x + 1, G.y + G.h / 2, wingS, -1);
    wing(g, G.right() - 1, G.y + G.h / 2, wingS, 1);
    plate(g, G, S, kHud.ink, { edge: kHud.gold, radius: G.h / 2, sheen: 0 });
    const f = gc > 0 ? Math.min(1, Math.max(0, gv / gc)) : 0;
    const inset = Math.max(2, 2.5 * S);
    const iw = G.w - 2 * inset, ih = G.h - 2 * inset;
    if (f > 0) {
      const fw = Math.max(ih, iw * f);
      g.fillStyle(0xf1dc8c, 1).fillRoundedRect(G.x + inset, G.y + inset, fw, ih, ih / 2);
      g.fillStyle(0xffffff, 0.3).fillRoundedRect(G.x + inset, G.y + inset, fw, ih * 0.42, ih * 0.2);
    }
    this.texts.centered('b.gauge', `Miracle ${Math.trunc(gv)} / ${Math.trunc(gc)}`, new Rect(L.gauge.x, G.bottom() + 1, L.gauge.w, G.h * 1.4), kBaseFontPx * S, kTextLight);
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
      this.units.addLabel(r.on, kind === MiracleKind.DivineHealing ? 'Divine Healing' : 'Divine Shield',
        kind === MiracleKind.DivineShield ? lin(0.55, 0.85, 1) : lin(1, 0.9, 0.4), 1.5);
    }
  }

  private castSmite(x: number, y: number): void {
    const r = this.rm.castSmiteAt(x, y);
    if (r.result === MiracleResult.Cast) {
      this.armed = undefined;
      this.units.smiteFlash = { x, y, age: 0 };
      for (const id of r.hit) this.units.addLabel(id, 'SMITE', lin(1, 0.9, 0.4), 1.5);
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
    this.panel(L.minimap, 'Dungeon Map');
    const reg = computeMinimapRegions(L.minimap, S);
    if (!run) {
      this.texts.centered('mm.none', 'No run', reg.map, kBaseFontPx * 0.95 * S, lin(0.5, 0.48, 0.46), 0.6);
      return;
    }
    const q = this.snap.boss ? (this.snap.bossKilled ? 'Boss defeated' : 'Defeat the boss')
      : `Kills ${this.snap.kills} / ${this.snap.quota}${this.snap.quotaMet ? '  quota met' : ''}`;
    const qh = reg.quota.h;
    icon(this.g, 'swords', reg.quota.x + qh * 0.5, reg.quota.y + qh * 0.52, qh * 0.44);
    // Kills on the left, the crystal on the right; each keeps to its own share of the line.
    const split = reg.quota.x + reg.quota.w * 0.6;
    this.texts.fit('mm.quota', q, new Rect(reg.quota.x + qh * 1.1, reg.quota.y, split - reg.quota.x - qh * 1.1 - 4 * S, qh), kBaseFontPx * 1.2 * S, this.snap.quotaMet ? lin(0.4, 1, 0.5) : kTextLight);
    const crystalBox = new Rect(split + qh * 0.9, reg.quota.y, reg.quota.right() - split - qh * 0.9, qh);
    const crystalText = this.texts.at('mm.crystal', this.snap.crystalFound ? 'Crystal found' : 'Crystal ?', crystalBox.right(), crystalBox.y + qh / 2, kBaseFontPx * 1.1 * S, this.snap.crystalFound ? lin(0.45, 0.75, 1) : kTextLight, 1, 0.5);
    crystalText.setScale(fitScale(crystalText, crystalBox.w, qh));
    blueGem(this.g, crystalBox.right() - crystalText.displayWidth - qh * 0.45, reg.quota.y + qh * 0.5, qh * 0.3, qh * 0.44);
    plate(this.g, reg.map, S, kHud.well, { edge: kHud.steel, radius: 5 * S, sheen: 0 });
    const G = new MapGeometry(reg.map, this.snap.cols, this.snap.rows);
    if (!G.valid()) return;
    const hoverId = G.roomAt(this.snap.rooms, this.mouse.x, this.mouse.y);
    for (const r of this.snap.rooms) {
      const col = r.visited ? kHud.gold : kHud.muted;
      for (let d = 0; d < 4; ++d) if (r.doors[d]) box(this.g, G.corridor(r.gx, r.gy, d), col, r.visited ? 1 : 0.8);
    }
    const th = Math.max(1, 1.5 * S);
    for (const r of this.snap.rooms) {
      const Q = G.roomRect(r.gx, r.gy);
      const current = r.id === this.snap.currentRoom || r.current;
      let fill: number, edge: number, fillA = 1, iconA = 1;
      if (current) { fill = 0xc99a3c; edge = kHud.goldLit; }
      else if (r.visited && r.cleared) { fill = lin(0.18, 0.34, 0.24); edge = lin(0.45, 0.72, 0.52); }
      else if (r.visited) { fill = kHud.plumLit; edge = kHud.gold; }
      else { fill = kHud.ink; fillA = 0.9; edge = kHud.muted; iconA = 0.6; }
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
      plate(this.g, R, S, on ? kHud.plumLit : kHud.well, { edge: on ? (hover ? kHud.goldLit : kHud.gold) : kHud.steel, inner: on ? kHud.gold : undefined, sheen: on ? 0.1 : 0.02 });
      this.triangle(R.x + R.w / 2, R.y + R.h / 2, 0.25 * R.w, d, on ? 0xfff8ea : kHud.muted, on ? 1 : 0.7);
      if (on) this.hit(R, 1, () => { if (this.arrowOk(d)) this.rm.moveDirection(d); });
    }
    const tp = this.teleportOk();
    const T = C.teleport;
    const hover = tp && T.contains(this.mouse.x, this.mouse.y);
    plate(this.g, T, S, tp ? kHud.banner : kHud.well, { edge: tp ? (hover ? kHud.goldLit : kHud.gold) : kHud.steel, inner: tp ? kHud.gold : undefined, radius: T.h * 0.3, sheen: tp ? 0.1 : 0.03 });
    const gx = T.x + 0.58 * T.h, gy = T.y + 0.5 * T.h;
    if (tp) this.g.fillStyle(0x9d6bff, 0.3).fillCircle(gx, gy, 0.42 * T.h);
    if (tp) blueGem(this.g, gx, gy, 0.23 * T.h, 0.33 * T.h);
    else poly(this.g, [[gx, gy - 0.33 * T.h], [gx + 0.23 * T.h, gy], [gx, gy + 0.33 * T.h], [gx - 0.23 * T.h, gy]], kHud.steel);
    this.texts.centered('rc.tp', 'Ascend', new Rect(T.x + T.h, T.y, T.w - 1.2 * T.h, T.h), kBaseFontPx * 1.4 * S, tp ? kTextLight : kTextDim);
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
      if (amount > 1 && bought < amount && (row.maxRank <= 0 || row.rank < row.maxRank)) {   // can't afford the full selection: still show its full price
        const p = this.rm.previewBuy(s.characterIndex, row.stat, amount, 1e18);
        if (p.bought > 0) cost = p.spent;
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
    if (this.essFor !== side.characterIndex) { this.essFor = side.characterIndex; this.essScroll = 0; }   // each hero starts at the top
    const E = computeEssenceLayout(L.essence, side.rows.length, S, this.essScroll);
    this.essScroll = E.first;
    this.essLayout = E;
    const member = side.party[side.characterIndex];
    const cls = member ? member.className : side.characterName;
    const col = classColor(cls);
    plate(this.g, E.portrait, S, lin(col[0] * 0.28, col[1] * 0.28, col[2] * 0.28), { edge: kHud.gold, radius: 5 * S, sheen: 0 });
    const faceInset = Math.max(2, 2.5 * S);
    if (this.face('essence', cls, new Rect(E.portrait.x + faceInset, E.portrait.y + faceInset, E.portrait.w - 2 * faceInset, E.portrait.h - 2 * faceInset), false)) {
      this.texts.centered('es.init', '', E.portrait, 1, kTextLight);
    } else this.texts.centered('es.init', cls.slice(0, 1).toUpperCase(), E.portrait, kBaseFontPx * 1.9 * S, lin(col[0], col[1], col[2]), 1, true);
    this.texts.fit('es.name', displayName(side.characterName), E.nameText, kBaseFontPx * 1.9 * S, kTextLight);
    this.texts.fit('es.class', displayName(cls), E.classText, kBaseFontPx * 1.3 * S, lin(1, 0.55, 0.3));
    plate(this.g, E.gearSlot, S, kHud.well, { edge: kHud.steel, radius: 4 * S, sheen: 0 });
    const gearText = (n: string, lv: number, drops: number): string => (drops > 0 ? `${n} ${lv} (+${drops})` : `${n} ${lv}`);
    const gh = 0.5 * E.gearSlot.h, gi = Math.min(gh * 0.3, 10 * S), gx = E.gearSlot.x + 5 * S + gi;
    icon(this.g, 'sword', gx, E.gearSlot.y + gh / 2, gi);
    icon(this.g, 'shield', gx, E.gearSlot.y + gh * 1.5, gi);
    const half = new Rect(gx + gi + 4 * S, E.gearSlot.y, E.gearSlot.right() - (gx + gi + 8 * S), gh);
    this.texts.fit('es.w', gearText('Weapon', side.weaponLevel, side.weaponDrops), half, kBaseFontPx * 1.05 * S, kTextLight);
    this.texts.fit('es.a', gearText('Armor', side.armorLevel, side.armorDrops), new Rect(half.x, half.y + half.h, half.w, half.h), kBaseFontPx * 1.05 * S, kTextLight);
    for (let k = 0; k < E.rows.length && E.first + k < side.rows.length; ++k) {
      const i = E.first + k;   // the stat; k is its place on screen (text keys follow the place)
      const R = E.rows[k];
      const row = side.rows[i];
      plate(this.g, R.row, S, kHud.well, { edge: 0x5d4530, radius: 3 * S, sheen: 0.025 });
      if (i === this.flashRow && this.flashAge < 0.45) {
        const a = 0.45 * (1 - this.flashAge / 0.45);
        box(this.g, R.row, this.flashRefused ? lin(1, 0.15, 0.1) : lin(0.3, 1, 0.4), a);
      }
      const max = row.maxRank > 0 && row.rank >= row.maxRank;
      const rs = Math.min(R.row.h * 0.27, 13 * S);
      const ix = R.row.x + 6 * S + rs;
      icon(this.g, statIcon(row.stat), ix, R.row.y + R.row.h / 2, rs);
      const tx = ix + rs + 6 * S;
      const value = row.showValue ? formatValueChange(row.valueNow, row.valueNext) : formatBonusChange(row.currentBonus, row.nextBonus, row.unit);
      this.textPair(`es.n${k}`, statDisplayName(row.stat), kBaseFontPx * 1.3 * S, kTextLight, `es.v${k}`, value, kBaseFontPx * 1.2 * S, kHud.goldLit,
        tx, R.button.x - 5 * S, R.name.y, R.name.h, R.values.x + 16 * S);
      this.textPair(`es.r${k}`, `Rank ${row.rank}/${row.maxRank}`, kBaseFontPx * 1.05 * S, lin(0.75, 0.73, 0.7), `es.x${k}`, !row.canBuy && !max ? row.reason : '',
        kBaseFontPx * 0.95 * S, lin(0.95, 0.5, 0.45), tx, R.row.right() - 5 * S, R.rank.y, R.rank.h, tx);
      const want = amountValue(this.ui.amountMode);
      const full = want < 0 || (this.previewBought[i] ?? 0) >= want;
      const on = row.canBuy && full;
      const hover = on && R.button.contains(this.mouse.x, this.mouse.y);
      plate(this.g, R.button, S, on ? 0x7a5a24 : kHud.steel, { edge: on ? (hover ? kHud.goldLit : kHud.gold) : 0x6a6370, radius: 3 * S, sheen: on ? 0.16 : 0.08 });
      const cost = this.previewCost[i] ?? row.nextCost;
      const bought = on && want < 0 ? this.previewBought[i] ?? 0 : 0;   // the count only matters for Max; x1/x10/x100 already say it
      const label = formatBuyButton(max, cost, bought);
      const ic = max ? 0 : 0.38 * R.button.h;
      const t = this.texts.at(`es.b${k}`, label, 0, 0, kBaseFontPx * 1.45 * S, on ? lin(1, 0.97, 0.88) : kTextDim, 0, 0.5);
      const maxW = R.button.w - 10 * S;
      const gap = max ? 0 : 7 * S;
      const scale = Math.min(t.width + ic + gap > maxW ? maxW / (t.width + ic + gap) : 1, fitScale(t, maxW, R.button.h - 4 * S));
      t.setScale(scale);
      const total = t.width * scale + ic + gap;
      const x0 = R.button.x + (R.button.w - total) / 2;
      if (!max) goldGem(this.g, x0 + ic / 2, R.button.y + R.button.h / 2, ic * 0.48, ic * 0.68);
      t.setPosition(x0 + ic + gap, R.button.y + R.button.h / 2);
      const stat = row.stat;
      if (on) this.hit(R.button, 1, () => { this.essPress = { stat, y0: this.mouse.y, scroll0: this.essScroll, moved: false }; });   // buys on release (a swipe is not a tap)
    }
    if (E.maxFirst > 0) {   // more stats than fit: swipe or wheel to scroll; arrows show which way there is more (like the Temple's)
      const aw = 30 * S, ah = 18 * S;   // small, and straddling the menu's edges so they sit mostly in the gaps, clear of the row text
      const pill = (up: boolean, on: boolean): void => {
        const R = new Rect(E.viewport.x + (E.viewport.w - aw) / 2, up ? E.viewport.y - ah * 0.6 : E.viewport.bottom() - ah * 0.4, aw, ah);
        plate(this.gTop, R, S, 0x180b26, { edge: R.contains(this.mouse.x, this.mouse.y) ? kHud.goldLit : kHud.gold, radius: ah / 2, sheen: 0 });
        const cx = R.x + R.w / 2, cy = R.y + R.h / 2, w = ah * 0.34, h = ah * 0.16, d = up ? -1 : 1;
        this.gTop.lineStyle(Math.max(1.5, 2 * S), kHud.goldLit, 1);
        for (const o of [-0.2, 0.2]) {   // a double chevron
          const y = cy + o * ah;
          this.gTop.lineBetween(cx - w, y - d * h, cx, y + d * h).lineBetween(cx, y + d * h, cx + w, y - d * h);
        }
        if (on) this.hit(R, 3, () => this.essenceArrow(up ? -1 : 1));
      };
      if (E.first > 0) pill(true, true);
      if (E.first < E.maxFirst) pill(false, true);
    }
    this.hit(E.viewport, 0, () => { this.essPress = { stat: undefined, y0: this.mouse.y, scroll0: this.essScroll, moved: false }; });
    for (let i = 0; i < 4; ++i) {
      const B = E.amount[i];
      const active = i === this.ui.amountMode;
      const hover = B.contains(this.mouse.x, this.mouse.y);
      plate(this.g, B, S, active ? kHud.goldBtn : kHud.plum, { edge: active || hover ? kHud.goldLit : kHud.bronze, radius: 5 * S, sheen: active ? 0.2 : 0.08 });
      this.texts.centered(`es.am${i}`, amountLabel(i), B, kBaseFontPx * 1.4 * S, active ? 0x2a1a08 : kTextLight);
      this.hit(B, 1, () => { this.ui.amountMode = i; this.sideDirty = true; });
    }
  }

  /** Two texts on one line between x0 and x1: the second starts at `minB` if there is room; if not, both shrink together until they fit. */
  private textPair(keyA: string, a: string, pxA: number, colA: number, keyB: string, b: string, pxB: number, colB: number,
    x0: number, x1: number, y: number, h: number, minB: number): void {
    const gap = 6 * this.scale;
    const ta = this.texts.at(keyA, a, x0, y + h / 2, pxA, colA, 0, 0.5);
    const tb = this.texts.at(keyB, b, x0, y + h / 2, pxB, colB, 0, 0.5);
    const hasB = b !== '';
    const need = ta.width + (hasB ? gap + tb.width : 0);
    const k = Math.min(1, (x1 - x0) / Math.max(1, need), fitScale(ta, x1 - x0, h), hasB ? fitScale(tb, x1 - x0, h) : 1);
    ta.setScale(k);
    tb.setScale(k);
    const bx = x0 + ta.displayWidth + gap;
    tb.setX(Math.max(bx, Math.min(minB, x1 - tb.displayWidth)));
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
      this.drawAbilityTiles(sim, u, s, i, S, dead);
      if (selected) {
        const gl = 4 * S;
        this.g.fillStyle(kHud.goldLit, 0.32).fillRoundedRect(s.portrait.x - gl, s.portrait.y - gl, s.portrait.w + 2 * gl, s.portrait.h + 2 * gl, 8 * S);
      }
      plate(this.g, s.portrait, S, dead ? lin(0.07, 0.07, 0.07) : lin(col[0] * 0.28, col[1] * 0.28, col[2] * 0.28),
        { edge: selected ? kHud.goldLit : i === hoverSlot ? 0xffffff : kHud.gold, radius: 6 * S, sheen: 0 });
      const fi = Math.max(2, 3 * S);
      const hasFace = this.face(`party${i}`, u.name, new Rect(s.portrait.x + fi, s.portrait.y + fi, s.portrait.w - 2 * fi, s.portrait.h - 2 * fi), dead);
      if (hasFace) {
        const bs = s.portrait.w * 0.27;
        const badge = new Rect(s.portrait.x + 2 * S, s.portrait.bottom() - bs - 2 * S, bs, bs);
        plate(this.gTop, badge, S, dead ? lin(0.1, 0.1, 0.1) : lin(col[0] * 0.5, col[1] * 0.5, col[2] * 0.5), { edge: kHud.gold, radius: 3 * S, sheen: 0.1 });
        this.texts.centered(`pt.i${i}`, u.name.slice(0, 1).toUpperCase(), badge, bs * 0.72, 0xffffff, 1, true);
      } else this.texts.centered(`pt.i${i}`, u.name.slice(0, 1).toUpperCase(), s.portrait, s.portrait.h * 0.62, dead ? lin(0.35, 0.35, 0.35) : lin(col[0], col[1], col[2]), 1, true);
      if (selected) this.gTop.lineStyle(Math.max(2, 2.5 * S), kHud.goldLit, 1).strokeRoundedRect(s.portrait.x + 1, s.portrait.y + 1, s.portrait.w - 2, s.portrait.h - 2, 6 * S);
      const maxHp = sim.maxHp(u);
      const f = fillFraction(u.hp, maxHp);
      plate(this.g, s.hp, S, kHud.ink, { edge: kHud.bronze, radius: s.hp.h / 2, sheen: 0 });
      const hi = Math.max(1, 1.5 * S), hw = (s.hp.w - 2 * hi) * f, hh = s.hp.h - 2 * hi;
      if (f > 0) {
        this.g.fillStyle(kHud.hpDark, 1).fillRoundedRect(s.hp.x + hi, s.hp.y + hi, Math.max(hw, hh), hh, hh / 2);
        this.g.fillStyle(kHud.hp, 1).fillRoundedRect(s.hp.x + hi, s.hp.y + hi, Math.max(hw, hh), hh * 0.62, hh * 0.3);
      }
      this.texts.centered(`pt.hp${i}`, `${Math.ceil(Math.max(0, u.hp))} / ${Math.round(maxHp)}`, new Rect(s.hpText.x, s.hp.bottom(), s.hpText.w, s.hpText.bottom() - s.hp.bottom() + 0.55 * s.hpText.h), kBaseFontPx * 1.1 * S, kTextLight);
      const whole = s.whole;
      if (this.armed !== undefined && !miracleTargetsEnemy(this.armed) && !dead) outline(this.gTop, whole, lin(1, 0.85, 0.3), 3, 0.95);
      else if (u.shieldLeft > 0) outline(this.gTop, whole, lin(0.45, 0.8, 1), 3, 0.95);
      const id = u.id;
      this.hit(whole, 1, () => {
        if (this.armed !== undefined && !miracleTargetsEnemy(this.armed)) this.castOnHero(id);
        this.ui.select(i, party.length);
        this.sideDirty = true;
      });
    }
  }

  /** The two ability tiles beside a portrait (director, Nov 21): the primary above, the second below. A tile shows the ability's icon with a
   *  dark sweep and the seconds left while it recharges; a hero with no second ability yet shows a placeholder tile. */
  private drawAbilityTiles(sim: CombatSim, u: Unit, s: Layout['slots'][number], i: number, S: number, dead: boolean): void {
    for (let k = 0; k < 2; ++k) {
      const r = s.abilities[k];
      const id = k === 0 ? u.abilityId : u.extraAbilities[0]?.id ?? '';
      const cd = sim.abilityCooldown(u.id, k);
      const casting = !dead && u.castKind === CastKind.Ability && id !== '' && u.castAbility === id;
      const f = cd.valid ? cooldownFraction(cd.remaining, cd.total) : 1;
      const ready = id !== '' && !dead && f >= 1;
      plate(this.g, r, S, id === '' ? lin(0.05, 0.05, 0.07) : kHud.ink, { edge: casting ? lin(1, 0.8, 0.2) : ready ? kHud.gold : kHud.bronze, radius: 5 * S, sheen: 0 });
      if (id === '') {
        // Placeholder until the hero gets a second ability.
        this.texts.centered(`pt.ab${i}_${k}`, '?', r, r.h * 0.62, lin(0.4, 0.38, 0.45), 1, true);
        continue;
      }
      const [name, color] = kAbilityIcons[id] ?? ['sun', 0xf1ece4];
      icon(this.g, name, r.x + r.w / 2, r.y + r.h / 2, r.h * 0.3, dead ? 0x6a6a72 : color);
      if (!dead && f < 1) {
        const inset = Math.max(1, S);
        this.g.fillStyle(0x000000, 0.6).fillRoundedRect(r.x + inset, r.y + inset, r.w - 2 * inset, (r.h - 2 * inset) * (1 - f), 4 * S);
        this.texts.centered(`pt.ab${i}_${k}`, cd.remaining >= 10 ? `${Math.ceil(cd.remaining)}` : cd.remaining.toFixed(1), r, r.h * 0.46, 0xffffff, 1, true);
      }
      if (casting) this.gTop.lineStyle(Math.max(2, 2 * S), lin(1, 0.8, 0.2), 1).strokeRoundedRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 5 * S);
    }
  }

  /** Found gear waits for the player to pick the hero it goes to (director, Nov 21): a banner over the room with one button per hero. */
  private drawGearChoice(L: Layout, S: number): void {
    const pending = this.rm.getPendingGear();
    const party = this.party();
    if (pending.length === 0 || party.length === 0 || !this.snap.runActive || this.snap.runEnded || this.overlayOpen) return;
    const item = pending[0];
    const weapon = item.slot === GearSlot.Weapon;
    const w = Math.min(0.94 * L.roomArea.w, 640 * S), h = 104 * S;
    const r = new Rect(L.roomArea.x + 0.5 * (L.roomArea.w - w), L.roomArea.y + 62 * S, w, h);
    plate(this.g, r, S, kHud.panel, { edge: kHud.goldLit, sheen: 0.05 });
    this.hit(r, 2, () => undefined);   // clicks on the banner do not reach the room
    const more = pending.length > 1 ? `  (${pending.length - 1} more waiting)` : '';
    this.texts.centered('gc.title', `Found a ${weapon ? 'weapon' : 'armor'} upgrade (${weapon ? 'Damage' : 'Health'} +10%): who gets it?${more}`,
      new Rect(r.x, r.y + 4 * S, r.w, 26 * S), kBaseFontPx * 1.3 * S, lin(1, 0.92, 0.6));
    const pad = 8 * S, bw = (r.w - pad * (party.length + 1)) / party.length, bh = r.h - 36 * S - pad;
    const gear = this.rm.getFlow().getDungeonGear();
    party.forEach((u, i) => {
      const b = new Rect(r.x + pad + i * (bw + pad), r.y + 34 * S, bw, bh);
      const hover = b.contains(this.mouse.x, this.mouse.y);
      this.frame(b, lin(0.1, 0.09, 0.2), 0.95, hover, false);
      const fs = Math.min(b.h - 8 * S, 52 * S);
      const face = new Rect(b.x + 5 * S, b.y + (b.h - fs) / 2, fs, fs);
      if (!this.face(`gc${i}`, u.name, face, !u.alive)) this.texts.centered(`gc.i${i}`, u.name.slice(0, 1), face, fs * 0.6, 0xffffff, 1, true);
      const tx = new Rect(face.right() + 6 * S, b.y, b.right() - face.right() - 10 * S, b.h);
      const level = gear.get(gearKey(u.name, item.slot)) ?? 0;
      this.texts.fit(`gc.n${i}`, heroLabel(u.name), new Rect(tx.x, tx.y + 2 * S, tx.w, tx.h * 0.5), kBaseFontPx * 1.25 * S, kTextLight);
      this.texts.fit(`gc.l${i}`, `${weapon ? 'Weapon' : 'Armor'} +${level} → +${level + 1}`, new Rect(tx.x, tx.y + tx.h * 0.5, tx.w, tx.h * 0.42), kBaseFontPx * 1.05 * S, kTextDim);
      const cls = u.name;
      this.hit(b, 3, () => { this.rm.assignPendingGear(cls); this.sideDirty = true; });
    });
  }

  private drawGearToast(L: Layout, S: number): void {
    const text = this.rm.lastGearDropText;
    const age = this.rm.time() - this.rm.lastGearDropTime;
    if (text === '' || this.snap.runEnded || age < 0 || age > 4) return;
    const fade = age > 3 ? 4 - age : 1;
    const w = Math.min(0.8 * L.roomArea.w, 620 * S);
    const h = 42 * S;
    const r = new Rect(L.roomArea.x + 0.5 * (L.roomArea.w - w), L.roomArea.y + 14 * S, w, h);
    plate(this.gTop, r, S, kHud.panel, { edge: kHud.gold, alpha: fade, sheen: 0.05 });
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
    // This runs every frame, so the room (an expensive repaint) is redrawn only when the haze really changed.
    const hazeDepth = this.tuneValue[tuneRow('hazeDepth')], hazeAlpha = this.tuneValue[tuneRow('hazeAlpha')];
    if (hazeDepth !== roomHaze.depth || hazeAlpha !== roomHaze.alpha) {
      roomHaze.depth = hazeDepth;
      roomHaze.alpha = hazeAlpha;
      this.room.redraw();
    }
    readability.mergeNumbers = this.tuneValue[tuneRow('show:merge')] > 0.5;
    readability.fewerBars = this.tuneValue[tuneRow('show:bars')] > 0.5;
    readability.footRings = this.tuneValue[tuneRow('show:rings')] > 0.5;
    const sim = this.sim();
    if (!sim) return;
    const c = sim.mutableConfig();
    c.enemyStatMult = this.tuneValue[0];
    c.floorHealthScaling = this.tuneValue[tuneRow('floorHealth')];
    c.floorDamageScaling = this.tuneValue[tuneRow('floorDamage')];
    c.castTimeScale = this.tuneValue[1];
    c.partyHealMult = this.tuneValue[2];
    const base = defaultMiracle;
    const m = sim.getGauge().mutableConfig();
    m.fillPerHit = this.tuneValue[3];
    m.healingCost = base.healingCost * this.tuneValue[4];
    m.shieldCost = base.shieldCost * this.tuneValue[4];
    m.smiteCost = base.smiteCost * this.tuneValue[4];
    c.miracle.smiteRadius = this.tuneValue[5];
    const threshold = this.tuneValue[tuneRow('smiteThreshold')];
    for (const u of sim.getUnits()) if (u.healer && !u.enemy && !u.summon) u.smiteThreshold = threshold;
    kTune.forEach((d, i) => {
      const [kind, key] = d.id.split(':');
      const v = this.tuneValue[i];
      if (kind === 'atkPower') c.autoPowerMult.set(key, v);
      else if (kind === 'atkSpeed') c.autoSpeedMult.set(key, v);
      else if (kind === 'abPower') c.abilityPowerMult.set(key, v);
      else if (kind === 'abCooldown') c.abilityCooldownMult.set(key, v);
    });
  }

  /** The shipped value of every row. */
  private tuneDefaults(): number[] {
    return kTune.map((d) => {
      switch (d.id) {
        case 'enemyMult': return this.rm.opts.enemyMult;
        case 'floorHealth':
        case 'floorDamage': return defaultCombatConfig().floorScaling;
        case 'gaugeFill': return defaultMiracle.fillPerHit;
        case 'smiteRadius': return defaultMiracle.smiteRadius;
        case 'smiteThreshold': return 0.85; // CombatConfig smiteThreshold / the Priest's ClassData SmiteThreshold
        case 'hurtSeconds': return 0.3;
        case 'hazeDepth': return kHazeDefault.depth;
        case 'hazeAlpha': return kHazeDefault.alpha;
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
      this.texts.centered(`tu.v${i}`, d.id.startsWith('show:') ? (this.tuneValue[i] > 0.5 ? 'On' : 'Off') : i === 5 ? this.tuneValue[i].toFixed(0) : this.tuneValue[i].toFixed(2), value, kBaseFontPx * 1.2 * S, lin(0.6, 1, 0.7));
      this.frame(plus, lin(0.07, 0.05, 0.07), 0.95, plus.contains(this.mouse.x, this.mouse.y), false);
      this.texts.centered(`tu.p${i}`, '+', plus, kBaseFontPx * 1.4 * S, kTextLight);
      this.hit(minus, 3, () => this.tuneClick(`${i}:-`));
      this.hit(plus, 3, () => this.tuneClick(`${i}:+`));
    });
    y = top + perCol * rowH * 1.15 + rowH * 0.2;
    const aw = (panel.w - 2 * pad - pad) / 3;
    const copy = this.copiedLeft > 0 ? 'Copied (also in the console)' : 'Copy changed values';
    const labels = [['Fill miracle gauge', 'Heal party to full', 'Reset tuning'], ['Kill all enemies', 'Heal enemies to full', 'Reset tuning'],
      [copy, 'Kill all enemies', 'Reset tuning'], [copy, 'Kill all enemies', 'Reset tuning'], [copy, 'Kill all enemies', 'Reset tuning'],
      [copy, 'Kill all enemies', 'Reset tuning']][this.tuneTab];
    const boxes = [['Fill', 'Heal', 'Reset'], ['KillAll', 'HealFoes', 'Reset'], ['Copy', 'KillAll', 'Reset'], ['Copy', 'KillAll', 'Reset'], ['Copy', 'KillAll', 'Reset'],
      ['Copy', 'KillAll', 'Reset']][this.tuneTab];
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
/** The shipped room haze (the tuning menu changes roomHaze live). */
const kHazeDefault = { ...roomHaze };

/** The Priest class shows as "Priestess". */
export const displayName = (cls: string): string => (cls === 'Priest' ? 'Priestess' : cls);
