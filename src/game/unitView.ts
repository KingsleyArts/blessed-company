// The units in the room (ATolUnit + ACombatManager::SyncActors): party members are spheres in their class colour, enemies and summons are
// cubes, the Goblin Grunt is an animated sprite (idle / walk / attack / hurt / dead, facing its target; a corpse keeps its side). A body
// shrinks a little with its HP, a dead one is a flat marker. Bars, cast bars, shield frames and floating numbers are drawn over them.
import Phaser from 'phaser';
import { CastKind, FightState, type CombatSim, type Unit } from '../core/combatSim';
import type { RunManager } from '../core/runManager';
import { StatId } from '../core/statResolver';
import { formatAmount } from '../core/uiText';
import { fillFraction, floatAnimAt, jitter } from '../ui/hudLayout';
import { barVisible, kHealOffsetPx, kHealSize, pushFloat, readability, type FloatEntry, type FloatKind } from './combatText';
import { TextPool, classColor, lin } from './draw';
import { enemyTextureKey, heroKoTextureKey, heroPose, heroTextureKey, kEnemySpriteNames, kHeroKoClasses, spiritTextureKey, kHeroMotion, kSpriteFacesLeft, newHeroFx, spriteSizes, unitSpriteSize, type HeroFx } from './heroMotion';
import type { RoomView } from './roomView';

const kBodyXY = 1.7;
const kBodyZ = 2.2;
const kRoundZ = 1.9;
const kWalkHoldSeconds = 0.15;
/** Testing-only tuning values (the pause menu in Unreal): hurt frame time, hurt cooldown, sprite size (uu per frame pixel). */
export const spriteTuning = { hurtSeconds: 0.3, hurtCooldown: 1.0, scale: 1.15 };

const kLifeSeconds = 1.0;
const kRisePx = 56;
const kJitterPx = 14;
const kBarWidthPx = 92;
const kBarHeightPx = 12;
const kBarLiftPx = 60;
const kTextScaleBase = 1.15;

export const goblinFrames: Record<string, string[]> = {
  Idle_R: ['13_Idle_R_1', '14_Idle_R_2'], Idle_L: ['15_Idle_L_1', '16_Idle_L_2'],
  Walk_R: ['03_Walk_R_1', '04_Walk_R_2', '05_Walk_R_3'], Walk_L: ['06_Walk_L_1', '07_Walk_L_2', '08_Walk_L_3'],
  Attack_R: ['09_Attack_R_1', '10_Attack_R_2'], Attack_L: ['11_Attack_L_1', '12_Attack_L_2'],
  Hurt_R: ['01_Hurt_R'], Hurt_L: ['02_Hurt_L'], Dead_R: ['18_Dead_R'], Dead_L: ['17_Dead_L'],
};
const kAnimFps: Record<string, number> = { Idle: 2.5, Walk: 8, Attack: 6, Hurt: 1, Dead: 1 };

interface Visual {
  gfx: Phaser.GameObjects.Graphics;
  sprite?: Phaser.GameObjects.Sprite;
  /** A hero's chibi sprite or a still enemy sprite (moved by heroMotion); without one the unit is a sphere or cube. */
  hero?: Phaser.GameObjects.Image;
  hurtClock: number;
  moveClock: number;
  lastX: number;
  lastY: number;
  lastHp: number;
  faceRight: boolean;
  anim: string;
  seen: boolean;
}


export class UnitView {
  private visuals = new Map<string, Visual>();
  private entries: FloatEntry[] = [];
  private jitterCounter = 0;
  private subscribedSim: CombatSim | undefined;
  private overlay: Phaser.GameObjects.Graphics;
  /** Recent hits, lunges and casts per sprite unit id (reset with each new fight's sim). */
  private fx = new Map<number, HeroFx>();
  /** The clock time each unit was last damaged (fewer health bars). */
  private lastHit = new Map<number, number>();
  private clock = 0;
  private readonly reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  smiteFlash: { x: number; y: number; age: number } = { x: 0, y: 0, age: 99 };
  /** Set by the HUD while Smite is armed and the pointer is over the room: the ground point to ring. */
  smiteAim: { x: number; y: number } | undefined;

