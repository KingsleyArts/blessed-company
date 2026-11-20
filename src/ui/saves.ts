// The Load Save Data screen (director's mockup, Nov 19): three slot cards per page, page dots, Back and Delete Save. Each card shows
// the slot number, a picture of where it was saved, its name (the pencil renames it), where, when, the play time, the party and a
// Load button. Delete Save switches the buttons to Delete; deleting and replacing need a second tap. Built with DOM calls only.
import { el } from './overlay';

export interface SlotCard {
  /** 0-based slot index. */
  slot: number;
  name: string;
  location: string;
  /** Already formatted: "2026-11-19  20:14". */
  when: string;
  /** Already formatted: "12:36:47". */
  playTime: string;
  /** Picture URL for where it was saved. */
  picture: string;
  /** Party: class name, letter and CSS colour (portraits are not drawn yet). */
  party: { name: string; letter: string; color: string }[];
}

export type SavesMode = 'load' | 'replace' | 'delete';

export interface SavesView {
  mode: SavesMode;
  page: number;
  pageCount: number;
  /** The page's slots in order; undefined is an empty slot. */
  cards: { slot: number; card: SlotCard | undefined }[];
  /** A slot waiting for its second tap (delete or replace), or -1. */
  armedSlot: number;
  /** The slot whose name is being edited, or -1. */
  editingSlot: number;
}

export interface SavesActions {
  load: (slot: number) => void;
  /** An empty slot's button: a new game in that slot. */
  newGame: (slot: number) => void;
  /** Delete or replace: first tap arms, second confirms. */
  pressSlot: (slot: number) => void;
  rename: (slot: number) => void;
  commitName: (slot: number, name: string | undefined) => void;
  page: (p: number) => void;
  back: () => void;
  toggleDelete: () => void;
}

