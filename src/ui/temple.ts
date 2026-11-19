// The Temple home screen (director's mockup, Nov 19): a full-screen page over the temple background with the title, the currencies,
// a tab list on the left, one framed panel that scrolls (arrows show when there is more above or below), and Begin Expedition.
// Built with DOM calls only, never innerHTML with game text.
import type { TempleItem, TempleSnapshot } from '../core/runManager';
import { amountLabel, formatCount, type ResultLine } from '../core/uiText';

export type TempleTab = 'blessings' | 'equipment' | 'heroes' | 'report' | 'settings';

export interface TempleView {
  snapshot: TempleSnapshot;
  /** Essence carried by the current or last run (the top bar's Essence pill). */
  essence: number;
  amountMode: number;
  volume: number;
  /** The last run's result lines, if there was a run. */
  report: { victory: boolean; lines: ResultLine[] } | undefined;
  tab: TempleTab;
  resetArmed: boolean;
}

export interface TempleActions {
  buy: (id: string) => void;
  amount: (mode: number) => void;
  newRun: () => void;
  reset: () => void;
  volume: (v: number) => void;
  tab: (t: TempleTab) => void;
}

const kCss = `
.tp-root { position: fixed; inset: 0; z-index: 10; color: #f3ecdf; font-family: Georgia, "Times New Roman", serif;
  background: #160c26 center / cover no-repeat; display: grid; box-sizing: border-box; overflow: hidden;
  --clear: 28vw; --nav: clamp(112px, 12vw, 200px); --head: clamp(54px, 17vh, 170px); --foot: clamp(46px, 13vh, 120px);
  --gold: #e8c877; --gold-dim: rgba(232, 200, 119, 0.45);
  /* The first column is left empty so the priestess in the background stays in view (director, Nov 19). */
  grid-template-columns: calc(var(--clear) - max(10px, env(safe-area-inset-left)) - clamp(8px, 1.6vw, 26px)) var(--nav) minmax(0, 1fr);
  grid-template-rows: var(--head) minmax(0, 1fr) var(--foot);
  column-gap: clamp(8px, 1.6vw, 26px);
  padding: max(6px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(4px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); }
.tp-root::before { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(18, 8, 32, 0.6), rgba(18, 8, 32, 0) 38%),
    linear-gradient(180deg, rgba(18, 8, 32, 0.65), rgba(18, 8, 32, 0) 26%, rgba(18, 8, 32, 0) 72%, rgba(18, 8, 32, 0.55)); }
.tp-root > * { position: relative; }
.tp-root svg { display: block; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.tp-root button { font-family: inherit; touch-action: manipulation; -webkit-appearance: none; appearance: none; }

.tp-head { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; min-height: 0; }
.tp-brand { display: flex; align-items: flex-start; gap: clamp(6px, 1.2vw, 18px); min-width: 0; }
.tp-brand .ic { width: clamp(30px, 8vh, 84px); height: clamp(30px, 8vh, 84px); color: #f5dc9a; flex: 0 0 auto;
  filter: drop-shadow(0 0 6px rgba(255, 220, 140, 0.45)); }
.tp-brand h1 { margin: 0; font-size: clamp(26px, 7.4vh, 70px); font-weight: 700; font-style: italic; line-height: 1;
  color: #fbf3df; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6); }
.tp-brand p { margin: clamp(2px, 0.8vh, 8px) 0 0; font-size: clamp(11px, 2.3vh, 21px); color: #efe5d2; max-width: 28em; line-height: 1.2;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8); padding-bottom: clamp(3px, 1vh, 10px);
  border-bottom: 1px solid; border-image: linear-gradient(90deg, var(--gold-dim), var(--gold), rgba(232, 200, 119, 0)) 1; }
.tp-cur { display: flex; gap: clamp(6px, 1vw, 16px); flex: 0 0 auto; }
.tp-pill { display: flex; align-items: center; gap: 0.45em; font-size: clamp(13px, 2.7vh, 23px); padding: 0.22em 1.1em 0.22em 0.5em;
  background: linear-gradient(180deg, rgba(42, 24, 58, 0.92), rgba(22, 12, 34, 0.92)); border: 1px solid var(--gold);
  border-radius: 999px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45); white-space: nowrap; }
.tp-pill svg { width: 1.25em; height: 1.25em; }
.tp-pill.faith svg { color: #ffd36b; fill: #ffd36b; } .tp-pill.ess svg { color: #d9b8ff; fill: rgba(190, 150, 255, 0.55); }

.tp-nav { grid-column: 2; grid-row: 2 / 4; display: flex; flex-direction: column; gap: clamp(4px, 1.1vh, 12px); padding-top: clamp(14px, 4vh, 40px);
  min-height: 0; overflow: auto; scrollbar-width: none; }
.tp-nav::-webkit-scrollbar { display: none; }
.tp-tab { display: flex; align-items: center; gap: 0.55em; text-align: left; font-size: clamp(12px, 2.6vh, 21px); line-height: 1.1;
  color: #f3ecdf; padding: clamp(5px, 1.2vh, 12px) 0.7em; cursor: pointer;
  background: linear-gradient(90deg, rgba(44, 22, 64, 0.9), rgba(44, 22, 64, 0.45)); border: 1px solid var(--gold-dim);
  border-radius: 4px 999px 999px 4px; }
.tp-tab svg { width: 1.45em; height: 1.45em; flex: 0 0 auto; color: #e9dcc0; }
.tp-tab:hover { border-color: var(--gold); filter: brightness(1.15); }
.tp-tab.on { color: #2b1838; background: linear-gradient(180deg, #fbf1d8, #e7d2a6); border: 2px solid var(--gold);
  box-shadow: 0 0 12px rgba(255, 220, 150, 0.45); }
.tp-tab.on svg { color: #6b3f9a; }

.tp-panel { grid-column: 3; grid-row: 2; display: flex; flex-direction: column; min-height: 0; margin-top: clamp(16px, 4.6vh, 44px);
  background: rgba(30, 15, 46, 0.88); border: 2px solid #c9a55a; border-radius: 4px;
  box-shadow: inset 0 0 0 4px rgba(30, 15, 46, 0.9), inset 0 0 0 5px var(--gold-dim), 0 8px 30px rgba(0, 0, 0, 0.55); }
.tp-ptitle { position: absolute; top: 0; left: clamp(8px, 1.4vw, 22px); transform: translateY(-58%); display: flex; align-items: center;
  font-size: clamp(16px, 4.2vh, 38px); font-style: italic; color: #fbf3df; white-space: nowrap;
  padding: 0.12em 1.4em 0.12em 0.4em; background: linear-gradient(180deg, #33194c, #1d0e30); border: 1.5px solid var(--gold);
  clip-path: polygon(0 0, calc(100% - 0.9em) 0, 100% 50%, calc(100% - 0.9em) 100%, 0 100%); }
.tp-ptitle svg { width: 1.3em; height: 1.3em; margin-right: 0.35em; color: #ffd36b; fill: rgba(150, 80, 220, 0.7); }
/* flex: none: if the bar shrinks, the scroll list below overlaps its buttons and takes their taps (Nov 19). */
.tp-tools { display: flex; flex: none; justify-content: flex-end; gap: 6px; padding: clamp(6px, 1.4vh, 14px) clamp(8px, 1.2vw, 18px) 0; }
.tp-amt { -webkit-appearance: none; appearance: none; margin: 0; display: inline-flex; align-items: center; justify-content: center;
  min-width: 3.4em; height: 1.9em; line-height: 1; box-sizing: border-box; font-size: clamp(11px, 2.1vh, 18px); color: #f3ecdf;
  background: rgba(50, 28, 70, 0.9); border: 1px solid var(--gold-dim); border-radius: 3px; padding: 0 0.6em; cursor: pointer; }
.tp-amt.on { background: #6b4a14; border-color: var(--gold); }
.tp-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; scrollbar-width: none; overscroll-behavior: contain;
  padding: clamp(8px, 1.8vh, 18px) clamp(8px, 1.2vw, 18px) clamp(18px, 4vh, 40px); }
.tp-scroll::-webkit-scrollbar { display: none; }
/* Tabs with no amount bar: start the content below the title ribbon, which hangs into the panel. */
.tp-ptitle + .tp-scroll { padding-top: clamp(16px, 3.6vh, 36px); }
.tp-arrow { position: absolute; left: 50%; transform: translateX(-50%); width: clamp(26px, 5vh, 48px); height: clamp(20px, 4vh, 38px);
  padding: 2px 6px; border: 1px solid var(--gold-dim); border-radius: 999px; background: rgba(24, 11, 38, 0.92); color: var(--gold);
  cursor: pointer; display: none; z-index: 2; box-shadow: 0 0 8px rgba(0, 0, 0, 0.7); box-sizing: content-box; }
.tp-arrow svg { width: 100%; height: 100%; stroke-width: 2.4; }
.tp-arrow.show { display: block; }
.tp-arrow.up { top: clamp(4px, 1vh, 10px); } .tp-arrow.down { bottom: clamp(2px, 0.6vh, 8px); }
.tp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(190px, 17vw, 300px), 1fr)); gap: clamp(6px, 1.4vh, 14px) clamp(8px, 1.2vw, 18px); }
.tp-sub { grid-column: 1 / -1; margin: clamp(2px, 0.8vh, 8px) 0 0; font-size: clamp(11px, 2.1vh, 18px); color: #d9c9a6; letter-spacing: 0.04em;
  border-bottom: 1px solid var(--gold-dim); padding-bottom: 2px; }
/* Every card is the same size (director, Nov 19): one line of name, up to three lines of detail, the rest is empty space. */
.tp-card { box-sizing: border-box; height: 5.3em; font-size: clamp(13px, 2.3vh, 19px); display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: 1.25em minmax(0, 1fr); column-gap: 0.6em; row-gap: 0.15em; align-items: start; text-align: left; color: #f3ecdf;
  padding: 0.45em 0.7em 0.45em 0.45em; -webkit-appearance: none; appearance: none; margin: 0;
  background: linear-gradient(180deg, rgba(64, 44, 74, 0.92), rgba(38, 24, 50, 0.95)); border: 1px solid var(--gold-dim); border-radius: 4px;
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.3); cursor: default; overflow: hidden; }
.tp-card.buy { border-color: var(--gold); cursor: pointer; }
.tp-card.buy:hover { box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.3), 0 0 10px rgba(255, 215, 130, 0.45); filter: brightness(1.12); }
.tp-card .ic { grid-row: 1 / 3; align-self: center; width: 3.3em; height: 3.3em; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--gold); border-radius: 3px; color: #efe3b8; background: radial-gradient(circle at 50% 40%, #4a4a2e, #24221a 75%); }
.tp-card .ic svg { width: 68%; height: 68%; }
.tp-card .nm { grid-column: 2 / 4; font-size: 1em; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tp-card .side { grid-column: 3; grid-row: 2; align-self: stretch; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; }
.tp-card .lv { font-size: 0.85em; line-height: 1.2; color: #efe5d2; white-space: nowrap; }
.tp-card .ds { font-size: 0.8em; color: #d6cbbd; line-height: 1.2; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3;
  overflow: hidden; }
.tp-card .cost { display: flex; align-items: center; gap: 0.3em; font-size: 0.95em; color: #ffe7a8; white-space: nowrap; }
.tp-card .cost svg { width: 1.05em; height: 1.05em; color: #ffd36b; fill: #ffd36b; }
.tp-card:not(.buy) .cost { color: #a39a90; } .tp-card:not(.buy) .cost svg { color: #8d8478; fill: #8d8478; }
.tp-card.max .cost { color: #b9f0b0; }
.tp-card.hero.on { border-color: #9be39b; background: linear-gradient(180deg, rgba(48, 78, 52, 0.92), rgba(28, 48, 32, 0.95)); cursor: pointer; }
.tp-card.hero.owned { cursor: pointer; }
.tp-card.hero.locked { opacity: 0.75; }
.tp-rows { max-width: 34em; }
.tp-row { display: flex; justify-content: space-between; gap: 24px; font-size: clamp(13px, 2.4vh, 21px); padding: 3px 0; color: #d6cbbd;
  border-bottom: 1px solid rgba(232, 200, 119, 0.18); }
.tp-row .v { color: #fbf3df; } .tp-wide { font-size: clamp(12px, 2.2vh, 19px); color: #fbf3df; padding: 1px 0 4px 12px; }
.tp-result { font-size: clamp(18px, 4vh, 34px); font-style: italic; margin: 0 0 6px; } .tp-result.win { color: #b8f5b8; } .tp-result.lose { color: #ffb4a4; }
.tp-empty { font-size: clamp(13px, 2.5vh, 21px); color: #d6cbbd; }
.tp-set { display: flex; flex-direction: column; gap: clamp(10px, 2.4vh, 22px); font-size: clamp(13px, 2.5vh, 21px); }
.tp-set label { display: flex; align-items: center; gap: 12px; }
.tp-set input[type=range] { width: clamp(120px, 24vw, 320px); accent-color: #e8c877; }
.tp-danger { align-self: flex-start; font-size: clamp(12px, 2.3vh, 19px); color: #fbe9e4; background: #4f1414; border: 1px solid #e0907c;
  border-radius: 4px; padding: 0.4em 1em; cursor: pointer; }
.tp-danger.armed { background: #9a1a1a; border-color: #ffc0b0; }

.tp-foot { grid-column: 3; grid-row: 3; display: flex; justify-content: flex-end; align-items: center; min-height: 0; }
.tp-go { display: flex; align-items: center; gap: 0.45em; font-size: clamp(16px, 4.4vh, 40px); color: #2a1608; cursor: pointer;
  padding: 0.25em 1.6em; border: 2px solid #fbe3a0; background: linear-gradient(180deg, #fff4cc, #ecc672 55%, #b98a35);
  clip-path: polygon(0.7em 0, calc(100% - 0.7em) 0, 100% 50%, calc(100% - 0.7em) 100%, 0.7em 100%, 0 50%);
  filter: drop-shadow(0 0 10px rgba(255, 210, 120, 0.5)); }
.tp-go:hover { filter: drop-shadow(0 0 16px rgba(255, 220, 140, 0.8)) brightness(1.06); }
.tp-go svg { width: 1.1em; height: 1.1em; color: #5a2f8a; stroke-width: 2.2; }
.tp-go .chev { font-size: 1.1em; line-height: 1; }
@media (max-height: 480px) { .tp-brand p { max-width: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } }
@media (max-width: 640px) { .tp-cur { flex-direction: column; align-items: flex-end; gap: 4px; } }
`;