  constructor(private readonly scene: Phaser.Scene, private readonly rm: RunManager, private readonly room: RoomView,
    private readonly texts: TextPool, private readonly hasGoblin: boolean) {
    this.overlay = scene.add.graphics().setDepth(400);
  }

  private keyOf(u: Unit): string {
    return !u.enemy && !u.summon ? `P:${u.name}` : `E:${this.rm.fightSerial}:${u.id}`;
  }

  /** The unit is drawn as one still sprite moved in code: a hero with a chibi, or Archer / Brute / Shaman. */
  private hasStill(u: Unit): boolean {
    if (u.summon) return !u.enemy && this.scene.textures.exists(spiritTextureKey(u.greater));
    return this.scene.textures.exists(u.enemy ? enemyTextureKey(u.name) : heroTextureKey(u.name))
      && (!u.enemy || (kEnemySpriteNames as readonly string[]).includes(u.name));
  }
  /** The still texture to show now: a spirit's, a hero's knocked-out sprite when it has one and is down, else the idle sprite. */
  private stillKey(u: Unit): string {
    if (u.summon) return spiritTextureKey(u.greater);
    if (u.enemy) return enemyTextureKey(u.name);
    return !u.alive && (kHeroKoClasses as readonly string[]).includes(u.name) ? heroKoTextureKey(u.name) : heroTextureKey(u.name);
  }

  /** Where the unit stands now (the room view walks the party between rooms; staged enemies stand in the next room). */
  worldPos(u: Unit): { x: number; y: number } {
    if (!u.enemy && !u.summon) {
      const w = this.room.walkerPos(u.name);
      if (w) return w;
      return { x: u.x, y: u.y };
    }
    if (this.rm.isStaged()) {
      const o = this.room.stagedOffset();
      return { x: u.x + o.x, y: u.y + o.y };
    }
    return { x: u.x, y: u.y };
  }

  private subscribe(sim: CombatSim): void {
    if (this.subscribedSim === sim) return;
    this.subscribedSim = sim;
    this.entries = [];
    this.fx.clear();
    const heroFx = (id: number): HeroFx | undefined => {
      const u = sim.getUnit(id);
      if (!u || !this.hasStill(u)) return undefined;
      let f = this.fx.get(id);
      if (!f) this.fx.set(id, (f = newHeroFx()));
      return f;
    };
    const dirFrom = (a: number, b: number): number => {
      const ua = sim.getUnit(a), ub = sim.getUnit(b);
      return ua && ub && ub.x < ua.x ? -1 : 1;
    };
    sim.getBus().subscribe('DamageDealt', (ev) => {
      // A hero that lands a hit lunges toward the target; a hero that is hit flashes white and is pushed back.
      const src = heroFx(ev.source);
      if (src && ev.source !== ev.target) { src.lunge = 0; src.lungeDir = dirFrom(ev.source, ev.target); }
      const dst = heroFx(ev.target);
      if (dst && ev.amount > 0) {
        dst.flash = 0;
        dst.knock = 0;
        dst.knockDir = -dirFrom(ev.target, ev.source);
        const t = sim.getUnit(ev.target);
        if (t && !this.reducedMotion && (ev.crit || ev.amount >= 0.15 * sim.maxHp(t))) this.scene.cameras.main.shake(110, 0.005);
      }
    });
    sim.getBus().subscribe('HealApplied', (ev) => { const f = heroFx(ev.source); if (f) f.cast = 0; });
    sim.getBus().subscribe('AbilityCast', (ev) => { const f = heroFx(ev.caster); if (f) f.cast = 0; });
    sim.getBus().subscribe('UnitDied', (ev) => { const f = heroFx(ev.unit); if (f) f.ko = 0; });
    sim.getBus().subscribe('DamageDealt', (ev) => {
      if (ev.amount > 0) this.lastHit.set(ev.target, this.clock);
      const t = sim.getUnit(ev.target);
      let color = t && !t.enemy ? lin(1, 0.35, 0.3) : lin(1, 1, 1);
      if (ev.crit) color = lin(1, 0.9, 0.1);
      this.addEntry(ev.target, ev.crit ? 'crit' : 'damage', ev.amount, color, ev.crit ? 1.5 : 1);
    });
    sim.getBus().subscribe('HealApplied', (ev) => {
      this.addEntry(ev.target, 'heal', ev.effectiveAmount, lin(0.3, 1, 0.4), 1);
    });
  }

