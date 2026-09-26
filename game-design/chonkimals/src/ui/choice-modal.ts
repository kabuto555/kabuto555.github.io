// ChoiceModal — a small two-button prompt in the tutorial modal's style: felt
// header plaque over a clay card with a line of text and a light / dark button
// pair (e.g. "Give Up" / "Retry"). Built at design size and scaled to the screen.
//
//   showChoiceModal(container, { title: 'Splash!', message: '…', secondary: 'Give Up', primary: 'Retry' },
//     { onPrimary: retry, onSecondary: giveUp });

import { COLORS, FONT } from './theme';
import { clayCard, el, fitToScreen, headerPlaque, navButton } from './components';

const DESIGN_W = 1000;
const DESIGN_H = 720;
const PLAQUE_TOP = 0;
const CARD_TOP = 90;

export interface ChoiceModalConfig {
  title: string;
  message: string;
  /** Dark (recommended) button, on the right. */
  primary: string;
  /** Light button, on the left. */
  secondary: string;
  scrim?: string;
}

export interface ChoiceModalOptions {
  onPrimary?: () => void;
  onSecondary?: () => void;
}

export class ChoiceModal {
  readonly root: HTMLElement;
  private readonly unfit: () => void;
  private closed = false;

  constructor(host: HTMLElement, config: ChoiceModalConfig, private readonly opts: ChoiceModalOptions = {}) {
    this.root = el('div',
      `position:absolute;inset:0;z-index:100;background:${config.scrim ?? 'rgba(20,12,6,0.35)'};` +
      'touch-action:none;user-select:none;-webkit-user-select:none;');
    this.root.dataset.overlay = '1'; // gates stay quiet while any overlay is up
    // Swallow input so the joystick / camera drag / minigame taps underneath don't react.
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel'] as const) {
      this.root.addEventListener(t, (e) => e.stopPropagation());
    }

    const box = el('div', `position:absolute;left:50%;top:50%;width:${DESIGN_W}px;height:${DESIGN_H}px;transform-origin:50% 50%;`);
    const inner = el('div', 'position:absolute;inset:0;');
    box.appendChild(inner);
    this.root.appendChild(box);

    const card = clayCard(
      `position:absolute;left:50%;top:${CARD_TOP}px;transform:translateX(-50%);width:${DESIGN_W}px;box-sizing:border-box;` +
      'display:flex;flex-direction:column;gap:70px;align-items:center;padding:150px 60px 80px;');
    card.root.appendChild(el('p',
      `margin:0;font-family:${FONT};font-weight:500;font-size:48px;line-height:1.25;text-align:center;` +
      `color:${COLORS.brown};width:820px;word-break:break-word;`, config.message));
    const row = el('div', 'display:flex;gap:60px;align-items:center;justify-content:center;');
    const secondary = navButton(config.secondary, 'light', () => this.pick(this.opts.onSecondary));
    const primary = navButton(config.primary, 'dark', () => this.pick(this.opts.onPrimary));
    for (const b of [secondary, primary]) {
      b.root.style.padding = '30px 80px';
      b.label.style.fontSize = '48px';
    }
    row.append(secondary.root, primary.root);
    card.root.appendChild(row);
    inner.appendChild(card.root);

    const plaque = headerPlaque(config.title);
    plaque.root.style.cssText += `left:${(DESIGN_W - 820) / 2}px;top:${PLAQUE_TOP}px;`;
    inner.appendChild(plaque.root);

    host.appendChild(this.root);
    this.unfit = fitToScreen(box, DESIGN_W, DESIGN_H, host);
    card.bake();
    inner.animate(
      [{ transform: 'scale(0.88)', opacity: 0 }, { transform: 'scale(1.03)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 260, easing: 'ease-out' });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unfit();
    const anim = this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' });
    anim.onfinish = () => this.root.remove();
  }

  private pick(cb?: () => void): void {
    if (this.closed) return;
    this.close();
    cb?.();
  }
}

export function showChoiceModal(host: HTMLElement, config: ChoiceModalConfig, opts?: ChoiceModalOptions): ChoiceModal {
  return new ChoiceModal(host, config, opts);
}
