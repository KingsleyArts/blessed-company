// The tol.AutoRun soak bot (Run/RunManager.cpp, instant mode) without the engine: whole runs through RunFlow on a real CombatSim,
// with the exact order of calls URunManager makes, so a soak here reproduces an Unreal soak.
//   * bot session: the meta save is never read or written; the meta starts from zero, `fresh` resets it again
//   * every run starts with priestUnlocked forced false (soaks keep the fixed Warrior + Mage start; the Priest is rescued on floor 2)
//   * CombatConfig as ACombatManager::StartFight builds it: enemyStatMult (a float cvar, 1.3f), shipped cast times when on,
//     random enemy spawn, the party entry door (-1 on a new run or floor, else the door opposite the way the party walked)
//   * Essence ranks and gear are pushed to the sim after each fight starts and after gear drops / bot purchases
//   * after a won non-boss fight PostWinRevive; `fullheal` (debug) restores the whole party after every win
//   * the Exit room revives every fallen unit at 20 percent
//   * after each run, `temple`: BotVisitTemple (cheapest affordable gear / stat item first, Party Luck excluded, up to 600 buys)
import { installLegacyCastTimes, installShippedCastTimes } from './castTimes';
import type { CombatData } from './combatData';
import { CombatSim, FightState, defaultCombatConfig, type CombatConfig } from './combatSim';
import { kNoUnit } from './eventBus';
import { applyEssenceToSim } from './essenceApply';
import { shippedEssenceConfig, type EssenceStatDef } from './essenceConfig';
import { RoomType } from './floorGenerator';
import { applyGearToSim } from './gearApply';
import { kMetaMaxGold, makeMeta, resetProgress, type MetaSave } from './metaSave';
import { activeParty, kActiveSlots, rosterPriestClass, toggleActiveHero } from './roster';
import { RunBot } from './runBot';
import { EntryKind, FightResult, RunFlow, RunOutcome, TeleportResult, type FightSpec, type RunResults } from './runFlow';
import { exitRoomRevive, partyHpFraction } from './runSim';
import {
  GearSlot, buyGear, buyStatRanks, buyStatUnlock, defaultTempleConfig, gearNextCost, gearTempleLevel, kGearSlotCount, partyLuckBonus,
  statNextCost, statTempleLevel, statUnlocked,
} from './temple';

export interface AutoRunParams {
  /** First run seed; each following run uses seed + 1 (0 is not random here: the caller picks). */
  seed: number;
  /** Stop after this many runs. */
  maxRuns: number;
  /** tol.EnemyMult (a float cvar in Unreal; rounded to float here). */
  enemyMult: number;
  /** tol.CastTimes 1 (the Unreal default) installs the shipped cast times. */
  castTimes: boolean;
  /** Install the Nov 18 (Unreal) cast-time table instead of the shipped one: the 3164-run parity soak and A/B comparisons use it. */
  legacyCastTimes: boolean;
  /** Test hook: adjust the combat config after the cast times are installed (A/B experiments in the soak). */
  tweakConfig?: (cfg: CombatConfig) => void;
  noBuy: boolean;
  temple: boolean;
  fresh: boolean;
  fullHeal: boolean;
}

export const makeAutoRunParams = (over: Partial<AutoRunParams> = {}): AutoRunParams => ({
  seed: 1, maxRuns: 40, enemyMult: 1.3, castTimes: true, legacyCastTimes: false, noBuy: false, temple: false, fresh: true, fullHeal: false, ...over,
});

export interface TempleVisit {
  bought: number;
  faithLeft: number;
  /** "Warrior 2/1 Mage 1/1 Priest 0/0" (weapon/armor Temple levels). */
  gear: string;
  statsUnlocked: number;
}

export interface AutoRunRecord {
  run: number;
  seed: number;
  results: RunResults;
  fights: number;
  /** Faith (MetaSave.gold) after the run, before the Temple visit. */
  faithAfterRun: number;
  temple?: TempleVisit;
}

export class AutoRunSession {
  readonly meta: MetaSave = makeMeta();
  readonly records: AutoRunRecord[] = [];
  private flow = new RunFlow();
  private bot = new RunBot(0);
  private sim: CombatSim | undefined;
  private inFirstFight = true;
  private entryDoor = -1;
  private nextSeed: number;
  private fights = 0;

  constructor(private readonly data: CombatData, readonly params: AutoRunParams) {
    this.nextSeed = params.seed;
    if (params.fresh) resetProgress(this.meta);
  }

  /** Plays all runs (StartAutoRun's instant loop). `onRun` sees each record as it finishes. */
  runAll(onRun?: (r: AutoRunRecord) => void): AutoRunRecord[] {
    for (let guard = 0; guard < 200000 && this.records.length < this.params.maxRuns; ++guard) {
      if (!this.flow.active()) {
        const before = this.records.length;
        this.beginRun();
        // A run that ended inside beginRun (wiped in its first fight) is recorded there.
        if (this.records.length > before) onRun?.(this.records[this.records.length - 1]);
      } else {
        const before = this.records.length;
        this.advanceStep();
        if (this.records.length > before) onRun?.(this.records[this.records.length - 1]);
      }
    }
    return this.records;
  }

