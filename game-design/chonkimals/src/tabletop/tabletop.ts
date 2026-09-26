// Tabletop games — toys that set a game up on the ground to challenge someone (Words With
// Friends, Dice With Friends — see games.ts; each game is a TabletopMatch, match.ts). Anyone passing can watch:
// the game plays out on the board itself, the same tiles the players see.
//
//  • You use the toy: the board tips out in front of you and the nearest free camper runs
//    over to take you on. When they sit down you're zoomed in on the board to play.
//  • Bots have every game toy, whenever they like: now and then one sets up and calls a
//    camper nearby over (bot vs bot — you can watch, not join), or, if you're close, sets
//    up and waits for YOU: a "Hey!", a camp-wide message, and a "Play …" button when you
//    walk up. They give up after a while.
//  • Either way, a marker (the game's badge, 📝 / 🎲) points you to that board: pinned to the screen edge (arrowed
//    toward it) while it's off screen, over the board while it's in view but far off.
//
// Local table space: the board is centred on the table's origin; seat 0 on +Z facing −Z,
// seat 1 across on −Z. The human always takes seat 0 (it reads the board upright).

import type { Bot } from '../bots/bot';
import type { BotManager } from '../bots/bot-manager';
import type { TabletopGameId } from '../inventory/items';
import { JoinFeed } from '../lunch/hud';
import { playNoToy } from '../minigame-sounds';
import { playToySound } from '../inventory/toy-sounds';
import { distanceFalloff } from '../sfx-falloff';
import { seededRng } from '../rng';
import { COLORS, FONT } from '../ui/theme';
import { thinkClock, type MoveNote, type Seat, type TabletopMatch } from './match';
import { GAMES, GAME_IDS } from './games';
import { loadDictionary } from './words/dictionary';
import { TABLE_LINES as L, line } from './lines';

type Vector3 = import('three').Vector3;
type Camera = import('three').PerspectiveCamera;

export interface TabletopOptions {
  scene: import('three').Scene;
  container: HTMLElement;
  canvas: HTMLElement;
  bots: BotManager;
  /** Lines said near your board show in its HUD while you play. */
  chat: import('../chat/chat-service').ChatService;
  /** Character scale (boards and seats size with the chonks). */
  charScale(): number;
  /** Ground height under (x, z), looking down from `fromY`. */
  groundAt(x: number, z: number, fromY: number): number | null;
  /** Open ground a board can go on (not water, a minigame's play area…). */
  siteOk(x: number, z: number): boolean;
  player(): { pos: Vector3; yaw: number } | null;
  playerName(): string;
  /** The human is free to be challenged / sit down (roaming camp: no menu, minigame or ride). */
  playerFree(): boolean;
  /** Camp-wide messages are held back (the first-time arrival). */
  quiet(): boolean;
  teleportPlayer(pos: Vector3, yaw: number): void;
  /** The human sat down at (true) / got up from (false) a game: swap the controls over. */
  onHumanSeated(seated: boolean, game: string, leave: () => void, confirmLeave: () => boolean): void;
}

const GAME_NAME = (id: TabletopGameId) => GAMES[id].name;

const BOARD_K = 1.6;           // board side, × character scale
const SEAT_K = 0.58;           // seat distance past the board edge, × character scale
const FLAT = 0.35;             // max ground height spread under a board + its seats
const THINK_MS = 4;            // bots' thinking budget per frame, all tables together
const MAX_BOT_TABLES = 2;
const DECIDE_EVERY = [3, 6] as const;
const START_CHANCE = 0.35;     // per decision tick, while under the table cap
const FIRST_INVITE = 25;       // seconds after boot before a bot first challenges you
const INVITE_GAP = 35;         // …and between one invite ending unanswered and the next
const AFTER_GAME_GAP = 40;     // …or after you finish a game
const INVITE_RETRY = 4;        // nobody idle near you: look again this soon
const INVITE_RANGE = [3.5, 24] as const;
const INVITE_WAIT = 32;        // seconds a bot waits for you before packing up
const HEY_EVERY = 9, HEYS = 3, HEY_RANGE = 25;
const ACCEPT_REACH = 2.6;      // past the board's edge (a bit behind the empty seat)
const HUMAN_WANDER = 14;       // your own board packs up if you walk this far off before it starts
const FIND_FOR = 10;           // seconds to find you an opponent before giving up
const RUN_SPEED = 8.5;         // an opponent running over to your board
const ARRIVE = 0.45, NEAR_ENOUGH = 2.5, WALK_GIVE_UP = 25;
const BOT_PACE = [3, 7] as const, VS_HUMAN_PACE = [2, 5] as const;
const BOT_GAME_MAX = 240;      // bot-only games get called after this long
const OVER_LINGER = 4;         // seconds a finished bot game stays out
const LABEL_RANGE = 24;
const CHAT_RANGE = 22;         // lines said this close to your board show in its HUD (bubbles fade out ~there too)
const SOUND_NEAR = 5, SOUND_FAR = 30;

