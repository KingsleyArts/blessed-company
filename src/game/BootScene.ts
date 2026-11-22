import Phaser from 'phaser';
import { artKeys, kThemes } from '../ui/roomTheme';
import { enemyTextureKey, heroFaceKey, heroKoTextureKey, heroTextureKey, kEnemySpriteNames, kHeroKoClasses, kHeroSpriteClasses, kSpiritTextures, spiritTextureKey } from './heroMotion';
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
    for (const cls of kHeroSpriteClasses) {
      this.load.image(heroTextureKey(cls), `${import.meta.env.BASE_URL}assets/heroes/${cls.toLowerCase()}_sprite.png`);
    }
    for (const cls of kHeroKoClasses) this.load.image(heroKoTextureKey(cls), `${import.meta.env.BASE_URL}assets/heroes/${cls.toLowerCase()}_ko.png`);
    for (const k of kSpiritTextures) this.load.image(spiritTextureKey(k === 'greater'), `${import.meta.env.BASE_URL}assets/heroes/spirit_${k}.png`);
    for (const cls of ['Warrior', 'Mage', 'Assassin', 'Priest', 'Barbarian', 'Summoner']) {
      this.load.image(heroFaceKey(cls), `${import.meta.env.BASE_URL}assets/heroes/${cls.toLowerCase()}_face.webp`);
    }
    // Room tile sets: key cave_floor_a -> assets/env/cave/floor_a.png.
    for (const t of kThemes) {
      if (!t.art) continue;
      for (const key of artKeys(t.art)) {
        const [set, ...rest] = key.split('_');
        this.load.image(key, `${import.meta.env.BASE_URL}assets/env/${set}/${rest.join('_')}.png`);
      }
    }
    for (const name of kEnemySpriteNames) {
      this.load.image(enemyTextureKey(name), `${import.meta.env.BASE_URL}assets/enemies/${name.toLowerCase()}_sprite.png`);
    }
  }

  create(): void {
    // Pixel sprites stay crisp when scaled up.
    for (const key of [...kHeroSpriteClasses.map(heroTextureKey), ...kHeroKoClasses.map(heroKoTextureKey), ...kSpiritTextures.map((k) => spiritTextureKey(k === 'greater')), ...kEnemySpriteNames.map(enemyTextureKey)]) {
      if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    this.scene.start('Run');
  }
}
