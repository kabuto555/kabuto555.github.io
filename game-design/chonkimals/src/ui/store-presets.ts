// Store content (thin code, thick content). Figma copy is placeholder — edit here,
// the screens stay untouched. `art` = file id in assets/ui/chonks/<art>.png.
// Prices are pony beads (soft currency) unless the item has a `realPrice`.

import type { BadgeSpec, TinyTone } from './store-components';
import { pineconePackArt } from './bead-art';
import { CARE_PACKAGE_REWARDS, isTroopGear } from '../care-package/rewards';
import { rewardPlaceholderUrl } from '../care-package/reward-art';

export interface CharacterEntry {
  id: string;
  name: string;
  art: string;
}

export interface ShopItem {
  id: string;
  name: string;
  art: string;
  price: number;
  badge?: BadgeSpec;
  /** BUY button colour — Figma uses blue on the last rows. */
  buyTone?: TinyTone;
  /** Card art URL (overrides `art`). */
  image?: string;
  /** Real-money item (e.g. "$4.99"): bought through the faked store checkout, not with pony beads. */
  realPrice?: string;
  /** Golden pinecones granted by a real-money pack. */
  pinecones?: number;
  /** Troop gear: the reward id it grants (care-package/rewards.ts). */
  gearId?: string;
}

export interface ShopTab {
  label: string;
  items: ShopItem[];
}

/** Owned characters, as laid out on Figma "Character Select" (42:4728). */
export const OWNED_CHARACTERS: CharacterEntry[] = [
  { id: 'doggo', name: 'Doggo', art: 'doggo' },
  { id: 'froggo', name: 'Froggo', art: 'froggo' },
  { id: 'joey', name: 'Joey', art: 'joey' },
  { id: 'little', name: 'Little', art: 'little' },
  { id: 'yogi', name: 'Yogi', art: 'yogi' },
  { id: 'garbo', name: 'Garbo', art: 'garbo' },
  { id: 'ooga', name: 'ooga booga', art: 'ooga' },
  // The dog body's skins (bots/appearance.ts CHONK_SPECIES), each with its own portrait.
  { id: 'grey_cat', name: 'Grey Cat', art: 'grey_cat' },
  { id: 'fox', name: 'Fox', art: 'fox' },
  { id: 'shiba', name: 'Shiba', art: 'shiba' },
  { id: 'jindo', name: 'Jindo', art: 'jindo' },
  { id: 'tuxedo', name: 'Tuxedo', art: 'tuxedo' },
  { id: 'german_shepherd', name: 'German Shepherd', art: 'german_shepherd' },
  { id: 'grey_wolf_dog', name: 'Grey Wolf Dog', art: 'grey_wolf_dog' },
  { id: 'black_white_dog', name: 'Black & White Dog', art: 'black_white_dog' },
  { id: 'tiger', name: 'Tiger', art: 'tiger' },
];

const item = (id: string, name: string, art: string, price = 150, extra: Partial<ShopItem> = {}): ShopItem =>
  ({ id, name, art, price, ...extra });

/** Figma "Shop" (42:4953) — Chonkimals tab contents; other tabs are empty in the mock. */
export const SHOP_TABS: ShopTab[] = [
  {
    label: 'Chonkimals',
    items: [
      item('doggo', 'Doggo', 'doggo', 150, { badge: { kind: 'new' } }),
      item('froggo', 'Froggo', 'froggo', 75, { badge: { kind: 'sale', percent: 50 } }),
      item('joey', 'Joey', 'joey'),
      item('yogi', 'Yogi', 'yogi'),
      item('garbo', 'Garbo', 'garbo'),
      item('ooga', 'ooga booga', 'ooga'),
      item('guard-dog', 'guard dog', 'meerkat'),
      item('george', 'george', 'george'),
      item('chippy', 'chippy', 'chippy'),
      item('jackass', 'jack ass', 'jackass'),
      item('peppy', 'peppy', 'peppy'),
      item('little', 'little', 'little'),
      item('hyena', 'I’m out of names', 'hyena', 150, { buyTone: 'blue' }),
      item('hedgehog', 'I’m out of names', 'hedgehog', 150, { buyTone: 'blue' }),
      item('goat', 'I’m out of names', 'goat', 150, { buyTone: 'blue' }),
      item('meerkat-1', 'I’m out of names', 'meerkat', 150, { buyTone: 'blue' }),
      item('meerkat-2', 'I’m out of names', 'meerkat', 150, { buyTone: 'blue' }),
      item('meerkat-3', 'I’m out of names', 'meerkat', 150, { buyTone: 'blue' }),
    ],
  },
  { label: 'Colours', items: [] },
  { label: 'Accessories', items: [] },
  { label: 'Emotes', items: [] },
  { label: 'Troop', items: troopGear() },
  { label: 'Pinecones', items: pineconePacks() }, // was a duplicated "Emotes" tab in the Figma mock
];

/** Index of the Pinecones tab (the premium wallet's "+" opens the Shop here). */
export const PREMIUM_TAB = SHOP_TABS.findIndex((t) => t.label === 'Pinecones');

/** Premium golden pinecone packs (real money — the checkout is FAKED, nothing is charged). */
function pineconePacks(): ShopItem[] {
  const pack = (id: string, n: number, realPrice: string, tier: number, badge?: BadgeSpec, bonus = ''): ShopItem => ({
    id, name: `${n.toLocaleString('en-US')} Golden Pinecones${bonus}`, art: '', price: 0, realPrice, pinecones: n, badge,
    buyTone: 'blue', get image() { return artCache[tier] ??= pineconePackArt(tier, tier + 3); },
  });
  return [
    // ~$0.10 a pinecone at the small pack; a Care Package is 10.
    pack('pinecones_10', 10, '$0.99', 0),
    pack('pinecones_55', 55, '$4.99', 1, undefined, ' (+10%)'),
    pack('pinecones_120', 120, '$9.99', 2, { kind: 'sale', percent: 20 }, ' (+20%)'),
    pack('pinecones_260', 260, '$19.99', 3, undefined, ' (+30%)'),
    pack('pinecones_700', 700, '$49.99', 4, { kind: 'new' }, ' (+40%)'),
  ];
}
const artCache: string[] = [];

/** Troop gear sold for pony beads — every rewards.ts pennant/tent with a shopPrice
 * (the rest are Care-Package exclusive). */
function troopGear(): ShopItem[] {
  const art: Record<string, string> = {};
  return CARE_PACKAGE_REWARDS.filter((r) => isTroopGear(r) && r.shopPrice).map((r) => ({
    id: r.id, name: r.name, art: '', price: r.shopPrice!, gearId: r.id,
    get image() { return art[r.id] ??= rewardPlaceholderUrl(r); },
  }));
}