  // ---------------------------------------------------------------------------------------- the combat manager
  private combatConfig(): CombatConfig {
    const cfg = defaultCombatConfig();
    cfg.enemyStatMult = Math.fround(this.params.enemyMult);
    if (this.params.castTimes) (this.params.legacyCastTimes ? installLegacyCastTimes : installShippedCastTimes)(cfg);
    cfg.randomEnemySpawn = true;
    this.params.tweakConfig?.(cfg);
    return cfg;
  }

  private setPartyEntry(door: number): void {
    this.entryDoor = door;
    this.sim?.setPartyEntry(door);
  }

  private pushEssenceToSim(): void {
    if (!this.sim) return;
    applyEssenceToSim(this.sim, this.flow.getSidebar());
    applyGearToSim(this.sim, this.meta, this.flow.getDungeonGear());
  }

  // ---------------------------------------------------------------------------------------- run manager steps
  private flowStart(seed: number): void {
    this.flow = new RunFlow();
    this.meta.priestUnlocked = false;
    this.flow.setEssenceContext(this.meta.unlockedStats, new Map());
    this.flow.setTempleLevels(this.meta.statLevels);
    this.flow.setPartyLuck({
      essencePerKill: partyLuckBonus(this.meta, 'EssencePerKill'),
      essencePerRoom: partyLuckBonus(this.meta, 'EssencePerRoom'),
      goldPerKill: partyLuckBonus(this.meta, 'GoldPerKill'),
      goldPerRoom: partyLuckBonus(this.meta, 'GoldPerRoom'),
    });
    this.flow.setStartParty(activeParty(this.meta));
    this.flow.setPriestOwned(this.meta.priestUnlocked);
    this.flow.start(seed, false, 1);
  }

  private beginRun(): void {
    const seed = this.nextSeed++;
    this.flowStart(seed);
    this.bot = new RunBot(seed);
    this.inFirstFight = true;
    this.fights = 0;
    this.syncMeta();
    this.startPendingFight();
  }

  private syncMeta(): void {
    const gold = this.flow.consumeGoldDelta();
    if (gold !== 0) this.meta.gold = Math.min(kMetaMaxGold, this.meta.gold + gold);
    if (this.flow.consumePriestUnlock() && !this.meta.priestUnlocked) {
      this.meta.priestUnlocked = true;
      if (activeParty(this.meta).length < kActiveSlots) toggleActiveHero(this.meta, rosterPriestClass());
    }
    const floor = this.flow.getRun().floorNumber;
    if (floor > this.meta.bestFloor) this.meta.bestFloor = floor;
    if (this.flow.consumeGearDrops().length > 0) this.pushEssenceToSim();
  }

  private startPendingFight(): void {
    if (!this.flow.fightPending()) return;
    const spec = this.flow.pendingFightSpec();
    // FCombatWave.AtSeconds is a float in Unreal.
    const waveAt = Math.fround(spec.waveAtSeconds);
    if (this.inFirstFight || !this.sim) {
      const sim = new CombatSim(this.data, spec.seed, this.combatConfig());
      this.entryDoor = -1;
      sim.setPartyEntry(this.entryDoor);
      for (const c of this.flow.getRun().party) {
        if (spec.isRescue && c === spec.joinClass) continue;
        sim.addPartyUnit(c);
      }
      for (const e of spec.enemies) sim.addEnemy(e, spec.floor);
      this.sim = sim;
      if (spec.hasWave) sim.scheduleWave(waveAt, spec.waveEnemies, spec.floor);
      sim.startFight();
      sim.getBus().subscribe('EnemyKilled', () => this.flow.onEnemyKilled());
      this.inFirstFight = false;
    } else {
      const sim = this.sim;
      if (spec.joinClass !== '') {
        sim.prepareNextFight();
        if (sim.addRescuedUnit(spec.joinClass) === kNoUnit) throw new Error('autoRun: the rescued unit could not join');
      }
      if (sim.getState() !== FightState.NotStarted) sim.prepareNextFight();
      for (const e of spec.enemies) sim.addEnemy(e, spec.floor);
      if (spec.hasWave) sim.scheduleWave(waveAt, spec.waveEnemies, spec.floor);
      sim.startFight();
    }
    this.pushEssenceToSim();
    this.sim.runToEnd();
    this.handleFightFinished(spec);
  }

  private handleFightFinished(spec: FightSpec): void {
    const sim = this.sim!;
    const st = sim.getState();
    const won = st === FightState.Won;
    ++this.fights;
    let cause = '';
    let killer = '';
    if (won) {
      if (spec.room !== RoomType.Boss) sim.postWinRevive();
      if (this.params.fullHeal) {
        for (const u of sim.getUnits()) {
          if (u.enemy || u.summon || u.removed) continue;
          const mu = sim.mutableUnit(u.id)!;
          mu.alive = true;
          mu.hp = sim.maxHp(mu);
        }
      }
    } else {
      const fd = sim.getFirstDeath();
      if (fd.valid) {
        cause = fd.text;
        const k = sim.getUnit(fd.killer);
        if (k) killer = k.name;
      }
    }
    this.flow.onFightFinished(won ? FightResult.Won : st === FightState.TimedOut ? FightResult.TimedOut : FightResult.Wiped, cause, killer);
    this.syncMeta();
    if (!this.flow.active()) this.finishRun();
  }

