// The Expedition Report as kept between sessions (director Nov 22): the most recent run's report is saved with the slot until the next
// run ends and replaces it. Plain JSON; parseReport rejects anything that is not the expected shape.
import type { DamageReport, RoomDamage } from './runStats';
import type { ResultLine } from './uiText';

export interface ExpeditionReport {
  victory: boolean;
  lines: ResultLine[];
  damage: DamageReport;
  rooms: RoomDamage[];
}

export const serializeReport = (r: ExpeditionReport): string => JSON.stringify(r);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const rec = (v: unknown): Record<string, unknown> | undefined => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined);

/** The saved report, or undefined when the text is missing or damaged (the report is then simply gone, never a crash). */
export function parseReport(text: string | undefined): ExpeditionReport | undefined {
  if (!text) return undefined;
  try {
    const o = rec(JSON.parse(text));
    const dmg = rec(o?.damage);
    if (!o || !dmg || typeof o.victory !== 'boolean' || !isArr(o.lines) || !isNum(dmg.total) || !isArr(dmg.heroes) || !isArr(o.rooms)) return undefined;
    const lines = o.lines.map((l) => rec(l)).filter((l): l is Record<string, unknown> => !!l && isStr(l.label) && isStr(l.value))
      .map((l) => ({ label: l.label as string, value: l.value as string, wide: l.wide === true }));
    const heroes = dmg.heroes.map((h) => rec(h)).filter((h): h is Record<string, unknown> => !!h && isStr(h.hero) && isNum(h.total) && isNum(h.pct) && isArr(h.sources))
      .map((h) => ({
        hero: h.hero as string, total: h.total as number, pct: h.pct as number,
        sources: (h.sources as unknown[]).map((s) => rec(s)).filter((s): s is Record<string, unknown> => !!s && isStr(s.label) && isNum(s.amount) && isNum(s.pct))
          .map((s) => ({ label: s.label as string, amount: s.amount as number, pct: s.pct as number })),
      }));
    const rooms = o.rooms.map((r) => rec(r)).filter((r): r is Record<string, unknown> => !!r && isStr(r.key) && isStr(r.label) && isNum(r.total) && isArr(r.heroes))
      .map((r) => ({
        key: r.key as string, label: r.label as string, total: r.total as number,
        heroes: (r.heroes as unknown[]).map((h) => rec(h)).filter((h): h is Record<string, unknown> => !!h && isStr(h.hero) && isNum(h.taken) && isNum(h.pctOfRoom) && isArr(h.enemies))
          .map((h) => ({
            hero: h.hero as string, taken: h.taken as number, pctOfRoom: h.pctOfRoom as number,
            enemies: (h.enemies as unknown[]).map((e) => rec(e)).filter((e): e is Record<string, unknown> => !!e && isStr(e.enemy) && isNum(e.amount) && isNum(e.pct))
              .map((e) => ({ enemy: e.enemy as string, amount: e.amount as number, pct: e.pct as number })),
          })),
      }));
    return { victory: o.victory, lines, damage: { total: dmg.total, heroes }, rooms };
  } catch {
    return undefined;
  }
}