type Occupant = { bot: Bot; arrived: boolean; walkT: number; retries: number } | 'human';

interface Table {
  game: TabletopGameId;
  match: TabletopMatch;
  size: number;
  center: Vector3;
  yaw: number;
  /** Table-local +Z in world. */
  dir: Vector3;
  seats: [Occupant | null, Occupant | null];
  state: 'waiting' | 'playing' | 'over' | 'packing';
  /** A bot waiting for the human to come and accept. */
  invite: boolean;
  /** The human walked out mid-game (the bot's line is a "rage quit?", not a win). */
  humanLeft: boolean;
  t: number;
  heys: number;
  heyIn: number;
  label: HTMLDivElement;
  labelText: string;
}

export class Tabletop {
  private readonly tables: Table[] = [];
  private readonly feed: JoinFeed;
  private readonly rng = seededRng(0, 'tabletop');
  private readonly raycaster = new THREE.Raycaster();
  private readonly tmp = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private camEase = 0;
  private clock = 0;
  private decideIn: number = DECIDE_EVERY[0];
  private inviteAt = FIRST_INVITE;
  private listener = new THREE.Vector3();
  /** The table the human is at (hosting, accepted, or playing). */
  private humanTable: Table | null = null;
  /** The last site search was turned down by another game being in the way. */
  private crowded = false;
  /** The marker for the game that concerns you (your own board, or an invite). */
  private readonly edge: HTMLDivElement;
  private readonly edgeArrow: HTMLDivElement;
  private readonly edgeBadge: HTMLDivElement;

  constructor(private readonly o: TabletopOptions) {
    this.feed = new JoinFeed(o.container, () => o.quiet());
    void loadDictionary(); // ~0.9 MB: fetch it now so the first game doesn't wait
    this.edge = document.createElement('div');
    this.edge.style.cssText = 'position:absolute;left:0;top:0;width:54px;height:54px;margin:-27px 0 0 -27px;' +
      'z-index:23;pointer-events:none;display:none;';
    this.edgeArrow = document.createElement('div');
    this.edgeArrow.style.cssText = 'position:absolute;inset:0;';
    this.edgeArrow.innerHTML = '<svg viewBox="0 0 54 54" style="width:100%;height:100%;overflow:visible">' +
      `<path d="M27 -9 L37 5 L17 5 Z" fill="${COLORS.brown}"/></svg>`;
    const badge = document.createElement('div');
    badge.style.cssText = `position:absolute;inset:4px;border-radius:50%;background:${COLORS.cream};` +
      `border:3px solid ${COLORS.brown};box-shadow:0 3px 0 ${COLORS.brownDark};display:flex;align-items:center;` +
      'justify-content:center;font-size:22px;';
    this.edgeBadge = badge;
    // A steady pulse (and a glow ring) so "someone wants to play" reads at a glance.
    if (!document.getElementById('cc-tabletop-pulse')) {
      const style = document.createElement('style');
      style.id = 'cc-tabletop-pulse';
      style.textContent = '@keyframes cc-tabletop-pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.18); } }' +
        '@keyframes cc-tabletop-ring { 0% { transform:scale(0.9); opacity:0.75; } 100% { transform:scale(1.7); opacity:0; } }';
      document.head.appendChild(style);
    }
    const ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;inset:4px;border-radius:50%;border:3px solid #ffd23f;' +
      'animation:cc-tabletop-ring 1.1s ease-out infinite;';
    const pulse = document.createElement('div');
    pulse.style.cssText = 'position:absolute;inset:0;animation:cc-tabletop-pulse 1.1s ease-in-out infinite;';
    pulse.append(ring, this.edgeArrow, badge);
    this.edge.append(pulse);
    o.container.appendChild(this.edge);
    o.bots.blockers.push((x, z, fx, fz) => this.crowdBlocks(x, z, fx, fz));
    o.bots.pesterHold = () => !!this.humanTable;
    o.chat.onShow((actor, text, pos) => {
      const t = this.humanTable;
      if (!t || !this.humanSeated || actor.id === 'player' || pos.distanceTo(t.center) > CHAT_RANGE) return;
      const opp = this.botAt(t, 1);
      t.match.chatLine(actor.name, text, !!opp && opp.profile.memberId === actor.id);
    });
  }

  /** The human is sat at a board, zoomed in. */
  get humanSeated(): boolean { return this.humanTable?.state === 'playing' || this.humanTable?.state === 'over'; }

  /** The human's game is still going (leaving would forfeit it). */
  get humanGameLive(): boolean { return this.humanTable?.state === 'playing' && !this.humanTable.match.over; }

  // ── Using a game toy ─────────────────────────────────────────────────

