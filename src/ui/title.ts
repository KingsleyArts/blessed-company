// The title screen (director's art, Nov 19). The title, subtitle and the four buttons are painted into the image, so the page is the
// image scaled to cover the screen plus invisible tap areas laid over the painted buttons. The image and the tap areas sit in one box
// with the image's shape, so they stay lined up at any screen size (the screen crops the box's edges, never moves the buttons).
// Built with DOM calls only.
import { buildFloorSizeDebug, type FloorSizeDebug } from './floorSizeDebug';
import { el } from './overlay';

/** Size of the title image in pixels; the tap areas below are in these pixels. */
const kImgW = 1671;
const kImgH = 941;

/** Painted buttons, as boxes in image pixels. Each box reaches halfway into the gaps around it, so taps between buttons still land. */
const kButtons = {
  newGame: { x: 622, y: 488, w: 430, h: 88 },
  continue: { x: 672, y: 580, w: 326, h: 68 },
  settings: { x: 672, y: 648, w: 326, h: 69 },
  quit: { x: 672, y: 717, w: 326, h: 70 },
} as const;

export type TitleButton = keyof typeof kButtons;

export interface TitleView {
  /** A save exists, so Continue works; otherwise Continue is dimmed. */
  canContinue: boolean;
  /** New Game was tapped once over a save: the warning shows and a second tap erases progress. */
  newGameArmed: boolean;
  volume: number;
  /** What is open over the art. */
  panel: 'none' | 'settings' | 'quit';
  /** Testing builds only. */
  floorSize?: FloorSizeDebug;
}

export interface TitleActions {
  newGame: () => void;
  continue: () => void;
  settings: () => void;
  quit: () => void;
  closePanel: () => void;
  volume: (v: number) => void;
}

const kCss = `
.tl-root { position: fixed; inset: 0; z-index: 10; overflow: hidden; background: #1b1030; container-type: size;
  font-family: Georgia, "Times New Roman", serif; color: #f6eedb; }
.tl-box { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: max(100vw, calc(100vh * ${kImgW} / ${kImgH})); height: max(100vh, calc(100vw * ${kImgH} / ${kImgW}));
  width: max(100cqw, calc(100cqh * ${kImgW} / ${kImgH})); height: max(100cqh, calc(100cqw * ${kImgH} / ${kImgW}));
  background: center / 100% 100% no-repeat; }
.tl-hit { position: absolute; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; touch-action: manipulation;
  -webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: transparent; }
/* The glow follows the painted button's pointed ends; it is inset so it sits on the button, not the gap. */
.tl-hit::after { content: ""; position: absolute; inset: 14% 3%; opacity: 0; transition: opacity 0.12s;
  clip-path: polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0 50%);
  background: radial-gradient(ellipse at 50% 50%, rgba(255, 244, 214, 0.42), rgba(255, 226, 160, 0.12) 70%); mix-blend-mode: screen; }
.tl-hit:hover::after, .tl-hit:focus-visible::after { opacity: 0.7; }
.tl-hit:active::after { opacity: 1; }
.tl-hit.off { cursor: default; }
.tl-hit.off::after { opacity: 1; background: rgba(22, 10, 36, 0.62); mix-blend-mode: normal; }
.tl-note { position: absolute; left: 50%; transform: translateX(-50%); bottom: max(10px, env(safe-area-inset-bottom)); max-width: 92vw;
  font-size: clamp(13px, 2.6vh, 20px); padding: 0.45em 1.1em; text-align: center; border: 1px solid #e8c877; border-radius: 6px;
  background: rgba(30, 14, 46, 0.92); box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55); }
.tl-note.warn { border-color: #f0a090; color: #ffe2d8; }
.tl-dim { position: absolute; inset: 0; background: rgba(12, 6, 22, 0.55); display: flex; align-items: center; justify-content: center; }
.tl-panel { min-width: min(360px, 86vw); max-width: 90vw; box-sizing: border-box; padding: clamp(12px, 3vh, 28px) clamp(16px, 3vw, 32px);
  background: linear-gradient(180deg, rgba(48, 24, 72, 0.97), rgba(26, 12, 42, 0.97)); border: 2px solid #c9a55a; border-radius: 6px;
  box-shadow: inset 0 0 0 4px rgba(26, 12, 42, 0.9), inset 0 0 0 5px rgba(232, 200, 119, 0.45), 0 10px 36px rgba(0, 0, 0, 0.6);
  display: flex; flex-direction: column; gap: clamp(10px, 2.4vh, 20px); font-size: clamp(14px, 2.8vh, 22px); }
.tl-panel h2 { margin: 0; font-size: 1.4em; font-style: italic; color: #fbf3df; border-bottom: 1px solid rgba(232, 200, 119, 0.45);
  padding-bottom: 0.2em; }
.tl-panel label { display: flex; align-items: center; gap: 12px; }
.tl-panel input[type=range] { flex: 1; min-width: 120px; accent-color: #e8c877; }
.tl-btn { align-self: center; font: inherit; color: #2a1608; cursor: pointer; padding: 0.3em 1.6em; border: 2px solid #fbe3a0;
  background: linear-gradient(180deg, #fff4cc, #ecc672 55%, #b98a35); touch-action: manipulation; -webkit-appearance: none; appearance: none;
  clip-path: polygon(0.6em 0, calc(100% - 0.6em) 0, 100% 50%, calc(100% - 0.6em) 100%, 0.6em 100%, 0 50%); }
`;

