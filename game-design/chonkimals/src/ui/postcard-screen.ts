// Camp Post Cards — Mr Kodak's Photo Booth screen. Every snapshot he's taken of you, dressed
// up as a Camp Chonkton souvenir post card (postcards/postcard-art.ts): flip through them,
// give one a New Look (the next card design), or Share it (the system share sheet, else a
// PNG download). Opening a card marks it seen, which clears the HUD photo button's count.

import { COLORS, FONT, buttonRadius, textOutline } from './theme';
import { el, headerPlaque, PLAQUE_SCREEN, pressable } from './components';
import { headerRow, pillButton } from './store-components';
import { StoreScreen, campBackdrop, scroller } from './store-screens';
import { speechBubble } from './dialogue';
import { economy, premium } from '../economy';
import { photoAlbum, type Photo } from '../postcards/album';
import { POSTCARD_STYLES, renderPostcard } from '../postcards/postcard-art';
import { icon, withLeadIcon } from './icons';

export interface PostcardScreenOptions {
  /** Signs the notes on the cards ("Love, …"). */
  playerName: string;
  onAddPremium?: () => void;
}

const TEXT = `font-family:${FONT};line-height:normal;`;
const CARD_W = 1000;

export class PostcardScreen extends StoreScreen {
  private index = 0;
  private readonly newIds: Set<string>;
  private stage: HTMLElement;
  private pager: HTMLElement;
  private styleLabel: HTMLElement;
  private thumbs: HTMLElement;
  private actions: HTMLElement;
  private bubbleText: HTMLElement;
  private current: HTMLCanvasElement | null = null;
  private drawToken = 0;
  private unsubs: (() => void)[] = [];

