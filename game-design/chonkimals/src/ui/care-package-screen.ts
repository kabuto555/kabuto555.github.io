// Camp Care Package screen (no Figma mock yet) — opened from the Canteen. A live 3D
// stage (care-package/opening.ts) fills the screen behind the kit chrome:
//   header row (back · pony beads · golden pinecones), title plaque, pity line,
//   Odds / Collection pills, and the big "Open" button (costs golden pinecones).
// Opening rolls the reward (care-package/inventory.ts), plays the rarity-scaled
// sequence, then slides up the reveal card: rarity ribbon, NEW! star or the
// duplicate line (+ pony beads refunded), and Open Another / Done.

import { COLORS, FONT, textOutline } from './theme';
import { el, headerPlaque, pressable, PLAQUE_SCREEN } from './components';
import { badge, headerRow, pillButton, tabBar } from './store-components';
import { StoreScreen, scroller } from './store-screens';
import { beadIcon, pineconeIcon } from './bead-art';
import { economy, premium, PREMIUM, SOFT } from '../economy';
import { inventory, type CarePackageResult } from '../care-package/inventory';
import {
  CARE_PACKAGE, CARE_PACKAGE_REWARDS, KIND_LABEL, RARITIES, RARITY_INFO, isTroopGear, rarityOdds, type Reward, type RewardKind,
} from '../care-package/rewards';
import { troopStyle } from '../troop-style';
import { rewardArtUrl, rewardCanvas } from '../care-package/reward-art';
import { CarePackageStage } from '../care-package/opening';
import { unlockCarePackageAudio } from '../care-package/sfx';
import { icon, iconImg } from './icons';

export interface CarePackageScreenOptions {
  /** Not enough golden pinecones → the Shop's Pinecones tab. */
  onGetPremium?: () => void;
  onAddCoins?: () => void;
  /** After each reveal (e.g. the counselor cheers a legendary). */
  onResult?: (r: CarePackageResult) => void;
  onBack?: () => void;
}

const TEXT = `font-family:${FONT};line-height:normal;`;
const TIER_COLORS = RARITIES.map((r) => RARITY_INFO[r].color);

export class CarePackageScreen extends StoreScreen {
  private stage: CarePackageStage;
  private openBtn: HTMLElement;
  private openLabel: HTMLElement;
  private priceRow: HTMLElement;
  private pity: HTMLElement;
  private bottom: HTMLElement;
  private card: HTMLElement | null = null;
  private sheet: HTMLElement | null = null;
  private opening = false;
  private unsubs: (() => void)[] = [];

