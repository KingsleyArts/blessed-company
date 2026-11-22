// Scripted combat scenarios: the TS twin of Run() in tools/golden/dump_combat.cpp. Keep both in step. Used by the combat parity
// test (spec-tests/combat) and handy for debugging a fight from a definition.
import { installLegacyCastTimes } from './castTimes';
import type { CombatData } from './combatData';
import { CombatSim, FightState, defaultCombatConfig } from './combatSim';
import { parseTargetType, parseTriggerMode } from './combatData';
import type { MiracleKind } from './miracleGauge';

export interface ScenarioDef {
  name: string;
  seed: string;
  party: string[];
  enemies: string[];
  floor: number;
  waves: { at: number; enemies: string[]; floor: number }[];
  castTimes: boolean;
  randomSpawn: boolean;
  entryDoor: number;
  enemyStatMult: number;
  fights: number;
  rescue: string;
  gaugeStart: number;
  miracles: { tick: number; kind: number }[];
  triggerUnit: number;
  triggerMode: string;
  priorityUnit: number;
  priorities: string[];
}

export interface ScenarioResult {
  log: string;
  summary: string;
  state: string;
  firstDeath: string;
  fightStates: string;
  ticks: number;
}

const bitsBuf = new DataView(new ArrayBuffer(8));
/** IEEE-754 bits of a double as a decimal string (matches the C++ memcpy to uint64). */
export function doubleBits(v: number): string {
  bitsBuf.setFloat64(0, v);
  return bitsBuf.getBigUint64(0).toString();
}

export function runScenario(data: CombatData, sc: ScenarioDef): ScenarioResult {
  const cfg = defaultCombatConfig();
  cfg.logCapacity = 1 << 22;
  if (sc.castTimes) installLegacyCastTimes(cfg); // the C++ table the fixtures were recorded with
  cfg.randomEnemySpawn = sc.randomSpawn;
  cfg.enemyStatMult = sc.enemyStatMult;
  const sim = new CombatSim(data, BigInt(sc.seed), cfg);
  sim.setPartyEntry(sc.entryDoor);
  for (const p of sc.party) sim.addPartyUnit(p);
  if (sc.triggerUnit >= 0) sim.setTriggerMode(sc.triggerUnit, parseTriggerMode(sc.triggerMode));
  if (sc.priorityUnit >= 0) sim.setTargetPriorities(sc.priorityUnit, sc.priorities.map(parseTargetType));
  const r: ScenarioResult = { log: '', summary: '', state: '', firstDeath: '', fightStates: '', ticks: 0 };
  for (let fight = 1; fight <= sc.fights; ++fight) {
    if (fight > 1) {
      if (sim.getState() !== FightState.Won) break;
      sim.postWinRevive();
      if (fight % 2 === 0) sim.restRoom();
      sim.prepareNextFight();
      if (fight === 2 && sc.rescue !== '') sim.addRescuedUnit(sc.rescue);
    }
    for (const e of sc.enemies) sim.addEnemy(e, sc.floor);
    for (const w of sc.waves) sim.scheduleWave(w.at, w.enemies, w.floor);
    if (sc.gaugeStart > 0) sim.mutableGauge().add(sc.gaugeStart);
    sim.startFight();
    let guard = 100000;
    while (sim.getState() === FightState.Running && guard-- > 0) {
      for (const m of sc.miracles) {
        if (m.tick === sim.tickCount()) {
          const res = sim.castMiracle(m.kind as MiracleKind);
          r.state += `miracle t${m.tick} k${m.kind} -> ${res}\n`;
        }
      }
      sim.step();
    }
    r.log += sim.getLog().toText() + '==\n';
    r.summary += sim.summaryText() + '==\n';
    r.fightStates += `${sim.getState()},`;
    r.ticks += sim.tickCount();
    const fd = sim.getFirstDeath();
    if (fd.valid) r.firstDeath += fd.text;
    r.firstDeath += '|';
  }
  for (const u of sim.getUnits()) {
    r.state += `${u.name}#${u.id}${u.alive ? ' A ' : ' D '}${u.removed ? 'R ' : '- '}${doubleBits(u.hp)} ${doubleBits(u.x)} ${doubleBits(u.y)} ` +
      `${doubleBits(u.damageDone)} ${doubleBits(u.threatGenerated)}\n`;
  }
  r.state += `gauge ${doubleBits(sim.getGauge().value())} enrage ${sim.getEnrageStep()} killed ${sim.getEnemiesKilled()}\n`;
  return r;
}
