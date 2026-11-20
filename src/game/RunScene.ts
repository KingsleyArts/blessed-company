// The playable run (ATolGameMode + ACombatManager + ATolHud wired together): the run manager ticks in real time, the room view draws the
// floor modules and walks the party between rooms, the unit view draws bodies and bars, the HUD draws on top and takes input.
import Phaser from 'phaser';
import { loadCombatData } from '../core/combatData';
import { RunChange, RunManager, makeRunManagerOptions } from '../core/runManager';
import { amountValue, formatResultLines } from '../core/uiText';
import { AbilityDataCsv, AbilityEffectDataCsv, ClassDataCsv, EnemyDataCsv } from '../data/generated';
import { Overlay } from '../ui/overlay';
import { TextPool } from './draw';
import { Hud } from './hud';
import { roomTypeName } from '../core/runFlow';
import type { SlotCard } from '../ui/saves';
import { classColor, hex } from './draw';
import { loadSettings, saveSettings, type Settings } from './localStore';
import { SlotStore, defaultSlotName, kSlotCount, kSlotsPerPage, type SlotInfo } from './saveSlots';
import { Music } from './music';
import type { Params } from './params';
import { RoomView } from './roomView';
import { UnitView, createGoblinAnims } from './unitView';

export class RunScene extends Phaser.Scene {
  rm!: RunManager;
  private room!: RoomView;
  private units!: UnitView;
  private hud!: Hud;
  private roomG!: Phaser.GameObjects.Graphics;
  private unitTexts!: TextPool;
  private hudTexts!: TextPool;
  private overlay!: Overlay;
  private params!: Params;
  private store!: SlotStore;
  /** Play time not yet written to the slot card (seconds), and when it was last written. */
  private playPending = 0;
  private infoClock = 0;
  private dprNow = 1;
  private music!: Music;
  private settings!: Settings;

  constructor() {
    super('Run');
  }

