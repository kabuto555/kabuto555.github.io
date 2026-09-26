// Customize screen ("My Chonk", no Figma mock yet) — opened from the camp HUD. The top of the
// screen is a full-bleed 3D scene you drag to spin; the slots + items sit in a cream drawer
// below it. A felt pennant switches between the two places — your chonk walks out of the
// cabin door to its tent, and back:
//   Wardrobe: your chonk in the cabin dressing room. Slots: Chonk (which animal you play) ·
//           Headwear · Top · Bottom · Footwear · Accessory · Toy.
//   Tent:   your camp spot. Slots: Tent · Tent Material · Sleeping Bag · Bag Material ·
//           Lantern, plus Display — toggle any toy / wearable you own to show it off in,
//           on or around the tent (spots are generated, so there's always room).
// Only items you own are listed; every slot has an empty / default choice. Changes save
// straight away (customization/loadout.ts) and your chonk in camp re-dresses live.

import { COLORS, FONT, buttonRadius, chonkArt } from './theme';
import { OWNED_CHARACTERS } from './store-presets';
import { icon, iconImg } from './icons';
import { MENU } from './menu-components';
import { dragToScroll, el, pressable } from './components';
import { headerRow } from './store-components';
import { feltPennant } from './felt-pennant';
import { StoreScreen, scroller } from './store-screens';

/** Slot art (icons.ts); the Toy slot uses the Rubber Ducky's art. */
const SLOT_ICON: Record<string, string> = {
  head: icon('customize', 'headwear'), top: icon('customize', 'top'), bottom: icon('customize', 'bottom'),
  feet: icon('customize', 'footwear'), accessory: icon('customize', 'accessory'), toy: 'assets/ui/rewards/cp_toy_ducky.png',
  tentStyle: icon('customize', 'tent'), tentMaterial: icon('customize', 'tent_material'), bedStyle: icon('customize', 'sleeping_bag'),
  bedMaterial: icon('customize', 'bed_material'), lantern: icon('customize', 'lantern'), display: icon('customize', 'display'),
};
const PLACE_ICON = { wardrobe: icon('customize', 'wardrobe'), tent: icon('customize', 'tent_trip') };
import { economy, premium } from '../economy';
import { playerInventory } from '../inventory/inventory';
import { itemById, type Item } from '../inventory/items';
import { RARITIES, RARITY_INFO } from '../care-package/rewards';
import { rewardArtUrl } from '../care-package/reward-art';
import { playToySound } from '../inventory/toy-sounds';
import { gameSettings } from '../game-settings';
import {
  AVATAR_SLOTS, TENT_SLOTS, isDisplayable, playerLoadout, type AvatarSlot, type TentSlot,
} from '../customization/loadout';
import { PreviewStage } from '../customization/preview-stage';

export interface CustomizeScreenOptions {
  onAddCoins?: () => void;
  onGetPremium?: () => void;
  onBack?: () => void;
  /** 0 = Wardrobe, 1 = Tent. */
  tab?: number;
  /** Picked a different chonk in the Chonk slot (swap the player's model in camp too). */
  onSelectCharacter?: (id: string) => void;
}

const TEXT = `font-family:${FONT};line-height:normal;`;
// Kit tokens: selected = coin gold (like claimable Camp Pass cards), states in the SELECT brown.
const SOFT_INK = COLORS.brown;
const GOLD = COLORS.coin;
const GOLD_DARK = COLORS.coinDark;
const SELECTED_BG = COLORS.coinLight;
const GREEN = COLORS.brown;
const DISPLAY = 'display';
const CHONK = 'chonk';

type SlotId = AvatarSlot | TentSlot | typeof DISPLAY | typeof CHONK;

const portraitFor = (id: string): string => OWNED_CHARACTERS.find((c) => c.id === id)?.art ?? id;

interface SlotDef { id: SlotId; label: string; emoji: string; kinds?: readonly string[]; none?: string; }

export class CustomizeScreen extends StoreScreen {
  private tab: number;
  private slot: SlotId;
  private stage: PreviewStage;
  private strip: HTMLElement;
  private body: HTMLElement;
  private stageHost: HTMLElement;
  private view: HTMLElement;
  private drawer: HTMLElement;
  private pennant: ReturnType<typeof feltPennant>;
  private unsubs: (() => void)[] = [];

