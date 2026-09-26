// The frame every tabletop game's controls share (the zoomed-in view): both players' scores
// and whose turn along the top (under the ✕ Leave pill), a status line, nearby chat hung
// beneath, a toast in the middle, the result card at the end — and an empty bottom panel the
// game fills with its own controls (a rack of tiles, a row of dice…).

import { COLORS, FONT } from '../ui/theme';
import { getUiInsets } from '../safe-layout';
import type { Band, Seat } from './match';

export const div = (css: string, text = ''): HTMLDivElement => {
  const d = document.createElement('div');
  d.style.cssText = css;
  d.textContent = text;
  return d;
};

export const PANEL = `background:rgba(58,36,21,0.88);border:2px solid ${COLORS.brown};border-radius:16px;box-shadow:0 3px 0 ${COLORS.brownDark};`;
export const BTN = `font-family:${FONT};font-weight:700;font-size:15px;color:#5a3d1a;min-height:42px;padding:0 12px;border:0;` +
  'border-radius:13px;cursor:pointer;background:linear-gradient(#ffe7b0,#e9b970);box-shadow:0 4px 0 #7a5326;' +
  'touch-action:manipulation;user-select:none;-webkit-user-select:none;flex:1 1 0;min-width:0;';
export const PLAY_BG = 'linear-gradient(#a6ec8a,#4fb35a)';

/** A HUD button; `primary` = the green one. */
export function hudButton(label: string, onTap: () => void, primary = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.style.cssText = BTN + (primary ? `background:${PLAY_BG};box-shadow:0 4px 0 #2f7a36;color:#fff;` : '');
  b.textContent = label;
  b.addEventListener('click', onTap);
  return b;
}

export function enable(b: HTMLButtonElement, on: boolean): void {
  b.disabled = !on;
  b.style.opacity = on ? '1' : '0.45';
}

export class TableHud {
  readonly root: HTMLDivElement;
  /** The game's own controls go in here (a column; add rows). */
  readonly bottom: HTMLDivElement;
  private readonly top: HTMLDivElement;
  private readonly cards: [HTMLDivElement, HTMLDivElement];
  private readonly middle: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly chatLog: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private overlay: HTMLDivElement | null = null;
  private toastTimer = 0;

  constructor(private readonly host: HTMLElement, private readonly seat: Seat) {
    this.root = div('position:absolute;inset:0;z-index:26;pointer-events:none;' +
      `font-family:${FONT};color:#fff;user-select:none;-webkit-user-select:none;`);
    const insets = getUiInsets(host);
    this.top = div(`position:absolute;left:50%;top:${62 + insets.top}px;transform:translateX(-50%);` +
      `width:min(94%,440px);padding:8px 10px;${PANEL}pointer-events:auto;box-sizing:border-box;`);
    const row = div('display:flex;align-items:center;gap:8px;');
    const card = () => div('flex:1 1 0;min-width:0;padding:4px 8px;border-radius:11px;background:rgba(255,255,255,0.08);' +
      'border:2px solid transparent;transition:border-color .2s,background .2s;');
    this.cards = [card(), card()];
    this.middle = div('flex:0 0 auto;font-size:13px;font-weight:600;opacity:0.9;text-align:center;');
    row.append(this.cards[seat], this.middle, this.cards[seat === 0 ? 1 : 0]);
    this.status = div('margin-top:6px;font-size:14px;font-weight:600;text-align:center;min-height:18px;color:#ffe9b8;');
    // Chat from the table and anyone watching, hung under the scores (out of the layout, so the
    // table's framing never shifts) — their heads, and bubbles, are out of shot from up here.
    this.chatLog = div('position:absolute;left:0;right:0;top:100%;margin-top:6px;display:flex;flex-direction:column;' +
      'align-items:center;gap:4px;pointer-events:none;');
    this.top.append(row, this.status, this.chatLog);
    this.bottom = div(`position:absolute;left:50%;bottom:${12 + insets.bottom}px;transform:translateX(-50%);` +
      `width:min(96%,460px);padding:8px;${PANEL}pointer-events:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;`);
    this.toast = div(`position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);padding:8px 16px;${PANEL}` +
      'font-size:16px;font-weight:700;text-align:center;opacity:0;transition:opacity .2s;pointer-events:none;max-width:80%;');
    this.root.append(this.top, this.bottom, this.toast);
    host.appendChild(this.root);
  }

