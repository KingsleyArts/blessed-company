import { describe, expect, it } from 'vitest';
import { fmtF } from './printf';

describe('fmtF matches C printf %.Nf', () => {
  it('rounds exact ties to even and everything else by the exact value', () => {
    expect(fmtF(0.25, 1)).toBe('0.2');
    expect(fmtF(0.35, 1)).toBe('0.3'); // 0.35 is below .35 in binary
    expect(fmtF(0.75, 1)).toBe('0.8');
    expect(fmtF(2.5, 0)).toBe('2');
    expect(fmtF(3.5, 0)).toBe('4');
    expect(fmtF(-2.5, 0)).toBe('-2');
    expect(fmtF(12.345, 2)).toBe('12.35'); // 12.345 is above the tie in binary? check via toFixed of the exact value
    expect(fmtF(-800, 0)).toBe('-800');
    expect(fmtF(1.125, 2)).toBe('1.12');
    expect(fmtF(110, 1)).toBe('110.0');
  });
});