  constructor(host: HTMLElement, private opts: CustomizeScreenOptions = {}) {
    super(host);
    const f = this.frame;
    // Full-bleed layers behind the frame: cream (so the home-indicator strip matches the drawer)
    // and the 3D canvas, which runs from the very top of the screen down under the drawer's lip.
    const bleed = el('div', `position:absolute;inset:0;pointer-events:none;background:${COLORS.cream};`);
    bleed.classList.add('chonk-bleed'); // StoreScreen: this screen paints its own background
    this.stageHost = el('div', 'position:absolute;left:0;right:0;top:0;height:60%;' +
      'background:linear-gradient(#cfe9f7 0%, #9fd0ec 70%, #8fc46a 70.2%, #7fb85a 100%);'); // sky + grass behind the tent view
    this.root.insertBefore(this.stageHost, this.root.firstChild);
    this.root.insertBefore(bleed, this.stageHost);
    // The frame lets drags through to the canvas; only the UI blocks take input.
    f.style.pointerEvents = 'none';
    const col = el('div', 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding:40px 24px 0;' +
      'pointer-events:none;');

    const row = headerRow({ backSize: 80, coins: economy.balance, onBack: () => (opts.onBack ?? (() => this.close()))(),
      onAddCoins: opts.onAddCoins, premium: premium.balance, onAddPremium: opts.onGetPremium });
    this.wallet = row.wallet;
    this.premiumWallet = row.premiumWallet;
    row.wallet.root.remove(); // nothing to buy here — keep the room clear (the Shop has the wallet)

    this.tab = opts.tab ?? 0;
    this.slot = this.defaultSlot();

    // The see-through band the room shows in (between the back button and the drawer).
    this.view = el('div', 'flex:1 1 0;min-height:360px;width:100%;position:relative;pointer-events:none;');
    const hint = el('p', `${TEXT}position:absolute;left:50%;bottom:34px;transform:translateX(-50%);font-weight:600;font-size:24px;` +
      `color:#fff;background:rgba(58,36,21,0.55);border-radius:${buttonRadius(40)}px;padding:4px 20px;white-space:nowrap;` +
      'transition:opacity 400ms;', 'Drag to spin');
    // One felt pennant, bottom-right: names where you can go next.
    this.pennant = feltPennant(this.tab === 0 ? 'Tent' : 'Wardrobe', 'right', 'mustard', () => void this.travel(),
      this.tab === 0 ? PLACE_ICON.tent : PLACE_ICON.wardrobe);
    this.pennant.root.style.cssText += 'position:absolute;right:-14px;bottom:40px;';
    this.view.append(hint, this.pennant.root);

    // Drawer: slots strip + item list on the kit cream, rounded lip over the room.
    this.drawer = el('div', `flex:0 0 36%;min-height:0;align-self:stretch;margin:0 -24px;display:flex;flex-direction:column;` +
      `align-items:center;background:${COLORS.cream};border-top:9px solid ${COLORS.brown};border-radius:64px 64px 0 0;` +
      `box-shadow:0 -10px 0 rgba(58,36,21,0.22);padding-top:22px;gap:14px;pointer-events:auto;`);
    this.strip = el('div', 'width:1000px;display:flex;gap:10px;flex-shrink:0;overflow-x:auto;scrollbar-width:none;' +
      'padding:4px 2px 12px;box-sizing:border-box;touch-action:pan-x;');
    dragToScroll(this.strip, 'x');
    this.body = scroller('flex:1 1 0;min-height:0;width:1032px;display:flex;flex-direction:column;align-items:center;gap:18px;' +
      'padding:10px 0 80px;box-sizing:border-box;');
    this.drawer.append(this.strip, this.body);

    row.root.style.pointerEvents = 'auto';
    col.append(row.root, this.view, this.drawer);
    f.appendChild(col);

    this.stage = new PreviewStage(this.stageHost);
    // The hint has done its job once you've actually spun it (a drag, not just a tap).
    let pressed = false;
    const cv = this.stage.canvas;
    cv.addEventListener('pointerdown', () => { pressed = true; });
    cv.addEventListener('pointerup', () => { pressed = false; });
    cv.addEventListener('pointermove', () => { if (pressed) hint.style.opacity = '0'; });
    this.refreshPreview();
    this.render(true);
    this.unsubs.push(
      economy.subscribe((n) => this.setCoins(n)),
      premium.subscribe((n) => this.setPremium(n)),
      playerLoadout.subscribe(() => { this.refreshPreview(); this.render(false); }),
    );
    this.onClose(() => { this.unsubs.forEach((u) => u()); this.stage.dispose(); });
    this.mount(() => this.layoutStage());
    requestAnimationFrame(() => this.layoutStage());
  }

