import { describe, expect, it } from 'vitest';
import { barVisible, kMaxPerUnit, kMergeWindow, pushFloat, type FloatEntry, type FloatKind } from './combatText';

const fmt = (a: number, k: FloatKind): string => `${k === 'heal' ? '+' : ''}${a.toFixed(1)}`;
const entry = (unit: number, kind: FloatKind, amount: number, age = 0): FloatEntry =>
  ({ unit, kind, amount, x: 0, y: 0, text: fmt(amount, kind), color: 0, age, jitter: 0, size: 1, dx: 0 });

describe('pushFloat', () => {
  it('adds hits on the same unit inside the window into one number', () => {
    const list: FloatEntry[] = [];
    pushFloat(list, entry(1, 'damage', 2), true, fmt);
    pushFloat(list, entry(1, 'damage', 3), true, fmt);
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('5.0');
  });

  it('starts a new number after the window, for another unit, another kind, or a crit', () => {
    const list: FloatEntry[] = [entry(1, 'damage', 2, kMergeWindow + 0.01)];
    pushFloat(list, entry(1, 'damage', 1), true, fmt);
    pushFloat(list, entry(2, 'damage', 1), true, fmt);
    pushFloat(list, entry(1, 'heal', 1), true, fmt);
    pushFloat(list, entry(1, 'crit', 9), true, fmt);
    pushFloat(list, entry(1, 'crit', 9), true, fmt);
    expect(list.filter((e) => e.unit === 1)).toHaveLength(kMaxPerUnit);
    expect(list.filter((e) => e.unit === 2)).toHaveLength(1);
  });

  it('keeps every hit separate when merging is off', () => {
    const list: FloatEntry[] = [];
    for (let i = 0; i < 5; ++i) pushFloat(list, entry(1, 'damage', 1), false, fmt);
    expect(list).toHaveLength(5);
  });

  it('drops the oldest numbers over the per-unit cap', () => {
    const list: FloatEntry[] = [];
    for (let i = 0; i < 5; ++i) pushFloat(list, entry(1, 'crit', i + 1), true, fmt);
    expect(list.map((e) => e.amount)).toEqual([3, 4, 5]);
  });
});

describe('barVisible', () => {
  it('never shows at full health', () => {
    expect(barVisible(true, 1, 0, false)).toBe(false);
    expect(barVisible(false, 1, 0, true)).toBe(false);
  });
  it('shows every hurt unit when fewer bars is off', () => {
    expect(barVisible(true, 0.9, 99, false)).toBe(true);
    expect(barVisible(false, 0.9, 99, false)).toBe(true);
  });
  it('shows an enemy only for a few seconds after a hit, and a hero only when low', () => {
    expect(barVisible(true, 0.5, 1, true)).toBe(true);
    expect(barVisible(true, 0.5, 10, true)).toBe(false);
    expect(barVisible(false, 0.6, 0, true)).toBe(false);
    expect(barVisible(false, 0.2, 0, true)).toBe(true);
  });
});
