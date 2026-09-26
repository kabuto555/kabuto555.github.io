// Camp Mail — the daily login reward screen (no Figma mock yet), opened at the camp
// Mailbox. A letter from the counselors over the camp backdrop with the 7-day streak
// calendar: claimed days get a stamp, today's tile glows, day 7 is the big one.
// Claim grants the reward (daily-rewards.ts) and flies its icon up to the wallet.

import { COLORS, FONT, textOutline } from './theme';
import { critterHeader, el, PLAQUE_SCREEN } from './components';
import { headerRow, pillButton } from './store-components';
import { StoreScreen, campBackdrop } from './store-screens';
import { beadIcon, pineconeIcon } from './bead-art';
import { economy, premium, PREMIUM, SOFT } from '../economy';
import { DAILY_REWARDS, dailyRewards, type DailyReward } from '../daily-rewards';
import { playClaim } from '../minigame-sounds';

export interface MailScreenOptions {
  onAddPremium?: () => void;
  onClaimed?: (day: number, reward: DailyReward) => void;
  onBack?: () => void;
}

const TEXT = `font-family:${FONT};line-height:normal;`;
const PAPER = '#fff8ea';
const INK = '#6d4a30';
const GLOW = '#ffc629';

export class MailScreen extends StoreScreen {
  private grid: HTMLElement;
  private claimBtn: HTMLElement;
  private claimLabel: HTMLElement;
  private note: HTMLElement;
  private tiles: HTMLElement[] = [];
  private timer = 0;
  private unsubs: (() => void)[] = [];

