// RunFlow port (Core/RunFlow.h): the run state machine. Sits on RunState and the Floor Generator and knows nothing about
// combat: it hands out a FightSpec for each fight room, is told about kills and fight results, and answers the run rules
// (payouts, kill quota and crystal, movement and fog, Priest rescue on floor 2, boss floor 10, wipe / abandon / victory).
// The caller (runSim.ts, or the Phaser run scene) runs the fights. Pure rules code: no Phaser imports.
import { lround } from './cstd';
import { EssenceSidebar, BuyRefusal, type BuyResult } from './essenceSidebar';
import {
  EnemyType, RoomType, findPath, floorSeed, floorSizeOf, generate, kEnemyTypeCount, revealNode, withFloorSize,
  type Config, type Dir, type EnemyPack, type FloorSize, type Floor, type Node,
} from './floorGenerator';
import { padL } from './printf';
import { Rng, u64 } from './rng';
import { cloneRunConfig, defaultRunConfig, type RunConfig } from './runConfig';
import { endRun, makeRunState, nextFloor, startRun, type RunState } from './runState';
import { GearSlot, gearKey } from './temple';

export enum RunOutcome { InProgress, Wiped, Abandoned, Victory }
export function runOutcomeName(o: RunOutcome): string {
  switch (o) {
    case RunOutcome.InProgress: return 'IN PROGRESS';
    case RunOutcome.Wiped: return 'WIPED';
    case RunOutcome.Abandoned: return 'ABANDONED';
    case RunOutcome.Victory: return 'VICTORY';
  }
  return '?';
}

export enum FightResult { Won, Wiped, TimedOut }

export function roomTypeName(t: RoomType): string {
  switch (t) {
    case RoomType.Combat: return 'Combat';
    case RoomType.Elite: return 'Elite';
    case RoomType.Treasure: return 'Treasure';
    case RoomType.Rest: return 'Rest';
    case RoomType.Boss: return 'Boss';
    case RoomType.Exit: return 'Exit';
  }
  return '?';
}
/** The EnemyData.csv row names. */
export function enemyTypeName(t: EnemyType): string {
  switch (t) {
    case EnemyType.Grunt: return 'Grunt';
    case EnemyType.Brute: return 'Brute';
    case EnemyType.Archer: return 'Archer';
    case EnemyType.Shaman: return 'Shaman';
  }
  return '?';
}

/** RunFlow's part of a run save (save slots, Nov 19): everything start() and the rooms since have changed. The floor itself is not
 *  stored: it is generated again from the seed and floor number, then the fog and cleared rooms are put back. */
/** Saves from before floor sizes were tunable were all built at these sizes. */
const kOldSaveFloorSize: FloorSize = { min: 10, max: 20, tutorialMin: 5, tutorialMax: 8 };

export interface FlowCheckpoint {
  /** The size the current floor was built with, so a resume rebuilds the same floor whatever the setting is now. */
  floorSize?: FloorSize;
  /** Priestess-from-the-start runs: whether floor 1 is the small first floor. Absent in older saves, which keep the rescue rules. */
  priestStartTutorial?: boolean;
  seed: bigint;
  floorNumber: number;
  currentNode: number;
  party: string[];
  gold: number;
  essence: number;
  /** Visited and known (drawn) rooms, by node id. */
  revealed: number[];
  known: number[];
  cleared: number[];
  crystalFound: boolean;
  bossKilled: boolean;
  floorKills: number;
  runKills: number;
  roomsCleared: number;
  priestRescued: boolean;
  essenceEarned: number;
  essenceSpent: number;
  sidebar: { className: string; ranks: [string, number][] }[];
  dungeonGear: [string, number][];
  gearRng: bigint;
  /** Gear found but not yet given to a hero (choice mode, director Nov 21); absent in older saves. */
  pendingGear?: PendingGear[];
}

/** What the combat layer needs to run one fight room. */
export interface FightSpec {
  nodeId: number;
  floor: number;
  room: RoomType;
  isRescue: boolean;
  /** Class that joins at 30% HP at the start of this fight ('' = none). */
  joinClass: string;
  enemies: string[];
  hasWave: boolean;
  waveAtSeconds: number;
  waveEnemies: string[];
  /** Combat random seed for this fight (own stream). */
  seed: bigint;
}

