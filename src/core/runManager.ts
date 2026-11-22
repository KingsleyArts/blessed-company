// The live run layer: Run/RunManager.cpp (playable mode) plus the parts of Combat/CombatManager.cpp the view needs, without the engine.
// The Phaser scenes call this class and draw what it holds; it holds no drawing code. The instant soak lives in autoRun.ts and makes
// the same calls in the same order; this class adds what a played run needs on top:
//   * real time: tick(dt) turns frame time times the speed into whole 1/30 s sim steps (at most 128 per frame, the backlog dropped),
//     and runs the Unreal timers (the Auto step delay, the first Auto step) on unscaled time
//   * the room-to-room walk: the view registers a TransitionHook; a move holds the room's entry (and so its fight) until the party
//     has walked in, and stages the next fight's enemies in the room meanwhile (StageNextFight / BeginStagedFight)
//   * Auto: the bot walks the party room by room; it never spends Gold (only the soak bot does, Nov 14)
//   * the saved meta through a MetaStore (the browser keeps it in localStorage); the Temple and the party picker between runs
import { installShippedCastTimes } from './castTimes';
import type { CombatData } from './combatData';
import { CombatSim, FightState, defaultCombatConfig, type CombatConfig, type Unit } from './combatSim';
import { kNoUnit, type UnitId } from './eventBus';
import { applyEssenceToSim, kEssenceAppliesToRunningFight } from './essenceApply';
import { shippedEssenceConfig, type EssenceStatDef } from './essenceConfig';
import { normalizeFloorSize, type FloorSize } from './floorGenerator';
import { BuyRefusal, type BuyResult } from './essenceSidebar';
import { RoomType, type Dir } from './floorGenerator';
import { applyGearToSim, gearLevel } from './gearApply';
import { kMetaMaxGold, makeMeta, parseMeta, resetProgress, serializeMeta, type MetaSave } from './metaSave';
import { MiracleKind, MiracleResult } from './miracleGauge';
import { RosterResult, activeParty, kActiveSlots, rosterIsActive, rosterOwns, rosterPriestClass, toggleActiveHero } from './roster';
import { RunBot } from './runBot';
import { RunStats, type DamageReport, type RoomDamage } from './runStats';
import { EntryKind, FightResult, RunFlow, RunOutcome, TeleportResult, roomTypeName, runOutcomeName, type PendingGear, type RoomEntry, type RunResults } from './runFlow';
import { buildMapView, type MapView } from './runMapView';
import { parseRunSave, serializeRunSave } from './runSave';
import { heroLabel, heroSkills, heroStatLines, kHeroOrder, roleLabel, rolePriority, type HeroSheet } from './heroSheet';
import { exitRoomRevive, partyHpFraction } from './runSim';
import { ModKind, ModSource } from './statResolver';
import {
  GearSlot, buyGear, buyPartyLuck, buyStatRanks, buyStatUnlock, defaultTempleConfig, gearNextCost, gearTempleLevel, kGearMaxTempleLevel,
  kGearSlotCount, partyLuckBonus, partyLuckNextCost, partyLuckRank, statNextCost, statTempleLevel, statUnlocked,
} from './temple';
import { formatBonus, formatRawBonus, templeLuckLabel, templeStatLabel } from './uiText';

/** Why the run changed (ETolRunChange). Read the snapshots again after any of them. */
export enum RunChange {
  RunStarted, RoomChanged, MapChanged, FightStarted, FightFinished, FloorChanged, AutoChanged, RunEnded, EssenceChanged, MetaChanged,
  /** A new run save is ready (getRunSave()), or the run ended and there is none: write it to storage. */
  RunSaved,
}

/** Where the saved meta lives (FTolMetaStore). */
export interface MetaStore {
  /** The saved text, or undefined when there is none. */
  load(): string | undefined;
  save(text: string): void;
  /** Keeps a corrupt save beside the real one (".corrupt"). */
  keepCorrupt?(text: string): void;
}

export class MemoryMetaStore implements MetaStore {
  text: string | undefined;
  keepCorrupt?: (text: string) => void;
  load(): string | undefined { return this.text; }
  save(text: string): void { this.text = text; }
}

/** One room-to-room step of a walk: through the `dir` door of room `fromNode` into `toNode` (FTolWalkStep). */
export interface WalkStep { dir: Dir; fromNode: number; toNode: number }

/** The room view's walk (FTolTransitionHook). play(): animate and call done() when the party stands in the last room. */
export interface TransitionHook {
  play(steps: WalkStep[], speed: number, done: () => void): void;
  cancel(): void;
}

/** The floor map and run state for the HUD, fog applied (FTolFloorSnapshot). */
export interface FloorSnapshot extends MapView {
  auto: boolean;
  teleportRefusal: string;
  runEnded: boolean;
  results: RunResultsView;
}

/** FTolRunResults. */
export interface RunResultsView {
  valid: boolean;
  victory: boolean;
  outcome: string;
  floorReached: number;
  essenceEarned: number;
  goldEarned: number;
  seed: bigint;
  causeOfDeath: string;
  killerName: string;
  priestRescued: boolean;
  kills: number;
  roomsCleared: number;
  bestFloor: number;
  /** Expedition Report breakdowns (empty until a run has been fought). */
  damage: DamageReport;
  rooms: RoomDamage[];
}

export interface SidebarRowView {
  stat: string;
  tier: number;
  rank: number;
  maxRank: number;
  nextCost: number;
  currentBonus: number;
  nextBonus: number;
  unit: string;
  showValue: boolean;
  valueNow: number;
  valueNext: number;
  unlocked: boolean;
  canBuy: boolean;
  refusal: BuyRefusal;
  reason: string;
}

export interface PartyMemberView {
  index: number;
  name: string;
  className: string;
  currentHp: number;
  maxHp: number;
  alive: boolean;
  totalRanks: number;
}

/** FTolSidebarSnapshot: the Essence menu for one party member. */
export interface SidebarSnapshot {
  valid: boolean;
  characterIndex: number;
  characterName: string;
  weaponLevel: number;
  armorLevel: number;
  weaponDrops: number;
  armorDrops: number;
  essence: number;
  rows: SidebarRowView[];
  party: PartyMemberView[];
  appliesToRunningFight: boolean;
}

/** FTolTempleItem. id: "Gear:<Class>:<0|1>", "Stat:<name>" (unlock), "Level:<name>" (ranks), "Luck:<name>". */
export interface TempleItem {
  id: string;
  column: number;
  label: string;
  detail: string;
  level: number;
  maxLevel: number;
  cost: number;
  maxed: boolean;
  canBuy: boolean;
}

export interface RosterEntry { className: string; label: string; owned: boolean; active: boolean; note: string }

