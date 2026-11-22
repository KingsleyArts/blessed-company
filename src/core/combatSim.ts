// CombatSim.h port: the engine-agnostic combat core. Fixed-step loop (1/30 s), damage and heal pipelines raising events through
// the EventBus, threat tables and targeting, role movement with separation, data-driven ability effects, enrage, fight lifecycle,
// casts and windups, the Miracle Gauge and miracles, and a combat log. Deterministic for a given (data, seed, party, enemies, waves).
// Ported line by line from the Unreal reference; operation order is kept so seeded fights match the C++ build (spec-tests/combat).
import { applyClassBase } from './classData';
import type { CombatData } from './combatData';
import { CombatLog, LogKind, logEntry, type LogEntry } from './combatSupport';
import type { AbilityEffectRow, TargetType, TriggerMode } from './dataTypes';
import { DamageTag, EventBus, kNoUnit, type UnitId } from './eventBus';
import { MiracleGauge, MiracleKind, MiracleResult, defaultMiracleConfig, miracleName, type MiracleConfig } from './miracleGauge';
import { hypot } from './fmath';
import { fmtF, padL } from './printf';
import { CombatRng, u64 } from './rng';
import { ModKind, ModSource, StatId, StatResolver, type ModifierId } from './statResolver';

/** DESIGN-DECISIONS 3: the Priest's heal is 8 per cast; also the unit of Group Heal and the Shaman heal. DRAFT, no CSV home yet. */
export const kHealBase = 8.0;

const DBL_MAX = Number.MAX_VALUE;

export interface CombatConfig {
  dt: number;
  enrageStart: number;
  enrageStep: number;
  enrageBonusPerStep: number;
  runawayGuardSeconds: number;
  enemyStatMult: number;
  floorScaling: number;
  /** Per-floor growth of enemy Health / Damage; a negative value means "same as floorScaling" (director Nov 22: tunable separately). */
  floorHealthScaling: number;
  floorDamageScaling: number;
  arenaW: number;
  arenaH: number;
  separation: number;
  goalInterval: number;
  goalHysteresis: number;
  healThreatFactor: number;
  summonThreatShare: number;
  smiteThreshold: number;
  allyLowThreshold: number;
  restHealPct: number;
  defenseCap: number;
  damageReductionCap: number;
  standoffFactor: number;
  boundFactor: number;
  retreatHoldFactor: number;
  spiritSpawnOffset: number;
  baseCritFactor: number;
  partySpawnX: number;
  enemySpawnX: number;
  reinforcementSpawnX: number;
  spawnSpacing: number;
  rescueHpFraction: number;
  rescueStartHealFraction: number;
  miracle: MiracleConfig;
  /** Seconds from commit to landing, keyed by unit name (auto action) or ability name. Missing key = instant. */
  autoWindups: Map<string, number>;
  abilityCastTimes: Map<string, number>;
  /** Cast-bound casters (director, Nov 21): unit name -> base cast time in seconds at the class's base AttackSpeed. A listed unit has NO
   *  attack timer: it casts back to back, the cast time is its only limit, AttackSpeed shortens it (base x baseAS / AttackSpeed), and each
   *  landing is scaled by base x baseAS so the class's DPS stays what ClassData says. castTimeScale 0 falls back to the timer. */
  autoCastTimes: Map<string, number>;
  /** Unit names whose auto lands as a projectile that flies to the target (see projectileSpeed). */
  projectileUnits: string[];
  /** World units per second; 0 = no flight time (the hit lands as the cast ends). */
  projectileSpeed: number;
  /** Testing-menu multipliers (default empty = x1): by unit name for the basic attack / heal's power and its speed, by ability name for the
   *  ability's power (damage, heal, buff strength, greater spirit damage) and its cooldown length. */
  autoPowerMult: Map<string, number>;
  autoSpeedMult: Map<string, number>;
  abilityPowerMult: Map<string, number>;
  abilityCooldownMult: Map<string, number>;
  eliteWindupFactor: number;
  tankMeleeFirstRange: number;
  castTimeScale: number;
  partyHealMult: number;
  randomEnemySpawn: boolean;
  rallyInsetX: number;
  rallyInsetY: number;
  enemyMinRallyDistance: number;
  enemyMinSpacing: number;
  enemyEdgeMargin: number;
  areaRadius: number;
  spiritHp: number;
  spiritDamage: number;
  spiritAttackPerSec: number;
  spiritMoveSpeed: number;
  spiritRange: number;
  greaterSpiritHp: number;
  greaterSpiritDamage: number;
  greaterSpiritAttackPerSec: number;
  greaterSpiritMoveSpeed: number;
  greaterSpiritRange: number;
  /** DRAFT healing spirits (healer Summoner): heal per spirit pulse = kHealBase x scale (x the owner's Spirit Damage stat as a flat bonus); pulses at the spirit's attack rate. */
  spiritHealScale: number;
  /** Bloodrush (the Barbarian's second ability): rush speed as a multiple of his move speed, the farthest enemy he will rush (world units), and the longest a rush may take before it gives up. */
  bloodrushSpeedMult: number;
  bloodrushRange: number;
  bloodrushMaxSeconds: number;
  /** A healing spirit that is already this close (world units) to its ideal spot (midway between the Summoner and the ally) does not move. */
  spiritHealIdleRadius: number;
  greaterSpiritHealScale: number;
  readyAtStartAbilities: string[];
  logCapacity: number;
}

export function defaultCombatConfig(): CombatConfig {
  return {
    dt: 1.0 / 30.0,
    enrageStart: 45.0,
    enrageStep: 5.0,
    enrageBonusPerStep: 0.1,
    runawayGuardSeconds: 1800.0,
    enemyStatMult: 1.0,
    floorScaling: 1.25,
    floorHealthScaling: -1.0,
    floorDamageScaling: -1.0,
    arenaW: 2400.0,
    arenaH: 1400.0,
    separation: 100.0,
    goalInterval: 0.25,
    goalHysteresis: 50.0,
    healThreatFactor: 0.25,
    summonThreatShare: 0.5,
    smiteThreshold: 0.85,
    allyLowThreshold: 0.4,
    restHealPct: 0.3,
    defenseCap: 90.0,
    damageReductionCap: 0.95,
    standoffFactor: 0.8,
    boundFactor: 0.9,
    retreatHoldFactor: 1.25,
    spiritSpawnOffset: 120.0,
    baseCritFactor: 1.5,
    partySpawnX: -800.0,
    enemySpawnX: 800.0,
    reinforcementSpawnX: 1100.0,
    spawnSpacing: 250.0,
    rescueHpFraction: 0.3,
    rescueStartHealFraction: 0.2,
    miracle: defaultMiracleConfig(),
    autoWindups: new Map(),
    abilityCastTimes: new Map(),
    autoCastTimes: new Map(),
    projectileUnits: [],
    projectileSpeed: 0.0,
    autoPowerMult: new Map(),
    autoSpeedMult: new Map(),
    abilityPowerMult: new Map(),
    abilityCooldownMult: new Map(),
    eliteWindupFactor: 1.5,
    tankMeleeFirstRange: 300.0,
    castTimeScale: 1.0,
    partyHealMult: 1.0,
    randomEnemySpawn: false,
    rallyInsetX: 300.0,
    rallyInsetY: 250.0,
    enemyMinRallyDistance: 900.0,
    enemyMinSpacing: 170.0,
    enemyEdgeMargin: 150.0,
    areaRadius: 300.0,
    spiritHp: 40.0,
    spiritDamage: 5.0,
    spiritAttackPerSec: 1.0,
    spiritMoveSpeed: 300.0,
    spiritRange: 150.0,
    greaterSpiritHp: 100.0,
    greaterSpiritDamage: 10.0,
    greaterSpiritAttackPerSec: 1.0,
    greaterSpiritMoveSpeed: 300.0,
    greaterSpiritRange: 150.0,
    spiritHealScale: 0.5,
    bloodrushSpeedMult: 2.5,
    bloodrushRange: 900.0,
    bloodrushMaxSeconds: 3.0,
    spiritHealIdleRadius: 80.0,
    greaterSpiritHealScale: 1.5,
    readyAtStartAbilities: ['Taunt'],
    logCapacity: 4096,
  };
}

/** Deep-enough copy (the sim owns its config, as the C++ copies CombatConfig by value). */
export function cloneCombatConfig(c: CombatConfig): CombatConfig {
  return {
    ...c,
    miracle: { ...c.miracle },
    autoWindups: new Map(c.autoWindups),
    abilityCastTimes: new Map(c.abilityCastTimes),
    autoCastTimes: new Map(c.autoCastTimes),
    projectileUnits: [...c.projectileUnits],
    autoPowerMult: new Map(c.autoPowerMult),
    autoSpeedMult: new Map(c.autoSpeedMult),
    abilityPowerMult: new Map(c.abilityPowerMult),
    abilityCooldownMult: new Map(c.abilityCooldownMult),
    readyAtStartAbilities: [...c.readyAtStartAbilities],
  };
}

export enum FightState { NotStarted, Running, Won, Wiped, TimedOut }
export const fightStateName = (s: FightState): string =>
  (['NotStarted', 'Running', 'WIN', 'WIPE', 'TIMEOUT'] as const)[s] ?? '?';

export enum Behavior { Frontline, Melee, Caster, Backline }
export enum CastKind { None, Auto, AutoHeal, Ability }

export interface ExtraAbility { id: string; timer: number }
/** A caster's auto in flight (the Mage's Arcane Shot): it homes on its target and lands the hit on arrival; a target that dies first
 *  takes the bolt with it (no damage). Not part of the golden fixtures: with projectileSpeed 0 none is ever made. */
export interface Projectile { id: number; source: UnitId; target: UnitId; x: number; y: number; scale: number; tags: number }
interface BuffRef { source: UnitId; stat: StatId; id: ModifierId }

export class Unit {
  id: UnitId = kNoUnit;
  name = '';
  enemy = false;
  summon = false;
  owner: UnitId = kNoUnit;
  healer = false;
  archer = false;
  elite = false;
  boss = false;
  taunts = false;
  greater = false;
  weapon = false;
  hasWeaponSpirit = false;
  /** Healer-Summoner (ClassData AutoActionId SpiritBolt, director Nov 21): the Summoner fires its own bolt and its spirits heal allies
   *  instead of attacking. Set on the Summoner and copied to its spirits. */
  spiritHeals = false;
  /** A healing spirit is walking to its spot (see moveHealSpirit). */
  spiritWalking = false;
  tauntLeft = 0;
  tauntForced = false;
  tauntEnemiesLeft = 0;
  retreating = false;
  smiteThreshold = 0.85;
  autoHealScale = 1.0;
  healFloorMult = 1.0;
  allowedTargets: TargetType[] = [];
  allowedTriggers: TriggerMode[] = [];
  behavior = Behavior.Melee;
  stats = new StatResolver();
  hp = 0;
  x = 0;
  y = 0;
  moveSpeed = 0;
  prefMin = 0;
  prefMax = 0;
  retreat = 0;
  threatMult = 1.0;
  alive = true;
  removed = false;

  target: UnitId = kNoUnit;
  hasGoal = false;
  goalX = 0;
  goalY = 0;
  goalTimer = 0;
  attackTimer = 0;
  abilityId = '';
  abilityTimer = 0;
  castKind = CastKind.None;
  castLeft = 0;
  castTotal = 0;
  castTarget: UnitId = kNoUnit;
  castTags = 0;
  castHeal = 0;
  /** Power of the auto cast in progress (1 for everyone but a cast-bound caster). */
  castScale = 1;
  castAbility = '';
  castSlot = -1;
  extraAbilities: ExtraAbility[] = [];
  trigger: TriggerMode = 'OnCooldown';
  targetTypes: TargetType[] = ['Closest'];

  dmgReduction = 0;
  dmgReductionLeft = 0;
  shieldLeft = 0;
  rageLifesteal = 0;
  rageLifestealLeft = 0;
  /** Rage's damage-based threat multiplier while rageThreatLeft runs (Rage_3); 1 otherwise. */
  rageThreatMult = 1;
  rageThreatLeft = 0;
  /** Bloodrush in progress: the enemy being rushed, seconds left before it gives up, its damage scale and the ability that started it. */
  rushTarget: UnitId = kNoUnit;
  rushLeft = 0;
  rushValue = 0;
  rushAbility = '';
  lifesteal = 0;
  buffRefs: BuffRef[] = [];
  fortitude = 0;
  lifeLeft = 0;

  threat: number[] = [];
  damageFrom: number[] = [];

  damageDone = 0;
  healDone = 0;
  damageTaken = 0;
  threatGenerated = 0;
  kills = 0;
}

