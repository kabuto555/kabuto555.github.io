// The Words With Friends controls for the human at the board (the zoomed-in view): scores
// and whose turn along the top, your rack and Shuffle / Swap / Pass·Recall / Play along
// the bottom. Tiles go down by tapping one then a square, or dragging it onto the board;
// tap a tile you've put down to take it back. The table owns the game — this only arranges
// your move and hands it over.

import { FONT } from '../../ui/theme';
import { LETTER_VALUES, evaluate, type Placement, type Tile } from './rules';
import type { WordsGame } from './game';
import type { Band, Seat } from '../match';
import { PANEL, TableHud, div, enable, hudButton } from '../table-hud';

export interface WordsHudHandlers {
  /** The square under a screen point (client px), or null. */
  cellFromClient(x: number, y: number): [number, number] | null;
  onPendingChange(pending: readonly Placement[]): void;
  onPlay(pending: Placement[]): void;
  onSwap(tiles: Tile[]): void;
  onPass(): void;
  onDone(): void;
}

const TAP_SLOP = 10;

export class WordsHud {
  pending: Placement[] = [];
  private readonly frame: TableHud;
  private readonly bottom: HTMLDivElement;
  private readonly rackRow: HTMLDivElement;
  private readonly btns: { shuffle: HTMLButtonElement; swap: HTMLButtonElement; third: HTMLButtonElement; play: HTMLButtonElement };
  private order: number[] = [];
  private selected: number | null = null;
  private swapping: Set<number> | null = null;
  private drag: { id: number; x: number; y: number; ghost: HTMLDivElement | null } | null = null;
  private canvasDown: { x: number; y: number } | null = null;
  private readonly off: (() => void)[] = [];

