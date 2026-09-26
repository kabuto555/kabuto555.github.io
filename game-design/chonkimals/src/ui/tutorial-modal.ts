// TutorialModal — the reusable "how to play" modal from Figma
// (Modal / Dodge Ball, node 123:147). Header plaque + critter art, a clay card
// with a media preview + pager, Back/Next paging through mechanic pages, and a
// Ready! CTA. Built at design size (1000 × 1942) and scaled to the screen.
//
//   showTutorialModal(container, DODGEBALL_TUTORIAL, { onReady: () => game.start() });

import { COLORS, FONT } from './theme';
import { clayCard, critterHeader, el, fitToScreen, navButton, pagerDots, primaryButton } from './components';
import { backButton } from './store-components';

const DESIGN_W = 1000;
const DESIGN_H = 1942;

/** How the preview media fills the 875 × 600 frame. `crop` = Figma's exact image crop (percent of the frame). */
export interface TutorialMedia {
  src: string;
  kind?: 'image' | 'video';
  crop?: { width: string; height: string; left: string; top: string };
}

export interface TutorialPage {
  title: string;
  description: string;
  /** Falls back to the modal's `media` when omitted. */
  media?: TutorialMedia;
}

export interface TutorialModalConfig {
  title: string;
  pages: TutorialPage[];
  media?: TutorialMedia;
  /** Critter art above the plaque; `null` hides it. */
  headerImage?: string | null;
  readyLabel?: string;
  backLabel?: string;
  nextLabel?: string;
  /** Dim behind the modal (not part of the Figma frame — the game shows through). */
  scrim?: string;
}

export interface TutorialModalOptions {
  onReady?: () => void;
  /** Adds the system back button (top-left) so the player can walk away without playing. */
  onDismiss?: () => void;
  onPageChange?: (index: number) => void;
}

export class TutorialModal {
  readonly root: HTMLElement;
  private box: HTMLElement;
  private inner: HTMLElement;
  private mediaFrame: HTMLElement;
  private mediaSrc = '';
  private pagerTab: HTMLElement;
  private pageTitle: HTMLElement;
  private pageDesc: HTMLElement;
  private back: ReturnType<typeof navButton>;
  private next: ReturnType<typeof navButton>;
  private headerTitle: HTMLElement;
  private unfit: () => void = () => {};
  private extraCleanup: () => void = () => {};
  private index = 0;
  private closed = false;

  constructor(private host: HTMLElement, private config: TutorialModalConfig, private opts: TutorialModalOptions = {}) {
    this.root = el('div',
      `position:absolute;inset:0;z-index:100;background:${config.scrim ?? 'rgba(20,12,6,0.45)'};` +
      'touch-action:none;user-select:none;-webkit-user-select:none;');
    this.root.dataset.overlay = '1'; // gates stay quiet while any overlay is up
    // Swallow input so the joystick / camera drag underneath don't react.
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel'] as const) {
      this.root.addEventListener(t, (e) => e.stopPropagation());
    }

    this.box = el('div', `position:absolute;left:50%;top:50%;width:${DESIGN_W}px;height:${DESIGN_H}px;transform-origin:50% 50%;`);
    this.inner = el('div', 'position:absolute;inset:0;');
    this.box.appendChild(this.inner);
    this.root.appendChild(this.box);

    // ── Card (settings-screen 123:118) ──
    const card = clayCard(
      'position:absolute;left:50%;top:384.49px;transform:translateX(-50%);width:1000px;' +
      'display:flex;flex-direction:column;gap:40px;align-items:center;padding:100px 40px 80px;');

    const preview = el('div',
      'display:flex;flex-direction:column;gap:32px;align-items:center;justify-content:center;' +
      'padding:10px 40px 40px;border-radius:46.296px;flex-shrink:0;width:100%;position:relative;');

    // Media stage (900 × 626) → 889 × 600 → bordered 875 × 600 frame + pager tab.
    const stage = el('div', 'position:relative;width:900px;height:626px;flex-shrink:0;');
    const holder = el('div', 'position:absolute;left:5px;top:41.94px;width:889px;height:600px;');
    const frame = el('div',
      `position:absolute;left:50%;top:-30px;transform:translateX(-50%);width:875px;height:600px;` +
      `border:11.574px solid ${COLORS.brown};border-radius:46.296px;`);
    this.mediaFrame = el('div', 'position:absolute;inset:0;overflow:hidden;border-radius:46.296px;pointer-events:none;');
    frame.appendChild(this.mediaFrame);
    const tabWrap = el('div',
      'position:absolute;left:calc(50% + 10.95px);top:calc(50% + 244px);transform:translate(-50%,-50%);width:148px;height:46px;');
    tabWrap.appendChild(el('div', `position:absolute;inset:0;background:${COLORS.pagerTab};border-radius:20px 20px 0 0;`));
    this.pagerTab = el('div',
      'position:absolute;left:calc(50% - 1px);top:calc(50% + 2px);transform:translate(-50%,-50%);display:flex;justify-content:center;');
    tabWrap.appendChild(this.pagerTab);
    holder.append(frame, tabWrap);
    stage.appendChild(holder);
    this.bindSwipe(stage);