export const makeFightSpec = (): FightSpec => ({
  nodeId: -1, floor: 1, room: RoomType.Combat, isRescue: false, joinClass: '', enemies: [], hasWave: false, waveAtSeconds: 0,
  waveEnemies: [], seed: 0n,
});

export enum EntryKind { Rejected, Fight, Treasure, Passed, Exit }
export interface RoomEntry {
  kind: EntryKind;
  gold: number;
}
const rejected = (): RoomEntry => ({ kind: EntryKind.Rejected, gold: 0 });

export enum TeleportResult { Rejected, NextFloor, Victory }

export interface RunResults {
  outcome: RunOutcome;
  floorReached: number;
  essenceEarned: number;
  essenceCarryOver: number;
  goldEarned: number;
  seed: bigint;
  causeOfDeath: string;
  killerName: string;
  kills: number;
  roomsCleared: number;
  priestRescued: boolean;
}

export const makeRunResults = (): RunResults => ({
  outcome: RunOutcome.InProgress, floorReached: 0, essenceEarned: 0, essenceCarryOver: 0, goldEarned: 0, seed: 0n,
  causeOfDeath: '', killerName: '', kills: 0, roomsCleared: 0, priestRescued: false,
});

/** Rooms joined to a room by a door (N, E, S, W order). */
export function neighborsOf(f: Floor, id: number): number[] {
  if (id < 0 || id >= f.nodes.length) return [];
  return [...f.nodes[id].next];
}

export interface MoveResult {
  accepted: boolean;
  path: number[];
  walked: number[];
  arrived: boolean;
  last: RoomEntry;
}

/** "F%d n%d %-14s %-7s | %s | essence %d gold %d | kills %d/%d" */
export function formatRoomLine(floor: number, node: number, room: string, result: string, partyHp: string, essence: number,
  gold: number, kills: number, quota: number): string {
  return `F${floor} n${node} ${padL(room, 14)} ${padL(result, 7)} | ${partyHp} | essence ${essence} gold ${gold} | kills ${kills}/${quota}`;
}

export interface PartyLuck { essencePerKill: number; essencePerRoom: number; goldPerKill: number; goldPerRoom: number }
export interface GearDrop { className: string; slot: GearSlot; dungeonLevel: number }
/** A found piece of gear waiting for the player to pick a hero. `suggested` is the hero the old random roll picked (what Auto gives it to). */
export interface PendingGear { slot: GearSlot; suggested: string }

const FIGHT_SEED_MUL = 0xa24baed4963ee407n;
const GEAR_SEED_XOR = 0x6ea2d40f5eedc0den;

export class RunFlow {
  private cfg: RunConfig;
  private run: RunState = makeRunState();
  private results: RunResults = makeRunResults();
  private cleared: number[] = [];
  private crystalFound = false;
  private bossKilled = false;
  private floorKills = 0;
  private runKills = 0;
  private roomsCleared = 0;
  private unsavedGold = 0;
  private priestRescued = false;
  private priestEvent = false;
  private priestOwned = false;
  private pendingFight = false;
  private pending: FightSpec = makeFightSpec();
  private sidebar: EssenceSidebar;
  private essenceEarned = 0;
  private essenceSpent = 0;
  private luck: PartyLuck = { essencePerKill: 0, essencePerRoom: 0, goldPerKill: 0, goldPerRoom: 0 };
  private dungeonGear = new Map<string, number>();
  private drops: GearDrop[] = [];
  private gearChoice = false;
  private pendingGear: PendingGear[] = [];
  private gearRng = new Rng(0);
  private builtSize: FloorSize;
  private priestStart: boolean | undefined;   // undefined: the original rescue rules (soaks, parity, older saves)

  constructor(config: RunConfig = defaultRunConfig()) {
    this.cfg = cloneRunConfig(config);
    this.builtSize = floorSizeOf(this.cfg.floor);
    this.sidebar = new EssenceSidebar(this.cfg.essence.clone());
  }

