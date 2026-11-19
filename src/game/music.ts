// Music (ATolHUD::UpdateMusic): "Into the Depths" everywhere except a running run on floor 10 or higher, which plays "No Turning Back".
// A change fades the old track out over 0.8 s and the new one in over 1 s to 0.5 (times the volume setting). The tracks load after the
// game starts (they are big for a phone), and only if `npm run assets` put them in public/assets/vendor; otherwise the game is silent.
import Phaser from 'phaser';

const kTracks = ['music_depths', 'music_boss'] as const;
const kFiles = ['into_the_depths.wav', 'no_turning_back.wav'];
const kBaseVolume = 0.5;

export class Music {
  private current: Phaser.Sound.BaseSound | undefined;
  private track = -1;
  private loaded = new Set<number>();
  private volume: number;

  constructor(private readonly scene: Phaser.Scene, volume: number) {
    this.volume = volume;
    void this.loadAvailable();
  }

  private async loadAvailable(): Promise<void> {
    const base = `${import.meta.env.BASE_URL}assets/vendor/music/`;
    let queued = 0;
    for (let i = 0; i < kTracks.length; ++i) {
      try {
        // The dev server answers a missing file with index.html, so check the type before handing the URL to the loader.
        const r = await fetch(base + kFiles[i], { method: 'HEAD' });
        if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('audio')) continue;
      } catch {
        continue;
      }
      this.scene.load.audio(kTracks[i], base + kFiles[i]);
      ++queued;
    }
    if (queued === 0) return;
    this.scene.load.on(Phaser.Loader.Events.FILE_COMPLETE, (key: string) => {
      const i = kTracks.indexOf(key as (typeof kTracks)[number]);
      if (i >= 0) this.loaded.add(i);
      this.track = -1;   // pick the track again now that it exists
    });
    this.scene.load.start();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  /** Each playing track's volume is its fade (0..1) times 0.5 times the setting. */
  private fades = new Map<Phaser.Sound.BaseSound, { f: number }>();
  private applyVolume(): void {
    for (const [s, fade] of this.fades) (s as Phaser.Sound.WebAudioSound).setVolume(fade.f * kBaseVolume * this.volume);
  }

  private fade(s: Phaser.Sound.BaseSound, to: number, ms: number, done?: () => void): void {
    let f = this.fades.get(s);
    if (!f) { f = { f: 0 }; this.fades.set(s, f); }
    this.scene.tweens.killTweensOf(f);
    this.scene.tweens.add({ targets: f, f: to, duration: ms, onUpdate: () => this.applyVolume(), onComplete: () => { this.applyVolume(); done?.(); } });
  }

  getVolume(): number { return this.volume; }

  /** Per frame: the track the game wants now. */
  update(runActive: boolean, floor: number): void {
    const want = runActive && floor >= 10 ? 1 : 0;
    if (want === this.track && this.current?.isPlaying) return;
    if (!this.loaded.has(want)) return;
    if (this.scene.sound.locked) return;   // browsers start audio only after the first tap or key; Phaser unlocks on it
    this.track = want;
    const old = this.current;
    if (old) this.fade(old, 0, 800, () => { this.fades.delete(old); old.destroy(); });
    const s = this.scene.sound.add(kTracks[want], { loop: true, volume: 0 });
    s.play();
    this.fade(s, 1, 1000);
    this.current = s;
  }
}
