// DOM overlays over the canvas (Stage 0 decision: menus in the DOM): the run-over card and the Temple. Like the Unreal canvas versions
// (DrawResultsOverlay, DrawTempleOverlay) they cover the room view only, so the top bar, mini-map and Essence panel stay visible.
// Everything is built with DOM calls, never innerHTML with game text.
import type { TempleSnapshot } from '../core/runManager';
import { amountLabel, formatCount, type ResultLine } from '../core/uiText';

const kCss = `
.bc-dim { position: fixed; background: rgba(0,0,0,0.74); display: flex; align-items: center; justify-content: center;
  font-family: system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #f4efe4; z-index: 10; padding: 8px; box-sizing: border-box; }
.bc-panel { background: #0f0c12; border: 2px solid #ecd28a; box-shadow: inset 0 0 0 5px #0f0c12, inset 0 0 0 6px #b48f4a;
  padding: clamp(10px, 2.2vh, 26px) clamp(12px, 2vw, 28px); max-height: 100%; max-width: 100%; overflow: auto; box-sizing: border-box; }
.bc-title { font-size: clamp(20px, 4.4vh, 44px); font-weight: 700; text-align: center; margin: 0 0 clamp(4px, 1.4vh, 14px);
  border-bottom: 1px solid #b48f4a; padding-bottom: 4px; }
.bc-title.win { color: #a8ffb4; } .bc-title.lose { color: #ffa898; }
.bc-row { display: flex; justify-content: space-between; gap: 24px; font-size: clamp(13px, 2.2vh, 22px); padding: 2px 0; color: #c9c3bb; }
.bc-row .v { color: #f4efe4; text-align: right; }
.bc-wide { color: #f4efe4; font-size: clamp(12px, 2vh, 20px); padding: 1px 0 3px 12px; }
.bc-btns { display: flex; gap: 10px; justify-content: center; align-items: center; margin-top: clamp(8px, 2vh, 20px); flex-wrap: wrap; }
.bc-btn { font: inherit; font-size: clamp(14px, 2.3vh, 22px); color: #f4efe4; background: #1a1220; border: 2px solid #dcae5a;
  padding: clamp(6px, 1.3vh, 13px) clamp(12px, 2vw, 28px); cursor: pointer; touch-action: manipulation; }
.bc-btn:hover { border-color: #ffe08a; filter: brightness(1.25); }
.bc-btn.go { background: #1b4a24; } .bc-btn.blue { background: #1d2a52; } .bc-btn.on { background: #5a4110; border-color: #ffe08a; }
.bc-btn.danger { background: #4a1010; } .bc-btn.armed { background: #8a1515; border-color: #ffb0b0; }
.bc-btn.small { min-width: 0; padding: clamp(4px, 1vh, 10px) clamp(8px, 1.2vw, 16px); }
.bc-temple-head { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #b48f4a; margin-bottom: 8px; }
.bc-temple-head .t { font-size: clamp(20px, 4vh, 40px); font-weight: 700; color: #dcae5a; }
.bc-temple-head .f { font-size: clamp(14px, 2.6vh, 26px); color: #a8cfff; }
.bc-panel.temple { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.bc-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(8px, 1.4vw, 18px); overflow: auto; flex: 1 1 auto;
  min-height: 0; align-content: start; padding-right: 4px; }
.bc-panel.temple .bc-party, .bc-panel.temple .bc-btns { flex: 0 0 auto; }
.bc-temple-head .right { display: flex; align-items: center; gap: 12px; }
@media (max-height: 560px) {
  .bc-panel.temple { display: block; overflow: auto; }
  .bc-panel.temple .bc-cols { overflow: visible; }
  .bc-temple-head { position: sticky; top: calc(-1 * clamp(10px, 2.2vh, 26px)); background: #0f0c12; z-index: 1; padding-top: 4px; }
}
@media (max-width: 720px) { .bc-cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.bc-col h3 { margin: 0 0 6px; font-size: clamp(12px, 2vh, 18px); font-weight: 600; color: #b4aea6; border-bottom: 1px solid #6e5524; padding-bottom: 3px; }
.bc-item { display: block; width: 100%; text-align: left; font: inherit; color: #b4aea6; background: #1a141c; border: 1px solid #6e5524;
  padding: clamp(4px, 0.8vh, 8px) 8px; margin-bottom: 6px; cursor: default; touch-action: manipulation; }
.bc-item.buy { background: #15331b; border-color: #dcae5a; color: #f4efe4; cursor: pointer; }
.bc-item.buy:hover { border-color: #ffe08a; filter: brightness(1.2); }
.bc-item.max { background: #121f12; color: #f4efe4; }
.bc-item .l1, .bc-item .l2 { display: flex; justify-content: space-between; gap: 8px; }
.bc-item .l1 { font-size: clamp(12px, 2vh, 19px); }
.bc-item .l2 { font-size: clamp(10px, 1.6vh, 15px); color: #b4aea6; margin-top: 2px; }
.bc-item .price { color: #a8cfff; white-space: nowrap; }
.bc-item:not(.buy) .price { color: #8d8780; }
.bc-party { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.bc-party .lbl { font-size: clamp(13px, 2.2vh, 21px); margin-right: 4px; }
.bc-hero { font: inherit; font-size: clamp(12px, 2vh, 18px); color: #f4efe4; background: #1a141e; border: 2px solid #6e5524;
  padding: clamp(4px, 0.9vh, 9px) 10px; cursor: pointer; touch-action: manipulation; }
.bc-hero.active { background: #1b4a24; border-color: #8cf296; }
.bc-hero.locked { background: #0e0b0e; color: #8d8780; cursor: default; }
.bc-vol { display: inline-flex; align-items: center; gap: 6px; font-size: clamp(12px, 2vh, 18px); color: #c9c3bb; }
.bc-vol input { width: clamp(70px, 12vw, 140px); }
`;

