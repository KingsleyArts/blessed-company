// EventBus port (EventBus.h). Typed events, listeners in subscription order. Raise() from inside a listener is QUEUED and
// delivered after the current event has reached all of its listeners (no re-entrancy). Payloads are copied at raise time.

export type UnitId = number;
export const kNoUnit: UnitId = -1;

export const DamageTag = {
  None: 0,
  Auto: 1 << 0,
  Ability: 1 << 1,
  Summon: 1 << 2,
  Thorns: 1 << 3,
  Smite: 1 << 4,
} as const;

export interface FightStarted { fightIndex: number }
export interface FightEnded { fightIndex: number; partyWon: boolean }
export interface AttackStarted { attacker: UnitId; target: UnitId }
export interface DamageDealt { source: UnitId; target: UnitId; amount: number; crit: boolean; tags: number }
export interface DamageTaken { target: UnitId; source: UnitId; amount: number; crit: boolean; tags: number }
export interface HealApplied { source: UnitId; target: UnitId; effectiveAmount: number }
export interface AbilityCast { caster: UnitId; abilityId: string }
export interface UnitDied { unit: UnitId; killer: UnitId; wasEnemy: boolean }
export interface EnemyKilled { enemy: UnitId; killer: UnitId }
export interface EnrageTick { step: number; damageBonus: number }

export interface EventMap {
  FightStarted: FightStarted;
  FightEnded: FightEnded;
  AttackStarted: AttackStarted;
  DamageDealt: DamageDealt;
  DamageTaken: DamageTaken;
  HealApplied: HealApplied;
  AbilityCast: AbilityCast;
  UnitDied: UnitDied;
  EnemyKilled: EnemyKilled;
  EnrageTick: EnrageTick;
}
export type EventName = keyof EventMap;

/** Defaults matching the C++ payload structs, so tests and callers can write `{...defaults.DamageDealt, amount: 7}`. */
export const eventDefaults: { [K in EventName]: EventMap[K] } = {
  FightStarted: { fightIndex: 0 },
  FightEnded: { fightIndex: 0, partyWon: false },
  AttackStarted: { attacker: kNoUnit, target: kNoUnit },
  DamageDealt: { source: kNoUnit, target: kNoUnit, amount: 0, crit: false, tags: DamageTag.None },
  DamageTaken: { target: kNoUnit, source: kNoUnit, amount: 0, crit: false, tags: DamageTag.None },
  HealApplied: { source: kNoUnit, target: kNoUnit, effectiveAmount: 0 },
  AbilityCast: { caster: kNoUnit, abilityId: '' },
  UnitDied: { unit: kNoUnit, killer: kNoUnit, wasEnemy: false },
  EnemyKilled: { enemy: kNoUnit, killer: kNoUnit },
  EnrageTick: { step: 0, damageBonus: 0 },
};

export type ListenerHandle = number;

interface Entry {
  handle: ListenerHandle;
  fn: (ev: never) => void;
  active: boolean;
}

export class EventBus {
  private lists = new Map<EventName, Entry[]>();
  private queue: (() => void)[] = [];
  private delivering = false;
  private needsCompact = false;
  private nextHandle = 1;

  private listFor(type: EventName): Entry[] {
    let l = this.lists.get(type);
    if (!l) this.lists.set(type, (l = []));
    return l;
  }

  subscribe<K extends EventName>(type: K, fn: (ev: Readonly<EventMap[K]>) => void): ListenerHandle {
    const handle = this.nextHandle++;
    this.listFor(type).push({ handle, fn: fn as (ev: never) => void, active: true });
    return handle;
  }

  /** Deactivates a listener. Safe to call from inside a listener. */
  unsubscribe(type: EventName, handle: ListenerHandle): boolean {
    for (const e of this.listFor(type)) {
      if (e.handle === handle && e.active) {
        e.active = false;
        this.needsCompact = true;
        if (!this.delivering) this.compact();
        return true;
      }
    }
    return false;
  }

  raise<K extends EventName>(type: K, ev: EventMap[K]): void {
    const copy = { ...ev };
    this.queue.push(() => this.deliver(type, copy));
    if (this.delivering) return; // the outer raise loop picks it up
    this.delivering = true;
    try {
      while (this.queue.length) this.queue.shift()!();
    } finally {
      this.delivering = false;
    }
    if (this.needsCompact) this.compact();
  }

  isDelivering(): boolean {
    return this.delivering;
  }
  pendingCount(): number {
    return this.queue.length;
  }

  private deliver<K extends EventName>(type: K, ev: EventMap[K]): void {
    // Size snapshot: listeners added during delivery wait for the next event.
    const list = this.listFor(type);
    const count = list.length;
    for (let i = 0; i < count; i++) {
      const cur = this.listFor(type);
      if (i >= cur.length || !cur[i].active) continue;
      (cur[i].fn as (e: EventMap[K]) => void)(ev);
    }
  }

  private compact(): void {
    for (const [k, l] of this.lists) this.lists.set(k, l.filter((e) => e.active));
    this.needsCompact = false;
  }
}
