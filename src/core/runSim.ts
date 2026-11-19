// RunSim port (Core/RunSim.h): headless run driver. Plays a whole run with the RunBot on a real CombatSim, following the
// steps the Unreal run manager takes (first fight on a fresh sim, prepareNextFight + addRescuedUnit for the rescue,
// scheduleWave, PostFightRevive, the Exit-room revive). Used by the run tests (full runs, rescue win rate, determinism).
import type { CombatData } from './combatData';
import { CombatSim, FightState, fightStateName } from './combatSim';
import { lround } from './cstd';
import { kNoUnit } from './eventBus';
import { applyEssenceToSim, classAllowedStats } from './essenceApply';
import { RoomType } from './floorGenerator';
import type { MetaSave } from './metaSave';
import { Rng, u64 } from './rng';
import { RunBot } from './runBot';
import { cloneRunConfig, defaultRunConfig, type RunConfig } from './runConfig';
import {
  EntryKind, FightResult, RunFlow, TeleportResult, formatRoomLine, makeRunResults, roomTypeName, runOutcomeName,
  type RunResults,
} from './runFlow';

export interface RunSimOptions {
  seed: bigint | number;
  cfg: RunConfig;
  botSpendsEssence: boolean;
  maxSteps: number;
  stopAfterRescue: boolean;
  fakeUntilRescue: boolean;
  carryHpLow: number;
  carryHpHigh: number;
}

export const makeRunSimOptions = (over: Partial<RunSimOptions> = {}): RunSimOptions => ({
  seed: 1, cfg: defaultRunConfig(), botSpendsEssence: false, maxSteps: 4000, stopAfterRescue: false, fakeUntilRescue: false,
  carryHpLow: 1.0, carryHpHigh: 1.0, ...over,
});

export interface RunSimResult {
  results: RunResults;
  log: string[];
  fights: number;
  ranksBought: number;
  essenceSpent: number;
  exitRevived: number;
  rescueFought: boolean;
  rescueWon: boolean;
  hpFractionBeforeRescue: number;
}

/** "Name hp/max" per party unit, lround'ed, space separated. */
export function partyHpText(sim: CombatSim): string {
  const parts: string[] = [];
  for (const u of sim.getUnits()) {
    if (u.enemy || u.summon || u.removed) continue;
    parts.push(`${u.name} ${Math.trunc(lround(u.hp))}/${Math.trunc(lround(sim.maxHp(u)))}`);
  }
  return parts.join(' ');
}

export function partyHpFraction(sim: CombatSim): number {
  let hp = 0;
  let mx = 0;
  for (const u of sim.getUnits()) {
    if (u.enemy || u.summon || u.removed) continue;
    if (u.alive) hp += u.hp;
    mx += sim.maxHp(u);
  }
  return mx > 0 ? hp / mx : 0;
}

export const kReviveHp = 1.0;
export const kExitReviveHpFraction = 0.2;

/** Revives every fallen party member at kExitReviveHpFraction of its max HP. Returns the number revived. */
export function exitRoomRevive(sim: CombatSim): number {
  const fallen: number[] = [];
  for (const u of sim.getUnits()) {
    if (u.enemy || u.summon || u.removed || u.alive) continue;
    fallen.push(u.id);
  }
  let n = 0;
  for (const id of fallen) if (sim.reviveUnit(id, kExitReviveHpFraction, 'Exit room revive')) ++n;
  return n;
}

/** After a won fight: a living Priest revives the fallen at 1 HP, except after the boss fight. */
export function postFightRevive(sim: CombatSim, room: RoomType): number {
  return room === RoomType.Boss ? 0 : sim.postWinRevive();
}

export function runResultsText(r: RunResults): string {
  return `RUN RESULTS: ${runOutcomeName(r.outcome)} | floor reached ${r.floorReached} | essence earned ${r.essenceEarned} ` +
    `(carry-over ${r.essenceCarryOver}) | gold earned ${r.goldEarned} | seed ${u64(r.seed)} | kills ${r.kills} | ` +
    `rooms cleared ${r.roomsCleared} | priest rescued ${r.priestRescued ? 'yes' : 'no'} | cause: ${r.causeOfDeath === '' ? '-' : r.causeOfDeath}`;
}

