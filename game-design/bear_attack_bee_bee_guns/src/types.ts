// ─── Game Types ───────────────────────────────────────────────────────────────

export type EnemyType = 'melee' | 'ranged';
export type EnemyState = 'idle' | 'patrol' | 'chase' | 'attack' | 'slowed' | 'dead';
export type BeeState = 'idle' | 'flying' | 'returning';

export interface Enemy {
  sprite: Phaser.Physics.Arcade.Sprite;
  type: EnemyType;
  state: EnemyState;
  hp: number;
  maxHp: number;
  slowTimer: number;       // ms remaining on slow debuff (0 = not slowed)
  hpFrac: number;          // fractional HP accumulator for smooth DoT
  attackCooldown: number;
  patrolOriginX: number;
  patrolOriginY: number;
  hpBar: Phaser.GameObjects.Graphics;
  slowIcon: Phaser.GameObjects.Text;
}

export interface Cage {
  sprite: Phaser.GameObjects.Sprite;
  opened: boolean;
  critter: Phaser.GameObjects.Text;       // flies out on rescue
  critterIcon: Phaser.GameObjects.Text;  // visible inside cage, bobbing
  helpBubble: Phaser.GameObjects.Graphics;
  helpText: Phaser.GameObjects.Text;
}

export interface BeeSwarm {
  dots: Phaser.GameObjects.Arc[];
  path: Phaser.Math.Vector2[];
  state: BeeState;
  pathIndex: number;
  speed: number;
  sourceX: number;
  sourceY: number;
  slot: 0 | 1;   // which paw slot (0 = left, 1 = right)
}

export interface Projectile {
  sprite: Phaser.Physics.Arcade.Sprite;
  vx: number;
  vy: number;
}

export type BossState = 'dormant' | 'awakening' | 'active' | 'dead';

export type BossAttackType = 'projectile' | 'artillery' | 'timebomb' | 'slash';

export interface BossHead {
  name: string;           // 'elon' | 'zuck' | 'sam' | 'jeff'
  label: string;          // display name
  attackType: BossAttackType;
  attackColor: number;    // logo colour
  attackIcon: string;     // emoji hint in telegraph
  cooldown: number;       // ms remaining
  cooldownMax: number;    // ms between attacks
  exprIdx: number;        // current expression index (0-4)
  exprTimer: number;      // ms until next expression change
}

export interface BossTimeBomb {
  sprite: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  timer: number;          // ms until detonation
  radius: number;         // blast radius
  warned: boolean;        // has flashed warning
}

export interface Boss {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hpFrac: number;
  state: BossState;
  sprite: Phaser.GameObjects.Graphics;  // drawn each frame
  hpBar: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  awakenTimer: number;    // ms left in awakening animation
  pulseT: number;         // time accumulator for blob pulse
  heads: BossHead[];
  timeBombs: BossTimeBomb[];
  slashGraphic: Phaser.GameObjects.Graphics | null;
  slashTimer: number;
  stunTimer: number;      // ms of stun (from bee damage)
}

export interface GameState {
  bearHp: number;
  bearMaxHp: number;
  cagesTotal: number;
  cagesRescued: number;
  levelComplete: boolean;
  gameOver: boolean;
  drawing: boolean;
  drawPath: Phaser.Math.Vector2[];
  stage: number;  // 1 = forest/lumberjack, 2 = city
}
