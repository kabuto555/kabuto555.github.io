// Backpack — the player's inventory (no Figma mock yet), opened from the camp HUD.
// Tabs by item group (Camp · Outfit · Toys · Emotes · Colours · Troop); inside each
// tab, one section per kind ("Tents", "Tent Materials", "Hats"…) with every catalog
// item: owned ones in full colour (with a count and an "exclusive" tag), the rest as
// "???" silhouettes. Toys play their sound when tapped; troop gear can be put to use.
// Free Care Packages waiting to be opened show as a banner at the top.

import { COLORS, FONT, textOutline } from './theme';
import { el, headerPlaque, pressable, PLAQUE_SCREEN } from './components';
import { headerRow, pillButton, tabBar } from './store-components';
import { StoreScreen, campBackdrop, scroller } from './store-screens';
import { economy, premium } from '../economy';
import { playerInventory } from '../inventory/inventory';
import { ITEM_GROUPS, KIND_INFO, allItems, itemGroup, type Item, type ItemKind } from '../inventory/items';
import { playToySound } from '../inventory/toy-sounds';
import { CARE_PACKAGE_TOKEN, RARITIES, RARITY_INFO, isTroopGear } from '../care-package/rewards';
import { rewardArtUrl } from '../care-package/reward-art';
import { troopStyle } from '../troop-style';

export interface BackpackScreenOptions {
  onAddCoins?: () => void;
  onGetPremium?: () => void;
  /** The "Open" button on the free Care Package banner. */
  onOpenCarePackage?: () => void;
  onBack?: () => void;
}

const TEXT = `font-family:${FONT};line-height:normal;`;
const SOFT_INK = '#8a6a52';

export class BackpackScreen extends StoreScreen {
  private body: HTMLElement;
  private count: HTMLElement;
  private banner: HTMLElement;
  private tab = 0;
  private unsubs: (() => void)[] = [];

