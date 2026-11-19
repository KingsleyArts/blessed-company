// The playable run (ATolGameMode + ACombatManager + ATolHud wired together): the run manager ticks in real time, the room view draws the
// floor modules and walks the party between rooms, the unit view draws bodies and bars, the HUD draws on top and takes input.
import Phaser from 'phaser';
import { loadCombatData } from '../core/combatData';
import { RunChange, RunManager, makeRunManagerOptions } from '../core/runManager';
import { formatResultLines } from '../core/uiText';
import { AbilityDataCsv, AbilityEffectDataCsv, ClassDataCsv, EnemyDataCsv } from '../data/generated';
import { Overlay } from '../ui/overlay';
import { TextPool } from './draw';
import { Hud } from './hud';
import { LocalMetaStore } from './localStore';
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
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.overlay.isOpen()) return;
      this.hud.pointerDown(p.worldX, p.worldY);
    });
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.hud.key(e.code);
    });

    this.rm.onChange((c) => {
      if (c === RunChange.RunStarted || c === RunChange.FloorChanged) this.room.rebuildForRun();
      if (c === RunChange.RunEnded) this.showResults();
      if (c === RunChange.RunStarted) this.overlay.hide();
    });
    (window as unknown as { bc: unknown }).bc = { rm: this.rm, hud: this.hud, scene: this };   // console access while testing
    this.newRun();
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
    this.overlay.showResults(r.victory, lines, [{ label: 'New Run', primary: true, onClick: () => this.newRun() }]);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(0.1, Math.max(0, deltaMs / 1000));
    const { w, h } = this.viewSize();
    this.unitTexts.begin();
    this.hudTexts.begin();
    this.hud.overlayOpen = this.overlay.isOpen();
    this.hud.update(dt, w, h);
    const area = this.hud.layout.roomArea;
    this.room.fit(area, w, h);
    this.room.syncToRun();
    this.room.update(dt);
    this.rm.tick(dt);
    if (this.room.needsRedraw()) this.room.draw(this.roomG, area);
    this.units.update(dt, this.hud.scale, false);
    this.hud.draw();
    this.unitTexts.end();
    this.hudTexts.end();
  }
}