export interface TempleSnapshot { valid: boolean; essence: number; items: TempleItem[]; roster: RosterEntry[] }

export interface RunManagerOptions {
  /** tol.EnemyMult (float cvar, shipped 1.3). */
  enemyMult: number;
  /** tol.CastTimes 1 (shipped). */
  castTimes: boolean;
  /** The game's start (director, Nov 21): the Priestess is owned from the start and there is no rescue. Off for the Unreal parity rules. */
  priestFromStart: boolean;
  /** Found gear waits for the player to choose the hero (director, Nov 21). Off gives it to a random hero (soaks, parity rules). */
  gearChoice: boolean;
}

export const makeRunManagerOptions = (over: Partial<RunManagerOptions> = {}): RunManagerOptions => ({ enemyMult: 1.3, castTimes: true, priestFromStart: false, gearChoice: false, ...over });

/** The test setup of the next playable run (one shot): start floor and the Priest already in the party (tol.NextRun). */
export interface NextRunSetup { startFloor: number; priest: boolean }

const kAutoFirstStepDelay = 0.25;   // seconds before the first Auto step after the button
const kMaxStepsPerFrame = 128;
const kTempleClasses = ['Warrior', 'Mage'];   // the classes the Temple sells gear for (as in Unreal)
const kTempleLuck = ['EssencePerKill', 'EssencePerRoom', 'GoldPerRoom'];
const kHeroes = kHeroOrder;

interface Timer { at: number; fn: () => void }

export class RunManager {
  // ---- run layer ----
  private flow = new RunFlow();
  private stats = new RunStats();
  private floorSize: FloorSize | undefined;
  private meta: MetaSave = makeMeta();
  private metaLoaded = false;
  private bot: RunBot | undefined;
  private auto = false;
  private paused = false;
  private inFirstFight = true;
  private transitioning = false;
  private transitionSerial = 0;
  private hook: TransitionHook | undefined;
  private playSpeed = 1;   // Params.Speed: walk pace and Auto step delay (the combat speed is the HUD's)
  private nextRun: NextRunSetup = { startFloor: 1, priest: false };
  private listeners: ((c: RunChange) => void)[] = [];
  private clock = 0;   // unscaled seconds (world time for the timers)
  private stepTimer: Timer | undefined;
  lastGearDropText = '';
  lastGearDropTime = -100;

  // ---- combat manager ----
  private sim: CombatSim | undefined;
  private accumulator = 0;
  private combatSpeed = 1;
  private finishHandled = true;
  private staged = false;
  private entryDoor = -1;
  /** Bumped whenever unit ids are reused (new sim, PrepareNextFight): the view keys enemy visuals by (serial, id). */
  fightSerial = 0;
  /** Dead party units whose body is hidden until a revive (DespawnDeadParty). */
  readonly despawnedParty = new Set<string>();
  /** Heroes given Divine Shield between fights: the shield is kept through PrepareNextFight and starts with the next fight. */
  private readonly heldShields = new Set<string>();
  /** The latest run save (runSave.ts), taken at the last safe moment; undefined with no run. */
  private runSaveText: string | undefined;
  /** ClearNonPartyActors ran: the finished fight's enemy bodies stay behind in the room the party left. */
  bodiesCleared = false;
  /** The sim the kill payout listens to. */
  private killSubSim: CombatSim | undefined;

  constructor(private readonly data: CombatData, private readonly store: MetaStore, readonly opts: RunManagerOptions = makeRunManagerOptions()) {}

  // ------------------------------------------------------------------------------------------ events and accessors
  onChange(fn: (c: RunChange) => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }

  private notify(c: RunChange): void {
    if (c === RunChange.RunStarted || c === RunChange.RunEnded || c === RunChange.FloorChanged) this.cancelTransition();
    for (const fn of [...this.listeners]) fn(c);
  }

  getFlow(): RunFlow { return this.flow; }
  getMeta(): MetaSave { this.ensureMetaLoaded(); return this.meta; }
  getSim(): CombatSim | undefined { return this.sim; }
  isAuto(): boolean { return this.auto; }
  isPaused(): boolean { return this.paused; }
  isTransitioning(): boolean { return this.transitioning; }
  isStaged(): boolean { return this.staged; }
  getPartyEntry(): number { return this.entryDoor; }
  time(): number { return this.clock; }
  setTransitionHook(h: TransitionHook | undefined): void { this.hook = h; }
  setPaused(p: boolean): void { this.paused = p; }
  setCombatSpeed(s: number): void { this.combatSpeed = Math.min(64, Math.max(0, s)); }
  getPlaySpeed(): number { return this.playSpeed; }
  armNextRun(startFloor: number, priest: boolean): void { this.nextRun = { startFloor: Math.max(1, startFloor), priest }; }

  // ------------------------------------------------------------------------------------------ meta
  private ensureMetaLoaded(): void {
    if (this.metaLoaded) return;
    this.metaLoaded = true;
    this.meta = makeMeta();
    const text = this.store.load();
    if (text === undefined) return;
    const parsed = parseMeta(text);
    if (!parsed.ok) {
      this.store.keepCorrupt?.(text);
      return;
    }
    this.meta = parsed.meta;
  }

  private saveMeta(): void { this.store.save(serializeMeta(this.meta)); }

  /** Saves a settings change (volume, default speed) made directly on getMeta(). */
  saveSettings(): void { this.ensureMetaLoaded(); this.saveMeta(); }

  /** Found gear still waiting for the player to pick a hero (empty unless the gearChoice option is on). */
  getPendingGear(): readonly PendingGear[] { return this.flow.getPendingGear(); }
  /** The player gives the oldest pending piece of gear to `className`. */
  assignPendingGear(className: string): boolean {
    if (!this.flow.assignGear(0, className)) return false;
    this.syncMeta();
    return true;
  }

  private syncMeta(): void {
    // Auto does not stop to ask: it gives each piece to the hero the old random roll picked.
    if (this.auto) for (let p = this.flow.getPendingGear()[0]; p; p = this.flow.getPendingGear()[0]) if (!this.flow.assignGear(0, p.suggested)) break;
    let changed = false;
    const gold = this.flow.consumeGoldDelta();
    if (gold !== 0) {
      this.meta.gold = Math.min(kMetaMaxGold, this.meta.gold + gold);
      changed = true;
    }
    if (this.flow.consumePriestUnlock() && !this.meta.priestUnlocked) {
      this.meta.priestUnlocked = true;
      if (activeParty(this.meta).length < kActiveSlots) toggleActiveHero(this.meta, rosterPriestClass());
      changed = true;
    }
    const floor = this.flow.getRun().floorNumber;
    if (floor > this.meta.bestFloor) {
      this.meta.bestFloor = floor;
      changed = true;
    }
    if (changed) this.saveMeta();
    const drops = this.flow.consumeGearDrops();
    if (drops.length > 0) {
      for (const d of drops) {
        const weapon = d.slot === GearSlot.Weapon;
        this.lastGearDropText = `Found: ${d.className} ${weapon ? 'weapon' : 'armor'} +${d.dungeonLevel} (${weapon ? 'Damage' : 'Health'} +10%)`;
        this.lastGearDropTime = this.clock;
      }
      this.pushEssenceToSim();
      this.notify(RunChange.EssenceChanged);
    }
  }