// 24x24 line icons.
const kIcon: Record<string, string> = {
  temple: 'M12 1.5v3M10.5 3h3M5 10l7-5.5L19 10M4 10h16v2H4zM6.5 12v7M10 12v7M14 12v7M17.5 12v7M3 19h18v3H3z',
  blessing: 'M12 2l2.4 6.6L21 7l-4.6 5L21 17l-6.6-1.6L12 22l-2.4-6.6L3 17l4.6-5L3 7l6.6 1.6z',
  report: 'M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4',
  heroes: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 11a2.5 2.5 0 100-5.5M17.5 14c2.2.6 3.5 3 3.5 6',
  equipment: 'M3 10h18v10H3zM3 10l2.5-5h13L21 10M10 13h4v3h-4z',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  faith: 'M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z',
  essence: 'M12 2l6 7-6 13-6-13zM6 9h12M9.5 9L12 22l2.5-13',
  sword: 'M14.5 3H21v6.5L10 20.5 6.5 17 17.5 6M5 15l4 4M3 21l3-3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.5-7 10-7 10zM12 9v6M9 12h6',
  burst: 'M12 2l1.6 6.2L19 5l-3.2 5.4L22 12l-6.2 1.6L19 19l-5.4-3.2L12 22l-1.6-6.2L5 19l3.2-5.4L2 12l6.2-1.6L5 5l5.4 3.2z',
  speed: 'M3 16c4-1 8-4 10-10M7 19c4-1.5 9-5 12-12M13 20c3-1.5 6-4 8-8',
  flame: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5-5 8 0 4 3 7 7 7z',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 017 0V11M12 15v2',
  crystal: 'M12 2l5 6-5 14-5-14zM7 8h10M12 2v20',
  chest: 'M3 10h18v10H3zM3 10l2.5-5h13L21 10M10 13h4v3h-4z',
  hero: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
  down: 'M6 5l6 6 6-6M6 12l6 6 6-6',
  up: 'M6 19l6-6 6 6M6 12l6-6 6 6',
  swords: 'M4 4l11 11M15 15l-2 3 4 4 2-2-3-3M20 4L9 15M9 15l2 3-4 4-2-2 3-3',
};

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', kIcon[name] ?? kIcon.blessing);
  svg.appendChild(p);
  return svg;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function btn(cls: string, onClick: () => void, ...kids: (Node | string)[]): HTMLButtonElement {
  const b = el('button', cls);
  b.type = 'button';
  b.append(...kids);
  b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  return b;
}