  /** A word floating over a unit (a miracle's name). */
  addLabel(unitId: number, text: string, color: number, size: number): void {
    const u = this.rm.getSim()?.getUnit(unitId);
    if (!u) return;
    const p = this.worldPos(u);
    pushFloat(this.entries, { unit: unitId, kind: 'label', amount: 0, x: p.x, y: p.y, text, color, age: 0, jitter: jitter(this.jitterCounter++, kJitterPx), size, dx: 0 },
      readability.mergeNumbers, () => text);
  }

  private addEntry(unitId: number, kind: FloatKind, amount: number, color: number, size: number): void {
    const u = this.rm.getSim()?.getUnit(unitId);
    if (!u) return;
    const merge = readability.mergeNumbers;
    // Small hits that round to nothing still add into a merged number, so they are only dropped when they would show alone.
    const text = formatAmount(amount, kind === 'heal', kind === 'crit');
    if (text === '' && !merge) return;
    const p = this.worldPos(u);
    const heal = merge && kind === 'heal';
    pushFloat(this.entries, {
      unit: unitId, kind, amount, x: p.x, y: p.y, text, color, age: 0, jitter: jitter(this.jitterCounter++, kJitterPx),
      size: heal ? size * kHealSize : size, dx: heal ? kHealOffsetPx : 0,
    }, merge, (a, k) => formatAmount(a, k === 'heal', k === 'crit'));
  }

  update(dt: number, scale: number, hideOverlays: boolean): void {
    const sim = this.rm.getSim();
    for (const v of this.visuals.values()) v.seen = false;
    this.clock += dt;
    for (const f of this.fx.values()) { f.lunge += dt; f.knock += dt; f.flash += dt; f.cast += dt; f.ko += dt; }
    this.overlay.clear();
    if (sim) {
      this.subscribe(sim);
      for (const u of sim.getUnits()) {
        if (!this.rm.unitShown(u)) continue;
        this.drawUnit(sim, u, dt);
      }
    }
    for (const [k, v] of this.visuals) {
      if (!v.seen) {
        v.gfx.destroy();
        v.sprite?.destroy();
        v.hero?.destroy();
        this.visuals.delete(k);
      }
    }
    for (const e of this.entries) e.age += dt;
    this.entries = this.entries.filter((e) => e.age < kLifeSeconds);
    if (!sim) this.lastHit.clear();
    this.smiteFlash.age += dt;
    if (!hideOverlays && sim) this.drawOverlays(sim, scale);
  }