export interface CauseOfDeath {
  valid: boolean;
  victim: UnitId;
  killer: UnitId;
  topSource: UnitId;
  topAmount: number;
  time: number;
  text: string;
}
const noDeath = (): CauseOfDeath => ({ valid: false, victim: kNoUnit, killer: kNoUnit, topSource: kNoUnit, topAmount: 0, time: 0, text: '' });

export interface WaveSpec {
  atSeconds: number;
  enemies: string[];
  floorNumber: number;
}

export interface AbilityCooldown { remaining: number; total: number; valid: boolean }

// std::hypot parity: see fmath.ts (Math.hypot is not correctly rounded).
const dist = (a: Unit, b: Unit): number => hypot(a.x - b.x, a.y - b.y);
/** std::lround: half away from zero. */
const lround = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));
/** C++ int division truncates toward zero. */
const idiv = (a: number, b: number): number => Math.trunc(a / b);

interface PendingLifesteal { source: UnitId; target: UnitId }

export class CombatSim {
  private readonly data: CombatData;
  private cfg: CombatConfig;
  private rng: CombatRng;
  private placementSeed: bigint;
  private entryDoor = -1;
  private log: CombatLog;
  private bus = new EventBus();
  private gauge: MiracleGauge;
  private units: Unit[] = [];
  private waves: WaveSpec[] = [];
  private warnedEffects: string[] = [];
  private projectiles: Projectile[] = [];
  /** The ability threat multiplier of the damage being dealt right now (AbilityData ThreatMultiplier); 1 outside an ability hit. */
  private threatNow = 1.0;
  private nextProjectileId = 1;
  private pendingLifesteal: PendingLifesteal[] = [];
  private forcingCast = false;
  private partyCount = 0;
  private enemySpawnCount = 0;
  private fightIndex = 1;
  private tick = 0;
  private time = 0;
  private enrageStartTick: number;
  private enrageStepTicks: number;
  private enrageStep = 0;
  private enemiesKilled = 0;
  private state = FightState.NotStarted;
  private firstDeath: CauseOfDeath = noDeath();

  constructor(data: CombatData, seed: bigint | number, config: CombatConfig = defaultCombatConfig()) {
    this.data = data;
    this.cfg = cloneCombatConfig(config);
    this.rng = new CombatRng(u64(seed) ^ 0xc0ffee5eedn);
    this.placementSeed = u64(seed) ^ 0x5ea7b1acen;
    this.log = new CombatLog(this.cfg.logCapacity);
    this.enrageStartTick = lround(this.cfg.enrageStart / this.cfg.dt);
    this.enrageStepTicks = Math.max(1, lround(this.cfg.enrageStep / this.cfg.dt));
    this.gauge = new MiracleGauge(this.cfg.miracle);
    this.subscribe();
  }

  // ---- setup ----
  /** The door the party came through: 0 North, 1 East, 2 South, 3 West, -1 none (West rally point). */
  setPartyEntry(entryDoor: number): void { this.entryDoor = entryDoor; }
  partyEntry(): number { return this.entryDoor; }
  partyRallyPoint(): { x: number; y: number } {
    let x = this.cfg.partySpawnX;
    let y = 0.0;
    switch (this.entryDoor) {
      case 0: x = 0.0; y = -this.cfg.arenaH * 0.5 + this.cfg.rallyInsetY; break;
      case 1: x = this.cfg.arenaW * 0.5 - this.cfg.rallyInsetX; y = 0.0; break;
      case 2: x = 0.0; y = this.cfg.arenaH * 0.5 - this.cfg.rallyInsetY; break;
      case 3: x = -this.cfg.arenaW * 0.5 + this.cfg.rallyInsetX; y = 0.0; break;
      default: break;
    }
    return { x, y };
  }
  partySlotPosition(slot: number): { x: number; y: number } {
    const p = this.partyRallyPoint();
    const off = ((slot % 4) - 1.5) * this.cfg.spawnSpacing;
    if (this.entryDoor === 0 || this.entryDoor === 2) p.x += off;
    else p.y += off;
    return p;
  }

  addPartyUnit(className: string): UnitId {
    const row = this.data.findClassRow(className);
    if (!row) return kNoUnit;
    const u = new Unit();
    u.id = this.units.length;
    u.name = className;
    applyClassBase(u.stats, row);
    u.stats.setBase(StatId.Range, row.AttackRange);
    u.threatMult = row.ThreatMultiplier;
    u.moveSpeed = row.MoveSpeed;
    u.prefMin = row.PreferredDistMin;
    u.prefMax = row.PreferredDistMax;
    u.retreat = row.RetreatDistance;
    u.healer = row.RoleTag === 'Healer';
    u.abilityId = row.AbilityId;
    for (const x of row.ExtraAbilityIds) u.extraAbilities.push({ id: x, timer: 0 });
    this.initAbilityTimers(u);
    u.hasWeaponSpirit = this.abilitySummons(u.abilityId);
    for (const x of u.extraAbilities) if (this.abilitySummons(x.id)) u.hasWeaponSpirit = true;
    u.spiritHeals = u.hasWeaponSpirit && row.AutoActionId === 'SpiritBolt';
    if (row.SmiteThreshold > 0) u.smiteThreshold = Math.round(row.SmiteThreshold * 1e6) / 1e6; // float 0.85f -> 0.85
    else u.smiteThreshold = this.cfg.smiteThreshold;
    u.allowedTargets = [...row.AllowedTargetTypes];
    u.allowedTriggers = [...row.AllowedTriggerModes];
    switch (row.RoleTag) {
      case 'Tank': u.behavior = Behavior.Frontline; break;
      case 'MeleeDPS': u.behavior = Behavior.Melee; break;
      case 'Healer': u.behavior = Behavior.Backline; break;
      default: u.behavior = Behavior.Caster; break;
    }
    if (row.AllowedTargetTypes.length) u.targetTypes = ['Closest'];
    this.finishUnit(u);
    const slot = this.partyCount++;
    const p = this.partySlotPosition(slot);
    u.x = p.x;
    u.y = p.y;
    this.units.push(u);
    u.hp = this.maxHp(u);
    this.logSpawn(u);
    return u.id;
  }

  /** A unit that joins mid-run from the rescue event: starts at rescueHpFraction; the most injured party member gets a free heal. */
  addRescuedUnit(className: string): UnitId {
    const id = this.addPartyUnit(className);
    if (id === kNoUnit) return id;
    const u = this.units[id];
    u.hp = this.maxHp(u) * this.cfg.rescueHpFraction;
    let worst: Unit | undefined;
    let worstFrac = 2.0;
    for (const p of this.units) {
      if (p.enemy || !p.alive) continue;
      const frac = p.hp / Math.max(1.0, this.maxHp(p));
      if (frac < worstFrac) { worstFrac = frac; worst = p; }
    }
    if (worst) worst.hp = Math.min(this.maxHp(worst), worst.hp + this.cfg.rescueStartHealFraction * this.maxHp(worst));
    return id;
  }

  /** Spawns an enemy with floor scaling (HP and damage x floorScaling^(floor-1) x enemyStatMult). */
  addEnemy(enemyName: string, floorNumber: number, reinforcement = false): UnitId {
    const row = this.data.findEnemy(enemyName);
    if (!row) return kNoUnit;
    const u = new Unit();
    u.id = this.units.length;
    u.name = enemyName;
    u.enemy = true;
    u.stats.setBase(StatId.Health, row.BaseStats.HP);
    u.stats.setBase(StatId.Damage, row.BaseStats.Damage);
    u.stats.setBase(StatId.AttackSpeed, row.BaseStats.AttackPerSec);
    u.stats.setBase(StatId.DefensePercent, row.BaseStats.DefensePct);
    u.stats.setBase(StatId.Range, row.AttackRange);
    const floors = Math.max(0, floorNumber - 1);
    const hpGrowth = this.cfg.floorHealthScaling >= 0.0 ? this.cfg.floorHealthScaling : this.cfg.floorScaling;
    const dmgGrowth = this.cfg.floorDamageScaling >= 0.0 ? this.cfg.floorDamageScaling : this.cfg.floorScaling;
    const hpScale = this.cfg.enemyStatMult * Math.pow(hpGrowth, floors);
    const scale = this.cfg.enemyStatMult * Math.pow(dmgGrowth, floors); // damage (and enemy heal) scale
    if (floorNumber > 1 || this.cfg.enemyStatMult !== 1.0) {
      u.stats.addModifier(StatId.Health, ModKind.Multiplier, hpScale, ModSource.FloorScaling);
      u.stats.addModifier(StatId.Damage, ModKind.Multiplier, scale, ModSource.FloorScaling);
    }
    u.moveSpeed = row.MoveSpeed;
    u.prefMin = row.PreferredDistMin;
    u.prefMax = row.PreferredDistMax;
    u.retreat = row.RetreatDistance;
    u.taunts = row.Taunts;
    u.abilityId = row.AbilityId;
    u.smiteThreshold = this.cfg.smiteThreshold;
    u.healFloorMult = scale;
    for (const fx of this.data.effects) {
      if (fx.Type === 'Heal' && row.AutoActionId !== '' && fx.AbilityId === row.AutoActionId && fx.Value >= 0) {
        u.autoHealScale = fx.Value;
        break;
      }
    }
    u.elite = row.IsElite;
    u.boss = row.IsBoss;
    u.healer = row.RoleTag === 'Healer';
    u.archer = row.RoleTag === 'Ranged';
    switch (row.RoleTag) {
      case 'Ranged': u.behavior = Behavior.Caster; break;
      case 'Healer': u.behavior = Behavior.Backline; break;
      default: u.behavior = Behavior.Melee; break;
    }
    this.finishUnit(u);
    if (this.enrageStep > 0) {
      u.stats.addModifier(StatId.Damage, ModKind.Percent, this.enrageStep * this.cfg.enrageBonusPerStep, ModSource.Enrage);
    }
    const slot = this.enemySpawnCount++;
    if (this.cfg.randomEnemySpawn) {
      this.placeEnemyRandomly(u, slot, reinforcement);
    } else {
      u.x = reinforcement ? this.cfg.reinforcementSpawnX : this.cfg.enemySpawnX;
      u.y = ((slot % 5) - 2.0) * this.cfg.spawnSpacing;
    }
    this.units.push(u);
    u.hp = this.maxHp(u);
    this.logSpawn(u);
    return u.id;
  }

  /** A staggered wave: enemies appear at atSeconds into the fight. */
  scheduleWave(atSeconds: number, enemies: string[], floorNumber: number): void {
    this.waves.push({ atSeconds, enemies: [...enemies], floorNumber });
  }

  startFight(): void {
    this.state = FightState.Running;
    this.tick = 0;
    this.time = 0.0;
    this.note(`Fight ${this.fightIndex} begins`);
    this.bus.raise('FightStarted', { fightIndex: this.fightIndex });
    // Summoner weapon spirit: every living spirit-summoning party unit has its standard spirit from the first tick.
    const n = this.units.length;
    for (let i = 0; i < n; i++) {
      const o = this.units[i];
      if (o.enemy || o.summon || !o.alive || !o.hasWeaponSpirit) continue;
      let has = false;
      for (const s of this.units) if (s.weapon && s.alive && s.owner === o.id) has = true;
      if (!has) this.spawnWeaponSpirit(o);
    }
  }

  /** Casts the unit's ability now (primary, or a named slot), ignoring cooldown and trigger mode (tests, debug tools). */
  forceCastAbility(id: UnitId, abilityId?: string): boolean {
    const u = this.getUnit(id);
    if (!u || !u.alive) return false;
    if (abilityId === undefined || u.abilityId === abilityId) {
      return this.castAbility(u, abilityId ?? u.abilityId, -1, true);
    }
    const slot = u.extraAbilities.findIndex((x) => x.id === abilityId);
    return slot >= 0 ? this.castAbility(u, abilityId, slot, true) : false;
  }
  mutableUnit(id: UnitId): Unit | undefined { return this.getUnit(id); }

  /** Run-layer unlock hooks; party units only; false (no change) for a bad unit, an empty list or a value the class does not allow. */
  setTargetPriorities(id: UnitId, list: TargetType[]): boolean {
    const u = this.getUnit(id);
    if (!u || u.enemy || u.summon || list.length === 0) return false;
    if (u.allowedTargets.length) {
      for (const t of list) if (!u.allowedTargets.includes(t)) return false;
    }
    u.targetTypes = [...list];
    return true;
  }
  setTriggerMode(id: UnitId, mode: TriggerMode): boolean {
    const u = this.getUnit(id);
    if (!u || u.enemy || u.summon) return false;
    if (u.allowedTriggers.length && !u.allowedTriggers.includes(mode)) return false;
    u.trigger = mode;
    return true;
  }

