// CombatSupport.h port: the combat log ring buffer. (CombatRng lives in rng.ts.)
import { kNoUnit, type UnitId } from './eventBus';

export enum LogKind { FightStart, FightEnd, Spawn, Attack, Damage, Heal, Ability, Death, Kill, Enrage, Note }

export interface LogEntry {
  tick: number;
  time: number;
  kind: LogKind;
  source: UnitId;
  target: UnitId;
  amount: number;
  text: string;
}

export function logEntry(p: Partial<LogEntry> = {}): LogEntry {
  return { tick: 0, time: 0, kind: LogKind.Note, source: kNoUnit, target: kNoUnit, amount: 0, text: '', ...p };
}

/** Every event is appended to a ring buffer; when full the oldest entry is dropped (totalAdded keeps counting). */
export class CombatLog {
  private capacity: number;
  private total = 0;
  private entries: LogEntry[] = [];
  constructor(capacity = 4096) {
    this.capacity = capacity === 0 ? 1 : capacity;
  }
  add(e: LogEntry): void {
    if (this.entries.length >= this.capacity) this.entries.shift();
    this.entries.push(e);
    this.total++;
  }
  getEntries(): readonly LogEntry[] {
    return this.entries;
  }
  getCapacity(): number {
    return this.capacity;
  }
  totalAdded(): number {
    return this.total;
  }
  clear(): void {
    this.entries = [];
    this.total = 0;
  }
  /** "[ 12.34s t00370] text" (matches the C++ "%6.2f" / "%05d" format). */
  static formatLine(e: LogEntry): string {
    return `[${e.time.toFixed(2).padStart(6)}s t${String(e.tick).padStart(5, '0')}] ${e.text}`;
  }
  toText(): string {
    return this.entries.map((e) => CombatLog.formatLine(e) + '\n').join('');
  }
}
