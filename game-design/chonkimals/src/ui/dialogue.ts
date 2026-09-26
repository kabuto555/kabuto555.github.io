// NPC dialogue — Figma "Speech" (42:4877 / bubble 42:4883): a tan speech panel
// with the speaker's name over their line, anchored to the bottom of the screen.
// The Figma frame puts a character portrait above the bubble; in-game the real
// 3D speaker stands there instead (the camera frames them), so this is only the bubble.
// Design px (1080 frame) like the rest of the kit; scaled by fillScreen.

import { COLORS, FONT } from './theme';
import { el, fillScreen } from './components';
import { getSafeLayout } from '../safe-layout';

export const DIALOGUE = {
  width: 841.024,
  border: 6.371,
  pad: 33.981,
  radius: 42.476,
  /** The tail corner (bottom-left) is nearly square — it points at the speaker. */
  tailRadius: 8.495,
  nameGap: 8.495,
  fontSize: 40,
  /** Gap under the bubble on the 2340 Figma frame (bubble bottom at 2262.5). */
  bottom: 77.5,
  /** Typewriter speed (characters per second). */
  cps: 42,
} as const;

export interface DialogueLine {
  name: string;
  text: string;
}

/** The speech panel itself (Figma 42:4883). */
export function speechBubble(name: string, text: string): {
  root: HTMLElement; name: HTMLElement; text: HTMLElement; hint: HTMLElement;
} {
  const D = DIALOGUE;
  const root = el('div',
    `position:relative;box-sizing:border-box;width:${D.width}px;background:${COLORS.creamDim};` +
    `border:${D.border}px solid ${COLORS.brown};padding:${D.pad}px;` +
    `border-radius:${D.radius}px ${D.radius}px ${D.radius}px ${D.tailRadius}px;` +
    `display:flex;flex-direction:column;gap:${D.nameGap}px;align-items:flex-start;`);
  const n = el('p', `font-family:${FONT};font-weight:600;font-size:${D.fontSize}px;line-height:normal;` +
    `color:${COLORS.brown};white-space:nowrap;`, name);
  const t = el('p', `font-family:${FONT};font-weight:400;font-size:${D.fontSize}px;line-height:1.4;` +
    `color:${COLORS.brownDark};width:100%;padding-right:34px;box-sizing:border-box;word-break:break-word;min-height:${D.fontSize * 1.4}px;`, text);
  // "Tap to continue" nub — small brown chevron in the free corner (new; Figma has none).
  const hint = el('div', `position:absolute;right:${D.pad}px;bottom:${D.pad - 6}px;width:0;height:0;` +
    `border-left:15px solid transparent;border-right:15px solid transparent;border-top:20px solid ${COLORS.brown};` +
    'opacity:0;transition:opacity 120ms;pointer-events:none;');
  root.append(n, t, hint);
  return { root, name: n, text: t, hint };
}

/**
 * Full-screen dialogue overlay: tap anywhere to finish the current line (while it
 * types) or advance to the next. `play` resolves after the last line is dismissed.
 */
export class DialogueBox {
  readonly root: HTMLElement;
  private frame: HTMLElement;
  private wrap: HTMLElement;
  private bubble = speechBubble('', '');
  private unfit: () => void;
  private lines: DialogueLine[] = [];
  private index = 0;
  private shown = 0;
  private typing = 0;
  private resolve: (() => void) | null = null;
  private hintAnim: Animation | null = null;

  constructor(private host: HTMLElement) {
    this.root = el('div', 'position:absolute;inset:0;z-index:60;overflow:hidden;display:none;' +
      'user-select:none;-webkit-user-select:none;touch-action:none;');
    this.frame = el('div', 'pointer-events:none;');
    this.wrap = el('div', 'position:absolute;left:0;right:0;display:flex;justify-content:center;');
    this.wrap.appendChild(this.bubble.root);
    this.frame.appendChild(this.wrap);
    this.root.appendChild(this.frame);
    this.root.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.tap(); });
    for (const t of ['pointermove', 'pointerup', 'touchstart', 'touchmove'] as const) {
      this.root.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    }
    host.appendChild(this.root);
    this.unfit = fillScreen(this.frame, host, () => this.layout());
  }

  get open(): boolean { return this.resolve !== null; }

  /** Shows the lines one after another; resolves when the last one is tapped away. */
  play(lines: DialogueLine[]): Promise<void> {
    this.finish();
    this.lines = lines;
    this.index = 0;
    this.root.style.display = 'block';
    this.layout();
    this.bubble.root.animate([
      { opacity: 0, transform: 'translateY(60px) scale(0.92)' },
      { opacity: 1, transform: 'translateY(-6px) scale(1.01)', offset: 0.7 },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: 280, easing: 'ease-out' });
    this.showLine();
    return new Promise((r) => { this.resolve = r; });
  }

  dispose(): void {
    this.finish();
    this.unfit();
    this.root.remove();
  }

  private showLine(): void {
    const line = this.lines[this.index];
    this.bubble.name.textContent = line.name;
    this.bubble.text.textContent = '';
    this.shown = 0;
    this.setHint(false);
    clearInterval(this.typing);
    this.typing = window.setInterval(() => {
      this.shown++;
      this.bubble.text.textContent = line.text.slice(0, this.shown);
      if (this.shown >= line.text.length) this.doneTyping();
    }, 1000 / DIALOGUE.cps);
  }

  private doneTyping(): void {
    clearInterval(this.typing);
    this.typing = 0;
    this.bubble.text.textContent = this.lines[this.index].text;
    this.setHint(true);
  }

  private tap(): void {
    if (!this.resolve) return;
    if (this.typing) { this.doneTyping(); return; }
    if (++this.index < this.lines.length) {
      this.bubble.text.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 140 });
      this.showLine();
      return;
    }
    const done = this.resolve;
    const a = this.bubble.root.animate([
      { opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(40px)' },
    ], { duration: 160, easing: 'ease-in' });
    a.onfinish = () => { if (!this.resolve) this.root.style.display = 'none'; };
    this.resolve = null;
    done();
  }

  private finish(): void {
    clearInterval(this.typing);
    this.typing = 0;
    const r = this.resolve;
    this.resolve = null;
    this.root.style.display = 'none';
    r?.();
  }

  private setHint(on: boolean): void {
    this.hintAnim?.cancel();
    this.bubble.hint.style.opacity = on ? '1' : '0';
    if (on) {
      this.hintAnim = this.bubble.hint.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(8px)' }],
        { duration: 520, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    }
  }

  /** Keep the bubble above the home indicator (safe-area insets are CSS px). */
  private layout(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const s = w / 1080;
    const insetBottom = getSafeLayout(w, h, this.host).insets.bottom / s;
    this.wrap.style.bottom = `${DIALOGUE.bottom + insetBottom}px`;
  }
}