  // ---- stepping ----
  step(): void {
    if (this.state !== FightState.Running) return;
    ++this.tick;
    this.time = this.tick * this.cfg.dt;
    this.spawnDueWaves();
    this.updateEnrage();
    for (let i = 0; i < this.units.length; i++) if (this.units[i].alive) this.tickTimers(this.units[i]);
    const count = this.units.length; // summons created this tick act next tick
    for (let i = 0; i < count; i++) {
      const u = this.units[i];
      if (!u.alive) continue;
      if (u.weapon) this.syncWeaponSpirit(u);
      this.updateTarget(u);
      if (u.rushLeft > 0.0) { this.advanceRush(u); continue; } // a Bloodrush replaces movement, attacks and other casts
      if (u.summon && u.spiritHeals) this.moveHealSpirit(u);
      else this.updateMovement(u);
      if (u.castKind !== CastKind.None) {
        this.advanceCast(u);
        // A cast-bound caster has no swing timer to wait on: the next cast (or a ready ability, which gets the gap first) starts on the
        // very tick the last one lands, so the cast time really is the whole cycle.
        if (u.alive && (u.castKind as CastKind) === CastKind.None && this.autoCastBase(u) > 0.0) {
          this.tryAbility(u);
          if (u.alive && (u.castKind as CastKind) === CastKind.None) this.tryAuto(u);
        }
      } else {
        this.tryAbility(u);
        if (u.alive && u.castKind === CastKind.None) this.tryAuto(u);
      }
    }
    this.advanceProjectiles();
    this.separate();
    this.checkEnd();
  }

  /** Steps until the fight ends or maxTicks pass. Returns the final state. */
  runToEnd(maxTicks = 100000): FightState {
    while (this.state === FightState.Running && maxTicks-- > 0) this.step();
    return this.state;
  }

  // ---- lifecycle between fights ----
  /** After a win: if a healer-role party unit lives, dead party units revive at 1 HP. Returns the count. */
  postWinRevive(): number {
    if (this.state !== FightState.Won) return 0;
    let healerAlive = false;
    for (const u of this.units) if (!u.enemy && !u.summon && u.alive && u.healer) healerAlive = true;
    if (!healerAlive) {
      this.note('No Priest alive: no post-fight revive');
      return 0;
    }
    return this.reviveDeadParty('Post-fight revive');
  }
  /** Rest room: living units heal restHealPct of max HP, dead units revive at 1 HP. */
  restRoom(): number {
    for (const u of this.units) {
      if (u.enemy || u.summon || !u.alive) continue;
      u.hp = Math.min(this.maxHp(u), u.hp + this.cfg.restHealPct * this.maxHp(u));
    }
    return this.reviveDeadParty('Rest room revive');
  }
  /** Clears every transient combat field (goalTimer deliberately kept). Shared by prepareNextFight and reviveUnit. */
  resetTransientState(u: Unit): void {
    u.target = kNoUnit;
    u.hasGoal = false;
    u.attackTimer = 0.0;
    u.abilityTimer = 0.0;
    u.castKind = CastKind.None;
    u.castLeft = 0.0;
    u.tauntLeft = 0.0;
    u.tauntEnemiesLeft = 0.0;
    u.dmgReduction = u.dmgReductionLeft = 0.0;
    u.shieldLeft = 0.0;
    u.rageLifesteal = u.rageLifestealLeft = 0.0;
    u.rageThreatMult = 1.0;
    u.rageThreatLeft = 0.0;
    u.rushTarget = kNoUnit;
    u.rushLeft = 0.0;
    u.buffRefs = [];
    u.retreating = false;
    u.tauntForced = false;
    for (const x of u.extraAbilities) x.timer = 0.0;
    this.initAbilityTimers(u);
    u.stats.removeBySource(ModSource.Buff);
    u.damageFrom = [];
    u.threat = [];
    u.damageDone = u.healDone = u.damageTaken = u.threatGenerated = 0.0;
    u.kills = 0;
  }
  /** Between-fight revive of one fallen party unit at maxHpFraction of its (reset) max HP. False if it is not a fallen party unit. */
  reviveUnit(id: UnitId, maxHpFraction: number, why: string): boolean {
    const u = this.getUnit(id);
    if (!u || u.enemy || u.summon || u.removed || u.alive) return false;
    this.resetTransientState(u);
    u.goalTimer = 0.0;
    for (const o of this.units) {
      if (o.target === id) o.target = kNoUnit;
      if (id < o.threat.length) o.threat[id] = 0.0;
    }
    u.alive = true;
    u.hp = Math.min(this.maxHp(u), maxHpFraction * this.maxHp(u));
    this.note(`${why}: ${this.label(u)} back at ${lround(u.hp)} HP`);
    return true;
  }
  /** Clears the last fight's enemies and summons; party HP carries over; party ids are renumbered 0..n-1; the log restarts. */
  prepareNextFight(): void {
    this.projectiles = [];
    const kept: Unit[] = [];
    for (const u of this.units) {
      if (u.enemy || u.summon) continue;
      u.id = kept.length;
      this.resetTransientState(u);
      const p = this.partySlotPosition(kept.length);
      u.x = p.x;
      u.y = p.y;
      kept.push(u);
    }
    this.units = kept;
    this.partyCount = this.units.length;
    this.pendingLifesteal = [];
    this.waves = [];
    this.enemySpawnCount = 0;
    this.enrageStep = 0;
    this.firstDeath = noDeath();
    this.enemiesKilled = 0;
    ++this.fightIndex;
    this.state = FightState.NotStarted;
    this.tick = 0;
    this.time = 0.0;
    this.log.clear();
  }

  // ---- queries ----
  getState(): FightState { return this.state; }
  finished(): boolean { return this.state !== FightState.Running && this.state !== FightState.NotStarted; }
  tickCount(): number { return this.tick; }
  getTime(): number { return this.time; }
  getEnrageStep(): number { return this.enrageStep; }
  getEnemiesKilled(): number { return this.enemiesKilled; }
  config(): Readonly<CombatConfig> { return this.cfg; }
  /** The tuning menu changes live values (enemy stats apply to enemies spawned afterwards). */
  mutableConfig(): CombatConfig { return this.cfg; }
  getUnits(): readonly Unit[] { return this.units; }
  /** Autos in flight (drawn by the scene); empty once the fight is over. */
  getProjectiles(): readonly Projectile[] { return this.projectiles; }
  primaryAbilityCooldown(id: UnitId): AbilityCooldown { return this.abilityCooldown(id, 0); }
  /** The cooldown of ability slot 0 (the primary) or 1.. (the extra abilities, in ClassData order); invalid when the unit has no such slot. */
  abilityCooldown(id: UnitId, slot: number): AbilityCooldown {
    const c: AbilityCooldown = { remaining: 0, total: 0, valid: false };
    const u = this.getUnit(id);
    if (!u) return c;
    const abilityId = slot === 0 ? u.abilityId : u.extraAbilities[slot - 1]?.id ?? '';
    const timer = slot === 0 ? u.abilityTimer : u.extraAbilities[slot - 1]?.timer ?? 0;
    if (abilityId === '') return c;
    const ab = this.data.findAbility(abilityId);
    if (!ab || !(ab.Cooldown > 0)) return c;
    c.valid = true;
    c.total = this.cooldownOf(abilityId);
    c.remaining = Math.max(0.0, c.total - timer);
    return c;
  }
  getUnit(id: UnitId): Unit | undefined {
    return id >= 0 && id < this.units.length ? this.units[id] : undefined;
  }
  maxHp(u: Unit): number { return u.stats.get(StatId.Health); }
  threatOn(enemy: UnitId, partyUnit: UnitId): number {
    const e = this.getUnit(enemy);
    if (!e || partyUnit < 0 || partyUnit >= e.threat.length) return 0.0;
    return e.threat[partyUnit];
  }
  getBus(): EventBus { return this.bus; }

  // ---- Miracle Gauge and miracles ----
  getGauge(): MiracleGauge { return this.gauge; }
  /** Tests and debug aids only. */
  mutableGauge(): MiracleGauge { return this.gauge; }
  /**
   * Casts a miracle by hand. `requested` is the clicked target (a living hero for Healing and Shield, a living enemy for Smite);
   * kNoUnit lets the sim pick (tests and bots). Nothing is spent unless the result is Cast. `castOn` receives the chosen unit id.
   * `betweenFights` (director, Nov 19; not in Unreal) also lets Healing and Shield go out between fights (Won or NotStarted).
   */
  castMiracle(kind: MiracleKind, requested: UnitId = kNoUnit, castOn?: { id: UnitId }, betweenFights = false): MiracleResult {
    if (!this.miracleWindowOpen(kind, betweenFights)) return MiracleResult.FightNotRunning;
    if (!this.gauge.canAfford(kind)) return MiracleResult.NotEnoughGauge;
    if (kind === MiracleKind.DivineSmite) {
      const c = this.pickMiracleTarget(kind, requested);
      if (!c) return MiracleResult.NoTarget;
      if (castOn) castOn.id = c.id;
      return this.castSmiteAt(c.x, c.y);
    }
    const t = this.pickMiracleTarget(kind, requested);
    if (!t) return MiracleResult.NoTarget;
    this.gauge.spend(kind);
    if (castOn) castOn.id = t.id;
    if (kind === MiracleKind.DivineHealing) {
      const amount = Math.min(this.cfg.miracle.healingFractionOfMax * this.maxHp(t), this.maxHp(t) - t.hp);
      t.hp += amount;
      this.bus.raise('HealApplied', { source: kNoUnit, target: t.id, effectiveAmount: amount });
    } else {
      t.shieldLeft = this.cfg.miracle.shieldSeconds;
    }
    const e = this.makeEntry(LogKind.Ability, kNoUnit, t.id, 0.0);
    e.text = `The goddess casts ${miracleName(kind)} on ${this.label(t)}`;
    this.log.add(e);
    return MiracleResult.Cast;
  }
  /** Whether a miracle of this kind may be cast now: always in a running fight; Healing and Shield also between fights if allowed. */
  miracleWindowOpen(kind: MiracleKind, betweenFights = false): boolean {
    if (this.state === FightState.Running) return true;
    return betweenFights && kind !== MiracleKind.DivineSmite && (this.state === FightState.Won || this.state === FightState.NotStarted);
  }
  /** Divine Smite on the ground: every living enemy within smiteRadius of (x, y) takes smiteFractionOfMax of its max HP. */
  castSmiteAt(x: number, y: number, hit?: UnitId[]): MiracleResult {
    if (this.state !== FightState.Running) return MiracleResult.FightNotRunning;
    if (!this.gauge.canAfford(MiracleKind.DivineSmite)) return MiracleResult.NotEnoughGauge;
    const ids: UnitId[] = [];
    const r2 = this.cfg.miracle.smiteRadius * this.cfg.miracle.smiteRadius;
    for (const u of this.units) {
      if (!u.enemy || u.summon || u.removed || !u.alive) continue;
      const dx = u.x - x;
      const dy = u.y - y;
      if (dx * dx + dy * dy <= r2) ids.push(u.id);
    }
    this.gauge.spend(MiracleKind.DivineSmite);
    for (const id of ids) {
      const t = this.getUnit(id);
      if (!t || !t.alive) continue;
      const applied = Math.min(this.cfg.miracle.smiteFractionOfMax * this.maxHp(t), t.hp);
      t.hp -= applied;
      this.bus.raise('DamageDealt', { source: kNoUnit, target: t.id, amount: applied, crit: false, tags: DamageTag.Ability });
      this.bus.raise('DamageTaken', { target: t.id, source: kNoUnit, amount: applied, crit: false, tags: DamageTag.Ability });
      if (t.hp <= 1e-9) this.kill(t, kNoUnit);
    }
    const e = this.makeEntry(LogKind.Ability, kNoUnit, kNoUnit, 0.0);
    e.text = `The goddess casts Divine Smite on ${ids.length} enemies`;
    this.log.add(e);
    if (hit) hit.splice(0, hit.length, ...ids);
    return MiracleResult.Cast;
  }
  getLog(): CombatLog { return this.log; }
  getFirstDeath(): Readonly<CauseOfDeath> { return this.firstDeath; }
  label(u: Unit | UnitId): string {
    if (typeof u === 'number') {
      const unit = this.getUnit(u);
      return unit ? this.label(unit) : 'none';
    }
    return `${u.name}#${u.id}`;
  }

  /** Post-fight summary: damage, healing, threat per unit. */
  summaryText(): string {
    let out = '';
    for (const u of this.units) {
      if (u.removed) continue;
      out += `${padL(this.label(u), 12)} ${u.alive ? 'alive' : 'dead '} dmg ${fmtF(u.damageDone, 1)}  heal ${fmtF(u.healDone, 1)}  ` +
        `taken ${fmtF(u.damageTaken, 1)}  threat ${fmtF(u.threatGenerated, 1)}  kills ${u.kills}  hp ${fmtF(u.hp, 1)}/${fmtF(this.maxHp(u), 1)}\n`;
    }
    return out;
  }