let styled = false;
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = kCss;
  document.head.appendChild(s);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function button(label: string, onClick: () => void, cls = 'bc-btn'): HTMLButtonElement {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(); });
  return b;
}

export interface Area { x: number; y: number; w: number; h: number }

export interface TempleHandlers {
  buy: (id: string) => void;
  amount: (mode: number) => void;
  back?: () => void;
  newRun: () => void;
  reset: () => void;
  volume: (v: number) => void;
}

export class Overlay {
  private root: HTMLElement;
  private current: HTMLElement | undefined;
  private area: Area = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  private resetArmedUntil = 0;
  private resetTimer = 0;
  /** What is up: none, the run-over card, or the Temple. */
  kind: 'none' | 'results' | 'temple' = 'none';

  constructor(root: HTMLElement) {
    this.root = root;
    ensureStyle();
  }

  isOpen(): boolean { return !!this.current; }

  /** The room view rectangle in CSS pixels (the overlays cover it, as in Unreal). */
  setArea(a: Area): void {
    if (a.x === this.area.x && a.y === this.area.y && a.w === this.area.w && a.h === this.area.h) return;
    this.area = { ...a };
    if (this.current) this.place(this.current);
  }

  private place(dim: HTMLElement): void {
    dim.style.left = `${this.area.x}px`;
    dim.style.top = `${this.area.y}px`;
    dim.style.width = `${this.area.w}px`;
    dim.style.height = `${this.area.h}px`;
  }

  hide(): void {
    this.current?.remove();
    this.current = undefined;
    this.kind = 'none';
  }

  private show(node: HTMLElement, kind: 'results' | 'temple'): void {
    // Keep the scroll position when the same screen is drawn again (a purchase redraws the Temple).
    const sel = kind === 'temple' && window.innerHeight > 560 ? '.bc-cols' : '.bc-panel';
    const scroll = kind === this.kind ? this.current?.querySelector(sel)?.scrollTop ?? 0 : 0;
    this.current?.remove();
    this.current = node;
    this.kind = kind;
    this.place(node);
    this.root.appendChild(node);
    const box = node.querySelector(sel);
    if (box) box.scrollTop = scroll;
  }

  /** The run-over card (DrawResultsOverlay): title, the result lines, and the buttons given. */
  showResults(victory: boolean, lines: ResultLine[], buttons: { label: string; cls?: string; onClick: () => void }[]): void {
    const dim = el('div', 'bc-dim');
    const panel = el('div', 'bc-panel');
    panel.style.minWidth = `min(420px, 100%)`;
    panel.appendChild(el('div', `bc-title ${victory ? 'win' : 'lose'}`, victory ? 'Victory' : 'Run Over'));
    for (const l of lines) {
      if (l.wide) {
        panel.appendChild(el('div', 'bc-wide', l.value));
        continue;
      }
      const row = el('div', 'bc-row');
      row.appendChild(el('span', '', l.label));
      if (l.value !== '') row.appendChild(el('span', 'v', l.value));
      panel.appendChild(row);
    }
    const btns = el('div', 'bc-btns');
    for (const b of buttons) btns.appendChild(button(b.label, b.onClick, `bc-btn ${b.cls ?? ''}`));
    panel.appendChild(btns);
    dim.appendChild(panel);
    this.show(dim, 'results');
  }