  private applyMetaToFlow(flow: RunFlow = this.flow): void {
    flow.setEssenceContext(this.meta.unlockedStats, new Map());
    flow.setTempleLevels(this.meta.statLevels);
    flow.setPartyLuck({
      essencePerKill: partyLuckBonus(this.meta, 'EssencePerKill'),
      essencePerRoom: partyLuckBonus(this.meta, 'EssencePerRoom'),
      goldPerKill: partyLuckBonus(this.meta, 'GoldPerKill'),
      goldPerRoom: partyLuckBonus(this.meta, 'GoldPerRoom'),
    });
  }

  /** Testing builds: the size of floors built from now on (the current floor keeps its layout). */
  setFloorSize(s: FloorSize): void {
    this.floorSize = normalizeFloorSize(s);
    this.flow.setFloorSize(this.floorSize);
  }

  /** Gives this save the Priestess, in the party if a slot is free. Never during a run: an older saved run keeps the rules it began with. */
  grantStartingPriest(): void {
    if (!this.opts.priestFromStart || this.flow.active()) return;
    this.ensureMetaLoaded();
    if (this.meta.priestUnlocked) return;
    this.meta.priestUnlocked = true;
    if (!activeParty(this.meta).includes(rosterPriestClass()) && activeParty(this.meta).length < kActiveSlots) toggleActiveHero(this.meta, rosterPriestClass());
    this.saveMeta();
  }

  private flowStart(seed: number, testSetup: boolean): void {
    this.flow = new RunFlow();
    this.stats.reset();
    this.flow.setGearChoice(this.opts.gearChoice);
    if (this.floorSize) this.flow.setFloorSize(this.floorSize);
    this.ensureMetaLoaded();
    this.grantStartingPriest();
    if (this.opts.priestFromStart) this.flow.setPriestStart(this.meta.bestFloor < 2);
    this.applyMetaToFlow();
    this.flow.setStartParty(activeParty(this.meta));
    this.flow.setPriestOwned(this.meta.priestUnlocked);
    const priest = testSetup && this.nextRun.priest;
    const startFloor = testSetup ? this.nextRun.startFloor : 1;
    if (testSetup) this.nextRun = { startFloor: 1, priest: false };
    this.flow.start(seed, priest, startFloor);
  }

  private pushEssenceToSim(): void {
    if (!this.sim) return;
    applyEssenceToSim(this.sim, this.flow.getSidebar());
    applyGearToSim(this.sim, this.meta, this.flow.getDungeonGear());
  }

  // ------------------------------------------------------------------------------------------ the combat manager part
  private combatConfig(): CombatConfig {
    const cfg = defaultCombatConfig();
    cfg.enemyStatMult = Math.fround(this.opts.enemyMult);
    if (this.opts.castTimes) installShippedCastTimes(cfg);
    cfg.randomEnemySpawn = true;
    return cfg;
  }

  private setPartyEntry(door: number): void {
    this.entryDoor = door;
    this.sim?.setPartyEntry(door);
  }

  private beginFight(): void {
    const sim = this.sim!;
    this.staged = false;
    sim.startFight();
    this.trackStats(sim);
    this.heldShields.clear();   // held shields now tick down in this fight
    this.accumulator = 0;
    this.finishHandled = false;
    this.bodiesCleared = false;
    this.subscribeKills();
  }

  /** Feeds the Expedition Report: damage dealt and taken, filed under the room the party is in. */
  private trackStats(sim: CombatSim): void {
    for (const u of sim.getUnits()) if (!u.enemy && !u.summon && !u.removed) this.stats.noteHero(u.name);
    this.stats.attach(sim, this.data, () => {
      const run = this.flow.getRun();
      const node = run.floor.nodes[run.currentNode];
      return { floor: run.floorNumber, node: run.currentNode, type: node ? roomTypeName(node.type) : '?' };
    });
  }

  private subscribeKills(): void {
    if (!this.sim || this.killSubSim === this.sim) return;
    this.killSubSim = this.sim;
    // Kills are paid from the combat bus (the sim, and so its bus, is new after a first fight).
    this.sim.getBus().subscribe('EnemyKilled', () => {
      if (!this.flow.active() || !this.flow.fightPending()) return;
      this.flow.onEnemyKilled();
      this.notify(RunChange.EssenceChanged);
    });
  }

  private prepareNextFight(): void {
    if (!this.sim || this.sim.getState() === FightState.Running) return;
    const held = new Map<string, number>();
    for (const u of this.sim.getUnits()) if (this.heldShields.has(u.name) && !u.enemy && !u.summon && u.alive) held.set(u.name, u.shieldLeft);
    this.sim.prepareNextFight();
    for (const u of this.sim.getUnits()) {
      const s = held.get(u.name);
      if (s !== undefined && !u.enemy && !u.summon) u.shieldLeft = s;
    }
    ++this.fightSerial;
  }

  private addWave(spec: { hasWave: boolean; waveAtSeconds: number; waveEnemies: string[]; floor: number }): void {
    if (spec.hasWave) this.sim!.scheduleWave(Math.fround(spec.waveAtSeconds), spec.waveEnemies, spec.floor);
  }

  /** The living party with the spot each takes at the start of the next fight (GetPartyActors), keyed by class name. */
  partyFormation(): { name: string; x: number; y: number }[] {
    const out: { name: string; x: number; y: number }[] = [];
    if (!this.sim) return out;
    let slot = 0;   // every party unit counts, the fallen included, so the spots match PrepareNextFight
    for (const u of this.sim.getUnits()) {
      if (u.enemy || u.summon || u.removed) continue;
      const s = slot++;
      if (!u.alive) continue;
      const p = this.sim.partySlotPosition(s);
      out.push({ name: u.name, x: p.x, y: p.y });
    }
    return out;
  }

  /** The walk ended: the party stands where the view put it (CommitPartyPositions). */
  commitPartyPositions(pos: ReadonlyMap<string, { x: number; y: number }>): void {
    if (!this.sim) return;
    for (const u of this.sim.getUnits()) {
      if (u.enemy || u.summon || u.removed) continue;
      const p = pos.get(u.name);
      if (p) { u.x = p.x; u.y = p.y; }
    }
  }

