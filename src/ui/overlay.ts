// DOM overlays over the canvas (Stage 0 decision: menus in the DOM): the run-over card and the Temple. The run-over card covers the room
// view only (DrawResultsOverlay), so the HUD around it stays visible; the Temple is a full-screen page (temple.ts, director's mockup Nov 19).
// Everything is built with DOM calls, never innerHTML with game text.
import type { TempleSnapshot } from '../core/runManager';
import type { ResultLine } from '../core/uiText';
import { buildTemple, buildTempleBackdrop, type TempleTab, type TempleView } from './temple';

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
    if (this.current && this.kind === 'results') this.place(this.current);   // the Temple is full screen
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
    this.dropBackdrop();
  }

  private dropBackdrop(): void {
    this.backdrop?.remove();
    this.backdrop = undefined;
  }

  private show(node: HTMLElement, kind: 'results' | 'temple'): void {
    // Keep the scroll position when the same screen is drawn again (a purchase redraws the Temple).
    const sel = '.bc-panel';
    const scroll = kind === this.kind ? this.current?.querySelector(sel)?.scrollTop ?? 0 : 0;
    this.current?.remove();
    if (kind !== 'temple') this.dropBackdrop();
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

  /** The Temple home screen (director's mockup, Nov 19): full screen, tabs on the left, one scrolling panel, Begin Expedition.
   *  The tab and the scroll position survive a redraw (a purchase redraws it). Reset progress needs a second tap within 4 s. */
  showTemple(t: TempleSnapshot, essence: number, amountMode: number, volume: number, report: TempleView['report'], h: TempleHandlers): void {
    if (this.kind !== 'temple') this.templeTab = 'blessings';
    const sameTab = this.kind === 'temple' && this.shownTab === this.templeTab;
    const scroll = sameTab ? this.templeScroller?.scrollTop ?? 0 : 0;
    const built = buildTemple({ snapshot: t, essence, amountMode, volume, report, tab: this.templeTab, resetArmed: performance.now() < this.resetArmedUntil }, {
      buy: h.buy,
      amount: h.amount,
      newRun: h.newRun,
      volume: h.volume,
      tab: (tab) => { this.templeTab = tab; this.onRerender?.(); },
      reset: () => {
        if (performance.now() < this.resetArmedUntil) {
          this.resetArmedUntil = 0;
          h.reset();
          return;
        }
        this.resetArmedUntil = performance.now() + 4000;
        window.clearTimeout(this.resetTimer);
        this.resetTimer = window.setTimeout(() => { if (this.kind === 'temple') this.onRerender?.(); }, 4050);
        this.onRerender?.();
      },
    });
    if (!this.backdrop) {
      this.backdrop = buildTempleBackdrop(`${import.meta.env.BASE_URL}assets/ui/temple_bg.webp`);
      this.root.appendChild(this.backdrop);
    }
    this.current?.remove();
    this.current = built.root;
    this.kind = 'temple';
    this.shownTab = this.templeTab;
    this.templeScroller = built.scroller;
    this.root.appendChild(built.root);
    built.scroller.scrollTop = scroll;
    built.refreshArrows();
  }

  private templeTab: TempleTab = 'blessings';
  private shownTab: TempleTab | undefined;
  private templeScroller: HTMLElement | undefined;
  /** The Temple background, kept across redraws so it never flashes. */
  private backdrop: HTMLElement | undefined;

  /** Set by the scene: draws the Temple again (after the reset button arms or disarms). */
  onRerender: (() => void) | undefined;
}