let styled = false;
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = kCss;
  document.head.appendChild(s);
}

function hit(name: TitleButton, label: string, onClick: () => void, off = false): HTMLButtonElement {
  const r = kButtons[name];
  const b = el('button', `tl-hit${off ? ' off' : ''}`);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.dataset.btn = name;
  b.style.left = `${(r.x / kImgW) * 100}%`;
  b.style.top = `${(r.y / kImgH) * 100}%`;
  b.style.width = `${(r.w / kImgW) * 100}%`;
  b.style.height = `${(r.h / kImgH) * 100}%`;
  if (off) b.setAttribute('aria-disabled', 'true');
  b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (!off) onClick();
  });
  return b;
}

/** Builds the title screen. `bg` is the title image URL. */
export function buildTitle(v: TitleView, a: TitleActions, bg: string): HTMLElement {
  ensureStyle();
  const root = el('div', 'tl-root');
  const box = el('div', 'tl-box');
  box.style.backgroundImage = `url("${bg}")`;
  box.appendChild(hit('newGame', 'New Game', a.newGame));
  box.appendChild(hit('continue', 'Continue', a.continue, !v.canContinue));
  box.appendChild(hit('settings', 'Settings', a.settings));
  box.appendChild(hit('quit', 'Quit', a.quit));
  root.appendChild(box);

  if (v.newGameArmed) root.appendChild(el('div', 'tl-note warn', 'Tap New Game again to erase your saved progress and start over.'));

  if (v.panel !== 'none') {
    const dim = el('div', 'tl-dim');
    dim.addEventListener('click', (ev) => { if (ev.target === dim) a.closePanel(); });
    const panel = el('div', 'tl-panel');
    if (v.panel === 'settings') {
      panel.appendChild(el('h2', '', 'Settings'));
      const row = el('label');
      row.appendChild(el('span', '', 'Music'));
      const slider = el('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '100';
      slider.value = String(Math.round(v.volume * 100));
      const pct = el('span', '', `${slider.value}%`);
      slider.addEventListener('input', () => {
        pct.textContent = `${slider.value}%`;
        a.volume(Number(slider.value) / 100);
      });
      row.appendChild(slider);
      row.appendChild(pct);
      panel.appendChild(row);
      if (v.floorSize) panel.appendChild(buildFloorSizeDebug(v.floorSize));
    } else {
      panel.appendChild(el('h2', '', 'Quit'));
      panel.appendChild(el('div', '', 'Your progress is saved. Close this browser tab to quit.'));
    }
    const back = el('button', 'tl-btn', 'Back');
    back.type = 'button';
    back.addEventListener('click', (ev) => { ev.stopPropagation(); a.closePanel(); });
    panel.appendChild(back);
    dim.appendChild(panel);
    root.appendChild(dim);
  }
  return root;
}
