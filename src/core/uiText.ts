// Text helpers of the HUD and the Temple (UI/TolEssenceLayout.h, TolTempleLayout.h, TolMapLayout.h, TolHudMath.h): pure, no Phaser,
// so the run layer can build the Temple labels and tests can pin the strings.
import { fmtF } from './printf';

const signed = (v: number, d: number): string => (v >= 0 ? '+' : '') + fmtF(v, d);

/** Whole number with thousands separators: 12500 -> "12,500". */
export function formatCount(v: number): string {
  const neg = v < 0;
  const digits = String(Math.trunc(Math.abs(v)));
  let out = '';
  for (let i = digits.length - 1, n = 0; i >= 0; --i) {
    out = digits[i] + out;
    if (++n % 3 === 0 && i > 0) out = ',' + out;
  }
  return neg ? '-' + out : out;
}

/** Bonus fraction as percent: 0.3 -> "+30%", 0.075 -> "+7.5%", 0 -> "0%". */
export function formatBonus(fraction: number): string {
  const pct = Math.round(fraction * 1000) / 10;
  if (Math.abs(pct) < 0.05) return '0%';
  if (Math.abs(pct - Math.round(pct)) < 0.05) return signed(pct, 0) + '%';
  return signed(pct, 1) + '%';
}

export function formatBonusChange(current: number, next: number, unit = ''): string {
  if (unit !== '') {
    if (!(next > current + 1e-9)) return formatRawBonus(current, unit);
    return `${formatRawBonus(current, unit)} -> ${formatRawBonus(next, unit)}`;
  }
  if (!(next > current + 1e-9)) return formatBonus(current);
  return `${formatBonus(current)} -> ${formatBonus(next)}`;
}

function trimZeros(num: string): string {
  if (!num.includes('.')) return num;
  num = num.replace(/0+$/, '');
  return num.endsWith('.') ? num.slice(0, -1) : num;
}

/** A bonus in its own unit: "+0.2%", "+1.5 HP/s", "0 HP/s". */
export function formatRawBonus(value: number, unit: string): string {
  const num = trimZeros(fmtF(Math.abs(value) < 0.005 ? 0 : value, 2));
  if (num === '0' || num === '-0') return '0' + unit;
  return (value > 0 ? '+' : '') + num + unit;
}

/** A unit's real stat value: whole numbers from 1000 up, one decimal from 100, two below. */
export function formatStatValue(v: number): string {
  if (v >= 1000) return formatCount(Math.round(v));
  return trimZeros(fmtF(v, v >= 100 ? 1 : 2));
}

export function formatValueChange(current: number, next: number): string {
  if (!(next > current + 1e-9)) return formatStatValue(current);
  return `${formatStatValue(current)} -> ${formatStatValue(next)}`;
}

/** "AttackSpeed" -> "Attack Speed"; "DefensePct" -> "Defense". */
export function statDisplayName(stat: string): string {
  if (stat === 'DefensePct') return 'Defense';
  let out = '';
  for (let i = 0; i < stat.length; ++i) {
    const c = stat[i];
    const up = c >= 'A' && c <= 'Z';
    const prevUp = i > 0 && stat[i - 1] >= 'A' && stat[i - 1] <= 'Z';
    if (i > 0 && up && !prevUp) out += ' ';
    out += c;
  }
  return out;
}

export const templeStatLabel = statDisplayName;

/** The Party Luck stats as the player sees them (the code's "essence" is Gold, its "gold" is Faith). */
export function templeLuckLabel(stat: string): string {
  switch (stat) {
    case 'EssencePerKill': return 'Essence per Kill';
    case 'EssencePerRoom': return 'Essence per Room';
    case 'GoldPerRoom': return 'Faith per Room';
    case 'GoldPerKill': return 'Faith per Kill';
    default: return stat;
  }
}