    // Back / Next row (902 × 123).
    const nav = el('div', 'display:flex;height:123px;align-items:center;justify-content:space-between;width:902px;flex-shrink:0;');
    this.back = navButton(config.backLabel ?? 'Back', 'light', () => this.setPage(this.index - 1));
    this.next = navButton(config.nextLabel ?? 'Next', 'dark', () => this.setPage(this.index + 1));
    nav.append(this.back.root, this.next.root);

    // Mechanic title + description (fixed 237 tall so paging never jumps).
    const text = el('div',
      `display:flex;flex-direction:column;gap:20px;height:237px;align-items:flex-start;justify-content:center;` +
      `line-height:normal;color:${COLORS.brown};flex-shrink:0;word-break:break-word;`);
    this.pageTitle = el('p', `font-family:${FONT};font-weight:600;font-size:60px;width:808.889px;line-height:normal;`);
    this.pageDesc = el('p', `font-family:${FONT};font-weight:400;font-size:40px;width:808.889px;line-height:normal;`);
    text.append(this.pageTitle, this.pageDesc);

    preview.append(stage, nav, text);

    // Ready! CTA.
    const readyWrap = el('div', 'display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;');
    const readyRow = el('div', 'display:flex;align-items:center;justify-content:center;width:901.482px;');
    const ready = primaryButton(config.readyLabel ?? 'Ready!', () => this.ready());
    readyRow.appendChild(ready.slot);
    readyWrap.appendChild(readyRow);

    card.root.append(preview, readyWrap);
    this.inner.appendChild(card.root);

    // ── Header (123:142): critter art on a felt plaque ──
    const header = critterHeader(config.title, { image: config.headerImage });
    header.root.style.cssText += 'position:absolute;left:90px;top:0;';
    this.headerTitle = header.title;
    this.inner.appendChild(header.root);

    if (opts.onDismiss) {
      // Header-row back button (80 design px at 24, 40 on the 1080 frame), scaled with the screen.
      const back = el('div', 'position:absolute;left:0;top:0;transform-origin:0 0;');
      const btn = backButton(80, () => this.dismiss());
      btn.style.cssText += 'position:absolute;left:24px;top:40px;';
      back.appendChild(btn);
      this.root.appendChild(back);
      const place = () => { back.style.transform = `scale(${host.clientWidth / 1080})`; };
      place();
      window.addEventListener('resize', place);
      const prevUnfit = () => window.removeEventListener('resize', place);
      this.extraCleanup = prevUnfit;
    }

    host.appendChild(this.root);
    this.unfit = fitToScreen(this.box, DESIGN_W, DESIGN_H, host);
    card.bake();
    this.setPage(0);
    this.inner.animate(
      [{ transform: 'scale(0.88)', opacity: 0 }, { transform: 'scale(1.03)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 260, easing: 'ease-out' });
  }

  get page(): number { return this.index; }

  setTitle(title: string): void { this.headerTitle.textContent = title; }

  setPage(i: number): void {
    const n = this.config.pages.length;
    if (n === 0) return;
    this.index = Math.max(0, Math.min(n - 1, i));
    const page = this.config.pages[this.index];
    this.pageTitle.textContent = page.title;
    this.pageDesc.textContent = page.description;
    this.back.setDisabled(this.index === 0);
    this.next.setDisabled(this.index === n - 1);
    this.pagerTab.replaceChildren(pagerDots(n, this.index));
    this.showMedia(page.media ?? this.config.media);
    this.opts.onPageChange?.(this.index);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unfit();
    this.extraCleanup();
    const anim = this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' });
    anim.onfinish = () => this.root.remove();
  }

  private dismiss(): void {
    if (this.closed) return;
    this.close();
    this.opts.onDismiss?.();
  }

  private ready(): void {
    if (this.closed) return;
    this.close();
    this.opts.onReady?.();
  }

  private showMedia(media?: TutorialMedia): void {
    const src = media?.src ?? '';
    if (src === this.mediaSrc) return; // keep GIF/video playing when pages share media
    this.mediaSrc = src;
    this.mediaFrame.replaceChildren();
    if (!media) return;
    const c = media.crop;
    const css = c
      ? `position:absolute;max-width:none;width:${c.width};height:${c.height};left:${c.left};top:${c.top};`
      : 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    if (media.kind === 'video') {
      const v = el('video', css);
      Object.assign(v, { src, muted: true, loop: true, autoplay: true, playsInline: true });
      v.play().catch(() => {});
      this.mediaFrame.appendChild(v);
    } else {
      const img = el('img', css);
      img.src = src; img.alt = ''; img.draggable = false;
      this.mediaFrame.appendChild(img);
    }
  }

  /** Horizontal swipe on the preview pages too (touch-first). */
  private bindSwipe(target: HTMLElement): void {
    let x0 = 0, y0 = 0, active = false;
    target.addEventListener('pointerdown', (e) => { active = true; x0 = e.clientX; y0 = e.clientY; });
    target.addEventListener('pointerup', (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) this.setPage(this.index + (dx < 0 ? 1 : -1));
    });
    target.addEventListener('pointercancel', () => { active = false; });
  }
}

export function showTutorialModal(host: HTMLElement, config: TutorialModalConfig, opts?: TutorialModalOptions): TutorialModal {
  return new TutorialModal(host, config, opts);
}
