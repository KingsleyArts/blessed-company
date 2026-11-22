// Per-run combat statistics for the Expedition Report (director Nov 22): damage dealt by hero and by source, and damage taken by room, hero
// and enemy. Pure data fed from the combat bus; the run manager owns one and resets it with each new run.
import type { CombatSim } from './combatSim';
import type { CombatData } from './combatData';
import { DamageTag } from './eventBus';
import { skillOf } from './heroSheet';

export interface SourceShare { label: string; amount: number; pct: number }
export interface HeroDamage { hero: string; total: number; pct: number; sources: SourceShare[] }
export interface DamageReport { total: number; heroes: HeroDamage[] }

export interface EnemyShare { enemy: string; amount: number; pct: number }
export interface HeroTaken { hero: string; taken: number; pctOfRoom: number; enemies: EnemyShare[] }
export interface RoomDamage { key: string; label: string; total: number; heroes: HeroTaken[] }

/** Where the party is right now (the run manager reads it from the flow when damage lands). */
export interface RoomRef { floor: number; node: number; type: string }

const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
const bump = (m: Map<string, number>, k: string, v: number): void => { m.set(k, (m.get(k) ?? 0) + v); };
const sorted = (m: Map<string, number>): [string, number][] => [...m.entries()].sort((a, b) => b[1] - a[1]);

interface RoomAcc { label: string; taken: Map<string, Map<string, number>> }

export class RunStats {
  private dealt = new Map<string, Map<string, number>>();
  private rooms = new Map<string, RoomAcc>();
  private subscribed = new WeakSet<object>();

  reset(): void {
    this.dealt = new Map();
    this.rooms = new Map();
  }

  /** Makes sure a hero shows in the report even if it did nothing (a healer with no damage). */
  noteHero(name: string): void {
    if (!this.dealt.has(name)) this.dealt.set(name, new Map());
  }

  /** Listens to the sim's bus (once per sim). `room` says which room a hit belongs to. */
  attach(sim: CombatSim, data: CombatData, room: () => RoomRef): void {
    if (this.subscribed.has(sim)) return;
    this.subscribed.add(sim);
    const attackName = (cls: string): string => skillOf(data.findClassRow(cls)?.AutoActionId ?? '', 'attack').name || 'Attack';
    sim.getBus().subscribe('DamageDealt', (e) => {
      const src = sim.getUnit(e.source);
      if (!src || src.enemy || e.amount <= 0) return;
      let hero = src.name;
      let label: string;
      if (src.summon) {
        const owner = sim.getUnit(src.owner);
        if (!owner) return;
        hero = owner.name;
        label = src.name === 'GreaterSpirit' ? 'Greater Spirit' : (e.tags & DamageTag.Smite) !== 0 ? 'Spirit bolt' : 'Spirit';
      } else if (e.ability) label = skillOf(e.ability, 'ability').name;
      else if ((e.tags & DamageTag.Thorns) !== 0) label = 'Thorns';
      else label = attackName(hero);
      let m = this.dealt.get(hero);
      if (!m) this.dealt.set(hero, (m = new Map()));
      bump(m, label, e.amount);
    });
    sim.getBus().subscribe('DamageTaken', (e) => {
      const tgt = sim.getUnit(e.target);
      if (!tgt || tgt.enemy || tgt.summon || e.amount <= 0) return;
      const src = sim.getUnit(e.source);
      const r = room();
      const key = `${r.floor}:${r.node}`;
      let acc = this.rooms.get(key);
      if (!acc) this.rooms.set(key, (acc = { label: `Floor ${r.floor}, room ${r.node} (${r.type})`, taken: new Map() }));
      let m = acc.taken.get(tgt.name);
      if (!m) acc.taken.set(tgt.name, (m = new Map()));
      bump(m, src ? src.name : 'Other', e.amount);
    });
  }

  damageReport(): DamageReport {
    const heroes: HeroDamage[] = [];
    let total = 0;
    for (const m of this.dealt.values()) for (const v of m.values()) total += v;
    for (const [hero, m] of this.dealt) {
      let sum = 0;
      for (const v of m.values()) sum += v;
      heroes.push({ hero, total: sum, pct: pct(sum, total), sources: sorted(m).map(([label, amount]) => ({ label, amount, pct: pct(amount, sum) })) });
    }
    heroes.sort((a, b) => b.total - a.total);
    return { total, heroes };
  }

  roomReport(): RoomDamage[] {
    const out: RoomDamage[] = [];
    for (const [key, acc] of this.rooms) {
      const perHero = [...acc.taken].map(([hero, m]) => {
        let taken = 0;
        for (const v of m.values()) taken += v;
        return { hero, taken, m };
      });
      const total = perHero.reduce((a, h) => a + h.taken, 0);
      const heroes: HeroTaken[] = perHero
        .sort((a, b) => b.taken - a.taken)
        .map((h) => ({ hero: h.hero, taken: h.taken, pctOfRoom: pct(h.taken, total), enemies: sorted(h.m).map(([enemy, amount]) => ({ enemy, amount, pct: pct(amount, h.taken) })) }));
      out.push({ key, label: acc.label, total, heroes });
    }
    return out;
  }
}
