import { describe, expect, it } from 'vitest';
import { bossRewardRolls, guaranteedLevel, kDefaultGearUpgrade as C, upgradeChance, upgradeLands } from './gearUpgrade';

describe('gear upgrade chance', () => {
  it('is guaranteed up to the floor range and falls past it', () => {
    expect(guaranteedLevel(3)).toBe(3);
    expect(upgradeChance(0, 1)).toBe(1);           // reaching level 1 on floor 1
    expect(upgradeChance(1, 1)).toBeCloseTo(0.6);   // reaching level 2 on floor 1
    expect(upgradeChance(2, 1)).toBeCloseTo(0.36);
    expect(upgradeChance(2, 3)).toBe(1);
  });
  it('recovers on deeper floors and never reaches zero', () => {
    expect(upgradeChance(5, 2)).toBeLessThan(upgradeChance(5, 5));
    expect(upgradeChance(5, 6)).toBe(1);
    expect(upgradeChance(99, 1)).toBe(C.minChance);
  });
  it('rolls against the chance, per member for the boss reward', () => {
    expect(upgradeLands(1, 1, 0.59)).toBe(true);
    expect(upgradeLands(1, 1, 0.6)).toBe(false);
    expect(bossRewardRolls([0, 10, 10], 10, [0.99, 0.99, 0.0])).toEqual([true, false, true]);
  });
});
