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
import { LocalMetaStore, loadSettings, saveSettings, type Settings } from './localStore';
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
  private store!: LocalMetaStore;
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
    this.store = new LocalMetaStore();
    if (this.params.reset) this.store.clear();
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
    });
    (window as unknown as { bc: unknown }).bc = { rm: this.rm, hud: this.hud, scene: this };   // console access while testing
    // The Temple is the home screen: up when the game starts (Nov 14).
    this.showTemple();
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
    this.hud.preRun = this.overlay.kind === 'temple' && !this.rm.getFlow().active();
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
