// One Dice With Friends match at a table: the game, the tray and scorecard on the ground, and
// whoever's in the two seats — bots (a beat between each roll, hold and pick, like a person
// thinking) and at most one human (who gets the HUD). The table manager (tabletop.ts)
// seats everyone and handles the camp side.

import type { Rng } from '../../rng';
import { DiceGame } from './game';
import { DiceView } from './dice-view';
import { DiceHud } from './dice-hud';
import { chooseCategory, chooseHolds } from './bot-ai';
import { LABEL, UPPER, type Category } from './rules';
import type { Band, MatchHooks, MatchPlayer, Seat, TabletopMatch } from '../match';

type Ray = import('three').Ray;

/** A bot's beats, as a share of the table's pace (which is per whole move in word games). */
const BEAT = 0.3, HOLD_BEAT = 0.5;

export class DiceMatch implements TabletopMatch {
  readonly view: DiceView;
  game: DiceGame | null = null;
  private players: [MatchPlayer, MatchPlayer] | null = null;
  private hud: DiceHud | null = null;
  private humanSeat: Seat | null = null;
  private pace: readonly [number, number] = [3, 6];
  private maxSeconds = Infinity;
  private age = 0;
  private overSent = false;
  private rolling = false;
  /** A bot's next action is due when this runs out; `rollNext` = it's just set its holds. */
  private botWait = 1;
  private rollNext = false;

  constructor(size: number, private readonly rng: Rng, private readonly hooks: MatchHooks) {
    this.view = new DiceView(size);
  }

  get over(): boolean { return !!this.game?.over; }
  get winner(): Seat | null { return this.game?.winner ?? null; }

  setPace(pace: readonly [number, number], maxSeconds: number): void {
    this.pace = pace;
    this.maxSeconds = maxSeconds;
  }

  begin(players: [MatchPlayer, MatchPlayer]): void {
    this.players = players;
    this.game = new DiceGame([players[0].name, players[1].name], this.rng);
    this.botWait = this.beat();
    this.syncCard();
  }

  attachHuman(seat: Seat, host: HTMLElement, _canvas: HTMLElement, _ray: (x: number, y: number) => Ray | null): void {
    const g = this.game;
    if (!g) return;
    this.humanSeat = seat;
    this.hud = new DiceHud(host, g, seat, {
      onRoll: () => { if (g.turn === seat && !this.rolling) this.doRoll(seat); },
      onHold: (i, on) => {
        if (g.turn !== seat || this.rolling) return;
        g.setHeld(i, on);
        this.view.setHeld(g.held, seat);
        this.hud?.refresh();
      },
      onScore: (cat) => { if (g.turn === seat && !this.rolling) this.doScore(seat, cat); },
      onDone: () => this.hooks.onHumanDone(),
    });
    this.hud.rolling = this.rolling;
  }

  detachHuman(): void {
    this.hud?.dispose();
    this.hud = null;
    this.humanSeat = null;
  }

  band(): Band | null { return this.hud?.freeBand() ?? null; }
  chatLine(name: string, text: string, opponent: boolean): void { this.hud?.chatLine(name, text, opponent); }

  forfeit(seat: Seat): void {
    this.game?.forfeit(seat);
    this.checkOver();
  }

  update(dt: number): void {
    this.view.update(dt);
    const g = this.game;
    if (!g || g.over) return;
    if (this.rolling && !this.view.busy) {
      this.rolling = false;
      if (this.hud) { this.hud.rolling = false; this.hud.refresh(); }
      const d = g.dice;
      if (d.every((v) => v === d[0]) && g.turn === this.humanSeat) this.hud?.message('Five of a kind! 🎲🎲🎲', 2);
    }
    this.age += dt;
    if (this.age > this.maxSeconds) { g.endNow(); this.checkOver(); return; }
    const p = this.players![g.turn];
    if (p.skill === null || this.rolling || (this.botWait -= dt) > 0) return;
    this.botStep(g.turn, p.skill);
  }

  scoreLine(): string {
    const g = this.game;
    return g ? `${g.players[0].name} ${g.players[0].score} – ${g.players[1].score} ${g.players[1].name}` : '';
  }

  resultFor(seat: Seat): { title: string; subtitle: string } {
    const g = this.game!;
    const me = g.players[seat], them = g.players[seat === 0 ? 1 : 0];
    const title = g.winner === null ? 'It\'s a draw!' : g.winner === seat ? 'You win! 🎉' : `${them.name} wins!`;
    return { title, subtitle: `You ${me.score} – ${them.score} ${them.name}` };
  }

  dispose(): void {
    this.detachHuman();
    this.view.dispose();
  }

  // ── Turns ──────────────────────────────────────────────────────────────

  private beat(k = BEAT): number { return this.rng.range(...this.pace) * k; }

  /** A bot's next move: roll, set its holds (then roll again), or pick a box. */
  private botStep(seat: Seat, skill: number): void {
    const g = this.game!, card = g.players[seat].card;
    this.botWait = this.beat();
    if (!g.rolled || this.rollNext) { this.rollNext = false; this.doRoll(seat); return; }
    if (g.rollsLeft > 0) {
      const holds = chooseHolds(g.dice, g.rollsLeft, card, skill, this.rng);
      if (!holds.every(Boolean)) {
        holds.forEach((h, i) => g.setHeld(i, h));
        this.view.setHeld(g.held, seat);
        this.rollNext = true;
        this.botWait = this.beat(HOLD_BEAT * BEAT);
        return;
      }
    }
    this.doScore(seat, chooseCategory(g.dice, card, skill, this.rng));
  }

  private doRoll(seat: Seat): void {
    const g = this.game!;
    const rolled = g.roll();
    if (!rolled) return;
    this.view.roll(rolled, g.dice, seat);
    this.rolling = true;
    if (this.hud) { this.hud.rolling = true; this.hud.refresh(); }
    this.hooks.onMove(seat, { sound: 'dice' });
  }

  private doScore(seat: Seat, cat: Category): void {
    const g = this.game!;
    if (!g.score(cat)) return;
    const t = g.lastTurn!;
    this.view.setHeld([false, false, false, false, false], seat);
    this.syncCard();
    this.hud?.refresh();
    const face = UPPER.indexOf(cat) + 1;
    const huge = (cat === 'yahtzee' && t.score === 50) || t.yahtzeeBonus;
    const big = huge || t.score >= 25 || (face > 0 && t.score >= face * 4);
    this.hooks.onMove(seat, { huge, big, stuck: t.score === 0 });
    if (seat === this.humanSeat) {
      if (huge) this.hud?.message('YAHTZEE! 🎉🎲', 2.4);
      else if (t.score === 0) this.hud?.message(`0 in ${LABEL[cat]} 😬`, 1.6);
    }
    this.botWait = this.beat();
    this.checkOver();
  }

  private syncCard(): void {
    const g = this.game!;
    this.view.setCard([g.players[0].name, g.players[1].name], [g.players[0].card, g.players[1].card],
      [g.players[0].score, g.players[1].score], g.over ? null : g.turn);
  }

  private checkOver(): void {
    const g = this.game;
    if (!g?.over || this.overSent) return;
    this.overSent = true;
    this.syncCard();
    if (this.hud && this.humanSeat !== null) {
      const r = this.resultFor(this.humanSeat);
      this.hud.refresh();
      this.hud.showResult(r.title, r.subtitle);
    }
    this.hooks.onOver();
  }
}