export function formatBuyButton(maxRank: boolean, cost: number, bought: number): string {
  if (maxRank) return 'MAX';
  const c = formatCount(cost);
  return bought > 1 ? `x${bought}  ${c}` : c;
}

/** Amount selector: mode 0..3 = x1, x10, x100, Max. */
export const amountValue = (mode: number): number => (mode === 0 ? 1 : mode === 1 ? 10 : mode === 2 ? 100 : -1);
export const amountLabel = (mode: number): string => (mode === 0 ? 'x1' : mode === 1 ? 'x10' : mode === 2 ? 'x100' : 'Max');

/** Title Case for the run-over card, keeping small words lower case unless first or after ':' / '('. */
export function titleCase(s: string): string {
  const small = new Set(['of', 'to', 'by', 'from', 'at', 'the', 'a', 'an', 'in', 'on', 'for', 'and', 'or']);
  let out = '';
  let i = 0;
  let first = true;
  while (i < s.length) {
    if (s[i] === ' ') { out += ' '; ++i; continue; }
    let j = i;
    while (j < s.length && s[j] !== ' ') ++j;
    const w = s.slice(i, j);
    const lead = w.startsWith('(') ? 1 : 0;
    let core = w.slice(lead);
    const lower = core.toLowerCase().replace(/[^a-z]+$/, '');
    const isSmall = small.has(lower);
    const forceCap = first || lead === 1 || (out.length >= 2 && out.endsWith(' ') && out[out.length - 2] === ':');
    if (core.length > 0 && /[A-Za-z]/.test(core[0]) && (!isSmall || forceCap)) core = core[0].toUpperCase() + core.slice(1);
    out += w.slice(0, lead) + core;
    first = false;
    i = j;
  }
  return out;
}

export interface ResultLine { label: string; value: string; wide: boolean }

/** The lines of the run-over card (FormatResultLines). */
export function formatResultLines(cause: string, killer: string, floorReached: number, roomsCleared: number, kills: number, essenceEarned: number,
  goldEarned: number, bestFloor = -1): ResultLine[] {
  const v: ResultLine[] = [];
  let c = cause === '' ? '-' : cause;
  if (killer !== '' && !c.includes(killer)) c += ` (killed by ${killer})`;
  v.push({ label: 'Cause of Death', value: '', wide: false });
  for (const raw of c.split(';')) {
    const part = raw.replace(/^ +/, '');
    if (part !== '') v.push({ label: '', value: titleCase(part), wide: true });
  }
  v.push({ label: 'Floor Reached', value: String(floorReached), wide: false });
  v.push({ label: 'Rooms Cleared', value: String(roomsCleared), wide: false });
  v.push({ label: 'Kills', value: formatCount(kills), wide: false });
  v.push({ label: 'Essence Earned', value: formatCount(essenceEarned), wide: false });
  v.push({ label: 'Faith Earned', value: formatCount(goldEarned), wide: false });
  if (bestFloor >= 0) v.push({ label: 'Best Floor', value: String(bestFloor), wide: false });
  return v;
}

/** Floating combat text: one decimal below 10, "+" for heals, "!" for crits; "" when it rounds to nothing. */
export function formatAmount(amount: number, heal: boolean, crit: boolean): string {
  if (!(amount >= 0.05)) return '';
  let s = amount < 9.95 ? fmtF(amount, 1) : fmtF(amount, 0);
  if (heal) s = '+' + s;
  if (crit) s += '!';
  return s;
}

/** Room label for the top bar (ETolRoomType order). */
export function roomLabel(type: number, rescueRoom: boolean, bossFloor: boolean): string {
  if (rescueRoom) return 'Priest rescue';
  switch (type) {
    case 0: return bossFloor ? 'Boss floor' : 'Combat room';
    case 1: return 'Elite room';
    case 2: return 'Treasure room';
    case 3: return 'Rest room';
    case 4: return 'Boss';
    case 5: return 'Exit';
    default: return 'Room';
  }
}