let styled = false;
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = kCss;
  document.head.appendChild(s);
}

const kTabs: { id: TempleTab; label: string; icon: string; title: string }[] = [
  { id: 'blessings', label: 'Temple Blessings', icon: 'blessing', title: 'Temple Blessings' },
  { id: 'report', label: 'Expedition Report', icon: 'report', title: 'Expedition Report' },
  { id: 'heroes', label: 'Heroes', icon: 'heroes', title: 'Heroes' },
  { id: 'equipment', label: 'Equipment', icon: 'equipment', title: 'Equipment' },
  { id: 'settings', label: 'Settings', icon: 'settings', title: 'Settings' },
];

function itemIcon(it: TempleItem): string {
  const l = it.label.toLowerCase();
  if (it.id.startsWith('Stat:')) return 'lock';
  if (l.includes('weapon')) return 'sword';
  if (l.includes('armor') || l.includes('defense')) return 'shield';
  if (l.includes('health') || l.includes('heal')) return 'heart';
  if (l.includes('attack speed') || l.includes('speed')) return 'speed';
  if (l.includes('threat')) return 'flame';
  if (l.includes('damage') || l.includes('crit')) return 'burst';
  if (l.includes('essence')) return 'crystal';
  if (l.includes('faith')) return 'faith';
  if (l.includes('spirit')) return 'blessing';
  return 'chest';
}