  // ---- run start ----
  /** The heroes the run starts with (party picker), set BEFORE start. */
  setStartParty(party: readonly string[]): void { this.cfg.startParty = [...party]; }
  /** The Priestess is owned (rescued in an earlier run) but may be benched: floors are generated as if she were in the party. */
  setPriestOwned(owned: boolean): void { this.priestOwned = owned; }
  /** The Priestess is in from the start (director, Nov 21): no rescue floor. `firstFloorSmall` keeps the small first floor. */
  setPriestStart(firstFloorSmall: boolean): void { this.priestStart = firstFloorSmall; }
  /** Testing builds: the size of floors built from now on. The current floor keeps its layout. */
  setFloorSize(s: FloorSize): void { this.cfg.floor = withFloorSize(this.cfg.floor, s); }

  start(seed: bigint | number, priestUnlocked: boolean, startFloor = 1): void {
    const s = u64(seed);
    this.builtSize = floorSizeOf(this.cfg.floor);
    const party = [...this.cfg.startParty];
    if (priestUnlocked && !party.includes(this.cfg.rescueClass)) party.push(this.cfg.rescueClass);
    startRun(this.run, s, party, this.floorConfig(party.includes(this.cfg.rescueClass)));
    if (startFloor > 1) {
      this.run.floorNumber = startFloor;
      this.run.floor = generate(s, startFloor, this.floorConfig(party.includes(this.cfg.rescueClass)));
      this.run.currentNode = this.run.floor.startNode;
      revealNode(this.run.floor, this.run.currentNode);
    }
    this.results = makeRunResults();
    this.results.seed = s;
    this.results.outcome = RunOutcome.InProgress;
    this.runKills = this.roomsCleared = this.unsavedGold = this.essenceEarned = this.essenceSpent = 0;
    this.sidebar.reset(this.run.party);
    this.priestRescued = this.priestEvent = false;
    this.dungeonGear.clear();
    this.drops = [];
    this.pendingGear = [];
    this.gearRng = new Rng(s ^ GEAR_SEED_XOR);
    this.pendingFight = false;
    this.resetFloorState();
    this.enterCurrent();
  }

  // ---- run saves ----
  /** The run's state for a save. Meant for a safe moment (no fight running); see RunManager's checkpoints. */
  checkpoint(): FlowCheckpoint {
    const nodes = this.run.floor.nodes;
    return {
      floorSize: { ...this.builtSize },
      ...(this.priestStart === undefined ? {} : { priestStartTutorial: this.priestStart }),
      seed: this.run.seed,
      floorNumber: this.run.floorNumber,
      currentNode: this.run.currentNode,
      party: [...this.run.party],
      gold: this.run.gold,
      essence: this.run.essence,
      revealed: nodes.filter((n) => n.revealed).map((n) => n.id),
      known: nodes.filter((n) => n.known).map((n) => n.id),
      cleared: nodes.filter((n) => this.isCleared(n.id)).map((n) => n.id),
      crystalFound: this.crystalFound,
      bossKilled: this.bossKilled,
      floorKills: this.floorKills,
      runKills: this.runKills,
      roomsCleared: this.roomsCleared,
      priestRescued: this.priestRescued,
      essenceEarned: this.essenceEarned,
      essenceSpent: this.essenceSpent,
      sidebar: this.sidebar.exportRanks(),
      dungeonGear: [...this.dungeonGear.entries()],
      gearRng: this.gearRng.getState(),
      ...(this.pendingGear.length > 0 ? { pendingGear: this.pendingGear.map((p) => ({ ...p })) } : {}),
    };
  }

