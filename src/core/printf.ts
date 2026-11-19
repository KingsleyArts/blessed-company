// printf("%.Nf") as the C runtime does it: the exact binary value rounded, exact decimal ties to even. JS toFixed rounds
// exact ties away from zero (0.25 -> "0.3", printf gives "0.2"), which would break log parity with the C++ build.
export function fmtF(x: number, digits: number): string {
  if (!Number.isFinite(x)) return String(x);
  const plain = x.toFixed(digits);
  const exact = Math.abs(x).toFixed(Math.min(100, digits + 60)); // exact expansion of the double far past the cut
  const cut = exact.indexOf('.') + 1 + digits - (digits === 0 ? 1 : 0);
  const tail = digits === 0 ? exact.slice(exact.indexOf('.') + 1) : exact.slice(cut);
  if (!/^50*$/.test(tail)) return plain; // not an exact tie: toFixed already matches
  // Exact tie: round half to even on the last kept digit.
  const kept = digits === 0 ? exact.slice(0, exact.indexOf('.')) : exact.slice(0, cut);
  const lastDigit = Number(kept.replace('.', '').slice(-1));
  const down = kept.endsWith('.') ? kept.slice(0, -1) : kept;
  const result = lastDigit % 2 === 0 ? down : Math.abs(x).toFixed(digits); // odd: toFixed rounds up, which is "to even"
  return (x < 0 || Object.is(x, -0) ? '-' : '') + result;
}

/** %-Ns (left-justified, space padded) and %Ns. */
export const padL = (s: string, w: number): string => s.padEnd(w);
export const padR = (s: string, w: number): string => s.padStart(w);
