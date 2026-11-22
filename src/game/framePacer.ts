// Frame pacing for battery (director, Nov 22: the iPhone drains faster than Unreal games). Phaser redraws everything every vsync by default;
// on touch devices the loop is capped (30 fps) and drops further while the game is paused and untouched, and to almost nothing while a
// full-screen DOM page (title, saves, Temple) covers the canvas. Desktop keeps the uncapped loop unless ?fps=N asks for a cap.
import type Phaser from 'phaser';

export type PaceMode = 'active' | 'idle' | 'covered';
export const kIdleFps = 8;      // paused and untouched for a moment: only hover and toasts still move
export const kCoveredFps = 2;   // hidden behind a full-screen page
/** A limit a hair under the target survives the one-frame jitter of a 60 Hz or 120 Hz display (a 33.3 ms gap must not fall short of 33.4). */
const kSlack = 1.03;

export class FramePacer {
  private mode: PaceMode = 'active';
  private lastInput = performance.now();

  constructor(private readonly game: Phaser.Game, readonly activeFps: number) {
    // Any touch, click or key puts the loop back to full pace at once (the next vsync), not after the slow frame in flight.
    const poke = (): void => this.poke();
    for (const e of ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel']) window.addEventListener(e, poke, { passive: true });
  }

  /** True when the loop has a cap to adjust (touch devices, or ?fps=N). */
  get enabled(): boolean { return this.game.loop.hasFpsLimit; }
  /** Milliseconds since the last touch, click or key. */
  sinceInput(): number { return performance.now() - this.lastInput; }

  poke(): void {
    this.lastInput = performance.now();
    this.set('active');
  }

  set(mode: PaceMode): void {
    if (!this.enabled || mode === this.mode) return;
    this.mode = mode;
    const fps = mode === 'active' ? this.activeFps : mode === 'idle' ? kIdleFps : kCoveredFps;
    (this.game.loop as unknown as { _limitRate: number })._limitRate = 1000 / (fps * kSlack);
  }
}
