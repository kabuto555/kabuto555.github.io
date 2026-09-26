// Camp Pass screen (our battle pass; no Figma mock yet — built from the kit so it matches
// Settings / Leaderboard / Shop). Over the camp backdrop:
//   header row (back · wallets), compact critter header,
//   the stamp card (season · stamps earned · points to the next stamp · Premium),
//   Goals / Drives / Rewards tabs over a cream content panel of section cards.
// Goals: ready-to-claim first, then in progress, then every step already claimed.
// Drives: the timed Community Drive (progress, your rank, leaderboard, percentile bonuses)
// and your Scout Troop's three Troop Drives. Live numbers tick every second.
// Rewards: the tier track — free reward · stamp · premium reward — with Claim buttons
// on every stamped tier. Claiming pops a reward card (a Care Package offers "Open now").
// Goals and Rewards each get a "Claim all" once two or more things are waiting.
//
// Styling is kit-only: COLORS / MENU tokens, the system card (itemCard's white card), section
// cards, pill buttons (row sizes), the slider track as the progress bar and the clay modal for
// popups. Premium uses the Shop's blue BUY tone; claimable things glow in the coin gold.

import { COLORS, FONT, textOutline } from './theme';
import { clayCard, critterHeader, dragToScroll, el } from './components';
import { headerRow, pillButton, tabBar } from './store-components';
import { icon, iconImg, withLeadIcon } from './icons';
import { contentPanel, MENU, sectionCard } from './menu-components';
import { StoreScreen, campBackdrop, scroller } from './store-screens';
import { beadIcon, pineconeIcon } from './bead-art';
import { economy, premium, PREMIUM, SOFT } from '../economy';
import { campPass, type GoalView, type PassTrack } from '../camp-pass/camp-pass';
import { PASS, TIERS, goalTitle, type PassReward } from '../camp-pass/content';
import { KIND_INFO, itemById, type Item } from '../inventory/items';
import { CARE_PACKAGE_TOKEN, RARITY_INFO } from '../care-package/rewards';
import { rewardArtUrl } from '../care-package/reward-art';
import { sfxReveal, unlockCarePackageAudio } from '../care-package/sfx';
import { playClaim } from '../minigame-sounds';
import { communityDrive, type DriveReward } from '../drives/community-drive';
import { troopDrives, type TroopDriveReward } from '../drives/troop-drives';
import { COMMUNITY_DRIVE, PERCENTILE_TIERS, TROOP_DRIVE } from '../drives/content';
import { playerTroop } from '../troops';
import { bulletin } from '../bulletin/bulletin';

export interface CampPassScreenOptions {
  /** Not enough golden pinecones for Premium → the Shop's Pinecones tab. */
  onGetPremium?: () => void;
  onAddCoins?: () => void;
  /** "Open now" on a claimed Care Package. */
  onOpenCarePackage?: () => void;
  onBack?: () => void;
  /** The Bulletin Board, opened on today's challenge. */
  onOpenBoard?: () => void;
  /** 0 = Goals, 1 = Drives, 2 = Rewards. */
  tab?: number;
  /** The Community Drive leaderboard. */
  onShowDriveLeaderboard?: () => void;
  /** "Find a troop" when you're not in one. */
  onFindTroop?: () => void;
}

const REWARDS_TAB = 2;
const DRIVES_TAB = 1;

const TEXT = `font-family:${FONT};line-height:normal;`;
/** Type ramp for list rows (kit weights + inks, sized for 837-wide section-card rows). */
const T = {
  title: `${TEXT}font-weight:600;font-size:30px;color:${COLORS.ink};`,
  body: `${TEXT}font-weight:600;font-size:24px;color:${MENU.sectionInk};`,
  caption: `${TEXT}font-weight:500;font-size:21px;color:${COLORS.brown};`,
  number: `${TEXT}font-weight:600;font-size:24px;color:${MENU.valueInk};text-align:right;flex-shrink:0;`,
  points: `font-weight:700;color:${COLORS.coinInk};`,
  /** Popups (clay modal). */
  kicker: `${TEXT}font-weight:600;font-size:26px;color:${MENU.sectionInk};letter-spacing:2px;`,
  popTitle: `${TEXT}font-weight:700;font-size:48px;color:${COLORS.ink};text-align:center;`,
  popBody: `${TEXT}font-weight:500;font-size:28px;color:${COLORS.brown};text-align:center;`,
};

export class CampPassScreen extends StoreScreen {
  private stampCard: HTMLElement;
  private body: HTMLElement;
  private tab: number;
  private tabs: ReturnType<typeof tabBar>;
  private sheet: HTMLElement | null = null;
  private unsubs: (() => void)[] = [];
  /** Drives tab: per-second updaters for the live numbers, and the layout they belong to. */
  private live: (() => void)[] = [];
  private driveShape = '';