  /** The party walked out of the room: the finished fight's bodies stay there (ClearNonPartyActors). */
  clearNonPartyActors(): void {
    if (!this.sim || this.staged) return;
    this.bodiesCleared = true;
  }

  private despawnDeadParty(): void {
    if (!this.sim) return;
    for (const u of this.sim.getUnits()) if (!u.enemy && !u.summon && !u.removed && !u.alive) this.despawnedParty.add(u.name);
  }

  /** Whether the view should draw this unit's body. */
  unitShown(u: Unit): boolean {
    if (u.removed) return false;
    if (!u.enemy && !u.summon) {
      if (this.despawnedParty.has(u.name)) {
        if (!u.alive) return false;
        this.despawnedParty.delete(u.name);   // revived: shown again
      }
      return true;
    }
    if (this.bodiesCleared && this.sim?.finished()) return false;
    return true;
  }

  /** Advances the game by dt real seconds: the Unreal timers, then the fight at the fixed step. */
  tick(dt: number): void {
    this.clock += dt;
    if (this.stepTimer && this.clock >= this.stepTimer.at) {
      const t = this.stepTimer;
      this.stepTimer = undefined;
      t.fn();
    }
    const sim = this.sim;
    if (!sim || this.staged || sim.getState() !== FightState.Running) {
      if (sim && sim.finished() && !this.finishHandled) this.finishFight();
      return;
    }
    const step = sim.config().dt;
    this.accumulator += dt * this.combatSpeed;
    let steps = 0;
    while (this.accumulator >= step && steps < kMaxStepsPerFrame && !sim.finished()) {
      sim.step();
      this.accumulator -= step;
      ++steps;
    }
    if (this.accumulator >= step) this.accumulator = 0;
    if (sim.finished()) this.finishFight();
  }

  private finishFight(): void {
    if (this.finishHandled || !this.sim) return;
    this.finishHandled = true;
    const st = this.sim.getState();
    this.handleFightFinished(st === FightState.Won ? FightResult.Won : st === FightState.TimedOut ? FightResult.TimedOut : FightResult.Wiped);
  }

  // ------------------------------------------------------------------------------------------ playable run
  /** StartRunWithFights: a fresh run with the active party from the meta; the start room's fight begins at once. Auto off. */
  startRunWithFights(seed = 0): boolean {
    this.stopTimers();
    this.ensureMetaLoaded();
    this.playSpeed = Math.max(1, this.meta.defaultSpeed);
    if (seed === 0) seed = randomSeed();
    this.flowStart(seed, true);
    this.bot = new RunBot(seed);
    this.inFirstFight = true;
    this.auto = false;
    this.despawnedParty.clear();
    this.heldShields.clear();
    this.syncMeta();
    this.notify(RunChange.RunStarted);
    this.notify(RunChange.MapChanged);
    const started = this.startPendingFight();
    // The run's first save: the start room's fight is pending again on a resume, the party at full health (no units saved).
    this.takeRunSave(false);
    return started;
  }

  // ------------------------------------------------------------------------------------------ run saves (director, Nov 19)
  /** The latest run save text (write it to storage on RunChange.RunSaved); undefined when no run is in progress. */
  getRunSave(): string | undefined { return this.runSaveText; }

  /** Saves the run as it stands. Only called at safe moments: run or floor start, a room entered without a fight, a fight won. */
  private takeRunSave(withUnits: boolean): void {
    if (!this.flow.active()) return;
    const units = [];
    if (withUnits && this.sim) {
      for (const u of this.sim.getUnits()) if (!u.enemy && !u.summon && !u.removed) units.push({ name: u.name, hp: u.hp, alive: u.alive });
    }
    const gauge = withUnits && this.sim ? this.sim.getGauge().value() : 0;
    this.runSaveText = serializeRunSave({ flow: this.flow.checkpoint(), units, gauge });
    this.notify(RunChange.RunSaved);
  }

