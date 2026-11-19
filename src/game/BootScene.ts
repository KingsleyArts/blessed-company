import Phaser from 'phaser';
import { goblinFrames } from './unitView';

/** Loads what exists of the optional art and music (public/assets/vendor, copied by `npm run assets`), then starts the run scene.
 *  Missing files are skipped: the goblin falls back to a cube and the game plays silent. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const w = this.scale.width, h = this.scale.height;
    const bar = this.add.graphics();
    this.load.on('progress', (p: number) => {
      bar.clear().fillStyle(0xdcae5a, 1).fillRect(w * 0.3, h * 0.5 - 4, w * 0.4 * p, 8);
    });
    this.load.on('loaderror', (f: Phaser.Loader.File) => console.info(`optional asset missing: ${f.src}`));
    const base = `${import.meta.env.BASE_URL}assets/vendor/`;
    for (const frames of Object.values(goblinFrames)) {
      for (const f of frames) this.load.image(`gob_${f}`, `${base}goblin_grunt/${f}.png`);
    }
  }

  create(): void {
    this.scene.start('Run');
  }
}
