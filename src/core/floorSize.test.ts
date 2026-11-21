import { describe, expect, it } from 'vitest';
import { defaultFloorSize, generate, makeConfig, normalizeFloorSize, withFloorSize } from './floorGenerator';
import { RunFlow } from './runFlow';
import { parseRunSave, serializeRunSave } from './runSave';

const small = { min: 3, max: 3, tutorialMin: 2, tutorialMax: 2 };
const layout = (f: RunFlow): string => f.getRun().floor.nodes.map((n) => `${n.id}:${n.type}:${n.hasCrystal}`).join(',');

describe('floor size setting', () => {
  it('keeps the shipped floors unless changed', () => {
    expect(defaultFloorSize()).toEqual({ min: 10, max: 20, tutorialMin: 5, tutorialMax: 8 });
    expect(generate(7, 3, withFloorSize(makeConfig(), defaultFloorSize()))).toEqual(generate(7, 3, makeConfig()));
  });

  it('clamps to whole numbers with each max at least its min', () => {
    expect(normalizeFloorSize({ min: 12.7, max: 4, tutorialMin: -3, tutorialMax: 99 })).toEqual({ min: 12, max: 12, tutorialMin: 1, tutorialMax: 40 });
  });

  it('a change mid-run leaves the current floor alone', () => {
    const f = new RunFlow();
    f.start(11, true);
    const before = layout(f);
    f.setFloorSize(small);
    expect(layout(f)).toBe(before);
    expect(f.checkpoint().floorSize).toEqual(defaultFloorSize());
  });

  it('a resume rebuilds the saved floor whatever the setting is now', () => {
    const a = new RunFlow();
    a.setFloorSize(small);
    a.start(11, true, 3);
    const text = serializeRunSave({ flow: a.checkpoint(), units: [], gauge: 0 });
    const b = new RunFlow();
    b.setFloorSize({ min: 25, max: 25, tutorialMin: 8, tutorialMax: 8 });
    expect(b.restore(parseRunSave(text)!.flow)).toBe(true);
    expect(layout(b)).toBe(layout(a));
    expect(b.checkpoint().floorSize).toEqual(small);
  });

  it('a save from before this setting loads at the old sizes', () => {
    const a = new RunFlow();
    a.start(11, true, 3);
    const raw = JSON.parse(serializeRunSave({ flow: a.checkpoint(), units: [], gauge: 0 })) as { flow: { floorSize?: unknown } };
    delete raw.flow.floorSize;
    const b = new RunFlow();
    b.setFloorSize(small);
    expect(b.restore(parseRunSave(JSON.stringify(raw))!.flow)).toBe(true);
    expect(layout(b)).toBe(layout(a));
  });

  it('rejects a damaged saved size', () => {
    const a = new RunFlow();
    a.start(11, true);
    const raw = JSON.parse(serializeRunSave({ flow: a.checkpoint(), units: [], gauge: 0 })) as { flow: { floorSize?: unknown } };
    raw.flow.floorSize = { min: 5, max: 2, tutorialMin: 1, tutorialMax: 1 };
    expect(parseRunSave(JSON.stringify(raw))).toBeUndefined();
  });
});
