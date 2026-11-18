import Phaser from 'phaser';
import { BootScene } from './game/BootScene';

export const GAME_W = 1920;
export const GAME_H = 1080;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#12101a',
  // Desktop and mobile from the start: fixed 16:9 logical canvas, fit-scaled and centred.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_W, height: GAME_H },
  input: { activePointers: 3 },
  scene: [BootScene],
});
