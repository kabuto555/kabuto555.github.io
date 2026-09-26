// Shared game types for ApeStrike: Guardian of the Stars

export type WeaponType = 'vulcan' | 'missile' | 'beam' | 'sword';

export interface WeaponState {
  type: WeaponType;
  level: number; // 1–5
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  level: number;
  exp: number;
  expToNext: number;
  score: number;
  weapons: WeaponState[];        // active weapon slots (first is primary)
  activeWeaponIndex: number;
  invincibleTimer: number;       // seconds of i-frames after hit
  damageMultiplier: number;      // scales with level
}

export interface GameState {
  phase: 'title' | 'playing' | 'dead' | 'stageClear' | 'paused';
  stageIndex: number;
  player: PlayerState;
}
