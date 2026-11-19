// Copies the licensed art and music from the Unreal reference repo into public/assets/vendor/ (gitignored: the music licence forbids
// redistributing the raw files, and the sprite source is not yet recorded). The game runs without them (cube goblins, no music).
//   npm run assets                 (reference repo at C:/dev/tower-of-the-lost, or set TOL_DIR)
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

/** 16-bit PCM WAV -> mono 22.05 kHz 16-bit PCM WAV (about a quarter of the size; every browser plays it). No encoder is installed
 *  on the dev machine and no new dependency was added, so this is a plain downmix with a 2-tap average before halving the rate. */
function shrinkWav(src: string, dst: string): void {
  const b = readFileSync(src);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${src}: not a WAV`);
  let p = 12;
  let channels = 0, rate = 0, bits = 0, dataAt = -1, dataLen = 0;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4);
    const len = b.readUInt32LE(p + 4);
    if (id === 'fmt ') {
      channels = b.readUInt16LE(p + 10);
      rate = b.readUInt32LE(p + 12);
      bits = b.readUInt16LE(p + 22);
    } else if (id === 'data') {
      dataAt = p + 8;
      dataLen = Math.min(len, b.length - dataAt);
      break;
    }
    p += 8 + len + (len & 1);
  }
  if (bits !== 16 || dataAt < 0 || channels < 1) throw new Error(`${src}: expected 16-bit PCM`);
  const frames = Math.floor(dataLen / (2 * channels));
  const halve = rate >= 44100;
  const outFrames = halve ? Math.floor(frames / 2) : frames;
  const out = Buffer.alloc(44 + outFrames * 2);
  const mono = (f: number): number => {
    let s = 0;
    for (let c = 0; c < channels; ++c) s += b.readInt16LE(dataAt + (f * channels + c) * 2);
    return s / channels;
  };
  for (let i = 0; i < outFrames; ++i) {
    const v = halve ? (mono(2 * i) + mono(2 * i + 1)) / 2 : mono(i);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), 44 + i * 2);
  }
  const outRate = halve ? Math.floor(rate / 2) : rate;
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + outFrames * 2, 4);
  out.write('WAVEfmt ', 8, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(outRate, 24);
  out.writeUInt32LE(outRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(outFrames * 2, 40);
  writeFileSync(dst, out);
}

function copyMusic(): void {
  const src = join(tol, 'Assets/Fantasy Quest & Dungeon Music Pack/Loops');
  const tracks: [string, string][] = [['1. Into the Depths.wav', 'into_the_depths.wav'], ['3. No Turning Back.wav', 'no_turning_back.wav']];
  const dst = join(out, 'music');
  mkdirSync(dst, { recursive: true });
  for (const [from, to] of tracks) {
    const f = join(src, from);
    if (!existsSync(f)) {
      console.warn(`music not found: ${f}; skipped`);
      continue;
    }
    shrinkWav(f, join(dst, to));
    console.log(`music: ${from} -> ${join(dst, to)} (${(statSync(join(dst, to)).size / 1e6).toFixed(1)} MB)`);
  }
}

copyGoblin();
copyMusic();
