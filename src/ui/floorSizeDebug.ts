// Settings > Debug (testing builds only): the floor size rolls, saved in this browser. A change applies from the next floor built.
import { defaultFloorSize, kFloorSizeHigh, kFloorSizeLow, normalizeFloorSize, type FloorSize } from '../core/floorGenerator';

export interface FloorSizeDebug { get: () => FloorSize; set: (s: FloorSize) => void }

type Key = keyof FloorSize;
const kRows: { label: string; min: Key; max: Key }[] = [
  { label: 'Normal floors', min: 'min', max: 'max' },
  { label: 'First floor (new players)', min: 'tutorialMin', max: 'tutorialMax' },
];

function node<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.style.cssText = css;
  n.textContent = text;
  return n;
}

const kBtn = 'width:40px;height:40px;font:inherit;font-size:1.2em;color:#fbf3df;background:rgba(60,38,20,.9);border:1px solid #e8c877;border-radius:6px;cursor:pointer;touch-action:manipulation';

export function buildFloorSizeDebug(h: FloorSizeDebug): HTMLElement {
  let size = h.get();
  const box = node('div', 'display:flex;flex-direction:column;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid rgba(232,200,119,.45);font-size:.9em');
  box.dataset.debug = 'floorSize';
  box.appendChild(node('div', 'font-style:italic;color:#e8c877', 'Debug: floor size (main rooms)'));
  const values = new Map<Key, HTMLElement>();
  const refresh = (): void => { for (const [k, v] of values) v.textContent = String(size[k]); };
  const change = (next: FloorSize): void => {
    size = normalizeFloorSize(next);
    h.set(size);
    refresh();
  };
  // Lowering a max below its min pulls the min down with it; raising a min past its max is handled by normalizeFloorSize.
  const step = (k: Key, d: number): void => {
    const next = { ...size, [k]: Math.min(kFloorSizeHigh, Math.max(kFloorSizeLow, size[k] + d)) };
    if (k === 'max' && next.max < next.min) next.min = next.max;
    if (k === 'tutorialMax' && next.tutorialMax < next.tutorialMin) next.tutorialMin = next.tutorialMax;
    change(next);
  };
  const stepper = (name: string, k: Key): HTMLElement => {
    const wrap = node('span', 'display:inline-flex;align-items:center;gap:4px');
    wrap.appendChild(node('span', 'min-width:2.2em', name));
    const button = (text: string, d: number): HTMLButtonElement => {
      const b = node('button', kBtn, text);
      b.type = 'button';
      b.dataset.size = `${k}:${d}`;
      b.setAttribute('aria-label', `${name} ${d > 0 ? 'more' : 'fewer'} rooms`);
      b.addEventListener('click', (ev) => { ev.stopPropagation(); step(k, d); });
      return b;
    };
    const value = node('span', 'min-width:1.6em;text-align:center;font-weight:bold');
    values.set(k, value);
    wrap.append(button('-', -1), value, button('+', 1));
    return wrap;
  };
  for (const r of kRows) {
    box.appendChild(node('div', '', r.label));
    const line = node('div', 'display:flex;flex-wrap:wrap;gap:6px 14px');
    line.append(stepper('Min', r.min), stepper('Max', r.max));
    box.appendChild(line);
  }
  box.appendChild(node('div', 'opacity:.8;font-size:.9em', 'Side rooms add about 70% more. Applies from the next floor.'));
  const reset = node('button', `${kBtn};width:auto;height:36px;padding:0 12px;font-size:1em;align-self:flex-start`, 'Reset floor size');
  reset.type = 'button';
  reset.dataset.size = 'reset';
  reset.addEventListener('click', (ev) => { ev.stopPropagation(); change(defaultFloorSize()); });
  box.appendChild(reset);
  refresh();
  return box;
}
