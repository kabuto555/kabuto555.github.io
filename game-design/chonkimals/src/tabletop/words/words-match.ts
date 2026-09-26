// One Words With Friends match at a table: the game, the board on the ground, and whoever's
// in the two seats — bots (thinking a few ms a frame, then taking their pick) and at most
// one human (who gets the HUD). The table (tabletop.ts) seats everyone, handles the camp
// side (walking over, banter, packing away) and asks this for the rest.

import type { Rng } from '../../rng';
import { WordsGame } from './game';
import { WordsBoardView } from './board-view';
import { WordsHud } from './words-hud';
import { chooseMove, searchMoves, swapPick, type BotMove } from './bot-ai';
import { dictionaryReady, loadDictionary } from './dictionary';
import type { Placement } from './rules';
import { thinkClock, type Band, type MatchHooks, type MatchPlayer, type Seat, type TabletopMatch } from '../match';

type Ray = import('three').Ray;

interface Think {
  seat: Seat;
  gen: Generator<void, BotMove[]>;
  moves: BotMove[] | null;
  /** Seconds left of looking thoughtful before it may play. */
  wait: number;
}

export class WordsMatch implements TabletopMatch {
  readonly view: WordsBoardView;
  game: WordsGame | null = null;
  private players: [MatchPlayer, MatchPlayer] | null = null;
  private think: Think | null = null;
  private hud: WordsHud | null = null;
  private humanSeat: Seat | null = null;
  private age = 0;
  private overSent = false;
  /** The latest play's tiles (highlighted on the board until the next play). */
  private lastPlay: Placement[] | null = null;

  /** Seconds a bot takes over a turn. */
  private pace: readonly [number, number] = [3, 6];
  /** Called at this length (seconds) — bot-only games, so tables turn over. */
  private maxSeconds = Infinity;

  constructor(size: number, private readonly rng: Rng, private readonly hooks: MatchHooks) {
    this.view = new WordsBoardView(size);
    void loadDictionary();
  }

  setPace(pace: readonly [number, number], maxSeconds: number): void {
    this.pace = pace;
    this.maxSeconds = maxSeconds;
  }

  get over(): boolean { return !!this.game?.over; }
  get started(): boolean { return !!this.game; }

  begin(players: [MatchPlayer, MatchPlayer]): void {
    this.players = players;
    this.game = new WordsGame([players[0].name, players[1].name], this.rng);
    this.view.setRack(0, this.game.players[0].rack);
    this.view.setRack(1, this.game.players[1].rack);
  }

  /** Gives the human in `seat` the controls (squares are picked along the camera `ray`). */
  attachHuman(seat: Seat, host: HTMLElement, canvas: HTMLElement, ray: (x: number, y: number) => Ray | null): void {
    const g = this.game;
    if (!g) return;
    this.humanSeat = seat;
    this.hud = new WordsHud(host, canvas, g, seat, {
      cellFromClient: (x, y) => this.cellAlong(ray(x, y)),
      onPendingChange: (p) => this.showPending(p),
      onPlay: (pl) => this.humanPlay(pl),
      onSwap: (tiles) => { if (g.swap(tiles)) this.moved(seat, 'swap', 0, false); else this.hud?.message('Can\'t swap that many'); },
      onPass: () => { g.pass(); this.moved(seat, 'pass', 0, false); },
      onDone: () => this.hooks.onHumanDone(),
    });
  }

  detachHuman(): void {
    this.hud?.dispose();
    this.hud = null;
    this.view.setPending([]);
    if (this.game && this.humanSeat !== null) this.view.setRack(this.humanSeat, this.game.players[this.humanSeat].rack);
    this.humanSeat = null;
  }

  /** A chat line for the human's HUD (no-op without one). */
  chatLine(name: string, text: string, opponent: boolean): void { this.hud?.chatLine(name, text, opponent); }

  /** Screen band the HUD leaves for the board (for framing the human's camera). */
  band(): Band | null { return this.hud?.freeBand() ?? null; }

  /** The square a camera ray hits on the board's top, or null. */
  private cellAlong(ray: Ray | null): [number, number] | null {
    if (!ray || Math.abs(ray.direction.y) < 1e-4) return null;
    const root = this.view.root;
    const top = root.getWorldPosition(new THREE.Vector3()).y + this.view.surfaceY;
    const k = (top - ray.origin.y) / ray.direction.y;
    if (k < 0) return null;
    const hit = ray.origin.clone().addScaledVector(ray.direction, k);
    return this.view.cellAt(root.worldToLocal(hit));
  }

