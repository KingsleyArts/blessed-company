import Phaser from 'phaser';
import { BootScene } from './game/BootScene';
import { RunScene } from './game/RunScene';
import { readParams } from './game/params';

// The canvas is the window at device pixels (dpr capped at 2), shown at CSS size (zoom 1/dpr); the main camera zooms by dpr so the
// scene works in CSS pixels. The HUD layout is computed at CSS size, as Unreal computes it at viewport size (with its 0.6 scale floor
// keeping phone text readable).
export const dpr = (): number => Math.min(2, Math.max(1, window.devicePixelRatio || 1));

const params = readParams(window.location.search);
const d = dpr();
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#050406',
  scale: { mode: Phaser.Scale.NONE, width: Math.max(16, Math.round(window.innerWidth * d)), height: Math.max(16, Math.round(window.innerHeight * d)), zoom: 1 / d },
  input: { activePointers: 3 },
  render: { antialias: true },
  scene: [BootScene, RunScene],
});
game.registry.set('params', params);
game.registry.set('dpr', d);
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