  constructor(host: HTMLElement, private opts: BackpackScreenOptions = {}) {
    super(host);
    const f = this.frame;
    campBackdrop(f);
    const col = el('div', 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:40px 24px 0;');

    const row = headerRow({ backSize: 80, coins: economy.balance, onBack: () => (opts.onBack ?? (() => this.close()))(),
      onAddCoins: opts.onAddCoins, premium: premium.balance, onAddPremium: opts.onGetPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;

    const plaque = headerPlaque('Backpack', PLAQUE_SCREEN, 0.84, 64);
    plaque.root.style.cssText += 'position:relative;left:auto;top:auto;margin-top:26px;';
    this.count = el('p', `${TEXT}font-weight:700;font-size:32px;color:#fff;margin-top:14px;text-shadow:${textOutline(COLORS.brownDark, 3)};`);
    this.banner = el('div', 'display:none;');
    const tabs = tabBar(ITEM_GROUPS.map((g) => g.label), 0, (i) => { this.tab = i; this.render(true); }, { width: 1000 });
    tabs.root.style.marginTop = '22px';
    this.body = scroller('flex:1 1 0;min-height:0;width:1032px;display:flex;flex-direction:column;align-items:center;gap:18px;' +
      'padding:22px 0 80px;box-sizing:border-box;');

    col.append(row.root, plaque.root, this.count, this.banner, tabs.root, this.body);
    f.appendChild(col);
    this.render(true);
    this.unsubs.push(economy.subscribe((n) => this.setCoins(n)), premium.subscribe((n) => this.setPremium(n)),
      playerInventory.subscribe(() => this.render(false)));
    this.onClose(() => this.unsubs.forEach((u) => u()));
    this.mount();
  }

  private render(reset: boolean): void {
    const group = ITEM_GROUPS[this.tab].id;
    const items = allItems((it) => itemGroup(it) === group);
    const owned = items.filter((it) => playerInventory.owns(it.id)).length;
    this.count.textContent = `${ITEM_GROUPS[this.tab].label}: ${owned} / ${items.length} collected`;
    this.renderBanner();

    // One section per kind, in the kinds' declared order; rarest last within a kind.
    const kinds = (Object.keys(KIND_INFO) as ItemKind[]).filter((k) => KIND_INFO[k].group === group);
    const out: HTMLElement[] = [];
    for (const k of kinds) {
      const list = items.filter((it) => it.kind === k)
        .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
      if (!list.length) continue;
      const have = list.filter((it) => playerInventory.owns(it.id)).length;
      out.push(el('p', `${TEXT}font-weight:700;font-size:34px;color:#fff;align-self:flex-start;margin:6px 0 0 30px;` +
        `text-shadow:${textOutline(COLORS.brownDark, 3)};flex-shrink:0;`, `${KIND_INFO[k].plural}  ${have}/${list.length}`));
      const grid = el('div', 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;width:1000px;flex-shrink:0;');
      grid.append(...list.map((it) => this.tile(it)));
      out.push(grid);
    }
    const top = this.body.scrollTop;
    this.body.replaceChildren(...out);
    this.body.scrollTop = reset ? 0 : top;
  }

  private renderBanner(): void {
    const n = playerInventory.count(CARE_PACKAGE_TOKEN.id);
    if (!n) { this.banner.style.display = 'none'; return; }
    this.banner.style.cssText = `display:flex;align-items:center;gap:22px;width:1000px;box-sizing:border-box;margin-top:18px;` +
      `background:#fff3c4;border:6px solid #ffc629;box-shadow:0 8px 0 #d99a00;border-radius:36px;padding:16px 26px;flex-shrink:0;`;
    const btn = pillButton('Open', () => { this.close(); this.opts.onOpenCarePackage?.(); });
    btn.style.height = '84px';
    btn.style.padding = '0 44px';
    this.banner.replaceChildren(
      el('span', 'font-size:70px;', '📦'),
      el('p', `${TEXT}font-weight:700;font-size:34px;color:#8a5a00;flex:1;`,
        `${n} free Care Package${n > 1 ? 's' : ''} to open!`),
      ...(this.opts.onOpenCarePackage ? [btn] : []),
    );
  }

  private tile(it: Item): HTMLElement {
    const n = playerInventory.count(it.id);
    const info = RARITY_INFO[it.rarity];
    const tile = el('div', `position:relative;background:#fff;border:5px solid ${n ? info.color : COLORS.cardBorder};border-radius:30px;` +
      `box-shadow:0 6px 0 ${n ? info.rim : COLORS.cardShadow};padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;` +
      (n ? '' : 'opacity:0.85;'));
    const art = el('img', `width:180px;height:180px;object-fit:contain;pointer-events:none;${n ? '' : 'filter:brightness(0) opacity(0.16);'}`);
    art.alt = it.name;
    void rewardArtUrl(it).then((u) => { art.src = u; });
    tile.append(art, el('p', `${TEXT}font-weight:600;font-size:23px;color:${n ? COLORS.ink : '#b3a08e'};text-align:center;` +
      'min-height:56px;display:flex;align-items:center;', n ? it.name : '???'));
    if (n > 1) {
      tile.appendChild(el('p', `${TEXT}position:absolute;right:10px;top:8px;font-weight:700;font-size:22px;color:#fff;` +
        `background:${COLORS.brown};border-radius:16px;padding:0 12px;`, `×${n}`));
    }
    if (it.exclusive) {
      tile.appendChild(el('p', `${TEXT}position:absolute;left:8px;top:8px;font-weight:700;font-size:17px;color:#fff;` +
        `background:#9b5cff;border-radius:12px;padding:1px 10px;`, it.exclusive));
    }
    if (!n) return tile;
    // Owned: toys make their noise, troop gear goes on your HQ.
    if (it.sound) {
      const sound = it.sound;
      tile.appendChild(el('p', `${TEXT}font-weight:700;font-size:20px;color:#fff;border-radius:14px;padding:2px 12px;background:${COLORS.blue};`,
        '♪ TAP TO PLAY'));
      pressable(tile, 0, () => {
        playToySound(sound);
        art.animate([{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(-12deg) scale(1.12)' },
          { transform: 'rotate(10deg) scale(1.08)' }, { transform: 'rotate(0) scale(1)' }], { duration: 420, easing: 'ease-out' });
      });
    } else if (isTroopGear(it)) {
      const on = troopStyle.isEquipped(it.id);
      tile.appendChild(el('p', `${TEXT}font-weight:700;font-size:20px;color:#fff;border-radius:14px;padding:2px 12px;` +
        `background:${on ? '#5cc25a' : COLORS.blue};`, on ? 'IN USE' : 'TAP TO USE'));
      pressable(tile, 0, () => { troopStyle.equip(it); this.render(false); });
    } else {
      tile.appendChild(el('p', `${TEXT}font-weight:600;font-size:20px;color:${SOFT_INK};`, info.label));
    }
    return tile;
  }
}

export function showBackpack(host: HTMLElement, opts?: BackpackScreenOptions): BackpackScreen {
  return new BackpackScreen(host, opts);
}
