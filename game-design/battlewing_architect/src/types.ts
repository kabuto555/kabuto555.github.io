// ─── Core Types ──────────────────────────────────────────────────────────────
// v4

export type WeaponType = 'gun' | 'laser' | 'beam' | 'mine' | 'missile' | 'funnel' | 'rock' | 'homing';

export interface Weapon {
  type: WeaponType;
  /** Which block index within the piece carries the weapon (0-based) */
  blockIndex: number;
}

/** A single block's position relative to piece origin, in grid units */
export interface BlockOffset {
  col: number;
  row: number;
}

/** A tetromino or smaller piece definition */
export interface PieceDef {
  /** All block offsets making up this piece */
  blocks: BlockOffset[];
  /** One weapon per piece initially; bonus tiles can add a second */
  weapons: Weapon[];
  /** 0 | 1 | 2 | 3 — current rotation state */
  rotation: number;
}

/** A placed piece on the ship grid */
export interface PlacedPiece {
  /** Grid column of the piece's origin block (top-left of bounding box) */
  gridCol: number;
  /** Grid row of the piece's origin block */
  gridRow: number;
  blocks: BlockOffset[];   // already rotated
  /** Up to one weapon per block; bonus tiles can add extras */
  weapons: Weapon[];
}

/** Game-wide persistent state passed between scenes */
export interface GameState {
  /** All pieces permanently placed on the player's ship */
  placedPieces: PlacedPiece[];
  /** Grid position of the player's permanent core block */
  coreCol: number;
  coreRow: number;
  /** Current round / level (starts at 1) */
  round: number;
  /** How many pieces the enemy will have this round */
  enemyPieceCount: number;
  /** Player HP */
  playerHp: number;
  /** Max player HP */
  playerMaxHp: number;
  /** Live grid dimensions — grow over time */
  gridCols: number;
  gridRows: number;
  /** Lives remaining for the whole run */
  lives: number;
  /** Live cell size in pixels (shrinks as grid grows to keep same pixel area) */
  cellSize: number;
  /**
   * Player weapon unlock order: always [gun, laser, ...shuffled rest].
   * Weapon at index i unlocks at round i+1.
   * Generated once at game start; survives respawn; re-generated on full reset.
   */
  playerWeaponOrder: WeaponType[];
  /** Enemy weapon unlock order — independent shuffle, same structure. */
  enemyWeaponOrder: WeaponType[];
}

/** A live projectile during battle */
export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  weaponType: WeaponType;
  ownedByPlayer: boolean;
}

/** A ship block during battle (with HP) */
export interface BattleBlock {
  worldX: number;
  worldY: number;
  hp: number;
  maxHp: number;
  weapon: Weapon | null;
  isPlayer: boolean;
}