  constructor(
    host: HTMLElement,
    canvas: HTMLElement,
    private readonly game: WordsGame,
    private readonly seat: Seat,
    private readonly handlers: WordsHudHandlers,
  ) {
    this.frame = new TableHud(host, seat);
    this.bottom = this.frame.bottom;
    // Bottom: the rack, then the buttons.
    this.rackRow = div('display:flex;justify-content:center;gap:5px;min-height:48px;touch-action:none;');
    const btnRow = div('display:flex;gap:6px;');
    this.btns = {
      shuffle: hudButton('🔀', () => this.shuffle()),
      swap: hudButton('Swap', () => this.swapTap()),
      third: hudButton('Pass', () => this.thirdTap()),
      play: hudButton('Play', () => this.playTap(), true),
    };
    btnRow.append(this.btns.shuffle, this.btns.swap, this.btns.third, this.btns.play);
    this.btns.shuffle.style.flex = '0 0 50px';
    this.btns.play.style.flex = '1.6 1 0';
    this.bottom.append(this.rackRow, btnRow);

    const listen = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, type: K, f: (e: HTMLElementEventMap[K]) => void) => {
      t.addEventListener(type, f as EventListener);
      this.off.push(() => t.removeEventListener(type, f as EventListener));
    };
    listen(canvas, 'pointerdown', (e) => { this.canvasDown = { x: e.clientX, y: e.clientY }; });
    listen(canvas, 'pointerup', (e) => {
      const d = this.canvasDown;
      this.canvasDown = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP) this.boardTap(e.clientX, e.clientY);
    });
    listen(window, 'pointermove', (e) => this.dragMove(e));
    listen(window, 'pointerup', (e) => this.dragEnd(e));
    listen(window, 'pointercancel', () => this.dragCancel());
    this.order = game.players[seat].rack.map((t) => t.id);
    this.refresh();
  }

  /** Screen band (host px) the board can use between the top and bottom panels. */
  freeBand(): Band { return this.frame.freeBand(); }

  /** Redraws from the game (after any move, or the rack changing). */
  refresh(): void {
    const g = this.game, me = g.players[this.seat];
    // Rack order: keep yours, new tiles on the end.
    const ids = new Set(me.rack.map((t) => t.id));
    this.order = this.order.filter((id) => ids.has(id));
    for (const t of me.rack) if (!this.order.includes(t.id)) this.order.push(t.id);
    // Tiles that went away (swapped), or squares the other player just took.
    this.pending = this.pending.filter((p) => ids.has(p.tile.id) && !g.board.get(p.r, p.c));
    if (this.selected !== null && !ids.has(this.selected)) this.selected = null;
    this.frame.setPlayers(g.players, g.over ? null : g.turn);
    this.frame.setMiddle(`🎒 ${g.bagCount}`);
    this.frame.setStatus(this.statusText());
    this.renderRack();
    this.renderButtons();
    this.handlers.onPendingChange(this.pending);
  }

  message(text: string, seconds = 2.6): void { this.frame.message(text, seconds); }

  chatLine(name: string, text: string, opponent: boolean): void { this.frame.chatLine(name, text, opponent); }

  /** The end card: the result, the final scores, and Done. */
  showResult(title: string, subtitle: string): void {
    this.frame.showResult(title, subtitle, () => this.handlers.onDone());
  }

  dispose(): void {
    this.dragCancel();
    this.off.forEach((f) => f());
    this.frame.dispose();
  }

  // ── Rack + buttons ─────────────────────────────────────────────────────

  private get myTurn(): boolean { return !this.game.over && this.game.turn === this.seat; }

  private statusText(): string {
    const g = this.game;
    if (g.over) return 'Game over';
    const last = g.lastTurn;
    const who = (s: Seat) => (s === this.seat ? 'You' : g.players[s].name);
    let prev = '';
    if (last?.kind === 'play') prev = `${who(last.seat)} played ${last.words[0]} for ${last.score}${last.bingo ? ' — BINGO!' : ''}`;
    else if (last?.kind === 'swap') prev = `${who(last.seat)} swapped ${last.count} tile${last.count === 1 ? '' : 's'}`;
    else if (last?.kind === 'pass') prev = `${who(last.seat)} passed`;
    const now = this.myTurn ? 'Your turn!' : `${g.players[g.turn].name} is thinking…`;
    return prev ? `${prev} · ${now}` : g.board.empty && this.myTurn ? 'Your turn! Start on the ★' : now;
  }

  private renderRack(): void {
    const rack = this.game.players[this.seat].rack;
    const out = new Set(this.pending.map((p) => p.tile.id));
    const w = this.bottom.clientWidth || 360;
    const size = Math.max(34, Math.min(52, Math.floor((w - 16 - 6 * 5) / 7)));
    this.rackRow.innerHTML = '';
    for (const id of this.order) {
      const t = rack.find((x) => x.id === id);
      if (!t || out.has(id)) continue;
      const marked = this.swapping?.has(id), sel = this.selected === id;
      const tile = div(`width:${size}px;height:${size}px;border-radius:9px;background:${marked ? '#ffb3a8' : sel ? '#fff3a0' : '#f7e9c6'};` +
        `box-shadow:0 3px 0 #b8975f${sel ? ',0 0 0 3px #ffd23f' : ''};color:${t.letter === '?' ? '#d4507a' : '#3b2a1a'};position:relative;` +
        `display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.55)}px;font-weight:700;` +
        `transform:${sel ? 'translateY(-5px)' : 'none'};transition:transform .1s;cursor:pointer;touch-action:none;`,
        t.letter === '?' ? '' : t.letter);
      if (t.letter !== '?') {
        tile.appendChild(div(`position:absolute;right:4px;bottom:1px;font-size:${Math.round(size * 0.24)}px;`, String(LETTER_VALUES[t.letter])));
      }
      tile.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.drag = { id, x: e.clientX, y: e.clientY, ghost: null };
      });
      this.rackRow.appendChild(tile);
    }
  }

  private renderButtons(): void {
    const b = this.btns, turn = this.myTurn;
    if (this.swapping) {
      b.shuffle.style.display = 'none';
      b.swap.textContent = 'Cancel';
      b.third.style.display = 'none';
      b.play.textContent = `Swap ${this.swapping.size}`;
      enable(b.play, this.swapping.size > 0);
      enable(b.swap, true);
      return;
    }
    b.shuffle.style.display = '';
    b.third.style.display = '';
    b.swap.textContent = 'Swap';
    enable(b.swap, turn && this.game.bagCount > 0);
    b.third.textContent = this.pending.length ? 'Recall' : 'Pass';
    enable(b.third, this.pending.length > 0 || turn);
    const res = this.pending.length ? evaluate(this.game.board, this.pending) : null;
    b.play.textContent = res?.ok ? `Play · ${res.score}` : 'Play';
    enable(b.play, turn && this.pending.length > 0);
  }

  private shuffle(): void {
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.renderRack();
  }

  private swapTap(): void {
    if (this.swapping) { this.swapping = null; this.refresh(); return; }
    if (!this.myTurn) return;
    this.recall();
    this.swapping = new Set();
    this.message('Tap the tiles to swap');
    this.refresh();
  }

  private thirdTap(): void {
    if (this.pending.length) { this.recall(); this.refresh(); return; }
    if (this.myTurn) this.handlers.onPass();
  }

  private playTap(): void {
    if (this.swapping) {
      const rack = this.game.players[this.seat].rack;
      const tiles = rack.filter((t) => this.swapping!.has(t.id));
      if (tiles.length > this.game.bagCount) { this.message(`Only ${this.game.bagCount} left in the bag`); return; }
      this.swapping = null;
      this.handlers.onSwap(tiles);
      return;
    }
    if (!this.myTurn || !this.pending.length) return;
    const res = evaluate(this.game.board, this.pending);
    if (!res.ok) { this.message(res.error); this.frame.shake(); return; }
    const pl = this.pending;
    this.pending = [];
    this.handlers.onPlay(pl);
  }

  private recall(): void {
    this.pending = [];
    this.selected = null;
  }

  // ── Putting tiles down ─────────────────────────────────────────────────

  private rackTap(id: number): void {
    if (this.swapping) {
      if (this.swapping.has(id)) this.swapping.delete(id); else this.swapping.add(id);
      this.renderRack();
      this.renderButtons();
      return;
    }
    this.selected = this.selected === id ? null : id;
    this.renderRack();
  }

  private boardTap(x: number, y: number): void {
    if (this.frame.overlayOpen || this.swapping || this.game.over) return;
    const cell = this.handlers.cellFromClient(x, y);
    if (!cell) return;
    const [r, c] = cell;
    const i = this.pending.findIndex((p) => p.r === r && p.c === c);
    if (i >= 0) { // take it back (and hold it, ready to go somewhere else)
      this.selected = this.pending[i].tile.id;
      this.pending.splice(i, 1);
      this.refresh();
      return;
    }
    if (this.selected !== null) this.place(this.selected, r, c);
  }

  private place(id: number, r: number, c: number): void {
    const tile = this.game.players[this.seat].rack.find((t) => t.id === id);
    if (!tile || this.game.board.get(r, c) || this.pending.some((p) => p.r === r && p.c === c)) return;
    const put = (face: string) => {
      this.pending.push({ r, c, tile, face });
      this.selected = null;
      this.refresh();
    };
    if (tile.letter === '?') this.pickLetter(put); else put(tile.letter);
  }

  /** A blank: which letter should it be? */
  private pickLetter(then: (face: string) => void): void {
    const card = div(`${PANEL}padding:12px;max-width:320px;`);
    card.appendChild(div('font-size:17px;font-weight:700;text-align:center;margin-bottom:8px;', 'Blank tile: pick a letter'));
    const grid = div('display:grid;grid-template-columns:repeat(7,1fr);gap:5px;');
    for (let k = 0; k < 26; k++) {
      const ch = String.fromCharCode(65 + k);
      const b = div('height:38px;min-width:34px;border-radius:8px;background:#f7e9c6;color:#d4507a;font-size:20px;font-weight:700;' +
        'display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 0 #b8975f;', ch);
      b.addEventListener('click', () => { this.frame.closeOverlay(); then(ch); });
      grid.appendChild(b);
    }
    card.appendChild(grid);
    this.frame.openOverlay(card);
  }

  private dragMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.ghost) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < TAP_SLOP || this.swapping) return;
      const t = this.game.players[this.seat].rack.find((x) => x.id === d.id);
      d.ghost = div('position:fixed;z-index:60;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:9px;' +
        `background:#fff3a0;box-shadow:0 6px 12px rgba(0,0,0,0.35);color:${t?.letter === '?' ? '#d4507a' : '#3b2a1a'};` +
        `display:flex;align-items:center;justify-content:center;font:700 26px ${FONT};pointer-events:none;`,
        t && t.letter !== '?' ? t.letter : '');
      document.body.appendChild(d.ghost);
      this.selected = d.id;
      this.renderRack();
    }
    d.ghost.style.left = `${e.clientX}px`;
    d.ghost.style.top = `${e.clientY - 30}px`; // lifted clear of the finger
  }

  private dragEnd(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.ghost) { this.rackTap(d.id); return; }
    d.ghost.remove();
    const cell = this.handlers.cellFromClient(e.clientX, e.clientY - 30);
    if (cell) this.place(d.id, cell[0], cell[1]);
    else this.renderRack();
  }

  private dragCancel(): void {
    this.drag?.ghost?.remove();
    this.drag = null;
  }
}