  /** Puts a saved run back (after the Essence context and Party Luck are set, as for start()). The floor is generated from the
   *  seed; if the party stood in a fight room it had not cleared (a floor start), that room's fight is pending again.
   *  Returns false, changing nothing, when the save does not fit the floor it generates. */
  restore(cp: FlowCheckpoint): boolean {
    if (cp.floorNumber < 1 || cp.party.length === 0) return false;
    const size = cp.floorSize ?? kOldSaveFloorSize;
    const floor = generate(cp.seed, cp.floorNumber, withFloorSize(this.floorConfig(cp.party.includes(this.cfg.rescueClass), cp.priestStartTutorial), size));
    const n = floor.nodes.length;
    const inRange = (ids: readonly number[]): boolean => ids.every((i) => Number.isInteger(i) && i >= 0 && i < n);
    if (!Number.isInteger(cp.currentNode) || cp.currentNode < 0 || cp.currentNode >= n) return false;
    if (!inRange(cp.revealed) || !inRange(cp.known) || !inRange(cp.cleared)) return false;
    this.builtSize = { ...size };
    this.priestStart = cp.priestStartTutorial;
    const run = this.run;
    Object.assign(run, makeRunState());
    run.seed = cp.seed;
    run.floorNumber = cp.floorNumber;
    run.floor = floor;
    run.party = [...cp.party];
    run.gold = cp.gold;
    run.essence = cp.essence;
    run.active = true;
    for (const i of cp.revealed) floor.nodes[i].revealed = true;
    for (const i of cp.known) floor.nodes[i].known = true;
    run.currentNode = cp.currentNode;
    revealNode(floor, run.currentNode);
    this.results = makeRunResults();
    this.results.seed = cp.seed;
    this.results.outcome = RunOutcome.InProgress;
    this.resetFloorState();
    for (const i of cp.cleared) this.cleared[i] = 1;
    this.crystalFound = cp.crystalFound;
    this.bossKilled = cp.bossKilled;
    this.floorKills = cp.floorKills;
    this.runKills = cp.runKills;
    this.roomsCleared = cp.roomsCleared;
    this.unsavedGold = 0;
    this.priestRescued = cp.priestRescued;
    this.priestEvent = false;
    this.essenceEarned = cp.essenceEarned;
    this.essenceSpent = cp.essenceSpent;
    this.sidebar.importRanks(cp.sidebar);
    this.dungeonGear = new Map(cp.dungeonGear);
    this.drops = [];
    this.pendingGear = (cp.pendingGear ?? []).map((p) => ({ ...p }));
    this.gearRng = new Rng(cp.gearRng);
    this.pendingFight = false;
    if (!this.isCleared(run.currentNode)) this.enterCurrent();
    return true;
  }

  // ---- Essence sidebar ----
  setEssenceContext(unlockedStats: readonly string[], classAllowedStats: ReadonlyMap<string, string[]>): void {
    this.sidebar.setUnlockedStats(unlockedStats);
    this.sidebar.setClassAllowedStats(classAllowedStats);
  }
  getSidebar(): EssenceSidebar { return this.sidebar; }
  buyEssence(character: number, stat: string, amount: number): BuyResult {
    if (!this.run.active) return { bought: 0, spent: 0, newRank: 0, refusal: BuyRefusal.NoCharacter, reason: 'No run in progress' };
    const wallet = { value: this.run.essence };
    const r = this.sidebar.buy(character, stat, amount, wallet);
    this.run.essence = wallet.value;
    this.essenceSpent += r.spent;
    return r;
  }
  debugGrantEssence(amount: number): void {
    if (this.run.active && amount > 0) {
      this.run.essence += amount;
      this.essenceEarned += amount;
    }
  }
  getEssenceSpent(): number { return this.essenceSpent; }
  getEssenceEarned(): number { return this.essenceEarned; }

