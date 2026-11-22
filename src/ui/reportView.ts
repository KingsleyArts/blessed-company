// The Expedition Report's damage sections (director Nov 22): who dealt how much and with what, and (debug builds only) who took how much,
// room by room, and from which enemies.
import type { DamageReport, RoomDamage } from '../core/runStats';

const fmt = (n: number): string => Math.round(n).toLocaleString('en-US');
const fmtPct = (p: number): string => `${p.toFixed(1)}%`;
const heroLabel = (n: string): string => (n === 'Priest' ? 'Priestess' : n);

function node(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function row(cls: string, name: string, amount: string, share: string): HTMLElement {
  const r = node('div', `rp-row ${cls}`);
  r.appendChild(node('span', 'rp-n', name));
  r.appendChild(node('span', 'rp-a', amount));
  r.appendChild(node('span', 'rp-p', share));
  return r;
}

/** Damage dealt: each hero with their total and share of the party's damage, then their sources with totals and their own percentages. */
export function damageDealtSection(d: DamageReport): HTMLElement {
  const box = node('div', 'rp-box');
  box.appendChild(node('h3', 'tp-sub', 'Damage dealt'));
  if (d.heroes.length === 0 || d.total <= 0) {
    box.appendChild(node('p', 'tp-empty', 'No damage was dealt.'));
    return box;
  }
  box.appendChild(row('head', 'Party total', fmt(d.total), '100%'));
  for (const h of d.heroes) {
    box.appendChild(row('hero', heroLabel(h.hero), fmt(h.total), fmtPct(h.pct)));
    for (const s of h.sources) box.appendChild(row('sub', s.label, fmt(s.amount), fmtPct(s.pct)));
  }
  return box;
}

/** Debug: per room, each hero's damage taken and share of the room's total, then the enemies that hit them with their own percentages. */
export function damageTakenSection(rooms: RoomDamage[]): HTMLElement {
  const box = node('div', 'rp-box');
  box.appendChild(node('h3', 'tp-sub', 'Damage taken by room (debug)'));
  if (rooms.length === 0) {
    box.appendChild(node('p', 'tp-empty', 'No damage was taken.'));
    return box;
  }
  for (const r of rooms) {
    box.appendChild(row('head room', r.label, fmt(r.total), '100%'));
    for (const h of r.heroes) {
      box.appendChild(row('hero', heroLabel(h.hero), fmt(h.taken), fmtPct(h.pctOfRoom)));
      for (const e of h.enemies) box.appendChild(row('sub', e.enemy, fmt(e.amount), fmtPct(e.pct)));
    }
  }
  return box;
}

/** The report body below the summary lines: the damage-dealt section, and in debug builds a second tab for damage taken. */
export function reportDamageBody(d: DamageReport, rooms: RoomDamage[], debug: boolean): HTMLElement {
  const wrap = node('div', 'rp');
  const dealt = damageDealtSection(d);
  if (!debug) {
    wrap.appendChild(dealt);
    return wrap;
  }
  const taken = damageTakenSection(rooms);
  taken.style.display = 'none';
  const bar = node('div', 'rp-tabs');
  const mk = (label: string, show: HTMLElement, hide: HTMLElement, on: boolean): HTMLButtonElement => {
    const b = node('button', `rp-tab${on ? ' on' : ''}`, label) as HTMLButtonElement;
    b.type = 'button';
    b.onclick = () => {
      show.style.display = '';
      hide.style.display = 'none';
      for (const o of Array.from(bar.children)) o.classList.toggle('on', o === b);
    };
    return b;
  };
  bar.appendChild(mk('Damage dealt', dealt, taken, true));
  bar.appendChild(mk('Damage taken (debug)', taken, dealt, false));
  wrap.append(bar, dealt, taken);
  return wrap;
}

export const kReportCss = `
.rp { margin-top: 10px; max-width: 40em; }
.rp-tabs { display: flex; gap: 8px; margin-bottom: 6px; }
.rp-tab { font: inherit; font-size: clamp(12px, 2.2vh, 18px); padding: 3px 12px; color: #d6cbbd; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; cursor: pointer; }
.rp-tab.on { color: #fbf3df; background: rgba(255,214,120,0.2); border-color: #d9c9a6; }
.rp-row { display: flex; gap: 14px; font-size: clamp(12px, 2.3vh, 19px); padding: 2px 0; color: #d6cbbd; }
.rp-row .rp-n { flex: 1; } .rp-row .rp-a { width: 5em; text-align: right; } .rp-row .rp-p { width: 4.5em; text-align: right; }
.rp-row.head { color: #fbf3df; border-bottom: 1px solid rgba(255,255,255,0.2); margin-top: 6px; }
.rp-row.hero { color: #fbf3df; margin-top: 5px; }
.rp-row.sub { padding-left: 18px; font-size: clamp(11px, 2.0vh, 17px); }
.rp-row.room { color: #d9c9a6; }
`;