  constructor(host: HTMLElement, private opts: PostcardScreenOptions) {
    super(host);
    const f = this.frame;
    campBackdrop(f);
    // Cards that were new when you walked in keep their NEW tag while you're here.
    this.newIds = new Set(photoAlbum.photos.filter((p) => !p.seen).map((p) => p.id));

    const row = headerRow({ backSize: 80, coins: economy.balance, onBack: () => this.close(),
      premium: premium.balance, onAddPremium: opts.onAddPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;
    row.root.style.cssText += 'position:absolute;left:24px;top:40px;';

    const plaque = headerPlaque('Camp Post Cards', PLAQUE_SCREEN, 0.86);
    plaque.root.style.cssText += `left:${(1080 - 820 * 0.86) / 2}px;top:160px;`;

    const n = this.newIds.size;
    const line = photoAlbum.photos.length === 0
      ? "No snaps yet! Win a minigame or pull off something spectacular — I'll be there with my camera. 📸"
      : n > 0 ? `Fresh from the darkroom! ${n === 1 ? 'A new post card' : `${n} new post cards`} for you. Wish your friends were here? Share one!`
        : 'Every one a keeper! Tap New Look to try another card design.';
    const bubble = speechBubble('Mr Kodak', line);
    bubble.hint.remove();
    this.bubbleText = bubble.text;
    bubble.root.style.cssText += 'position:absolute;left:50%;top:320px;transform:translateX(-50%);width:960px;padding:26px 34px;';
    bubble.name.style.fontSize = '34px';
    bubble.text.style.fontSize = '32px';
    bubble.text.style.minHeight = '0';

    // The card itself, with swipe to flip.
    this.stage = el('div', `position:absolute;left:${(1080 - CARD_W) / 2}px;top:560px;width:${CARD_W}px;` +
      `height:${CARD_W * 2 / 3}px;display:flex;align-items:center;justify-content:center;touch-action:pan-y;`);
    let downX = 0, downT = 0;
    this.stage.addEventListener('pointerdown', (e) => { downX = e.clientX; downT = performance.now(); });
    this.stage.addEventListener('pointerup', (e) => {
      const s = this.frame.getBoundingClientRect().width / 1080;
      const dx = (e.clientX - downX) / s;
      if (Math.abs(dx) > 90 && performance.now() - downT < 700) this.go(dx < 0 ? 1 : -1);
    });

    // Pager: ‹  3 / 7  ›, with the style name under it.
    this.pager = el('div', 'position:absolute;left:0;right:0;top:1262px;display:flex;align-items:center;justify-content:center;gap:40px;');
    this.styleLabel = el('p', `${TEXT}position:absolute;left:0;right:0;top:1372px;text-align:center;font-weight:600;` +
      `font-size:30px;color:#fff;text-shadow:${textOutline(COLORS.brownDark, 2.4)};`);

    this.actions = el('div', 'position:absolute;left:0;right:0;top:1440px;display:flex;justify-content:center;gap:36px;');
    const look = withLeadIcon(pillButton('New Look', () => this.restyle()), icon('ui', 'new_look'), 56);
    const share = withLeadIcon(pillButton('Share', () => void this.share()), icon('social', 'share'), 56);
    this.actions.append(look, share);

    // Every photo as a thumbnail, newest first.
    this.thumbs = scroller('position:absolute;left:40px;right:40px;top:1580px;bottom:40px;display:grid;' +
      'grid-template-columns:repeat(4,minmax(0,1fr));gap:22px;align-content:start;padding:8px 4px 20px;');

    f.append(this.stage, this.pager, this.styleLabel, this.actions, this.thumbs, plaque.root, bubble.root, row.root);
    this.unsubs.push(economy.subscribe((c) => this.setCoins(c)), premium.subscribe((c) => this.setPremium(c)),
      photoAlbum.subscribe(() => this.renderThumbs()));
    this.onClose(() => this.unsubs.forEach((u) => u()));
    // Start on the oldest new card (you read them in the order they were taken), else the newest.
    let oldestNew = -1;
    photoAlbum.photos.forEach((p, i) => { if (this.newIds.has(p.id)) oldestNew = i; });
    this.index = Math.max(0, oldestNew);
    this.mount((h) => {
      // Short screens: the thumbnails would have no room — hide them.
      this.thumbs.style.display = h < 1800 ? 'none' : 'grid';
    });
    this.show(0);
  }

  private get photo(): Photo | undefined { return photoAlbum.photos[this.index]; }

  private go(step: number): void {
    const n = photoAlbum.photos.length;
    if (n < 2) return;
    this.index = (this.index + step + n) % n;
    this.show(step);
  }

  private show(dir: number): void {
    const p = this.photo;
    this.renderPager();
    this.renderThumbs();
    const hasPhoto = !!p;
    this.actions.style.visibility = hasPhoto ? 'visible' : 'hidden';
    if (!p) {
      this.stage.replaceChildren(emptyCard());
      this.styleLabel.textContent = '';
      return;
    }
    photoAlbum.markSeen(p.id);
    this.styleLabel.textContent = `${p.caption} · ${POSTCARD_STYLES[p.style % POSTCARD_STYLES.length].name} card`;
    const token = ++this.drawToken;
    void renderPostcard(p, this.opts.playerName).then((canvas) => {
      if (token !== this.drawToken || this.isClosed) return;
      this.current = canvas;
      const wrap = el('div', 'position:relative;');
      canvas.style.cssText = `display:block;width:${CARD_W}px;height:auto;border-radius:22px;` +
        'box-shadow:0 18px 0 rgba(58,36,21,0.55),0 26px 40px rgba(0,0,0,0.35);';
      wrap.appendChild(canvas);
      if (this.newIds.has(p.id)) {
        wrap.appendChild(el('p', `${TEXT}position:absolute;left:-14px;top:-22px;background:#e8483f;color:#fff;` +
          'font-weight:700;font-size:34px;padding:6px 26px;border-radius:24px;border:5px solid #fff;transform:rotate(-8deg);' +
          'box-shadow:0 6px 0 rgba(0,0,0,0.25);', 'NEW!'));
      }
      this.stage.replaceChildren(wrap);
      const from = dir === 0 ? 'translateY(40px) rotate(-2deg) scale(0.94)' : `translateX(${dir * 160}px) rotate(${dir * 3}deg)`;
      wrap.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
    });
  }

  private renderPager(): void {
    const n = photoAlbum.photos.length;
    const arrow = (txt: string, step: number) => {
      const b = el('div', `width:96px;height:96px;border-radius:${buttonRadius(96)}px;background:${COLORS.cream};border:6px solid ${COLORS.brown};` +
        `box-shadow:0 8px 0 ${COLORS.brownDark};display:flex;align-items:center;justify-content:center;cursor:pointer;` +
        `${TEXT}font-weight:700;font-size:56px;color:${COLORS.brown};` + (n < 2 ? 'opacity:0.4;' : ''), txt);
      pressable(b, 8, () => this.go(step));
      return b;
    };
    const count = el('p', `${TEXT}font-weight:700;font-size:44px;color:#fff;min-width:170px;text-align:center;` +
      `text-shadow:${textOutline(COLORS.brownDark, 3)};`, n ? `${this.index + 1} / ${n}` : '0 / 0');
    this.pager.replaceChildren(arrow('‹', -1), count, arrow('›', 1));
  }

  private renderThumbs(): void {
    const photos = photoAlbum.photos;
    this.thumbs.replaceChildren(...photos.map((p, i) => {
      const on = i === this.index;
      const t = el('div', `position:relative;aspect-ratio:3/2;border-radius:18px;overflow:visible;cursor:pointer;` +
        `border:${on ? 7 : 5}px solid ${on ? '#ffc629' : '#fffaf0'};box-shadow:0 6px 0 rgba(58,36,21,0.5);background:#fffaf0;`);
      const img = el('img', 'width:100%;height:100%;object-fit:cover;border-radius:12px;display:block;pointer-events:none;');
      img.src = p.image;
      img.alt = p.caption;
      t.appendChild(img);
      if (!p.seen) {
        t.appendChild(el('div', 'position:absolute;right:-10px;top:-10px;width:30px;height:30px;border-radius:15px;' +
          'background:#e8483f;border:4px solid #fff;'));
      }
      pressable(t, 0, () => { if (i !== this.index) { const d = i > this.index ? 1 : -1; this.index = i; this.show(d); } });
      return t;
    }));
  }

  private restyle(): void {
    const p = this.photo;
    if (!p) return;
    photoAlbum.cycleStyle(p.id);
    this.show(0);
  }

  private async share(): Promise<void> {
    const p = this.photo, c = this.current;
    if (!p || !c) return;
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (!blob) return;
    const name = `camp-chonkton-${p.id}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    try {
      if (nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: 'Camp Chonkton', text: `Wish you were here! ${p.caption} 🏕️` });
        return;
      }
    } catch { return; /* cancelled */ }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    this.bubbleText.textContent = 'Saved! Now show your friends what they\'re missing. 🏕️';
  }
}

function emptyCard(): HTMLElement {
  const c = el('div', `width:${CARD_W}px;height:${CARD_W * 2 / 3}px;border-radius:22px;background:#fffaf0;` +
    `border:8px dashed ${COLORS.cardBorder};box-sizing:border-box;display:flex;flex-direction:column;align-items:center;` +
    'justify-content:center;gap:18px;');
  c.append(el('p', 'font-size:140px;line-height:1;', '📷'),
    el('p', `${TEXT}font-weight:700;font-size:44px;color:${COLORS.brown};`, 'Your post cards will show up here'));
  return c;
}

export function showPostcards(host: HTMLElement, opts: PostcardScreenOptions): PostcardScreen {
  return new PostcardScreen(host, opts);
}