const kCss = `
.sv-root { position: fixed; inset: 0; z-index: 10; overflow: hidden; color: #f6eedb; font-family: Georgia, "Times New Roman", serif;
  display: grid; grid-template-rows: auto minmax(0, 1fr) auto; box-sizing: border-box; background: #1b1030;
  padding: max(6px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left)); }
.sv-bg { position: absolute; inset: -12px; background: center / cover no-repeat; filter: blur(3px) saturate(1.05); z-index: -2; }
.sv-root::before { content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(ellipse at 50% 45%, rgba(24, 10, 40, 0.35), rgba(16, 6, 28, 0.72) 75%); }
.sv-root button { font-family: inherit; touch-action: manipulation; -webkit-appearance: none; appearance: none; margin: 0; }
.sv-root svg { display: block; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.sv-head { justify-self: center; display: flex; align-items: center; gap: 0.5em; margin-bottom: clamp(4px, 1.4vh, 14px);
  font-size: clamp(20px, 5.6vh, 50px); font-style: italic; font-weight: 700; color: #fbf3df; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
  padding: 0.12em 1.6em; background: linear-gradient(180deg, rgba(60, 30, 88, 0.96), rgba(32, 14, 52, 0.96)); border: 2px solid #d8b468;
  clip-path: polygon(0.8em 0, calc(100% - 0.8em) 0, 100% 50%, calc(100% - 0.8em) 100%, 0.8em 100%, 0 50%); }
.sv-head.warn { border-color: #f0a090; }

.sv-list { min-height: 0; display: grid; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: clamp(4px, 1.2vh, 12px);
  width: min(100%, 1320px); justify-self: center; }
.sv-card { position: relative; min-height: 0; display: grid; align-items: center; column-gap: clamp(8px, 1.6vw, 26px);
  grid-template-columns: auto minmax(11em, 1fr) auto auto; padding: clamp(4px, 1vh, 10px) clamp(8px, 1.4vw, 20px);
  font-size: clamp(11px, 2.5vh, 25px); box-sizing: border-box;
  background: linear-gradient(180deg, rgba(52, 26, 78, 0.94), rgba(30, 13, 48, 0.95)); border: 2px solid #c9a55a; border-radius: 6px;
  box-shadow: inset 0 0 0 3px rgba(30, 13, 48, 0.9), inset 0 0 0 4px rgba(232, 200, 119, 0.4), 0 6px 22px rgba(0, 0, 0, 0.5); }
.sv-pic { position: relative; height: min(100%, 7.4em); aspect-ratio: 16 / 9; max-height: 100%; min-height: 0; box-sizing: border-box;
  border: 2px solid #d8b468; border-radius: 6px; background: center / cover no-repeat; }
.sv-pic.cave { background-image: radial-gradient(circle at 30% 70%, rgba(110, 160, 255, 0.55), rgba(110, 160, 255, 0) 30%),
  radial-gradient(circle at 75% 35%, rgba(255, 190, 110, 0.5), rgba(255, 190, 110, 0) 22%), linear-gradient(160deg, #1d1840, #0c0b22 70%); }
.sv-pic.empty { background: rgba(20, 10, 34, 0.6); border-style: dashed; border-color: rgba(232, 200, 119, 0.4); }
.sv-num { position: absolute; left: -2px; top: -2px; font-size: 1.15em; font-weight: 700; color: #fbf3df; padding: 0.05em 0.7em 0.05em 0.45em;
  background: linear-gradient(180deg, #4a2470, #2a1244); border: 1.5px solid #d8b468; border-radius: 6px 0 0 0;
  clip-path: polygon(0 0, 100% 0, calc(100% - 0.6em) 100%, 0 100%); }
.sv-info { min-width: 0; display: flex; flex-direction: column; gap: 0.12em; }
.sv-name { display: flex; align-items: center; gap: 0.4em; font-size: 1.3em; color: #fbf3df; min-width: 0; }
.sv-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-name input { font: inherit; color: #fbf3df; background: rgba(12, 6, 22, 0.8); border: 1px solid #e8c877; border-radius: 3px;
  padding: 0 0.3em; width: 100%; min-width: 0; box-sizing: border-box; }
.sv-pen { flex: 0 0 auto; width: 1.25em; height: 1.25em; padding: 0; border: 0; background: none; color: #e8c877; cursor: pointer; }
.sv-pen svg { width: 100%; height: 100%; }
.sv-line { display: flex; align-items: center; gap: 0.5em; color: #e9dfcc; white-space: nowrap; overflow: hidden; }
.sv-line svg { width: 1.1em; height: 1.1em; flex: 0 0 auto; color: #e8c877; }
.sv-line b { font-weight: normal; margin-left: 0.6em; }
.sv-party { display: flex; gap: clamp(4px, 0.7vw, 10px); padding-left: clamp(8px, 1.4vw, 22px); border-left: 1px solid rgba(232, 200, 119, 0.35); height: min(82%, 4.9em); }
.sv-face { height: 100%; aspect-ratio: 1; box-sizing: border-box; border: 2px solid #d8b468; border-radius: 6px; display: flex;
  align-items: center; justify-content: center; font-size: 1.6em; font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7); }
.sv-face.none { background: rgba(20, 10, 34, 0.6); border-style: dashed; border-color: rgba(232, 200, 119, 0.4); }
.sv-act { display: flex; align-items: center; justify-content: center; gap: 0.45em; font-size: 1.2em; min-width: 6.4em; color: #2a1608;
  cursor: pointer; padding: 0.35em 1.2em; border: 2px solid #fbe3a0; background: linear-gradient(180deg, #fff4cc, #ecc672 55%, #b98a35);
  clip-path: polygon(0.7em 0, calc(100% - 0.7em) 0, 100% 50%, calc(100% - 0.7em) 100%, 0.7em 100%, 0 50%); }
.sv-act svg { width: 1.1em; height: 1.1em; stroke-width: 2.2; }
.sv-act.danger { color: #fff0ea; border-color: #ffb8a8; background: linear-gradient(180deg, #b23a2a, #7a1c14); }
.sv-act.armed { color: #fff0ea; border-color: #ffe0a0; background: linear-gradient(180deg, #e0582e, #9a2416); }
.sv-empty { color: #cfc3ae; font-style: italic; font-size: 1.15em; }

.sv-foot { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-top: clamp(4px, 1.2vh, 12px); }
.sv-side { justify-self: start; display: flex; align-items: center; gap: 0.5em; font-size: clamp(14px, 3.4vh, 28px); color: #fbf3df;
  cursor: pointer; padding: 0.25em 1.3em; border: 2px solid #c9a55a; background: linear-gradient(180deg, rgba(60, 30, 88, 0.96), rgba(32, 14, 52, 0.96));
  clip-path: polygon(0.7em 0, calc(100% - 0.7em) 0, 100% 50%, calc(100% - 0.7em) 100%, 0.7em 100%, 0 50%); }
.sv-side svg { width: 1.1em; height: 1.1em; }
.sv-side.right { justify-self: end; } .sv-side.on { border-color: #ffb8a8; background: linear-gradient(180deg, #8a2a1e, #4e140e); }
.sv-dots { display: flex; gap: clamp(8px, 1.4vw, 18px); align-items: center; }
.sv-dot { width: clamp(16px, 3.2vh, 28px); height: clamp(16px, 3.2vh, 28px); padding: 0; border: 0; background: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; }
.sv-dot i { width: 58%; height: 58%; transform: rotate(45deg); border: 2px solid #e8c877; box-sizing: border-box; }
.sv-dot.on i { background: #c9a2ff; border-color: #f4e6ff; box-shadow: 0 0 10px rgba(200, 160, 255, 0.9); }
`;

