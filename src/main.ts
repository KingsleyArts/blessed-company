import Phaser from 'phaser';
import { BootScene } from './game/BootScene';
import { RunScene } from './game/RunScene';
import { FramePacer } from './game/framePacer';
import { readParams } from './game/params';

// The canvas is the window at device pixels (dpr capped at 2), shown at CSS size (zoom 1/dpr); the main camera zooms by dpr so the
// scene works in CSS pixels. The HUD layout is computed at CSS size, as Unreal computes it at viewport size (with its 0.6 scale floor
// keeping phone text readable).
// Touch devices (phones, tablets) save battery: pixel ratio capped at 1.5 and the loop at 30 fps (see framePacer.ts); ?dpr= and ?fps= override.
const params = readParams(window.location.search);
const touch = window.matchMedia('(pointer: coarse)').matches;
const dprCap = params.dpr > 0 ? params.dpr : touch ? 1.5 : 2;
const activeFps = params.fps >= 0 ? params.fps : touch ? 30 : 0;
export const dpr = (): number => Math.min(dprCap, Math.max(1, window.devicePixelRatio || 1));

const d = dpr();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#050406',
  scale: { mode: Phaser.Scale.NONE, width: Math.max(16, Math.round(window.innerWidth * d)), height: Math.max(16, Math.round(window.innerHeight * d)), zoom: 1 / d },
  input: { activePointers: 3 },
  // The art is filtered (antialias) but the canvas itself needs no multisampling; low-power asks the browser for the efficient GPU.
  render: { antialias: true, antialiasGL: false, powerPreference: 'low-power' },
  ...(activeFps > 0 ? { fps: { limit: Math.round(activeFps * 1.03 * 100) / 100 } } : {}),
  scene: [BootScene, RunScene],
});
game.registry.set('params', params);
game.registry.set('dpr', d);
game.registry.set('pacer', new FramePacer(game, activeFps));
(window as unknown as { bcGame: Phaser.Game }).bcGame = game;   // console access while testing

let pending = 0;
const resize = (): void => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    const k = dpr();
    game.registry.set('dpr', k);
    game.scale.resize(Math.max(16, Math.round(window.innerWidth * k)), Math.max(16, Math.round(window.innerHeight * k)));
    game.scale.setZoom(1 / k);
  });
};
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
// If iOS scrolls the page anyway (rotation, toolbar changes), put it back: a scrolled page offsets taps from what is drawn.
const unscroll = (): void => {
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
  game.scale.updateBounds();
};
window.addEventListener('scroll', unscroll, { passive: true });
window.visualViewport?.addEventListener('scroll', unscroll);
