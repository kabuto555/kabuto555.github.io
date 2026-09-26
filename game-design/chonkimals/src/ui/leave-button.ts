// LeaveButton — a small "✕ Leave" pill tucked in the top-right corner while a
// minigame runs, well away from the thumb controls at the bottom. Tapping it
// asks "Leave early?" (Keep Playing / Leave) so a stray tap can't end a round;
// `confirm` can skip the prompt when nothing's at stake (e.g. already knocked out).

import { el } from './components';
import { COLORS, buttonRadius } from './theme';
import { getUiInsets } from '../safe-layout';
import { showChoiceModal, type ChoiceModal } from './choice-modal';
import { icon } from './icons';

export interface LeaveOptions {
  /** Minigame name for the prompt ("Leave Dodge Ball early?"). */
  name: string;
  onLeave: () => void;
  /** Distance from the top of the screen (px, below the safe area) — clear of the mode's top HUD. */
  top?: number;
  /** Ask before leaving (default: always). */
  confirm?: () => boolean;
}

export class LeaveButton {
  private readonly btn: HTMLButtonElement;
  private opts: LeaveOptions | null = null;
  private modal: ChoiceModal | null = null;

  constructor(private readonly host: HTMLElement) {
    this.btn = el('button',
      'position:absolute;right:calc(14px + env(safe-area-inset-right));z-index:30;display:none;' +
      `font-family:'Fredoka',system-ui,sans-serif;font-weight:700;font-size:15px;color:${COLORS.brown};` +
      // Kit cream button (Back / Get More tone) in CSS px — this HUD isn't design-px scaled.
      `min-width:84px;height:44px;padding:0 14px;border:3px solid ${COLORS.brown};border-radius:${buttonRadius(44)}px;cursor:pointer;` +
      `background:${COLORS.cream};box-shadow:0 4px 0 ${COLORS.brownDark};` +
      'touch-action:manipulation;user-select:none;-webkit-user-select:none;');
    this.btn.innerHTML = `<img src="${icon('game', 'leave')}" alt="" style="width:24px;height:24px;vertical-align:-6px;margin:-4px 5px -4px -2px;pointer-events:none">Leave`;
    this.btn.setAttribute('aria-label', 'Leave minigame');
    this.btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.btn.addEventListener('click', () => this.tap());
    host.appendChild(this.btn);
  }

  show(opts: LeaveOptions): void {
    this.opts = opts;
    this.btn.style.top = `${(opts.top ?? 14) + getUiInsets(this.host).top}px`;
    this.btn.style.display = 'block';
  }

  hide(): void {
    this.opts = null;
    this.btn.style.display = 'none';
    this.modal?.close();
    this.modal = null;
  }

  private tap(): void {
    const o = this.opts;
    if (!o || this.modal) return;
    if (o.confirm && !o.confirm()) { o.onLeave(); return; }
    this.modal = showChoiceModal(this.host, {
      title: 'Leave?',
      message: `Leave ${o.name} early?`,
      secondary: 'Leave',
      primary: 'Keep Playing',
    }, {
      onPrimary: () => { this.modal = null; },
      onSecondary: () => {
        this.modal = null;
        // Still the same round? (It may have ended while the prompt was up.)
        if (this.opts === o) o.onLeave();
      },
    });
  }
}