let styled = false;
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = kCss;
  document.head.appendChild(s);
}

const kIcons: Record<string, string> = {
  pin: 'M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10z M12 8.5a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4z',
  cal: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5 M8 14h2 M12 14h2 M16 14h0.01 M8 17h2 M12 17h2',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  pen: 'M4 20h4L19 9l-4-4L4 16z M14 6l4 4',
  swords: 'M4 4l9 9 M4 4h4 M4 4v4 M20 4l-9 9 M20 4h-4 M20 4v4 M7 17l-3 3 M17 17l3 3 M9 15l-2 2 M15 15l2 2',
  back: 'M12 6l-6 6 6 6 M19 6l-6 6 6 6',
  trash: 'M5 7h14 M10 7V4h4v3 M7 7l1 13h8l1-13 M10 11v6 M14 11v6',
  plus: 'M12 5v14 M5 12h14',
};
function icon(name: string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', kIcons[name]);
  svg.appendChild(p);
  return svg;
}

function btn(cls: string, label: string, onClick: () => void, ic?: string): HTMLButtonElement {
  const b = el('button', cls);
  b.type = 'button';
  if (ic) b.appendChild(icon(ic));
  if (label) b.appendChild(el('span', '', label));
  b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  return b;
}

function line(ic: string, text: string, extra?: string): HTMLElement {
  const d = el('div', 'sv-line');
  d.appendChild(icon(ic));
  d.appendChild(el('span', '', text));
  if (extra) d.appendChild(el('b', '', extra));
  return d;
}