  constructor(host: HTMLElement, private opts: MailScreenOptions = {}) {
    super(host);
    const f = this.frame;
    campBackdrop(f);

    const row = headerRow({ backSize: 80, coins: economy.balance, onBack: () => (opts.onBack ?? (() => this.close()))(),
      premium: premium.balance, onAddPremium: opts.onAddPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;
    row.root.style.cssText += 'position:absolute;left:24px;top:40px;';

    const header = critterHeader('Camp Mail', { style: PLAQUE_SCREEN });
    header.root.style.cssText += 'position:absolute;left:130px;top:150px;transform:scale(0.86);transform-origin:50% 0;';

    // The letter.
    const letter = el('div',
      `position:absolute;left:50px;right:50px;top:590px;background:${PAPER};border:8px solid ${COLORS.cardBorder};` +
      `box-shadow:0 14px 0 ${COLORS.cardShadow};border-radius:48px;padding:48px 44px 50px;display:flex;flex-direction:column;` +
      'align-items:center;gap:26px;');
    // Airmail stripes along the top edge + a postage stamp.
    letter.appendChild(el('div', 'position:absolute;left:40px;right:40px;top:14px;height:12px;border-radius:6px;' +
      'background:repeating-linear-gradient(90deg,#e8483f 0 34px,transparent 34px 52px,#3a6fa8 52px 86px,transparent 86px 104px);'));
    const stamp = el('div', `position:absolute;right:34px;top:40px;width:110px;height:130px;background:#fff;border-radius:8px;` +
      'border:6px dashed #dfc3a5;display:flex;align-items:center;justify-content:center;transform:rotate(6deg);font-size:64px;', '🏕️');
    letter.appendChild(stamp);
    letter.append(
      el('p', `${TEXT}font-weight:700;font-size:48px;color:${INK};align-self:flex-start;`, 'Dear Camper,'),
      el('p', `${TEXT}font-weight:500;font-size:32px;color:#8a6a52;align-self:flex-start;max-width:720px;`,
        'The counselors packed you a little something! Come back every day — day 7 is extra special.'),
    );
    this.grid = el('div', 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;width:100%;margin-top:6px;');
    letter.appendChild(this.grid);
    this.note = el('p', `${TEXT}font-weight:600;font-size:30px;color:#8a6a52;text-align:center;min-height:40px;`);
    this.claimBtn = pillButton('Claim!', () => this.claim(), 'done');
    this.claimLabel = this.claimBtn.firstElementChild as HTMLElement;
    letter.append(this.claimBtn, this.note,
      el('p', `${TEXT}font-weight:600;font-size:34px;color:${INK};align-self:flex-end;margin-top:-6px;`, '— The Counselors ♥'));

    f.append(letter, header.root, row.root);
    this.render();
    this.unsubs.push(economy.subscribe((n) => this.setCoins(n)), premium.subscribe((n) => this.setPremium(n)),
      dailyRewards.subscribe(() => this.render()));
    this.timer = window.setInterval(() => this.updateNote(), 30_000);
    this.onClose(() => { this.unsubs.forEach((u) => u()); clearInterval(this.timer); });
    this.mount();
  }

  private render(): void {
    const claimed = dailyRewards.claimedInCycle;
    const can = dailyRewards.canClaim;
    const today = can ? dailyRewards.nextDay : 0;
    this.tiles = DAILY_REWARDS.map((r, i) => dayTile(i + 1, r, i + 1 <= claimed, i + 1 === today));
    this.grid.replaceChildren(...this.tiles);
    this.claimBtn.dataset.disabled = can ? '0' : '1';
    this.claimBtn.style.opacity = can ? '1' : '0.55';
    this.claimLabel.textContent = can ? 'Claim!' : 'Claimed ✓';
    this.updateNote();
  }

  private updateNote(): void {
    if (dailyRewards.canClaim) {
      const day = dailyRewards.nextDay;
      this.note.textContent = day === 1 && dailyRewards.claimedInCycle === 0 ? 'Start your streak today!' : `Day ${day} of your streak`;
      return;
    }
    const ms = dailyRewards.msUntilTomorrow();
    const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000);
    this.note.textContent = `New mail in ${h}h ${m}m`;
  }

  private claim(): void {
    const res = dailyRewards.claim(); // re-renders via subscribe
    if (!res) return;
    playClaim();
    // Pop the claimed tile and fly its icon up to the wallet.
    const tile = this.tiles[res.day - 1];
    tile?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 360, easing: 'ease-out' });
    const icon = tile?.querySelector('[data-icon]') as HTMLElement | null;
    const wallet = this.premiumWallet?.root ?? this.wallet.root;
    if (icon) {
      const fr = this.frame.getBoundingClientRect(), s = fr.width / 1080;
      const a = icon.getBoundingClientRect(), b = wallet.getBoundingClientRect();
      for (let i = 0; i < 6; i++) {
        const fly = icon.cloneNode(true) as HTMLElement;
        fly.style.cssText += `position:absolute;left:${(a.left - fr.left) / s}px;top:${(a.top - fr.top) / s}px;z-index:10;pointer-events:none;`;
        this.frame.appendChild(fly);
        const dx = (b.left + b.width * 0.35 - a.left) / s, dy = (b.top + b.height / 2 - a.top) / s;
        const jx = (Math.random() - 0.5) * 160;
        fly.animate([
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.3 + jx}px,${dy * 0.2 - 120}px) scale(1.3)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px,${dy}px) scale(0.6)`, opacity: 0.2 },
        ], { duration: 700 + i * 70, easing: 'ease-in', delay: i * 50 }).onfinish = () => fly.remove();
      }
    }
    this.opts.onClaimed?.(res.day, res.reward);
  }
}

function dayTile(day: number, r: DailyReward, claimed: boolean, today: boolean): HTMLElement {
  const big = day === 7;
  const tile = el('div',
    `position:relative;background:${today ? '#fff3c4' : '#fff'};border:${today ? 7 : 5}px solid ${today ? GLOW : COLORS.cardBorder};` +
    `border-radius:30px;padding:14px 8px 16px;display:flex;flex-direction:column;align-items:center;gap:6px;` +
    `box-shadow:0 6px 0 ${today ? '#d99a00' : COLORS.cardShadow};${big ? 'grid-column:span 2;' : ''}` +
    (claimed ? 'opacity:0.6;' : ''));
  tile.appendChild(el('p', `${TEXT}font-weight:700;font-size:28px;color:${today ? '#8a5a00' : INK};`, big ? 'Day 7 ★' : `Day ${day}`));
  const icon = el('div', 'display:flex;align-items:center;justify-content:center;height:96px;');
  icon.dataset.icon = '1';
  const n = big ? 3 : 1;
  for (let i = 0; i < n; i++) {
    const ic = r.kind === 'beads' ? beadIcon(64) : pineconeIcon(big ? 88 : 76);
    if (n > 1) ic.style.margin = '0 -10px';
    icon.appendChild(ic);
  }
  tile.appendChild(icon);
  tile.appendChild(el('p', `${TEXT}font-weight:700;font-size:34px;color:#fff;text-shadow:${textOutline(INK, 3)};`,
    `×${r.amount}`));
  tile.appendChild(el('p', `${TEXT}font-weight:600;font-size:20px;color:#8a6a52;text-align:center;`,
    r.kind === 'beads' ? SOFT.name : r.kind === 'pinecones' && r.note ? r.note : PREMIUM.name));
  if (claimed) {
    tile.appendChild(el('div', `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;` +
      `${TEXT}font-weight:700;font-size:78px;color:#4f8f33;transform:rotate(-12deg);text-shadow:0 3px 0 #fff;`, '✓'));
  }
  if (today) {
    tile.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-8px)' }],
      { duration: 700, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  }
  return tile;
}

export function showMail(host: HTMLElement, opts?: MailScreenOptions): MailScreen {
  return new MailScreen(host, opts);
}