function itemCard(it: TempleItem, buy: (id: string) => void): HTMLButtonElement {
  const unlock = it.maxLevel <= 1;
  const b = el('button', `tp-card${it.canBuy ? ' buy' : ''}${it.maxed ? ' max' : ''}${unlock ? ' unlock' : ''}`);
  b.type = 'button';
  const ic = el('span', 'ic');
  ic.appendChild(icon(itemIcon(it)));
  const cost = el('span', 'cost');
  if (it.maxed) cost.textContent = unlock ? 'Owned' : 'MAX';
  else cost.append(icon('faith'), formatCount(it.cost));
  b.title = `${it.label}: ${it.detail}`;   // the full text when the card cuts it short
  const side = el('span', 'side');
  side.append(el('span', 'lv', unlock ? '' : `Lv ${it.level}/${it.maxLevel}`), cost);
  b.append(ic, el('span', 'nm', it.label), el('span', 'ds', it.detail), side);
  if (it.canBuy) b.addEventListener('click', (ev) => { ev.stopPropagation(); buy(it.id); });
  else b.disabled = true;
  return b;
}

export interface BuiltTemple {
  root: HTMLElement;
  scroller: HTMLElement;
  /** Shows or hides the up and down arrows for the scroll position. */
  refreshArrows: () => void;
}

