// Copies the licensed art and music from the Unreal reference repo into public/assets/vendor/ (gitignored: the music licence forbids
// redistributing the raw files, and the sprite source is not yet recorded). The game runs without them (cube goblins, no music).
//   npm run assets                 (reference repo at C:/dev/tower-of-the-lost, or set TOL_DIR)
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const tol = resolve(process.env.TOL_DIR ?? 'C:/dev/tower-of-the-lost');
const out = resolve('public/assets/vendor');

function copyGoblin(): void {
  const src = join(tol, 'Assets/Sprites/goblin_grunt');
  if (!existsSync(src)) {
    console.warn(`goblin frames not found at ${src}; skipped`);
    return;
  }
  const dst = join(out, 'goblin_grunt');
  mkdirSync(dst, { recursive: true });
  const files = readdirSync(src).filter((f) => f.endsWith('.png'));
  for (const f of files) copyFileSync(join(src, f), join(dst, f));
  console.log(`goblin: ${files.length} frames -> ${dst}`);
}

copyGoblin();
