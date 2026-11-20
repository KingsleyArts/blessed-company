import { describe, expect, it } from 'vitest';
import { heroPose, kHeroMotion, newHeroFx, type HeroState } from './heroMotion';

const base: HeroState = { time: 0, alive: true, moving: false, casting: false, hpFraction: 1, won: false, faceRight: true };

describe('hero motion', () => {
  it('stands still apart from a small bob, untinted', () => {
    const p = heroPose({ ...base, time: 0.3 }, newHeroFx());
    expect(p.dx).toBe(0);
    expect(p.lift).toBeGreaterThanOrEqual(0);
    expect(p.lift).toBeLessThanOrEqual(kHeroMotion.bobUu);
    expect(p.tint).toBe(0xffffff);
    expect(p.flash).toBe(false);
  });

  it('lunges toward the target mid-strike and is back by the end', () => {
    const fx = { ...newHeroFx(), lunge: kHeroMotion.lungeSeconds / 2, lungeDir: -1 };
    expect(heroPose(base, fx).dx).toBeCloseTo(-kHeroMotion.lungeUu);
    expect(heroPose(base, { ...fx, lunge: kHeroMotion.lungeSeconds }).dx).toBeCloseTo(0);
  });

  it('flashes white and is pushed away when hit', () => {
    const p = heroPose(base, { ...newHeroFx(), flash: 0, knock: kHeroMotion.knockSeconds / 2, knockDir: -1 });
    expect(p.flash).toBe(true);
    expect(p.dx).toBeLessThan(0);
  });

  it('sags and pulses red when weak; glows while casting', () => {
    const weak = heroPose({ ...base, hpFraction: 0.1, time: 1 / 6 }, newHeroFx());
    expect(weak.scaleY).toBeLessThan(1);
    expect(weak.tint).not.toBe(0xffffff);
    expect((weak.tint >> 16) & 255).toBeGreaterThan(weak.tint & 255);
    const cast = heroPose({ ...base, casting: true }, newHeroFx());
    expect(cast.tint & 255).toBeLessThan((cast.tint >> 8) & 255);
  });

  it('lies down grey when knocked out, turning away from the enemies', () => {
    const p = heroPose({ ...base, alive: false }, { ...newHeroFx(), ko: 5 });
    expect(p.angle).toBe(-90);
    expect(p.tint).not.toBe(0xffffff);
    expect(heroPose({ ...base, alive: false }, { ...newHeroFx(), ko: 0 }).angle).toBeCloseTo(0);
  });

  it('hops higher when the fight is won than when walking', () => {
    const peakWin = Math.max(...[0.05, 0.15, 0.3].map((t) => heroPose({ ...base, won: true, time: t }, newHeroFx()).lift));
    expect(peakWin).toBeGreaterThan(kHeroMotion.hopUu);
  });
});
