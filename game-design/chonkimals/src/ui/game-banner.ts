// In-game message banner ("Splash!", "Made it!", "Bumped out by …") in the UI kit's
// felt-plaque style: the modal header plaque (Figma 123:143) — brown rim, dark inner
// line, baked felt grain — sized to its text, with the cream title + ink drop
// shadow, and an optional subtitle line. Laid out in 1080-wide design px and
// scaled to the screen like the camp HUD (fillScreen), so it matches the other
// screens on every phone. Minigames own one and call show()/update(dt).

import { COLORS, FONT, textOutline } from './theme';
import { el, fillScreen } from './components';
import { PLAQUE_FELT, applyTexture, feltTexture } from './shader-textures';

export type BannerTone = 'info' | 'good' | 'bad';

const TITLE_COLOR: Record<BannerTone, string> = {
  info: COLORS.creamDim,
  good: COLORS.coinLight,
  bad: COLORS.badgeText,
};

/** Plaque metrics — PLAQUE_MODAL's rim/inner line/radius, padded around the text. */
const RIM = 11.574;
const INNER = 4;
const RADIUS = 26.62;

export class GameBanner {
  private readonly layer: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly plaque: HTMLElement;
  private readonly felt: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly unfit: () => void;
  private timer = 0;
  private bakedSize = '';

  constructor(host: HTMLElement, opts: { top?: number; zIndex?: number } = {}) {
    const top = opts.top ?? 0.2; // fraction of the screen height
    this.layer = el('div', `position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:${opts.zIndex ?? 40};display:none;`);
    this.frame = el('div', 'pointer-events:none;');
    this.plaque = el('div',
      // Centred with auto margins (not left:50%, which would cap the width at half the screen).
      `position:absolute;left:0;right:0;margin:0 auto;width:max-content;box-sizing:border-box;min-width:420px;max-width:940px;` +
      `padding:30px 64px 34px;background:${COLORS.plaque};border:${RIM}px solid ${COLORS.brown};border-radius:${RADIUS}px;` +
      `box-shadow:0 12px 0 ${COLORS.brownDark},0 18px 28px rgba(0,0,0,0.25);text-align:center;`);
    this.felt = el('div',
      `position:absolute;inset:0;border:${INNER}px solid ${COLORS.brownInk};border-radius:26.378px;` +
      `background-color:${COLORS.plaqueFelt};background-clip:padding-box;background-origin:padding-box;overflow:hidden;`);
    this.felt.appendChild(el('div',
      'position:absolute;inset:0;border-radius:inherit;' +
      'box-shadow:inset -4.587px 0 13.762px 4.587px rgba(0,0,0,0.15),inset 4.587px -4.587px 14.909px 11.468px rgba(0,0,0,0.15);'));
    this.title = el('p',
      `position:relative;margin:0;font-family:${FONT};font-weight:700;font-size:76px;line-height:1.1;` +
      `text-shadow:0 4.63px 0 ${COLORS.brownInk},0 2.315px 0 ${COLORS.brownDark};white-space:nowrap;`);
    this.sub = el('p',
      `position:relative;margin:6px 0 0;font-family:${FONT};font-weight:600;font-size:40px;line-height:1.15;` +
      `color:#fff;text-shadow:${textOutline(COLORS.brownInk, 2.4)};overflow-wrap:anywhere;`);
    this.plaque.append(this.felt, this.title, this.sub);
    this.frame.appendChild(this.plaque);
    this.layer.appendChild(this.frame);
    host.appendChild(this.layer);
    this.unfit = fillScreen(this.frame, host, (h) => { this.plaque.style.top = `${h * top}px`; });
  }

  /** Show a message; with `seconds` it hides itself (via update), otherwise it stays until replaced/hidden. */
  show(title: string, subtitle = '', tone: BannerTone = 'info', seconds = 0): void {
    this.title.textContent = title;
    this.title.style.color = TITLE_COLOR[tone];
    this.sub.textContent = subtitle;
    this.sub.style.display = subtitle ? 'block' : 'none';
    // Long titles shrink to fit the plaque instead of running off it.
    this.title.style.fontSize = `${Math.max(48, Math.min(76, 900 / Math.max(1, title.length) * 1.6))}px`;
    this.layer.style.display = 'block';
    this.timer = seconds;
    this.bake();
    this.plaque.animate([
      { transform: 'translateY(-24px) scale(0.8)', opacity: 0 },
      { transform: 'translateY(4px) scale(1.04)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: 260, easing: 'ease-out' });
  }

  hide(): void {
    this.layer.style.display = 'none';
    this.timer = 0;
  }

  get visible(): boolean { return this.layer.style.display !== 'none'; }

  /** Counts down a timed banner. */
  update(dt: number): void {
    if (this.timer > 0 && (this.timer -= dt) <= 0) this.hide();
  }

  dispose(): void { this.unfit(); this.layer.remove(); }

  /** Felt grain is per-pixel, so bake it at the plaque's (design-px) size — re-baked only when that changes. */
  private bake(): void {
    const w = this.plaque.offsetWidth - RIM * 2 - INNER * 2, h = this.plaque.offsetHeight - RIM * 2 - INNER * 2;
    const key = `${Math.round(w)}x${Math.round(h)}`;
    if (w <= 0 || h <= 0 || key === this.bakedSize) return;
    this.bakedSize = key;
    applyTexture(this.felt, feltTexture(PLAQUE_FELT, w, h));
  }
}