  // ---- queries ----
  config(): RunConfig { return this.cfg; }
  getRun(): RunState { return this.run; }
  active(): boolean { return this.run.active; }
  fightPending(): boolean { return this.pendingFight; }
  pendingFightSpec(): FightSpec { return this.pending; }
  currentFloor(): Floor { return this.run.floor; }
  currentNode(): number { return this.run.currentNode; }
  isCleared(node: number): boolean { return node >= 0 && node < this.cleared.length && this.cleared[node] !== 0; }
  isCrystalFound(): boolean { return this.crystalFound; }
  isBossKilled(): boolean { return this.bossKilled; }
  getFloorKills(): number { return this.floorKills; }
  quota(): number { return this.run.floor.killQuota; }
  quotaMet(): boolean { return this.run.floor.isBoss ? true : this.floorKills >= this.run.floor.killQuota; }
  partyHasPriest(): boolean { return this.run.party.includes(this.cfg.rescueClass); }
  priestRescuedThisRun(): boolean { return this.priestRescued; }
  rescueOutstanding(): boolean { return this.run.floor.rescueNode >= 0 && !this.partyHasPriest(); }
  adjacent(): number[] { return neighborsOf(this.run.floor, this.run.currentNode); }
  isVisited(node: number): boolean { return node >= 0 && node < this.run.floor.nodes.length && this.run.floor.nodes[node].revealed; }
  isKnown(node: number): boolean { return node >= 0 && node < this.run.floor.nodes.length && this.run.floor.nodes[node].known; }
  pathTo(node: number): number[] { return findPath(this.run.floor, this.run.currentNode, node); }
  getResults(): RunResults { return this.results; }
  inCrystalRoom(): boolean {
    return this.run.active && this.run.floor.crystalNode >= 0 && this.run.currentNode === this.run.floor.crystalNode;
  }
  canTeleport(): boolean { return this.teleportRefusal() === ''; }
  teleportRefusal(): string {
    if (!this.run.active) return 'no run is active';
    if (this.pendingFight) return 'a fight is pending';
    if (!this.crystalFound) return 'the crystal has not been found yet';
    if (!this.inCrystalRoom()) return 'the party is not in the crystal room';
    if (this.run.floor.isBoss) {
      if (!this.bossKilled) return 'the boss is not dead';
    } else if (!this.quotaMet()) return 'the kill quota is not met';
    if (this.cfg.rescueRequiredToLeaveFloor && this.rescueOutstanding()) return 'the Priest has not been rescued yet';
    return '';
  }

  // ---- Temple context ----
  setPartyLuck(p: PartyLuck): void { this.luck = { ...p }; }
  setTempleLevels(levels: ReadonlyMap<string, number>): void { this.sidebar.setTempleLevels(levels); }
  consumeGearDrops(): GearDrop[] {
    const d = this.drops;
    this.drops = [];
    return d;
  }
  getDungeonGear(): ReadonlyMap<string, number> { return this.dungeonGear; }
  /** Choice mode (the live game): found gear waits for the player to pick a hero instead of going to a random one. Off keeps the
   *  random hero, which the soaks and the Unreal parity rely on. The rolls are drawn either way, so the random stream never changes. */
  setGearChoice(on: boolean): void { this.gearChoice = on; }
  getPendingGear(): readonly PendingGear[] { return this.pendingGear; }
  /** Gives the pending piece `index` to `className` (a hero in the party). Returns false, changing nothing, for a bad index or hero. */
  assignGear(index: number, className: string): boolean {
    const p = this.pendingGear[index];
    if (!p || !this.run.party.includes(className)) return false;
    this.pendingGear.splice(index, 1);
    this.applyGear(className, p.slot);
    return true;
  }
  consumeGoldDelta(): number {
    const g = this.unsavedGold;
    this.unsavedGold = 0;
    return g;
  }
  consumePriestUnlock(): boolean {
    const e = this.priestEvent;
    this.priestEvent = false;
    return e;
  }

  // ---- actions ----
  travel(node: number): RoomEntry {
    if (!this.run.active || this.pendingFight) return rejected();
    if (!this.adjacent().includes(node)) return rejected();
    this.run.currentNode = node;
    revealNode(this.run.floor, node);
    return this.enterCurrent();
  }

  moveDirection(dir: Dir): RoomEntry {
    if (!this.run.active || this.pendingFight) return rejected();
    const to = this.run.floor.nodes[this.run.currentNode].door[dir];
    if (to < 0) return rejected();
    return this.travel(to);
  }