  /** The Temple (DrawTempleOverlay): Faith, the three columns of purchases, the party picker, the amount selector, New Run.
   *  Back only when it was opened over a run-over card. Reset progress needs a second click within 4 s. */
  showTemple(t: TempleSnapshot, amountMode: number, volume: number, h: TempleHandlers): void {
    const dim = el('div', 'bc-dim');
    const panel = el('div', 'bc-panel temple');
    panel.style.width = '100%';
    const head = el('div', 'bc-temple-head');
    head.appendChild(el('span', 't', 'Temple'));
    const right = el('span', 'right');
    right.appendChild(el('span', 'f', `Faith: ${formatCount(t.essence)}`));
    right.appendChild(button('New Run', h.newRun, 'bc-btn go small'));
    head.appendChild(right);
    panel.appendChild(head);
    const cols = el('div', 'bc-cols');
    const headers = ['Gear (per class)', 'Stats: unlock, then upgrade', 'Party Luck'];
    for (let c = 0; c < 3; ++c) {
      const col = el('div', 'bc-col');
      col.appendChild(el('h3', '', headers[c]));
      for (const it of t.items.filter((i) => i.column === c)) {
        const b = el('button', `bc-item ${it.canBuy ? 'buy' : it.maxed ? 'max' : ''}`);
        b.type = 'button';
        const l1 = el('div', 'l1');
        l1.appendChild(el('span', '', it.label));
        l1.appendChild(el('span', '', it.maxLevel > 1 ? `Lv ${it.level}/${it.maxLevel}` : it.maxed ? 'Owned' : ''));
        const l2 = el('div', 'l2');
        l2.appendChild(el('span', '', it.detail));
        l2.appendChild(el('span', 'price', it.maxed ? 'MAX' : formatCount(it.cost)));
        b.append(l1, l2);
        if (it.canBuy) b.addEventListener('click', (ev) => { ev.stopPropagation(); h.buy(it.id); });
        else b.disabled = true;
        col.appendChild(b);
      }
      cols.appendChild(col);
    }
    panel.appendChild(cols);
    const party = el('div', 'bc-party');
    party.appendChild(el('span', 'lbl', `Party ${t.roster.filter((r) => r.active).length}/3`));
    for (const r of t.roster) {
      const text = r.owned ? r.label + (r.active ? '  (in party)' : '') : `${r.label}: ${r.note}`;
      const b = el('button', `bc-hero ${r.active ? 'active' : r.owned ? '' : 'locked'}`, text);
      b.type = 'button';
      if (r.owned) b.addEventListener('click', (ev) => { ev.stopPropagation(); h.buy(`Party:${r.className}`); });
      else b.disabled = true;
      party.appendChild(b);
    }
    panel.appendChild(party);
    const btns = el('div', 'bc-btns');
    if (h.back) btns.appendChild(button('Back', h.back, 'bc-btn blue'));
    for (let i = 0; i < 4; ++i) btns.appendChild(button(amountLabel(i), () => h.amount(i), `bc-btn small ${i === amountMode ? 'on' : ''}`));
    const vol = el('label', 'bc-vol', 'Music');
    const slider = el('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(volume * 100));
    slider.addEventListener('input', () => h.volume(Number(slider.value) / 100));
    vol.appendChild(slider);
    btns.appendChild(vol);
    const armed = performance.now() < this.resetArmedUntil;
    btns.appendChild(button(armed ? 'Click again to erase all progress' : 'Reset progress', () => {
      if (performance.now() < this.resetArmedUntil) {
        this.resetArmedUntil = 0;
        h.reset();
        return;
      }
      this.resetArmedUntil = performance.now() + 4000;
      window.clearTimeout(this.resetTimer);
      this.resetTimer = window.setTimeout(() => { if (this.kind === 'temple') this.onRerender?.(); }, 4050);
      this.onRerender?.();
    }, `bc-btn small ${armed ? 'armed' : 'danger'}`));
    panel.appendChild(btns);
    dim.appendChild(panel);
    this.show(dim, 'temple');
  }

  /** Set by the scene: draws the Temple again (after the reset button arms or disarms). */
  onRerender: (() => void) | undefined;
}
