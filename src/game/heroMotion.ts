// Code-only hero animation (director, Nov 20: "step 1" of the cut-scope animation plan). The chibi sprite is the only drawn frame; the
// motion that makes it read as acting comes from small offsets, tints and turns computed here: an idle bob, a hop while walking, a lunge
// toward the target when a hit lands, a white flash and a knock-back when hit, a gold glow while casting, a red pulse when weak, lying
// down grey when knocked out, and victory hops. Pure maths so it can be tested; unitView applies the result to the sprite.

/** Tuning, in world units (uu) and seconds. */
export const kHeroMotion = {
  /** Sprite size: world units per sprite pixel. A 72 px sprite stands about as tall as the old sphere plus a head. */
  uuPerPx: 3.6,
  bobUu: 4, bobHz: 0.8,
  hopUu: 16, hopHz: 3.5,
  lungeUu: 45, lungeSeconds: 0.22,
  knockUu: 14, knockSeconds: 0.16,
  flashSeconds: 0.09,
  castHopUu: 10, castSeconds: 0.35,
  /** Below this share of max HP the hero pulses red and sags (the "weak" pose, in code). */
  weakFraction: 0.25,
  koSeconds: 0.3,
  victoryHopUu: 22, victoryHz: 1.6,
};

/** Testing-only sprite sizes from the pause menu's tuning panel (Sprites tab): an overall multiplier for the party and for enemies, and
 *  one per unit name. 1 everywhere = the shipped sizes. Saved with the other tuning values until the director locks them in. */
export const spriteSizes = { party: 1, enemy: 1, unit: {} as Record<string, number> };
export const unitSpriteSize = (name: string): number => spriteSizes.unit[name] ?? 1;

/** What happened to one hero recently, as clocks counting up since each event (99 = long ago). */
export interface HeroFx {
  lunge: number; lungeDir: number;
  knock: number; knockDir: number;
  flash: number;
  cast: number;
  /** Time since the hero was knocked out (99 while alive is fine; it is read only when dead). */
  ko: number;
}

export const newHeroFx = (): HeroFx => ({ lunge: 99, lungeDir: 1, knock: 99, knockDir: -1, flash: 99, cast: 99, ko: 99 });

export interface HeroPose {
  /** Offsets in world units: x along the room, lift up from the floor. */
  dx: number;
  lift: number;
  /** Vertical squash (1 = none). */
  scaleY: number;
  /** Degrees; a knocked-out hero lies down. */
  angle: number;
  /** 'flash' draws the sprite solid white. */
  tint: number;
  flash: boolean;
  alpha: number;
}

export interface HeroState {
  time: number;
  alive: boolean;
  moving: boolean;
  /** Casting or winding up an ability or heal. */
  casting: boolean;
  hpFraction: number;
  won: boolean;
  faceRight: boolean;
}

const pulse = (age: number, len: number): number => (age >= 0 && age < len ? Math.sin((Math.PI * age) / len) : 0);
const mixColor = (a: number, b: number, t: number): number => {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

export function heroPose(s: HeroState, fx: HeroFx, m = kHeroMotion): HeroPose {
  if (!s.alive) {
    const k = Math.min(1, Math.max(0, fx.ko / m.koSeconds));
    return { dx: 0, lift: 0, scaleY: 1, angle: (s.faceRight ? -90 : 90) * k, tint: 0x7a7a86, flash: false, alpha: 1 - 0.2 * k };
  }
  let lift = 0;
  if (s.won) lift = m.victoryHopUu * Math.abs(Math.sin(Math.PI * m.victoryHz * s.time));
  else if (s.moving) lift = m.hopUu * Math.abs(Math.sin(Math.PI * m.hopHz * s.time));
  else lift = m.bobUu * (0.5 + 0.5 * Math.sin(2 * Math.PI * m.bobHz * s.time));
  lift += m.castHopUu * pulse(fx.cast, m.castSeconds);
  const dx = m.lungeUu * pulse(fx.lunge, m.lungeSeconds) * fx.lungeDir + m.knockUu * pulse(fx.knock, m.knockSeconds) * fx.knockDir;
  const weak = s.hpFraction < m.weakFraction;
  let tint = 0xffffff;
  if (s.casting) tint = mixColor(0xffffff, 0xffe27a, 0.35 + 0.25 * Math.sin(2 * Math.PI * 3 * s.time));
  else if (weak) tint = mixColor(0xffffff, 0xff6a6a, 0.3 + 0.3 * Math.sin(2 * Math.PI * 1.5 * s.time));
  return { dx, lift, scaleY: weak && !s.won ? 0.9 : 1, angle: 0, tint, flash: fx.flash < m.flashSeconds, alpha: 1 };
}

/** Enemies drawn as one still pixel sprite (director's art, Nov 20). The Grunt keeps its animated sprite set. The art faces right. */
export const kEnemySpriteNames = ['Archer', 'Brute', 'Shaman'] as const;
export const enemyTextureKey = (name: string): string => `enemy_${name}`;

/** The heroes that have a combat sprite (all six since the Barbarian and Summoner came online, Nov 21). */
export const kHeroSpriteClasses = ['Warrior', 'Mage', 'Assassin', 'Priest', 'Barbarian', 'Summoner'] as const;
export const heroTextureKey = (cls: string): string => `hero_${cls}`;
/** Which way the chibi art (heroes and the still enemies) faces as drawn. It faces right (director, Nov 20: with `true` the heroes attacked with their backs turned),
 *  so it is mirrored only when the hero looks left. */
export const kSpriteFacesLeft = false;
/** A hero's portrait (256 px face from their character sheet), shown in the in-run HUD. */
export const heroFaceKey = (cls: string): string => `hero_face_${cls}`;