  moveToRoom(node: number): MoveResult {
    const r: MoveResult = { accepted: false, path: [], walked: [], arrived: false, last: rejected() };
    if (!this.run.active || this.pendingFight) return r;
    r.path = this.pathTo(node);
    if (r.path.length === 0) return r;
    r.accepted = true;
    for (let i = 0; i < r.path.length; ++i) {
      const next = r.path[i];
      const n = this.run.floor.nodes[next];
      const fightRoom = n.type === RoomType.Combat || n.type === RoomType.Elite || n.type === RoomType.Boss;
      if (i + 1 < r.path.length && fightRoom && !this.isCleared(next)) break;
      r.last = this.travel(next);
      if (r.last.kind === EntryKind.Rejected) break;
      r.walked.push(next);
      if (r.last.kind === EntryKind.Fight) break;
    }
    r.arrived = r.walked.length > 0 && r.walked[r.walked.length - 1] === r.path[r.path.length - 1];
    return r;
  }

  onEnemyKilled(): void {
    if (!this.run.active) return;
    ++this.floorKills;
    ++this.runKills;
    const perKill = RunFlow.scaled(this.cfg.essencePerKill, this.luck.essencePerKill);
    this.run.essence += perKill;
    this.essenceEarned += perKill;
  }

  onFightFinished(result: FightResult, causeText = '', killerName = ''): void {
    if (!this.run.active || !this.pendingFight) return;
    this.pendingFight = false;
    if (result !== FightResult.Won) {
      this.results.causeOfDeath = result === FightResult.TimedOut ? 'Fight timed out (runaway guard)' : causeText;
      this.results.killerName = killerName;
      this.finish(RunOutcome.Wiped);
      return;
    }
    this.markCleared(this.pending.nodeId);
    ++this.roomsCleared;
    const perRoom = RunFlow.scaled(this.cfg.essencePerRoom, this.luck.essencePerRoom);
    this.run.essence += perRoom;
    this.essenceEarned += perRoom;
    let gold: number;
    switch (this.pending.room) {
      case RoomType.Elite: gold = this.cfg.goldElite; break;
      case RoomType.Boss: gold = this.cfg.goldBoss; this.bossKilled = true; break;
      default: gold = this.cfg.goldCombat; break;
    }
    this.pay(RunFlow.scaled(gold, this.luck.goldPerRoom));
    if (this.pending.room === RoomType.Elite || this.pending.room === RoomType.Boss) this.dropGear();
  }

  teleport(): TeleportResult {
    if (!this.canTeleport()) return TeleportResult.Rejected;
    if (this.run.floor.isBoss && this.cfg.endRunAfterBossFloor) {
      this.results.causeOfDeath = 'Cleared the boss floor';
      this.finish(RunOutcome.Victory);
      return TeleportResult.Victory;
    }
    this.builtSize = floorSizeOf(this.cfg.floor);
    nextFloor(this.run, this.floorConfig(this.partyHasPriest()));
    this.resetFloorState();
    this.enterCurrent();
    return TeleportResult.NextFloor;
  }

  abandon(): void {
    if (!this.run.active) return;
    this.pendingFight = false;
    this.results.causeOfDeath = 'Abandoned run';
    this.finish(RunOutcome.Abandoned);
  }

