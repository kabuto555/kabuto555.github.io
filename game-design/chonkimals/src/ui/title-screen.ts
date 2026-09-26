// Title + loading screens with the game logo (assets/ui/logo.png). The loading screen opens on the
// publisher splash (assets/ui/publisher_logo.png) before the game logo + progress.
//   LoadingScreen: the camp illustration full-bleed, the logo, a bobbing progress bar. Shown
//                  from the first frame until the world is built.
//   TitleScreen:   over the live camp (main.ts flies a slow camera round the campfire with the
//                  HUD, player and campers hidden): the logo and a big "Enter Camp" button.

import { COLORS, FONT, UI_ASSETS, textOutline } from './theme';
import { critterHeader, el, fillScreen } from './components';
import { pillButton } from './store-components';

const LOGO_URL = 'assets/ui/logo.png';
const PUBLISHER_URL = 'assets/ui/publisher_logo.png';
/** Publisher splash timing (ms): fade in, hold, fade out. Tap to skip. */
const SPLASH = { in: 450, hold: 1600, out: 450 };
/** The game loading screen stays up at least this long after the splash (vibes), its bar filling across it (ms). */
const MIN_LOADING_MS = 2800;

/** The game logo (assets/ui/logo.png, 900 design px wide). Falls back to a logo built from kit parts
 * (the critter group on a clay plaque + a wooden sign) if the art is missing. */
export function gameLogo(): HTMLElement {
  const root = el('div', 'position:relative;display:flex;flex-direction:column;align-items:center;width:900px;flex-shrink:0;');
  const img = el('img', 'width:900px;height:auto;display:block;pointer-events:none;' +
    'filter:drop-shadow(0 10px 14px rgba(28,16,6,0.35));') as HTMLImageElement;
  img.alt = 'Chonkimals'; img.draggable = false;
  img.onerror = () => root.replaceChildren(...builtLogo());
  img.src = LOGO_URL;
  root.appendChild(img);
  return root;
}

function builtLogo(): HTMLElement[] {
  const header = critterHeader('Chonkimals');
  header.title.style.fontSize = '118px';
  header.title.style.letterSpacing = '1px';
  const sign = el('div', `margin-top:-26px;position:relative;padding:14px 46px 16px;border-radius:18px;` +
    `background:linear-gradient(#a8784f, #8a5e3b);border:6px solid ${COLORS.brownDark};box-shadow:0 8px 0 rgba(43,26,14,0.45);` +
    `transform:rotate(-1.5deg);`);
  sign.appendChild(el('p', `font-family:${FONT};font-weight:700;font-size:40px;line-height:1;letter-spacing:2px;color:${COLORS.cream};` +
    `white-space:nowrap;text-shadow:0 3px 0 ${COLORS.brownInk};`, 'PLAY TOGETHER. LAUGH TOGETHER.'));
  for (const side of ['left', 'right']) {
    sign.appendChild(el('div', `position:absolute;top:50%;${side}:16px;width:14px;height:14px;margin-top:-7px;border-radius:50%;` +
      `background:${COLORS.brownDark};box-shadow:inset 0 2px 0 rgba(255,255,255,0.25);`));
  }
  return [header.root, sign];
}

/** Full-screen loading screen: camp illustration, logo, progress. `setProgress(0..1)` or leave it bobbing. */
export class LoadingScreen {
  readonly root: HTMLElement;
  private fill: HTMLElement;
  private unfit: () => void;
  /** Resolves once the publisher splash has played (or been tapped away). */
  readonly splashDone: Promise<void>;