  private doTeleport(): void {
    const t = this.flow.teleport();
    if (t === TeleportResult.Rejected) throw new Error('autoRun: the flow rejected a teleport the bot chose');
    if (!this.flow.active()) {
      this.finishRun();
      return;
    }
    this.syncMeta();
    this.setPartyEntry(-1);
    this.startPendingFight();
  }

  private advanceStep(): void {
    if (this.flow.fightPending()) {
      this.startPendingFight();
      return;
    }
    if (!this.params.noBuy) {
      this.bot.spendEssence = true;
      if (this.bot.spend(this.flow) > 0) this.pushEssenceToSim();
    }
    const hp = this.sim ? partyHpFraction(this.sim) : 1.0;
    const choice = this.bot.choose(this.flow, hp);
    if (choice.teleport) {
      this.doTeleport();
      return;
    }
    if (choice.node < 0) {
      this.flow.abandon();
      this.finishRun();
      return;
    }
    const from = this.flow.currentNode();
    const f = this.flow.currentFloor();
    const entry = this.flow.travel(choice.node);
    if (entry.kind === EntryKind.Rejected) throw new Error('autoRun: the flow rejected a move the bot chose');
    // EnterRoomWalking: the party rallies at the door opposite to the way it walked.
    let dir = -1;
    for (let d = 0; d < 4; ++d) if (f.nodes[from].door[d] === choice.node) dir = d;
    if (dir < 0) throw new Error('autoRun: the bot moved between rooms that share no door');
    this.setPartyEntry((dir + 2) % 4);
    this.syncMeta();
    if (entry.kind === EntryKind.Fight) this.startPendingFight();
    else if (entry.kind === EntryKind.Exit && this.sim) exitRoomRevive(this.sim);
  }

  private finishRun(): void {
    const r = this.flow.getResults();
    if (r.floorReached > this.meta.bestFloor) this.meta.bestFloor = r.floorReached;
    const rec: AutoRunRecord = {
      run: this.records.length + 1, seed: Number(r.seed), results: r, fights: this.fights, faithAfterRun: this.meta.gold,
    };
    if (this.params.temple) rec.temple = botVisitTemple(this.meta);
    this.records.push(rec);
  }
}

// ------------------------------------------------------------------------------------------ the Temple bot
const kTempleClasses = ['Warrior', 'Mage'];

interface TempleItem {
  cost: number;
  buy: () => boolean;
}

/** GetTempleSnapshot(1) without the luck column, in snapshot order: gear (Warrior W/A, Mage W/A), then every sidebar stat. */
function templeItems(meta: MetaSave, stats: readonly EssenceStatDef[]): TempleItem[] {
  const cfg = defaultTempleConfig();
  const items: TempleItem[] = [];
  for (const cls of kTempleClasses) {
    for (let slot = 0; slot < kGearSlotCount; ++slot) {
      const s = slot === 0 ? GearSlot.Weapon : GearSlot.Armor;
      const cost = gearNextCost(cfg, gearTempleLevel(meta, cls, s));
      if (cost < 0 || meta.gold < cost) continue;
      items.push({ cost, buy: () => buyGear(meta, cls, s).ok });
    }
  }
  for (const def of stats) {
    if (def.tier === 0 || statUnlocked(meta, def.name)) {
      const cost = statNextCost(def, statTempleLevel(meta, def.name));
      if (cost < 0 || meta.gold < cost) continue;
      items.push({ cost, buy: () => buyStatRanks(meta, def, 100).ok });
    } else {
      if (meta.gold < cfg.statUnlockCost) continue;
      items.push({ cost: cfg.statUnlockCost, buy: () => buyStatUnlock(meta, def.name).ok });
    }
  }
  return items;
}

/** URunManager::BotVisitTemple: cheapest affordable item first (the first one wins a tie), until nothing is affordable. */
export function botVisitTemple(meta: MetaSave): TempleVisit {
  const stats = shippedEssenceConfig().stats;
  let bought = 0;
  for (let guard = 0; guard < 600; ++guard) {
    let pick: TempleItem | undefined;
    for (const it of templeItems(meta, stats)) if (!pick || it.cost < pick.cost) pick = it;
    if (!pick || !pick.buy()) break;
    ++bought;
  }
  const gear = ['Warrior', 'Mage', 'Priest']
    .map((c) => `${c} ${gearTempleLevel(meta, c, GearSlot.Weapon)}/${gearTempleLevel(meta, c, GearSlot.Armor)}`).join(' ');
  return { bought, faithLeft: meta.gold, gear, statsUnlocked: meta.unlockedStats.length };
}

export { RunOutcome };