  /** Canvas from the screen top to just under the drawer's lip; the subject centred in the view band. */
  private layoutStage(): void {
    const rr = this.root.getBoundingClientRect(), dr = this.drawer.getBoundingClientRect(), vr = this.view.getBoundingClientRect();
    if (!rr.height || !dr.height) return;
    this.stageHost.style.height = `${dr.top - rr.top + 60}px`;
    this.stage.setFocus(vr.top - rr.top, vr.height);
  }

  private slots(): SlotDef[] {
    return this.tab === 0
      ? [{ id: CHONK, label: 'Chonk', emoji: '' }, ...AVATAR_SLOTS]
      : [...TENT_SLOTS, { id: DISPLAY, label: 'Display', emoji: '🧸' }];
  }

  /** Wardrobe opens on Headwear (the Chonk slot is first in the strip but not the usual stop). */
  private defaultSlot(): SlotId { return this.tab === 0 ? AVATAR_SLOTS[0].id : this.slots()[0].id; }

  /** Pennant: walk between the wardrobe and the tent. The drawer waits, dimmed, only until the
   * cut to the other place — you can edit (or head back) while the chonk finishes its walk. */
  private async travel(): Promise<void> {
    const next = this.tab === 0 ? 1 : 0;
    this.pennant.setEnabled(false);
    this.drawer.style.pointerEvents = 'none';
    this.drawer.style.opacity = '0.6';
    this.tab = next;
    this.slot = this.defaultSlot();
    this.render(true);
    const s = gameSettings.get();
    if (next === 1) await this.stage.walkOut(playerLoadout.tent);
    else await this.stage.walkIn(s.character, playerLoadout.avatar);
    if (this.isClosed) return;
    this.pennant.setLabel(next === 0 ? 'Tent' : 'Wardrobe', next === 0 ? PLACE_ICON.tent : PLACE_ICON.wardrobe);
    this.pennant.setEnabled(true);
    this.drawer.style.pointerEvents = 'auto';
    this.drawer.style.opacity = '1';
  }

  private refreshPreview(): void {
    const s = gameSettings.get();
    if (this.tab === 0) void this.stage.showAvatar(s.character, playerLoadout.avatar);
    else void this.stage.showTent(playerLoadout.tent, { id: s.character, avatar: playerLoadout.avatar });
  }

  /** What's in a slot now (item id), for the strip + grid. */
  private equipped(slot: SlotId): string | undefined {
    if (slot === DISPLAY || slot === CHONK) return undefined;
    return this.tab === 0 ? playerLoadout.avatar[slot as AvatarSlot] : playerLoadout.tent.slots[slot as TentSlot];
  }

  private render(reset: boolean): void {
    this.strip.replaceChildren(...this.slots().map((s) => this.slotChip(s)));
    const def = this.slots().find((s) => s.id === this.slot)!;
    const top = this.body.scrollTop;
    this.body.replaceChildren(...(def.id === DISPLAY ? this.displayList() : def.id === CHONK ? this.chonkList() : this.itemList(def)));
    this.body.scrollTop = reset ? 0 : top;
  }