  constructor(host: HTMLElement, private opts: CampPassScreenOptions = {}) {
    super(host);
    const f = this.frame;
    campBackdrop(f);
    const col = el('div', 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:20px;padding:40px 24px 0;');

    const row = headerRow({ backSize: 80, coins: economy.balance, onBack: () => (opts.onBack ?? (() => this.close()))(),
      onAddCoins: opts.onAddCoins, premium: premium.balance, onAddPremium: opts.onGetPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;

    // Same title block as the Shop (compact critter header).
    const header = critterHeader('Camp Pass', { compact: true });
    header.root.style.marginTop = '-12px';

    this.stampCard = systemCard(false, 'width:1000px;padding:24px 30px;gap:28px;');

    this.tab = opts.tab ?? 0;
    this.tabs = tabBar(['Goals', 'Drives', 'Rewards'], this.tab, (i) => { this.tab = i; this.render(true); }, { width: 1000 });

    // Tab content scrolls inside the Settings-style cream panel.
    const panel = contentPanel('flex:1 1 0;min-height:0;overflow:hidden;margin-bottom:48px;');
    this.body = scroller('flex:1 1 0;min-height:0;width:891.923px;display:flex;flex-direction:column;gap:15.46px;' +
      'align-items:center;padding:14px 0 40px;margin:-14px 0;');
    panel.appendChild(this.body);

    col.append(row.root, header.root, this.stampCard, this.tabs.root, panel);
    f.appendChild(col);
    this.render(true);
    this.unsubs.push(
      economy.subscribe((n) => this.setCoins(n)),
      premium.subscribe((n) => this.setPremium(n)),
      campPass.subscribe(() => this.render(false)),
      bulletin.subscribe(() => { if (this.tab === 0) this.render(false); }),
      communityDrive.subscribe(() => { if (this.tab === DRIVES_TAB) this.render(false); }),
      troopDrives.subscribe(() => { if (this.tab === DRIVES_TAB) this.render(false); }),
    );
    // Live drive numbers; a full re-render only when the drive layout changes (a claim appears…).
    const timer = window.setInterval(() => {
      if (this.tab !== DRIVES_TAB || this.sheet) return;
      if (drivesShape() !== this.driveShape) this.render(false);
      else this.live.forEach((f) => f());
    }, 1000);
    this.unsubs.push(() => clearInterval(timer));
    this.onClose(() => this.unsubs.forEach((u) => u()));
    this.mount();
    if (this.tab === REWARDS_TAB) requestAnimationFrame(() => this.scrollToCurrentTier());
  }

  /** `reset` scrolls back to the top (tab change); otherwise the scroll position is kept. */
  private render(reset: boolean): void {
    this.renderStampCard();
    const top = this.body.scrollTop;
    this.live = [];
    this.body.replaceChildren(...(this.tab === 0 ? this.goalsTab() : this.tab === DRIVES_TAB ? this.drivesTab() : this.rewardsTab()));
    this.body.scrollTop = reset ? 0 : top;
    if (reset && this.tab === REWARDS_TAB) requestAnimationFrame(() => this.scrollToCurrentTier());
  }

  private renderStampCard(): void {
    const stamps = campPass.stamps, max = campPass.tierCount;
    const stamp = stampBadge(String(stamps), stamps > 0, 130);
    const mid = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;');
    mid.append(
      el('p', T.caption, PASS.season),
      el('p', `${TEXT}font-weight:600;font-size:38px;color:${COLORS.ink};`, `${stamps} / ${max} stamps`),
      progressBar(campPass.pointsIntoStamp, PASS.pointsPerStamp),
      el('p', T.caption, stamps >= max
        ? 'Pass complete — you\'re a camp legend!'
        : `${campPass.pointsIntoStamp} / ${PASS.pointsPerStamp} points to your next stamp`),
    );
    const prem = el('div', 'display:flex;flex-direction:column;align-items:center;gap:10px;flex-shrink:0;');
    if (campPass.hasPremium) {
      prem.append(tag('Premium', 'blue', 26, icon('pass', 'premium')));
    } else {
      prem.append(withLeadIcon(pillButton('Premium', () => this.confirmPremium(), 'row', 'blue'), icon('pass', 'premium')),
        el('p', T.caption, 'Unlock more rewards'));
    }
    this.stampCard.replaceChildren(stamp, mid, prem);
  }

  // ── Goals ───────────────────────────────────────────────────────────────

  private goalsTab(): HTMLElement[] {
    const views = campPass.goals();
    const ready = views.filter((g) => g.complete);
    const going = views.filter((g) => g.step && !g.complete)
      .sort((a, b) => b.value / b.step!.target - a.value / a.step!.target);
    // Today's Bulletin Board challenge rides on top (it pays Camp Pass points too).
    const out: HTMLElement[] = [section('DAILY CHALLENGE', [this.dailyCard()])];
    if (ready.length) {
      const all: HTMLElement | undefined = ready.length > 1
        ? pillButton('Claim all!', () => this.claimAllGoals(all!), 'rowSmall') : undefined;
      out.push(section(`READY TO CLAIM · ${ready.length}`, ready.map((g) => this.goalCard(g)), all));
    }
    if (going.length) out.push(section('IN PROGRESS', going.map((g) => this.goalCard(g))));
    // Every step claimed so far (per goal, latest step first).
    const done: HTMLElement[] = [];
    for (const g of views) {
      for (let i = g.claimedSteps - 1; i >= 0; i--) done.push(doneRow(g.line.emoji, goalTitle(g.line, g.line.steps[i])));
    }
    if (done.length) out.push(section(`COMPLETED · ${done.length}`, done));
    return out;
  }

  private claimAllGoals(btn: HTMLElement): void {
    const from = btn.getBoundingClientRect(); // before the claims re-render the list
    const got = campPass.claimAllGoals();
    if (!got.length) return;
    playClaimBurst(got.length);
    this.flyToWallet(from);
  }

  private goalCard(g: GoalView): HTMLElement {
    const step = g.step!;
    const card = systemCard(g.complete);
    const icon = iconTile(g.line.emoji, g.complete);
    const mid = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;');
    const meta = el('div', `display:flex;align-items:center;gap:12px;${T.body}`);
    if (g.line.steps.length > 1) meta.appendChild(el('span', T.caption, `Step ${g.claimedSteps + 1} of ${g.line.steps.length}`));
    meta.append(ticket(30), el('span', `${T.points}margin-left:-6px;`, `+${step.points} pts`), beadIcon(28), el('span', 'margin-left:-6px;', `+${step.beads}`));
    mid.append(el('p', T.title, goalTitle(g.line, step)), meta,
      progressRow(Math.min(g.value, step.target), step.target, `${Math.min(g.value, step.target)}/${step.target}`));
    card.append(icon, mid);
    if (g.complete) {
      card.appendChild(pulse(pillButton('Claim!', () => {
        const from = icon.getBoundingClientRect(); // before the claim re-renders the list
        if (!campPass.claimGoal(g.line.id)) return;
        playClaim();
        this.flyToWallet(from);
      }, 'row')));
    }
    return card;
  }

  /** Today's Bulletin Board challenge: progress, reward (beads/pinecones + pass points), claim. */
  private dailyCard(): HTMLElement {
    const c = bulletin.challenge, claimable = bulletin.claimable, claimed = bulletin.claimed;
    const card = systemCard(claimable);
    const icon = iconTile(c.icon, claimable);
    const mid = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;');
    const ms = bulletin.msUntilTomorrow();
    const left = `New challenge in ${Math.floor(ms / 3.6e6)}h ${Math.floor((ms % 3.6e6) / 6e4)}m`;
    mid.append(el('p', T.title, c.title), rewardChips({ beads: c.reward.kind === 'beads' ? c.reward.amount : 0,
      pinecones: c.reward.kind === 'pinecones' ? c.reward.amount : 0, points: c.passPoints }));
    if (claimed) {
      mid.appendChild(el('p', T.caption, `Done!  ·  ${left}`));
    } else {
      mid.append(progressRow(bulletin.progress, c.goal, `${bulletin.progress}/${c.goal}`),
        el('p', T.caption, `On the Bulletin Board  ·  ${left}`));
    }
    card.append(icon, mid);
    if (claimable) {
      card.appendChild(pulse(pillButton('Claim!', () => {
        const from = icon.getBoundingClientRect();
        if (!bulletin.claim()) return;
        playClaim();
        this.flyToWallet(from);
      }, 'row')));
    } else if (!claimed && this.opts.onOpenBoard) {
      const open = this.opts.onOpenBoard;
      card.appendChild(pillButton('Board', () => { this.close(); open(); }, 'rowSmall', 'light'));
    }
    return card;
  }

  // ── Drives ──────────────────────────────────────────────────────────────

  private drivesTab(): HTMLElement[] {
    this.driveShape = drivesShape();
    const community: HTMLElement[] = [];
    if (communityDrive.view()) community.push(this.communityCard());
    if (communityDrive.last) community.push(this.lastDriveCard());
    const out: HTMLElement[] = [];
    if (community.length) out.push(section('COMMUNITY DRIVE', community));
    out.push(tierTable());

    const troop = playerTroop();
    if (!troop) {
      const card = systemCard(false, 'flex-direction:column;gap:18px;padding:32px 30px;');
      card.append(
        el('p', `${T.title}text-align:center;`, 'Better together!'),
        el('p', `${T.body}font-weight:500;text-align:center;`,
          'Join a scout troop to team up on Troop Drives — three shared goals at a time for pony beads, ' +
          `${PREMIUM.name}, Camp Pass points and troop-only cosmetics.`),
      );
      if (this.opts.onFindTroop) card.appendChild(pillButton('Find a Troop', () => { this.close(); this.opts.onFindTroop?.(); }));
      out.push(section('TROOP DRIVES', [card]));
      return out;
    }
    const rows: HTMLElement[] = [];
    troopDrives.pending().forEach((r, i) => rows.push(this.troopPendingCard(r, i)));
    troopDrives.goals().forEach((_, i) => rows.push(this.troopGoalCard(i)));
    const until = troopDrives.goalsUntilCosmetic;
    rows.push(el('p', `${T.caption}align-self:center;text-align:center;`,
      until ? `A troop-exclusive cosmetic every ${TROOP_DRIVE.cosmeticEvery} goals — next in ${until}` :
        'You\'ve collected every troop cosmetic!'));
    out.push(section(`TROOP DRIVES · ${troop.name}`, rows));
    return out;
  }

  private communityCard(): HTMLElement {
    const v0 = communityDrive.view()!;
    const card = systemCard(v0.complete, 'flex-direction:column;align-items:stretch;gap:14px;');
    const top = el('div', 'display:flex;align-items:center;gap:20px;');
    const timer = tag('', 'dark', 26, icon('pass', 'timer'));
    top.append(iconTile(v0.template.emoji, v0.complete), el('p', `${T.title}flex:1;`, v0.title), timer);
    const barWrap = el('div', 'display:flex;align-items:center;gap:16px;');
    let bar = progressBar(v0.total, v0.target);
    bar.style.flex = '1';
    const count = el('p', `${T.number}min-width:200px;`);
    barWrap.append(bar, count);
    const me = el('p', T.body);
    const actions = el('div', 'display:flex;align-items:center;gap:18px;');
    const note = el('p', `${T.caption}flex:1;`);
    actions.append(note);
    if (this.opts.onShowDriveLeaderboard) {
      actions.appendChild(pillButton('Leaderboard', () => this.opts.onShowDriveLeaderboard?.(), 'rowSmall', 'light'));
    }
    if (v0.canClaimBase) {
      actions.appendChild(pulse(pillButton('Claim!', () => {
        const r = communityDrive.claimBase();
        if (r) this.showBundle('The camp did it!', r);
      }, 'rowSmall')));
    }
    card.append(top, barWrap, me, actions);
    const update = () => {
      const v = communityDrive.view();
      if (!v) return;
      const s = Math.ceil(v.msLeft / 1000);
      (timer.lastChild as HTMLElement).textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      const nb = progressBar(v.total, v.target);
      nb.style.flex = '1';
      bar.replaceWith(nb);
      bar = nb;
      count.textContent = `${v.total.toLocaleString('en-US')} / ${v.target.toLocaleString('en-US')}`;
      const tier = PERCENTILE_TIERS[v.tier];
      me.textContent = v.mine > 0
        ? `You: ${v.mine.toLocaleString('en-US')} · #${v.rank} of ${v.of}${tier ? ` · ${tier.label}` : ''}`
        : 'Chip in to get on the leaderboard!';
      note.textContent = v.complete
        ? (v.canClaimBase ? 'Goal reached! Everyone collects.' : 'Collected · bonus by rank when time\'s up')
        : `Camp reward: +${COMMUNITY_DRIVE.baseReward.beads} beads · +${COMMUNITY_DRIVE.baseReward.points} pts`;
    };
    update();
    this.live.push(update);
    return card;
  }

  private lastDriveCard(): HTMLElement {
    const l = communityDrive.last!;
    const reward = communityDrive.lastReward();
    const card = systemCard(!!reward);
    const tier = PERCENTILE_TIERS[l.tier];
    const mid = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;');
    mid.append(
      el('p', T.title, l.completed ? 'Last drive: complete!' : 'Last drive: missed — this one\'s easier'),
      el('p', T.caption,
        `${l.total.toLocaleString('en-US')} / ${l.target.toLocaleString('en-US')}` +
        (l.mine > 0 ? ` · you gave ${l.mine.toLocaleString('en-US')} (#${l.rank} of ${l.of}${tier ? `, ${tier.label}` : ''})` : '')),
    );
    if (reward) mid.appendChild(rewardChips(reward));
    card.append(iconTile(l.completed ? '🏅' : '⏰', !!reward), mid);
    if (reward) {
      card.appendChild(pulse(pillButton('Claim!', () => {
        const r = communityDrive.claimLast();
        if (r) this.showBundle(tier ? `${tier.label} bonus!` : 'Drive reward', r);
      }, 'row')));
    }
    return card;
  }

  private troopGoalCard(i: number): HTMLElement {
    const g0 = troopDrives.goals()[i];
    const card = systemCard(false);
    const mid = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;');
    const barWrap = el('div', 'display:flex;align-items:center;gap:16px;');
    let bar = progressBar(g0.progress, g0.target);
    bar.style.flex = '1';
    const count = el('p', `${T.number}min-width:140px;`);
    barWrap.append(bar, count);
    const me = el('p', T.body);
    mid.append(el('p', T.title, g0.title), el('p', T.caption, `Level ${g0.level + 1}`), barWrap, me, rewardChips(g0.reward));
    card.append(iconTile(g0.template.emoji, false), mid);
    const update = () => {
      const g = troopDrives.goals()[i];
      if (!g) return;
      const nb = progressBar(g.progress, g.target);
      nb.style.flex = '1';
      bar.replaceWith(nb);
      bar = nb;
      count.textContent = `${g.progress.toLocaleString('en-US')}/${g.target.toLocaleString('en-US')}`;
      me.textContent = g.mine > 0 ? `You've added ${g.mine.toLocaleString('en-US')}` : 'Your troop is on it — jump in!';
    };
    update();
    this.live.push(update);
    return card;
  }

  private troopPendingCard(r: TroopDriveReward, i: number): HTMLElement {
    const card = systemCard(true);
    const mid = el('div', 'flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;');
    mid.append(el('p', `${TEXT}font-weight:700;font-size:22px;color:${COLORS.coinInk};letter-spacing:1px;`, 'TROOP DRIVE COMPLETE!'),
      el('p', T.title, r.title), rewardChips(r));
    card.append(iconTile(r.emoji, true), mid, pulse(pillButton('Claim!', () => {
      const got = troopDrives.claim(i);
      if (got) this.showBundle('Troop Drive reward!', got, got.itemId ? itemById(got.itemId) : undefined);
    }, 'row')));
    return card;
  }

  /** "You got" card for a mix of beads / pinecones / points (+ an optional item). */
  private showBundle(title: string, r: DriveReward, item?: Item): void {
    playClaim();
    const panel = popupPanel();
    panel.root.append(el('p', T.kicker, 'YOU GOT'), el('p', T.popTitle, title));
    const row = el('div', 'display:flex;gap:40px;align-items:center;justify-content:center;flex-wrap:wrap;');
    if (r.beads) row.appendChild(rewardArt({ kind: 'beads', amount: r.beads }, 150));
    if (r.pinecones) row.appendChild(rewardArt({ kind: 'pinecones', amount: r.pinecones }, 150));
    if (item) row.appendChild(rewardArt({ kind: 'item', id: item.id }, 190));
    panel.root.appendChild(row);
    if (r.points) panel.root.appendChild(el('p', `${TEXT}font-size:34px;${T.points}`, `+${r.points} Camp Pass points`));
    if (item) {
      panel.root.appendChild(el('p', `${T.popTitle}font-size:34px;`, item.name));
      if (item.exclusive) panel.root.appendChild(exclusiveLine(item.exclusive));
    }
    panel.root.appendChild(pillButton('Nice!', () => close()));
    const close = this.openSheet(panel);
  }

  // ── Rewards track ───────────────────────────────────────────────────────

  private rewardsTab(): HTMLElement[] {
    const cols = 'width:100%;display:grid;grid-template-columns:1fr 130px 1fr;gap:0 14px;align-items:center;flex-shrink:0;';
    const head = el('div', cols);
    const label = (t: string) => el('p', `${TEXT}font-weight:600;font-size:22.753px;color:${MENU.sectionInk};text-align:center;`, t);
    head.append(label('FREE'), el('div', ''), label(campPass.hasPremium ? 'PREMIUM' : 'PREMIUM · LOCKED'));
    const rows = TIERS.map((t, i) => {
      const tier = i + 1;
      const row = el('div', cols);
      row.dataset.tier = String(tier);
      const mid = el('div', 'display:flex;justify-content:center;');
      mid.appendChild(stampBadge(String(tier), tier <= campPass.stamps, 104));
      row.append(this.tierCard(tier, 'free', t.free), mid, this.tierCard(tier, 'premium', t.premium));
      return row;
    });
    let ready = 0;
    for (let t = 1; t <= campPass.stamps; t++) {
      if (campPass.tierState(t, 'free') === 'claimable') ready++;
      if (campPass.tierState(t, 'premium') === 'claimable') ready++;
    }
    const all = ready >= 2 ? pillButton('Claim all!', () => this.claimAllTiers(), 'rowSmall') : undefined;
    return [section(ready >= 2 ? `REWARD TRACK · ${ready} READY` : 'REWARD TRACK', [head, ...rows], all)];
  }

  private claimAllTiers(): void {
    const got = campPass.claimAllTiers();
    if (!got.length) return;
    playClaimBurst(got.length);
    if (got.length === 1) this.showRewardCard(got[0]);
    else this.showRewardsSummary(got);
  }

  private tierCard(tier: number, track: PassTrack, r: PassReward): HTMLElement {
    const state = campPass.tierState(tier, track);
    const prem = track === 'premium';
    const glow = state === 'claimable';
    const card = el('div', `position:relative;height:250px;background:#fff;` +
      `border:4px solid ${glow ? COLORS.coin : prem ? COLORS.blueLight : COLORS.cardBorder};` +
      `box-shadow:0 7.753px 0 ${glow ? COLORS.coinDark : prem ? COLORS.blue : COLORS.cardShadow};` +
      'border-radius:25.842px;padding:14px 12px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;' +
      (state === 'locked' ? 'opacity:0.6;' : ''));
    card.append(rewardArt(r, 104), el('p', `${TEXT}font-weight:600;font-size:22px;color:${COLORS.ink};text-align:center;` +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;', rewardName(r)));
    if (state === 'claimable') {
      card.appendChild(pulse(pillButton('Claim!', () => this.claimTier(tier, track), 'rowSmall')));
    } else if (state === 'claimed') {
      const veil = el('div', 'position:absolute;inset:0;border-radius:21px;background:rgba(255,255,255,0.55);display:flex;' +
        'align-items:center;justify-content:center;');
      veil.appendChild(iconImg(icon('pass', 'claimed'), 110, 'transform:rotate(-8deg);'));
      card.appendChild(veil);
    } else if (state === 'needsPremium') {
      card.appendChild(iconImg(icon('pass', 'premium_lock'), 64));
    } else {
      card.appendChild(el('p', T.caption, rewardKindLabel(r)));
    }
    return card;
  }

  private claimTier(tier: number, track: PassTrack): void {
    const r = campPass.claimTier(tier, track);
    if (!r) return;
    playClaim();
    this.showRewardCard(r);
  }

  private scrollToCurrentTier(): void {
    // The first tier with something still to claim, else the next one to stamp.
    let target = campPass.stamps + 1;
    for (let t = 1; t <= campPass.stamps; t++) {
      if (campPass.tierState(t, 'free') === 'claimable' || campPass.tierState(t, 'premium') === 'claimable') { target = t; break; }
    }
    target = Math.min(target, TIERS.length);
    // Tier 1 is right under the section heading — stay at the top so the heading isn't cut off.
    if (target <= 1) { this.body.scrollTop = 0; return; }
    const row = this.body.querySelector(`[data-tier="${target}"]`) as HTMLElement | null;
    if (!row) return;
    const k = this.frame.getBoundingClientRect().width / 1080; // screen px per design px
    const y = (row.getBoundingClientRect().top - this.body.getBoundingClientRect().top) / k + this.body.scrollTop;
    this.body.scrollTop = Math.max(0, y - 150);
  }

  // ── Popups ──────────────────────────────────────────────────────────────

  private showRewardCard(r: PassReward): void {
    const item = rewardItem(r);
    const panel = popupPanel();
    const art = rewardArt(r, 300);
    const rarity = item && item.kind !== 'token' ? RARITY_INFO[item.rarity] : null;
    panel.root.append(el('p', T.kicker, 'YOU GOT'), art, el('p', `${T.popTitle}font-size:52px;`, rewardName(r)));
    if (rarity) {
      // Rarity colours are the Care Package's (shared with the reveal + Collection).
      panel.root.appendChild(el('p', `${TEXT}font-weight:700;font-size:28px;color:#fff;background:${rarity.color};border:4px solid ${rarity.rim};` +
        `border-radius:24px;padding:2px 20px;text-shadow:${textOutline(rarity.rim, 2)};`, `${rarity.label} ${rewardKindLabel(r)}`));
    }
    if (item?.blurb) panel.root.appendChild(el('p', T.popBody, item.blurb));
    if (item?.exclusive) panel.root.appendChild(exclusiveLine(item.exclusive));
    const buttons = el('div', 'display:flex;gap:24px;margin-top:10px;');
    if (r.kind === 'care_package' && this.opts.onOpenCarePackage) {
      buttons.append(pillButton('Later', () => close()), pillButton('Open now!', () => { close(); this.opts.onOpenCarePackage?.(); }, 'getMore', 'brown'));
    } else {
      buttons.append(pillButton('Nice!', () => close()));
    }
    panel.root.appendChild(buttons);
    const close = this.openSheet(panel);
    art.animate([{ transform: 'scale(0.4) rotate(-12deg)' }, { transform: 'scale(1.1) rotate(4deg)', offset: 0.7 }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'ease-out' });
  }

  /** "You got" card for several tier rewards at once — currencies and Care Packages summed, items listed. */
  private showRewardsSummary(rewards: PassReward[]): void {
    let beads = 0, pinecones = 0, packages = 0;
    const items: string[] = [];
    for (const r of rewards) {
      if (r.kind === 'beads') beads += r.amount;
      else if (r.kind === 'pinecones') pinecones += r.amount;
      else if (r.kind === 'care_package') packages += r.count;
      else items.push(r.id);
    }
    const shown: PassReward[] = [
      ...(beads ? [{ kind: 'beads', amount: beads } as const] : []),
      ...(pinecones ? [{ kind: 'pinecones', amount: pinecones } as const] : []),
      ...(packages ? [{ kind: 'care_package', count: packages } as const] : []),
      ...items.map((id) => ({ kind: 'item', id } as const)),
    ];
    const panel = popupPanel();
    panel.root.append(el('p', T.kicker, 'YOU GOT'), el('p', T.popTitle, `${rewards.length} rewards!`));
    const grid = el('div', 'display:flex;gap:26px 30px;align-items:flex-start;justify-content:center;flex-wrap:wrap;max-height:900px;overflow-y:auto;');
    dragToScroll(grid);
    shown.forEach((r, i) => {
      const cell = el('div', 'width:220px;display:flex;flex-direction:column;align-items:center;gap:6px;');
      const art = rewardArt(r, 150);
      cell.append(art, el('p', `${TEXT}font-weight:600;font-size:24px;color:${COLORS.ink};text-align:center;`, rewardName(r)));
      grid.appendChild(cell);
      art.animate([{ transform: 'scale(0.4) rotate(-12deg)', opacity: 0 }, { transform: 'scale(1.1) rotate(4deg)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'ease-out', delay: i * 70, fill: 'backwards' });
    });
    panel.root.appendChild(grid);
    const buttons = el('div', 'display:flex;gap:24px;margin-top:10px;');
    if (packages && this.opts.onOpenCarePackage) {
      buttons.append(pillButton('Later', () => close()), pillButton('Open now!', () => { close(); this.opts.onOpenCarePackage?.(); }, 'getMore', 'brown'));
    } else {
      buttons.append(pillButton('Nice!', () => close()));
    }
    panel.root.appendChild(buttons);
    const close = this.openSheet(panel);
  }

  private confirmPremium(): void {
    const panel = popupPanel();
    const afford = premium.balance >= PASS.premiumPrice;
    const cost = el('div', 'display:flex;align-items:center;gap:14px;');
    cost.append(pineconeIcon(70), el('p', `${TEXT}font-weight:700;font-size:56px;color:${COLORS.ink};`, String(PASS.premiumPrice)));
    const premiumItems = TIERS.map((t) => rewardItem(t.premium)).filter((x): x is Item => !!x);
    panel.root.append(
      el('p', T.kicker, 'CAMP PASS'),
      el('p', `${T.popTitle}font-size:56px;color:${COLORS.blueDark};`, 'Premium'),
      el('p', `${T.popBody}max-width:760px;`,
        `A second reward on every tier: ${premiumItems.length} exclusive cosmetics, extra Care Packages and ${PREMIUM.name}. ` +
        'Tiers you\'ve already stamped unlock straight away.'),
      cost,
    );
    const buttons = el('div', 'display:flex;gap:24px;margin-top:6px;');
    buttons.append(pillButton('Not now', () => close()), pillButton(afford ? 'Unlock!' : `Get ${PREMIUM.short}`, () => {
      close();
      if (!campPass.unlockPremium()) { this.opts.onGetPremium?.(); return; }
      unlockCarePackageAudio();
      sfxReveal(3, true);
    }, 'getMore', 'blue'));
    panel.root.appendChild(buttons);
    const close = this.openSheet(panel);
  }

  /** Scrim + centred clay modal over the screen; returns its close function. */
  private openSheet(panel: { root: HTMLElement; bake(): void }): () => void {
    this.sheet?.remove();
    const scrim = el('div', `position:absolute;inset:0;z-index:5;background:${COLORS.scrim};display:flex;align-items:center;justify-content:center;`);
    scrim.appendChild(panel.root);
    this.frame.appendChild(scrim);
    panel.bake(); // the clay texture needs the laid-out size
    this.sheet = scrim;
    panel.root.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: 'ease-out' });
    return () => { scrim.remove(); if (this.sheet === scrim) this.sheet = null; };
  }

  /** Beads fly from a claimed goal up to the wallet. */
  private flyToWallet(a: DOMRect): void {
    const fr = this.frame.getBoundingClientRect(), s = fr.width / 1080;
    const b = this.wallet.root.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      const fly = beadIcon(56);
      fly.style.cssText += `position:absolute;left:${(a.left - fr.left) / s + 30}px;top:${(a.top - fr.top) / s + 30}px;z-index:10;pointer-events:none;`;
      this.frame.appendChild(fly);
      const dx = (b.right - b.width * 0.3 - a.left) / s - 30, dy = (b.top + b.height / 2 - a.top) / s - 30;
      const jx = (Math.random() - 0.5) * 160;
      fly.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.3 + jx}px,${dy * 0.2 - 120}px) scale(1.3)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px,${dy}px) scale(0.6)`, opacity: 0.2 },
      ], { duration: 700 + i * 70, easing: 'ease-in', delay: i * 50 }).onfinish = () => fly.remove();
    }
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** A kit section card (uppercase heading); an optional button (Claim all) sits at the heading's right. */
function section(title: string, children: HTMLElement[], button?: HTMLElement): HTMLElement {
  const s = sectionCard(title);
  s.root.style.gap = '16px';
  if (button) {
    const heading = s.root.firstChild as HTMLElement;
    const row = el('div', 'display:flex;align-items:center;justify-content:space-between;width:100%;');
    heading.replaceWith(row);
    row.append(heading, button);
  }
  s.body.append(...children);
  return s.root;
}

/** One wow per claim, staggered so they stack (capped so a big Claim all doesn't get deafening). */
function playClaimBurst(n: number): void {
  for (let i = 0; i < Math.min(n, 4); i++) window.setTimeout(() => playClaim(), i * 140);
}

/** Gentle breathing on a Claim button. */
function pulse(btn: HTMLElement): HTMLElement {
  btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }],
    { duration: 600, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
  return btn;
}

function doneRow(icon: string, title: string): HTMLElement {
  const r = systemCard(false, 'padding:10px 20px;gap:18px;box-shadow:none;');
  r.append(iconTile(icon, false, 60), el('p', `${T.body}flex:1;`, title), el('p', `${T.body}color:${COLORS.brown};`, 'Done'));
  return r;
}

/** What the Drives tab is laid out from — the live numbers tick without a re-render until this changes. */
function drivesShape(): string {
  const v = communityDrive.view();
  const l = communityDrive.last;
  return [v?.title, v?.canClaimBase, v?.complete, l?.seq, !!communityDrive.lastReward(), playerTroop()?.id,
    troopDrives.pending().length, troopDrives.goals().map((g) => g.title).join('|')].join('/');
}

/** The kit's white card (itemCard's surface), full row width; `glow` = something to claim (coin gold rim). */
function systemCard(glow: boolean, css = ''): HTMLElement {
  return el('div', `width:100%;background:#fff;border:4px solid ${glow ? COLORS.coin : COLORS.cardBorder};` +
    `box-shadow:0 7.753px 0 ${glow ? COLORS.coinDark : COLORS.cardShadow};border-radius:25.842px;padding:20.673px 24px;` +
    'display:flex;align-items:center;gap:20px;flex-shrink:0;' + css);
}

/** Card art tile (the Shop card's cream art well) holding a goal's icon. Emoji until the icon set lands. */
function iconTile(icon: string, glow: boolean, size = 96): HTMLElement {
  return el('div', `width:${size}px;height:${size}px;border-radius:15.505px;flex-shrink:0;display:flex;align-items:center;` +
    `justify-content:center;font-size:${size * 0.56}px;background:${glow ? COLORS.coinLight : COLORS.cardArt};`, icon);
}

/** Non-interactive label pill in a tinyButton tone (blue = Premium, dark = timers). */
function tag(text: string, tone: 'blue' | 'dark', size = 22, iconSrc?: string): HTMLElement {
  const t = tone === 'blue'
    ? { bg: COLORS.blue, border: COLORS.blueLight, shadow: COLORS.blueDark }
    : { bg: COLORS.brown, border: COLORS.brownDark, shadow: COLORS.brownDark };
  const b = el('div', `background:${t.bg};border:2.584px solid ${t.border};box-shadow:0 3.876px 0 ${t.shadow};border-radius:15.505px;` +
    `padding:4px 18px;flex-shrink:0;display:flex;align-items:center;gap:8px;${iconSrc ? 'padding-left:8px;' : ''}`);
  if (iconSrc) b.appendChild(iconImg(iconSrc, size * 1.6, `margin:-${size * 0.35}px 0;`));
  b.appendChild(el('p', `${TEXT}font-weight:600;font-size:${size}px;color:#fff;white-space:nowrap;`, text));
  return b;
}

/** Camp Pass points ticket, inline with the "+N pts" text. */
function ticket(size: number): HTMLElement { return iconImg(icon('pass', 'ticket'), size); }



function exclusiveLine(source: string): HTMLElement {
  return el('p', `${TEXT}font-weight:600;font-size:24px;color:${COLORS.blueDark};`, `${source} exclusive · in your Backpack`);
}

/** Inline "+60 ● +2 ◆ +80 pts" reward summary. */
function rewardChips(r: { beads: number; pinecones: number; points: number; itemId?: string }): HTMLElement {
  const row = el('div', `display:flex;align-items:center;gap:10px;flex-wrap:wrap;${T.body}`);
  if (r.beads) row.append(beadIcon(30), el('span', 'margin-right:10px;', `+${r.beads}`));
  if (r.pinecones) row.append(pineconeIcon(36), el('span', 'margin-right:10px;', `+${r.pinecones}`));
  if (r.points) row.append(ticket(32), el('span', `${T.points}margin-right:10px;`, `+${r.points} pts`));
  const it = r.itemId ? itemById(r.itemId) : undefined;
  if (it) row.append(el('span', `color:${COLORS.brown};`, `+ ${it.name}`));
  return row;
}

/** Percentile bonus table under the Community Drive. */
function tierTable(): HTMLElement {
  const rows: HTMLElement[] = [el('p', T.caption, 'Paid out when a completed drive ends.')];
  for (const t of PERCENTILE_TIERS) {
    const r = el('div', 'display:flex;align-items:center;gap:18px;width:100%;');
    r.append(el('p', `${T.body}color:${COLORS.ink};width:170px;flex-shrink:0;`, t.label), rewardChips(t));
    rows.push(r);
  }
  const s = section('BONUS BY CONTRIBUTION', rows);
  s.style.gap = '10px';
  return s;
}

/** The Settings slider's track (white, dark rim, wood fill) as a read-only progress bar. */
function progressBar(value: number, max: number, h = 27.304): HTMLElement {
  const bar = el('div', `height:${h}px;border-radius:${h / 2}px;background:#fff;border:3.413px solid ${MENU.trackBorder};` +
    'overflow:hidden;position:relative;min-width:0;');
  bar.appendChild(el('div', `position:absolute;left:0;top:0;bottom:0;width:${max ? Math.min(100, (value / max) * 100) : 0}%;` +
    `background:${MENU.fill};border-radius:${h / 2}px;`));
  return bar;
}

/** Progress bar + "n/target" readout. */
function progressRow(value: number, max: number, readout: string): HTMLElement {
  const row = el('div', 'display:flex;align-items:center;gap:16px;');
  const pb = progressBar(value, max);
  pb.style.flex = '1';
  row.append(pb, el('p', `${T.number}min-width:100px;`, readout));
  return row;
}

/** Camp stamp in the plaque browns: inked + tilted once earned, a dashed outline before. */
/** Camp stamp art: earned (tilted, with the tier number on a chip) or the blank stamp with the number. */
function stampBadge(text: string, inked: boolean, size: number): HTMLElement {
  const s = el('div', `position:relative;width:${size}px;height:${size}px;flex-shrink:0;display:flex;` +
    `align-items:center;justify-content:center;${inked ? 'transform:rotate(-8deg);' : ''}`);
  s.appendChild(iconImg(icon('pass', inked ? 'stamp_earned' : 'stamp_empty'), size, 'position:absolute;inset:0;'));
  if (inked) {
    s.appendChild(el('p', `${TEXT}position:absolute;right:-${size * 0.04}px;bottom:-${size * 0.02}px;min-width:${size * 0.36}px;` +
      `height:${size * 0.36}px;border-radius:${size * 0.18}px;background:${COLORS.brown};border:${Math.max(3, size * 0.03)}px solid ${COLORS.cream};` +
      `display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${size * 0.2}px;color:${COLORS.cream};`, text));
  } else {
    s.appendChild(el('p', `${TEXT}position:relative;font-weight:700;font-size:${size * 0.34}px;line-height:1;color:${COLORS.brown};`, text));
  }
  return s;
}

/** The kit's clay modal surface (tutorial modal), sized for the pass popups. */
function popupPanel(): { root: HTMLElement; bake(): void } {
  return clayCard('width:900px;padding:46px 50px 56px;display:flex;flex-direction:column;align-items:center;gap:18px;');
}

function rewardItem(r: PassReward): Item | undefined {
  return r.kind === 'item' ? itemById(r.id) : r.kind === 'care_package' ? CARE_PACKAGE_TOKEN : undefined;
}

function rewardName(r: PassReward): string {
  if (r.kind === 'beads') return `${r.amount} ${SOFT.name}`;
  if (r.kind === 'pinecones') return `${r.amount} ${PREMIUM.short}`;
  if (r.kind === 'care_package') return r.count > 1 ? `${r.count} Care Packages` : 'Care Package';
  return itemById(r.id)?.name ?? r.id;
}

function rewardKindLabel(r: PassReward): string {
  if (r.kind === 'item') { const it = itemById(r.id); return it ? KIND_INFO[it.kind].label : ''; }
  return r.kind === 'care_package' ? 'Free open' : 'Currency';
}

/** Reward art at `size` design px: bead / pinecone icons, or the item's card art. */
function rewardArt(r: PassReward, size: number): HTMLElement {
  const box = el('div', `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;`);
  if (r.kind === 'beads') box.appendChild(beadIcon(size * 0.62));
  else if (r.kind === 'pinecones') box.appendChild(pineconeIcon(size * 0.8));
  else {
    const it = rewardItem(r);
    const img = el('img', `width:${size}px;height:${size}px;object-fit:contain;pointer-events:none;`);
    img.alt = '';
    if (it) void rewardArtUrl(it).then((u) => { img.src = u; });
    box.appendChild(img);
  }
  const n = r.kind === 'beads' || r.kind === 'pinecones' ? r.amount : r.kind === 'care_package' && r.count > 1 ? r.count : 0;
  if (n) {
    box.appendChild(el('p', `${TEXT}position:absolute;right:${-size * 0.06}px;bottom:${-size * 0.02}px;font-weight:700;` +
      `font-size:${Math.max(24, size * 0.26)}px;color:#fff;text-shadow:${textOutline(COLORS.brownDark, 2.6)};`, `×${n}`));
  }
  return box;
}

export function showCampPass(host: HTMLElement, opts?: CampPassScreenOptions): CampPassScreen {
  return new CampPassScreen(host, opts);
}