  /** The human used a game toy. Returns false if it can't set up here (the toy just plays). */
  useGameToy(game: TabletopGameId): boolean {
    const own = this.humanTable;
    if (own) {
      if (own.state !== 'waiting') return false;
      this.say(own, 1, L.giveUp);
      this.feed.push(`You packed up ${GAME_NAME(own.game)}.`);
      this.packUp(own);
      return true;
    }
    const p = this.o.player();
    if (!p || !this.o.playerFree()) return false;
    // A bot's already waiting for a challenger right here: that's you.
    const invite = this.tables.find((t) => t.invite && this.edgeDistance(t, p.pos) < ACCEPT_REACH + 2);
    if (invite) { this.accept(invite); return true; }
    const size = this.boardSize, sd = this.seatDist;
    this.crowded = false;
    // You sit in seat 0: the board goes out in front of you (or off to a side if that's blocked).
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
      const yaw = p.yaw + Math.PI + turn;
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const center = p.pos.clone().addScaledVector(dir, -sd);
      const y = this.siteY(center, dir, size);
      if (y === null) continue;
      center.y = y;
      const t = this.makeTable(game, center, yaw);
      t.seats[0] = 'human';
      this.humanTable = t;
      playToySound(GAMES[game].sound, 0.8);
      return true;
    }
    this.feed.push(this.crowded ? 'Too close to another game — find a bit more space.'
      : 'No room to set up a game here — try some open ground.');
    return true;
  }

  /** "Play …" at a bot's waiting board you're standing by. */
  promptFor(pos: Vector3): { label: string; onTap: () => void } | null {
    if (this.humanTable || !this.o.playerFree()) return null;
    const t = this.tables.find((x) => x.invite && x.state === 'waiting' && this.edgeDistance(x, pos) < ACCEPT_REACH);
    if (!t) return null;
    const host = t.seats[1];
    const who = host && host !== 'human' ? ` vs ${host.bot.profile.name}` : '';
    return { label: `Play ${GAME_NAME(t.game)}${who}`, onTap: () => this.accept(t) };
  }

  /** Ground you can't walk onto (any board that's out). Stepping from (fromX, fromZ) away from a
   * board's middle is always allowed, so nobody gets stuck on one laid out under their feet. */
  blocks(x: number, z: number, fromX?: number, fromZ?: number): boolean {
    return this.tables.some((t) => t.state !== 'packing' && this.inBox(t, x, z, t.size / 2 + 0.15, t.size / 2 + 0.15)
      && !this.leaving(t, x, z, fromX, fromZ));
  }

  /** Ground free-roaming bots keep off: the board and both seats (so nobody crowds the players
   * or stands in their view — the seated bots walk in regardless). */
  private crowdBlocks(x: number, z: number, fromX?: number, fromZ?: number): boolean {
    const cs = this.o.charScale();
    return this.tables.some((t) => t.state !== 'packing'
      && this.inBox(t, x, z, t.size / 2 + cs * 0.6, t.size / 2 + cs * (SEAT_K + 0.5)) && !this.leaving(t, x, z, fromX, fromZ));
  }

  /** A step from (fx, fz) to (x, z) heads away from the table's middle. */
  private leaving(t: Table, x: number, z: number, fx?: number, fz?: number): boolean {
    if (fx === undefined || fz === undefined) return false;
    return Math.hypot(x - t.center.x, z - t.center.z) > Math.hypot(fx - t.center.x, fz - t.center.z);
  }

  private inBox(t: Table, x: number, z: number, halfX: number, halfZ: number): boolean {
    const dx = x - t.center.x, dz = z - t.center.z;
    const lz = dx * t.dir.x + dz * t.dir.z, lx = dx * t.dir.z - dz * t.dir.x;
    return Math.abs(lx) < halfX && Math.abs(lz) < halfZ;
  }

  /** Leave your game early (forfeits it). */
  leaveHuman(): void {
    const t = this.humanTable;
    if (!t) return;
    if (t.state === 'playing' && !t.match.over) {
      t.humanLeft = true;
      t.match.forfeit(0);
      this.say(t, 1, L.quit, 0.3);
    }
    this.endHuman(t);
    this.packUp(t);
  }

  /** Where the seated human stands (ground point) and faces. */
  humanSeatPose(): { position: Vector3; facing: number } | null {
    const t = this.humanTable;
    if (!t) return null;
    const pos = this.seatPos(t, 0);
    pos.y = this.o.groundAt(pos.x, pos.z, t.center.y + 3) ?? t.center.y;
    return { position: pos, facing: t.yaw + Math.PI };
  }

  /** The zoomed-in view: looking down on the board from your side, framed between the HUD panels. */
  placeHumanCamera(camera: Camera, dt: number): void {
    const t = this.humanTable;
    if (!t) return;
    this.lastCamera = camera;
    if (this.camEase === 0) { // ease in from wherever the follow cam was
      this.camPos.copy(camera.position);
      camera.getWorldDirection(this.camLook).multiplyScalar(5).add(camera.position);
    }
    const band = t.match.band();
    const fov = 50;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const frac = band ? Math.max(0.3, (band.bottom - band.top) / band.height) : 0.7;
    const S = t.size * 1.12;
    const d = Math.max(S / (2 * tan * frac), S / (2 * tan * camera.aspect));
    // Shift so the board lands in the middle of the band, not the middle of the screen.
    const shift = band ? ((band.top + band.bottom) / 2 - band.height / 2) / band.height * 2 * d * tan : 0;
    const tilt = 0.12; // nearly straight down: nobody standing round the edge gets in the way
    const look = this.tmp.copy(t.center).setY(t.center.y + 0.07).addScaledVector(t.dir, -shift);
    const pos = look.clone().addScaledVector(t.dir, Math.sin(tilt) * d).setY(look.y + Math.cos(tilt) * d);
    this.camEase = Math.min(1, this.camEase + dt / 0.8);
    const k = this.camEase < 1 ? 1 - Math.exp(-6 * dt) : 1;
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
    // Only draw the slab near the ground: trees, roofs and the like overhead would hide the
    // board from straight above; the players (and anyone watching) stay in.
    const near = Math.max(0.1, (d - this.o.charScale() * 1.5) * this.camEase);
    if (this.savedNear === null) this.savedNear = camera.near;
    if (Math.abs(camera.near - near) > 0.01) { camera.near = near; camera.updateProjectionMatrix(); }
  }

  // ── Per frame ────────────────────────────────────────────────────────

  update(dt: number, camera: Camera): void {
    this.clock += dt;
    this.listener.copy(camera.position);
    thinkClock.until = performance.now() + THINK_MS;
    if ((this.decideIn -= dt) <= 0) {
      this.decideIn = this.rng.range(...DECIDE_EVERY);
      this.maybeStartBotGame();
    }
    // Challenges for you run on their own clock (re-armed once nothing's pending for you).
    if (this.inviteAt === Infinity && !this.humanTable && !this.tables.some((t) => t.invite)) this.inviteAt = this.clock + INVITE_GAP;
    if (this.clock > this.inviteAt) this.tryInvite();
    for (let i = this.tables.length - 1; i >= 0; i--) {
      const t = this.tables[i];
      t.t += dt;
      this.updateTable(t, dt);
      t.match.update(dt);
      this.updateLabel(t, camera);
      if (t.state === 'packing' && t.match.view.done) {
        t.match.dispose();
        t.label.remove();
        this.tables.splice(i, 1);
      }
    }
    this.updateEdge(camera);
  }

  /** Points you to your own board (waiting for an opponent) or the nearest board a camper's
   * inviting you to: an arrow on the screen edge while it's off screen, a marker over it while
   * it's in view but too far off for its sign. */
  private updateEdge(camera: Camera): void {
    const p = this.o.player();
    const mine = this.humanTable && !this.humanSeated && this.humanTable.state === 'waiting' ? this.humanTable : null;
    const t = mine ?? (this.o.playerFree() && p ? this.tables.filter((x) => x.invite && x.state === 'waiting')
      .sort((a, b) => a.center.distanceTo(p.pos) - b.center.distanceTo(p.pos))[0] : undefined);
    if (!t) { this.edge.style.display = 'none'; return; }
    if (this.edgeBadge.textContent !== GAMES[t.game].emoji) this.edgeBadge.textContent = GAMES[t.game].emoji;
    const w = this.o.container.clientWidth, h = this.o.container.clientHeight;
    const v = this.tmp.copy(t.center).setY(t.center.y + this.o.charScale() * 0.6).project(camera);
    const behind = v.z > 1;
    const sx = (v.x + 1) * 0.5 * w, sy = (1 - v.y) * 0.5 * h;
    const onScreen = !behind && sx > 30 && sx < w - 30 && sy > 150 && sy < h - 30;
    if (onScreen) {
      // In view: its floating sign does the job up close; further off, a marker over the board.
      if (camera.position.distanceTo(t.center) < LABEL_RANGE) { this.edge.style.display = 'none'; return; }
      this.edge.style.display = 'block';
      this.edge.style.transform = `translate3d(${sx.toFixed(1)}px,${(sy - 34).toFixed(1)}px,0)`;
      this.edgeArrow.style.transform = 'rotate(180deg)'; // pointing down at it
      return;
    }
    // Off screen: pinned to the edge in its direction (flipped when it's behind the camera).
    let dx = v.x * (behind ? -1 : 1), dy = -v.y * (behind ? -1 : 1);
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dy = 1;
    const cx = w / 2, cy = h / 2;
    const k = Math.min((cx - 46) / Math.max(1e-4, Math.abs(dx * cx)), (cy - 46) / Math.max(1e-4, Math.abs(dy * cy)));
    const ex = cx + dx * cx * k, ey = THREE.MathUtils.clamp(cy + dy * cy * k, 190, h - 46);
    this.edge.style.display = 'block';
    this.edge.style.transform = `translate3d(${ex.toFixed(1)}px,${ey.toFixed(1)}px,0)`;
    this.edgeArrow.style.transform = `rotate(${Math.atan2(dx * cx, -dy * cy)}rad)`;
  }

  // ── Debug ────────────────────────────────────────────────────────────

  /** Starts a bot game near the player now (or the human invite with `invite`), of `game` (any). */
  debugStart(invite: boolean, game?: TabletopGameId): void {
    const p = this.o.player();
    if (!p) return;
    const bots = this.o.bots.bots.filter((b) => this.o.bots.isFree(b))
      .sort((a, b) => a.root.position.distanceTo(p.pos) - b.root.position.distanceTo(p.pos));
    for (const host of bots.slice(0, 8)) {
      if (invite ? this.startInvite(host, game) : this.startBotGame(host, bots.filter((b) => b !== host), game)) return;
    }
    this.feed.push('No free spot for a board game nearby');
  }

  // ── Starting games ───────────────────────────────────────────────────

  private maybeStartBotGame(): void {
    if (this.o.quiet() || !this.rng.chance(START_CHANCE)) return;
    const bots = this.o.bots;
    const idle = bots.bots.filter((b) => bots.isFree(b) && b.mode === 'linger' && b.root.visible
      && (bots.spotKind(b) === 'social' || !b.spotId));
    const host = this.rng.weighted(idle, (b) => 0.3 + b.profile.personality.chattiness);
    if (!host) return;
    if (this.tables.filter((t) => !t.seats.includes('human') && !t.invite).length >= MAX_BOT_TABLES) return;
    this.startBotGame(host, idle.filter((b) => b !== host));
  }

  /** A camper idling near you sets up a board and waits for you (chattier and closer ones first). */
  private tryInvite(): void {
    this.inviteAt = this.clock + INVITE_RETRY;
    const p = this.o.player();
    if (!p || this.humanTable || this.o.quiet() || !this.o.playerFree() || this.tables.some((t) => t.invite)) return;
    const bots = this.o.bots;
    const near = bots.bots.filter((b) => {
      const d = b.root.position.distanceTo(p.pos), kind = bots.spotKind(b);
      return bots.isFree(b) && b.mode === 'linger' && b.root.visible && d > INVITE_RANGE[0] && d < INVITE_RANGE[1]
        && kind !== 'minigame_start' && kind !== 'minigame_end';
    });
    for (let i = 0; i < 3 && near.length; i++) {
      const host = this.rng.weighted(near, (b) => (0.3 + b.profile.personality.chattiness) / (4 + b.root.position.distanceTo(p.pos)));
      if (!host) return;
      if (this.startInvite(host)) { this.inviteAt = Infinity; return; }
      near.splice(near.indexOf(host), 1); // no room where that one stands: try another
    }
  }

  /** The host sets up where it stands, in seat 1, and calls the nearest idle bot over. */
  private startBotGame(host: Bot, others: Bot[], game = this.pickGame()): boolean {
    const opp = others.filter((b) => b.root.position.distanceTo(host.root.position) < 16)
      .sort((a, b) => a.root.position.distanceTo(host.root.position) - b.root.position.distanceTo(host.root.position))[0];
    if (!opp) return false;
    const t = this.hostTable(host, game);
    if (!t) return false;
    this.seatBot(t, 0, opp, null);
    this.say(t, 1, L.challenge, 0.2, opp.profile.name);
    return true;
  }

  /** The host sets up and waits for the human. */
  private startInvite(host: Bot, game = this.pickGame()): boolean {
    const t = this.hostTable(host, game);
    if (!t) return false;
    t.invite = true;
    t.heyIn = 0.6;
    return true;
  }

  /** Bots have every game toy: any game, evenly. */
  private pickGame(): TabletopGameId { return this.rng.pick(GAME_IDS); }

  /** A table of `game` in front of `host`, with it sat in seat 1 — or null if there's no room. */
  private hostTable(host: Bot, game: TabletopGameId): Table | null {
    const size = this.boardSize, sd = this.seatDist;
    const at = host.root.position;
    for (const turn of [0, 0.7, -0.7, 1.4, -1.4, Math.PI]) {
      const yaw = host.root.rotation.y + turn;
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const center = at.clone().addScaledVector(dir, sd);
      const y = this.siteY(center, dir, size);
      if (y === null) continue;
      center.y = y;
      const t = this.makeTable(game, center, yaw);
      // It's already standing in its seat.
      this.o.bots.enlist(host);
      t.seats[1] = { bot: host, arrived: true, walkT: 0, retries: 0 };
      host.faceTowards(yaw);
      host.seated = true;
      host.hop();
      this.sound(t, GAMES[game].sound, 0.8);
      return t;
    }
    return null;
  }

  private makeTable(game: TabletopGameId, center: Vector3, yaw: number): Table {
    const size = this.boardSize;
    const match = GAMES[game].create(size, seededRng(Math.floor(this.clock * 1000), `${game}-game`), {
      onMove: (seat, note) => this.onMove(t, seat, note),
      onOver: () => this.onOver(t),
      onHumanDone: () => { this.endHuman(t); this.packUp(t); },
    });
    match.view.root.position.copy(center);
    match.view.root.rotation.y = yaw;
    this.o.scene.add(match.view.root);
    const label = document.createElement('div');
    label.style.cssText = 'position:absolute;left:0;top:0;z-index:22;pointer-events:none;transform:translate(-50%,-100%);' +
      `padding:4px 10px;border-radius:12px;background:rgba(58,36,21,0.82);border:2px solid ${COLORS.brown};color:#fff;` +
      `font-family:${FONT};font-weight:600;font-size:13px;text-align:center;white-space:nowrap;display:none;`;
    this.o.container.appendChild(label);
    this.o.bots.shoo(center, size / 2 + this.seatDist + 1); // anyone stood right there steps off
    const t: Table = {
      game, match, size, center, yaw, dir: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)),
      seats: [null, null], state: 'waiting', invite: false, humanLeft: false, t: 0, heys: 0, heyIn: 0, label, labelText: '',
    };
    this.tables.push(t);
    return t;
  }

  /** Enlists `bot` and walks it to `seat` (`speed` null = its own pace). */
  private seatBot(t: Table, seat: Seat, bot: Bot, speed: number | null): void {
    this.o.bots.enlist(bot);
    t.seats[seat] = { bot, arrived: false, walkT: 0, retries: 0 };
    const out = seat === 0 ? 1 : -1;
    const at = this.seatPos(t, seat);
    this.o.bots.walkTo(bot, at, this.seatYaw(t, seat), speed, at.clone().addScaledVector(t.dir, out * 1.3));
  }

  /** The human takes seat 0 at a bot's waiting board. */
  private accept(t: Table): void {
    if (this.humanTable || !t.invite) return;
    t.invite = false;
    t.seats[0] = 'human';
    this.humanTable = t;
    this.say(t, 1, L.accept, 0.2);
  }

  // ── Running tables ───────────────────────────────────────────────────

  private updateTable(t: Table, dt: number): void {
    for (const s of [0, 1] as const) this.updateSeat(t, s, dt);
    if (t.state !== 'waiting') return;
    const p = this.o.player();
    const human = t.seats[0] === 'human';

    if (t.invite) {
      // Hey! over here!
      const d = p ? p.pos.distanceTo(t.center) : Infinity;
      if ((t.heyIn -= dt) <= 0 && t.heys < HEYS && d < HEY_RANGE && this.hostArrived(t)) {
        t.heyIn = HEY_EVERY;
        const host = this.botAt(t, 1)!;
        playNoToy(distanceFalloff(d, SOUND_NEAR, SOUND_FAR));
        host.hop();
        if (t.heys === 0) {
          this.say(t, 1, L.invite);
          this.feed.push(`${GAMES[t.game].emoji} ${host.profile.name} wants to play ${GAME_NAME(t.game)}! Walk over to accept.`, 5);
        }
        t.heys++;
      }
      if (t.t > INVITE_WAIT) {
        this.say(t, 1, L.giveUp);
        this.inviteAt = this.clock + INVITE_GAP;
        this.packUp(t);
      }
      return;
    }

    if (human) {
      if (!p || p.pos.distanceTo(t.center) > HUMAN_WANDER) {
        this.feed.push(`You packed up ${GAME_NAME(t.game)}.`);
        this.packUp(t);
        return;
      }
      // Your own board: find you an opponent, fast.
      if (!t.seats[1]) {
        if (t.t > FIND_FOR) {
          this.feed.push('Nobody\'s free for a game right now 😔');
          this.packUp(t);
          return;
        }
        const opp = this.o.bots.bots.filter((b) => this.o.bots.isFree(b) && b.root.visible)
          .sort((a, b) => a.root.position.distanceTo(t.center) - b.root.position.distanceTo(t.center))[0];
        if (opp && opp.root.position.distanceTo(t.center) < 70) {
          this.seatBot(t, 1, opp, RUN_SPEED);
          this.say(t, 1, L.accept, 0.5);
          this.feed.push(`${opp.profile.name} accepted your challenge!`);
        }
        return;
      }
    }
    // Everyone's sat down: play (the human only once they're free — not mid-menu).
    const ready = t.seats.every((s) => s === 'human' || (s && s.arrived));
    if (ready && (!human || this.o.playerFree())) this.startPlay(t);
  }

  private updateSeat(t: Table, seat: Seat, dt: number): void {
    const occ = t.seats[seat];
    if (!occ || occ === 'human' || occ.arrived) return;
    const b = occ.bot, at = this.seatPos(t, seat);
    occ.walkT += dt;
    const d = Math.hypot(b.root.position.x - at.x, b.root.position.z - at.z);
    const stopped = b.mode === 'linger';
    if (d < ARRIVE || (stopped && d < NEAR_ENOUGH) || occ.walkT > WALK_GIVE_UP || (stopped && occ.retries >= 2)) {
      at.y = this.o.groundAt(at.x, at.z, t.center.y + 3) ?? b.root.position.y;
      b.placeAt(at, at.y);
      b.faceTowards(this.seatYaw(t, seat));
      b.seated = true;
      b.speedOverride = null;
      occ.arrived = true;
      if (seat === 0 && t.state === 'waiting' && t.seats[1] !== 'human') this.say(t, 0, L.accept, 0.3);
    } else if (stopped) {
      occ.retries++; // stopped short (wedged on something): try again
      this.o.bots.walkTo(b, at, this.seatYaw(t, seat), b.speedOverride);
    }
  }

  private startPlay(t: Table): void {
    t.state = 'playing';
    t.t = 0;
    const name = (s: Seat) => { const o = t.seats[s]; return o === 'human' || !o ? this.o.playerName() || 'You' : o.bot.profile.name; };
    const skill = (s: Seat) => {
      const o = t.seats[s];
      return o === 'human' || !o ? null : 0.35 + 0.65 * o.bot.profile.personality.courseSkill;
    };
    const human = t.seats[0] === 'human';
    // Against you, bots think a bit quicker, and the game runs as long as you like.
    t.match.setPace(human ? VS_HUMAN_PACE : BOT_PACE, human ? Infinity : BOT_GAME_MAX);
    t.match.begin([{ name: name(0), skill: skill(0) }, { name: name(1), skill: skill(1) }]);
    if (!human) return;
    const seat = this.humanSeatPose()!;
    this.o.teleportPlayer(seat.position, seat.facing);
    this.camEase = 0;
    t.match.attachHuman(0, this.o.container, this.o.canvas, (x, y) => this.rayFromClient(x, y));
    this.o.onHumanSeated(true, GAME_NAME(t.game), () => this.leaveHuman(), () => this.humanGameLive);
  }

  private onMove(t: Table, seat: Seat, note: MoveNote): void {
    if (note.sound) this.sound(t, note.sound, 0.45);
    const g = GAMES[t.game], other: Seat = seat === 0 ? 1 : 0;
    const good = note.big || note.huge;
    if (!this.botAt(t, seat)) { // the human moved: the bot across may be impressed
      if (good && this.botAt(t, other) && this.rng.chance(note.huge ? 0.8 : 0.4)) this.say(t, other, L.ouch, 1.2);
      return;
    }
    if (note.huge) this.say(t, seat, g.huge, 0.3);
    else if (note.big && this.rng.chance(0.5)) this.say(t, seat, g.big, 0.4);
    else if (note.stuck && this.rng.chance(0.4)) this.say(t, seat, g.stuck, 0.2);
    else if (good && this.rng.chance(0.35)) this.say(t, other, L.ouch, 1.4);
  }

  private onOver(t: Table): void {
    t.state = 'over';
    t.t = 0;
    const w = t.match.winner;
    for (const s of [0, 1] as const) {
      const b = this.botAt(t, s);
      if (!b || t.humanLeft) continue;
      if (w === null) this.say(t, s, L.draw, 0.8 + s * 0.8);
      else if (w === s) { this.say(t, s, L.win, 0.8); this.o.bots.say(b, '🎉'); b.hop(); }
      else this.say(t, s, L.lose, 1.6);
    }
    if (t.seats[0] === 'human') this.inviteAt = this.clock + AFTER_GAME_GAP;
    // Bot-only games pack away on their own; yours waits for Done.
    if (t.seats[0] !== 'human') window.setTimeout(() => { if (t.state === 'over') this.packUp(t); }, OVER_LINGER * 1000);
  }

  private endHuman(t: Table): void {
    if (this.humanTable !== t) return;
    const seated = this.humanSeated;
    this.humanTable = null;
    if (this.lastCamera && this.savedNear !== null) {
      this.lastCamera.near = this.savedNear;
      this.lastCamera.updateProjectionMatrix();
    }
    this.savedNear = null;
    t.match.detachHuman();
    if (t.seats[0] === 'human') t.seats[0] = null;
    if (seated) this.o.onHumanSeated(false, GAME_NAME(t.game), () => {}, () => false);
  }

  private packUp(t: Table): void {
    if (t.state === 'packing') return;
    if (this.humanTable === t) this.endHuman(t);
    t.state = 'packing';
    t.invite = false;
    t.match.view.packUp();
    const back: Bot[] = [];
    t.seats.forEach((o, i) => {
      if (o && o !== 'human') { o.bot.seated = false; o.bot.speedOverride = null; back.push(o.bot); }
      t.seats[i] = null;
    });
    // Linger a beat (a last line, the board folding away) before wandering off.
    window.setTimeout(() => this.o.bots.returnBots(back), 900);
  }

  // ── Labels, lines, sounds ────────────────────────────────────────────

  private updateLabel(t: Table, camera: Camera): void {
    const el = t.label;
    const at = this.tmp.copy(t.center).setY(t.center.y + this.o.charScale() * 1.9);
    const far = camera.position.distanceTo(t.center) > LABEL_RANGE;
    if (far || t.state === 'packing' || (this.humanTable === t && this.humanSeated)) { el.style.display = 'none'; return; }
    at.project(camera);
    if (at.z > 1 || Math.abs(at.x) > 1.1 || Math.abs(at.y) > 1.1) { el.style.display = 'none'; return; }
    const w = this.o.container.clientWidth, h = this.o.container.clientHeight;
    el.style.display = 'block';
    el.style.left = `${((at.x + 1) / 2) * w}px`;
    el.style.top = `${((1 - at.y) / 2) * h}px`;
    const host = this.botAt(t, 1);
    const status = t.state === 'waiting'
      ? t.invite ? `${host?.profile.name ?? 'Someone'} wants to play!` : t.seats[0] === 'human' && !t.seats[1] ? 'Finding a challenger…' : 'Setting up…'
      : t.match.scoreLine() + (t.state === 'over' ? ' · GG!' : '');
    const text = `${GAMES[t.game].emoji} ${GAME_NAME(t.game)}\n${status}`;
    if (text !== t.labelText) {
      t.labelText = text;
      el.innerHTML = '';
      const [a, b] = text.split('\n');
      const top = document.createElement('div');
      top.textContent = a;
      top.style.cssText = 'font-size:11px;opacity:0.85;';
      const bottom = document.createElement('div');
      bottom.textContent = b;
      el.append(top, bottom);
    }
  }

  private say(t: Table, seat: Seat, pool: readonly string[], delay = 0, name = ''): void {
    const b = this.botAt(t, seat);
    if (!b) return;
    const g = GAMES[t.game];
    const text = line(pool, (n) => Math.floor(this.rng.range(0, n)), { name, game: g.name, emoji: g.emoji });
    window.setTimeout(() => this.o.bots.say(b, text), delay * 1000);
  }

  private sound(t: Table, s: 'tiles' | 'dice', vol: number): void {
    const v = distanceFalloff(this.listener.distanceTo(t.center), SOUND_NEAR, SOUND_FAR) * vol;
    if (v > 0.02) playToySound(s, v);
  }

  // ── Geometry ─────────────────────────────────────────────────────────

  private get boardSize(): number { return this.o.charScale() * BOARD_K; }
  private get seatDist(): number { return this.boardSize / 2 + this.o.charScale() * SEAT_K; }

  private seatPos(t: Table, seat: Seat): Vector3 {
    const sd = t.size / 2 + this.o.charScale() * SEAT_K;
    return t.center.clone().addScaledVector(t.dir, seat === 0 ? sd : -sd);
  }

  private seatYaw(t: Table, seat: Seat): number { return seat === 0 ? t.yaw + Math.PI : t.yaw; }

  private botAt(t: Table, seat: Seat): Bot | null {
    const o = t.seats[seat];
    return o && o !== 'human' ? o.bot : null;
  }

  private hostArrived(t: Table): boolean {
    const o = t.seats[1];
    return !!o && o !== 'human' && o.arrived;
  }

  /** How far `p` is outside the board's square (0 or less = over it). */
  private edgeDistance(t: Table, p: Vector3): number {
    const dx = p.x - t.center.x, dz = p.z - t.center.z;
    const lz = Math.abs(dx * t.dir.x + dz * t.dir.z), lx = Math.abs(dx * t.dir.z - dz * t.dir.x);
    const h = t.size / 2;
    return Math.hypot(Math.max(0, lx - h), Math.max(0, lz - h));
  }

  /** Ground height for a board centred at `center` (+ both seats), or null if it doesn't fit there
   * (`crowded` says whether another game was in the way). */
  private siteY(center: Vector3, dir: Vector3, size: number): number | null {
    const sd = size / 2 + this.o.charScale() * SEAT_K;
    // Each table's reach, seats and chonks included, can't overlap another's.
    for (const t of this.tables) {
      if (t.state !== 'packing' && t.center.distanceTo(center) < (t.size + size) / 2 + 2 * this.o.charScale() * SEAT_K + 1) {
        this.crowded = true;
        return null;
      }
    }
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    const pts: [number, number][] = [[0, 0], [sd, 0], [-sd, 0]];
    for (const a of [-1, 1]) for (const b of [-1, 1]) pts.push([a * size / 2, b * size / 2]);
    let lo = Infinity, hi = -Infinity;
    for (const [along, across] of pts) {
      const x = center.x + dir.x * along + side.x * across, z = center.z + dir.z * along + side.z * across;
      if (!this.o.siteOk(x, z)) return null;
      const y = this.o.groundAt(x, z, center.y + 3);
      if (y === null) return null;
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return hi - lo <= FLAT ? hi : null;
  }

  /** The camera ray through a screen point (client px), for the seated human's taps. */
  private rayFromClient(x: number, y: number): import('three').Ray | null {
    const cam = this.lastCamera;
    if (!cam) return null;
    const r = this.o.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), cam);
    return this.raycaster.ray.clone();
  }

  /** The camera the human's taps are picked with (the zoomed-in one). */
  private lastCamera: Camera | null = null;
  /** Its near plane from before you sat down (the seated view clips everything overhead). */
  private savedNear: number | null = null;
}
