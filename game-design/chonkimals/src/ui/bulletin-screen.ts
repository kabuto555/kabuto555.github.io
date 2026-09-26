// Bulletin Board screen (no Figma mock yet) — opened at the camp's Bulletin Board.
// Like the Care Package screen, the real content lives in 3D: a live stage
// (bulletin/board-stage.ts) fills the screen with the board itself, and the kit
// chrome floats on top — header row (back · wallet), a "tap a notice" hint, and,
// while a notice is up close, its buttons:
//   Camp Map          Pin it back
//   Camp News         Pin it back (reading it clears the unread dots / "!")
//   Leaderboard       board tabs (Camp Stars / Sumo / Dodge Ball) + Pin it back
//   Daily Challenge   Claim! (stamps it DONE and pays out) + Pin it back

import { COLORS, FONT, textOutline } from './theme';
import { el } from './components';
import { headerRow, pillButton, tabBar } from './store-components';
import { StoreScreen } from './store-screens';
import { economy, premium } from '../economy';
import { BoardStage } from '../bulletin/board-stage';
import { bulletin } from '../bulletin/bulletin';
import { BOARDS, type BoardId } from '../bulletin/bulletin-presets';
import type { PaperData, PaperKind } from '../bulletin/papers';
import type { DailyReward } from '../daily-rewards';
import { sfxReveal, unlockCarePackageAudio } from '../care-package/sfx';

export interface BulletinScreenOptions {
  /** Live data for the notices (map, player position + name). */
  paperData: () => Omit<PaperData, 'board'>;
  onAddPremium?: () => void;
  onClaimed?: (r: DailyReward) => void;
  onBack?: () => void;
  /** Open straight onto a notice (dev deep link). */
  focus?: PaperKind;
}

const TEXT = `font-family:${FONT};line-height:normal;`;

export class BulletinScreen extends StoreScreen {
  private stage: BoardStage;
  private board: BoardId = 'stars';
  private hint: HTMLElement;
  private bar: HTMLElement;
  private unsubs: (() => void)[] = [];

  constructor(host: HTMLElement, private opts: BulletinScreenOptions) {
    super(host);
    const stageHost = el('div', 'position:absolute;inset:0;');
    this.root.insertBefore(stageHost, this.frame);
    this.stage = new BoardStage(stageHost, () => ({ ...opts.paperData(), board: this.board }));
    this.stage.onTap = (k) => this.onTap(k);
    this.onClose(() => { this.unsubs.forEach((u) => u()); setTimeout(() => this.stage.dispose(), 200); });

    const f = this.frame;
    f.style.cssText += 'display:flex;flex-direction:column;align-items:center;padding:40px 24px 0;pointer-events:none;';
    const row = headerRow({ backSize: 80, coins: economy.balance, onBack: () => this.back(),
      premium: premium.balance, onAddPremium: opts.onAddPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;
    row.root.style.pointerEvents = 'auto';

    this.hint = el('p', `${TEXT}position:absolute;left:0;right:0;bottom:150px;text-align:center;font-weight:700;font-size:44px;` +
      `color:#fff;text-shadow:${textOutline(COLORS.brownDark, 3.4)};transition:opacity 200ms;`, 'Tap a notice to read it!');
    this.hint.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }],
      { duration: 1600, iterations: Infinity, easing: 'ease-in-out' });
    this.bar = el('div', 'position:absolute;left:0;right:0;bottom:90px;display:flex;flex-direction:column;align-items:center;' +
      'gap:26px;pointer-events:none;');
    f.append(row.root, this.hint, this.bar);

    this.unsubs.push(
      economy.subscribe((n) => this.setCoins(n)),
      premium.subscribe((n) => this.setPremium(n)),
      bulletin.subscribe(() => this.syncAlerts()),
    );
    this.syncAlerts();
    this.mount();
    if (opts.focus) setTimeout(() => this.onTap(opts.focus!), 900);
  }

  private back(): void {
    if (this.stage.focused) void this.unfocus();
    else (this.opts.onBack ?? (() => this.close()))();
  }

  private syncAlerts(): void {
    this.stage.setAlerts({ news: bulletin.unreadCount > 0, challenge: bulletin.challengeUnseen || bulletin.claimable });
  }

  private onTap(k: PaperKind | null): void {
    if (this.stage.busy) return;
    if (this.stage.focused) { if (k !== this.stage.focused) void this.unfocus(); return; }
    if (k) void this.focus(k);
  }

  private async focus(k: PaperKind): Promise<void> {
    this.hint.style.opacity = '0';
    if (k === 'challenge') bulletin.markChallengeSeen();
    await this.stage.focus(k);
    if (this.isClosed) return;
    this.showBar(k);
    // News: you've read it now (the dots clear when it goes back on the board).
    if (k === 'news') bulletin.markAllRead();
  }

  private async unfocus(): Promise<void> {
    const k = this.stage.focused;
    this.bar.replaceChildren();
    await this.stage.unfocus();
    if (this.isClosed) return;
    if (k === 'news') this.stage.redraw('news');
    this.hint.style.opacity = '1';
  }

  private showBar(k: PaperKind): void {
    const items: HTMLElement[] = [];
    if (k === 'ranks') {
      const i = BOARDS.findIndex((b) => b.id === this.board);
      const tabs = tabBar(BOARDS.map((b) => b.tab), i, (n) => { this.board = BOARDS[n].id; this.stage.redraw('ranks'); },
        { width: 900, scale: 1.25 });
      items.push(tabs.root);
    }
    if (k === 'challenge' && bulletin.claimable) {
      items.push(pillButton('Claim!', () => void this.claim(), 'play'));
    }
    items.push(pillButton('Pin it back', () => void this.unfocus(), 'getMore'));
    items.forEach((it) => { it.style.pointerEvents = 'auto'; });
    this.bar.replaceChildren(...items);
    this.bar.animate([{ opacity: 0, transform: 'translateY(40px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 220, easing: 'ease-out' });
  }

  private async claim(): Promise<void> {
    const r = bulletin.claim();
    if (!r) return;
    this.bar.replaceChildren();
    unlockCarePackageAudio();
    sfxReveal(2, true);
    await this.stage.stamp('challenge');
    if (this.isClosed) return;
    this.opts.onClaimed?.(r);
    this.showBar('challenge');
  }
}

export function showBulletinBoard(host: HTMLElement, opts: BulletinScreenOptions): BulletinScreen {
  return new BulletinScreen(host, opts);
}