  create(): void {
    this.params = this.registry.get('params') as Params;
    this.dprNow = (this.registry.get('dpr') as number) ?? 1;
    const data = loadCombatData(ClassDataCsv, EnemyDataCsv, AbilityDataCsv, AbilityEffectDataCsv);
    if (!data) throw new Error('combat data failed to load');
    this.store = new SlotStore();
    this.store.migrateLegacy();
    if (this.params.reset) for (let i = 0; i < kSlotCount; ++i) this.store.erase(i);
    this.rm = new RunManager(data, this.store, makeRunManagerOptions({ enemyMult: this.params.enemyMult, castTimes: this.params.castTimes }));
    this.room = new RoomView(this.rm);
    this.rm.setTransitionHook(this.room);
    this.roomG = this.add.graphics().setDepth(0);
    this.unitTexts = new TextPool(this, 450, this.dprNow);
    this.hudTexts = new TextPool(this, 600, this.dprNow);
    this.units = new UnitView(this, this.rm, this.room, this.unitTexts, createGoblinAnims(this));
    this.hud = new Hud(this, this.rm, this.room, this.units, this.hudTexts, { testing: this.params.testing });
    this.overlay = new Overlay(document.getElementById('ui-root')!);
    this.applyCamera();
    this.registry.events.on('changedata-dpr', () => this.applyCamera());
    this.scale.on('resize', () => this.applyCamera());

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.hud.pointerMove(p.worldX, p.worldY));
    // A run-over card or the Temple covers the room view only (the DOM takes those clicks), so the HUD around it still works, as in
    // Unreal where the card's blocker hit box covers the room area only.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.hud.pointerDown(p.worldX, p.worldY));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.hud.key(e.code);
    });

    this.settings = loadSettings();
    this.music = new Music(this, this.settings.volume);
    this.overlay.onRerender = () => this.showTemple();
    this.rm.onChange((c) => {
      if (c === RunChange.RunStarted || c === RunChange.FloorChanged) this.room.rebuildForRun();
      if (c === RunChange.RunEnded) this.showResults();
      if (c === RunChange.RunStarted) this.overlay.hide();
      if (c === RunChange.MetaChanged && this.overlay.kind === 'temple') this.showTemple();
      // Save slots: the run save goes to the slot as soon as it is taken (or is removed when the run ends).
      if (c === RunChange.RunSaved && this.store.slot !== undefined) {
        this.store.setRunSave(this.store.slot, this.rm.getRunSave());
        this.writeSlotInfo();
      }
      if (c === RunChange.MetaChanged || c === RunChange.RunEnded) this.writeSlotInfo();
    });
    // Closing or hiding the app writes the play time; the run save is already stored (taken at the last safe moment).
    const flush = (): void => this.writeSlotInfo();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    (window as unknown as { bc: unknown }).bc = { rm: this.rm, hud: this.hud, scene: this };   // console access while testing
    // The title screen comes first (director, Nov 19); New Game and Continue lead to the Temple, the home screen (Nov 14).
    this.showTitle();
  }

  /** The title screen: New Game (a fresh slot), Continue (the Load Save Data screen), Settings (music), Quit. */
  private showTitle(): void {
    this.overlay.showTitle({
      hasSave: () => false,   // New Game never erases here any more: it takes an empty slot (or asks which to replace)
      canContinue: () => this.store.anyUsed(),
      volume: () => this.music.getVolume(),
      newGame: () => {
        const free = this.store.firstEmpty();
        if (free !== undefined) this.startNewGame(free);
        else this.showSaves('replace');
      },
      continue: () => this.showSaves('load'),
      setVolume: (v) => {
        this.music.setVolume(v);
        this.settings.volume = v;
        saveSettings(this.settings);
      },
    });
  }

  /** The Load Save Data screen (director's mockup, Nov 19), opened on the page of the slot played last. */
  private showSaves(mode: 'load' | 'replace'): void {
    const last = this.store.lastSlot() ?? 0;
    this.overlay.showSaves({
      slotCount: kSlotCount,
      perPage: kSlotsPerPage,
      cards: (slots) => slots.map((slot) => ({ slot, card: this.slotCard(slot) })),
      load: (slot) => this.loadSlot(slot),
      newGame: (slot) => this.startNewGame(slot),
      replace: (slot) => { this.store.erase(slot); this.startNewGame(slot); },
      erase: (slot) => this.store.erase(slot),
      rename: (slot, name) => {
        const info = this.store.info(slot);
        if (info) this.store.setInfo(slot, { ...info, name });
      },
      back: () => this.showTitle(),
    }, mode, Math.floor(last / kSlotsPerPage));
  }

  private slotCard(slot: number): SlotCard | undefined {
    const info = this.store.info(slot);
    if (!info) return undefined;
    const d = new Date(info.savedAt);
    const two = (n: number): string => String(n).padStart(2, '0');
    const when = info.savedAt > 0 ? `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}  ${two(d.getHours())}:${two(d.getMinutes())}` : '-';
    const t = Math.floor(info.playSeconds);
    const playTime = `${Math.floor(t / 3600)}:${two(Math.floor(t / 60) % 60)}:${two(t % 60)}`;
    const colorOf = (c: string): string => {
      const [r, g, b] = classColor(c);
      return hex((Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255));
    };
    return {
      slot, name: info.name, location: info.location, when, playTime,
      picture: info.place === 'temple' ? `${import.meta.env.BASE_URL}assets/ui/temple_bg.webp` : '',
      party: info.party.map((c) => ({ name: c, letter: c.charAt(0), color: colorOf(c) })),
    };
  }

  /** Makes `slot` the one the game reads and writes, and reads its progress. */
  private useSlot(slot: number): void {
    this.writeSlotInfo();   // the previous slot's play time, if any
    this.store.slot = slot;
    this.store.setLastSlot(slot);
    this.playPending = 0;
    this.rm.reloadMeta();
  }

  /** New Game in `slot` (empty, or just erased): fresh progress, then the Temple. */
  private startNewGame(slot: number): void {
    this.useSlot(slot);
    const info: SlotInfo = { name: defaultSlotName(slot), savedAt: Date.now(), playSeconds: 0, location: 'Temple', place: 'temple', party: [] };
    this.store.setInfo(slot, info);
    this.showTemple();
    this.writeSlotInfo();
  }

  /** Load: a run in progress continues where it was saved; otherwise the Temple. */
  private loadSlot(slot: number): void {
    this.useSlot(slot);
    const run = this.store.runSave(slot);
    if (run !== undefined && this.rm.resumeRun(run)) return;   // RunStarted hides the overlay
    if (run !== undefined) this.store.setRunSave(slot, undefined);   // damaged: dropped, progress kept
    this.showTemple();
  }

  /** Brings the slot card up to date: last saved, play time, where, party. */
  private writeSlotInfo(): void {
    const slot = this.store.slot;
    if (slot === undefined) return;
    const old = this.store.info(slot);
    if (!old) return;
    const flow = this.rm.getFlow();
    const run = flow.getRun();
    const active = flow.active();
    let location = 'Temple';
    if (active) {
      const node = run.floor.nodes[run.currentNode];
      location = `Goblin Cave - Floor ${run.floorNumber}${node ? ` - ${roomTypeName(node.type)}` : ''}`;
    }
    const party = active ? [...run.party] : this.rm.getTempleSnapshot().roster.filter((r) => r.active).map((r) => r.className);
    this.store.setInfo(slot, {
      ...old, savedAt: Date.now(), playSeconds: old.playSeconds + this.playPending, location, place: active ? 'cave' : 'temple', party,
    });
    this.playPending = 0;
    this.infoClock = 0;
  }

  /** The Temple home screen; the last run's results show under its Expedition Report tab. */
  private showTemple(): void {
    const t = this.rm.getTempleSnapshot(amountValue(this.hud.ui.amountMode));
    if (!t.valid) return;
    const r = this.rm.getRunResults();
    const report = r.valid
      ? { victory: r.victory, lines: formatResultLines(r.causeOfDeath, r.killerName, r.floorReached, r.roomsCleared, r.kills, r.essenceEarned, r.goldEarned, r.bestFloor) }
      : undefined;
    this.overlay.showTemple(t, this.rm.getFlow().getRun().essence, this.hud.ui.amountMode, this.music.getVolume(), report, {
      buy: (id) => { this.rm.templeBuy(id, amountValue(this.hud.ui.amountMode)); },
      amount: (m) => { this.hud.ui.amountMode = m; this.showTemple(); },
      newRun: () => this.newRun(),
      reset: () => {
        this.rm.resetProgressOnly();
        this.showTemple();
      },
      volume: (v) => {
        this.music.setVolume(v);
        this.settings.volume = v;
        saveSettings(this.settings);
      },
    });
  }

  private applyCamera(): void {
    this.dprNow = (this.registry.get('dpr') as number) ?? 1;
    this.cameras.main.setOrigin(0, 0).setZoom(this.dprNow).setScroll(0, 0);
  }

  /** CSS-pixel size of the view. */
  private viewSize(): { w: number; h: number } {
    return { w: this.scale.width / this.dprNow, h: this.scale.height / this.dprNow };
  }

  newRun(): void {
    this.overlay.hide();
    if (this.params.floor > 1 || this.params.priest) this.rm.armNextRun(this.params.floor, this.params.priest);
    this.rm.startRunWithFights(this.params.seed);
  }

  private showResults(): void {
    const r = this.rm.getRunResults();
    if (!r.valid) return;
    const lines = formatResultLines(r.causeOfDeath, r.killerName, r.floorReached, r.roomsCleared, r.kills, r.essenceEarned, r.goldEarned, r.bestFloor);
    this.overlay.showResults(r.victory, lines, [
      { label: 'Temple', cls: 'blue', onClick: () => this.showTemple() },
      { label: 'New Run', cls: 'go', onClick: () => this.newRun() },
    ]);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, Math.max(0, deltaMs / 1000));
    const { w, h } = this.viewSize();
    this.unitTexts.begin();
    this.hudTexts.begin();
    this.hud.overlayOpen = this.overlay.isOpen();
    const menu = this.overlay.kind === 'title' || this.overlay.kind === 'saves';
    this.hud.preRun = (this.overlay.kind === 'temple' || menu) && !this.rm.getFlow().active();
    // Play time counts while a slot is being played (not on the title or Load screens); the card is updated every 15 s.
    if (this.store.slot !== undefined && !menu) {
      this.playPending += dt;
      this.infoClock += dt;
      if (this.infoClock >= 15) this.writeSlotInfo();
    }
    this.hud.update(dt, w, h);
    const area = this.hud.layout.roomArea;
    this.room.fit(area, w, h);
    this.room.syncToRun();
    this.room.update(dt);
    this.rm.tick(dt);
    if (this.room.needsRedraw()) this.room.draw(this.roomG, area);
    this.units.update(dt, this.hud.scale, false);
    this.hud.draw();
    this.overlay.setArea(area);
    const run = this.rm.getFlow().getRun();
    this.music.update(this.rm.getFlow().active(), run.floorNumber);
    this.unitTexts.end();
    this.hudTexts.end();
  }
}