  constructor(host: HTMLElement) {
    // Above the title screen (110): the title waits underneath until this fades.
    this.root = el('div', 'position:absolute;inset:0;z-index:120;overflow:hidden;pointer-events:none;background:#6aa7d6;');
    this.root.classList.add('chonk-loading');
    const bg = el('img', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;') as HTMLImageElement;
    bg.src = UI_ASSETS.bgCamp; bg.alt = '';
    const shade = el('div', 'position:absolute;inset:0;background:linear-gradient(rgba(28,16,6,0.15), rgba(28,16,6,0) 40%, rgba(28,16,6,0.35));');
    const frame = el('div', 'display:flex;flex-direction:column;align-items:center;');
    const logo = gameLogo();
    logo.style.marginTop = '22%';
    const barWrap = el('div', `position:absolute;left:50%;bottom:220px;transform:translateX(-50%);width:560px;height:44px;border-radius:22px;` +
      `background:rgba(43,26,14,0.55);border:6px solid ${COLORS.cream};box-shadow:0 8px 0 rgba(43,26,14,0.4);overflow:hidden;`);
    this.fill = el('div', `position:absolute;left:0;top:0;bottom:0;width:4%;border-radius:16px;` +
      `background:linear-gradient(90deg, ${COLORS.coin}, ${COLORS.coinLight});`);
    barWrap.appendChild(this.fill);
    const label = el('p', `position:absolute;left:0;right:0;bottom:150px;text-align:center;font-family:${FONT};font-weight:700;font-size:40px;` +
      `color:#fff;text-shadow:${textOutline(COLORS.brownDark, 3)};`, 'Loading camp…');
    frame.append(logo, barWrap, label);
    this.root.append(bg, shade, frame);
    host.appendChild(this.root);
    this.unfit = fillScreen(frame, host, undefined, undefined, { safeArea: true });
    logo.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }],
      { duration: 1400, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    this.splashDone = this.publisherSplash();
    // Once the splash lifts, the bar fills steadily to ~92% over the minimum time; hide() tops it off.
    void this.splashDone.then(() => {
      this.shownAt = performance.now();
      this.fill.animate([{ width: '4%' }, { width: '92%' }], { duration: MIN_LOADING_MS, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' });
    });
  }
  private shownAt = Infinity;

  /** The publisher logo on warm cream, then it fades away to reveal the game's loading screen. */
  private publisherSplash(): Promise<void> {
    const splash = el('div', 'position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;' +
      'pointer-events:auto;background:radial-gradient(circle at 50% 45%, #fffaf0 0%, #f3e6cf 60%, #e6d2b0 100%);');
    const img = el('img', 'width:min(86vw, 560px);height:auto;display:block;pointer-events:none;' +
      'filter:drop-shadow(0 10px 16px rgba(58,36,21,0.25));') as HTMLImageElement;
    img.src = PUBLISHER_URL; img.alt = 'Brainrot Maxxing'; img.draggable = false;
    splash.appendChild(img);
    this.root.appendChild(splash);
    return new Promise((resolve) => {
      let gone = false;
      const leave = () => {
        if (gone) return;
        gone = true;
        splash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SPLASH.out, easing: 'ease-in', fill: 'forwards' })
          .onfinish = () => { splash.remove(); resolve(); };
      };
      img.animate([{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: SPLASH.in, easing: 'ease-out', fill: 'backwards' });
      const timer = window.setTimeout(leave, SPLASH.in + SPLASH.hold);
      splash.addEventListener('pointerup', () => { window.clearTimeout(timer); leave(); });
      img.onerror = () => { window.clearTimeout(timer); splash.remove(); gone = true; resolve(); }; // no art: skip it
    });
  }

  /** Show an error in place of the progress. */
  error(msg: string): void {
    this.root.style.display = 'block';
    const box = el('p', `position:absolute;left:24px;right:24px;bottom:40px;padding:14px 18px;border-radius:14px;background:rgba(58,20,10,0.85);` +
      `font-family:${FONT};font-size:16px;color:#ffd6cc;`, `⚠ ${msg}`);
    this.root.appendChild(box);
  }

  /** Fade away (then removed) — after the publisher splash and the minimum loading time have had their turn. */
  hide(ms = 450): void {
    void this.splashDone.then(() => {
      const wait = Math.max(0, this.shownAt + MIN_LOADING_MS - performance.now());
      window.setTimeout(() => {
        this.fill.getAnimations().forEach((a) => a.cancel());
        this.fill.animate([{ width: '92%' }, { width: '100%' }], { duration: 260, easing: 'ease-out', fill: 'forwards' })
          .onfinish = () => window.setTimeout(() => this.fadeOut(ms), 180);
      }, wait);
    });
  }

  private fadeOut(ms: number): void {
    this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
      this.unfit();
      this.root.remove();
    };
  }
}

/** The main menu over the live camp: logo + "Enter Camp". */
export class TitleScreen {
  readonly root: HTMLElement;
  private unfit: () => void;
  private done = false;

  constructor(host: HTMLElement, onEnter: () => void) {
    this.root = el('div', 'position:absolute;inset:0;z-index:110;overflow:hidden;pointer-events:none;');
    this.root.classList.add('chonk-title');
    const frame = el('div', 'display:flex;flex-direction:column;align-items:center;pointer-events:none;');
    const logo = gameLogo();
    logo.style.marginTop = '30%';
    const enter = pillButton('Enter Camp', () => {
      if (this.done) return;
      this.done = true;
      onEnter();
    }, 'play', 'brown');
    enter.style.cssText += 'pointer-events:auto;padding:0 110px;';
    // Centring + idle bob live on a wrapper so they don't fight the press sink on the button's own transform.
    const bob = el('div', 'position:absolute;left:0;right:0;bottom:170px;display:flex;justify-content:center;pointer-events:none;');
    bob.appendChild(enter);
    frame.append(logo, bob);
    this.root.appendChild(frame);
    host.appendChild(this.root);
    this.unfit = fillScreen(frame, host, undefined, undefined, { safeArea: true });
    logo.animate([{ transform: 'scale(0.85)', opacity: 0 }, { transform: 'scale(1.03)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 700, easing: 'ease-out', fill: 'backwards', delay: 250 });
    logo.animate([{ translate: '0 0' }, { translate: '0 -10px' }], { duration: 1600, delay: 950, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
    bob.animate([{ opacity: 0, translate: '0 40px' }, { opacity: 1, translate: '0 0' }], { duration: 500, delay: 700, easing: 'ease-out', fill: 'backwards' });
    bob.animate([{ translate: '0 0' }, { translate: '0 -8px' }], { duration: 900, delay: 1200, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  }

  hide(ms = 380): void {
    this.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
      this.unfit();
      this.root.remove();
    };
  }
}
