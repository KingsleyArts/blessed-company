// Small C standard library look-alikes the run layer needs (strtod, strtoll, lround, isspace trim). Pure: no Phaser imports.

/** std::lround / llround: half away from zero. */
export const lround = (v: number): number => (v < 0 ? -Math.round(-v) : Math.round(v));

const SPACE = ' \t\n\v\f\r';
export const isSpace = (c: string): boolean => c.length === 1 && SPACE.includes(c);

/** Trim with C isspace. */
export function cTrim(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isSpace(s[a])) ++a;
  while (b > a && isSpace(s[b - 1])) --b;
  return s.slice(a, b);
}

const STRTOD = /^[ \t\n\v\f\r]*([+-]?(?:(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|inf(?:inity)?|nan))/i;

/** strtod: the value of the longest numeric prefix and how many characters it used; undefined when nothing parses. */
export function strtod(s: string): { value: number; end: number } | undefined {
  const m = STRTOD.exec(s);
  if (!m) return undefined;
  const t = m[1].toLowerCase();
  const neg = t.startsWith('-');
  const body = t.replace(/^[+-]/, '');
  let value: number;
  if (body.startsWith('inf')) value = neg ? -Infinity : Infinity;
  else if (body === 'nan') value = NaN;
  else value = Number(t);
  return { value, end: m[0].length };
}

/** strtoll(s, &end, 10) accepted only when it consumes the whole string (MetaSave's ParseLong). */
export function parseLongStrict(s: string): number | undefined {
  if (s === '') return undefined;
  const m = /^[ \t\n\v\f\r]*([+-]?\d+)$/.exec(s);
  if (!m) return undefined;
  const v = Number(m[1]);
  // strtoll saturates at the long long range; Number keeps the sign and magnitude well past every cap the callers use.
  return v;
}
