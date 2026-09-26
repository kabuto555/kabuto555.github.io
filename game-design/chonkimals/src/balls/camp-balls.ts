// Big camp balls — a beach ball on the beach, a soccer ball by the campfire — that anyone
// kicks just by running into them (Destiny-style): no button, the harder you hit it the
// further it goes. Bots bump them too as they wander, and now and then a camper or two come
// over for a kick-about (passing it between them). A ball that ends up far from home (or bobbing in the lake) with
// nobody touching it for a while pops away and drops back in at home.
//
// Hand-rolled: gravity, bounce, rolling friction and downhill roll on the ground raycast;
// floating on water; ground that steps up sharply (walls, benches, props) or off-limits
// areas bounce it back.

import type { BotManager } from '../bots/bot-manager';
import type { Bot } from '../bots/bot';
import { seededRng } from '../rng';
import { distanceFalloff } from '../sfx-falloff';
import { beachBallMesh, soccerBallMesh } from './ball-models';

type Vector3 = import('three').Vector3;
type Mesh = import('three').Mesh;

export interface BallKind {
  name: string;
  mesh(): Mesh;
  /** × character scale. */
  radius: number;
  gravity: number;
  /** Per-second velocity decay in the air / while rolling. */
  airDrag: number;
  rollFriction: number;
  /** Vertical restitution. */
  bounce: number;
  /** Kick speed per unit of approach speed, the least a kick gives, and its pop upward. */
  kick: number;
  minKick: number;
  lift: number;
  maxSpeed: number;
  /** Respawns once this far from home (world) and left alone. */
  wander: number;
  /** Bots' lines when they run over to kick it. */
  lines: readonly string[];
  sound(volume: number): void;
}

/** Anyone who can kick: their feet position, body radius and height (world). */
export interface Kicker { id: string; feet: Vector3; radius: number; height: number; }

export interface CampBallsOptions {
  scene: import('three').Scene;
  charScale(): number;
  groundAt(x: number, z: number, fromY: number): number | null;
  /** Water surface height at (x, z), or null for dry land. */
  waterAt(x: number, z: number): number | null;
  /** Off-limits ground the ball bounces off (minigame areas, the fire…). */
  blocked(x: number, z: number): boolean;
  /** Fills `out` with everyone who could kick this frame. */
  kickers(out: Kicker[]): void;
  /** Where sound is heard from. */
  listener(): Vector3;
  bots?: BotManager | null;
}

const STEP_UP = 0.55;          // ground rising more than this in one move is a wall
const KICK_APPROACH = 1.2;     // closing speed (u/s) that counts as a kick, not a nudge
const KICK_COOLDOWN = 0.3;
const RESPAWN_IDLE = 12;       // seconds untouched before a wandered-off ball goes home
const WATER_GIVE_UP = 8;       // …or bobbing in the water this long
const TIDY_UP = 45;            // any ball left sitting away from home this long goes back (where campers find it)
const TIDY_DIST = 6;
const POP = 0.35;              // seconds to pop away / back in
const SOUND_NEAR = 6, SOUND_FAR = 35;
// Bots having a kick-about: now and then an idle camper nearby comes over and plays for a bit
// (a second may join — then they pass it between them).
const PLAY_EVERY = [4, 9] as const;
const PLAY_RANGE = 18, PLAY_CHANCE = 0.35, JOIN_CHANCE = 0.55, MAX_PLAYERS = 2;
const PLAY_FOR = [10, 25] as const;
const PLAY_SPEED = 7.5;
const REPLAN = 2.2;            // seconds before a player re-aims at a ball that's moved on

interface Player { bot: Bot; left: number; replan: number; }

interface Ball {
  kind: BallKind;
  mesh: Mesh;
  home: Vector3;
  pos: Vector3;
  vel: Vector3;
  grounded: boolean;
  idle: number;
  wet: number;
  /** 1 = full size; animates through 0 on a respawn. */
  scale: number;
  phase: 'live' | 'out' | 'in';
  cooldown: Map<string, number>;
  /** Ground height under it (from the last move's ray) and the slope it last rolled over. */
  groundY: number | null;
  slope: number;
  playIn: number;
  players: Player[];
}