/** Builds the whole Temple page. `bg` is the background image URL. */
export function buildTemple(v: TempleView, a: TempleActions, bg: string): BuiltTemple {
  ensureStyle();
  const root = el('div', 'tp-root');
  root.style.backgroundImage = `url("${bg}")`;

  // Title and currencies.
  const head = el('div', 'tp-head');
  const brand = el('div', 'tp-brand');
  const bic = el('span', 'ic');
  bic.appendChild(icon('temple'));
  const words = el('div');
  words.append(el('h1', '', 'Temple'), el('p', '', 'Prepare your next expedition with blessings and permanent upgrades.'));
  brand.append(bic, words);
  const cur = el('div', 'tp-cur');
  const faith = el('div', 'tp-pill faith');
  faith.append(icon('faith'), `Faith ${formatCount(v.snapshot.essence)}`);
  const ess = el('div', 'tp-pill ess');
  ess.append(icon('essence'), `Essence ${formatCount(v.essence)}`);
  cur.append(faith, ess);
  head.append(brand, cur);

  // Tabs.
  const nav = el('nav', 'tp-nav');
  for (const t of kTabs) nav.appendChild(btn(`tp-tab${t.id === v.tab ? ' on' : ''}`, () => a.tab(t.id), icon(t.icon), t.label));

  // The framed panel.
  const panel = el('section', 'tp-panel');
  const title = el('div', 'tp-ptitle');
  title.append(icon('blessing'), kTabs.find((t) => t.id === v.tab)?.title ?? '');
  panel.appendChild(title);
  if (v.tab === 'blessings' || v.tab === 'equipment') {
    const tools = el('div', 'tp-tools');
    for (let i = 0; i < 4; ++i) tools.appendChild(btn(`tp-amt${i === v.amountMode ? ' on' : ''}`, () => a.amount(i), amountLabel(i)));
    panel.appendChild(tools);
  }
  const scroller = el('div', 'tp-scroll');
  scroller.appendChild(tabBody(v, a));
  panel.appendChild(scroller);
  const up = btn('tp-arrow up', () => scroller.scrollBy({ top: -scroller.clientHeight * 0.8, behavior: 'smooth' }), icon('up'));
  const down = btn('tp-arrow down', () => scroller.scrollBy({ top: scroller.clientHeight * 0.8, behavior: 'smooth' }), icon('down'));
  up.setAttribute('aria-label', 'Scroll up');
  down.setAttribute('aria-label', 'Scroll down');
  panel.append(up, down);
  const refreshArrows = (): void => {
    const top = scroller.scrollTop;
    const more = scroller.scrollHeight - scroller.clientHeight - top;
    up.classList.toggle('show', top > 2);
    down.classList.toggle('show', more > 2);
  };
  scroller.addEventListener('scroll', refreshArrows, { passive: true });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(refreshArrows).observe(scroller);

  // Begin Expedition.
  const foot = el('div', 'tp-foot');
  const chev = el('span', 'chev', '»');
  foot.appendChild(btn('tp-go', a.newRun, icon('swords'), 'Begin Expedition', chev));

  root.append(head, nav, panel, foot);
  return { root, scroller, refreshArrows };
}