  private drawUnit(sim: CombatSim, u: Unit, dt: number): void {
    const key = this.keyOf(u);
    let v = this.visuals.get(key);
    const party = !u.enemy && !u.summon;
    const sprite = u.enemy && u.name === 'Grunt' && this.hasGoblin;
    if (!v) {
      v = { gfx: this.scene.add.graphics(), hurtClock: 99, moveClock: 99, lastX: u.x, lastY: u.y, lastHp: u.hp, faceRight: !u.enemy, anim: '', seen: true };
      if (sprite) v.sprite = this.scene.add.sprite(0, 0, 'gob_13_Idle_R_1').setOrigin(0.5, 1);
      if (this.hasStill(u)) v.hero = this.scene.add.image(0, 0, this.stillKey(u)).setOrigin(0.5, 1);
      this.visuals.set(key, v);
    }
    v.seen = true;
    const p = this.worldPos(u);
    const maxHp = sim.maxHp(u);
    const fill = maxHp > 0 ? Math.min(1, Math.max(0, u.hp / maxHp)) : 0;
    // Hurt and walk clocks (sprite units).
    v.hurtClock += dt;
    v.moveClock += dt;
    if (u.alive && u.hp < v.lastHp - 0.001 && v.hurtClock >= spriteTuning.hurtCooldown) v.hurtClock = 0;
    if (Math.abs(p.x - v.lastX) > 0.5 || Math.abs(p.y - v.lastY) > 0.5) v.moveClock = 0;
    v.lastHp = u.hp;
    v.lastX = p.x;
    v.lastY = p.y;
    if (u.alive) {
      const t = sim.getUnit(u.target);
      v.faceRight = t ? t.x >= u.x : !u.enemy;   // no target: enemies look toward the party (left), heroes toward the enemies
    }
    const foot = this.room.project(p.x, p.y, 0);
    if (foot.depth <= 0) return;
    const side = this.room.project(p.x + 50 * kBodyXY, p.y, 0);
    const pxPerUu = Math.abs(side.x - foot.x) / (50 * kBodyXY);
    let depth = 100 + (p.y + 5000) / 100;
    if (u.summon && !u.enemy) {
      // A spirit is never drawn over its Summoner, even when it stands nearer the camera, so she stays in view.
      const owner = sim.getUnit(u.owner);
      if (owner) depth = Math.min(depth, 100 + (this.worldPos(owner).y + 5000) / 100 - 0.02);
    }
    v.gfx.setDepth(depth);
    const g = v.gfx;
    g.clear();
    if (readability.footRings && u.alive) {
      // A ring on the floor in the unit's side colour: gold for the party and its summons, red for enemies (the floor under a pile-up
      // stays visible when the sprites overlap).
      const rx = 50 * kBodyXY * pxPerUu * 1.25;
      g.fillStyle(u.enemy ? lin(0.85, 0.15, 0.1) : lin(1, 0.8, 0.25), 0.22).fillEllipse(foot.x, foot.y, rx * 2, rx * 0.72);
      g.lineStyle(Math.max(1.5, rx * 0.09), u.enemy ? lin(1, 0.25, 0.15) : lin(1, 0.85, 0.3), 0.9).strokeEllipse(foot.x, foot.y, rx * 2, rx * 0.72);
    }
    if (v.sprite) {
      let anim = 'Idle';
      if (!u.alive) anim = 'Dead';
      else if (v.hurtClock < spriteTuning.hurtSeconds) anim = 'Hurt';
      else if (u.castKind !== CastKind.None) anim = 'Attack';
      else if (v.moveClock < kWalkHoldSeconds) anim = 'Walk';
      const full = `${anim}_${v.faceRight ? 'R' : 'L'}`;
      if (full !== v.anim) {
        v.anim = full;
        v.sprite.play(`gob_${full}`);
      }
      v.sprite.setPosition(foot.x, foot.y).setScale(spriteTuning.scale * spriteSizes.enemy * unitSpriteSize(u.name) * pxPerUu).setDepth(depth);
      return;
    }
    if (v.hero) {
      this.drawHero(sim, u, v, v.hero, p, fill, pxPerUu, depth);
      return;
    }
    const zs = u.alive ? (party ? kRoundZ : kBodyZ) * (0.5 + 0.5 * fill) : 0.05;
    const hUu = 100 * zs;
    const r = 50 * kBodyXY;
    const rgb = party ? classColor(u.name) : u.summon ? [0.4, 0.9, 0.9] as [number, number, number] : [0.2, 0.65, 0.15] as [number, number, number];
    const deadTint = u.alive ? 1 : 0.35;
    if (party) {
      const head = this.room.project(p.x, p.y, hUu);
      const rx = r * pxPerUu;
      const ry = Math.max(2, (foot.y - head.y) / 2 + rx * 0.35);
      const cy = (foot.y + head.y) / 2;
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(foot.x, foot.y, rx * 2, rx * 0.7);
      g.fillStyle(lin(rgb[0] * deadTint, rgb[1] * deadTint, rgb[2] * deadTint), 1);
      g.fillEllipse(foot.x, cy, rx * 2, ry * 2);
      if (u.alive) {
        g.fillStyle(lin(Math.min(1, rgb[0] * 1.6 + 0.15), Math.min(1, rgb[1] * 1.6 + 0.15), Math.min(1, rgb[2] * 1.6 + 0.15)), 0.55);
        g.fillEllipse(foot.x - rx * 0.3, cy - ry * 0.35, rx * 0.7, ry * 0.6);
      }
      return;
    }
    // Cube: the camera-facing front, the side toward the screen centre and the top.
    const corner = (dx: number, dy: number, z: number): Phaser.Geom.Point => {
      const q = this.room.project(p.x + dx, p.y + dy, z);
      return new Phaser.Geom.Point(q.x, q.y);
    };
    const c = (k: number): number => lin(rgb[0] * k * deadTint, rgb[1] * k * deadTint, rgb[2] * k * deadTint);
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(foot.x, foot.y, r * pxPerUu * 2.2, r * pxPerUu * 0.8);
    const sideX = p.x > 0 ? -r : r;
    g.fillStyle(c(0.6), 1);
    g.fillPoints([corner(sideX, -r, 0), corner(sideX, r, 0), corner(sideX, r, hUu), corner(sideX, -r, hUu)], true);
    g.fillStyle(c(0.85), 1);
    g.fillPoints([corner(-r, r, 0), corner(r, r, 0), corner(r, r, hUu), corner(-r, r, hUu)], true);
    g.fillStyle(c(1.15), 1);
    g.fillPoints([corner(-r, -r, hUu), corner(r, -r, hUu), corner(r, r, hUu), corner(-r, r, hUu)], true);
  }