export class CampBalls {
  private readonly balls: Ball[] = [];
  private readonly kickerList: Kicker[] = [];
  private readonly lastFeet = new Map<string, Vector3>();
  private readonly kickVel = new Map<string, Vector3>();
  private readonly rng = seededRng(0, 'camp-balls');
  private readonly axis = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly still = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly o: CampBallsOptions) {}

  /** Puts a ball out at `home` (world XZ; dropped onto the ground there). */
  add(kind: BallKind, home: Vector3): void {
    const mesh = kind.mesh();
    mesh.name = `ball_${kind.name}`;
    this.o.scene.add(mesh);
    const r = kind.radius * this.o.charScale();
    const h = home.clone();
    h.y = (this.o.groundAt(h.x, h.z, h.y + 10) ?? h.y) + r; // `home` comes at about ground height
    this.balls.push({
      kind, mesh, home: h, pos: h.clone(), vel: new THREE.Vector3(), grounded: true, idle: 0, wet: 0,
      scale: 1, phase: 'live', cooldown: new Map(), groundY: null, slope: 0, playIn: this.rng.range(...PLAY_EVERY), players: [],
    });
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.trackKickers(dt);
    for (const b of this.balls) {
      const r = b.kind.radius * this.o.charScale();
      for (const [id, t] of b.cooldown) { if (t <= dt) b.cooldown.delete(id); else b.cooldown.set(id, t - dt); }
      if (b.phase === 'live') {
        // Fast balls take a few smaller steps so they can't skip through a wall.
        if (!this.asleep(b, r)) {
          const n = Math.min(4, Math.max(1, Math.ceil((b.vel.length() * dt) / (r * 0.5))));
          for (let i = 0; i < n; i++) this.step(b, dt / n, r);
          this.kicks(b, r);
        }
        this.maybeRespawn(b, dt);
      } else this.pop(b, dt, r);
      this.play(b, dt, r);
      b.mesh.position.copy(b.pos);
      b.mesh.scale.setScalar(r * Math.max(0.001, b.scale));
    }
  }

  // ── Physics ──────────────────────────────────────────────────────────

  private step(b: Ball, dt: number, r: number): void {
    const k = b.kind, p = b.pos, v = b.vel;
    // Ground under the ball: carried over from the last step (one ray per move, not per query).
    const ground = b.groundY ?? this.o.groundAt(p.x, p.z, p.y + 6);
    const water = this.o.waterAt(p.x, p.z);
    const floating = water !== null && (ground === null || ground < water) && p.y - r < water + r * 0.2;
    b.wet = floating ? b.wet + dt : 0;
    if (floating) {
      // Bob on the surface, drifting to a stop.
      const target = water! + r * 0.25;
      v.y += ((target - p.y) * 28 - v.y * 5) * dt;
      const d = Math.exp(-1.4 * dt);
      v.x *= d; v.z *= d;
    } else {
      v.y -= k.gravity * dt;
      if (b.grounded) {
        // Downhill roll along the way it's going (the slope it just rolled over); slow on gentle
        // ground it settles instead — much grippier, no creep down camp's slight slopes forever.
        const speed = Math.hypot(v.x, v.z);
        const slow = speed < 1.2 && Math.abs(b.slope) < 0.18;
        if (!slow && speed > 1e-3 && Math.abs(b.slope) < 1.5) {
          const a = -k.gravity * b.slope * 0.55 * dt;
          v.x += (v.x / speed) * a; v.z += (v.z / speed) * a;
        }
        const f = Math.exp(-k.rollFriction * (slow ? 4 : 1) * dt);
        v.x *= f; v.z *= f;
        if (slow && Math.hypot(v.x, v.z) < 0.12) { v.x = 0; v.z = 0; }
      }
    }
    v.multiplyScalar(Math.exp(-k.airDrag * dt));
    const sp = Math.hypot(v.x, v.z);
    if (sp > k.maxSpeed) { v.x *= k.maxSpeed / sp; v.z *= k.maxSpeed / sp; }

    // Across: walls (sharp step-ups) and off-limits ground bounce it back, one axis at a time.
    const base = ground ?? p.y - r;
    const probe = (x: number, z: number): number | null | 'wall' => {
      if (this.o.blocked(x, z)) return 'wall';
      const g = this.o.groundAt(x, z, p.y + 6);
      return g !== null && g > base + STEP_UP && g > p.y - r + STEP_UP ? 'wall' : g;
    };
    const x0 = p.x, z0 = p.z;
    let g: number | null = ground;
    if (sp * dt > 1e-4) {
      const nx = p.x + v.x * dt, nz = p.z + v.z * dt;
      const hit = probe(nx, nz);
      if (hit !== 'wall') { p.x = nx; p.z = nz; g = hit; } else {
        const hx = probe(nx, p.z);
        if (hx !== 'wall') { p.x = nx; g = hx; } else v.x *= -0.45;
        const hz = probe(p.x, nz);
        if (hz !== 'wall') { p.z = nz; g = hz; } else v.z *= -0.45;
      }
    }
    const moved = Math.hypot(p.x - x0, p.z - z0);
    if (moved > 1e-4 && g !== null && ground !== null) b.slope = (g - ground) / moved;
    b.groundY = g;

    // Down: land and bounce.
    p.y += v.y * dt;
    b.grounded = false;
    if (g !== null && !floating && p.y - r <= g + 0.02) {
      p.y = g + r;
      if (v.y < 0) v.y = -v.y * k.bounce;
      if (v.y < 1.2) { v.y = 0; b.grounded = true; }
    }

    // Roll: turn about the axis across the direction of travel.
    if (moved > 1e-5) {
      this.axis.set(p.x - x0, 0, p.z - z0).normalize();
      this.axis.set(this.axis.z, 0, -this.axis.x);
      b.mesh.quaternion.premultiply(this.q.setFromAxisAngle(this.axis, moved / r));
    }
  }

  /** At rest with nobody close enough to touch it: skip the physics (and its raycasts). */
  private asleep(b: Ball, r: number): boolean {
    if (!b.grounded || b.vel.lengthSq() > 1e-6 || b.wet > 0) return false;
    return !this.kickerList.some((kk) => Math.hypot(b.pos.x - kk.feet.x, b.pos.z - kk.feet.z) < r + kk.radius + 1.5);
  }

  /** Anyone overlapping the ball kicks it (running into it) or just shoulders it aside. */
  private kicks(b: Ball, r: number): void {
    const k = b.kind;
    for (const kk of this.kickerList) {
      const dx = b.pos.x - kk.feet.x, dz = b.pos.z - kk.feet.z;
      const d = Math.hypot(dx, dz), R = r + kk.radius;
      if (d >= R || d < 1e-4) continue;
      if (kk.feet.y > b.pos.y + r * 0.7 || kk.feet.y + kk.height < b.pos.y - r) continue; // passing over / under
      const nx = dx / d, nz = dz / d;
      const kv = this.kickVel.get(kk.id) ?? this.still;
      const approach = (kv.x - b.vel.x) * nx + (kv.z - b.vel.z) * nz;
      // Out of the way first.
      b.pos.x += nx * (R - d);
      b.pos.z += nz * (R - d);
      b.groundY = null;
      if (approach > KICK_APPROACH && !b.cooldown.has(kk.id)) {
        const speed = Math.min(k.maxSpeed, Math.max(k.minKick, approach * k.kick));
        b.vel.x = nx * speed * 0.8 + kv.x * 0.3;
        b.vel.z = nz * speed * 0.8 + kv.z * 0.3;
        b.vel.y = Math.max(b.vel.y, k.lift * (0.35 + 0.65 * Math.min(1, approach / 9)));
        b.grounded = false;
        b.cooldown.set(kk.id, KICK_COOLDOWN);
        b.idle = 0;
        k.sound(distanceFalloff(this.o.listener().distanceTo(b.pos), SOUND_NEAR, SOUND_FAR) * Math.min(1, 0.4 + approach / 10));
      } else {
        // Rolled into someone standing still: bounces off them.
        const vn = b.vel.x * nx + b.vel.z * nz;
        if (vn < 0) { b.vel.x -= nx * vn * 1.4; b.vel.z -= nz * vn * 1.4; }
      }
    }
  }

  /** Kickers' speeds, from how far their feet moved since last frame (teleports ignored). */
  private trackKickers(dt: number): void {
    this.kickerList.length = 0;
    this.o.kickers(this.kickerList);
    for (const kk of this.kickerList) {
      const last = this.lastFeet.get(kk.id);
      let v = this.kickVel.get(kk.id);
      if (!v) this.kickVel.set(kk.id, (v = new THREE.Vector3()));
      if (last) {
        const dx = kk.feet.x - last.x, dz = kk.feet.z - last.z;
        if (Math.hypot(dx, dz) > 3) v.set(0, 0, 0);
        else v.lerp(this.tmp.set(dx / dt, 0, dz / dt), 1 - Math.exp(-20 * dt));
        last.copy(kk.feet);
      } else this.lastFeet.set(kk.id, kk.feet.clone());
    }
  }

  // ── Respawning ───────────────────────────────────────────────────────

  private maybeRespawn(b: Ball, dt: number): void {
    b.idle += dt;
    const off = Math.hypot(b.pos.x - b.home.x, b.pos.z - b.home.z);
    const lost = b.pos.y < b.home.y - 25; // fell off the world
    if (lost || ((off > b.kind.wander || b.wet > WATER_GIVE_UP) && b.idle > RESPAWN_IDLE)
      || (off > TIDY_DIST && b.idle > TIDY_UP && b.players.length === 0)) b.phase = 'out';
  }

  private pop(b: Ball, dt: number, r: number): void {
    if (b.phase === 'out') {
      b.scale -= dt / POP;
      if (b.scale > 0) return;
      // Back home, dropping in from a little above.
      b.scale = 0;
      b.pos.copy(b.home).setY(b.home.y + r * 2.5);
      b.vel.set(0, 0, 0);
      b.idle = 0; b.wet = 0;
      b.groundY = null; b.grounded = false;
      b.phase = 'in';
    } else {
      b.scale = Math.min(1, b.scale + dt / POP);
      if (b.scale >= 1) b.phase = 'live';
    }
  }

  // ── Bots coming over to kick it ──────────────────────────────────────

  private play(b: Ball, dt: number, r: number): void {
    const bots = this.o.bots;
    if (!bots) return;
    // Done playing: time's up, the ball's gone off home, or it's wandered too far.
    const tooFar = Math.hypot(b.pos.x - b.home.x, b.pos.z - b.home.z) > b.kind.wander * 0.8;
    b.players = b.players.filter((p) => {
      p.left -= dt;
      if (p.left > 0 && b.phase === 'live' && !tooFar) return true;
      bots.returnBots([p.bot]);
      return false;
    });
    for (const p of b.players) {
      p.replan -= dt;
      if (p.bot.mode === 'linger' || p.replan <= 0) this.lineUp(b, p, r);
    }
    if ((b.playIn -= dt) > 0) return;
    b.playIn = this.rng.range(...PLAY_EVERY);
    if (b.phase !== 'live' || tooFar || b.players.length >= MAX_PLAYERS) return;
    if (!this.rng.chance(b.players.length ? JOIN_CHANCE : PLAY_CHANCE)) return;
    const near = bots.bots.filter((bot) => bots.isFree(bot) && bot.mode === 'linger' && bot.root.visible
      && bot.root.position.distanceTo(b.pos) < PLAY_RANGE);
    const bot = near.length ? this.rng.pick(near) : null;
    if (!bot) return;
    bots.enlist(bot);
    const p: Player = { bot, left: this.rng.range(...PLAY_FOR), replan: 0 };
    b.players.push(p);
    this.lineUp(b, p, r);
    if (this.rng.chance(0.5)) bots.say(bot, this.rng.pick(b.kind.lines));
  }

  /** Sends a player round behind the ball and through it: toward their teammate if there is
   * one (a pass), else back toward the ball's home (keeping the game where it belongs). */
  private lineUp(b: Ball, p: Player, r: number): void {
    p.replan = REPLAN;
    const bot = p.bot, at = bot.root.position;
    const mate = b.players.find((o) => o !== p)?.bot.root.position;
    const goal = (mate ?? b.home).clone();
    goal.x += this.rng.range(-3, 3); goal.z += this.rng.range(-3, 3);
    const dir = goal.sub(b.pos).setY(0);
    if (dir.lengthSq() < 1) dir.set(this.rng.range(-1, 1), 0, this.rng.range(-1, 1));
    dir.normalize();
    const behind = b.pos.clone().addScaledVector(dir, -(r + 1));
    const through = b.pos.clone().addScaledVector(dir, r + 1.6);
    const path = [behind, through];
    // On the wrong side: go round it rather than kick it backwards.
    const side = (at.x - b.pos.x) * dir.x + (at.z - b.pos.z) * dir.z;
    if (side > -r) {
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      if ((at.x - b.pos.x) * perp.x + (at.z - b.pos.z) * perp.z < 0) perp.negate();
      path.unshift(b.pos.clone().addScaledVector(perp, r + 1.8));
    }
    bot.speedOverride = PLAY_SPEED;
    bot.travel(path, null, 1e9);
  }
}

// ── The two balls ────────────────────────────────────────────────────────

export function beachBall(sound: (v: number) => void): BallKind {
  return {
    name: 'beach', mesh: beachBallMesh, radius: 0.72, gravity: 9, airDrag: 0.45, rollFriction: 0.9, bounce: 0.62,
    kick: 1.25, minKick: 4, lift: 7.5, maxSpeed: 14, wander: 26,
    lines: ['BEACH BALL!! 🏖️', 'incoming 🏐', 'heads up!!', 'boop 🌊'], sound,
  };
}

export function soccerBall(sound: (v: number) => void): BallKind {
  return {
    name: 'soccer', mesh: soccerBallMesh, radius: 0.42, gravity: 20, airDrag: 0.08, rollFriction: 0.55, bounce: 0.45,
    kick: 1.45, minKick: 5, lift: 4.5, maxSpeed: 22, wander: 22,
    lines: ['GOOOAL ⚽', 'pass it!!', 'mine mine mine', 'watch this ⚽'], sound,
  };
}
