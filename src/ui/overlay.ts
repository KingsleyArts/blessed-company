// DOM overlays over the canvas (Stage 0 decision: menus in the DOM): the run-over results card. Styled like the Unreal canvas panels
// (dark fill, gold frame). Everything is built with DOM calls, never innerHTML with game text.
import type { ResultLine } from '../core/uiText';

const kCss = `
.bc-dim { position: fixed; inset: 0; background: rgba(4,3,6,0.62); display: flex; align-items: center; justify-content: center;
  font-family: system-ui, "Segoe UI", Roboto, Arial, sans-serif; color: #f4efe4; z-index: 10; padding: 12px; box-sizing: border-box; }
.bc-panel { background: #0f0c12; border: 2px solid #ecd28a; box-shadow: inset 0 0 0 5px #0f0c12, inset 0 0 0 6px #b48f4a;
  padding: clamp(12px, 2.4vh, 28px) clamp(14px, 2.4vw, 32px); max-height: 100%; overflow: auto; box-sizing: border-box; }
.bc-title { font-size: clamp(22px, 4.4vh, 44px); font-weight: 700; text-align: center; margin: 0 0 clamp(6px, 1.6vh, 16px); }
.bc-row { display: flex; justify-content: space-between; gap: 24px; font-size: clamp(14px, 2.2vh, 22px); padding: 3px 0; }
.bc-row .v { color: #ffe9a8; text-align: right; }
.bc-wide { color: #ffd0c4; font-size: clamp(13px, 2vh, 20px); padding: 1px 0 4px 12px; }
.bc-btns { display: flex; gap: 12px; justify-content: center; margin-top: clamp(10px, 2.2vh, 22px); flex-wrap: wrap; }
.bc-btn { font: inherit; font-size: clamp(15px, 2.4vh, 24px); color: #f4efe4; background: #1a1220; border: 2px solid #dcae5a;
  padding: clamp(8px, 1.4vh, 14px) clamp(16px, 2.4vw, 32px); cursor: pointer; min-width: 9em; touch-action: manipulation; }
.bc-btn:hover { background: #2a1d30; border-color: #ffe08a; }
.bc-btn.primary { background: #4a3410; }
.bc-btn.primary:hover { background: #5e4416; }
.bc-btn:disabled { opacity: 0.45; cursor: default; }
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

export class Overlay {
  private root: HTMLElement;
  private current: HTMLElement | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    ensureStyle();
  }

  isOpen(): boolean { return !!this.current; }

  hide(): void {
    this.current?.remove();
    this.current = undefined;
  }

  show(node: HTMLElement): void {
    this.hide();
    this.current = node;
    this.root.appendChild(node);
  }

  /** The run-over card (DrawResults): title, the result lines, and the buttons given. */
  showResults(victory: boolean, lines: ResultLine[], buttons: { label: string; primary?: boolean; onClick: () => void }[]): void {
    const dim = el('div', 'bc-dim');
    const panel = el('div', 'bc-panel');
    panel.style.minWidth = 'min(420px, 92vw)';
    panel.appendChild(el('div', 'bc-title', victory ? 'Victory' : 'Run Over'));
    for (const l of lines) {
      if (l.wide) {
        panel.appendChild(el('div', 'bc-wide', l.value));
        continue;
      }
      const row = el('div', 'bc-row');
      row.appendChild(el('span', '', l.label));
      row.appendChild(el('span', 'v', l.value));
      panel.appendChild(row);
    }
    const btns = el('div', 'bc-btns');
    for (const b of buttons) btns.appendChild(button(b.label, b.onClick, b.primary ? 'bc-btn primary' : 'bc-btn'));
    panel.appendChild(btns);
    dim.appendChild(panel);
    this.show(dim);
  }
}