function tabBody(v: TempleView, a: TempleActions): HTMLElement {
  const t = v.snapshot;
  if (v.tab === 'blessings' || v.tab === 'equipment') {
    const grid = el('div', 'tp-grid');
    if (v.tab === 'equipment') {
      for (const it of t.items.filter((i) => i.column === 0)) grid.appendChild(itemCard(it, a.buy));
      return grid;
    }
    // Stats (unlock, then upgrade) and Party Luck, the mockup's middle and right columns.
    grid.appendChild(el('h3', 'tp-sub', 'Stats: unlock, then upgrade'));
    for (const it of t.items.filter((i) => i.column === 1)) grid.appendChild(itemCard(it, a.buy));
    grid.appendChild(el('h3', 'tp-sub', 'Party Luck'));
    for (const it of t.items.filter((i) => i.column === 2)) grid.appendChild(itemCard(it, a.buy));
    return grid;
  }
  if (v.tab === 'heroes') {
    const grid = el('div', 'tp-grid');
    const n = t.roster.filter((r) => r.active).length;
    grid.appendChild(el('h3', 'tp-sub', `Party ${n}/3: tap a hero to add or remove`));
    for (const r of t.roster) {
      const cls = `tp-card hero ${r.active ? 'on buy' : r.owned ? 'owned buy' : 'locked'}`;
      const b = el('button', cls);
      b.type = 'button';
      const ic = el('span', 'ic');
      ic.appendChild(icon('hero'));
      const status = r.active ? 'In party' : r.owned ? 'Available' : r.note;
      b.append(ic, el('span', 'nm', r.label), el('span', 'ds', status), el('span', 'side'));
      if (r.owned) b.addEventListener('click', (ev) => { ev.stopPropagation(); a.buy(`Party:${r.className}`); });
      else b.disabled = true;
      grid.appendChild(b);
    }
    return grid;
  }
  if (v.tab === 'report') {
    const box = el('div', 'tp-rows');
    if (!v.report) {
      box.appendChild(el('p', 'tp-empty', 'No expedition yet. Begin one and its report will be kept here.'));
      return box;
    }
    box.appendChild(el('div', `tp-result ${v.report.victory ? 'win' : 'lose'}`, v.report.victory ? 'Victory' : 'Run Over'));
    for (const l of v.report.lines) {
      if (l.wide) {
        box.appendChild(el('div', 'tp-wide', l.value));
        continue;
      }
      const row = el('div', 'tp-row');
      row.appendChild(el('span', '', l.label));
      if (l.value !== '') row.appendChild(el('span', 'v', l.value));
      box.appendChild(row);
    }
    return box;
  }
  // Settings.
  const set = el('div', 'tp-set');
  const vol = el('label', '', 'Music');
  const slider = el('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(v.volume * 100));
  slider.addEventListener('input', () => a.volume(Number(slider.value) / 100));
  vol.appendChild(slider);
  set.append(vol, btn(`tp-danger${v.resetArmed ? ' armed' : ''}`, a.reset, v.resetArmed ? 'Tap again to erase all progress' : 'Reset progress'));
  return set;
}
