// The saved meta in the browser (FTolMetaStore): one localStorage key, a corrupt save kept beside it. Storage can be missing or throw
// (private windows, blocked site data); the game then plays with progress kept for the session only.
import type { MetaStore } from '../core/runManager';

const kKey = 'blessed-company.meta';

export class LocalMetaStore implements MetaStore {
  private memory: string | undefined;

  load(): string | undefined {
    try {
      return window.localStorage.getItem(kKey) ?? undefined;
    } catch {
      return this.memory;
    }
  }

  save(text: string): void {
    this.memory = text;
    try {
      window.localStorage.setItem(kKey, text);
    } catch {
      /* session only */
    }
  }

  keepCorrupt(text: string): void {
    try {
      window.localStorage.setItem(`${kKey}.corrupt`, text);
    } catch {
      /* ignore */
    }
  }

  clear(): void {
    this.memory = undefined;
    try {
      window.localStorage.removeItem(kKey);
    } catch {
      /* ignore */
    }
  }
}

const kSettingsKey = 'blessed-company.settings';
export interface Settings { volume: number }

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(kSettingsKey);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      if (typeof s.volume === 'number') return { volume: Math.min(1, Math.max(0, s.volume)) };
    }
  } catch {
    /* defaults */
  }
  return { volume: 1 };   // times the Unreal base volume 0.5
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(kSettingsKey, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Testing builds: the pause menu's tuning values (director, Nov 20: set them over several playtests, then lock them in at once). One
 *  key for the whole browser, shared by every save slot. Values are by tuning id; unknown ids are ignored when read back. */
const kTuningKey = 'blessed-company.tuning';

export function loadTuning(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(kTuningKey);
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function saveTuning(values: Record<string, number>): void {
  try {
    if (Object.keys(values).length === 0) window.localStorage.removeItem(kTuningKey);
    else window.localStorage.setItem(kTuningKey, JSON.stringify(values));
  } catch {
    /* kept for this session only */
  }
}