  // ---- the pipelines ----
  /** Damage pipeline: base -> crit -> attacker mods -> Defense % -> damage-taken reduction -> Fortitude (never below 1) -> apply -> events. */
  dealDamage(sourceId: UnitId, targetId: UnitId, scale: number, tags: number): number {
    const src = this.getUnit(sourceId);
    const tgt = this.getUnit(targetId);
    if (!src || !tgt || !tgt.alive) return 0.0;
    if (tgt.shieldLeft > 0.0) return 0.0; // Divine Shield: no damage, no events
    let dmg = scale * src.stats.get(StatId.Damage);
    let crit = false;
    const critChance = Math.min(1.0, Math.max(0.0, src.stats.get(StatId.CritChance)));
    if (this.rng.chance(critChance)) {
      crit = true;
      const factor = src.stats.get(StatId.CritFactor);
      dmg *= factor > 0.0 ? factor : this.cfg.baseCritFactor;
    }
    const def = Math.min(this.cfg.defenseCap, Math.max(0.0, tgt.stats.get(StatId.DefensePercent)));
    dmg *= 1.0 - def / 100.0;
    if (tgt.dmgReduction > 0.0) dmg *= 1.0 - Math.min(this.cfg.damageReductionCap, tgt.dmgReduction);
    if (tgt.fortitude > 0.0) dmg = Math.max(1.0, dmg - tgt.fortitude);
    const applied = Math.min(dmg, tgt.hp);
    if (applied <= 0.0) return 0.0;
    tgt.hp -= applied;
    this.bus.raise('DamageDealt', { source: sourceId, target: targetId, amount: applied, crit, tags });
    this.bus.raise('DamageTaken', { target: targetId, source: sourceId, amount: applied, crit, tags });
    if (tgt.hp <= 1e-9) this.kill(tgt, sourceId);
    return applied;
  }

  /** Heal pipeline: base -> Heal Power -> (party) heal multiplier -> clamp to missing HP -> apply -> HealApplied. */
  applyHeal(sourceId: UnitId, targetId: UnitId, baseHeal: number): number {
    const src = this.getUnit(sourceId);
    const tgt = this.getUnit(targetId);
    if (!src || !tgt || !tgt.alive) return 0.0;
    let amount = baseHeal * (1.0 + Math.max(0.0, src.stats.get(StatId.HealPower)));
    if (!src.enemy) amount *= this.cfg.partyHealMult;
    const missing = this.maxHp(tgt) - tgt.hp;
    const effective = Math.min(amount, missing);
    if (effective <= 0.0) return 0.0;
    tgt.hp += effective;
    this.bus.raise('HealApplied', { source: sourceId, target: targetId, effectiveAmount: effective });
    return effective;
  }

  // ------------------------------------------------------------------ setup helpers
  private initAbilityTimers(u: Unit): void {
    const readyAtStart = (id: string): boolean => this.cfg.readyAtStartAbilities.includes(id);
    const cooldownOf = (id: string): number => this.cooldownOf(id);
    if (u.abilityId !== '' && readyAtStart(u.abilityId)) u.abilityTimer = cooldownOf(u.abilityId);
    for (const x of u.extraAbilities) if (readyAtStart(x.id)) x.timer = cooldownOf(x.id);
  }

  private finishUnit(u: Unit): void {
    u.stats.setLimits(StatId.Health, 1.0, DBL_MAX);
    u.stats.setLimits(StatId.AttackSpeed, 0.05, DBL_MAX);
    u.stats.setLimits(StatId.CritChance, 0.0, 1.0);
    u.stats.setBase(StatId.CritFactor, this.cfg.baseCritFactor);
  }

  private logSpawn(u: Unit): void {
    const e = this.makeEntry(LogKind.Spawn, u.id, kNoUnit, this.maxHp(u));
    e.text = `${this.label(u)} spawns: HP ${fmtF(this.maxHp(u), 1)} Damage ${fmtF(u.stats.get(StatId.Damage), 1)} at (${fmtF(u.x, 0)}, ${fmtF(u.y, 0)})`;
    this.log.add(e);
  }

  private makeEntry(kind: LogKind, src: UnitId, tgt: UnitId, amount: number): LogEntry {
    return logEntry({ tick: this.tick, time: this.time, kind, source: src, target: tgt, amount });
  }
  private note(text: string): void {
    const e = this.makeEntry(LogKind.Note, kNoUnit, kNoUnit, 0.0);
    e.text = text;
    this.log.add(e);
  }

  private pickMiracleTarget(kind: MiracleKind, requested: UnitId): Unit | undefined {
    const qualifies = (u: Unit): boolean => {
      if (u.summon || u.removed || !u.alive) return false;
      if (kind === MiracleKind.DivineSmite) return u.enemy;
      if (u.enemy) return false;
      if (kind === MiracleKind.DivineHealing) return u.hp < this.maxHp(u) - 1e-9;
      return u.shieldLeft <= 0.0;
    };
    if (requested !== kNoUnit) {
      const u = this.getUnit(requested);
      return u && qualifies(u) ? u : undefined;
    }
    let best: Unit | undefined;
    let bestFrac = 2.0;
    for (const u of this.units) {
      if (!qualifies(u)) continue;
      const f = kind === MiracleKind.DivineSmite ? 1.0 / Math.max(1.0, this.maxHp(u)) : u.hp / Math.max(1.0, this.maxHp(u));
      if (f < bestFrac - 1e-12) { bestFrac = f; best = u; }
    }
    return best;
  }

  // ------------------------------------------------------------------ listeners (subscription order matters: same as the C++)
  private subscribe(): void {
    const bus = this.bus;
    // Miracle Gauge: party hits and party heals fill it (enemies and miracles do not).
    bus.subscribe('DamageDealt', (ev) => {
      const s = this.getUnit(ev.source);
      if (s && !s.enemy) this.gauge.addHit();
    });
    bus.subscribe('HealApplied', (ev) => {
      const s = this.getUnit(ev.source);
      if (s && !s.enemy) this.gauge.addHeal();
    });
    // Combat log.
    bus.subscribe('FightStarted', (ev) => {
      const e = this.makeEntry(LogKind.FightStart, kNoUnit, kNoUnit, 0.0);
      e.text = `FightStarted #${ev.fightIndex}`;
      this.log.add(e);
    });
    bus.subscribe('FightEnded', () => {
      const e = this.makeEntry(LogKind.FightEnd, kNoUnit, kNoUnit, 0.0);
      e.text = `FightEnded: ${fightStateName(this.state)}`;
      this.log.add(e);
    });
    bus.subscribe('AttackStarted', (ev) => {
      const e = this.makeEntry(LogKind.Attack, ev.attacker, ev.target, 0.0);
      e.text = `${this.label(ev.attacker)} attacks ${this.label(ev.target)}`;
      this.log.add(e);
    });
    bus.subscribe('DamageDealt', (ev) => {
      const e = this.makeEntry(LogKind.Damage, ev.source, ev.target, ev.amount);
      e.text = `${this.label(ev.source)} hits ${this.label(ev.target)} for ${fmtF(ev.amount, 1)}${ev.crit ? ' (crit)' : ''}${ev.tags & DamageTag.Ability ? ' [ability]' : ''}`;
      this.log.add(e);
    });
    bus.subscribe('HealApplied', (ev) => {
      const e = this.makeEntry(LogKind.Heal, ev.source, ev.target, ev.effectiveAmount);
      e.text = `${this.label(ev.source)} heals ${this.label(ev.target)} for ${fmtF(ev.effectiveAmount, 1)}`;
      this.log.add(e);
    });
    bus.subscribe('AbilityCast', (ev) => {
      const e = this.makeEntry(LogKind.Ability, ev.caster, kNoUnit, 0.0);
      e.text = `${this.label(ev.caster)} casts ${ev.abilityId}`;
      this.log.add(e);
    });
    bus.subscribe('UnitDied', (ev) => {
      const e = this.makeEntry(LogKind.Death, ev.unit, ev.killer, 0.0);
      e.text = `${this.label(ev.unit)} dies (killed by ${this.label(ev.killer)})`;
      this.log.add(e);
    });
    bus.subscribe('EnemyKilled', (ev) => {
      const e = this.makeEntry(LogKind.Kill, ev.killer, ev.enemy, 0.0);
      e.text = `EnemyKilled: ${this.label(ev.enemy)} (quota count ${this.enemiesKilled})`;
      this.log.add(e);
    });
    bus.subscribe('EnrageTick', (ev) => {
      const e = this.makeEntry(LogKind.Enrage, kNoUnit, kNoUnit, ev.damageBonus);
      e.text = `Enrage step ${ev.step}: enemy damage +${fmtF(ev.damageBonus * 100.0, 0)}%`;
      this.log.add(e);
    });

    // Threat: damage x Threat stat x class multiplier to the damaged enemy's table; summons credit their owner (greater 0.5x).
    // Healing adds healThreatFactor of the effective heal to every living enemy's table for the healer.
    bus.subscribe('DamageDealt', (ev) => {
      const src = this.getUnit(ev.source);
      const tgt = this.getUnit(ev.target);
      if (!src || !tgt || src.enemy || !tgt.enemy) return;
      let credited: Unit | undefined = src;
      let share = 1.0;
      if (src.summon) {
        credited = this.getUnit(src.owner);
        share = src.weapon ? 1.0 : this.cfg.summonThreatShare;
        if (!credited) return;
      }
      // Damage-based threat: Threat stat x class ThreatMultiplier x Rage's multiplier (while active) x the ability's own (Bloodrush), each once.
      const rage = credited.rageThreatLeft > 0.0 ? credited.rageThreatMult : 1.0;
      const add = ev.amount * credited.stats.get(StatId.Threat) * credited.threatMult * share * rage * this.threatNow;
      this.addThreat(tgt, credited.id, add);
      credited.threatGenerated += add;
    });
    bus.subscribe('HealApplied', (ev) => {
      const src = this.getUnit(ev.source);
      if (!src || src.enemy) return;
      // Lifesteal heals do NOT raise healing threat; they are queued, so they are matched here in order.
      const front = this.pendingLifesteal[0];
      if (front && front.source === ev.source && front.target === ev.target) {
        this.pendingLifesteal.shift();
        return;
      }
      const add = ev.effectiveAmount * this.cfg.healThreatFactor;
      for (const en of this.units) if (en.enemy && en.alive) this.addThreat(en, src.id, add);
      src.threatGenerated += add * this.countAliveEnemies();
    });

    // Summary counters and lifesteal.
    bus.subscribe('DamageDealt', (ev) => {
      const src = this.getUnit(ev.source);
      const tgt = this.getUnit(ev.target);
      if (src) src.damageDone += ev.amount;
      if (tgt) {
        tgt.damageTaken += ev.amount;
        if (ev.source >= 0) {
          while (tgt.damageFrom.length <= ev.source) tgt.damageFrom.push(0.0);
          tgt.damageFrom[ev.source] += ev.amount;
        }
      }
      const steal = src ? src.lifesteal + src.rageLifesteal : 0.0;
      if (src && src.alive && steal > 0.0) {
        this.pendingLifesteal.push({ source: src.id, target: src.id });
        if (this.applyHeal(src.id, src.id, ev.amount * steal) <= 0.0) this.pendingLifesteal.pop();
      }
    });
    bus.subscribe('HealApplied', (ev) => {
      const src = this.getUnit(ev.source);
      if (src) src.healDone += ev.effectiveAmount;
    });
  }

  private addThreat(enemyUnit: Unit, partyId: UnitId, amount: number): void {
    if (partyId < 0) return;
    while (enemyUnit.threat.length <= partyId) enemyUnit.threat.push(0.0);
    enemyUnit.threat[partyId] += amount;
  }
  private threatValue(enemyUnit: Unit, partyId: UnitId): number {
    if (partyId < 0 || partyId >= enemyUnit.threat.length) return 0.0;
    return enemyUnit.threat[partyId];
  }
  private countAliveEnemies(): number {
    let n = 0;
    for (const u of this.units) if (u.enemy && u.alive) ++n;
    return n;
  }

  // ------------------------------------------------------------------ death, end, enrage
  /** Quiet end of a summon. Spirits never raise UnitDied / EnemyKilled. */
  private retireSummon(s: Unit, how: string): void {
    if (!s.alive) return;
    s.alive = false;
    s.removed = true;
    s.hp = 0.0;
    s.target = kNoUnit;
    this.note(`${this.label(s)} ${how}`);
  }
  private retireSpiritsOf(ownerId: UnitId, how: string): void {
    for (const u of this.units) if (u.summon && u.alive && u.owner === ownerId) this.retireSummon(u, how);
  }