export function simulateBotRun(data: CombatData, meta: MetaSave, opt: RunSimOptions): RunSimResult {
  const out: RunSimResult = {
    results: makeRunResults(), log: [], fights: 0, ranksBought: 0, essenceSpent: 0, exitRevived: 0, rescueFought: false,
    rescueWon: false, hpFractionBeforeRescue: 0,
  };
  const flow = new RunFlow(cloneRunConfig(opt.cfg));
  const bot = new RunBot(opt.seed);
  let sim: CombatSim | undefined;

  bot.spendEssence = opt.botSpendsEssence;
  flow.setEssenceContext(meta.unlockedStats, classAllowedStats(data));
  flow.start(opt.seed, meta.priestUnlocked);
  const saveGold = (): void => {
    meta.gold += flow.consumeGoldDelta();
    if (flow.consumePriestUnlock()) meta.priestUnlocked = true;
  };
  saveGold();

  if (opt.fakeUntilRescue) {
    for (let i = 0; flow.active() && !(flow.fightPending() && flow.pendingFightSpec().isRescue) && i < opt.maxSteps; ++i) {
      if (flow.fightPending()) {
        const p = flow.pendingFightSpec();
        const n = p.enemies.length + p.waveEnemies.length;
        for (let k = 0; k < n; ++k) flow.onEnemyKilled();
        flow.onFightFinished(FightResult.Won);
        continue;
      }
      const c = bot.choose(flow, 1.0);
      if (c.teleport) {
        flow.teleport();
        continue;
      }
      if (c.node < 0) break;
      flow.travel(c.node);
    }
    saveGold();
  }
  const hpRng = new Rng(u64(opt.seed) ^ 0x48504850n);

  let steps = 0;
  while (flow.active() && steps++ < opt.maxSteps) {
    if (flow.fightPending()) {
      const spec = flow.pendingFightSpec();
      if (!sim) {
        sim = new CombatSim(data, spec.seed);
        for (const c of flow.getRun().party) {
          if (spec.isRescue && c === spec.joinClass) continue;
          const id = sim.addPartyUnit(c);
          if (opt.fakeUntilRescue && id !== kNoUnit) {
            const u = sim.mutableUnit(id);
            if (u) u.hp = Math.max(1.0, sim.maxHp(u) * (opt.carryHpLow + (opt.carryHpHigh - opt.carryHpLow) * hpRng.nextDouble()));
          }
        }
        sim.getBus().subscribe('EnemyKilled', () => flow.onEnemyKilled());
      } else {
        if (spec.isRescue) out.hpFractionBeforeRescue = partyHpFraction(sim);
        sim.prepareNextFight();
      }
      if (spec.joinClass !== '') sim.addRescuedUnit(spec.joinClass);
      for (const e of spec.enemies) sim.addEnemy(e, spec.floor);
      if (spec.hasWave) sim.scheduleWave(spec.waveAtSeconds, spec.waveEnemies, spec.floor);
      applyEssenceToSim(sim, flow.getSidebar());
      sim.startFight();
      const st = sim.runToEnd();
      ++out.fights;
      const won = st === FightState.Won;
      let cause = '';
      let killer = '';
      const fd = sim.getFirstDeath();
      if (!won && fd.valid) {
        cause = fd.text;
        const k = sim.getUnit(fd.killer);
        if (k) killer = k.name;
      }
      if (won) postFightRevive(sim, spec.room);
      flow.onFightFinished(won ? FightResult.Won : st === FightState.TimedOut ? FightResult.TimedOut : FightResult.Wiped, cause, killer);
      saveGold();
      if (won && flow.active()) {
        out.ranksBought += bot.spend(flow);
        applyEssenceToSim(sim, flow.getSidebar());
      }
      if (spec.isRescue) {
        out.rescueFought = true;
        out.rescueWon = won;
      }
      const label = roomTypeName(spec.room) + (spec.isRescue ? '(rescue)' : '');
      out.log.push(formatRoomLine(spec.floor, spec.nodeId, label, won ? 'WIN' : fightStateName(st), partyHpText(sim),
        flow.getRun().essence, flow.getRun().gold, flow.getFloorKills(), flow.quota()));
      if (opt.stopAfterRescue && spec.isRescue && flow.active()) flow.abandon();
      continue;
    }
    const c = bot.choose(flow, sim ? partyHpFraction(sim) : 1.0);
    if (c.teleport) {
      const fromFloor = flow.getRun().floorNumber;
      const t = flow.teleport();
      out.log.push(`F${fromFloor} teleport up: ${t === TeleportResult.Victory ? 'victory' : 'next floor'}`);
      continue;
    }
    if (c.node < 0) break;
    const floorNo = flow.getRun().floorNumber;
    const e = flow.travel(c.node);
    if (e.kind === EntryKind.Exit && sim) out.exitRevived += exitRoomRevive(sim);
    saveGold();
    if (e.kind === EntryKind.Treasure || e.kind === EntryKind.Exit) {
      const n = flow.currentFloor().nodes[c.node];
      out.log.push(formatRoomLine(floorNo, c.node, roomTypeName(n.type), 'OK', sim ? partyHpText(sim) : '', flow.getRun().essence,
        flow.getRun().gold, flow.getFloorKills(), flow.quota()));
    }
  }
  if (flow.active()) flow.abandon();
  saveGold();
  meta.bestFloor = Math.max(meta.bestFloor, flow.getResults().floorReached);
  out.essenceSpent = flow.getEssenceSpent();
  out.results = flow.getResults();
  out.log.push(runResultsText(out.results));
  return out;
}