  /** A hero (chibi) or a still enemy sprite, moved by heroMotion: bob, hop, lunge, flash, knock-back, cast glow, weak pulse, lying down when out. */
  private drawHero(sim: CombatSim, u: Unit, v: Visual, img: Phaser.GameObjects.Image, p: { x: number; y: number }, fill: number,
    pxPerUu: number, depth: number): void {
    const fx = this.fx.get(u.id) ?? newHeroFx();
    if (!u.alive && !this.fx.has(u.id)) fx.ko = 99;   // already down when first seen: no fall animation
    const pose = heroPose({
      time: this.clock + u.id * 0.37, alive: u.alive, moving: v.moveClock < kWalkHoldSeconds,
      casting: u.castKind === CastKind.Ability || u.castKind === CastKind.AutoHeal, hpFraction: u.enemy ? 1 : fill,
      won: !u.enemy && sim.getState() === FightState.Won, faceRight: v.faceRight,
    }, fx);
    const foot = this.room.project(p.x + pose.dx, p.y, 0);
    const lifted = this.room.project(p.x + pose.dx, p.y, pose.lift);
    const sc = kHeroMotion.uuPerPx * (u.enemy ? spriteSizes.enemy : spriteSizes.party) * unitSpriteSize(u.name) * pxPerUu;
    // Shadow stays on the floor and shrinks a little as the hero rises.
    const g = v.gfx;
    const rx = 50 * kBodyXY * pxPerUu * (1 - Math.min(0.4, pose.lift / 120));
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(foot.x, foot.y, rx * 2, rx * 0.7);
    // Lying down turns about the sprite's middle, so lift it to sit on the floor.
    // A hero with a knocked-out sprite swaps to it instead of tipping over.
    const key = this.stillKey(u);
    if (img.texture.key !== key) img.setTexture(key);
    const koSprite = !u.alive && key !== heroTextureKey(u.name) && !u.summon && !u.enemy;
    if (koSprite) pose.angle = 0;
    const down = Math.abs(pose.angle) > 1;
    img.setOrigin(0.5, down ? 0.5 : 1);
    img.setPosition(lifted.x, down ? lifted.y - img.width * sc * 0.5 * Math.abs(Math.sin((pose.angle * Math.PI) / 180)) - (img.height * sc * 0.5) * Math.abs(Math.cos((pose.angle * Math.PI) / 180)) : lifted.y);
    img.setScale(sc, sc * pose.scaleY).setAngle(pose.angle).setAlpha(pose.alpha).setDepth(depth);
    img.setFlipX(kSpriteFacesLeft === v.faceRight);
    if (pose.flash) img.setTintFill(0xffffff);
    else img.setTint(pose.tint);
  }

