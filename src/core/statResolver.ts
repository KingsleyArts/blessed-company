// StatResolver port (StatResolver.h). final = (base + sum flat) * (1 + sum percent) * product(multipliers), then clamp.
// Percent values are fractions (0.20 = +20%); multiplier values are factors (1.5 = x1.5).

export enum StatId {
  // Tier 0
  Damage = 0,
  AttackSpeed,
  Health,
  Threat,
  // Tier 1
  DefensePercent,
  CritChance,
  CritFactor,
  HealthRegen,
  CooldownReduction,
  Range,
  HealPower,
  SpiritDamage,
  SpiritDuration,
  // Tier 2 and 3 placeholders (assigned later)
  Tier2_Slot0,
  Tier2_Slot1,
  Tier2_Slot2,
  Tier2_Slot3,
  Tier2_Slot4,
  Tier2_Slot5,
  Tier2_Slot6,
  Tier2_Slot7,
  Tier3_Slot0,
  Tier3_Slot1,
  Tier3_Slot2,
  Tier3_Slot3,
  Count, // must stay last
}
export const kStatCount = StatId.Count;

export enum ModKind {
  Flat,
  Percent,
  Multiplier,
}

export enum ModSource {
  ClassBase,
  GoldUpgrade,
  Gear,
  Essence,
  FloorScaling,
  Buff,
  Enrage,
  Relic,
}

export type ModifierId = number;
export const kInvalidModifier: ModifierId = 0;
export const kNoDuration = -1;

export interface Modifier {
  id: ModifierId;
  stat: StatId;
  kind: ModKind;
  value: number;
  source: ModSource;
  timed: boolean;
  remaining: number;
}

export interface StatLimits {
  minValue: number;
  maxValue: number;
}

const LOWEST = -Number.MAX_VALUE; // std::numeric_limits<double>::lowest()
const HIGHEST = Number.MAX_VALUE;

export class StatResolver {
  private base = new Float64Array(kStatCount);
  private limits: StatLimits[] = Array.from({ length: kStatCount }, () => ({ minValue: LOWEST, maxValue: HIGHEST }));
  private mods: Modifier[] = [];
  private nextId = 1;
  private cache = new Float64Array(kStatCount);
  private dirty: boolean[] = new Array<boolean>(kStatCount).fill(true);
  private recomputes = 0;

  /** A value copy (the C++ resolver is copied by assignment, e.g. to preview one more rank). */
  clone(): StatResolver {
    const r = new StatResolver();
    r.base = this.base.slice();
    r.limits = this.limits.map((l) => ({ ...l }));
    r.mods = this.mods.map((m) => ({ ...m }));
    r.nextId = this.nextId;
    return r;
  }

  setBase(stat: StatId, value: number): void {
    this.base[stat] = value;
    this.dirty[stat] = true;
  }
  getBase(stat: StatId): number {
    return this.base[stat];
  }

  setLimits(stat: StatId, minValue: number, maxValue: number): void {
    this.limits[stat] = { minValue, maxValue };
    this.dirty[stat] = true;
  }
  getLimits(stat: StatId): StatLimits {
    return { ...this.limits[stat] };
  }

  /** duration <= 0 (default kNoDuration) = permanent. Returns the new modifier's id. */
  addModifier(stat: StatId, kind: ModKind, value: number, source: ModSource, duration: number = kNoDuration): ModifierId {
    const timed = duration > 0;
    const m: Modifier = { id: this.nextId++, stat, kind, value, source, timed, remaining: timed ? duration : 0 };
    this.mods.push(m);
    this.dirty[stat] = true;
    return m.id;
  }

  removeModifier(id: ModifierId): boolean {
    const i = this.mods.findIndex((m) => m.id === id);
    if (i < 0) return false;
    this.dirty[this.mods[i].stat] = true;
    this.mods.splice(i, 1);
    return true;
  }

  /** Removes every modifier with this source tag. Returns the count removed. */
  removeBySource(source: ModSource): number {
    let removed = 0;
    const kept: Modifier[] = [];
    for (const m of this.mods) {
      if (m.source === source) {
        this.dirty[m.stat] = true;
        removed++;
      } else kept.push(m);
    }
    this.mods = kept;
    return removed;
  }

  /** Advance timed modifiers by dt seconds; expired ones are removed. Returns the count expired. */
  tick(dt: number): number {
    let expired = 0;
    const kept: Modifier[] = [];
    for (const m of this.mods) {
      if (m.timed) {
        m.remaining -= dt;
        if (m.remaining <= 0) {
          this.dirty[m.stat] = true;
          expired++;
          continue;
        }
      }
      kept.push(m);
    }
    this.mods = kept;
    return expired;
  }

  modifierCount(): number {
    return this.mods.length;
  }
  modifierCountForSource(source: ModSource): number {
    return this.mods.reduce((n, m) => n + (m.source === source ? 1 : 0), 0);
  }

  /** Cached; recomputed only if a modifier, base or limit for this stat changed since the last read. */
  get(stat: StatId): number {
    if (this.dirty[stat]) {
      this.cache[stat] = this.compute(stat);
      this.dirty[stat] = false;
      this.recomputes++;
    }
    return this.cache[stat];
  }

  /** For tests: how many times a stat was actually recomputed. */
  recomputeCount(): number {
    return this.recomputes;
  }

  private compute(stat: StatId): number {
    let flat = 0;
    let percent = 0;
    let mult = 1;
    for (const m of this.mods) {
      if (m.stat !== stat) continue;
      if (m.kind === ModKind.Flat) flat += m.value;
      else if (m.kind === ModKind.Percent) percent += m.value;
      else mult *= m.value;
    }
    let result = (this.base[stat] + flat) * (1 + percent) * mult;
    const lim = this.limits[stat];
    if (result < lim.minValue) result = lim.minValue;
    if (result > lim.maxValue) result = lim.maxValue;
    return result;
  }
}