  private kill(victim: Unit, killer: UnitId): void {
    if (victim.summon) { this.retireSummon(victim, 'is destroyed'); return; }
    victim.alive = false;
    victim.hp = 0.0;
    victim.castKind = CastKind.None;
    victim.target = kNoUnit;
    victim.tauntLeft = 0.0;
    victim.tauntEnemiesLeft = 0.0;
    if (!victim.enemy) this.retireSpiritsOf(victim.id, 'vanishes (its Summoner died)');
    const k = this.getUnit(killer);
    if (k) ++k.kills;
    if (victim.enemy) ++this.enemiesKilled;
    if (!victim.enemy && !victim.summon && !this.firstDeath.valid) {
      const fd = this.firstDeath;
      fd.valid = true;
      fd.victim = victim.id;
      fd.killer = killer;
      fd.time = this.time;
      let best = -1.0;
      for (let i = 0; i < victim.damageFrom.length; i++) {
        if (victim.damageFrom[i] > best) {
          best = victim.damageFrom[i];
          fd.topSource = i;
        }
      }
      fd.topAmount = Math.max(0.0, best);
      fd.text = `First to fall: ${this.label(victim)} at ${fmtF(this.time, 2)}s, killed by ${this.label(killer)}; most damage from ${this.label(fd.topSource)} (${fmtF(fd.topAmount, 1)})`;
    }
    this.bus.raise('UnitDied', { unit: victim.id, killer, wasEnemy: victim.enemy });
    if (victim.enemy) this.bus.raise('EnemyKilled', { enemy: victim.id, killer });
  }