  // ---- private ----
  private floorConfig(hasPriest: boolean, priestStart = this.priestStart): Config {
    // The generator's small first floor is keyed on hasPriest being false; with no rescue floor that flag means only that.
    if (priestStart !== undefined) return { ...this.cfg.floor, rescueFloor: 0, hasPriest: !priestStart };
    return { ...this.cfg.floor, hasPriest: hasPriest || this.priestOwned };
  }
  private resetFloorState(): void {
    this.cleared = new Array<number>(this.run.floor.nodes.length).fill(0);
    this.crystalFound = false;
    this.bossKilled = false;
    this.floorKills = 0;
  }
  private markCleared(node: number): void {
    if (node >= 0 && node < this.cleared.length) this.cleared[node] = 1;
  }
  static scaled(base: number, bonus: number): number {
    return base <= 0 ? base : Math.trunc(lround(base * (1.0 + (bonus < 0 ? 0.0 : bonus))));
  }
  private dropGear(): void {
    if (this.run.party.length === 0) return;
    const className = this.run.party[this.gearRng.nextInt(0, this.run.party.length - 1)];
    const slot = this.gearRng.nextInt(0, 1) === 0 ? GearSlot.Weapon : GearSlot.Armor;
    if (this.gearChoice) this.pendingGear.push({ slot, suggested: className });
    else this.applyGear(className, slot);
  }
  private applyGear(className: string, slot: GearSlot): void {
    const key = gearKey(className, slot);
    const level = (this.dungeonGear.get(key) ?? 0) + 1;
    this.dungeonGear.set(key, level);
    this.drops.push({ className, slot, dungeonLevel: level });
  }
  private pay(gold: number): void {
    if (gold <= 0) return;
    this.run.gold += gold;
    this.unsavedGold += gold;
  }
  private finish(outcome: RunOutcome): void {
    const r = this.results;
    r.outcome = outcome;
    r.floorReached = this.run.floorNumber;
    r.essenceEarned = this.essenceEarned;
    r.essenceCarryOver = 0;
    r.goldEarned = this.run.gold;
    r.seed = this.run.seed;
    r.kills = this.runKills;
    r.roomsCleared = this.roomsCleared;
    r.priestRescued = this.priestRescued;
    endRun(this.run);
  }
  private static appendPack(out: string[], p: EnemyPack): void {
    for (let t = 0; t < kEnemyTypeCount; ++t) for (let i = 0; i < p.counts[t]; ++i) out.push(enemyTypeName(t as EnemyType));
  }
  private enterCurrent(): RoomEntry {
    const node = this.run.floor.nodes[this.run.currentNode];
    if (node.hasCrystal) this.crystalFound = true;
    const e: RoomEntry = { kind: EntryKind.Rejected, gold: 0 };
    if (this.isCleared(node.id)) {
      e.kind = EntryKind.Passed;
      return e;
    }
    switch (node.type) {
      case RoomType.Combat:
      case RoomType.Elite:
      case RoomType.Boss:
        if (node.pack.size === 0 && !(node.hasReinforcements && node.reinforcements.size > 0)) {
          this.markCleared(node.id);
          e.kind = EntryKind.Passed;
          return e;
        }
        this.buildFight(node);
        e.kind = EntryKind.Fight;
        return e;
      case RoomType.Treasure:
        this.markCleared(node.id);
        e.gold = RunFlow.scaled(this.cfg.goldTreasure, this.luck.goldPerRoom);
        this.pay(e.gold);
        this.dropGear();
        e.kind = EntryKind.Treasure;
        return e;
      case RoomType.Rest:
        this.markCleared(node.id);
        e.kind = EntryKind.Passed;
        return e;
      case RoomType.Exit:
        this.markCleared(node.id);
        e.kind = EntryKind.Exit;
        return e;
    }
    return e;
  }
  private buildFight(node: Node): void {
    const s = makeFightSpec();
    s.nodeId = node.id;
    s.floor = this.run.floor.number;
    s.room = node.type;
    RunFlow.appendPack(s.enemies, node.pack);
    if (node.isRescueRoom && !this.partyHasPriest()) {
      s.isRescue = true;
      s.joinClass = this.cfg.rescueClass;
      for (let i = 0; i < this.cfg.rescueExtraEnemies; ++i) s.enemies.push(enemyTypeName(this.cfg.rescueExtraType));
      for (let i = 0; i > this.cfg.rescueExtraEnemies && s.enemies.length > this.cfg.rescueMinPack; --i) s.enemies.pop();
      this.run.party.push(this.cfg.rescueClass);
      this.sidebar.addCharacter(this.cfg.rescueClass);
      this.priestRescued = true;
      this.priestEvent = true;
    }
    const fightRng = new Rng(floorSeed(this.run.seed, this.run.floor.number) ^ u64(FIGHT_SEED_MUL * BigInt(node.id + 1)));
    s.seed = fightRng.nextU64();
    if (node.hasReinforcements && node.reinforcements.size > 0 && !(s.isRescue && !this.cfg.rescueWave)) {
      s.hasWave = true;
      RunFlow.appendPack(s.waveEnemies, node.reinforcements);
      s.waveAtSeconds = fightRng.nextInt(this.cfg.waveMinSeconds, this.cfg.waveMaxSeconds);
    }
    this.pending = s;
    this.pendingFight = true;
  }
}