  forfeit(seat: Seat): void {
    this.game?.forfeit(seat);
    this.checkOver();
  }

  update(dt: number): void {
    this.view.update(dt);
    const g = this.game;
    if (!g || g.over) return;
    this.age += dt;
    if (this.age > this.maxSeconds) { g.endNow(); this.checkOver(); return; }
    const p = this.players![g.turn];
    if (p.skill === null || this.view.busy) return;
    if (!this.think || this.think.seat !== g.turn) {
      if (!dictionaryReady()) return; // still downloading
      this.think = { seat: g.turn, gen: searchMoves(g.board, g.players[g.turn].rack), moves: null, wait: this.rng.range(...this.pace) };
    }
    const t = this.think;
    t.wait -= dt;
    while (!t.moves && performance.now() < thinkClock.until) {
      const r = t.gen.next();
      if (r.done) t.moves = r.value;
    }
    if (!t.moves || t.wait > 0) return;
    this.think = null;
    this.botMove(g.turn, p.skill, t.moves);
  }

  /** The in-world sign's line: both names and scores. */
  scoreLine(): string {
    const g = this.game;
    return g ? `${g.players[0].name} ${g.players[0].score} – ${g.players[1].score} ${g.players[1].name}` : '';
  }

  /** The result as `seat` sees it. */
  resultFor(seat: Seat): { title: string; subtitle: string } {
    const g = this.game!;
    const me = g.players[seat], them = g.players[seat === 0 ? 1 : 0];
    const title = g.winner === null ? 'It\'s a draw!' : g.winner === seat ? 'You win! 🎉' : `${them.name} wins!`;
    return { title, subtitle: `You ${me.score} – ${them.score} ${them.name}` };
  }

  /** Who won (null = draw / not over). */
  get winner(): Seat | null { return this.game?.winner ?? null; }

  dispose(): void {
    this.detachHuman();
    this.view.dispose();
  }

  // ── Moves ──────────────────────────────────────────────────────────────

  private botMove(seat: Seat, skill: number, moves: BotMove[]): void {
    const g = this.game!;
    const pick = chooseMove(moves, skill, this.rng.range(0, 1));
    if (pick) {
      const res = g.play(pick.placements);
      if (res.ok) {
        this.view.flyIn(seat, pick.placements);
        this.moved(seat, 'play', res.score, res.bingo, pick.placements);
        return;
      }
    }
    // Nothing playable: swap the clunkers if the bag allows, else pass.
    const swap = swapPick(g.players[seat].rack).slice(0, g.bagCount);
    if (swap.length && g.swap(swap)) this.moved(seat, 'swap', 0, false);
    else { g.pass(); this.moved(seat, 'pass', 0, false); }
  }

  private humanPlay(pl: Placement[]): void {
    const g = this.game!, seat = this.humanSeat!;
    const res = g.play(pl);
    if (!res.ok) {
      this.hud?.message(res.error);
      if (this.hud) this.hud.pending = pl;
      this.hud?.refresh();
      return;
    }
    this.moved(seat, 'play', res.score, res.bingo, pl);
    if (res.bingo) this.hud?.message(`BINGO! +${res.score} 🎉`, 2.4);
    else if (res.score >= 30) this.hud?.message(`+${res.score}! 🔥`, 1.6);
  }

  private moved(seat: Seat, kind: 'play' | 'swap' | 'pass', score: number, bingo: boolean, pl?: Placement[]): void {
    const g = this.game!;
    if (kind === 'play' && pl) this.lastPlay = pl;
    this.view.syncBoard(g.board, this.lastPlay);
    for (const s of [0, 1] as const) if (s !== this.humanSeat) this.view.setRack(s, g.players[s].rack);
    this.hud?.refresh();
    this.hooks.onMove(seat, kind === 'play' ? { sound: 'tiles', big: score >= 30, huge: bingo } : { stuck: true });
    this.checkOver();
  }

  private showPending(p: readonly Placement[]): void {
    const g = this.game;
    if (!g || this.humanSeat === null) return;
    this.view.setPending(p);
    const out = new Set(p.map((x) => x.tile.id));
    this.view.setRack(this.humanSeat, g.players[this.humanSeat].rack.filter((t) => !out.has(t.id)));
  }

  private checkOver(): void {
    const g = this.game;
    if (!g?.over || this.overSent) return;
    this.overSent = true;
    this.think = null;
    if (this.hud && this.humanSeat !== null) {
      const r = this.resultFor(this.humanSeat);
      this.hud.refresh();
      this.hud.showResult(r.title, r.subtitle);
    }
    this.hooks.onOver();
  }
}
