import { describe, expect, it } from 'vitest';
import { Rect, computeEssenceLayout, kVisibleEssenceRows } from './hudLayout';

const panel = new Rect(1000, 400, 300, 500);

describe('Essence menu layout', () => {
  it('RowsKeepOneSizeWhateverTheStatCount', () => {
    const heights = [1, 3, 4, 5, 9].map((n) => computeEssenceLayout(panel, n, 1).rows[0].row.h);
    for (const h of heights) expect(h).toBeCloseTo(heights[0], 9);
    expect(computeEssenceLayout(panel, 9, 1).rows).toHaveLength(kVisibleEssenceRows);
    expect(computeEssenceLayout(panel, 2, 1).rows).toHaveLength(2);
  });
  it('ScrollsToTheLastRowsAndClamps', () => {
    const top = computeEssenceLayout(panel, 9, 1, 0);
    const end = computeEssenceLayout(panel, 9, 1, 99);
    expect(top.first).toBe(0);
    expect(end.first).toBe(9 - kVisibleEssenceRows);
    expect(end.maxFirst).toBe(9 - kVisibleEssenceRows);
    expect(end.thumb.bottom()).toBeCloseTo(end.track.bottom(), 6);
    expect(top.thumb.y).toBeCloseTo(top.track.y, 6);
  });
  it('NothingScrollsWhenEverythingFits', () => {
    const l = computeEssenceLayout(panel, 4, 1, 3);
    expect(l.maxFirst).toBe(0);
    expect(l.first).toBe(0);
    expect(l.thumb.h).toBeCloseTo(l.track.h, 6);
  });
  it('RowsStayInsideTheViewportAndLeaveTheAmountButtonsClear', () => {
    const l = computeEssenceLayout(panel, 12, 1, 5);
    for (const r of l.rows) { expect(r.row.y).toBeGreaterThanOrEqual(l.viewport.y - 1e-9); expect(r.row.bottom()).toBeLessThanOrEqual(l.viewport.bottom() + 1e-9); }
    expect(l.viewport.bottom()).toBeLessThanOrEqual(l.amount[0].y);
  });
});