  constructor(host: HTMLElement, private opts: CarePackageScreenOptions = {}) {
    super(host);
    // 3D stage behind the kit frame, at device resolution.
    const stageHost = el('div', 'position:absolute;inset:0;');
    this.root.insertBefore(stageHost, this.frame);
    this.stage = new CarePackageStage(stageHost);
    this.onClose(() => { this.unsubs.forEach((u) => u()); setTimeout(() => this.stage.dispose(), 200); });

    const f = this.frame;
    f.style.cssText += 'display:flex;flex-direction:column;align-items:center;padding:40px 24px 0;pointer-events:none;';

    const row = headerRow({ backSize: 80, coins: economy.balance, onBack: () => (opts.onBack ?? (() => this.close()))(),
      onAddCoins: opts.onAddCoins, premium: premium.balance, onAddPremium: opts.onGetPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;
    row.root.style.pointerEvents = 'auto';

    const plaque = headerPlaque('Camp Care Package', PLAQUE_SCREEN, 0.84, 64);
    plaque.root.style.cssText += 'position:relative;left:auto;top:auto;margin-top:26px;';
    this.pity = el('p', `${TEXT}font-weight:700;font-size:32px;color:#fff;margin-top:18px;text-align:center;` +
      `text-shadow:${textOutline(COLORS.brownDark, 3)};`);

    const links = el('div', 'display:flex;gap:26px;margin-top:22px;pointer-events:auto;');
    links.append(pillButton('Odds', () => this.showOdds()), pillButton('Collection', () => this.showCollection()));

    // Middle: tap the box to open (or to skip the build-up).
    const tapZone = el('div', 'flex:1 1 0;width:100%;pointer-events:auto;');
    tapZone.addEventListener('pointerup', () => { if (this.stage.busy) this.stage.skip(); else if (!this.card) this.open(); });

    // Bottom: the Open button + its price.
    this.bottom = el('div', 'display:flex;flex-direction:column;align-items:center;gap:18px;padding-bottom:120px;pointer-events:auto;');
    this.openBtn = pillButton('Open!', () => this.open(), 'done');
    this.openLabel = this.openBtn.firstElementChild as HTMLElement;
    this.priceRow = el('div', 'display:flex;gap:14px;align-items:center;');
    this.bottom.append(this.openBtn, this.priceRow);

    f.append(row.root, plaque.root, this.pity, links, tapZone, this.bottom);
    // Subscribe last: subscribe() calls back immediately.
    this.unsubs.push(economy.subscribe((n) => this.setCoins(n)), premium.subscribe((n) => { this.setPremium(n); this.refresh(); }),
      inventory.subscribe(() => this.refresh()));
    this.mount();
  }

  private refresh(): void {
    const left = inventory.pityLeft;
    this.pity.textContent = left <= 1 ? 'Next package: Epic or better guaranteed!' : `Epic or better guaranteed within ${left} opens`;
    const free = inventory.freePackages;
    const afford = free > 0 || premium.balance >= CARE_PACKAGE.price;
    this.openLabel.textContent = free > 0 ? 'Open Free!' : afford ? 'Open!' : `Get ${PREMIUM.short}`;
    const priceText = `${TEXT}font-weight:700;font-size:52px;color:#fff;text-shadow:${textOutline(COLORS.brownDark, 3.4)};`;
    // Free packages (Camp Pass rewards) are used before any pinecones.
    if (free > 0) this.priceRow.replaceChildren(iconImg(icon('ui', 'free_package'), 70), el('p', priceText, `${free} free`));
    else this.priceRow.replaceChildren(pineconeIcon(64), el('p', priceText, `${CARE_PACKAGE.price}`));
    this.priceRow.style.opacity = afford ? '1' : '0.6';
  }

  private async open(): Promise<void> {
    if (this.opening || this.stage.busy) return;
    if (!inventory.takeFreePackage() && !premium.spend(CARE_PACKAGE.price)) { this.opts.onGetPremium?.(); return; }
    this.opening = true;
    unlockCarePackageAudio();
    this.bottom.style.transition = 'opacity 160ms';
    this.bottom.style.opacity = '0';
    this.bottom.style.pointerEvents = 'none';
    const r = inventory.open();
    const info = RARITY_INFO[r.reward.rarity];
    const art = await rewardCanvas(r.reward);
    if (this.isClosed) return;
    await this.stage.play({
      intensity: info.intensity - (r.isNew ? 0 : 1),
      rarityIndex: RARITIES.indexOf(r.reward.rarity),
      tierColors: TIER_COLORS,
      isNew: r.isNew, duplicate: !r.isNew, art,
    });
    if (this.isClosed) return;
    if (r.refund) economy.add(r.refund);
    if (r.pinecones) premium.add(r.pinecones);
    this.showCard(r);
    this.opts.onResult?.(r);
  }

  private showCard(r: CarePackageResult): void {
    const info = RARITY_INFO[r.reward.rarity];
    const card = el('div',
      `position:absolute;left:60px;right:60px;bottom:90px;background:#fff;border:6px solid ${COLORS.cardBorder};` +
      `box-shadow:0 12px 0 ${COLORS.cardShadow};border-radius:56px;padding:46px 50px 50px;display:flex;flex-direction:column;` +
      'align-items:center;gap:16px;pointer-events:auto;');
    const ribbon = el('p', `${TEXT}font-weight:700;font-size:36px;color:#fff;background:${info.color};border:5px solid ${info.rim};` +
      `border-radius:40px;padding:4px 34px;letter-spacing:0.08em;text-shadow:${textOutline(info.rim, 2.4)};`,
      info.label.toUpperCase());
    const kind = el('p', `${TEXT}font-weight:600;font-size:30px;color:#8a6a52;`, KIND_LABEL[r.reward.kind]);
    const name = el('p', `${TEXT}font-weight:700;font-size:68px;color:${COLORS.ink};text-align:center;`, r.reward.name);
    const blurb = el('p', `${TEXT}font-weight:500;font-size:32px;color:#6d5846;text-align:center;`, r.reward.blurb ?? '');
    card.append(ribbon, kind, name, blurb);
    if (r.pinecones) {
      const bonus = el('div', 'display:flex;align-items:center;gap:12px;background:#fff3c4;border-radius:30px;padding:10px 26px;');
      bonus.append(el('p', `${TEXT}font-weight:700;font-size:32px;color:#8a5a00;`, `All collected!  ·  +${r.pinecones}`),
        pineconeIcon(40), el('p', `${TEXT}font-weight:600;font-size:28px;color:#8a5a00;`, PREMIUM.short));
      card.appendChild(bonus);
    } else if (r.isNew) {
      const b = badge({ kind: 'new' });
      b.style.cssText += 'left:-10px;top:-40px;transform:scale(1.6);transform-origin:0 0;';
      card.appendChild(b);
    } else {
      const dupe = el('div', 'display:flex;align-items:center;gap:12px;background:#f4ebdf;border-radius:30px;padding:10px 26px;');
      dupe.append(el('p', `${TEXT}font-weight:700;font-size:32px;color:${COLORS.brown};`, `Already owned ×${r.count - 1}  ·  +${r.refund}`),
        beadIcon(34), el('p', `${TEXT}font-weight:600;font-size:28px;color:${COLORS.brown};`, SOFT.name));
      card.appendChild(dupe);
    }
    if (isTroopGear(r.reward) && r.isNew) {
      // New troop gear goes straight onto your Troop HQ tent / pennant.
      troopStyle.equip(r.reward);
      card.appendChild(el('p', `${TEXT}font-weight:700;font-size:28px;color:#4f8f33;`, 'Now flying at your Troop HQ! ⛺'));
    }
    if (r.pity) card.appendChild(el('p', `${TEXT}font-weight:600;font-size:26px;color:#8a6a52;`, 'Pity guarantee kicked in!'));
    const buttons = el('div', 'display:flex;gap:30px;margin-top:18px;');
    const again = premium.balance >= CARE_PACKAGE.price;
    buttons.append(
      pillButton('Done', () => this.dismissCard(false)),
      pillButton(again ? 'Open Another' : `Get ${PREMIUM.short}`, () => (again ? this.dismissCard(true) : this.opts.onGetPremium?.())),
    );
    card.appendChild(buttons);
    this.frame.appendChild(card);
    card.animate([{ transform: 'translateY(120%) scale(0.9)' }, { transform: 'translateY(-3%) scale(1.02)', offset: 0.75 },
      { transform: 'translateY(0) scale(1)' }], { duration: 380, easing: 'ease-out' });
    this.card = card;
  }

  private async dismissCard(openNext: boolean): Promise<void> {
    const card = this.card;
    if (!card) return;
    card.style.pointerEvents = 'none';
    card.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(60%)', opacity: 0 }],
      { duration: 200, easing: 'ease-in' }).onfinish = () => card.remove();
    await this.stage.reset();
    this.card = null;
    this.opening = false;
    this.refresh();
    if (openNext) void this.open();
    else { this.bottom.style.opacity = '1'; this.bottom.style.pointerEvents = 'auto'; }
  }

  // ── Sheets ────────────────────────────────────────────────────────────────
  private openSheet(title: string, body: HTMLElement): void {
    this.sheet?.remove();
    const scrim = el('div', 'position:absolute;inset:0;background:rgba(20,12,6,0.5);pointer-events:auto;z-index:5;');
    const panel = el('div',
      `position:absolute;left:40px;right:40px;top:230px;bottom:140px;background:${COLORS.cream};border:9px solid ${COLORS.brown};` +
      `border-radius:64px;box-shadow:0 16px 0 ${COLORS.brownDark};display:flex;flex-direction:column;align-items:center;` +
      'padding:40px 30px 36px;gap:24px;');
    panel.append(el('p', `${TEXT}font-weight:700;font-size:54px;color:${COLORS.brown};`, title), body,
      pillButton('Close', () => close(), 'getMore'));
    scrim.appendChild(panel);
    scrim.addEventListener('pointerup', (e) => { if (e.target === scrim) close(); });
    this.frame.appendChild(scrim);
    this.sheet = scrim;
    panel.animate([{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 180, easing: 'ease-out' });
    const close = () => { scrim.remove(); if (this.sheet === scrim) this.sheet = null; };
  }

  private showOdds(): void {
    const body = scroller('flex:1 1 0;min-height:0;width:100%;display:flex;flex-direction:column;gap:18px;align-items:center;');
    for (const o of rarityOdds()) {
      const info = RARITY_INFO[o.rarity];
      const kinds = [...new Set(CARE_PACKAGE_REWARDS.filter((x) => x.rarity === o.rarity).map((x) => KIND_LABEL[x.kind]))];
      const r = el('div', `display:flex;align-items:center;gap:22px;width:880px;background:#fff;border:5px solid ${COLORS.cardBorder};` +
        'border-radius:34px;padding:20px 28px;box-sizing:border-box;flex-shrink:0;');
      r.append(
        el('p', `${TEXT}font-weight:700;font-size:30px;color:#fff;background:${info.color};border:4px solid ${info.rim};border-radius:26px;` +
          `padding:2px 18px;width:210px;text-align:center;text-shadow:${textOutline(info.rim, 2)};flex-shrink:0;`, info.label),
        el('p', `${TEXT}font-weight:600;font-size:28px;color:${COLORS.ink};flex:1;`, `${kinds.join(', ')} · ${o.count} items`),
        el('p', `${TEXT}font-weight:700;font-size:40px;color:${COLORS.brown};`, `${o.percent.toFixed(o.percent < 2 ? 1 : 0)}%`),
      );
      body.appendChild(r);
    }
    body.appendChild(el('p', `${TEXT}font-weight:500;font-size:28px;color:#6d5846;text-align:center;max-width:860px;padding-top:10px;`,
      `Items are picked evenly within a rarity. Epic or better is guaranteed at least every ${CARE_PACKAGE.pityEvery} opens. ` +
      'No duplicates: once a rarity is collected, you get something new from the nearest rarity instead. ' +
      `Collected everything? Each package pays out ${CARE_PACKAGE.allCollectedPinecones} ${PREMIUM.name.toLowerCase()}.`));
    this.openSheet('Drop Rates', body);
  }

  private showCollection(): void {
    const kinds: RewardKind[][] = [['character'], ['colour'], ['hat', 'top', 'bottom', 'shoes', 'accessory', 'toy', 'lantern'], ['emote'], ['pennant', 'tent']];
    const labels = ['Chonks', 'Colours', 'Gear', 'Emotes', 'Troop'];
    const owned = CARE_PACKAGE_REWARDS.filter((x) => inventory.owns(x.id)).length;
    const wrap = el('div', 'flex:1 1 0;min-height:0;width:100%;display:flex;flex-direction:column;align-items:center;gap:20px;');
    const count = el('p', `${TEXT}font-weight:600;font-size:32px;color:#6d5846;`, `${owned} / ${CARE_PACKAGE_REWARDS.length} collected`);
    const grid = el('div', 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;width:880px;');
    const body = scroller('flex:1 1 0;min-height:0;width:100%;display:flex;justify-content:center;padding:6px 0 20px;');
    body.appendChild(grid);
    const render = (i: number) => {
      grid.replaceChildren(...CARE_PACKAGE_REWARDS.filter((x) => kinds[i].includes(x.kind))
        .map((x) => collectionTile(x, () => render(i))));
    };
    const tabs = tabBar(labels, 0, render, { width: 880, scale: 0.8 });
    wrap.append(count, tabs.root, body);
    render(0);
    this.openSheet('Collection', wrap);
  }
}

function collectionTile(r: Reward, rerender: () => void): HTMLElement {
  const n = inventory.count(r.id);
  const info = RARITY_INFO[r.rarity];
  const tile = el('div', `background:#fff;border:4px solid ${n ? info.color : COLORS.cardBorder};border-radius:28px;` +
    'padding:14px;display:flex;flex-direction:column;align-items:center;gap:8px;position:relative;');
  const art = el('img', `width:200px;height:200px;object-fit:contain;pointer-events:none;${n ? '' : 'filter:brightness(0) opacity(0.18);'}`);
  art.alt = r.name;
  void rewardArtUrl(r).then((u) => { art.src = u; });
  tile.append(art, el('p', `${TEXT}font-weight:600;font-size:24px;color:${n ? COLORS.ink : '#b3a08e'};text-align:center;`,
    n ? r.name : '???'));
  if (n > 1) {
    tile.appendChild(el('p', `${TEXT}position:absolute;right:10px;top:8px;font-weight:700;font-size:24px;color:#fff;` +
      `background:${COLORS.brown};border-radius:18px;padding:0 12px;`, `×${n}`));
  }
  // Owned troop gear: tap to fly it at your Troop HQ.
  if (n && isTroopGear(r)) {
    const on = troopStyle.isEquipped(r.id);
    tile.appendChild(el('p', `${TEXT}font-weight:700;font-size:22px;color:#fff;border-radius:16px;padding:2px 14px;` +
      `background:${on ? '#5cc25a' : COLORS.blue};`, on ? 'IN USE' : 'TAP TO USE'));
    pressable(tile, 0, () => { troopStyle.equip(r); rerender(); });
  }
  return tile;
}

export function showCarePackage(host: HTMLElement, opts?: CarePackageScreenOptions): CarePackageScreen {
  return new CarePackageScreen(host, opts);
}