  /** Continues a saved run (Continue on the title screen). The floor is rebuilt from the seed; the party stands in the room it was
   *  saved in, with the health it had; a fight room that was not cleared starts its fight. Returns false for a damaged save. */
  resumeRun(text: string | undefined): boolean {
    const cp = parseRunSave(text);
    if (!cp) return false;
    this.stopTimers();
    this.cancelTransition();
    this.ensureMetaLoaded();
    this.playSpeed = Math.max(1, this.meta.defaultSpeed);
    const flow = new RunFlow();
    flow.setGearChoice(this.opts.gearChoice);
    if (this.floorSize) flow.setFloorSize(this.floorSize);
    this.flow = flow;
    this.stats.reset();   // a resumed run starts its report afresh
    this.applyMetaToFlow();
    flow.setPriestOwned(this.meta.priestUnlocked);
    if (!flow.restore(cp.flow)) {
      this.flow = new RunFlow();
      return false;
    }
    this.bot = new RunBot(Number(cp.flow.seed % 2n ** 52n) || 1);
    this.auto = false;
    this.inFirstFight = false;
    this.despawnedParty.clear();
    this.heldShields.clear();
    // A fresh sim with the party standing in the room (no fight yet), as the first fight would make it.
    const sim = new CombatSim(this.data, (cp.flow.seed ^ 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn, this.combatConfig());
    this.entryDoor = -1;
    sim.setPartyEntry(-1);
    for (const c of flow.getRun().party) sim.addPartyUnit(c);
    this.sim = sim;
    ++this.fightSerial;
    this.staged = false;
    this.finishHandled = true;
    this.pushEssenceToSim();
    for (const u of sim.getUnits()) {
      if (u.enemy || u.summon) continue;
      const s = cp.units.find((x) => x.name === u.name);
      if (!s) continue;
      if (s.alive) {
        u.hp = Math.max(1, s.hp);
      } else {
        u.hp = 0;
        u.alive = false;
        this.despawnedParty.add(u.name);
      }
    }
    sim.getGauge().restore(cp.gauge);
    this.runSaveText = text;
    this.syncMeta();
    this.notify(RunChange.RunStarted);
    this.notify(RunChange.MapChanged);
    if (flow.fightPending()) this.startPendingFight();
    return true;
  }

  private stopTimers(): void { this.stepTimer = undefined; }

  private canMoveManually(): boolean {
    if (!this.flow.active() || this.transitioning || this.flow.fightPending()) return false;
    if (this.auto) this.setAuto(false);   // manual movement overrides Auto
    return true;
  }

  moveDirection(dir: Dir): boolean {
    if (!this.canMoveManually()) return false;
    const from = this.flow.currentNode();
    const entry = this.flow.moveDirection(dir);
    if (entry.kind === EntryKind.Rejected) return false;
    this.enterRoomWalking(entry, from, [this.flow.currentNode()]);
    return true;
  }

  moveToRoom(room: number): boolean {
    if (!this.canMoveManually()) return false;
    const from = this.flow.currentNode();
    const r = this.flow.moveToRoom(room);
    if (!r.accepted || r.walked.length === 0) return false;
    this.enterRoomWalking(r.last, from, [...r.walked]);
    return true;
  }

  teleportRefusal(): string { return this.flow.teleportRefusal(); }

  teleportUp(): boolean {
    if (!this.canMoveManually()) return false;
    if (this.flow.teleportRefusal() !== '') return false;
    return this.doTeleport();
  }

  abandonRun(): void {
    if (!this.flow.active()) return;
    this.stopTimers();
    this.flow.abandon();
    this.finishRun();
  }

  setAuto(on: boolean): void {
    if (on) {
      if (!this.flow.active() || this.auto) return;
      this.auto = true;
      if (!this.bot) this.bot = new RunBot(this.flow.getRun().seed);
      this.notify(RunChange.AutoChanged);
      if (!this.flow.fightPending()) this.scheduleStep(kAutoFirstStepDelay);
    } else if (this.auto) {
      this.auto = false;
      this.stepTimer = undefined;
      this.notify(RunChange.AutoChanged);
    }
  }

  private scheduleStep(delay: number): void {
    this.stepTimer = { at: this.clock + delay, fn: () => this.autoStepTimer() };
  }

  private autoStepTimer(): void {
    if (this.paused) {
      this.scheduleStep(0.2);
      return;
    }
    if (this.advanceStep()) this.scheduleStep(Math.min(2, Math.max(0.25, 2 / this.playSpeed)));
  }

  private advanceStep(): boolean {
    if (!this.auto || !this.flow.active() || !this.bot) return false;
    if (this.transitioning) return true;   // still walking in: look again after the next delay
    if (this.flow.fightPending()) {
      this.startPendingFight();
      return false;
    }
    // Nov 14: the Auto button never spends Gold (buying upgrades stays the player's input); only the soak bot does.
    const choice = this.bot.choose(this.flow, this.sim ? partyHpFraction(this.sim) : 1.0);
    if (choice.teleport) {
      // Unreal returns false here and waits for the new floor's start-room fight to schedule the next step. A start room with an
      // empty pack has no fight, so Unreal's Auto stalled there; keep stepping when no fight is pending (fix noted in the Stage 4 report).
      return this.doTeleport() && this.flow.active() && !this.flow.fightPending();
    }
    if (choice.node < 0) {
      this.flow.abandon();
      this.finishRun();
      return false;
    }
    const from = this.flow.currentNode();
    const entry = this.flow.travel(choice.node);
    if (entry.kind === EntryKind.Rejected) return false;
    this.enterRoomWalking(entry, from, [choice.node]);
    return entry.kind !== EntryKind.Fight;
  }

  private cancelTransition(): void {
    if (!this.transitioning) return;
    ++this.transitionSerial;
    this.transitioning = false;
    this.hook?.cancel();
  }

  private enterRoomWalking(entry: RoomEntry, fromNode: number, path: number[]): void {
    if (path.length === 0 || entry.kind === EntryKind.Rejected) {
      this.handleEntry(entry);
      return;
    }
    const f = this.flow.currentFloor();
    const steps: WalkStep[] = [];
    let from = fromNode;
    for (const to of path) {
      let dir = -1;
      if (from >= 0 && from < f.nodes.length) for (let d = 0; d < 4; ++d) if (f.nodes[from].door[d] === to) { dir = d; break; }
      if (dir < 0) {
        this.handleEntry(entry);
        return;
      }
      steps.push({ dir: dir as Dir, fromNode: from, toNode: to });
      from = to;
    }
    // The party came in through the door opposite to the way it walked: that is where it rallies.
    this.setPartyEntry((steps[steps.length - 1].dir + 2) % 4);
    if (!this.hook) {
      this.handleEntry(entry);
      return;
    }
    const id = ++this.transitionSerial;
    this.transitioning = true;
    const scale = Math.min(2.5, Math.max(1, this.playSpeed));
    this.hook.play(steps, scale, () => {
      if (id !== this.transitionSerial) return;
      this.transitioning = false;
      if (!this.flow.active()) return;
      this.handleEntry(entry);
    });
    // The room's enemies already stand in it while the party walks over (the fight starts when the walk ends).
    if (this.transitioning && id === this.transitionSerial && entry.kind === EntryKind.Fight) this.stageNextFight();
  }

  private stageNextFight(): boolean {
    const sim = this.sim;
    if (!sim || this.inFirstFight || !this.flow.fightPending() || this.staged) return false;
    const spec = this.flow.pendingFightSpec();
    if (spec.joinClass !== '') return false;   // the rescue Priest joins as the fight starts: the old way
    if (sim.getState() === FightState.Running || sim.getState() === FightState.NotStarted) return false;
    this.staged = true;
    this.prepareNextFight();
    this.bodiesCleared = false;
    for (const e of spec.enemies) sim.addEnemy(e, spec.floor);
    this.addWave(spec);
    return true;
  }

  private startPendingFight(): boolean {
    if (!this.flow.fightPending()) return false;
    const spec = this.flow.pendingFightSpec();
    if (this.inFirstFight || !this.sim) {
      const sim = new CombatSim(this.data, spec.seed, this.combatConfig());
      this.entryDoor = -1;   // a new run starts at the default rally point
      sim.setPartyEntry(-1);
      for (const c of this.flow.getRun().party) {
        if (spec.isRescue && c === spec.joinClass) continue;
        sim.addPartyUnit(c);
      }
      for (const e of spec.enemies) sim.addEnemy(e, spec.floor);
      this.sim = sim;
      ++this.fightSerial;
      this.despawnedParty.clear();
      this.staged = false;
      this.addWave(spec);
      this.beginFight();
      this.inFirstFight = false;
    } else {
      const sim = this.sim;
      if (this.staged) {
        this.beginFight();
      } else {
        if (spec.joinClass !== '') {
          this.prepareNextFight();
          if (sim.addRescuedUnit(spec.joinClass) === kNoUnit) return false;
        }
        if (sim.getState() === FightState.Running) return false;
        if (sim.getState() !== FightState.NotStarted) this.prepareNextFight();
        for (const e of spec.enemies) sim.addEnemy(e, spec.floor);
        this.addWave(spec);
        this.beginFight();
      }
    }
    this.pushEssenceToSim();   // ranks apply at the start of every fight (a character that just joined has zero ranks)
    this.notify(RunChange.FightStarted);
    return true;
  }

  private handleEntry(entry: RoomEntry): void {
    this.syncMeta();
    if (entry.kind === EntryKind.Rejected) return;
    this.notify(RunChange.RoomChanged);
    this.notify(RunChange.MapChanged);
    switch (entry.kind) {
      case EntryKind.Fight:
        this.startPendingFight();
        break;
      case EntryKind.Exit:
        // Boss Exit room: everyone fallen is revived at 20% and jumps to a party slot of the room.
        if (this.sim) {
          const fallen = new Set<UnitId>();
          for (const u of this.sim.getUnits()) if (!u.enemy && !u.summon && !u.removed && !u.alive) fallen.add(u.id);
          exitRoomRevive(this.sim);
          let slot = 0;
          for (const u of this.sim.getUnits()) {
            if (u.enemy || u.summon || u.removed) continue;
            const s = slot++;
            if (!u.alive || !fallen.has(u.id)) continue;
            const p = this.sim.partySlotPosition(s);
            u.x = p.x;
            u.y = p.y;
            this.despawnedParty.delete(u.name);
          }
        }
        this.notify(RunChange.MapChanged);
        break;
      default:
        break;
    }
    if (entry.kind !== EntryKind.Fight) this.takeRunSave(true);
  }

  private doTeleport(): boolean {
    const t = this.flow.teleport();
    if (t === TeleportResult.Rejected) return false;
    if (!this.flow.active()) {
      this.finishRun();
      return true;
    }
    this.syncMeta();
    this.notify(RunChange.FloorChanged);
    this.notify(RunChange.RoomChanged);
    this.notify(RunChange.MapChanged);
    this.setPartyEntry(-1);   // the new floor's start room has no entry door
    this.takeRunSave(true);   // the floor's start: a resume starts this room's fight again
    this.startPendingFight();
    return true;
  }

  private handleFightFinished(result: FightResult): void {
    const sim = this.sim;
    if (!sim || !this.flow.active() || !this.flow.fightPending()) return;
    const spec = this.flow.pendingFightSpec();
    const won = result === FightResult.Won;
    let cause = '';
    let killer = '';
    if (won) {
      if (spec.room !== RoomType.Boss) {
        if (sim.postWinRevive() === 0) this.despawnDeadParty();
      }
    } else {
      const fd = sim.getFirstDeath();
      if (fd.valid) {
        cause = fd.text;
        const k = sim.getUnit(fd.killer);
        if (k) killer = k.name;
      }
    }
    this.flow.onFightFinished(result, cause, killer);
    this.syncMeta();
    this.notify(RunChange.FightFinished);
    this.notify(RunChange.EssenceChanged);
    this.notify(RunChange.MapChanged);
    if (!this.flow.active()) {
      this.finishRun();
      return;
    }
    this.takeRunSave(true);
    if (this.auto) this.scheduleStep(Math.min(2, Math.max(0.25, 2 / this.playSpeed)));
  }

  private finishRun(): void {
    const r = this.flow.getResults();
    if (r.floorReached > this.meta.bestFloor) this.meta.bestFloor = r.floorReached;
    this.saveMeta();
    this.runSaveText = undefined;   // an ended run has nothing to continue
    this.notify(RunChange.RunSaved);
    this.notify(RunChange.RunEnded);
    if (this.auto) {
      this.auto = false;
      this.stepTimer = undefined;
      this.notify(RunChange.AutoChanged);
    }
  }

  // ------------------------------------------------------------------------------------------ snapshots
  getFloorSnapshot(): FloorSnapshot {
    const v = buildMapView(this.flow);
    const results = this.getRunResults();
    return {
      ...v,
      auto: this.auto,
      teleportRefusal: v.runActive ? this.flow.teleportRefusal() : '',
      runEnded: results.valid,
      results,
    };
  }

  getRunResults(): RunResultsView {
    const r: RunResults = this.flow.getResults();
    const out: RunResultsView = {
      valid: false, victory: false, outcome: '', floorReached: 0, essenceEarned: 0, goldEarned: 0, seed: 0n, causeOfDeath: '', killerName: '',
      priestRescued: false, kills: 0, roomsCleared: 0, bestFloor: 0, damage: { total: 0, heroes: [] }, rooms: [],
    };
    if (this.flow.active() || r.outcome === RunOutcome.InProgress) return out;
    return {
      valid: true, victory: r.outcome === RunOutcome.Victory, outcome: runOutcomeName(r.outcome), floorReached: r.floorReached,
      essenceEarned: r.essenceEarned, goldEarned: r.goldEarned, seed: BigInt(r.seed), causeOfDeath: r.causeOfDeath, killerName: r.killerName,
      priestRescued: r.priestRescued, kills: r.kills, roomsCleared: r.roomsCleared, bestFloor: this.meta.bestFloor,
      damage: this.stats.damageReport(), rooms: this.stats.roomReport(),
    };
  }

  getSidebarSnapshot(ch: number): SidebarSnapshot {
    const sb = this.flow.getSidebar();
    const s: SidebarSnapshot = {
      valid: false, characterIndex: ch, characterName: '', weaponLevel: 0, armorLevel: 0, weaponDrops: 0, armorDrops: 0,
      essence: this.flow.getRun().essence, rows: [], party: [], appliesToRunningFight: kEssenceAppliesToRunningFight,
    };
    if (!this.flow.active() || !sb.hasCharacter(ch)) return s;
    s.valid = true;
    const cls = sb.className(ch);
    s.characterName = cls;
    s.weaponLevel = gearLevel(this.meta, this.flow.getDungeonGear(), cls, GearSlot.Weapon);
    s.armorLevel = gearLevel(this.meta, this.flow.getDungeonGear(), cls, GearSlot.Armor);
    s.weaponDrops = s.weaponLevel - gearTempleLevel(this.meta, cls, GearSlot.Weapon);
    s.armorDrops = s.armorLevel - gearTempleLevel(this.meta, cls, GearSlot.Armor);
    for (const r of sb.rows(ch, this.flow.getRun().essence)) {
      if (!r.unlocked) continue;   // locked stats are bought at the Temple first
      const row: SidebarRowView = {
        stat: r.stat, tier: r.tier, rank: r.rank, maxRank: r.maxRank, nextCost: r.nextCost, currentBonus: r.currentBonus,
        nextBonus: r.nextBonus, unit: r.unit, showValue: false, valueNow: 0, valueNext: 0, unlocked: r.unlocked, canBuy: r.canBuy,
        refusal: r.refusal, reason: r.reason,
      };
      if (r.showValue && this.sim) {
        const def = sb.config().find(r.stat);
        if (def) {
          for (const u of this.sim.getUnits()) {
            if (u.enemy || u.summon || u.removed || u.name !== cls) continue;
            const next = u.stats.clone();
            next.addModifier(def.stat, ModKind.Percent, def.bonusPerRank, ModSource.Essence);
            row.showValue = true;
            row.valueNow = u.stats.get(def.stat);
            row.valueNext = r.rank >= r.maxRank ? row.valueNow : next.get(def.stat);
            break;
          }
        }
      }
      s.rows.push(row);
    }
    const units: Unit[] = [];
    if (this.sim) for (const u of this.sim.getUnits()) if (!u.enemy && !u.summon && !u.removed) units.push(u);
    const party = this.flow.getRun().party;
    for (let i = 0; i < party.length; ++i) {
      const p: PartyMemberView = { index: i, name: party[i], className: party[i], currentHp: 0, maxHp: 0, alive: true, totalRanks: 0 };
      for (const d of sb.config().stats) p.totalRanks += sb.rank(i, d.name);
      if (this.sim && i < units.length) {
        const u = units[i];
        p.currentHp = u.alive ? u.hp : 0;
        p.maxHp = this.sim.maxHp(u);
        p.alive = u.alive;
      }
      s.party.push(p);
    }
    return s;
  }

  buyStat(ch: number, stat: string, amount: number): BuyResult {
    const r = this.flow.buyEssence(ch, stat, amount);
    if (r.bought > 0) {
      this.pushEssenceToSim();
      this.notify(RunChange.EssenceChanged);
    }
    return r;
  }

  /** What buying `amount` would do; `essence` overrides the run's Essence (pass Infinity for the full price regardless of what is affordable). */
  previewBuy(ch: number, stat: string, amount: number, essence?: number): BuyResult {
    if (!this.flow.active()) return { bought: 0, spent: 0, newRank: 0, refusal: BuyRefusal.NoCharacter, reason: 'No run in progress' };
    return this.flow.getSidebar().preview(ch, stat, amount, essence ?? this.flow.getRun().essence);
  }

  // ------------------------------------------------------------------------------------------ miracles (the HUD calls these)
  /** Whether the HUD may offer this miracle now: a live run, the gauge can pay, and a fight is running or (Healing, Shield) the party is between fights. */
  miracleReady(kind: MiracleKind): boolean {
    const sim = this.sim;
    return !!sim && this.flow.active() && sim.miracleWindowOpen(kind, true) && sim.getGauge().canAfford(kind);
  }

  castMiracle(kind: MiracleKind, target: UnitId): { result: MiracleResult; on: UnitId } {
    if (!this.sim) return { result: MiracleResult.FightNotRunning, on: kNoUnit };
    const on = { id: kNoUnit };
    const between = this.sim.getState() !== FightState.Running;
    const result = this.sim.castMiracle(kind, target, on, this.flow.active());
    if (result === MiracleResult.Cast && between && kind === MiracleKind.DivineShield) {
      const u = this.sim.getUnit(on.id);
      if (u) this.heldShields.add(u.name);
    }
    return { result, on: on.id };
  }

  castSmiteAt(x: number, y: number): { result: MiracleResult; hit: UnitId[] } {
    if (!this.sim) return { result: MiracleResult.FightNotRunning, hit: [] };
    const hit: UnitId[] = [];
    return { result: this.sim.castSmiteAt(x, y, hit), hit };
  }

  // ------------------------------------------------------------------------------------------ Temple and party picker
  getTempleSnapshot(amount = 1): TempleSnapshot {
    this.ensureMetaLoaded();
    const m = this.meta;
    const s: TempleSnapshot = { valid: false, essence: m.gold, items: [], roster: [] };
    if (this.flow.active()) return s;
    s.valid = true;
    for (const hero of kHeroes) {
      const owned = rosterOwns(m, hero);
      s.roster.push({
        className: hero, label: hero === 'Priest' ? 'Priestess' : hero, owned, active: owned && rosterIsActive(m, hero),
        note: owned ? '' : 'Rescue her on floor 2',
      });
    }
    const cfg = defaultTempleConfig();
    for (const cls of kTempleClasses) {
      for (let slot = 0; slot < kGearSlotCount; ++slot) {
        const weapon = slot === 0;
        const level = gearTempleLevel(m, cls, weapon ? GearSlot.Weapon : GearSlot.Armor);
        const cost = gearNextCost(cfg, level);
        s.items.push({
          column: 0, id: `Gear:${cls}:${slot}`, label: `${cls} ${weapon ? 'weapon' : 'armor'}`,
          detail: `${weapon ? 'Damage' : 'Health'} +${Math.round(cfg.gearBonusPerLevel * 100)}% per level`, level, maxLevel: kGearMaxTempleLevel,
          maxed: cost < 0, cost: Math.max(0, cost), canBuy: cost >= 0 && m.gold >= cost,
        });
      }
    }
    for (const def of shippedEssenceConfig().stats) {
      const unlocked = def.tier === 0 || statUnlocked(m, def.name);
      const name = templeStatLabel(def.name);
      if (!unlocked) {
        s.items.push({
          column: 1, id: `Stat:${def.name}`, label: `Unlock ${name}`, detail: `Then buyable with Essence for ${statClassesText(def)}`,
          maxLevel: 1, level: 0, cost: cfg.statUnlockCost, maxed: false, canBuy: m.gold >= cfg.statUnlockCost,
        });
        continue;
      }
      const level = statTempleLevel(m, def.name);
      const cost = statNextCost(def, level);
      const per = def.unit === '' ? formatBonus(def.bonusPerRank).slice(1) : formatRawBonus(def.bonusPerRank, def.unit).slice(1);
      const it: TempleItem = {
        column: 1, id: `Level:${def.name}`, label: name, detail: `+${per} per rank, ${statClassesText(def)}`, level, maxLevel: def.maxRank,
        maxed: cost < 0, cost: Math.max(0, cost), canBuy: cost >= 0 && m.gold >= cost,
      };
      if (it.canBuy && amount !== 1) {
        let sum = 0;
        let n = 0;
        for (let rank = level; rank < def.maxRank && (amount < 0 || n < amount); ++rank, ++n) sum += statNextCost(def, rank);
        if (amount > 0) {
          it.cost = Math.min(sum, 2147483647);
          it.canBuy = n > 0 && sum <= m.gold;
        }
      }
      s.items.push(it);
    }
    for (const luck of kTempleLuck) {
      const level = partyLuckRank(m, luck);
      const cost = partyLuckNextCost(cfg, level);
      s.items.push({
        column: 2, id: `Luck:${luck}`, label: templeLuckLabel(luck), detail: `+${Math.round(cfg.partyLuckBonusPerRank * 100)}% per rank, up to +100%`,
        level, maxLevel: cfg.partyLuckMaxRank, maxed: cost < 0, cost: Math.max(0, cost), canBuy: cost >= 0 && m.gold >= cost,
      });
    }
    return s;
  }

  templeBuy(itemId: string, amount = 1): boolean {
    if (this.flow.active()) return false;
    this.ensureMetaLoaded();
    const parts = itemId.split(':');
    let ok = false;
    if (parts.length === 2 && parts[0] === 'Party') {
      const r = toggleActiveHero(this.meta, parts[1]);
      if (r !== RosterResult.Added && r !== RosterResult.Removed) return false;
      ok = true;
    } else if (parts.length === 3 && parts[0] === 'Gear') {
      ok = buyGear(this.meta, parts[1], parts[2] === '0' ? GearSlot.Weapon : GearSlot.Armor).ok;
    } else if (parts.length === 2 && parts[0] === 'Stat') {
      ok = buyStatUnlock(this.meta, parts[1]).ok;
    } else if (parts.length === 2 && parts[0] === 'Level') {
      const def = shippedEssenceConfig().find(parts[1]);
      if (def && (def.tier === 0 || statUnlocked(this.meta, def.name))) ok = buyStatRanks(this.meta, def, amount).ok;
    } else if (parts.length === 2 && parts[0] === 'Luck') {
      ok = buyPartyLuck(this.meta, parts[1]).ok;
    }
    if (!ok) return false;
    this.saveMeta();
    this.notify(RunChange.MetaChanged);
    return true;
  }

  /** Starts a new playable run (new random seed; the meta is kept). */
  startNewRun(seed = 0): boolean { return this.startRunWithFights(seed); }

  /** Testing builds: wipes all saved progress and starts a fresh run. */
  resetAllProgress(): boolean {
    this.ensureMetaLoaded();
    resetProgress(this.meta);
    this.saveMeta();
    this.notify(RunChange.MetaChanged);
    return this.startNewRun();
  }

  /** Save slots (Nov 19): the store now reads another slot, so read its progress again. Call with no run in progress. */
  reloadMeta(): void {
    this.metaLoaded = false;
    this.ensureMetaLoaded();
    this.runSaveText = undefined;
    this.notify(RunChange.MetaChanged);
  }

  // ------------------------------------------------------------------------------------------ Heroes screen (Nov 19)
  /** Every hero with its fight-start stats (class base + Temple blessings + Temple gear; no in-run Essence). Each hero is built as a
   *  party unit in a throwaway sim, through the same EssenceApply and GearApply calls a fight uses. */
  getHeroes(): HeroSheet[] {
    this.ensureMetaLoaded();
    const flow = new RunFlow();
    this.applyMetaToFlow(flow);
    const side = flow.getSidebar();
    const out: HeroSheet[] = [];
    for (const cls of kHeroOrder) {
      const row = this.data.findClassRow(cls);
      if (!row) continue;
      const sim = new CombatSim(this.data, 1, this.combatConfig());
      const id = sim.addPartyUnit(cls);
      side.reset([cls]);
      applyEssenceToSim(sim, side);
      applyGearToSim(sim, this.meta, new Map());
      const u = sim.getUnit(id);
      if (!u) continue;
      const roster = cls === rosterPriestClass() || cls === 'Warrior' || cls === 'Mage' || cls === 'Assassin';
      const owned = rosterOwns(this.meta, cls);
      out.push({
        className: cls, label: heroLabel(cls), role: roleLabel(row.RoleTag), owned, active: owned && rosterIsActive(this.meta, cls),
        note: owned ? '' : cls === rosterPriestClass() ? 'Rescue her on floor 2' : roster ? 'Not owned yet' : 'Cannot be recruited yet', // every hero is owned since Nov 21
        stats: heroStatLines(u.stats, (stat) => side.isUnlocked(stat)),
        skills: heroSkills(row),
      });
    }
    return out;
  }

  /** Sets the next expedition's party: 1 to 3 owned heroes, no repeats. Returns false (nothing changes) otherwise. */
  setParty(heroes: readonly string[]): boolean {
    if (this.flow.active()) return false;
    this.ensureMetaLoaded();
    if (heroes.length < 1 || heroes.length > kActiveSlots || new Set(heroes).size !== heroes.length) return false;
    if (!heroes.every((h) => rosterOwns(this.meta, h))) return false;
    this.meta.activeParty = [...heroes];
    this.saveMeta();
    this.notify(RunChange.MetaChanged);
    return true;
  }

  /** The next expedition's party in slot order (what the Heroes screen's party bar shows). */
  getParty(): string[] {
    this.ensureMetaLoaded();
    return activeParty(this.meta);
  }

  /** Auto Party: the owned heroes in role order (a tank, a healer, then damage), up to 3. */
  autoParty(): string[] {
    this.ensureMetaLoaded();
    const owned = kHeroOrder.filter((h) => rosterOwns(this.meta, h));
    const role = (h: string): number => rolePriority(this.data.findClassRow(h)?.RoleTag ?? '');
    const sorted = [...owned].sort((a, b) => role(a) - role(b) || kHeroOrder.indexOf(a as never) - kHeroOrder.indexOf(b as never));
    // One hero per role first (a tank, a healer, a ranged damage dealer), then whoever is left in the same order: with six heroes owned a
    // second tank or healer comes after the first of every role.
    const out: string[] = [];
    const roles = new Set<number>();
    for (const h of sorted) if (!roles.has(role(h))) { roles.add(role(h)); out.push(h); }
    for (const h of sorted) if (!out.includes(h)) out.push(h);
    return out.slice(0, kActiveSlots);
  }

  /** Testing builds: wipes all saved progress without starting a run (the Temple stays up). */
  resetProgressOnly(): void {
    this.ensureMetaLoaded();
    resetProgress(this.meta);
    this.saveMeta();
    this.notify(RunChange.MetaChanged);
  }

  // ------------------------------------------------------------------------------------------ debug
  debugGrantEssence(amount: number): void {
    this.flow.debugGrantEssence(amount);
    this.notify(RunChange.EssenceChanged);
  }

  debugKillPartyMember(className: string): boolean {
    const sim = this.sim;
    if (!sim) return false;
    for (const u of sim.getUnits()) {
      if (!u.enemy && !u.summon && !u.removed && u.alive && u.name === className) {
        u.hp = 0;
        u.alive = false;
        return true;
      }
    }
    return false;
  }
}

function statClassesText(d: EssenceStatDef): string {
  return d.classes.length === 0 ? 'every class' : d.classes.join(', ');
}

/** FMath::Rand-style seed for a new run (any positive integer below 2^53). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31) * 2654435761 % 9007199254740991 + 1;
}