  /** Both players' names and scores; `turn` gets the highlight (null = nobody, e.g. game over). */
  setPlayers(players: readonly { name: string; score: number }[], turn: Seat | null): void {
    ([0, 1] as const).forEach((s) => {
      const c = this.cards[s], on = turn === s;
      c.style.borderColor = on ? '#ffd23f' : 'transparent';
      c.style.background = on ? 'rgba(255,210,63,0.16)' : 'rgba(255,255,255,0.08)';
      c.style.textAlign = s === this.seat ? 'left' : 'right';
      c.innerHTML = '';
      c.append(
        div('font-size:13px;font-weight:600;opacity:0.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
          s === this.seat ? 'You' : players[s].name),
        div('font-size:24px;font-weight:700;line-height:1.05;', String(players[s].score)),
      );
    });
  }

  /** The little readout between the scores (tiles in the bag, the round…). */
  setMiddle(text: string): void { this.middle.textContent = text; }
  setStatus(text: string): void { this.status.textContent = text; }

  message(text: string, seconds = 2.6): void {
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toast.style.opacity = '0'; }, seconds * 1000);
  }

  /** Someone nearby said something (`opponent`: the player across the table). */
  chatLine(name: string, text: string, opponent: boolean): void {
    const line = div(`max-width:92%;padding:4px 10px;border-radius:12px;background:rgba(255,255,255,0.94);color:#3b2a1a;` +
      `font-size:14px;font-weight:600;box-shadow:0 2px 0 rgba(0,0,0,0.25);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`);
    const who = document.createElement('span');
    who.textContent = `${name}: `;
    who.style.color = opponent ? '#d9772b' : '#7a6a58';
    line.append(who, document.createTextNode(text));
    this.chatLog.appendChild(line);
    while (this.chatLog.children.length > 3) this.chatLog.firstElementChild?.remove();
    line.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
    window.setTimeout(() => {
      line.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).onfinish = () => line.remove();
    }, 5000);
  }

  /** A card over everything (a picker…); `dismissable` = tapping outside closes it. */
  openOverlay(card: HTMLElement, dismissable = true): void {
    this.closeOverlay();
    const o = div('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:auto;background:rgba(0,0,0,0.3);');
    if (dismissable) o.addEventListener('click', (e) => { if (e.target === o) this.closeOverlay(); });
    o.appendChild(card);
    this.root.appendChild(o);
    this.overlay = o;
  }

  closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  get overlayOpen(): boolean { return !!this.overlay; }

  /** The end card: the result, the final scores, and Done. */
  showResult(title: string, subtitle: string, onDone: () => void): void {
    // Controls stay where they are (so the table doesn't reframe), just out of use.
    this.bottom.style.opacity = '0.45';
    this.bottom.style.pointerEvents = 'none';
    const card = div(`${PANEL}padding:18px 22px;text-align:center;min-width:230px;max-width:86%;`);
    card.append(div('font-size:28px;font-weight:700;', title), div('font-size:16px;margin:6px 0 14px;opacity:0.9;', subtitle));
    const done = hudButton('Done', onDone, true);
    done.style.flex = 'none';
    done.style.width = '100%';
    done.style.fontSize = '18px';
    card.appendChild(done);
    this.openOverlay(card, false);
    this.overlay!.style.background = 'rgba(0,0,0,0.25)';
  }

  /** Screen band (host px) the table can use between the top and bottom panels. */
  freeBand(): Band {
    const h = this.host.getBoundingClientRect();
    const a = this.top.getBoundingClientRect(), b = this.bottom.getBoundingClientRect();
    return { top: a.bottom - h.top + 6, bottom: b.top - h.top - 6, height: h.height };
  }

  /** A "no" wiggle of the controls. */
  shake(): void {
    this.bottom.animate([{ transform: 'translateX(-50%)' }, { transform: 'translateX(calc(-50% - 8px))' },
      { transform: 'translateX(calc(-50% + 8px))' }, { transform: 'translateX(-50%)' }], { duration: 260 });
  }

  dispose(): void {
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }
}