  /** Autos in flight: Arcane Shot (violet), Searing Light's smite (gold) and Spirit Bolt (green), a bright core in a soft glow with a short trail. */
  private drawProjectiles(sim: CombatSim, scale: number): void {
    const g = this.overlay;
    const off = this.rm.isStaged() ? this.room.stagedOffset() : { x: 0, y: 0 };
    for (const p of sim.getProjectiles()) {
      const src = sim.getUnit(p.source);
      const tgt = sim.getUnit(p.target);
      if (!src || !tgt) continue;
      const holy = src.name === 'Priest', spirit = src.name === 'Summoner';
      const glow = holy ? 0xffd86b : spirit ? 0x4fe08a : 0x9d6bff, core = holy ? 0xfff7d6 : spirit ? 0xdcffe9 : 0xe6d6ff;
      const here = this.room.project(p.x + off.x, p.y + off.y, 100);
      if (here.depth <= 0) continue;
      // The trail points back toward the caster.
      const dx = src.x - p.x, dy = src.y - p.y, d = Math.hypot(dx, dy) || 1;
      const tail = this.room.project(p.x + off.x + (dx / d) * 90, p.y + off.y + (dy / d) * 90, 100);
      g.lineStyle(Math.max(2, 5 * scale), glow, 0.35).lineBetween(tail.x, tail.y, here.x, here.y);
      g.fillStyle(glow, 0.35).fillCircle(here.x, here.y, 13 * scale);
      g.fillStyle(core, 1).fillCircle(here.x, here.y, 6 * scale);
    }
  }

