// Mr Kodak's HUD photo button — a round camera button beside the HUD pill that pops up when
// he has new (unseen) photos of you, with their count in a red bubble. Tapping it opens his
// note: the newest snap developing like an instant photo, and a nudge to come pick up your
// post cards at his Photo Booth (that's where they're viewed — the count clears there).
// Lives in the Camp HUD's top row, so it hides with the HUD during minigames and shows up
// right after ("Mr Kodak will have taken a photo and let you know after the minigame").

import { COLORS, DEFAULT_HUD_TONE, FONT, HUD_TONES } from './theme';
import { el, fillScreen, pressable } from './components';
import { pillButton } from './store-components';
import { speechBubble } from './dialogue';
import { photoAlbum } from '../postcards/album';

const ICON_CAMERA =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M3 8.5 Q3 6.5 5 6.5 H7.6 L9.2 4.3 H14.8 L16.4 6.5 H19 Q21 6.5 21 8.5 V17.5 Q21 19.5 19 19.5 H5 Q3 19.5 3 17.5 Z" ' +
  'fill="#fff" stroke="#432a18" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<circle cx="12" cy="12.8" r="4.1" fill="#4eb3f5" stroke="#432a18" stroke-width="1.6"/>' +
  '<circle cx="10.8" cy="11.6" r="1.2" fill="#fff" opacity="0.85"/>' +
  '<circle cx="17.8" cy="9.2" r="1" fill="#ffc629"/></svg>';

export class PhotoHudButton {
  readonly root: HTMLElement;
  private badge: HTMLElement;
  private shown = false;
  private wiggle: Animation | null = null;

  constructor(onTap: () => void) {
    const t = HUD_TONES[DEFAULT_HUD_TONE];
    this.root = el('div',
      `position:relative;width:105px;height:105px;border-radius:52.5px;box-sizing:border-box;background:${t.fill};` +
      `border:5.334px solid ${t.rim};box-shadow:0 8px 0 ${t.shadow};display:none;align-items:center;justify-content:center;` +
      'cursor:pointer;user-select:none;touch-action:manipulation;transition:transform 60ms;pointer-events:auto;flex-shrink:0;');
    this.root.setAttribute('role', 'button');
    this.root.setAttribute('aria-label', 'New photos from Mr Kodak');
    this.root.innerHTML = ICON_CAMERA;
    const svg = this.root.querySelector('svg')!;
    svg.style.cssText = 'width:64px;height:64px;display:block;pointer-events:none;';
    this.badge = el('p', 'position:absolute;right:-16px;top:-16px;min-width:50px;height:50px;box-sizing:border-box;' +
      'padding:0 12px;border-radius:25px;background:#e8483f;border:4px solid #fff;box-shadow:0 4px 0 rgba(0,0,0,0.25);' +
      `display:flex;align-items:center;justify-content:center;font-family:${FONT};font-weight:700;font-size:27px;` +
      'color:#fff;pointer-events:none;line-height:1;');
    this.root.appendChild(this.badge);
    pressable(this.root, 8, onTap);
    photoAlbum.subscribe(() => this.refresh());
    this.refresh();
  }

  private refresh(): void {
    const n = photoAlbum.unseenCount;
    const prev = this.badge.textContent;
    this.badge.textContent = n > 9 ? '9+' : String(n);
    if (n > 0 && !this.shown) {
      this.shown = true;
      this.root.style.display = 'flex';
      this.root.animate([{ transform: 'scale(0.2) rotate(-30deg)' }, { transform: 'scale(1.18) rotate(8deg)', offset: 0.7 },
        { transform: 'scale(1) rotate(0)' }], { duration: 380, easing: 'ease-out' });
      // A little "look at me" wiggle every few seconds while there's something new.
      this.wiggle = this.root.animate([
        { transform: 'rotate(0)' }, { transform: 'rotate(-10deg)', offset: 0.04 }, { transform: 'rotate(9deg)', offset: 0.08 },
        { transform: 'rotate(-5deg)', offset: 0.12 }, { transform: 'rotate(0)', offset: 0.16 }, { transform: 'rotate(0)' },
      ], { duration: 3800, iterations: Infinity, delay: 900 });
    } else if (n === 0 && this.shown) {
      this.shown = false;
      this.wiggle?.cancel();
      this.wiggle = null;
      this.root.style.display = 'none';
    } else if (n > 0 && prev !== this.badge.textContent) {
      this.badge.animate([{ transform: 'scale(0.4)' }, { transform: 'scale(1.25)', offset: 0.7 }, { transform: 'scale(1)' }],
        { duration: 260 });
    }
  }
}

/** Mr Kodak's note: the newest photo developing + "come get your post cards at the booth". */
export function showKodakNote(host: HTMLElement, opts: { boothHint: string; onClose?: () => void }): void {
  const root = el('div', `position:absolute;inset:0;z-index:95;overflow:hidden;background:${COLORS.scrim};` +
    'user-select:none;-webkit-user-select:none;');
  root.dataset.overlay = '1';
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'wheel'] as const) {
    root.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
  }
  const frame = el('div', 'pointer-events:none;');
  root.appendChild(frame);

  const photos = photoAlbum.photos;
  const unseen = photos.filter((p) => !p.seen);
  const p = unseen[0] ?? photos[0];
  const col = el('div', 'position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;' +
    'flex-direction:column;align-items:center;gap:56px;pointer-events:auto;');
  if (p) {
    // An instant photo, fresh out of the camera: it develops from a milky wash.
    const pol = el('div', 'background:#fffdf8;padding:30px 30px 0;width:780px;box-sizing:border-box;border-radius:10px;' +
      'box-shadow:0 20px 40px rgba(0,0,0,0.4);transform:rotate(-3deg);');
    const img = el('img', 'display:block;width:720px;height:480px;object-fit:cover;border-radius:4px;');
    img.src = p.image;
    img.alt = p.caption;
    pol.append(img, el('p', `font-family:${FONT};font-weight:600;font-size:46px;color:#4a2f1c;text-align:center;` +
      'padding:26px 0 34px;', p.caption));
    col.appendChild(pol);
    pol.animate([{ transform: 'translateY(-500px) rotate(8deg)', opacity: 0 }, { transform: 'translateY(20px) rotate(-4deg)', opacity: 1, offset: 0.75 },
      { transform: 'rotate(-3deg)' }], { duration: 520, easing: 'ease-out' });
    img.animate([{ filter: 'brightness(2.4) saturate(0) blur(6px)' }, { filter: 'brightness(1.5) saturate(0.4) sepia(0.5) blur(2px)', offset: 0.5 },
      { filter: 'none' }], { duration: 2200, easing: 'ease-out', delay: 300, fill: 'backwards' });
  }
  const n = unseen.length;
  const text = !p ? `No photos yet — but I'm always watching for your big moments! 📸`
    : n === 0 ? `Your post cards are all at my Photo Booth, ${opts.boothHint}. Come see them any time!`
    : `Snap! Got you at ${p.place}! ${n > 1 ? `${n} new post cards are` : 'Your new post card is'} waiting at my Photo Booth, ${opts.boothHint}. 📸`;
  const bubble = speechBubble('Mr Kodak', text);
  bubble.hint.remove();
  col.append(bubble.root, pillButton("Can't wait!", () => close(), 'getMore'));
  frame.appendChild(col);
  host.appendChild(root);
  const unfit = fillScreen(frame, host, undefined, 1080, { safeArea: true });
  root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    unfit();
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150 }).onfinish = () => root.remove();
    opts.onClose?.();
  }
}