  private slotChip(s: SlotDef): HTMLElement {
    const on = s.id === this.slot;
    const chip = el('div', `flex-shrink:0;width:134px;box-sizing:border-box;border-radius:24px;padding:6px 4px 8px;display:flex;` +
      `flex-direction:column;align-items:center;gap:4px;cursor:pointer;background:${on ? SELECTED_BG : '#fff'};` +
      `border:5px solid ${on ? GOLD : COLORS.cardBorder};box-shadow:0 6px 0 ${on ? GOLD_DARK : COLORS.cardShadow};`);
    const art = el('div', 'width:60px;height:60px;display:flex;align-items:center;justify-content:center;font-size:40px;');
    const id = this.equipped(s.id);
    const it = id ? itemById(id) : undefined;
    if (it) art.appendChild(itemImg(it, 60));
    else if (s.id === CHONK) art.appendChild(portraitImg(portraitFor(gameSettings.get().character), 60));
    else if (SLOT_ICON[s.id]) art.appendChild(iconImg(SLOT_ICON[s.id], 60, s.id === DISPLAY ? '' : 'opacity:0.55;')); // faded = empty
    const count = s.id === DISPLAY ? playerLoadout.tent.displayed.length : 0;
    chip.append(art, el('p', `${TEXT}font-weight:700;font-size:20px;color:${COLORS.ink};text-align:center;white-space:nowrap;` +
      'overflow:hidden;text-overflow:ellipsis;max-width:100%;', s.id === DISPLAY && count ? `Display · ${count}` : s.label));
    pressable(chip, 4, () => { if (this.slot === s.id) return; this.slot = s.id; this.render(true); });
    return chip;
  }

