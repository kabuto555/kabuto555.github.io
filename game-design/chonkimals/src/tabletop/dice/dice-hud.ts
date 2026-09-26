// The Dice With Friends controls for the human at the tray (the zoomed-in view), in the shared
// table frame: your five dice (tap to hold / let go between rolls), Roll and Score, and the
// scorecard — both columns, with what the dice would score in each of your open boxes. Tap a
// box, then Score. The match owns the game; this just asks for rolls, holds and a box.

import { CATEGORIES, LABEL, LOWER, UPPER, upperBonus, upperTotal, type Category } from './rules';
import type { DiceGame } from './game';
import type { Band, Seat } from '../match';
import { TableHud, div, enable, hudButton } from '../table-hud';

export interface DiceHudHandlers {
  onRoll(): void;
  onHold(i: number, on: boolean): void;
  onScore(cat: Category): void;
  onDone(): void;
}

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** A die face drawn in DOM (a 3×3 grid of pips). */
function dieFace(value: number, size: number, faded: boolean, held: boolean): HTMLDivElement {
  const d = div(`width:${size}px;height:${size}px;border-radius:${size * 0.2}px;background:${held ? '#fff3a0' : '#fbf8f1'};` +
    `box-shadow:0 3px 0 #b8a98a${held ? ',0 0 0 3px #ffd23f' : ''};display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);` +
    `padding:${size * 0.14}px;box-sizing:border-box;opacity:${faded ? 0.35 : 1};transform:${held ? 'translateY(-6px)' : 'none'};` +
    'transition:transform .12s;cursor:pointer;touch-action:manipulation;');
  for (let i = 0; i < 9; i++) {
    const on = PIPS[value]?.includes(i);
    d.appendChild(div(`margin:auto;width:${size * 0.17}px;height:${size * 0.17}px;border-radius:50%;` +
      `background:${on ? (value === 1 ? '#d9483f' : '#2b2320') : 'transparent'};`));
  }
  return d;
}

export class DiceHud {
  /** Dice are tumbling (the buttons wait, and the dice show last roll's faces until they land). */
  rolling = false;
  private readonly frame: TableHud;
  private readonly diceRow: HTMLDivElement;
  private readonly roll: HTMLButtonElement;
  private readonly scoreBtn: HTMLButtonElement;
  private readonly sheet: HTMLDivElement;
  private selected: Category | null = null;

  constructor(host: HTMLElement, private readonly game: DiceGame, private readonly seat: Seat,
    private readonly handlers: DiceHudHandlers) {
    this.frame = new TableHud(host, seat);
    this.diceRow = div('display:flex;justify-content:center;gap:8px;min-height:58px;align-items:flex-end;padding-top:4px;');
    const btns = div('display:flex;gap:6px;');
    this.roll = hudButton('Roll', () => { this.selected = null; this.handlers.onRoll(); });
    this.scoreBtn = hudButton('Score', () => this.scoreTap(), true);
    btns.append(this.roll, this.scoreBtn);
    this.sheet = div('display:grid;grid-template-columns:1fr 1fr;gap:0 10px;font-size:13px;');
    this.frame.bottom.append(this.diceRow, btns, this.sheet);
    this.refresh();
  }

  freeBand(): Band { return this.frame.freeBand(); }
  message(text: string, seconds?: number): void { this.frame.message(text, seconds); }
  chatLine(name: string, text: string, opponent: boolean): void { this.frame.chatLine(name, text, opponent); }
  showResult(title: string, subtitle: string): void { this.frame.showResult(title, subtitle, () => this.handlers.onDone()); }
  dispose(): void { this.frame.dispose(); }

  private get myTurn(): boolean { return !this.game.over && this.game.turn === this.seat; }

  refresh(): void {
    const g = this.game;
    if (!this.myTurn || !g.rolled) this.selected = null;
    this.frame.setPlayers(g.players, g.over ? null : g.turn);
    this.frame.setMiddle(`🎲 ${g.round}/${CATEGORIES.length}`);
    this.frame.setStatus(this.statusText());
    this.renderDice();
    this.renderButtons();
    this.renderSheet();
  }

  private statusText(): string {
    const g = this.game;
    if (g.over) return 'Game over';
    const last = g.lastTurn;
    const who = (s: Seat) => (s === this.seat ? 'You' : g.players[s].name);
    const prev = last ? `${who(last.seat)} scored ${last.score} in ${LABEL[last.cat]}${last.yahtzeeBonus ? ' (+100!)' : ''} · ` : '';
    if (!this.myTurn) return `${prev}${g.players[g.turn].name} is rolling…`;
    if (this.rolling) return 'Rolling…';
    if (!g.rolled) return `${prev}Your turn — roll!`;
    if (g.rollsLeft === 0) return 'Pick a box to score';
    return `Tap dice to hold · ${g.rollsLeft} roll${g.rollsLeft === 1 ? '' : 's'} left`;
  }

