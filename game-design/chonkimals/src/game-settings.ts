// Player-facing settings (the Settings screen edits these). Persisted locally via
// storage.ts; systems read `gameSettings.get()` or subscribe to changes.

import { storageGet, storageSet } from './storage';

export interface GameSettings {
  /** 0..1 — background music level (music.ts; the default plays it at a quarter volume). */
  musicVolume: number;
  /** 0..1 — scales every synth SFX. */
  sfxVolume: number;
  /** 0..1 slider, 0.5 = default drag-orbit speed (maps to 0.4×..1.6×). */
  cameraSensitivity: number;
  screenShake: boolean;
  /** 'high' = everything (post-FX, grass + flowers, pollen, birds, butterflies, full campfire);
   * 'medium' = post-FX + flowers, birds, butterflies, campfire light (no grass tufts / pollen);
   * 'low' = plain render, no world dressing or critters, half the clouds (older phones). */
  graphics: GraphicsLevel;
  showNames: boolean;
  chatBubbles: boolean;
  /** Show the floating joystick at its resting spot (off = it only appears under your thumb). */
  showJoystick: boolean;
  /** Keep UI clear of the notch / status bar: 'auto' assumes a margin on phones that report none. */
  safeArea: 'off' | 'auto' | 'extra';
  playerName: string;
  /** Chosen chonk (Character Select / FTUE id, see CHONK_SPECIES). */
  character: string;
}

export type GraphicsLevel = 'low' | 'medium' | 'high';

export const DEFAULT_SETTINGS: GameSettings = {
  musicVolume: 0.75,
  sfxVolume: 0.9,
  cameraSensitivity: 0.5,
  screenShake: true,
  graphics: 'high',
  showNames: true,
  chatBubbles: true,
  showJoystick: true,
  safeArea: 'auto',
  playerName: 'poopy pants',
  character: 'froggo',
};

const KEY = 'chonk.settings.v1';
type Listener = (s: GameSettings) => void;

class SettingsStore {
  private value: GameSettings = { ...DEFAULT_SETTINGS, ...storageGet<Partial<GameSettings>>(KEY, {}) };
  private listeners = new Set<Listener>();

  get(): GameSettings { return this.value; }

  set(patch: Partial<GameSettings>): void {
    this.value = { ...this.value, ...patch };
    storageSet(KEY, this.value);
    this.listeners.forEach((l) => l(this.value));
  }

  reset(): void { this.set({ ...DEFAULT_SETTINGS }); }

  /** Calls `l` now and on every change; returns an unsubscribe. */
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.value);
    return () => this.listeners.delete(l);
  }
}

export const gameSettings = new SettingsStore();

/** Drag-orbit multiplier for the camera-sensitivity slider. */
export const cameraSensitivityScale = (v: number): number => 0.4 + v * 1.2;