  private checkEnd(): void {
    let partyAlive = 0;
    let enemiesAlive = 0;
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.enemy) ++enemiesAlive;
      else if (!u.summon) ++partyAlive;
    }
    if (partyAlive === 0) this.endFight(FightState.Wiped);
    else if (enemiesAlive === 0 && this.waves.length === 0) this.endFight(FightState.Won);
    else if (this.time >= this.cfg.runawayGuardSeconds) this.endFight(FightState.TimedOut);
  }

  private endFight(result: FightState): void {
    this.state = result;
    for (const u of this.units) {
      if (u.summon && u.alive) { u.alive = false; u.removed = true; }
    }
    this.projectiles = [];
    if (result === FightState.TimedOut) this.note('Fight hit the runaway guard (no one can win): TIMEOUT');
    this.bus.raise('FightEnded', { fightIndex: this.fightIndex, partyWon: result === FightState.Won });
    if (result === FightState.Wiped && this.firstDeath.valid) this.note(this.firstDeath.text);
  }

  private reviveDeadParty(why: string): number {
    let n = 0;
    for (const u of this.units) {
      if (u.enemy || u.summon || u.alive) continue;
      u.alive = true;
      u.hp = 1.0;
      ++n;
      this.note(`${why}: ${this.label(u)} back at 1 HP`);
    }
    return n;
  }

  private spawnDueWaves(): void {
    for (let i = 0; i < this.waves.length;) {
      if (this.time + 1e-9 >= this.waves[i].atSeconds) {
        const w = this.waves[i];
        this.waves.splice(i, 1);
        this.note(`Reinforcement wave arrives (${w.enemies.length} enemies)`);
        for (const n of w.enemies) {
          if (this.addEnemy(n, w.floorNumber, true) === kNoUnit) this.note(`WARNING: unknown enemy '${n}' in a reinforcement wave was skipped`);
        }
      } else {
        ++i;
      }
    }
  }

  private updateEnrage(): void {
    if (this.tick < this.enrageStartTick) return;
    const step = idiv(this.tick - this.enrageStartTick, this.enrageStepTicks) + 1;
    if (step <= this.enrageStep) return;
    this.enrageStep = step;
    const bonus = step * this.cfg.enrageBonusPerStep;
    for (const u of this.units) {
      if (!u.enemy || !u.alive) continue;
      u.stats.removeBySource(ModSource.Enrage);
      u.stats.addModifier(StatId.Damage, ModKind.Percent, bonus, ModSource.Enrage);
    }
    this.bus.raise('EnrageTick', { step, damageBonus: bonus });
  }

  private tickTimers(u: Unit): void {
    const dt = this.cfg.dt;
    u.stats.tick(dt);
    if (u.shieldLeft > 0.0) u.shieldLeft = Math.max(0.0, u.shieldLeft - dt);
    if (u.dmgReductionLeft > 0.0) {
      u.dmgReductionLeft -= dt;
      if (u.dmgReductionLeft <= 0.0) u.dmgReduction = 0.0;
    }
    if (u.rageThreatLeft > 0.0) {
      u.rageThreatLeft -= dt;
      if (u.rageThreatLeft <= 0.0) { u.rageThreatLeft = 0.0; u.rageThreatMult = 1.0; }
    }
    if (u.rageLifestealLeft > 0.0) {
      u.rageLifestealLeft -= dt;
      if (u.rageLifestealLeft <= 0.0) u.rageLifesteal = 0.0;
    }
    if (u.tauntLeft > 0.0) u.tauntLeft = Math.max(0.0, u.tauntLeft - dt);
    if (u.tauntEnemiesLeft > 0.0) u.tauntEnemiesLeft = Math.max(0.0, u.tauntEnemiesLeft - dt);
    const regen = u.stats.get(StatId.HealthRegen);
    if (regen > 0.0) u.hp = Math.min(this.maxHp(u), u.hp + regen * dt);
    const interval = 1.0 / this.speedOf(u);
    // The timer may hold up to one tick beyond the interval so the remainder of a shot is carried; no burst.
    u.attackTimer = Math.min(u.attackTimer + dt, interval + dt);
    const cdr = 1.0 + u.stats.get(StatId.CooldownReduction);
    if (u.abilityId !== '') {
      const cd = this.cooldownOf(u.abilityId);
      u.abilityTimer = Math.min(u.abilityTimer + dt * cdr, cd);
    }
    for (const x of u.extraAbilities) {
      const cd = this.cooldownOf(x.id);
      x.timer = Math.min(x.timer + dt * cdr, cd);
    }
    if (u.summon && !u.weapon) {
      u.lifeLeft -= dt;
      if (u.lifeLeft <= 0.0) this.retireSummon(u, 'fades away');
    }
  }

  // ------------------------------------------------------------------ geometry
  private clampToArena(p: { x: number; y: number }): void {
    p.x = Math.min(this.cfg.arenaW * 0.5, Math.max(-this.cfg.arenaW * 0.5, p.x));
    p.y = Math.min(this.cfg.arenaH * 0.5, Math.max(-this.cfg.arenaH * 0.5, p.y));
  }

  /** Party -> living enemies; enemies -> living party units, summons only when no party unit is alive. */
  private foes(u: Unit): Unit[] {
    if (!u.enemy) return this.units.filter((o) => o.enemy && o.alive);
    const out = this.units.filter((o) => !o.enemy && !o.summon && o.alive);
    return out.length ? out : this.units.filter((o) => !o.enemy && o.summon && o.alive);
  }
  private allies(u: Unit): Unit[] {
    return this.units.filter((o) => o.alive && !o.summon && o.enemy === u.enemy);
  }
  private closestOf(from: Unit, list: Unit[]): Unit | undefined {
    let best: Unit | undefined;
    let bestD = 0.0;
    for (const c of list) {
      const d = dist(from, c);
      if (!best || d < bestD - 1e-9) { best = c; bestD = d; }
    }
    return best;
  }
  /** Lowest HP fraction ally (strictly hurt: below max). */
  private lowestHpAlly(u: Unit, includeSelf: boolean): Unit | undefined {
    let best: Unit | undefined;
    let bestFrac = 2.0;
    for (const a of this.allies(u)) {
      if (!includeSelf && a.id === u.id) continue;
      const frac = a.hp / this.maxHp(a);
      if (a.hp < this.maxHp(a) - 1e-9 && frac < bestFrac - 1e-12) { best = a; bestFrac = frac; }
    }
    return best;
  }

  // ------------------------------------------------------------------ targeting
  private updateTarget(u: Unit): void {
    const foes = this.foes(u);
    if (foes.length === 0) { u.target = kNoUnit; return; }
    if (u.enemy) {
      // Warrior Taunt: while a party unit's taunt is active, every enemy must target it (closest of several).
      const taunters = foes.filter((f) => f.tauntEnemiesLeft > 0.0);
      if (taunters.length) { u.target = this.closestOf(u, taunters)!.id; return; }
      // Highest threat; ties broken by the combat stream; keep the current target while it is still tied-best.
      let best = -1.0;
      for (const f of foes) best = Math.max(best, this.threatValue(u, f.id));
      const tied = foes.filter((f) => this.threatValue(u, f.id) >= best - 1e-9);
      for (const f of tied) if (f.id === u.target) return;
      u.target = tied[this.rng.nextInt(tied.length)].id;
      return;
    }
    // Enemy taunt: every party unit (summons keep their own rules) must target a taunting enemy (closest of several).
    u.tauntForced = false;
    if (!u.summon) {
      const taunters = foes.filter((f) => f.tauntLeft > 0.0);
      if (taunters.length) {
        u.target = this.closestOf(u, taunters)!.id;
        u.tauntForced = true;
        return;
      }
    }
    if (u.behavior === Behavior.Frontline) {
      // Tank rule: the enemy this unit has the LOWEST threat on; ties go to the closest. Melee foes first (tankMeleeFirstRange).
      let best: Unit | undefined;
      let bestT = 0.0;
      const meleeFoes: Unit[] = [];
      if (this.cfg.tankMeleeFirstRange > 0.0) {
        for (const f of foes) if (f.stats.get(StatId.Range) <= this.cfg.tankMeleeFirstRange) meleeFoes.push(f);
      }
      // When every melee foe is already on this unit, a ranged foe shooting someone else is chased (closest first).
      let poolFoes = meleeFoes.length === 0 ? foes : meleeFoes;
      if (meleeFoes.length) {
        let meleeOnOthers = false;
        for (const f of meleeFoes) if (f.target !== u.id) { meleeOnOthers = true; break; }
        if (!meleeOnOthers) {
          const harassers = foes.filter((f) => f.stats.get(StatId.Range) > this.cfg.tankMeleeFirstRange && f.target !== u.id);
          if (harassers.length) poolFoes = harassers;
        }
      }
      for (const f of poolFoes) {
        const t = this.threatValue(f, u.id);
        if (!best || t < bestT - 1e-9 || (Math.abs(t - bestT) <= 1e-9 && dist(u, f) < dist(u, best) - 1e-9)) {
          best = f;
          bestT = t;
        }
      }
      u.target = best!.id;
      return;
    }
    // Party priority list: first type with a valid enemy; remaining ties go to the closest.
    for (const tt of u.targetTypes) {
      let pool: Unit[] = [];
      switch (tt) {
        case 'Closest': pool = foes; break;
        case 'Weakest': {
          let lo = 1e18;
          for (const f of foes) lo = Math.min(lo, f.hp);
          pool = foes.filter((f) => f.hp <= lo + 1e-9);
          break;
        }
        case 'Strongest': {
          let hi = -1.0;
          for (const f of foes) hi = Math.max(hi, f.hp);
          pool = foes.filter((f) => f.hp >= hi - 1e-9);
          break;
        }
        case 'HealerFirst': pool = foes.filter((f) => f.healer); break;
        case 'ArcherFirst': pool = foes.filter((f) => f.archer); break;
      }
      if (pool.length) { u.target = this.closestOf(u, pool)!.id; return; }
    }
    u.target = this.closestOf(u, foes)!.id;
  }

  // ------------------------------------------------------------------ movement
  private static away(from: Unit, threat: Unit): { dx: number; dy: number } {
    let vx = from.x - threat.x;
    let vy = from.y - threat.y;
    let len = hypot(vx, vy);
    if (len < 1.0) { // exactly stacked: push along a fixed axis by side so it stays deterministic
      vx = from.enemy ? 1.0 : -1.0;
      vy = 0.0;
      len = 1.0;
    }
    return { dx: vx / len, dy: vy / len };
  }

  /** A goal point when the unit wants to move; undefined to hold position. */
  private computeGoal(u: Unit): { x: number; y: number } | undefined {
    const foes = this.foes(u);
    if (foes.length === 0) return undefined;
    let tgt = this.getUnit(u.target);
    if (!tgt || !tgt.alive) tgt = this.closestOf(u, foes)!;
    const range = u.stats.get(StatId.Range);
    const melee = u.behavior === Behavior.Frontline || u.behavior === Behavior.Melee;
    if (melee) {
      const d = dist(u, tgt);
      if (d <= range) return undefined; // engaged: stay
      const a = CombatSim.away(u, tgt);
      return { x: tgt.x + a.dx * range * this.cfg.standoffFactor, y: tgt.y + a.dy * range * this.cfg.standoffFactor };
    }
    // Ranged and healers: retreat from anything too close, then hold inside the preferred band.
    const nearest = this.closestOf(u, foes)!;
    const dn = dist(u, nearest);
    if (u.retreat > 0.0 && dn < u.retreat) u.retreating = true;
    if (u.retreating && dn >= Math.max(u.prefMin, u.retreat)) u.retreating = false;
    if (u.retreating) {
      const a = CombatSim.away(u, nearest);
      const hold = Math.max(u.prefMin, u.retreat * this.cfg.retreatHoldFactor);
      const g = { x: nearest.x + a.dx * hold, y: nearest.y + a.dy * hold };
      this.clampToArena(g);
      if (hypot(g.x - u.x, g.y - u.y) < 5.0) u.retreating = false; // cornered against the arena edge
      else return g;
    }
    if (u.behavior === Behavior.Backline) {
      const hurt = this.lowestHpAlly(u, false);
      if (hurt && dist(u, hurt) > range) { // keep the lowest-HP ally inside Range
        const a = CombatSim.away(u, hurt);
        return { x: hurt.x + a.dx * range * this.cfg.standoffFactor, y: hurt.y + a.dy * range * this.cfg.standoffFactor };
      }
      // The party healer holds its position with nobody hurt; enemy healers keep the generic approach below.
      if (hurt || !u.enemy) return undefined;
    }
    const bound = u.prefMax > 0.0 ? Math.min(u.prefMax, range) : range;
    const dt2 = dist(u, tgt);
    if (dt2 > bound) {
      const a = CombatSim.away(u, tgt);
      return { x: tgt.x + a.dx * bound * this.cfg.boundFactor, y: tgt.y + a.dy * bound * this.cfg.boundFactor };
    }
    return undefined;
  }

  private updateMovement(u: Unit): void {
    if (u.moveSpeed <= 0.0) return;
    u.goalTimer -= this.cfg.dt;
    if (u.goalTimer <= 0.0) {
      u.goalTimer = this.cfg.goalInterval;
      const g = this.computeGoal(u);
      if (g) {
        this.clampToArena(g);
        if (!u.hasGoal || hypot(g.x - u.goalX, g.y - u.goalY) > this.cfg.goalHysteresis) {
          u.goalX = g.x;
          u.goalY = g.y;
          u.hasGoal = true;
        }
      } else {
        u.hasGoal = false;
      }
    }
    if (!u.hasGoal) return;
    const step = u.moveSpeed * this.cfg.dt;
    const vx = u.goalX - u.x;
    const vy = u.goalY - u.y;
    const len = hypot(vx, vy);
    if (len <= step) {
      u.x = u.goalX;
      u.y = u.goalY;
      u.hasGoal = false;
    } else {
      u.x += (vx / len) * step;
      u.y += (vy / len) * step;
    }
    this.clampToArena(u);
  }

  /** Keeps units from stacking: one deterministic pass per tick over all pairs. */
  private separate(): void {
    const minD = this.cfg.separation;
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i];
      if (!a.alive || a.weapon) continue;
      for (let j = i + 1; j < this.units.length; j++) {
        const b = this.units[j];
        if (!b.alive || b.weapon) continue;
        let vx = b.x - a.x;
        let vy = b.y - a.y;
        let d = hypot(vx, vy);
        if (d >= minD) continue;
        const push = (minD - d) * 0.5;
        if (d < 1e-6) { vx = 0.0; vy = 1.0; d = 1.0; }
        a.x -= (vx / d) * push;
        a.y -= (vy / d) * push;
        b.x += (vx / d) * push;
        b.y += (vy / d) * push;
      }
    }
    for (const u of this.units) if (u.alive) this.clampToArena(u);
  }

  // ------------------------------------------------------------------ auto attack
  private tryAuto(u: Unit): void {
    if (u.summon && u.spiritHeals) { this.spiritHeal(u); return; } // a healing spirit pulses a heal instead of attacking
    if (u.hasWeaponSpirit && !u.spiritHeals) return; // the (damage) Summoner's weapon is its spirit
    const interval = 1.0 / this.speedOf(u);
    const bound = this.autoCastBase(u) > 0.0; // cast-bound casters have no swing timer: the cast time is the limit
    if (!bound && u.attackTimer < interval - 1e-9) return;
    const range = u.stats.get(StatId.Range);
    let tags: number = DamageTag.Auto;
    if (u.summon) tags |= DamageTag.Summon;
    if (u.healer && !u.spiritHeals) {
      // Smite rule: heal the lowest-HP ally while any is below the threshold, else smite.
      const hurt = this.lowestHpAlly(u, true);
      if (hurt && hurt.hp / this.maxHp(hurt) < u.smiteThreshold) {
        if (dist(u, hurt) > range) return; // waiting to get the ally into Range
        if (!bound) u.attackTimer -= interval;
        const power = (bound ? this.autoCastPower(u) : 1.0) * this.autoPower(u);
        const healBase = kHealBase * u.autoHealScale * u.healFloorMult * power;
        const w = bound ? this.autoCastTime(u) : this.autoWindup(u);
        if (w > 0.0) { this.startCast(u, CastKind.AutoHeal, w, hurt.id, 0, healBase); return; }
        this.applyHeal(u.id, hurt.id, healBase);
        return;
      }
      tags |= DamageTag.Smite;
    }
    let tgt = this.getUnit(u.target);
    if (u.behavior === Behavior.Frontline && !u.tauntForced && (!tgt || !tgt.alive || dist(u, tgt) > range)) {
      // The lowest-threat target is out of reach: attack any enemy in melee reach (u.target stays the preference).
      const reach = this.foes(u).filter((f) => dist(u, f) <= range);
      if (reach.length) tgt = this.closestOf(u, reach);
    }
    if (!tgt || !tgt.alive || dist(u, tgt) > range) return;
    if (!bound) u.attackTimer -= interval;
    this.bus.raise('AttackStarted', { attacker: u.id, target: tgt.id });
    const w = bound ? this.autoCastTime(u) : this.autoWindup(u);
    u.castScale = (bound ? this.autoCastPower(u) : 1.0) * this.autoPower(u);
    if (w > 0.0) { this.startCast(u, CastKind.Auto, w, tgt.id, tags, 0.0); return; }
    this.launchAuto(u, tgt.id, u.castScale, tags);
  }

  /** A healing spirit's pulse: heals the most hurt ally for its owner (credit, Heal Power and threat go to the Summoner). Nobody hurt: the
   *  pulse stays ready. */
  private spiritHeal(u: Unit): void {
    const owner = this.getUnit(u.owner);
    if (!owner || !owner.alive) return;
    const interval = 1.0 / u.stats.get(StatId.AttackSpeed);
    if (u.attackTimer < interval - 1e-9) return;
    const hurt = this.lowestHpAlly(owner, true);
    if (!hurt || hurt.hp / this.maxHp(hurt) >= owner.smiteThreshold) { this.spiritSmite(u, owner, interval); return; } // nobody needs healing: like the Priest, smite
    if (dist(owner, hurt) > owner.stats.get(StatId.Range)) return;
    u.attackTimer -= interval;
    const scale = (u.greater ? this.cfg.greaterSpiritHealScale * this.abilityPower('GreaterSpirit') : this.cfg.spiritHealScale * this.abilityPower('SpiritHeal'));
    this.applyHeal(owner.id, hurt.id, kHealBase * scale + Math.max(0.0, owner.stats.get(StatId.SpiritDamage)));
  }

  /** A healing spirit with everyone at or above the Summoner's smite threshold (85%) strikes her target instead (else the closest enemy in her
   *  Range), once per pulse, for the spirit's own Damage. Credit and threat go to the Summoner like the heal. */
  private spiritSmite(u: Unit, owner: Unit, interval: number): void {
    const range = owner.stats.get(StatId.Range);
    let tgt = this.getUnit(owner.target);
    if (!tgt || !tgt.alive || tgt.removed || !tgt.enemy || dist(owner, tgt) > range) {
      const reach = this.foes(owner).filter((f) => !f.removed && dist(owner, f) <= range);
      tgt = reach.length ? this.closestOf(owner, reach) : undefined;
    }
    if (!tgt) return;
    u.attackTimer -= interval;
    this.launchAuto(u, tgt.id, this.autoPower(owner), DamageTag.Auto | DamageTag.Summon | DamageTag.Smite);
  }

  /** True when any living hero (the Summoner herself included) is below the smite threshold, i.e. a heal is worth casting. */
  private someoneNeedsHealing(u: Unit): boolean {
    return this.units.some((o) => !o.enemy && !o.summon && o.alive && o.hp / this.maxHp(o) < u.smiteThreshold);
  }

  /** Bloodrush's target: the enemy closest to the Barbarian that is attacking a vulnerable ally (a ranged or back-line hero), else his normal
   *  target, else the closest enemy; only enemies within bloodrushRange. A forced (taunted) target wins. */
  private bloodrushTarget(u: Unit): Unit | undefined {
    const foes = this.foes(u).filter((f) => !f.removed && dist(u, f) <= this.cfg.bloodrushRange);
    if (foes.length === 0) return undefined;
    const current = this.getUnit(u.target);
    const normal = current && current.alive && foes.includes(current) ? current : undefined;
    if (u.tauntForced && normal) return normal;
    let best: Unit | undefined;
    let bestD = 0.0;
    for (const f of foes) {
      const victim = this.getUnit(f.target);
      const vulnerable = !!victim && victim.alive && !victim.enemy && !victim.summon && (victim.behavior === Behavior.Backline || victim.behavior === Behavior.Caster);
      if (!vulnerable) continue;
      const d = dist(u, f);
      if (!best || d < bestD) { best = f; bestD = d; }
    }
    return best ?? normal ?? this.closestOf(u, foes);
  }
  /** One tick of a Bloodrush: close on the target at the rush speed and, in reach, hit it. A target that died or went away is replaced by the
   *  next best; with none left (or out of time) the rush ends and its cooldown is refunded. */
  private advanceRush(u: Unit): void {
    u.rushLeft -= this.cfg.dt;
    let t = this.getUnit(u.rushTarget);
    if (!t || !t.alive || t.removed) {
      t = this.bloodrushTarget(u);
      u.rushTarget = t ? t.id : kNoUnit;
    }
    if (!t || u.rushLeft <= 0.0) { this.endRush(u, true); return; }
    const reach = u.stats.get(StatId.Range);
    const d = dist(u, t);
    if (d <= reach) {
      const ab = this.data.findAbility(u.rushAbility);
      this.threatNow = ab?.ThreatMultiplier ?? 1.0;
      this.dealDamage(u.id, t.id, u.rushValue, DamageTag.Ability);
      this.threatNow = 1.0;
      this.endRush(u, false);
      return;
    }
    const step = Math.min(u.moveSpeed * this.cfg.bloodrushSpeedMult * this.cfg.dt, d - reach * 0.9);
    u.x += ((t.x - u.x) / d) * step;
    u.y += ((t.y - u.y) / d) * step;
    this.clampToArena(u);
  }
  private endRush(u: Unit, refund: boolean): void {
    const name = u.rushAbility;
    u.rushLeft = 0.0;
    u.rushTarget = kNoUnit;
    if (refund) this.setTimer(u, name === u.abilityId ? -1 : u.extraAbilities.findIndex((x) => x.id === name), this.cooldownOf(name));
  }

  /** A healing spirit sits midway between its Summoner and the ally it will heal next (the most hurt one); with nobody hurt (or the Summoner
   *  herself hurt) it sits beside the Summoner. Inside spiritHealIdleRadius of that spot it stays put, so switching targets does not make it
   *  shuffle. It never chases enemies. */
  private moveHealSpirit(s: Unit): void {
    const o = this.getUnit(s.owner);
    if (!o || !o.alive) return;
    const hurt = this.lowestHpAlly(o, true);
    const off = this.cfg.spiritSpawnOffset;
    const other = hurt && hurt.id !== o.id ? hurt : undefined;
    const tx = other ? (o.x + other.x) * 0.5 : o.x + off, ty = other ? (o.y + other.y) * 0.5 : o.y;
    const stop = this.cfg.spiritHealIdleRadius;
    const dx = tx - s.x, dy = ty - s.y;
    const d = hypot(dx, dy);
    // Leaving the idle radius starts a walk that carries on until the spirit is well inside it, so it settles instead of creeping.
    if (d <= stop * 0.25) s.spiritWalking = false;
    else if (d > stop) s.spiritWalking = true;
    if (!s.spiritWalking) return;
    const step = Math.min(s.moveSpeed * this.cfg.dt, d);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
    this.clampToArena(s);
  }

  /** Testing-menu multipliers (see CombatConfig). */
  private autoPower(u: Unit): number { return u.summon ? 1.0 : this.cfg.autoPowerMult.get(u.name) ?? 1.0; }
  private speedOf(u: Unit): number { return u.stats.get(StatId.AttackSpeed) * (u.summon ? 1.0 : this.cfg.autoSpeedMult.get(u.name) ?? 1.0); }
  private abilityPower(name: string): number { return this.cfg.abilityPowerMult.get(name) ?? 1.0; }
  private cooldownOf(name: string): number { return (this.data.findAbility(name)?.Cooldown ?? 0.0) * (this.cfg.abilityCooldownMult.get(name) ?? 1.0); }

  /** The unit's base auto cast time when it is cast-bound right now (listed in autoCastTimes and the time scale is on), else 0. */
  private autoCastBase(u: Unit): number {
    if (u.summon || this.cfg.castTimeScale <= 0.0) return 0.0;
    const base = this.cfg.autoCastTimes.get(u.name);
    return base !== undefined && base > 0.0 ? base : 0.0;
  }
  /** Seconds one auto cast takes now: base x (class base AttackSpeed / current AttackSpeed), so AttackSpeed upgrades act as cast speed. */
  private autoCastTime(u: Unit): number {
    const baseAs = Math.max(1e-6, u.stats.getBase(StatId.AttackSpeed));
    return this.cfg.castTimeScale * this.autoCastBase(u) * baseAs / this.speedOf(u);
  }
  /** Damage and heal multiplier of a cast-bound auto: base cast time x class base AttackSpeed, so a longer base cast hits harder and the
   *  class's DPS (and healing per second) stays what ClassData says. Not scaled by AttackSpeed or by the testing time scale. */
  private autoCastPower(u: Unit): number {
    return this.autoCastBase(u) * Math.max(1e-6, u.stats.getBase(StatId.AttackSpeed));
  }
  /** An auto hit: a projectile when the unit is a projectile caster and flight time is on, else damage right now. */
  private launchAuto(u: Unit, targetId: UnitId, scale: number, tags: number): void {
    if (this.cfg.projectileSpeed > 0.0 && this.cfg.projectileUnits.includes(u.name)) {
      this.projectiles.push({ id: this.nextProjectileId++, source: u.id, target: targetId, x: u.x, y: u.y, scale, tags });
      return;
    }
    this.dealDamage(u.id, targetId, scale, tags);
  }
  private advanceProjectiles(): void {
    if (this.projectiles.length === 0) return;
    const step = this.cfg.projectileSpeed * this.cfg.dt;
    const kept: Projectile[] = [];
    for (const p of this.projectiles) {
      const tgt = this.getUnit(p.target);
      if (!tgt || !tgt.alive || tgt.removed) continue; // the target died in flight: the bolt is lost
      const dx = tgt.x - p.x, dy = tgt.y - p.y;
      const d = hypot(dx, dy);
      if (d <= step) { this.dealDamage(p.source, p.target, p.scale, p.tags); continue; }
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      kept.push(p);
    }
    this.projectiles = kept; // a landing hit launches nothing, so nothing is added while the loop runs
  }

  // ------------------------------------------------------------------ casts and windups
  private autoWindup(u: Unit): number {
    if (u.summon) return 0.0;
    const w = this.cfg.autoWindups.get(u.name);
    if (w === undefined || w <= 0.0) return 0.0;
    return Math.max(0.0, this.cfg.castTimeScale) * w * (u.elite || u.boss ? this.cfg.eliteWindupFactor : 1.0);
  }
  private abilityCastTime(u: Unit, abilityName: string): number {
    if (u.summon) return 0.0;
    const w = this.cfg.abilityCastTimes.get(abilityName);
    if (w === undefined || w <= 0.0) return 0.0;
    return Math.max(0.0, this.cfg.castTimeScale) * w * (u.elite || u.boss ? this.cfg.eliteWindupFactor : 1.0);
  }
  private startCast(u: Unit, kind: CastKind, seconds: number, target: UnitId, tags: number, heal: number): void {
    u.castKind = kind;
    u.castLeft = u.castTotal = seconds;
    u.castTarget = target;
    u.castTags = tags;
    u.castHeal = heal;
  }
  /** Counts the cast down; at zero the action lands against whatever is true NOW (a target that died meanwhile fizzles it). */
  private advanceCast(u: Unit): void {
    u.castLeft -= this.cfg.dt;
    if (u.castLeft > 1e-9) return;
    const kind = u.castKind;
    u.castKind = CastKind.None;
    u.castLeft = 0.0;
    const interval = 1.0 / this.speedOf(u);
    const t = this.getUnit(u.castTarget);
    const targetOk = !!t && t.alive && !t.removed;
    if (kind === CastKind.Auto) {
      if (!targetOk) { u.attackTimer = Math.min(u.attackTimer + interval, interval + this.cfg.dt); return; } // fizzle: refunded
      this.launchAuto(u, t!.id, u.castScale, u.castTags);
    } else if (kind === CastKind.AutoHeal) {
      if (!targetOk || t!.hp >= this.maxHp(t!) - 1e-9) { u.attackTimer = Math.min(u.attackTimer + interval, interval + this.cfg.dt); return; }
      this.applyHeal(u.id, t!.id, u.castHeal);
    } else if (kind === CastKind.Ability) {
      this.resolveAbilityCast(u);
    }
  }

  // ------------------------------------------------------------------ abilities (effects as data)
  private triggerAllows(u: Unit): boolean {
    switch (u.trigger) {
      case 'OnCooldown': return true;
      case 'SaveForBossOrElite':
        return this.units.some((o) => o.enemy && o.alive && (o.elite || o.boss));
      case 'PackIsLarge': return this.countAliveEnemies() >= 3;
      case 'AllyIsLow':
        return this.units.some((o) => !o.enemy && !o.summon && o.alive && o.hp / this.maxHp(o) < this.cfg.allyLowThreshold);
    }
    return true;
  }

  /** A negative value is "not configured" (-1 = TBD in data): warns once and the effect is skipped. */
  private resolveValue(eff: AbilityEffectRow): { value: number; duration: number } | undefined {
    const value = eff.Value;
    let duration = eff.Duration;
    const needsDuration = eff.Type === 'ApplyModifier' || eff.Type === 'SpawnSummon';
    const spiritStat = eff.Type === 'SpawnSummon';
    if (value < 0.0 || (needsDuration && duration < 0.0 && !spiritStat)) {
      this.warnNotConfigured(eff.Name);
      return undefined;
    }
    if (duration < 0.0) duration = 0.0;
    return { value, duration };
  }
  private warnNotConfigured(effectName: string): void {
    if (this.warnedEffects.includes(effectName)) return;
    this.warnedEffects.push(effectName);
    this.note(`WARNING: effect ${effectName} is not configured in data (-1): it does nothing`);
  }

  private effectTargets(u: Unit, eff: AbilityEffectRow): Unit[] {
    const sel = eff.TargetSelector;
    const range = u.stats.get(StatId.Range);
    if (sel === 'Self') return [u];
    if (sel === 'SelfIfEnemyInRange') {
      // In OnCooldown mode only cast with an enemy inside the caster's Range; other trigger modes and forced casts skip it.
      if (this.forcingCast || u.trigger !== 'OnCooldown') return [u];
      for (const f of this.foes(u)) if (dist(u, f) <= range) return [u];
      return [];
    }
    if (sel === 'AllAllies') return this.allies(u);
    const foes = this.foes(u);
    if (sel === 'AllEnemies') return foes;
    if (sel === 'AreaAroundSelf') {
      // Warrior Cleave: every enemy within a radius of the CASTER (the effect row's Duration; <= 0 falls back to areaRadius).
      const radius = eff.Duration > 0 ? eff.Duration : this.cfg.areaRadius;
      return foes.filter((f) => dist(u, f) <= radius);
    }
    if (sel === 'RushTarget') {
      const t = this.bloodrushTarget(u);
      return t ? [t] : [];
    }
    const inRange = foes.filter((f) => dist(u, f) <= range);
    if (inRange.length === 0) return [];
    if (sel === 'WeakestEnemy') {
      let best = inRange[0];
      for (const f of inRange) if (f.hp < best.hp - 1e-9) best = f;
      return [best];
    }
    if (sel === 'ClosestEnemy') return [this.closestOf(u, inRange)!];
    if (sel === 'AreaAroundTarget') {
      let centre = this.getUnit(u.target);
      if (!centre || !centre.alive || dist(u, centre) > range) centre = this.closestOf(u, inRange)!;
      const c = centre;
      return foes.filter((f) => dist(c, f) <= this.cfg.areaRadius);
    }
    return [];
  }

  private static statFromName(n: string): StatId | undefined {
    switch (n) {
      case 'Damage': return StatId.Damage;
      case 'AttackSpeed': return StatId.AttackSpeed;
      case 'Health': return StatId.Health;
      case 'Threat': return StatId.Threat;
      case 'DefensePct':
      case 'DefensePercent': return StatId.DefensePercent;
      case 'CritChance': return StatId.CritChance;
      case 'CritFactor': return StatId.CritFactor;
      case 'HealthRegen': return StatId.HealthRegen;
      case 'CooldownReduction': return StatId.CooldownReduction;
      case 'Range': return StatId.Range;
      case 'HealPower': return StatId.HealPower;
      default: return undefined;
    }
  }

  private tryAbility(u: Unit): void {
    this.castAbility(u, u.abilityId, -1, false);
    for (let i = 0; i < u.extraAbilities.length && u.alive; i++) this.castAbility(u, u.extraAbilities[i].id, i, false);
  }

  /** The cooldown timer of a slot: -1 the primary ability, otherwise the extraAbilities index (the C++ passes a reference). */
  private getTimer(u: Unit, slot: number): number {
    return slot >= 0 && slot < u.extraAbilities.length ? u.extraAbilities[slot].timer : u.abilityTimer;
  }
  private setTimer(u: Unit, slot: number, v: number): void {
    if (slot >= 0 && slot < u.extraAbilities.length) u.extraAbilities[slot].timer = v;
    else u.abilityTimer = v;
  }

  private sortedEffects(abilityId: string): AbilityEffectRow[] {
    const ab = this.data.findAbility(abilityId);
    const effects: AbilityEffectRow[] = [];
    if (ab) for (const id of ab.EffectIds) { const e = this.data.findEffect(id); if (e) effects.push(e); }
    return effects.sort((a, b) => a.Order - b.Order); // Array.prototype.sort is stable, like std::stable_sort
  }

  private castAbility(u: Unit, abilityId: string, slot: number, force: boolean): boolean {
    if (abilityId === '' || u.summon) return false;
    if (!force && u.castKind !== CastKind.None) return false; // already casting
    const ab = this.data.findAbility(abilityId);
    if (!ab || ab.EffectIds.length === 0) return false;
    if (!force) {
      if (this.getTimer(u, slot) < this.cooldownOf(abilityId) - 1e-9) return false;
      if (!this.triggerAllows(u)) return false;
      if (abilityId === 'GreaterSpirit' && u.spiritHeals && !this.someoneNeedsHealing(u)) return false; // a healing spirit is only worth calling when someone is hurt
    }
    const effects = this.sortedEffects(abilityId);
    if (effects.length === 0) return false;
    this.forcingCast = force;
    if (this.effectTargets(u, effects[0]).length === 0) { this.forcingCast = false; return false; } // nothing to hit: keep it ready
    this.setTimer(u, slot, 0.0);
    const w = force ? 0.0 : this.abilityCastTime(u, ab.Name);
    if (w > 0.0) {
      // A cast time: the cooldown starts now, the effects land when the bar fills (resolveAbilityCast).
      this.forcingCast = false;
      this.startCast(u, CastKind.Ability, w, kNoUnit, 0, 0.0);
      u.castAbility = abilityId;
      u.castSlot = slot >= 0 && slot < u.extraAbilities.length ? slot : -1;
      return true;
    }
    this.bus.raise('AbilityCast', { caster: u.id, abilityId: ab.Name });
    for (const eff of effects) this.applyEffect(u, eff);
    this.forcingCast = false;
    return true;
  }

  /** The cast bar filled: apply the effects to whoever is valid now; with nothing to hit it fizzles and the cooldown is refunded. */
  private resolveAbilityCast(u: Unit): void {
    const ab = this.data.findAbility(u.castAbility);
    const effects = this.sortedEffects(u.castAbility);
    if (effects.length === 0 || !ab) return;
    this.forcingCast = false;
    if (u.castAbility === 'GreaterSpirit' && u.spiritHeals && !this.someoneNeedsHealing(u)) { this.setTimer(u, u.castSlot, this.cooldownOf(u.castAbility)); return; } // everyone healed meanwhile: fizzles, refunded
    if (this.effectTargets(u, effects[0]).length === 0) { this.setTimer(u, u.castSlot, this.cooldownOf(u.castAbility)); return; }
    this.bus.raise('AbilityCast', { caster: u.id, abilityId: ab.Name });
    for (const eff of effects) this.applyEffect(u, eff);
  }

  private applyEffect(u: Unit, eff: AbilityEffectRow): void {
    const r = this.resolveValue(eff);
    if (!r) return;
    const { duration } = r;
    const powerMult = this.abilityPower(eff.AbilityId);
    // Power scales damage, heals and buff strength; a Taunt's "value" is only a flag.
    const value = eff.Type === 'ApplyModifier' && (eff.Stat === 'Taunt' || eff.Stat === 'ThreatMult') ? r.value : r.value * powerMult;
    // Collect ids first: a target dying mid-loop must not break iteration.
    const ids = this.effectTargets(u, eff).map((t) => t.id);
    switch (eff.Type) {
      case 'Damage': {
        this.threatNow = this.data.findAbility(eff.AbilityId)?.ThreatMultiplier ?? 1.0;
        for (const id of ids) this.dealDamage(u.id, id, value, DamageTag.Ability);
        this.threatNow = 1.0;
        break;
      }
      case 'Rush': {
        // Bloodrush: the rush itself (advanceRush) moves him and lands the hit; this only starts it.
        if (ids.length === 0) break;
        u.rushTarget = ids[0];
        u.rushLeft = this.cfg.bloodrushMaxSeconds;
        u.rushValue = value;
        u.rushAbility = eff.AbilityId;
        this.bus.raise('AttackStarted', { attacker: u.id, target: ids[0] });
        break;
      }
      case 'ThreatBurst':
        // Rage's opening roar: threat only (no damage, no lifesteal) of Value x the caster's Damage x Threat stat on every enemy in the area.
        for (const id of ids) {
          const en = this.getUnit(id);
          if (!en || !en.enemy) continue;
          const add = value * u.stats.get(StatId.Damage) * u.stats.get(StatId.Threat);
          this.addThreat(en, u.id, add);
          u.threatGenerated += add;
        }
        break;
      case 'Heal':
        for (const id of ids) this.applyHeal(u.id, id, value * kHealBase);
        break;
      case 'AddThreat':
        // Taunt rule: raise the caster's threat on each enemy to its current highest plus the flat bonus.
        for (const id of ids) {
          const en = this.getUnit(id);
          if (!en || !en.enemy) continue;
          let top = 0.0;
          for (const t of en.threat) top = Math.max(top, t);
          const mine = this.threatValue(en, u.id);
          this.addThreat(en, u.id, top - mine + value);
          u.threatGenerated += top - mine + value;
        }
        break;
      case 'ApplyModifier':
        for (const id of ids) {
          const t = this.getUnit(id);
          if (!t) continue;
          if (eff.Stat === 'DamageTakenReduction') {
            t.dmgReduction = value;
            t.dmgReductionLeft = duration;
          } else if (eff.Stat === 'ThreatMult') {
            t.rageThreatMult = value;
            t.rageThreatLeft = duration;
          } else if (eff.Stat === 'Lifesteal') {
            t.rageLifesteal = value;
            t.rageLifestealLeft = duration;
          } else if (eff.Stat === 'Taunt') {
            if (t.enemy) t.tauntLeft = duration; // Brute: the whole party must target it
            else if (!t.summon) t.tauntEnemiesLeft = duration; // Warrior: every enemy must target it
          } else {
            const st = CombatSim.statFromName(eff.Stat);
            if (st !== undefined) {
              // Refresh by source and stat: a recast replaces the caster's live buff on that stat.
              for (let b = 0; b < t.buffRefs.length;) {
                if (t.buffRefs[b].source === u.id && t.buffRefs[b].stat === st) {
                  t.stats.removeModifier(t.buffRefs[b].id);
                  t.buffRefs.splice(b, 1);
                } else {
                  ++b;
                }
              }
              const mid = t.stats.addModifier(st, ModKind.Percent, value, ModSource.Buff, duration);
              if (duration > 0.0) t.buffRefs.push({ source: u.id, stat: st, id: mid });
            } else {
              this.note(`ApplyModifier: unknown stat '${eff.Stat}' ignored`);
            }
          }
        }
        break;
      case 'SpawnSummon':
        this.spawnSpirit(u, duration, eff.Stat === 'Greater');
        break;
    }
  }

  /** Standard (capped at one: it is the weapon spirit) or greater spirit; a recast replaces the same kind. */
  private spawnSpirit(owner: Unit, dataDuration: number, greater: boolean): void {
    if (!greater) {
      for (const o of this.units) {
        if (o.summon && o.alive && o.owner === owner.id && !o.greater) { this.note('Standard spirit already present: cast ignored'); return; }
      }
    }
    for (const o of this.units) {
      if (o.summon && o.alive && o.owner === owner.id && o.greater === greater) this.retireSummon(o, 'is replaced by a new cast');
    }
    const cfg = this.cfg;
    const s = new Unit();
    s.id = this.units.length;
    s.name = greater ? 'GreaterSpirit' : 'Spirit';
    s.summon = true;
    s.greater = greater;
    s.owner = owner.id;
    s.behavior = Behavior.Melee;
    s.spiritHeals = owner.spiritHeals;
    s.stats.setBase(StatId.Health, greater ? cfg.greaterSpiritHp : cfg.spiritHp);
    s.stats.setBase(StatId.Damage, ((greater ? cfg.greaterSpiritDamage : cfg.spiritDamage) + Math.max(0.0, owner.stats.get(StatId.SpiritDamage))) * (greater && !owner.spiritHeals ? this.abilityPower('GreaterSpirit') : 1.0));
    s.stats.setBase(StatId.AttackSpeed, greater ? cfg.greaterSpiritAttackPerSec : cfg.spiritAttackPerSec);
    s.stats.setBase(StatId.Range, greater ? cfg.greaterSpiritRange : cfg.spiritRange);
    s.moveSpeed = greater ? cfg.greaterSpiritMoveSpeed : cfg.spiritMoveSpeed;
    s.lifeLeft = dataDuration + (greater ? Math.max(0.0, owner.stats.get(StatId.SpiritDuration)) : 0.0);
    if (s.lifeLeft <= 0.0) { this.note('WARNING: Spirit has no duration in data: not summoned'); return; }
    this.finishUnit(s);
    s.x = owner.x + cfg.spiritSpawnOffset;
    s.y = owner.y + (greater ? cfg.spiritSpawnOffset : 0.0);
    this.units.push(s);
    s.hp = this.maxHp(s);
    this.logSpawn(s);
  }

  // ------------------------------------------------------------------ Summoner weapon spirit
  private abilitySummons(abilityId: string): boolean {
    const ab = this.data.findAbility(abilityId);
    if (!ab) return false;
    return ab.EffectIds.some((id) => this.data.findEffect(id)?.Type === 'SpawnSummon');
  }
  /** Copies the Summoner's resolved Damage (+ Spirit Damage), AttackSpeed, Range, crit stats each tick; fixed offset from it. */
  private syncWeaponSpirit(s: Unit): void {
    const o = this.getUnit(s.owner);
    if (!o || !o.alive) return;
    if (s.spiritHeals) { // a healing spirit moves by itself (moveHealSpirit); only the pulse rate follows the Summoner
      s.stats.setBase(StatId.AttackSpeed, this.speedOf(o));
      // The smite it throws when nobody needs healing: the spirit's own Damage (CombatConfig spiritDamage, DRAFT 5) plus Spirit Damage.
      s.stats.setBase(StatId.Damage, this.cfg.spiritDamage + Math.max(0.0, o.stats.get(StatId.SpiritDamage)));
      s.stats.setBase(StatId.CritChance, o.stats.get(StatId.CritChance));
      s.stats.setBase(StatId.CritFactor, o.stats.get(StatId.CritFactor));
      return;
    }
    s.stats.setBase(StatId.Damage, (o.stats.get(StatId.Damage) + Math.max(0.0, o.stats.get(StatId.SpiritDamage))) * this.autoPower(o));
    s.stats.setBase(StatId.AttackSpeed, this.speedOf(o));
    s.stats.setBase(StatId.Range, o.stats.get(StatId.Range));
    s.stats.setBase(StatId.CritChance, o.stats.get(StatId.CritChance));
    s.stats.setBase(StatId.CritFactor, o.stats.get(StatId.CritFactor));
    s.x = o.x + this.cfg.spiritSpawnOffset;
    s.y = o.y;
    this.clampToArena(s);
  }
  private spawnWeaponSpirit(owner: Unit): void {
    const s = new Unit();
    s.id = this.units.length;
    s.name = 'Spirit';
    s.summon = true;
    s.weapon = true;
    s.spiritHeals = owner.spiritHeals;
    s.owner = owner.id;
    s.behavior = Behavior.Melee;
    s.moveSpeed = owner.spiritHeals ? this.cfg.spiritMoveSpeed : 0.0;
    s.lifeLeft = 1.0e18;
    s.stats.setBase(StatId.Health, this.cfg.spiritHp);
    this.finishUnit(s);
    this.units.push(s);
    if (owner.spiritHeals) { s.x = owner.x + this.cfg.spiritSpawnOffset; s.y = owner.y; } // healing spirits then move by themselves
    this.syncWeaponSpirit(s);
    s.hp = this.maxHp(s);
    this.logSpawn(s);
  }

  /** Random enemy position: a pure function of (seed, fight number, spawn number); never touches the combat stream. */
  private placeEnemyRandomly(u: Unit, slot: number, reinforcement: boolean): void {
    const mul = (a: bigint, b: bigint): bigint => BigInt.asUintN(64, a * b);
    const r = new CombatRng(
      this.placementSeed ^ mul(BigInt(this.fightIndex), 0x9e3779b97f4a7c15n) ^ mul(BigInt(slot + 1), 0xd1b54a32d192ed03n) ^
        (reinforcement ? 0xabcdef12345n : 0n),
    );
    const { x: rx, y: ry } = this.partyRallyPoint();
    const hx = this.cfg.arenaW * 0.5 - this.cfg.enemyEdgeMargin;
    const hy = this.cfg.arenaH * 0.5 - this.cfg.enemyEdgeMargin;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = (r.nextDouble() * 2.0 - 1.0) * hx;
      const y = (r.nextDouble() * 2.0 - 1.0) * hy;
      if (hypot(x - rx, y - ry) < this.cfg.enemyMinRallyDistance) continue;
      let clear = true;
      for (const o of this.units) {
        if (!o.enemy || o.removed) continue;
        if (hypot(x - o.x, y - o.y) < this.cfg.enemyMinSpacing) { clear = false; break; }
      }
      if (!clear) continue;
      u.x = x;
      u.y = y;
      return;
    }
    const off = ((slot % 5) - 2.0) * this.cfg.spawnSpacing;
    u.x = Math.max(-hx, Math.min(hx, -rx));
    u.y = Math.max(-hy, Math.min(hy, -ry));
    if (this.entryDoor === 0 || this.entryDoor === 2) u.x = Math.max(-hx, Math.min(hx, u.x + off));
    else u.y = Math.max(-hy, Math.min(hy, u.y + off));
  }
}