  private renderDice(): void {
    const g = this.game, mine = this.myTurn;
    const size = Math.max(40, Math.min(52, Math.floor(((this.frame.bottom.clientWidth || 360) - 60) / 5.6)));
    this.diceRow.innerHTML = '';
    g.dice.forEach((v, i) => {
      const faded = !g.rolled || this.rolling;
      const held = g.held[i] && g.rolled;
      const face = dieFace(v, size, faded, held);
      if (mine && g.rolled && g.rollsLeft > 0 && !this.rolling) {
        face.addEventListener('click', () => this.handlers.onHold(i, !g.held[i]));
      } else face.style.cursor = 'default';
      this.diceRow.appendChild(face);
    });
  }

  private renderButtons(): void {
    const g = this.game, mine = this.myTurn && !this.rolling;
    this.roll.textContent = !this.myTurn ? 'Roll' : g.rolled ? `Roll · ${g.rollsLeft} left` : 'Roll!';
    enable(this.roll, mine && g.rollsLeft > 0);
    const pts = this.selected ? g.potential(this.selected) : null;
    this.scoreBtn.textContent = this.selected && pts !== null ? `Score ${pts} · ${LABEL[this.selected]}` : 'Score';
    enable(this.scoreBtn, mine && g.rolled && !!this.selected);
    // Nothing left to roll: nudge toward the card.
    this.scoreBtn.style.flex = g.rollsLeft === 0 ? '2 1 0' : '1.3 1 0';
  }

  /** Both columns: upper boxes (+ bonus) on the left, lower on the right. */
  private renderSheet(): void {
    const g = this.game, me = g.players[this.seat], them = g.players[this.seat === 0 ? 1 : 0];
    const canPick = this.myTurn && g.rolled && !this.rolling;
    this.sheet.innerHTML = '';
    const col = (cats: readonly Category[], extra?: HTMLDivElement) => {
      const c = div('display:flex;flex-direction:column;gap:2px;');
      const head = div('display:grid;grid-template-columns:1fr 34px 34px;font-size:11px;opacity:0.75;padding:0 4px;');
      head.append(div(''), div('text-align:center;', 'You'),
        div('text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', them.name.slice(0, 5)));
      c.appendChild(head);
      for (const k of cats) {
        const mineVal = me.card[k], theirs = them.card[k];
        const pot = mineVal === undefined && canPick ? g.potential(k) : null;
        const sel = this.selected === k;
        const row = div(`display:grid;grid-template-columns:1fr 34px 34px;align-items:center;padding:2px 4px;border-radius:7px;` +
          `min-height:22px;background:${sel ? 'rgba(255,210,63,0.35)' : pot !== null ? 'rgba(255,255,255,0.08)' : 'transparent'};` +
          `cursor:${pot !== null ? 'pointer' : 'default'};`);
        row.append(
          div('font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', LABEL[k]),
          div(`text-align:center;font-weight:700;${pot !== null ? `color:${pot > 0 ? '#b8f59a' : '#c9b9a6'};font-style:italic;` : ''}`,
            mineVal !== undefined ? String(mineVal) : pot !== null ? String(pot) : ''),
          div('text-align:center;opacity:0.8;', theirs !== undefined ? String(theirs) : ''),
        );
        if (pot !== null) row.addEventListener('click', () => { this.selected = sel ? null : k; this.renderButtons(); this.renderSheet(); });
        c.appendChild(row);
      }
      if (extra) c.appendChild(extra);
      return c;
    };
    const bonus = div('display:grid;grid-template-columns:1fr 34px 34px;align-items:center;padding:2px 4px;min-height:22px;' +
      'font-size:12px;opacity:0.85;');
    const b = (card: typeof me.card) => (upperBonus(card) ? '+35' : `${upperTotal(card)}/63`);
    bonus.append(div('font-weight:600;', 'Bonus'), div('text-align:center;', b(me.card)), div('text-align:center;', b(them.card)));
    this.sheet.append(col(UPPER, bonus), col(LOWER));
  }

  private scoreTap(): void {
    if (!this.selected || !this.myTurn) return;
    const cat = this.selected;
    this.selected = null;
    this.handlers.onScore(cat);
  }
}