  private drawOverlays(sim: CombatSim, scale: number): void {
    const g = this.overlay;
    this.drawProjectiles(sim, scale);
    // Fewer bars also draws them smaller.
    const thin = readability.fewerBars;
    const barW = kBarWidthPx * scale * (thin ? 0.75 : 1);
    const barH = kBarHeightPx * scale * (thin ? 0.6 : 1);
    const border = Math.max(1, Math.round(scale));
    for (const u of sim.getUnits()) {
      if (u.removed || !u.alive || !this.rm.unitShown(u)) continue;
      const p = this.worldPos(u);
      const s = this.room.project(p.x, p.y, 100);
      if (s.depth <= 0) continue;
      // Health bar: only on a damaged unit (Nov 14); with fewer bars, an enemy hit in the last few seconds or a hero low on health.
      if (barVisible(u.enemy, fillFraction(u.hp, sim.maxHp(u)), this.clock - (this.lastHit.get(u.id) ?? -99), thin)) {
        const left = s.x - barW / 2;
        const top = s.y - kBarLiftPx * scale;
        const f = fillFraction(u.hp, sim.maxHp(u));
        g.fillStyle(0x000000, 0.85).fillRect(left - border, top - border, barW + 2 * border, barH + 2 * border);
        g.fillStyle(lin(0.18, 0.18, 0.18), 0.95).fillRect(left, top, barW, barH);
        if (f > 0) g.fillStyle(u.enemy ? lin(0.9, 0.12, 0.12) : lin(0.15, 0.8, 0.2), 1).fillRect(left, top, barW * f, barH);
        g.lineStyle(border, 0xffffff, 0.6).strokeRect(left - border / 2, top - border / 2, barW + border, barH + border);
      }
      // Cast bar: amber over a unit that is casting or winding up (no bar for a sprite unit's melee swing).
      if (u.castKind !== CastKind.None && u.castTotal > 0) {
        const spriteMelee = u.castKind === CastKind.Auto && u.stats.get(StatId.Range) <= sim.config().tankMeleeFirstRange && u.enemy && u.name === 'Grunt' && this.hasGoblin;
        if (!spriteMelee) {
          const cw = barW;
          const chh = Math.max(2, 0.6 * barH);
          const left = s.x - cw / 2;
          const top = s.y - kBarLiftPx * scale - chh - 3 * scale;
          const done = Math.min(1, Math.max(0, 1 - u.castLeft / u.castTotal));
          g.fillStyle(0x000000, 0.8).fillRect(left - 1, top - 1, cw + 2, chh + 2);
          g.fillStyle(u.enemy ? lin(1, 0.45, 0.2) : lin(1, 0.8, 0.2), 1).fillRect(left, top, cw * done, chh);
        }
      }
      // Divine Shield: a blue frame and the seconds left.
      if (!u.enemy && u.shieldLeft > 0) {
        const side = 1.6 * kBarLiftPx * scale;
        g.lineStyle(3, lin(0.45, 0.8, 1), 0.95).strokeRect(s.x - side / 2, s.y - side * 0.6, side, side);
        this.texts.at(`shield${u.id}`, `${u.shieldLeft.toFixed(1)}s`, s.x, s.y + side * 0.4 + 2, 1.1 * 16 * scale, lin(0.6, 0.9, 1), 0.5, 0);
      }
    }
    // Smite: the aiming ring and the flash.
    const ring = (cx: number, cy: number, color: number, alpha: number, thick: number): void => {
      const r = sim.config().miracle.smiteRadius;
      const pts: Phaser.Geom.Point[] = [];
      for (let k = 0; k <= 40; ++k) {
        const a = (2 * Math.PI * k) / 40;
        const q = this.room.project(cx + r * Math.cos(a), cy + r * Math.sin(a), 100);
        pts.push(new Phaser.Geom.Point(q.x, q.y));
      }
      g.lineStyle(thick, color, alpha).strokePoints(pts, false);
    };
    if (this.smiteAim && sim.getState() === FightState.Running) ring(this.smiteAim.x, this.smiteAim.y, lin(1, 0.8, 0.25), 0.95, 3);
    if (this.smiteFlash.age < 0.6) {
      const fade = 1 - this.smiteFlash.age / 0.6;
      ring(this.smiteFlash.x, this.smiteFlash.y, lin(1, 0.95, 0.5), fade, 6 * fade + 1);
    }
    // Floating combat text.
    this.entries.forEach((e, i) => {
      const a = floatAnimAt(e.age, kLifeSeconds, kRisePx * scale);
      if (a.done) return;
      const s = this.room.project(e.x, e.y, 100);
      if (s.depth <= 0) return;
      const px = kTextScaleBase * 18 * scale * e.size * a.scale;
      const y = s.y - (kBarLiftPx + 10) * scale - a.rise;
      if (e.text === '') return;
      const x = s.x + (e.jitter + e.dx) * scale;
      this.texts.at(`fl${i}s`, e.text, x + 1.5 * scale, y + 1.5 * scale, px, 0x000000, 0.5, 1, a.alpha * 0.9, true);
      this.texts.at(`fl${i}`, e.text, x, y, px, e.color, 0.5, 1, a.alpha, true);
    });
  }
}

/** Creates the goblin animations once the frames are loaded. */
export function createGoblinAnims(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists('gob_13_Idle_R_1')) return false;
  for (const [name, frames] of Object.entries(goblinFrames)) {
    const kind = name.split('_')[0];
    if (scene.anims.exists(`gob_${name}`)) continue;
    scene.anims.create({
      key: `gob_${name}`, frames: frames.map((f) => ({ key: `gob_${f}` })), frameRate: kAnimFps[kind],
      repeat: kind === 'Hurt' || kind === 'Dead' ? 0 : -1,
    });
  }
  return true;
}