// ---------------------------------------------------------------------------------------------
// Headless helper: one whole fight at maximum speed (soak runs, parity checks, instant mode).
// ---------------------------------------------------------------------------------------------
export interface FightReport {
  state: FightState;
  ticks: number;
  seconds: number;
  enemiesKilled: number;
  partyAlive: number;
  firstDeath: CauseOfDeath;
  logText: string;
  summary: string;
}

export function runFightHeadless(
  data: CombatData, seed: bigint | number, party: string[], enemies: string[], floorNumber = 1, waves: WaveSpec[] = [],
  cfg: CombatConfig = defaultCombatConfig(),
): FightReport {
  const sim = new CombatSim(data, seed, cfg);
  for (const p of party) sim.addPartyUnit(p);
  for (const e of enemies) sim.addEnemy(e, floorNumber);
  for (const w of waves) sim.scheduleWave(w.atSeconds, w.enemies, floorNumber);
  sim.startFight();
  sim.runToEnd();
  return {
    state: sim.getState(),
    ticks: sim.tickCount(),
    seconds: sim.getTime(),
    enemiesKilled: sim.getEnemiesKilled(),
    partyAlive: sim.getUnits().filter((u) => !u.enemy && !u.summon && u.alive).length,
    firstDeath: { ...sim.getFirstDeath() },
    logText: sim.getLog().toText(),
    summary: sim.summaryText(),
  };
}
