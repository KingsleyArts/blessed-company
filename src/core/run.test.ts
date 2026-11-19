// Port of tests/run/tests.cpp: the run layer (runState, runFlow, runAuto, runBot, runSim, runMapView, metaSave, roster, temple,
// gearApply). One named test per rule, same names, seeds and numbers as the C++ suite. The printed C++ reports (bot runs over
// 20 seeds, rescue win rate, Elite fights per run) are pinned to the native output on this data.
import { describe, it } from 'vitest';
import { CHECK, NEAR, data as g_data } from './combatTestKit';
import { CombatSim, FightState } from './combatSim';
import { LogKind } from './combatSupport';
import { shippedEssenceConfig } from './essenceConfig';
import { EssenceSidebar, kBuyMax } from './essenceSidebar';
import { DamageTag, kNoUnit, type UnitId } from './eventBus';
import {
  Dir, EnemyType, RoomType, defaultConfig, dirDx, dirDy, doorDistances, generate, kDirCount, kEnemyTypeCount, makeConfig, oppositeDir,
} from './floorGenerator';
import { applyGearToSim } from './gearApply';
import { cloneMeta, kMetaMaxGold, makeMeta, metaEquals, parseMeta, resetProgress, serializeMeta, type MetaSave } from './metaSave';
import { fmtF } from './printf';
import { RosterResult, activeParty, ownedHeroes, rosterOwns, toggleActiveHero } from './roster';
import { AutoAction, AutoReason, chooseAuto } from './runAuto';
import { RunBot } from './runBot';
import { defaultRunConfig } from './runConfig';
import {
  EntryKind, FightResult, RunFlow, RunOutcome, TeleportResult, enemyTypeName, runOutcomeName, type FightSpec,
} from './runFlow';
import { buildMapView } from './runMapView';
import {
  exitRoomRevive, kExitReviveHpFraction, kReviveHp, makeRunSimOptions, postFightRevive, simulateBotRun,
} from './runSim';
import { endRun, enterNode, makeRunState, nextFloor, startRun } from './runState';
import { ModKind, ModSource, StatId, StatResolver } from './statResolver';
import {
  GearSlot, buyGear, buyPartyLuck, buyStatRanks, buyStatUnlock, defaultTempleConfig, gearKey, gearNextCost, gearTempleLevel,
  kGearMaxTempleLevel, partyLuckBonus, partyLuckNextCost, partyLuckRank, statNextCost, statTempleLevel, statUnlocked,
} from './temple';

const SLOW = 600_000;
const eqArr = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const lround = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

// ------------------------------------------------------------------------------------------ helpers
const CountEnemies = (s: FightSpec): number => s.enemies.length + s.waveEnemies.length;

/** Plays the pending fight as an instant win: every enemy dies (events), then the fight finishes. */
function WinPending(flow: RunFlow): void {
  const n = CountEnemies(flow.pendingFightSpec());
  for (let i = 0; i < n; ++i) flow.onEnemyKilled();
  flow.onFightFinished(FightResult.Won);
}