  private itemList(def: SlotDef): HTMLElement[] {
    const owned = playerInventory.list((it) => !!def.kinds?.includes(it.kind)).map((x) => x.item)
      .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name));
    const current = this.equipped(def.id);
    const grid = el('div', 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;width:1000px;flex-shrink:0;');
    grid.appendChild(this.noneTile(def, !current));
    grid.append(...owned.map((it) => this.itemTile(it, it.id === current, () => this.equip(def.id, it))));
    const out: HTMLElement[] = [label(def.label), grid];
    if (!owned.length) {
      out.push(el('p', `${TEXT}font-weight:600;font-size:28px;color:${COLORS.brown};text-align:center;max-width:860px;`,
        `No ${def.label.toLowerCase()} items yet — find them in Care Packages, the Camp Pass and Troop Drives!`));
    }
    return out;
  }

  private equip(slot: SlotId, it: Item | null): void {
    if (this.tab === 0) playerLoadout.equip(slot as AvatarSlot, it?.id ?? null);
    else playerLoadout.setTent(slot as TentSlot, it?.id ?? null);
    if (it?.sound) playToySound(it.sound);
    if (it?.sound && slot === 'toy') this.stage.playToy(); // the preview chonk shows it off
  }

  private noneTile(def: SlotDef, on: boolean): HTMLElement {
    const t = tileShell(on, COLORS.cardBorder, COLORS.cardShadow);
    t.append(iconBox(def.none && SLOT_ICON[def.id] ? SLOT_ICON[def.id] : icon('customize', 'empty')),
    el('p', `${TEXT}font-weight:600;font-size:20px;color:${COLORS.ink};text-align:center;min-height:50px;display:flex;align-items:center;`,
      def.none ?? 'Nothing'));
    if (on) t.appendChild(badge(def.none ? 'IN USE' : 'EMPTY', GREEN));
    pressable(t, 4, () => { if (!on) this.equip(def.id, null); });
    return t;
  }

  private itemTile(it: Item, on: boolean, onTap: () => void, tag?: string): HTMLElement {
    const info = RARITY_INFO[it.rarity];
    const t = tileShell(on, info.color, info.rim);
    t.append(itemImg(it, 116), el('p', `${TEXT}font-weight:600;font-size:20px;color:${COLORS.ink};text-align:center;min-height:50px;` +
      'display:flex;align-items:center;', it.name));
    t.appendChild(badge(tag ?? (on ? 'EQUIPPED' : info.label), on || tag === 'ON DISPLAY' ? GREEN : tag ? COLORS.blue : '', !on && !tag));
    pressable(t, 4, onTap);
    return t;
  }

  /** Chonk slot: every chonk you own; picking one swaps the model here and in camp. */
  private chonkList(): HTMLElement[] {
    const current = gameSettings.get().character;
    const grid = el('div', 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;width:1000px;flex-shrink:0;');
    grid.append(...OWNED_CHARACTERS.map((c) => {
      const on = c.id === current;
      const t = tileShell(on, COLORS.cardBorder, COLORS.cardShadow);
      t.append(portraitImg(c.art, 116), el('p', `${TEXT}font-weight:600;font-size:20px;color:${COLORS.ink};text-align:center;min-height:50px;` +
        'display:flex;align-items:center;', c.name));
      if (on) t.appendChild(badge('PLAYING', GREEN));
      pressable(t, 4, () => {
        if (on) return;
        this.opts.onSelectCharacter?.(c.id);
        this.refreshPreview();
        this.render(false);
      });
      return t;
    }));
    return [label('Chonk'), grid];
  }

  private displayList(): HTMLElement[] {
    const owned = playerInventory.list(isDisplayable).map((x) => x.item)
      .sort((a, b) => a.kind.localeCompare(b.kind) || RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
    const shown = playerLoadout.tent.displayed.length;
    const out: HTMLElement[] = [label(`On display · ${shown}`)];
    out.push(el('p', `${TEXT}font-weight:600;font-size:26px;color:${COLORS.brown};align-self:flex-start;margin:-8px 0 0 30px;`,
      'Tap your toys and gear to show them off at your tent.'));
    if (!owned.length) {
      out.push(el('p', `${TEXT}font-weight:600;font-size:28px;color:${COLORS.brown};text-align:center;max-width:860px;`,
        'Nothing to display yet — collect toys and outfits first!'));
      return out;
    }
    const grid = el('div', 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;width:1000px;flex-shrink:0;');
    grid.append(...owned.map((it) => {
      const on = playerLoadout.isDisplayed(it.id);
      return this.itemTile(it, on, () => {
        playerLoadout.setDisplayed(it.id, !on);
        if (!on && it.sound) playToySound(it.sound);
      }, on ? 'ON DISPLAY' : 'TAP TO SHOW');
    }));
    out.push(grid);
    return out;
  }
}

// ── Pieces ────────────────────────────────────────────────────────────────

function label(t: string): HTMLElement {
  return el('p', `${TEXT}font-weight:700;font-size:32px;color:${MENU.sectionInk};align-self:flex-start;margin:4px 0 0 30px;` +
    'flex-shrink:0;', t);
}

function tileShell(on: boolean, rim: string, shadow: string): HTMLElement {
  return el('div', `position:relative;background:${on ? SELECTED_BG : '#fff'};border:5px solid ${on ? GOLD : rim};border-radius:30px;` +
    `box-shadow:0 6px 0 ${on ? GOLD_DARK : shadow};padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:6px;` +
    'cursor:pointer;');
}

function badge(text: string, bg: string, soft = false): HTMLElement {
  return el('p', `${TEXT}font-weight:700;font-size:20px;border-radius:14px;padding:2px 12px;` +
    (soft ? `color:${SOFT_INK};` : `color:#fff;background:${bg};`), text);
}

/** The "Nothing" / default tile's art in the item grid's 116 art well. */
function iconBox(src: string): HTMLElement {
  const box = el('div', 'width:116px;height:116px;display:flex;align-items:center;justify-content:center;');
  box.appendChild(iconImg(src, 104));
  return box;
}

function portraitImg(art: string, size: number): HTMLElement {
  const img = el('img', `width:${size}px;height:${size}px;object-fit:contain;pointer-events:none;`) as HTMLImageElement;
  img.src = chonkArt(art); img.alt = ''; img.draggable = false;
  return img;
}

function itemImg(it: Item, size: number): HTMLElement {
  const img = el('img', `width:${size}px;height:${size}px;object-fit:contain;pointer-events:none;`) as HTMLImageElement;
  img.alt = it.name;
  void rewardArtUrl(it).then((u) => { img.src = u; });
  return img;
}

export function showCustomize(host: HTMLElement, opts?: CustomizeScreenOptions): CustomizeScreen {
  return new CustomizeScreen(host, opts);
}