function buildCard(v: SavesView, a: SavesActions, slot: number, card: SlotCard | undefined): HTMLElement {
  const root = el('div', 'sv-card');
  root.dataset.slot = String(slot);
  const pic = el('div', `sv-pic${card && card.picture === '' ? ' cave' : ''}`);
  if (card && card.picture !== '') pic.style.backgroundImage = `url("${card.picture}")`;
  if (!card) pic.classList.add('empty');
  pic.appendChild(el('div', 'sv-num', String(slot + 1).padStart(2, '0')));
  root.appendChild(pic);

  const info = el('div', 'sv-info');
  if (card) {
    const name = el('div', 'sv-name');
    if (v.editingSlot === slot) {
      const input = el('input');
      input.type = 'text';
      input.maxLength = 24;
      input.value = card.name;
      input.setAttribute('aria-label', 'Save name');
      let done = false;
      const commit = (value: string | undefined): void => {
        if (done) return;
        done = true;
        a.commitName(slot, value);
      };
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit(input.value);
        if (ev.key === 'Escape') commit(undefined);
      });
      input.addEventListener('blur', () => commit(input.value));
      name.appendChild(input);
      window.setTimeout(() => { input.focus(); input.select(); }, 0);
    } else {
      name.appendChild(el('span', '', card.name));
      const pen = btn('sv-pen', '', () => a.rename(slot), 'pen');
      pen.setAttribute('aria-label', 'Rename');
      name.appendChild(pen);
    }
    info.appendChild(name);
    info.appendChild(line('pin', card.location));
    info.appendChild(line('cal', card.when));
    info.appendChild(line('clock', 'Play Time', card.playTime));
  } else {
    info.appendChild(el('div', 'sv-empty', 'Empty slot'));
  }
  root.appendChild(info);

  const party = el('div', 'sv-party');
  for (let i = 0; i < 3; ++i) {
    const p = card?.party[i];
    const face = el('div', `sv-face${p ? '' : ' none'}`, p?.letter ?? '');
    if (p) {
      face.style.background = `linear-gradient(180deg, ${p.color}, rgba(20, 10, 34, 0.9) 130%)`;
      face.title = p.name;
    }
    party.appendChild(face);
  }
  root.appendChild(party);

  const armed = v.armedSlot === slot;
  if (!card) {
    root.appendChild(v.mode === 'delete' ? el('div') : btn('sv-act', 'New', () => a.newGame(slot), 'plus'));
  } else if (v.mode === 'delete') {
    root.appendChild(btn(`sv-act ${armed ? 'armed' : 'danger'}`, armed ? 'Sure?' : 'Delete', () => a.pressSlot(slot), 'trash'));
  } else if (v.mode === 'replace') {
    root.appendChild(btn(`sv-act ${armed ? 'armed' : 'danger'}`, armed ? 'Sure?' : 'Replace', () => a.pressSlot(slot), 'swords'));
  } else {
    root.appendChild(btn('sv-act', 'Load', () => a.load(slot), 'swords'));
  }
  return root;
}

/** Builds the Load Save Data screen. `bg` is the background image URL. */
export function buildSaves(v: SavesView, a: SavesActions, bg: string): HTMLElement {
  ensureStyle();
  const root = el('div', 'sv-root');
  const back = el('div', 'sv-bg');
  back.style.backgroundImage = `url("${bg}")`;
  root.appendChild(back);

  const title = v.mode === 'delete' ? 'Delete Save Data' : v.mode === 'replace' ? 'Choose a Save to Replace' : 'Load Save Data';
  root.appendChild(el('div', `sv-head${v.mode === 'load' ? '' : ' warn'}`, title));

  const list = el('div', 'sv-list');
  for (const c of v.cards) list.appendChild(buildCard(v, a, c.slot, c.card));
  root.appendChild(list);

  const foot = el('div', 'sv-foot');
  foot.appendChild(btn('sv-side', 'Back', a.back, 'back'));
  const dots = el('div', 'sv-dots');
  for (let p = 0; p < v.pageCount; ++p) {
    const d = el('button', `sv-dot${p === v.page ? ' on' : ''}`);
    d.type = 'button';
    d.setAttribute('aria-label', `Page ${p + 1}`);
    d.appendChild(el('i'));
    d.addEventListener('click', (ev) => { ev.stopPropagation(); a.page(p); });
    dots.appendChild(d);
  }
  foot.appendChild(dots);
  if (v.mode === 'replace') foot.appendChild(el('div'));
  else foot.appendChild(btn(`sv-side right${v.mode === 'delete' ? ' on' : ''}`, v.mode === 'delete' ? 'Done' : 'Delete Save', a.toggleDelete, 'trash'));
  root.appendChild(foot);
  return root;
}