/** Walks the whole run with the bot and instant wins until the given floor is reached (or the run ends). */
function FakePlayUntilFloor(flow: RunFlow, botSeed: number, floor: number): void {
  const bot = new RunBot(botSeed);
  for (let steps = 0; flow.active() && flow.getRun().floorNumber < floor && steps < 5000; ++steps) {
    if (flow.fightPending()) {
      WinPending(flow);
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
}

/** Walks to a room by doors (BFS over the whole floor, ignoring fog) winning every fight on the way. */
function WalkByDoors(flow: RunFlow, target: number): void {
  const f = flow.currentFloor();
  for (let guard = 0; flow.currentNode() !== target && guard < 100; ++guard) {
    if (flow.fightPending()) WinPending(flow);
    const dist = doorDistances(f, target);
    let best = -1;
    for (const nb of flow.adjacent()) {
      if (dist[nb] < dist[flow.currentNode()]) {
        best = nb;
        break;
      }
    }
    if (best < 0) return;
    flow.travel(best);
  }
  if (flow.fightPending()) WinPending(flow);
}

/** A won fight in which the units in `fallenMask` died DURING the fight. bit 0 Warrior, bit 1 Mage, bit 2 Priest. */
class WonFight {
  sim: CombatSim;
  w: UnitId;
  m: UnitId;
  p: UnitId;
  constructor(fallenMask: number) {
    this.sim = new CombatSim(g_data, 3);
    const sim = this.sim;
    this.w = sim.addPartyUnit('Warrior');
    this.m = sim.addPartyUnit('Mage');
    this.p = sim.addPartyUnit('Priest');
    const g = sim.addEnemy('Grunt', 1);
    sim.startFight();
    const ids = [this.w, this.m, this.p];
    let survivor: UnitId = kNoUnit;
    for (let i = 0; i < 3; ++i) if (!(fallenMask & (1 << i))) survivor = ids[i];
    for (let i = 0; i < 3; ++i) if (fallenMask & (1 << i)) sim.dealDamage(g, ids[i], 100000.0, DamageTag.Ability);
    sim.mutableUnit(this.w)!.hp = sim.getUnit(this.w)!.alive ? 5.0 : 0.0;
    if (survivor !== kNoUnit) sim.dealDamage(survivor, g, 100000.0, DamageTag.Ability);
    sim.step();
  }
  Alive(id: UnitId): boolean { return this.sim.getUnit(id)!.alive; }
  Hp(id: UnitId): number { return this.sim.getUnit(id)!.hp; }
  ExitHp(id: UnitId): number { return kExitReviveHpFraction * this.sim.maxHp(this.sim.getUnit(id)!); }
  AtExitHp(id: UnitId): boolean { return Math.abs(this.Hp(id) - this.ExitHp(id)) < 1e-9; }
}

describe('run', () => {
  // ---------------------------------------------------------------------------------------- roster (party picker)
  it('roster_defaults_and_ownership', () => {
    const m = makeMeta();
    CHECK(eqArr(ownedHeroes(m), ['Warrior', 'Mage', 'Assassin']));
    CHECK(eqArr(activeParty(m), ['Warrior', 'Mage']));
    CHECK(!rosterOwns(m, 'Priest'));
    m.priestUnlocked = true;
    CHECK(rosterOwns(m, 'Priest') && ownedHeroes(m).length === 4);
    CHECK(eqArr(activeParty(m), ['Warrior', 'Mage', 'Priest']));
  });

  it('roster_toggle_rules', () => {
    const m = makeMeta();
    CHECK(toggleActiveHero(m, 'Priest') === RosterResult.NotOwned);
    CHECK(toggleActiveHero(m, 'Assassin') === RosterResult.Added);
    CHECK(eqArr(activeParty(m), ['Warrior', 'Mage', 'Assassin']));
    m.priestUnlocked = true;
    CHECK(toggleActiveHero(m, 'Priest') === RosterResult.PartyFull);
    CHECK(toggleActiveHero(m, 'Mage') === RosterResult.Removed);
    CHECK(toggleActiveHero(m, 'Priest') === RosterResult.Added);
    CHECK(eqArr(activeParty(m), ['Warrior', 'Assassin', 'Priest']));
    CHECK(toggleActiveHero(m, 'Warrior') === RosterResult.Removed);
    CHECK(toggleActiveHero(m, 'Assassin') === RosterResult.Removed);
    CHECK(toggleActiveHero(m, 'Priest') === RosterResult.LastHero);
    CHECK(activeParty(m).length === 1);
  });

  it('roster_sanitises_a_bad_saved_party', () => {
    const m = makeMeta();
    m.activeParty = ['Priest', 'Mage', 'Mage', 'Barbarian', 'Warrior', 'Assassin'];
    CHECK(eqArr(activeParty(m), ['Mage', 'Warrior', 'Assassin']));
    m.activeParty = ['Priest'];
    CHECK(eqArr(activeParty(m), ['Warrior', 'Mage']));
  });

  it('roster_saves_and_a_v2_file_without_it_loads', () => {
    const m = makeMeta();
    m.priestUnlocked = true;
    m.activeParty = ['Assassin', 'Priest', 'Warrior'];
    const p = parseMeta(serializeMeta(m));
    CHECK(p.ok && metaEquals(p.meta, m) && eqArr(p.meta.activeParty, m.activeParty));
    const old = parseMeta('TolMeta=2\nfaith=5\npartyGold=1\npriestUnlocked=0\nbestFloor=2\n');
    CHECK(old.ok && old.meta.activeParty.length === 0 && activeParty(old.meta).length === 2);
    resetProgress(m);
    CHECK(m.activeParty.length === 0);
  });

  it('run_starts_with_exactly_the_picked_party', () => {
    const f = new RunFlow();
    f.setStartParty(['Warrior', 'Assassin', 'Mage']);
    f.start(11, false);
    CHECK(eqArr(f.getRun().party, ['Warrior', 'Assassin', 'Mage']));
    CHECK(!f.partyHasPriest());
    CHECK(f.getRun().floor.rescueNode < 0 || f.getRun().floorNumber !== 2);
    const g = new RunFlow();
    g.setStartParty(['Warrior', 'Priest']);
    g.start(11, false);
    CHECK(g.partyHasPriest() && g.getRun().party.length === 2);
  });

  it('a_benched_priestess_is_not_rescued_again', () => {
    const f = new RunFlow();
    f.setStartParty(['Warrior', 'Mage']);
    f.setPriestOwned(true);
    f.start(21, false, 2);
    CHECK(!f.partyHasPriest());
    CHECK(f.getRun().floor.rescueNode < 0);
    const h = new RunFlow();
    h.setStartParty(['Warrior', 'Mage']);
    h.start(21, false, 2);
    CHECK(h.getRun().floor.rescueNode >= 0);
  });

  // ---------------------------------------------------------------------------------------- RunState
  it('run_state_start', () => {
    const r = makeRunState();
    startRun(r, 123, ['Warrior', 'Mage']);
    CHECK(r.active);
    CHECK(r.floorNumber === 1);
    CHECK(r.currentNode === r.floor.startNode);
    CHECK(r.floor.nodes[r.currentNode].revealed);
    CHECK(r.party.length === 2);
  });

  it('run_state_same_seed_same_floor', () => {
    const a = makeRunState();
    const b = makeRunState();
    startRun(a, 777, ['Warrior']);
    startRun(b, 777, ['Warrior']);
    CHECK(a.floor.nodes.length === b.floor.nodes.length);
    CHECK(a.floor.crystalNode === b.floor.crystalNode);
    nextFloor(a);
    nextFloor(b);
    CHECK(a.floor.seed === b.floor.seed);
    CHECK(a.floorNumber === 2);
  });

  it('run_state_enter_node_rules', () => {
    const r = makeRunState();
    startRun(r, 9, ['Warrior']);
    const bad = r.floor.nodes.length + 5;
    CHECK(!enterNode(r, bad));
    const start = r.floor.nodes[r.currentNode];
    CHECK(start.next.length > 0);
    CHECK(enterNode(r, start.next[0]));
    CHECK(r.currentNode === start.next[0]);
    CHECK(enterNode(r, r.floor.startNode));
    CHECK(r.currentNode === r.floor.startNode);
    endRun(r);
    CHECK(!enterNode(r, 0));
  });

  it('run_state_boss_floor_reached', () => {
    const r = makeRunState();
    startRun(r, 5, ['Warrior']);
    for (let i = 1; i < 10; ++i) nextFloor(r);
    CHECK(r.floorNumber === 10);
    CHECK(r.floor.isBoss);
    CHECK(r.floor.crystalRequiresBossKill);
  });

  // ---------------------------------------------------------------------------------------- run flow
  it('run_flow_start_room_is_a_fight_built_from_the_pack', () => {
    const flow = new RunFlow();
    flow.start(31, false);
    CHECK(flow.active());
    CHECK(flow.getRun().floorNumber === 1);
    CHECK(flow.fightPending());
    const s = flow.pendingFightSpec();
    const start = flow.currentFloor().nodes[flow.currentFloor().startNode];
    CHECK(s.nodeId === start.id);
    CHECK(s.floor === 1);
    CHECK(s.room === RoomType.Combat);
    CHECK(s.enemies.length === start.pack.size);
    const want = new Map<string, number>();
    for (let t = 0; t < kEnemyTypeCount; ++t) if (start.pack.counts[t] > 0) want.set(enemyTypeName(t as EnemyType), start.pack.counts[t]);
    const got = new Map<string, number>();
    for (const e of s.enemies) got.set(e, (got.get(e) ?? 0) + 1);
    CHECK(want.size === got.size && [...want].every(([k, v]) => got.get(k) === v));
    CHECK(!s.isRescue && s.joinClass === '');
    CHECK(flow.getRun().party.length === 2);
    CHECK(flow.adjacent().length > 0);
    CHECK(flow.travel(flow.adjacent()[0]).kind === EntryKind.Rejected);
    WinPending(flow);
    CHECK(!flow.fightPending());
    CHECK(flow.isCleared(start.id));
    CHECK(flow.travel(9999).kind === EntryKind.Rejected);
  });

  it('run_flow_reinforcement_wave_from_the_node', () => {
    let checked = false;
    for (let seed = 1; seed <= 60 && !checked; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      const bot = new RunBot(seed);
      for (let steps = 0; flow.active() && steps < 400 && !checked; ++steps) {
        if (flow.fightPending()) {
          const s = flow.pendingFightSpec();
          const n = flow.currentFloor().nodes[s.nodeId];
          CHECK(s.hasWave === (n.hasReinforcements && n.reinforcements.size > 0 && !(s.isRescue && !flow.config().rescueWave)));
          if (s.hasWave) {
            CHECK(s.waveEnemies.length === n.reinforcements.size);
            CHECK(s.waveAtSeconds >= flow.config().waveMinSeconds && s.waveAtSeconds <= flow.config().waveMaxSeconds);
            checked = true;
          }
          WinPending(flow);
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
    }
    CHECK(checked);
  });

  it('treasure_pays_gold_with_no_fight', () => {
    let done = false;
    for (let seed = 1; seed <= 200 && !done; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      WinPending(flow);
      flow.consumeGoldDelta();
      const f = flow.currentFloor();
      for (const a of flow.adjacent()) {
        if (f.nodes[a].type !== RoomType.Treasure) continue;
        const goldBefore = flow.getRun().gold;
        const essBefore = flow.getRun().essence;
        const e = flow.travel(a);
        CHECK(e.kind === EntryKind.Treasure);
        CHECK(!flow.fightPending());
        CHECK(e.gold === flow.config().goldTreasure);
        CHECK(flow.getRun().gold === goldBefore + flow.config().goldTreasure);
        CHECK(flow.getRun().essence === essBefore);
        CHECK(flow.consumeGoldDelta() === flow.config().goldTreasure);
        CHECK(flow.consumeGoldDelta() === 0);
        CHECK(flow.isCleared(a));
        flow.travel(flow.currentFloor().startNode);
        CHECK(flow.travel(a).kind === EntryKind.Passed);
        CHECK(flow.getRun().gold === goldBefore + flow.config().goldTreasure);
        done = true;
        break;
      }
    }
    CHECK(done);
  });

  it('boss_exit_room_revives_everyone_including_the_priest', () => {
    {
      const f = new WonFight(1 << 2);
      CHECK(f.sim.getState() === FightState.Won && !f.Alive(f.p) && f.Alive(f.w) && f.Alive(f.m));
      CHECK(f.sim.postWinRevive() === 0 && !f.Alive(f.p));
      const mageHp = f.Hp(f.m);
      CHECK(exitRoomRevive(f.sim) === 1);
      CHECK(f.Alive(f.p) && f.AtExitHp(f.p) && f.Hp(f.p) > kReviveHp);
      CHECK(Math.abs(f.Hp(f.w) - 5.0) < 1e-9 && Math.abs(f.Hp(f.m) - mageHp) < 1e-9);
      CHECK(exitRoomRevive(f.sim) === 0);
    }
    {
      const f = new WonFight(0b011);
      CHECK(f.sim.getState() === FightState.Won && !f.Alive(f.w) && !f.Alive(f.m) && f.Alive(f.p));
      CHECK(f.sim.postWinRevive() === 2);
      CHECK(f.Alive(f.w) && f.Alive(f.m) && Math.abs(f.Hp(f.w) - kReviveHp) < 1e-9 && Math.abs(f.Hp(f.m) - kReviveHp) < 1e-9);
      const priestHp = f.Hp(f.p);
      CHECK(exitRoomRevive(f.sim) === 0);
      CHECK(Math.abs(f.Hp(f.w) - kReviveHp) < 1e-9 && Math.abs(f.Hp(f.p) - priestHp) < 1e-9);
    }
    {
      const f = new WonFight(0b110);
      CHECK(f.sim.getState() === FightState.Won && f.Alive(f.w) && !f.Alive(f.m) && !f.Alive(f.p));
      CHECK(f.sim.postWinRevive() === 0);
      CHECK(exitRoomRevive(f.sim) === 2);
      CHECK(f.Alive(f.m) && f.Alive(f.p) && f.AtExitHp(f.m) && f.AtExitHp(f.p));
      CHECK(Math.abs(f.Hp(f.w) - 5.0) < 1e-9);
    }
    {
      const f = new WonFight(0b110);
      CHECK(f.sim.postWinRevive() === 0 && !f.Alive(f.m) && !f.Alive(f.p));
    }
    {
      const flow = new RunFlow();
      flow.start(11, true);
      FakePlayUntilFloor(flow, 1, 10);
      CHECK(flow.active() && flow.currentFloor().isBoss && flow.fightPending());
      flow.onFightFinished(FightResult.Wiped);
      CHECK(!flow.active());
      const exitNode = flow.currentFloor().crystalNode;
      CHECK(flow.travel(exitNode).kind === EntryKind.Rejected);
      CHECK(!flow.inCrystalRoom());
    }
    {
      const flow = new RunFlow();
      flow.start(11, true);
      FakePlayUntilFloor(flow, 1, 10);
      CHECK(flow.active() && flow.currentFloor().isBoss && flow.fightPending());
      const exitNode = flow.currentFloor().crystalNode;
      CHECK(flow.currentFloor().nodes[exitNode].type === RoomType.Exit);
      WinPending(flow);
      CHECK(flow.travel(exitNode).kind === EntryKind.Exit);
      CHECK(flow.inCrystalRoom() && flow.canTeleport());
    }
  });

  it('boss_win_skips_post_fight_revive_and_exit_revives_all_at_20_percent', () => {
    CHECK(kExitReviveHpFraction === 0.2);
    {
      const f = new WonFight(0b011);
      CHECK(f.sim.getState() === FightState.Won && !f.Alive(f.w) && !f.Alive(f.m) && f.Alive(f.p));
      CHECK(postFightRevive(f.sim, RoomType.Boss) === 0);
      CHECK(!f.Alive(f.w) && !f.Alive(f.m));
      f.sim.mutableUnit(f.w)!.attackTimer = 0.4;
      f.sim.mutableUnit(f.w)!.goalTimer = 0.7;
      const priestHp = f.Hp(f.p);
      CHECK(exitRoomRevive(f.sim) === 2);
      CHECK(f.Alive(f.w) && f.Alive(f.m) && f.AtExitHp(f.w) && f.AtExitHp(f.m));
      CHECK(Math.abs(f.Hp(f.w) - 0.2 * f.sim.maxHp(f.sim.getUnit(f.w)!)) < 1e-9);
      CHECK(f.sim.getUnit(f.w)!.attackTimer === 0.0 && f.sim.getUnit(f.w)!.goalTimer === 0.0);
      CHECK(Math.abs(f.Hp(f.p) - priestHp) < 1e-9);
    }
    {
      const f = new WonFight(1 << 2);
      CHECK(postFightRevive(f.sim, RoomType.Boss) === 0 && !f.Alive(f.p));
      CHECK(exitRoomRevive(f.sim) === 1);
      CHECK(f.Alive(f.p) && f.AtExitHp(f.p));
      CHECK(Math.abs(f.Hp(f.p) - 0.2 * f.sim.maxHp(f.sim.getUnit(f.p)!)) < 1e-9);
    }
    for (const room of [RoomType.Combat, RoomType.Elite]) {
      const a = new WonFight(0b011);
      CHECK(postFightRevive(a.sim, room) === 2);
      CHECK(a.Alive(a.w) && a.Alive(a.m) && Math.abs(a.Hp(a.w) - kReviveHp) < 1e-9 && Math.abs(a.Hp(a.m) - kReviveHp) < 1e-9);
      const b = new WonFight(0b110);
      CHECK(postFightRevive(b.sim, room) === 0 && !b.Alive(b.m) && !b.Alive(b.p));
    }
    {
      const flow = new RunFlow();
      flow.start(11, true);
      FakePlayUntilFloor(flow, 1, 10);
      CHECK(flow.fightPending() && flow.pendingFightSpec().room === RoomType.Boss);
      flow.onFightFinished(FightResult.TimedOut);
      CHECK(!flow.active() && flow.travel(flow.currentFloor().crystalNode).kind === EntryKind.Rejected);
    }
  });

  it('exit_revive_clears_transient_state_and_uses_resolved_max_hp', () => {
    const f = new WonFight(0b110);
    CHECK(f.sim.getState() === FightState.Won && !f.Alive(f.m) && !f.Alive(f.p) && f.Alive(f.w));
    const m = f.sim.mutableUnit(f.m)!;
    m.stats.addModifier(StatId.Health, ModKind.Flat, 50.0, ModSource.Essence);
    m.target = f.w;
    m.hasGoal = true;
    m.goalTimer = 0.7;
    m.attackTimer = 0.4;
    m.abilityTimer = 3.0;
    m.tauntLeft = 2.0;
    m.tauntEnemiesLeft = 2.0;
    m.dmgReduction = m.dmgReductionLeft = 0.5;
    m.rageLifesteal = m.rageLifestealLeft = 0.3;
    m.retreating = true;
    m.tauntForced = true;
    m.stats.addModifier(StatId.Health, ModKind.Flat, 10.0, ModSource.Buff, 5.0);
    CHECK(m.stats.modifierCountForSource(ModSource.Buff) === 1);
    m.damageFrom = [9, 9, 9, 9];
    m.damageTaken = 99.0;
    m.kills = 3;
    let enemyId: UnitId = kNoUnit;
    for (const u of f.sim.getUnits()) if (u.enemy) enemyId = u.id;
    const e = f.sim.mutableUnit(enemyId)!;
    e.target = f.m;
    e.threat = [5, 5, 5, 5];
    const warriorHp = f.Hp(f.w);

    CHECK(exitRoomRevive(f.sim) === 2);
    const r = f.sim.getUnit(f.m)!;
    CHECK(r.alive && !r.removed);
    CHECK(r.target === kNoUnit && !r.hasGoal && r.goalTimer === 0.0);
    CHECK(r.attackTimer === 0.0 && r.tauntLeft === 0.0 && r.tauntEnemiesLeft === 0.0);
    CHECK(r.dmgReduction === 0.0 && r.dmgReductionLeft === 0.0 && r.rageLifesteal === 0.0 && r.rageLifestealLeft === 0.0);
    CHECK(!r.retreating && !r.tauntForced && r.buffRefs.length === 0);
    CHECK(r.stats.modifierCountForSource(ModSource.Buff) === 0);
    CHECK(r.damageFrom.length === 0 && r.threat.length === 0 && r.damageTaken === 0.0 && r.kills === 0);
    CHECK(Math.abs(r.abilityTimer - 3.0) > 1e-9);
    CHECK(f.sim.getUnit(enemyId)!.target === kNoUnit);
    CHECK(f.sim.getUnit(enemyId)!.threat[f.m] === 0.0);
    CHECK(f.AtExitHp(f.m) && f.AtExitHp(f.p));
    CHECK(Math.abs(r.hp - kExitReviveHpFraction * r.stats.get(StatId.Health)) < 1e-9);
    CHECK(r.hp > kReviveHp);
    CHECK(Math.abs(f.Hp(f.w) - warriorHp) < 1e-9 && f.Alive(f.w));
    const mageHp = r.hp;
    CHECK(exitRoomRevive(f.sim) === 0);
    CHECK(Math.abs(f.Hp(f.m) - mageHp) < 1e-9);
    let noted = false;
    for (const le of f.sim.getLog().getEntries()) {
      if (le.kind === LogKind.Note && le.text.includes('Exit room revive') && le.text.includes('Mage')) noted = true;
    }
    CHECK(noted);
  });

  it('payout_numbers_match_the_docs', () => {
    const c = defaultRunConfig();
    CHECK(c.essencePerKill === 5 && c.essencePerRoom === 10);
    CHECK(c.goldCombat === 10 && c.goldElite === 25 && c.goldBoss === 50);
  });

  it('payouts_essence_per_kill_and_room_gold_by_room_type', () => {
    const flow = new RunFlow();
    flow.start(31, false);
    const c = flow.config();
    const n = CountEnemies(flow.pendingFightSpec());
    for (let i = 0; i < n; ++i) {
      flow.onEnemyKilled();
      CHECK(flow.getRun().essence === (i + 1) * c.essencePerKill);
    }
    CHECK(flow.getRun().gold === 0);
    flow.onFightFinished(FightResult.Won);
    CHECK(flow.getRun().essence === n * c.essencePerKill + c.essencePerRoom);
    CHECK(flow.getRun().gold === c.goldCombat);
    CHECK(flow.consumeGoldDelta() === c.goldCombat);
    let elite = false;
    for (let seed = 1; seed <= 200 && !elite; ++seed) {
      const f2 = new RunFlow();
      f2.start(seed, true);
      FakePlayUntilFloor(f2, seed, 3);
      if (!f2.active() || f2.getRun().floorNumber !== 3) continue;
      if (f2.fightPending()) WinPending(f2);
      const f3 = f2.currentFloor();
      let eliteRoom = -1;
      for (const en of f3.nodes) {
        if (en.type === RoomType.Elite) {
          eliteRoom = en.id;
          break;
        }
      }
      if (eliteRoom < 0) continue;
      const via = f3.nodes[eliteRoom].next.length > 0 ? f3.nodes[eliteRoom].next[0] : -1;
      WalkByDoors(f2, via);
      if (f2.fightPending() || f2.currentNode() !== via || f2.isCleared(eliteRoom)) continue;
      f2.travel(eliteRoom);
      CHECK(f2.fightPending() && f2.pendingFightSpec().room === RoomType.Elite);
      const g0 = f2.getRun().gold;
      const e0 = f2.getRun().essence;
      const kills = CountEnemies(f2.pendingFightSpec());
      WinPending(f2);
      CHECK(f2.getRun().gold === g0 + c.goldElite);
      CHECK(f2.getRun().essence === e0 + kills * c.essencePerKill + c.essencePerRoom);
      elite = true;
    }
    CHECK(elite);
    const boss = new RunFlow();
    boss.start(77, false);
    FakePlayUntilFloor(boss, 77, 10);
    CHECK(boss.getRun().floorNumber === 10);
    CHECK(boss.fightPending() && boss.pendingFightSpec().room === RoomType.Boss);
    const g0 = boss.getRun().gold;
    WinPending(boss);
    CHECK(boss.getRun().gold === g0 + c.goldBoss);
  });

  it('quota_and_crystal_both_required_to_teleport', () => {
    for (let seed = 1; seed <= 20; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, true);
      const f = flow.currentFloor();
      CHECK(!flow.isCrystalFound());
      CHECK(f.killQuota >= 1 && !f.isBoss);
      WinPending(flow);
      const bot = new RunBot(seed);
      let guard = 0;
      while (!flow.isCrystalFound() && guard++ < 200) {
        if (flow.fightPending()) {
          WinPending(flow);
          continue;
        }
        const c = bot.choose(flow, 1.0);
        if (c.node < 0) break;
        flow.travel(c.node);
      }
      CHECK(flow.isCrystalFound());
      if (flow.fightPending()) WinPending(flow);
      CHECK(flow.canTeleport() === (flow.isCrystalFound() && flow.getFloorKills() >= f.killQuota));
      if (flow.getFloorKills() < f.killQuota) {
        CHECK(!flow.canTeleport());
        CHECK(flow.teleport() === TeleportResult.Rejected);
        CHECK(flow.getRun().floorNumber === 1);
        while (flow.getFloorKills() < f.killQuota - 1) flow.onEnemyKilled();
        CHECK(!flow.canTeleport());
        flow.onEnemyKilled();
        CHECK(flow.quotaMet());
      }
      CHECK(flow.canTeleport());
      CHECK(flow.teleport() === TeleportResult.NextFloor);
      CHECK(flow.getRun().floorNumber === 2);
      CHECK(!flow.isCrystalFound());
      CHECK(flow.getFloorKills() === 0);
    }
    const flow = new RunFlow();
    flow.start(5, true);
    WinPending(flow);
    for (let i = 0; i < flow.quota() + 3; ++i) flow.onEnemyKilled();
    CHECK(flow.quotaMet());
    CHECK(!flow.isCrystalFound());
    CHECK(!flow.canTeleport());
    CHECK(flow.teleport() === TeleportResult.Rejected);
  });

  it('entering_the_crystal_node_marks_it_found', () => {
    const flow = new RunFlow();
    flow.start(12, true);
    const crystal = flow.currentFloor().crystalNode;
    CHECK(crystal >= 0 && flow.currentFloor().nodes[crystal].hasCrystal);
    CHECK(!flow.isCrystalFound());
    const bot = new RunBot(12);
    for (let steps = 0; !flow.isCrystalFound() && steps < 300; ++steps) {
      if (flow.fightPending()) {
        WinPending(flow);
        continue;
      }
      const c = bot.choose(flow, 1.0);
      if (c.node < 0) break;
      CHECK(flow.isCrystalFound() === (flow.currentNode() === crystal) || !flow.isCrystalFound());
      flow.travel(c.node);
    }
    CHECK(flow.isCrystalFound());
    CHECK(flow.currentNode() === crystal);
  });

  it('boss_floor_has_no_quota_and_crystal_needs_the_boss_dead', () => {
    const flow = new RunFlow();
    flow.start(5, false);
    FakePlayUntilFloor(flow, 5, 10);
    CHECK(flow.active());
    CHECK(flow.getRun().floorNumber === 10);
    const f = flow.currentFloor();
    CHECK(f.isBoss && f.crystalRequiresBossKill && f.killQuota === 0);
    CHECK(flow.quotaMet());
    CHECK(flow.fightPending() && flow.pendingFightSpec().room === RoomType.Boss);
    CHECK(!flow.canTeleport());
    flow.travel(1);
    CHECK(flow.currentNode() === f.startNode);
    CHECK(!flow.isCrystalFound());
    WinPending(flow);
    CHECK(flow.isBossKilled());
    CHECK(!flow.canTeleport());
    const e = flow.travel(1);
    CHECK(e.kind === EntryKind.Exit);
    CHECK(flow.isCrystalFound());
    CHECK(flow.canTeleport());
    CHECK(flow.teleport() === TeleportResult.Victory);
    CHECK(!flow.active());
    CHECK(flow.getResults().outcome === RunOutcome.Victory);
    CHECK(flow.getResults().floorReached === 10);
    const other = new RunFlow();
    other.start(6, false);
    FakePlayUntilFloor(other, 6, 10);
    for (let i = 0; i < 50; ++i) other.onEnemyKilled();
    CHECK(!other.canTeleport());
  });

  it('wipe_ends_the_run_with_results', () => {
    const flow = new RunFlow();
    flow.start(2024, false);
    WinPending(flow);
    const bot = new RunBot(2024);
    for (let steps = 0; !flow.fightPending() && steps < 50; ++steps) {
      const c = bot.choose(flow, 1.0);
      if (c.node < 0) break;
      flow.travel(c.node);
    }
    CHECK(flow.fightPending());
    const gold = flow.getRun().gold;
    const essence = flow.getRun().essence;
    flow.onEnemyKilled();
    flow.onFightFinished(FightResult.Wiped, 'First to fall: Mage#1 at 12.00s, killed by Grunt#2', 'Grunt');
    CHECK(!flow.active());
    const r = flow.getResults();
    CHECK(r.outcome === RunOutcome.Wiped);
    CHECK(r.floorReached === 1);
    CHECK(r.seed === 2024n);
    CHECK(r.essenceEarned === essence + flow.config().essencePerKill);
    CHECK(r.goldEarned === gold);
    CHECK(r.causeOfDeath === 'First to fall: Mage#1 at 12.00s, killed by Grunt#2');
    CHECK(r.killerName === 'Grunt');
    CHECK(r.essenceCarryOver === 0);
    CHECK(flow.travel(0).kind === EntryKind.Rejected);
    CHECK(flow.teleport() === TeleportResult.Rejected);
    const t = new RunFlow();
    t.start(1, false);
    t.onFightFinished(FightResult.TimedOut);
    CHECK(!t.active() && t.getResults().outcome === RunOutcome.Wiped && t.getResults().causeOfDeath !== '');
  });

  it('abandon_run_keeps_gold_and_gives_no_essence_carry_over', () => {
    const flow = new RunFlow();
    const meta = makeMeta();
    flow.start(40, false);
    WinPending(flow);
    meta.gold += flow.consumeGoldDelta();
    CHECK(meta.gold === flow.config().goldCombat);
    CHECK(flow.getRun().essence > 0);
    flow.abandon();
    CHECK(!flow.active());
    const r = flow.getResults();
    CHECK(r.outcome === RunOutcome.Abandoned);
    CHECK(r.essenceCarryOver === 0);
    CHECK(r.goldEarned === flow.config().goldCombat);
    CHECK(meta.gold === flow.config().goldCombat);
    CHECK(flow.consumeGoldDelta() === 0);
    flow.abandon();
    CHECK(flow.getResults().outcome === RunOutcome.Abandoned);
  });

  // ---------------------------------------------------------------------------------------- Priest rescue
  it('priest_rescue_room_on_floor_2_adds_the_priest_and_a_tougher_pack', () => {
    for (let seed = 1; seed <= 30; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      const bot = new RunBot(seed);
      let sawRescue = false;
      for (let steps = 0; flow.active() && steps < 600 && !sawRescue; ++steps) {
        if (flow.fightPending()) {
          const s = flow.pendingFightSpec();
          if (flow.getRun().floorNumber === 1) CHECK(!s.isRescue);
          if (s.isRescue) {
            sawRescue = true;
            const n = flow.currentFloor().nodes[s.nodeId];
            CHECK(flow.getRun().floorNumber === 2 && n.type === RoomType.Elite && n.isRescueRoom);
            CHECK(s.joinClass === 'Priest');
            CHECK(s.enemies.length === n.pack.size + flow.config().rescueExtraEnemies);
            CHECK(s.hasWave === flow.config().rescueWave);
            CHECK(flow.getRun().party.length === 3 && flow.partyHasPriest());
            CHECK(flow.priestRescuedThisRun());
            CHECK(flow.consumePriestUnlock());
            CHECK(!flow.consumePriestUnlock());
            WinPending(flow);
            CHECK(flow.getRun().party.length === 3);
            CHECK(flow.canTeleport() === (flow.isCrystalFound() && flow.quotaMet() && flow.inCrystalRoom()));
            continue;
          }
          WinPending(flow);
          continue;
        }
        const c = bot.choose(flow, 1.0);
        if (c.teleport) {
          CHECK(flow.getRun().floorNumber === 1 || flow.partyHasPriest());
          flow.teleport();
          continue;
        }
        if (c.node < 0) break;
        flow.travel(c.node);
      }
      CHECK(sawRescue, `seed ${seed}`);
    }
  });

  it('floor_2_cannot_be_left_before_the_priest_is_rescued', () => {
    let tested = 0;
    let crystalIsRescueRoom = 0;
    for (let seed = 1; seed <= 60; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      FakePlayUntilFloor(flow, seed, 2);
      CHECK(flow.getRun().floorNumber === 2 && flow.rescueOutstanding());
      const f = flow.currentFloor();
      const start = f.nodes[f.startNode];
      CHECK(!flow.fightPending());
      CHECK(flow.isCleared(f.startNode) && flow.currentNode() === f.startNode);
      CHECK(start.isDeadEnd && start.pack.size === 0 && start.next.length === 1 && start.next[0] === f.rescueNode);
      CHECK(eqArr(flow.adjacent(), [f.rescueNode]));
      CHECK(!flow.canTeleport());
      while (!flow.quotaMet()) flow.onEnemyKilled();
      const gold = flow.getRun().gold;
      const essence = flow.getRun().essence;
      CHECK(flow.travel(f.rescueNode).kind === EntryKind.Fight);
      CHECK(flow.pendingFightSpec().isRescue && flow.pendingFightSpec().joinClass === flow.config().rescueClass);
      CHECK(!flow.canTeleport() && flow.teleportRefusal() !== '');
      CHECK(flow.teleport() === TeleportResult.Rejected);
      crystalIsRescueRoom += f.crystalNode === f.rescueNode ? 1 : 0;
      WinPending(flow);
      CHECK(!flow.rescueOutstanding() && flow.partyHasPriest());
      CHECK(flow.getRun().gold === gold + flow.config().goldElite && flow.getRun().essence > essence);
      ++tested;
    }
    CHECK(tested === 60 && crystalIsRescueRoom > 0);
  });

  it('floor_1_without_the_priest_hands_out_grunt_only_fights_without_waves', () => {
    const cfg = defaultRunConfig();
    let otherEnemies = false;
    for (let seed = 1; seed <= 60; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      CHECK(flow.currentFloor().isTutorial && flow.currentFloor().roomRoll <= cfg.floor.tutorialRoomCountMax);
      for (let steps = 0; flow.active() && flow.getRun().floorNumber === 1 && steps < 400; ++steps) {
        if (flow.fightPending()) {
          const sp = flow.pendingFightSpec();
          CHECK(sp.room === RoomType.Combat && !sp.hasWave && sp.waveEnemies.length === 0 && !sp.isRescue);
          for (const e of sp.enemies) CHECK(e === 'Grunt');
          CHECK(sp.enemies.length <= cfg.floor.tutorialPackMax);
          WinPending(flow);
          continue;
        }
        const c = new RunBot(seed).choose(flow, 1.0);
        if (c.teleport) {
          flow.teleport();
          break;
        }
        if (c.node < 0) break;
        flow.travel(c.node);
      }
      const later = new RunFlow();
      later.start(seed, true);
      CHECK(!later.currentFloor().isTutorial);
      for (const e of later.pendingFightSpec().enemies) otherEnemies ||= e !== 'Grunt';
    }
    CHECK(otherEnemies);
  });

  it('the_empty_start_room_of_the_rescue_floor_pays_nothing', () => {
    const flow = new RunFlow();
    flow.start(21, false);
    FakePlayUntilFloor(flow, 21, 2);
    CHECK(flow.getRun().floorNumber === 2 && !flow.fightPending());
    const essence = flow.getRun().essence;
    const gold = flow.getRun().gold;
    flow.consumeGoldDelta();
    CHECK(flow.travel(flow.currentFloor().rescueNode).kind === EntryKind.Fight);
    CHECK(flow.travel(flow.currentFloor().startNode).kind === EntryKind.Rejected);
    CHECK(flow.getRun().essence === essence && flow.getRun().gold === gold && flow.consumeGoldDelta() === 0);
  });

  it('unlocked_priest_joins_from_the_start_of_later_runs', () => {
    const later = new RunFlow();
    later.start(50, true);
    CHECK(later.getRun().party.length === 3 && later.partyHasPriest());
    CHECK(eqArr(later.getRun().party, ['Warrior', 'Mage', 'Priest']));
    CHECK(!later.rescueOutstanding());
    const first = new RunFlow();
    first.start(50, false);
    CHECK(first.getRun().party.length === 2);
    CHECK(first.rescueOutstanding() === false);
    FakePlayUntilFloor(later, 50, 2);
    const bot = new RunBot(50);
    for (let steps = 0; later.active() && steps < 600; ++steps) {
      if (later.fightPending()) {
        const s = later.pendingFightSpec();
        CHECK(!s.isRescue && s.joinClass === '');
        const n = later.currentFloor().nodes[s.nodeId];
        CHECK(s.enemies.length === n.pack.size);
        WinPending(later);
        continue;
      }
      const c = bot.choose(later, 1.0);
      if (c.teleport) {
        if (later.getRun().floorNumber >= 3) break;
        later.teleport();
        continue;
      }
      if (c.node < 0) break;
      later.travel(c.node);
    }
  });

  it('priest_joins_at_30_percent_hp_while_the_party_keeps_carried_hp', () => {
    const sim = new CombatSim(g_data, 3);
    const w = sim.addPartyUnit('Warrior');
    const m = sim.addPartyUnit('Mage');
    sim.addEnemy('Grunt', 1);
    sim.startFight();
    sim.runToEnd();
    CHECK(sim.getState() === FightState.Won);
    sim.postWinRevive();
    sim.mutableUnit(w)!.hp = 111.0;
    sim.mutableUnit(m)!.hp = 33.0;
    sim.prepareNextFight();
    const p = sim.addRescuedUnit('Priest');
    CHECK(p !== kNoUnit && sim.getUnit(p)!.name === 'Priest');
    CHECK(Math.abs(sim.getUnit(p)!.hp - 0.5 * sim.maxHp(sim.getUnit(p)!)) < 1e-9);
    CHECK(Math.abs(sim.getUnit(0)!.hp - 111.0) < 1e-9);
    CHECK(Math.abs(sim.getUnit(1)!.hp - 33.0) < 1e-9);
    sim.addEnemy('Grunt', 2);
    sim.addEnemy('Grunt', 2);
    sim.startFight();
    const st = sim.runToEnd();
    CHECK(st === FightState.Won || st === FightState.Wiped);
    let healed = 0;
    for (const u of sim.getUnits()) if (u.name === 'Priest') healed = u.healDone;
    CHECK(healed > 0.0);
  });

  it('rescue_opening_heal_goes_to_the_most_injured_member', () => {
    const sim = new CombatSim(g_data, 3);
    const w = sim.addPartyUnit('Warrior');
    const m = sim.addPartyUnit('Mage');
    sim.addEnemy('Grunt', 1);
    sim.startFight();
    sim.runToEnd();
    sim.postWinRevive();
    sim.mutableUnit(w)!.hp = 0.1 * sim.maxHp(sim.getUnit(w)!);
    sim.mutableUnit(m)!.hp = sim.maxHp(sim.getUnit(m)!);
    sim.prepareNextFight();
    const p = sim.addRescuedUnit('Priest');
    CHECK(Math.abs(sim.getUnit(w)!.hp - 0.3 * sim.maxHp(sim.getUnit(w)!)) < 1e-9);
    CHECK(Math.abs(sim.getUnit(p)!.hp - 0.3 * sim.maxHp(sim.getUnit(p)!)) < 1e-9);
    CHECK(Math.abs(sim.getUnit(m)!.hp - sim.maxHp(sim.getUnit(m)!)) < 1e-9);
  });

  it('priest_unlock_persists_across_runs_through_the_meta_save', () => {
    const meta = makeMeta();
    CHECK(!meta.priestUnlocked);
    const r1 = simulateBotRun(g_data, meta, makeRunSimOptions({ seed: 3, stopAfterRescue: true, fakeUntilRescue: true }));
    CHECK(r1.rescueFought);
    CHECK(meta.priestUnlocked);
    CHECK(r1.results.priestRescued);
    const loaded = parseMeta(serializeMeta(meta));
    CHECK(loaded.ok && metaEquals(loaded.meta, meta) && loaded.meta.priestUnlocked);
    const meta2 = loaded.meta;
    const flow = new RunFlow();
    flow.start(4, meta2.priestUnlocked);
    CHECK(flow.partyHasPriest() && flow.getRun().party.length === 3);
    resetProgress(meta2);
    const fresh = new RunFlow();
    fresh.start(4, meta2.priestUnlocked);
    CHECK(!fresh.partyHasPriest() && fresh.getRun().party.length === 2);
  });

  // ---------------------------------------------------------------------------------------- meta save
  it('meta_round_trip', () => {
    const m = makeMeta();
    m.gold = 1234;
    m.priestUnlocked = true;
    m.bestFloor = 7;
    m.masterVolume = 0.5;
    m.defaultSpeed = 4;
    const text = serializeMeta(m);
    const r = parseMeta(text);
    CHECK(r.ok && r.warnings.length === 0);
    CHECK(metaEquals(r.meta, m));
    CHECK(metaEquals(parseMeta(serializeMeta(makeMeta())).meta, makeMeta()));
    const crlf = '# comment\r\n' + text.replace(/\n/g, '\r\n');
    CHECK(parseMeta(crlf).ok && metaEquals(parseMeta(crlf).meta, m));
    const partial = parseMeta('TolMeta=1\nfutureThing=5\ngold=9\n');
    CHECK(partial.ok && partial.meta.gold === 9 && !partial.meta.priestUnlocked && partial.meta.bestFloor === 0);
  });

  it('meta_v2_faith_and_party_gold_and_v1_migration', () => {
    const m = makeMeta();
    m.gold = 500;
    m.partyGold = 75;
    const text = serializeMeta(m);
    CHECK(text.startsWith('TolMeta=2'));
    CHECK(text.includes('faith=500') && text.includes('partyGold=75'));
    CHECK(!text.includes('\ngold='));
    const r = parseMeta(text);
    CHECK(r.ok && r.warnings.length === 0 && metaEquals(r.meta, m));
    const v1 = parseMeta('TolMeta=1\ngold=360\nbestFloor=4\n');
    CHECK(v1.ok && v1.meta.gold === 360 && v1.meta.partyGold === 0 && v1.meta.bestFloor === 4);
    const bad = parseMeta('TolMeta=2\npartyGold=-5\n');
    CHECK(bad.ok && bad.meta.partyGold === 0 && bad.warnings.length > 0);
    const z = cloneMeta(m);
    resetProgress(z);
    CHECK(z.gold === 0 && z.partyGold === 0);
  });

  it('meta_corruption_tolerance', () => {
    const garbage = [
      '', '   \n\n', '\x01\x02\x03\xff\xfe binary \x00 junk', 'hello world', '{"gold": 5}', 'gold=500\npriestUnlocked=1\n',
      'TolMeta=banana\ngold=5\n', 'TolMeta=0\n', 'no equals sign here\ngold=5\n',
    ];
    for (const g of garbage) {
      const r = parseMeta(g);
      CHECK(!r.ok, JSON.stringify(g));
      CHECK(metaEquals(r.meta, makeMeta()));
    }
    let blob = '';
    for (let i = 0; i < 300; ++i) blob += String.fromCharCode((i * 37 + 11) & 0xff);
    CHECK(!parseMeta(blob).ok);
    const r = parseMeta('TolMeta=1\ngold=abc\npriestUnlocked=maybe\nbestFloor=12\nmasterVolume=nan\ndefaultSpeed=3\n');
    CHECK(r.ok);
    CHECK(r.meta.gold === 0 && !r.meta.priestUnlocked && r.meta.bestFloor === 12);
    CHECK(r.meta.masterVolume === 1.0 && r.meta.defaultSpeed === 1);
    CHECK(r.warnings.length === 4);
    const c = parseMeta('TolMeta=1\ngold=-5\nbestFloor=99999999999\nmasterVolume=7\n');
    CHECK(c.ok && c.meta.gold === 0 && c.meta.bestFloor === 100000 && c.meta.masterVolume === 1.0);
    const big = parseMeta('TolMeta=1\ngold=99999999999999\n');
    CHECK(big.ok && big.meta.gold === kMetaMaxGold);
    const mm = makeMeta();
    mm.gold = 777;
    mm.bestFloor = 5;
    let text = serializeMeta(mm);
    text = text.slice(0, text.length - 6);
    const t = parseMeta(text);
    CHECK(t.ok && t.meta.gold === 777);
  });

  it('meta_reset_progress', () => {
    const m = makeMeta();
    m.gold = 500;
    m.priestUnlocked = true;
    m.bestFloor = 9;
    m.masterVolume = 0.25;
    resetProgress(m);
    CHECK(m.gold === 0 && !m.priestUnlocked && m.bestFloor === 0);
    CHECK(m.masterVolume === 0.25);
  });

  it('gold_is_persisted_per_room_and_essence_is_not_saved', () => {
    const meta = makeMeta();
    const r = simulateBotRun(g_data, meta, makeRunSimOptions({ seed: 11 }));
    CHECK(meta.gold === r.results.goldEarned);
    CHECK(!serializeMeta(meta).includes('ssence'));
    CHECK(meta.bestFloor === r.results.floorReached);
  });

  // ---------------------------------------------------------------------------------------- bot and determinism
  it('same_seed_and_bot_give_identical_run_logs', () => {
    for (const seed of [1, 2, 17]) {
      const m1 = makeMeta();
      const m2 = makeMeta();
      const a = simulateBotRun(g_data, m1, makeRunSimOptions({ seed }));
      const b = simulateBotRun(g_data, m2, makeRunSimOptions({ seed }));
      CHECK(eqArr(a.log, b.log));
      CHECK(a.log.length >= 2);
      CHECK(a.results.floorReached === b.results.floorReached && a.results.causeOfDeath === b.results.causeOfDeath);
      CHECK(metaEquals(m1, m2));
    }
    const l1 = simulateBotRun(g_data, makeMeta(), makeRunSimOptions({ seed: 1 })).log;
    const l2 = simulateBotRun(g_data, makeMeta(), makeRunSimOptions({ seed: 2 })).log;
    CHECK(!eqArr(l1, l2));
  }, SLOW);

  it('bot_avoids_elites_except_the_rescue_room_unless_the_map_forces_it', () => {
    let total = 0;
    let runs = 0;
    for (let seed = 1; seed <= 40; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      const bot = new RunBot(seed);
      let elitesNonRescue = 0;
      for (let steps = 0; flow.active() && steps < 800; ++steps) {
        if (flow.fightPending()) {
          const s = flow.pendingFightSpec();
          if (s.room === RoomType.Elite && !s.isRescue) ++elitesNonRescue;
          WinPending(flow);
          continue;
        }
        const c = bot.choose(flow, 1.0);
        if (c.teleport) {
          if (flow.getRun().floorNumber >= 4) break;
          flow.teleport();
          continue;
        }
        if (c.node < 0) break;
        flow.travel(c.node);
      }
      total += elitesNonRescue;
      ++runs;
    }
    // Native: "bot: 2.12 non-rescue Elite fights per run over floors 1..4 (instant wins)".
    CHECK(fmtF(total / runs, 2) === '2.12', `got ${fmtF(total / runs, 2)}`);
    CHECK(total / runs <= 3.0);
  });

  /** The C++ BotRunsOver20Seeds report, returned as its three printed lines. */
  function BotRunsOver20Seeds(priestUnlocked: boolean): string[] {
    const floors = new Map<number, number>();
    const causes = new Map<string, number>();
    let wipes = 0;
    let victories = 0;
    let other = 0;
    let rescued = 0;
    let totalGold = 0;
    let fights = 0;
    for (let seed = 1; seed <= 20; ++seed) {
      const meta = makeMeta();
      meta.priestUnlocked = priestUnlocked;
      const r = simulateBotRun(g_data, meta, makeRunSimOptions({ seed }));
      const res = r.results;
      CHECK(res.outcome !== RunOutcome.InProgress);
      CHECK(res.floorReached >= 1);
      CHECK(res.seed === BigInt(seed));
      CHECK(meta.gold === res.goldEarned);
      CHECK(r.log.length > 0 && r.log[r.log.length - 1].startsWith('RUN RESULTS'));
      const bump = (k: string): void => { causes.set(k, (causes.get(k) ?? 0) + 1); };
      if (res.outcome === RunOutcome.Wiped) {
        ++wipes;
        CHECK(res.causeOfDeath !== '');
        bump(res.killerName === '' ? '(unknown)' : res.killerName);
      } else if (res.outcome === RunOutcome.Victory) {
        ++victories;
      } else {
        ++other;
        bump(`(${runOutcomeName(res.outcome)})`);
      }
      floors.set(res.floorReached, (floors.get(res.floorReached) ?? 0) + 1);
      if (res.priestRescued) ++rescued;
      totalGold += res.goldEarned;
      fights += r.fights;
    }
    CHECK(other === 0);
    const fl = [...floors.keys()].sort((a, b) => a - b).map((k) => ` F${k} x${floors.get(k)}`).join('');
    const cs = [...causes.keys()].sort().map((k) => ` ${k} x${causes.get(k)}`).join('');
    return [
      `bot runs over 20 seeds (${priestUnlocked ? 'Priest unlocked, party of 3 from the start' : 'first runs, Warrior+Mage, rescue on floor 2'}): ` +
        `wipes ${wipes}, victories ${victories}, rescued the Priest in ${rescued}, avg gold ${Math.trunc(totalGold / 20)}, avg fights ${fmtF(fights / 20, 1)}`,
      `  floor reached:${fl}`,
      `  cause of death (enemy that killed the first party member to fall):${cs}`,
    ];
  }

  it('full_bot_runs_over_20_seeds_and_distribution', () => {
    const native = [
      'bot runs over 20 seeds (first runs, Warrior+Mage, rescue on floor 2): wipes 20, victories 0, rescued the Priest in 19, avg gold 240, avg fights 17.9',
      '  floor reached: F1 x1 F2 x8 F3 x9 F4 x2',
      '  cause of death (enemy that killed the first party member to fall): Archer x2 Brute x10 Grunt x8',
      'bot runs over 20 seeds (Priest unlocked, party of 3 from the start): wipes 20, victories 0, rescued the Priest in 0, avg gold 412, avg fights 30.8',
      '  floor reached: F2 x1 F3 x13 F4 x6',
      '  cause of death (enemy that killed the first party member to fall): Brute x8 Grunt x12',
    ];
    const got = [...BotRunsOver20Seeds(false), ...BotRunsOver20Seeds(true)];
    for (let i = 0; i < native.length; ++i) CHECK(got[i] === native[i], `${got[i]}\n  !=\n${native[i]}`);
  }, SLOW);

  function RescueWinRate(seeds: number, hpLow: number, hpHigh: number): { rate: number; reached: number } {
    let fought = 0;
    let won = 0;
    for (let seed = 1; seed <= seeds; ++seed) {
      const r = simulateBotRun(g_data, makeMeta(), makeRunSimOptions({
        seed, stopAfterRescue: true, fakeUntilRescue: true, carryHpLow: hpLow, carryHpHigh: hpHigh,
      }));
      if (!r.rescueFought) continue;
      ++fought;
      if (r.rescueWon) ++won;
    }
    return { rate: fought ? won / fought : 0, reached: fought };
  }

  it('rescue_fight_win_rate_over_50_seeds', () => {
    const { rate, reached } = RescueWinRate(50, 0.4, 1.0);
    const full = RescueWinRate(50, 1.0, 1.0).rate;
    const low = RescueWinRate(50, 0.2, 0.6).rate;
    const cfg = defaultRunConfig();
    const line = `rescue fight Warrior+Priest+Mage (+${cfg.rescueExtraEnemies} ${enemyTypeName(cfg.rescueExtraType)} on the node's pack): ` +
      `carried HP 40-100% -> won ${fmtF(100 * rate, 0)}% of ${reached} | full HP ${fmtF(100 * full, 0)}% | carried HP 20-60% ${fmtF(100 * low, 0)}%`;
    const native = "rescue fight Warrior+Priest+Mage (+1 Grunt on the node's pack): carried HP 40-100% -> won 92% of 50 | full HP 96% | carried HP 20-60% 84%";
    CHECK(line === native, `${line}\n  !=\n${native}`);
    CHECK(reached === 50);
    CHECK(rate >= 0.7);
  }, SLOW);

  // ---------------------------------------------------------------------------------------- grid movement
  it('move_direction_goes_through_the_door_in_that_direction', () => {
    const flow = new RunFlow();
    flow.start(31, false);
    WinPending(flow);
    const f = flow.currentFloor();
    const start = f.nodes[f.startNode];
    let doors = 0;
    let walls = 0;
    for (let d = 0; d < kDirCount; ++d) {
      const g = new RunFlow();
      g.start(31, false);
      WinPending(g);
      const to = start.door[d];
      const e = g.moveDirection(d as Dir);
      if (to < 0) {
        ++walls;
        CHECK(e.kind === EntryKind.Rejected);
        CHECK(g.currentNode() === start.id);
      } else {
        ++doors;
        CHECK(e.kind !== EntryKind.Rejected);
        CHECK(g.currentNode() === to);
        const n = g.currentFloor().nodes[to];
        CHECK(n.gx === start.gx + dirDx(d as Dir) && n.gy === start.gy + dirDy(d as Dir));
        if (g.fightPending()) WinPending(g);
        CHECK(g.moveDirection(oppositeDir(d as Dir)).kind === EntryKind.Passed);
        CHECK(g.currentNode() === start.id);
      }
    }
    CHECK(doors >= 1 && doors + walls === kDirCount);
    const h = new RunFlow();
    h.start(31, false);
    for (let d = 0; d < kDirCount; ++d) CHECK(h.moveDirection(d as Dir).kind === EntryKind.Rejected);
  });

  it('backtracking_through_visited_rooms_is_free_and_never_refights_or_repays', () => {
    for (let seed = 1; seed <= 20; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, true);
      WinPending(flow);
      const start = flow.currentNode();
      const a = flow.adjacent()[0];
      const first = flow.travel(a);
      if (first.kind === EntryKind.Fight) WinPending(flow);
      flow.consumeGoldDelta();
      const gold = flow.getRun().gold;
      const essence = flow.getRun().essence;
      const kills = flow.getFloorKills();
      for (let i = 0; i < 3; ++i) {
        CHECK(flow.travel(start).kind === EntryKind.Passed);
        CHECK(!flow.fightPending());
        CHECK(flow.travel(a).kind === EntryKind.Passed);
        CHECK(!flow.fightPending());
      }
      CHECK(flow.getRun().gold === gold && flow.getRun().essence === essence && flow.getFloorKills() === kills);
      CHECK(flow.consumeGoldDelta() === 0);
      CHECK(flow.isCleared(a) && flow.isCleared(start));
      CHECK(flow.isVisited(a) && flow.isVisited(start));
    }
  });

  it('move_to_room_walks_a_path_through_visited_rooms_and_stops_on_arrival', () => {
    const flow = new RunFlow();
    flow.start(40, true);
    WinPending(flow);
    const start = flow.currentNode();
    const chain: number[] = [];
    let cur = start;
    for (let i = 0; i < 3; ++i) {
      let nxt = -1;
      for (const nb of flow.currentFloor().nodes[cur].next) {
        if (!flow.isVisited(nb)) {
          nxt = nb;
          break;
        }
      }
      if (nxt < 0) break;
      flow.travel(nxt);
      if (flow.fightPending()) WinPending(flow);
      chain.push(nxt);
      cur = nxt;
    }
    CHECK(chain.length === 3);
    const gold = flow.getRun().gold;
    const kills = flow.getFloorKills();
    const back = flow.moveToRoom(start);
    CHECK(back.accepted && back.arrived);
    CHECK(flow.currentNode() === start);
    CHECK(back.walked.length > 0 && back.walked[back.walked.length - 1] === start && eqArr(back.walked, back.path));
    CHECK(back.last.kind === EntryKind.Passed && !flow.fightPending());
    CHECK(flow.getRun().gold === gold && flow.getFloorKills() === kills);
    let at = cur;
    for (const step of back.walked) {
      CHECK(flow.currentFloor().nodes[at].next.includes(step));
      at = step;
    }
    const fwd = flow.moveToRoom(chain[chain.length - 1]);
    CHECK(fwd.accepted && fwd.arrived && flow.currentNode() === chain[chain.length - 1]);
  });

  it('move_to_room_ends_at_the_unvisited_destination_and_stops_for_its_fight', () => {
    let fights = 0;
    let others = 0;
    for (let seed = 1; seed <= 40; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, true);
      WinPending(flow);
      for (const nb of flow.adjacent()) {
        const g = new RunFlow();
        g.start(seed, true);
        WinPending(g);
        const m = g.moveToRoom(nb);
        CHECK(m.accepted && m.arrived && m.walked.length === 1 && g.currentNode() === nb);
        if (m.last.kind === EntryKind.Fight) {
          ++fights;
          CHECK(g.fightPending() && g.pendingFightSpec().nodeId === nb);
          CHECK(!g.moveToRoom(g.currentFloor().startNode).accepted);
        } else {
          ++others;
          CHECK(!g.fightPending());
        }
      }
    }
    CHECK(fights > 0 && others > 0);
  });

  it('move_to_room_rejects_unknown_same_room_and_pending_fight', () => {
    const flow = new RunFlow();
    flow.start(40, true);
    const f = flow.currentFloor();
    CHECK(!flow.moveToRoom(f.nodes[f.startNode].next[0]).accepted);
    WinPending(flow);
    CHECK(!flow.moveToRoom(flow.currentNode()).accepted);
    CHECK(!flow.moveToRoom(-1).accepted && !flow.moveToRoom(9999).accepted);
    let unknown = -1;
    for (const n of f.nodes) {
      if (!n.known) {
        unknown = n.id;
        break;
      }
    }
    CHECK(unknown >= 0);
    CHECK(!flow.moveToRoom(unknown).accepted);
    CHECK(flow.currentNode() === f.startNode);
    const someRoom = f.nodes[f.startNode].next[0];
    flow.abandon();
    CHECK(!flow.moveToRoom(someRoom).accepted);
  });

  // ---------------------------------------------------------------------------------------- fog and the map view
  it('fog_entering_a_room_reveals_it_and_shows_its_neighbours', () => {
    const flow = new RunFlow();
    flow.start(7, true);
    WinPending(flow);
    const f = flow.currentFloor();
    const startNext = [...f.nodes[f.startNode].next];
    CHECK(flow.isVisited(f.startNode) && flow.isKnown(f.startNode));
    for (const n of f.nodes) {
      if (n.isStart) continue;
      CHECK(!flow.isVisited(n.id));
      CHECK(flow.isKnown(n.id) === startNext.includes(n.id));
    }
    const a = flow.adjacent()[0];
    flow.travel(a);
    CHECK(flow.isVisited(a) && flow.isKnown(a));
    for (const nb of f.nodes[a].next) CHECK(flow.isKnown(nb));
    const d = doorDistances(f, a);
    for (const n of f.nodes) if (d[n.id] >= 2 && !startNext.includes(n.id)) CHECK(!flow.isKnown(n.id));
  });

  it('map_view_applies_the_fog_rule_doors_and_crystal_icon', () => {
    for (let seed = 1; seed <= 30; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, true);
      WinPending(flow);
      let v = buildMapView(flow);
      const f = flow.currentFloor();
      CHECK(v.runActive && v.floorNumber === 1 && v.currentRoom === f.startNode && v.cols === f.cols && v.rows === f.rows);
      CHECK(v.quota === f.killQuota && v.kills === flow.getFloorKills() && !v.canTeleport && !v.crystalFound && v.crystalRoom === -1);
      const start = f.nodes[f.startNode];
      CHECK(v.rooms.length === 1 + start.next.length);
      for (const r of v.rooms) {
        CHECK(!r.crystalIcon);
        const n = f.nodes[r.id];
        CHECK(r.gx === n.gx && r.gy === n.gy && r.type === n.type);
        CHECK(r.visited === n.isStart && r.current === n.isStart);
        if (r.visited) {
          for (let d = 0; d < kDirCount; ++d) CHECK(r.doors[d] === n.door[d] >= 0);
        } else {
          let shown = 0;
          for (let d = 0; d < kDirCount; ++d) {
            if (r.doors[d]) {
              ++shown;
              CHECK(n.door[d] === f.startNode);
            }
          }
          CHECK(shown === 1);
        }
        CHECK(r.rescue === n.isRescueRoom);
      }
      const beside = f.nodes[f.crystalNode].next[0];
      WalkByDoors(flow, beside);
      v = buildMapView(flow);
      if (!flow.isCrystalFound()) {
        for (const r of v.rooms) CHECK(!r.crystalIcon);
        CHECK(v.crystalRoom === -1);
        WalkByDoors(flow, f.crystalNode);
      }
      CHECK(flow.isCrystalFound());
      v = buildMapView(flow);
      let icons = 0;
      for (const r of v.rooms) {
        if (r.crystalIcon) {
          ++icons;
          CHECK(r.id === f.crystalNode);
        }
      }
      CHECK(icons === 1 && v.crystalRoom === f.crystalNode && v.crystalFound);
      CHECK(v.rooms.length <= f.nodes.length);
    }
  });

  // ---------------------------------------------------------------------------------------- Auto
  interface AutoTrace { reasons: AutoReason[]; stuck: boolean; steps: number }
  function DriveAuto(flow: RunFlow, stopAtFloor: number, maxSteps = 3000): AutoTrace {
    const t: AutoTrace = { reasons: [], stuck: false, steps: 0 };
    for (; t.steps < maxSteps && flow.active() && flow.getRun().floorNumber < stopAtFloor; ++t.steps) {
      if (flow.fightPending()) {
        WinPending(flow);
        continue;
      }
      const d = chooseAuto(flow, 1.0);
      if (d.action === AutoAction.None) {
        t.stuck = true;
        return t;
      }
      t.reasons.push(d.reason);
      if (d.action === AutoAction.Teleport) {
        flow.teleport();
        continue;
      }
      CHECK(flow.adjacent().includes(d.step));
      CHECK(flow.isKnown(d.target));
      CHECK(flow.travel(d.step).kind !== EntryKind.Rejected);
    }
    return t;
  }

  it('auto_teleports_when_crystal_found_and_quota_met', () => {
    const flow = new RunFlow();
    flow.start(5, true);
    WinPending(flow);
    CHECK(chooseAuto(flow, 1.0).action === AutoAction.Move);
    WalkByDoors(flow, flow.currentFloor().crystalNode);
    CHECK(flow.isCrystalFound());
    while (!flow.quotaMet()) flow.onEnemyKilled();
    CHECK(flow.canTeleport());
    const d = chooseAuto(flow, 1.0);
    CHECK(d.action === AutoAction.Teleport && d.reason === AutoReason.Teleport);
    const pend = new RunFlow();
    pend.start(5, true);
    CHECK(chooseAuto(pend, 1.0).action === AutoAction.None);
    pend.abandon();
    CHECK(chooseAuto(pend, 1.0).action === AutoAction.None);
  });

  it('auto_takes_an_adjacent_treasure_before_the_quota_but_not_after', () => {
    let checked = 0;
    for (let seed = 1; seed <= 300 && checked < 4; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, true);
      WinPending(flow);
      let treasure = -1;
      for (const a of flow.adjacent()) if (flow.currentFloor().nodes[a].type === RoomType.Treasure) treasure = a;
      if (treasure < 0) continue;
      const d = chooseAuto(flow, 1.0);
      CHECK(d.action === AutoAction.Move && d.reason === AutoReason.Treasure && d.step === d.target);
      CHECK(flow.currentFloor().nodes[d.target].type === RoomType.Treasure && flow.adjacent().includes(d.target));
      while (!flow.quotaMet()) flow.onEnemyKilled();
      const after = chooseAuto(flow, 1.0);
      CHECK(after.reason === AutoReason.ExploreForCrystal);
      ++checked;
    }
    CHECK(checked >= 3);
  });

  it('auto_prefers_unvisited_rooms_while_the_quota_is_open', () => {
    for (let seed = 1; seed <= 40; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, true);
      WinPending(flow);
      for (let i = 0; i < 30 && flow.active() && !flow.quotaMet() && flow.getRun().floorNumber === 1; ++i) {
        if (flow.fightPending()) {
          WinPending(flow);
          continue;
        }
        const d = chooseAuto(flow, 1.0);
        if (d.action !== AutoAction.Move) break;
        CHECK(!flow.isVisited(d.target));
        CHECK(d.reason === AutoReason.Treasure || d.reason === AutoReason.Fight || d.reason === AutoReason.Explore);
        flow.travel(d.step);
      }
    }
  });

  it('auto_goes_to_the_rescue_room_on_floor_2_when_the_priest_is_outstanding', () => {
    let known = 0;
    let unknown = 0;
    for (let seed = 1; seed <= 80; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      DriveAuto(flow, 2);
      CHECK(flow.getRun().floorNumber === 2 && flow.rescueOutstanding());
      if (flow.fightPending()) WinPending(flow);
      const f = flow.currentFloor();
      let adjacentTreasure = false;
      for (const a of flow.adjacent()) if (f.nodes[a].type === RoomType.Treasure) adjacentTreasure = true;
      const d = chooseAuto(flow, 1.0);
      CHECK(d.action === AutoAction.Move);
      if (!adjacentTreasure) {
        if (flow.isKnown(f.rescueNode)) {
          ++known;
          CHECK(d.reason === AutoReason.Rescue && d.target === f.rescueNode);
        } else {
          ++unknown;
          CHECK(d.reason === AutoReason.ExploreForRescue && d.target !== f.rescueNode);
        }
      } else {
        CHECK(d.reason === AutoReason.Treasure);
      }
      let rescueFought = false;
      for (let i = 0; i < 400 && flow.active() && flow.getRun().floorNumber === 2; ++i) {
        if (flow.fightPending()) {
          if (flow.pendingFightSpec().isRescue) rescueFought = true;
          WinPending(flow);
          continue;
        }
        const s = chooseAuto(flow, 1.0);
        if (s.action === AutoAction.Teleport) {
          CHECK(rescueFought);
          flow.teleport();
          break;
        }
        if (s.action !== AutoAction.Move) break;
        flow.travel(s.step);
      }
      CHECK(rescueFought);
    }
    CHECK(known === 80 && unknown === 0);
  });

  it('auto_after_the_quota_goes_straight_to_the_crystal_then_teleports', () => {
    let walkedBack = 0;
    for (let seed = 1; seed <= 60; ++seed) {
      const a = new RunFlow();
      a.start(seed, true);
      WinPending(a);
      while (!a.quotaMet()) a.onEnemyKilled();
      let guard = 0;
      let teleported = false;
      while (a.active() && a.getRun().floorNumber === 1 && guard++ < 100) {
        if (a.fightPending()) {
          WinPending(a);
          continue;
        }
        const d = chooseAuto(a, 1.0);
        CHECK(d.action !== AutoAction.None);
        if (d.action === AutoAction.Teleport) {
          CHECK(a.isCrystalFound());
          a.teleport();
          teleported = true;
          break;
        }
        CHECK(d.reason === AutoReason.ExploreForCrystal || d.reason === AutoReason.Crystal);
        CHECK(!a.isCrystalFound() || d.reason === AutoReason.Crystal);
        a.travel(d.step);
      }
      CHECK(teleported);

      const b = new RunFlow();
      b.start(seed, true);
      WinPending(b);
      const f = b.currentFloor();
      WalkByDoors(b, f.crystalNode);
      CHECK(b.isCrystalFound());
      const away = f.startNode;
      if (f.crystalNode === away) continue;
      const back = b.moveToRoom(away);
      CHECK(back.accepted && b.currentNode() === away);
      while (!b.quotaMet()) b.onEnemyKilled();
      const d = chooseAuto(b, 1.0);
      CHECK(d.action === AutoAction.Move && d.reason === AutoReason.Crystal && d.target === f.crystalNode);
      const path = b.pathTo(f.crystalNode);
      CHECK(path.length > 0 && path[0] === d.step);
      for (const step of path) b.travel(step);
      CHECK(b.currentNode() === f.crystalNode && b.canTeleport());
      CHECK(chooseAuto(b, 1.0).action === AutoAction.Teleport);
      ++walkedBack;
    }
    CHECK(walkedBack >= 30);
  });

  it('auto_plays_whole_runs_to_the_boss_and_wins_with_instant_fights', () => {
    let victories = 0;
    let stuck = 0;
    for (let seed = 1; seed <= 60; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      const t = DriveAuto(flow, 99);
      if (t.stuck) ++stuck;
      if (flow.getResults().outcome === RunOutcome.Victory) ++victories;
    }
    CHECK(stuck === 0);
    CHECK(victories === 60);
  });

  // ---------------------------------------------------------------------------------------- Elite rules and the teleport rule
  it('a_run_that_owns_the_priest_has_no_rescue_room_and_no_elites_on_floor_2', () => {
    for (let seed = 1; seed <= 40; ++seed) {
      const withP = new RunFlow();
      withP.start(seed, true);
      CHECK(withP.partyHasPriest() && !withP.rescueOutstanding());
      CHECK(withP.currentFloor().rescueNode === -1 && !withP.currentFloor().isBoss);
      FakePlayUntilFloor(withP, seed, 3);
      CHECK(withP.getRun().floorNumber >= 3);
      CHECK(!withP.rescueOutstanding());

      const without = new RunFlow();
      without.start(seed, false);
      CHECK(!without.partyHasPriest() && !without.rescueOutstanding());
      const floor2With = generate(seed, 2, makeConfig({ hasPriest: true }));
      const floor2Without = generate(seed, 2);
      let e1 = 0;
      let e2 = 0;
      for (const n of floor2With.nodes) e1 += n.type === RoomType.Elite ? 1 : 0;
      for (const n of floor2Without.nodes) e2 += n.type === RoomType.Elite ? 1 : 0;
      CHECK(e1 === 0 && e2 === 1 && floor2With.rescueNode === -1 && floor2Without.rescueNode >= 0);
    }
    for (let seed = 1; seed <= 10; ++seed) {
      const withP = new RunFlow();
      const without = new RunFlow();
      withP.start(seed, true);
      without.start(seed, false);
      FakePlayUntilFloor(withP, seed, 2);
      FakePlayUntilFloor(without, seed, 2);
      if (withP.getRun().floorNumber === 2) {
        CHECK(withP.currentFloor().rescueNode === generate(seed, 2, makeConfig({ hasPriest: true })).rescueNode &&
          withP.currentFloor().rescueNode === -1);
      }
      if (without.getRun().floorNumber === 2) {
        CHECK(without.currentFloor().rescueNode === generate(seed, 2, defaultConfig()).rescueNode && without.rescueOutstanding());
      }
    }
  });

  it('after_the_rescue_later_floors_never_expect_a_rescue_room', () => {
    let rescued = 0;
    for (let seed = 1; seed <= 30; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      FakePlayUntilFloor(flow, seed, 4);
      if (!flow.active() || flow.getRun().floorNumber < 3) continue;
      CHECK(flow.priestRescuedThisRun() && flow.partyHasPriest());
      CHECK(!flow.rescueOutstanding() && flow.currentFloor().rescueNode === -1);
      ++rescued;
    }
    CHECK(rescued >= 25);
  });

  it('teleport_up_needs_the_crystal_room_found_and_quota_met', () => {
    let refusedAway = 0;
    for (let seed = 1; seed <= 40; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, true);
      WinPending(flow);
      const f = flow.currentFloor();
      CHECK(!flow.inCrystalRoom() || f.crystalNode === f.startNode);
      while (!flow.quotaMet()) flow.onEnemyKilled();
      CHECK(!flow.canTeleport() && flow.teleportRefusal() === 'the crystal has not been found yet');
      WalkByDoors(flow, f.crystalNode);
      CHECK(flow.isCrystalFound() && flow.inCrystalRoom());
      CHECK(flow.teleportRefusal() === '' && flow.canTeleport());
      const inRoom = buildMapView(flow);
      CHECK(inRoom.inCrystalRoom && inRoom.canTeleport);
      const out = flow.adjacent()[0];
      flow.travel(out);
      if (flow.fightPending()) WinPending(flow);
      CHECK(flow.isCrystalFound() && flow.quotaMet() && !flow.inCrystalRoom());
      CHECK(!flow.canTeleport() && flow.teleportRefusal() === 'the party is not in the crystal room');
      CHECK(flow.teleport() === TeleportResult.Rejected && flow.getRun().floorNumber === 1);
      const outside = buildMapView(flow);
      CHECK(!outside.inCrystalRoom && !outside.canTeleport);
      ++refusedAway;
      flow.travel(f.crystalNode);
      CHECK(flow.inCrystalRoom() && flow.canTeleport());
      CHECK(flow.teleport() === TeleportResult.NextFloor && flow.getRun().floorNumber === 2);
    }
    CHECK(refusedAway === 40);
    const q = new RunFlow();
    q.start(3, true);
    WinPending(q);
    WalkByDoors(q, q.currentFloor().crystalNode);
    if (!q.quotaMet()) {
      CHECK(q.inCrystalRoom() && q.isCrystalFound() && !q.canTeleport());
      CHECK(q.teleportRefusal() === 'the kill quota is not met');
    }
    const p = new RunFlow();
    p.start(4, true);
    CHECK(p.teleportRefusal() === 'a fight is pending' && !p.canTeleport());
    const boss = new RunFlow();
    boss.start(77, false);
    FakePlayUntilFloor(boss, 77, 10);
    CHECK(boss.getRun().floorNumber === 10 && boss.fightPending());
    CHECK(boss.teleportRefusal() === 'a fight is pending');
    WinPending(boss);
    CHECK(boss.isBossKilled() && !boss.isCrystalFound() && !boss.canTeleport());
    CHECK(boss.teleportRefusal() === 'the crystal has not been found yet');
    boss.moveDirection(Dir.East);
    CHECK(boss.inCrystalRoom() && boss.isCrystalFound() && boss.canTeleport());
    CHECK(boss.teleport() === TeleportResult.Victory);
  });

  // ---------------------------------------------------------------------------------------- Temple
  it('temple_meta_round_trip_and_old_saves', () => {
    const m = makeMeta();
    m.gold = 321;
    m.gearLevels.set('Warrior.Weapon', 3);
    m.gearLevels.set('Mage.Armor', 1);
    m.partyLuck.set('EssencePerRoom', 4);
    m.unlockedStats = ['CritChance', 'Range'];
    const r = parseMeta(serializeMeta(m));
    CHECK(r.ok);
    CHECK(metaEquals(r.meta, m));
    CHECK(r.meta.gearLevels.get('Warrior.Weapon') === 3 && r.meta.partyLuck.get('EssencePerRoom') === 4);
    const old = parseMeta('TolMeta=1\ngold=50\nbestFloor=3\n');
    CHECK(old.ok && old.meta.gearLevels.size === 0 && old.meta.partyLuck.size === 0 && old.meta.gold === 50);
    const bad = parseMeta('TolMeta=1\ngearLevels=Warrior.Weapon:2|junk|Mage.Armor:x\npartyLuck=GoldPerRoom:99999\n');
    CHECK(bad.ok && bad.meta.gearLevels.size === 1 && bad.meta.gearLevels.get('Warrior.Weapon') === 2 && bad.warnings.length > 0);
    CHECK(bad.meta.partyLuck.get('GoldPerRoom') === 1000);
    const w = cloneMeta(m);
    resetProgress(w);
    CHECK(w.gearLevels.size === 0 && w.partyLuck.size === 0 && w.unlockedStats.length === 0 && w.gold === 0);
  });

  it('temple_gear_purchases_cost_ramp_and_cap', () => {
    const cfg = defaultTempleConfig();
    CHECK(gearNextCost(cfg, 0) === 150 && gearNextCost(cfg, 1) === 300 && gearNextCost(cfg, 2) === 600);
    CHECK(gearNextCost(cfg, 3) === 1200 && gearNextCost(cfg, 4) === 2400 && gearNextCost(cfg, 5) === -1);
    const m = makeMeta();
    m.gold = 149;
    let b = buyGear(m, 'Warrior', GearSlot.Weapon);
    CHECK(!b.ok && m.gold === 149 && gearTempleLevel(m, 'Warrior', GearSlot.Weapon) === 0);
    m.gold = 9000;
    let spent = 0;
    for (let i = 0; i < kGearMaxTempleLevel; ++i) {
      b = buyGear(m, 'Warrior', GearSlot.Weapon);
      CHECK(b.ok);
      spent += b.cost;
    }
    CHECK(spent === 4650 && m.gold === 9000 - 4650);
    CHECK(gearTempleLevel(m, 'Warrior', GearSlot.Weapon) === kGearMaxTempleLevel);
    b = buyGear(m, 'Warrior', GearSlot.Weapon);
    CHECK(!b.ok && m.gold === 9000 - 4650);
    CHECK(gearTempleLevel(m, 'Warrior', GearSlot.Armor) === 0 && gearTempleLevel(m, 'Mage', GearSlot.Weapon) === 0);
    CHECK(buyGear(m, 'Mage', GearSlot.Armor).ok && gearTempleLevel(m, 'Mage', GearSlot.Armor) === 1);
  });

  it('temple_stat_ranks_are_the_dungeon_ranks', () => {
    const cfg = shippedEssenceConfig();
    const dmg = cfg.find('Damage')!;
    const crit = cfg.find('CritChance')!;
    CHECK(statNextCost(dmg, 0) === 3 && statNextCost(dmg, 4999) > 100 && statNextCost(dmg, 5000) === -1);
    CHECK(statNextCost(crit, 0) === 20);
    const m = makeMeta();
    m.gold = 2;
    CHECK(!buyStatRanks(m, dmg, 1).ok && m.gold === 2 && statTempleLevel(m, 'Damage') === 0);
    m.gold = 1000000;
    let b = buyStatRanks(m, dmg, 10);
    CHECK(b.ok && statTempleLevel(m, 'Damage') === 10 && m.gold === 1000000 - b.cost);
    b = buyStatRanks(m, dmg, 100);
    CHECK(b.ok && statTempleLevel(m, 'Damage') === 110);
    m.gold = 30;
    b = buyStatRanks(m, dmg, kBuyMax);
    CHECK(b.ok && b.cost <= 30 && m.gold === 30 - b.cost && statTempleLevel(m, 'Damage') >= 110 && statTempleLevel(m, 'Damage') <= 120);
    m.gold = 2000000000;
    CHECK(buyStatRanks(m, dmg, kBuyMax).ok && statTempleLevel(m, 'Damage') === 5000 && !buyStatRanks(m, dmg, 1).ok && statTempleLevel(m, 'Health') === 0);
    const r = parseMeta(serializeMeta(m));
    CHECK(r.ok && metaEquals(r.meta, m) && r.warnings.length === 0);
    const w = cloneMeta(m);
    resetProgress(w);
    CHECK(w.statLevels.size === 0);
    const sb = new EssenceSidebar(shippedEssenceConfig());
    sb.reset(['Warrior', 'Priest']);
    CHECK(sb.config().find('Damage')!.maxRank === 5000 && sb.config().find('Health')!.maxRank === 5000 && sb.config().find('AttackSpeed')!.maxRank === 100);
    CHECK(sb.config().find('Damage')!.showValue && !sb.config().find('Threat')!.showValue);
    sb.setTempleLevels(new Map([['Damage', 10], ['Threat', 2]]));
    CHECK(sb.rank(0, 'Damage') === 10 && sb.rank(1, 'Damage') === 10 && sb.rank(0, 'Health') === 0);
    CHECK(sb.nextCost(0, 'Damage') === EssenceSidebar.rankCost(sb.config().find('Damage')!, 10));
    const sr = new StatResolver();
    sr.setBase(StatId.Damage, 6.0);
    sb.applyTo(0, sr);
    CHECK(Math.abs(sr.get(StatId.Damage) - 6.0 * (1.0 + 10 * 0.004)) < 1e-9);
    const essence = { value: 100000 };
    const br = sb.buy(0, 'Damage', 10, essence);
    CHECK(br.bought === 10 && br.newRank === 20 && sb.rank(0, 'Damage') === 20 && sb.rank(1, 'Damage') === 10);
    sb.applyTo(0, sr);
    CHECK(Math.abs(sr.get(StatId.Damage) - 6.0 * (1.0 + 20 * 0.004)) < 1e-9);
    const rows = sb.rows(0, essence.value);
    CHECK(rows[0].stat === 'Damage' && rows[0].rank === 20 && Math.abs(rows[0].currentBonus - 0.08) < 1e-9);
    const pr = new StatResolver();
    pr.setBase(StatId.Threat, 1.0);
    sb.applyTo(1, pr);
    CHECK(Math.abs(pr.get(StatId.Threat) - 1.0) < 1e-9);
    sb.setTempleLevels(new Map([['Damage', 4999]]));
    CHECK(sb.rank(0, 'Damage') === 4999 + 0 || sb.rank(0, 'Damage') <= 5000);
  });

  it('rank_rework_costs_are_affordable_and_bounded', () => {
    const c = shippedEssenceConfig();
    const d = c.find('Damage');
    CHECK(d && d.baseCost === 3 && EssenceSidebar.rankCost(d, 0) === 3);
    const last = EssenceSidebar.rankCost(d!, 4999);
    CHECK(last > 100 && last < 250);
    let total = 0;
    for (let r = 0; r < 5000; ++r) total += EssenceSidebar.rankCost(d!, r);
    CHECK(total > 100000 && total < 400000);
    const a = c.find('AttackSpeed');
    CHECK(a && a.baseCost === 10 && EssenceSidebar.rankCost(a, 99) > 150 && EssenceSidebar.rankCost(a, 99) < 260);
    CHECK(Math.abs(c.find('CritChance')!.templeCostMult - 2.0) < 1e-9 && Math.abs(c.find('Damage')!.templeCostMult - 1.0) < 1e-9);
  });

  it('temple_stat_unlocks_and_party_luck', () => {
    const cfg = defaultTempleConfig();
    const m = makeMeta();
    m.gold = 750;
    CHECK(!buyStatUnlock(m, 'Damage').ok);
    CHECK(!buyStatUnlock(m, 'Nonsense').ok);
    CHECK(buyStatUnlock(m, 'CritChance').ok && m.gold === 450 && statUnlocked(m, 'CritChance'));
    CHECK(!buyStatUnlock(m, 'CritChance').ok && m.gold === 450);
    CHECK(buyStatUnlock(m, 'Range').ok && m.gold === 150);
    CHECK(!buyStatUnlock(m, 'HealPower').ok && m.gold === 150 && m.unlockedStats.length === 2);
    let total = 0;
    for (let r = 0; r < cfg.partyLuckMaxRank; ++r) {
      const c = partyLuckNextCost(cfg, r);
      CHECK(c > 0);
      if (r > 0) CHECK(c > partyLuckNextCost(cfg, r - 1));
      total += c;
    }
    CHECK(partyLuckNextCost(cfg, cfg.partyLuckMaxRank) === -1);
    CHECK(partyLuckNextCost(cfg, 0) === 40);
    const p = makeMeta();
    p.gold = total;
    for (let r = 0; r < cfg.partyLuckMaxRank; ++r) CHECK(buyPartyLuck(p, 'GoldPerRoom').ok);
    CHECK(p.gold === 0 && partyLuckRank(p, 'GoldPerRoom') === cfg.partyLuckMaxRank);
    CHECK(Math.abs(partyLuckBonus(p, 'GoldPerRoom') - 1.0) < 1e-9);
    CHECK(!buyPartyLuck(p, 'GoldPerRoom').ok);
    CHECK(!buyPartyLuck(p, 'NotAStat').ok);
    p.partyLuck.set('EssencePerKill', 50);
    CHECK(partyLuckBonus(p, 'EssencePerKill') <= 1.0);
  });

  it('gear_levels_apply_as_a_percent_of_base_and_replace_each_time', () => {
    const cfg = defaultTempleConfig();
    const sim = new CombatSim(g_data, 5);
    const w = sim.addPartyUnit('Warrior');
    const m = sim.addPartyUnit('Mage');
    const dmgW = sim.getUnit(w)!.stats.get(StatId.Damage);
    const hpW = sim.maxHp(sim.getUnit(w)!);
    const dmgM = sim.getUnit(m)!.stats.get(StatId.Damage);
    const meta: MetaSave = makeMeta();
    meta.gearLevels.set('Warrior.Weapon', 2);
    meta.gearLevels.set('Warrior.Armor', 1);
    const dungeon = new Map([['Warrior.Weapon', 1]]);
    CHECK(applyGearToSim(sim, meta, dungeon) === 2);
    NEAR(sim.getUnit(w)!.stats.get(StatId.Damage), dmgW * (1.0 + 3 * cfg.gearBonusPerLevel), 1e-6);
    NEAR(sim.maxHp(sim.getUnit(w)!), hpW * (1.0 + 1 * cfg.gearBonusPerLevel), 1e-6);
    NEAR(sim.getUnit(w)!.hp, sim.maxHp(sim.getUnit(w)!), 1e-6);
    NEAR(sim.getUnit(m)!.stats.get(StatId.Damage), dmgM, 1e-9);
    applyGearToSim(sim, meta, dungeon);
    NEAR(sim.getUnit(w)!.stats.get(StatId.Damage), dmgW * (1.0 + 3 * cfg.gearBonusPerLevel), 1e-6);
    applyGearToSim(sim, meta, new Map());
    NEAR(sim.getUnit(w)!.stats.get(StatId.Damage), dmgW * (1.0 + 2 * cfg.gearBonusPerLevel), 1e-6);
    sim.mutableUnit(w)!.stats.addModifier(StatId.Damage, ModKind.Percent, 0.1, ModSource.Essence);
    NEAR(sim.getUnit(w)!.stats.get(StatId.Damage), dmgW * (1.0 + 2 * cfg.gearBonusPerLevel + 0.1), 1e-6);
  });

  it('gear_drops_from_treasure_elite_and_boss_only', () => {
    let treasures = 0;
    let plainFights = 0;
    let dropsSeen = 0;
    let runs = 0;
    for (let seed = 1; seed <= 25; ++seed) {
      const flow = new RunFlow();
      flow.start(seed, false);
      const bot = new RunBot(seed + 100);
      let dropsThisRun = 0;
      let expected = 0;
      for (let steps = 0; flow.active() && flow.getRun().floorNumber < 4 && steps < 4000; ++steps) {
        if (flow.fightPending()) {
          const rt = flow.pendingFightSpec().room;
          const big = rt === RoomType.Elite || rt === RoomType.Boss;
          WinPending(flow);
          if (!big) ++plainFights;
          if (big) ++expected;
        } else {
          const c = bot.choose(flow, 1.0);
          if (c.teleport) {
            flow.teleport();
            continue;
          }
          if (c.node < 0) break;
          const e = flow.travel(c.node);
          if (e.kind === EntryKind.Treasure) {
            ++treasures;
            ++expected;
          }
        }
        const d = flow.consumeGearDrops();
        for (const g of d) {
          CHECK(g.dungeonLevel >= 1);
          CHECK(g.className === 'Warrior' || g.className === 'Mage' || g.className === 'Priest');
          CHECK((flow.getDungeonGear().get(gearKey(g.className, g.slot)) ?? 0) >= g.dungeonLevel);
        }
        dropsThisRun += d.length;
      }
      CHECK(dropsThisRun === expected);
      let levels = 0;
      for (const v of flow.getDungeonGear().values()) levels += v;
      CHECK(levels === dropsThisRun);
      dropsSeen += dropsThisRun;
      ++runs;
    }
    CHECK(runs === 25);
    CHECK(treasures > 0 && plainFights > 0);
    CHECK(dropsSeen > 0);
    const play = (seed: number): string => {
      const flow = new RunFlow();
      flow.start(seed, false);
      const bot = new RunBot(7);
      let log = '';
      for (let steps = 0; flow.active() && flow.getRun().floorNumber < 3 && steps < 3000; ++steps) {
        if (flow.fightPending()) WinPending(flow);
        else {
          const c = bot.choose(flow, 1.0);
          if (c.teleport) {
            flow.teleport();
            continue;
          }
          if (c.node < 0) break;
          flow.travel(c.node);
        }
        for (const g of flow.consumeGearDrops()) log += `${gearKey(g.className, g.slot)}${g.dungeonLevel};`;
      }
      return log;
    };
    CHECK(play(11) === play(11));
    const again = new RunFlow();
    again.start(3, false);
    CHECK(again.getDungeonGear().size === 0 && again.consumeGearDrops().length === 0);
  });

  it('party_luck_scales_the_payouts_and_zero_luck_changes_nothing', () => {
    const plain = new RunFlow();
    plain.start(9, false);
    const lucky = new RunFlow();
    lucky.setPartyLuck({ essencePerKill: 0.5, essencePerRoom: 1.0, goldPerKill: 0, goldPerRoom: 0.3 });
    lucky.start(9, false);
    const basePerKill = plain.config().essencePerKill;
    plain.onEnemyKilled();
    lucky.onEnemyKilled();
    CHECK(plain.getRun().essence === basePerKill);
    CHECK(lucky.getRun().essence === lround(basePerKill * 1.5));
    const essPlain = plain.getRun().essence;
    const essLucky = lucky.getRun().essence;
    plain.onFightFinished(FightResult.Won);
    lucky.onFightFinished(FightResult.Won);
    CHECK(plain.getRun().essence - essPlain === plain.config().essencePerRoom);
    CHECK(lucky.getRun().essence - essLucky === plain.config().essencePerRoom * 2);
    CHECK(plain.getRun().gold === plain.config().goldCombat);
    CHECK(lucky.getRun().gold === lround(plain.config().goldCombat * 1.3));
  });
});
