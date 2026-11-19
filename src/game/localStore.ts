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
  return { volume: 0.5 };
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(kSettingsKey, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
