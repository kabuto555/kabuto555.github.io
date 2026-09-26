// Item catalog — every ownable thing in the game, whatever gives it out (Care Packages,
// the Shop, the Camp Pass…). Content modules describe their items and register them
// here (registerItems); the player's inventory (inventory.ts) only stores ids + counts
// and looks the rest up in this catalog.
//
// Wearables, toys and camp-spot items are equipped in the Customize screen
// (customization/loadout.ts); troop gear recolours your HQ.

import type { Rarity } from '../care-package/rewards';

export type ItemKind =
  // Care Package originals.
  | 'accessory' | 'emote' | 'colour' | 'character' | 'pennant' | 'tent'
  // Your camp spot: tent + sleeping bed, each a type (shape), a material and a colour.
  | 'tent_style' | 'tent_material' | 'tent_colour'
  | 'bed_style' | 'bed_material' | 'bed_colour' | 'lantern'
  // Toys (make a sound when you play with them).
  | 'toy'
  // Wearables.
  | 'hat' | 'wrist' | 'necklace' | 'bag' | 'shoes' | 'top' | 'bottom'
  // Emotes.
  | 'dance' | 'gesture'
  // Consumables that aren't cosmetics (e.g. a free Care Package).
  | 'token';

/** Backpack tabs — how kinds are grouped for browsing. */
export type ItemGroup = 'camp' | 'wearables' | 'toys' | 'emotes' | 'colours' | 'chonks' | 'troop' | 'tokens';

export const ITEM_GROUPS: { id: ItemGroup; label: string }[] = [
  { id: 'camp', label: 'Camp' },
  { id: 'wearables', label: 'Outfit' },
  { id: 'toys', label: 'Toys' },
  { id: 'emotes', label: 'Emotes' },
  { id: 'colours', label: 'Colours' },
  { id: 'troop', label: 'Troop' },
];

export const KIND_INFO: Record<ItemKind, { label: string; plural: string; group: ItemGroup }> = {
  accessory:     { label: 'Accessory',     plural: 'Accessories',    group: 'wearables' },
  emote:         { label: 'Emote',         plural: 'Emotes',         group: 'emotes' },
  colour:        { label: 'Colour',        plural: 'Colours',        group: 'colours' },
  character:     { label: 'Chonkimal',     plural: 'Chonkimals',     group: 'chonks' },
  pennant:       { label: 'Troop Pennant', plural: 'Troop Pennants', group: 'troop' },
  tent:          { label: 'Troop Tent',    plural: 'Troop Tents',    group: 'troop' },
  tent_style:    { label: 'Tent',          plural: 'Tents',          group: 'camp' },
  tent_material: { label: 'Tent Material', plural: 'Tent Materials', group: 'camp' },
  tent_colour:   { label: 'Tent Colour',   plural: 'Tent Colours',   group: 'camp' },
  bed_style:     { label: 'Bed',           plural: 'Beds',           group: 'camp' },
  bed_material:  { label: 'Bed Material',  plural: 'Bed Materials',  group: 'camp' },
  bed_colour:    { label: 'Bed Colour',    plural: 'Bed Colours',    group: 'camp' },
  lantern:       { label: 'Lantern',       plural: 'Lanterns',       group: 'camp' },
  toy:           { label: 'Toy',           plural: 'Toys',           group: 'toys' },
  hat:           { label: 'Hat',           plural: 'Hats',           group: 'wearables' },
  wrist:         { label: 'Wristwear',     plural: 'Wristwear',      group: 'wearables' },
  necklace:      { label: 'Necklace',      plural: 'Necklaces',      group: 'wearables' },
  bag:           { label: 'Bag',           plural: 'Bags',           group: 'wearables' },
  shoes:         { label: 'Shoes',         plural: 'Shoes',          group: 'wearables' },
  top:           { label: 'Top',           plural: 'Tops',           group: 'wearables' },
  bottom:        { label: 'Bottoms',       plural: 'Bottoms',        group: 'wearables' },
  dance:         { label: 'Dance',         plural: 'Dances',         group: 'emotes' },
  gesture:       { label: 'Gesture',       plural: 'Gestures',       group: 'emotes' },
  token:         { label: 'Item',          plural: 'Items',          group: 'tokens' },
};

/** Synth presets for toys (inventory/toy-sounds.ts). */
export type ToySound = 'squeak' | 'rattle' | 'kazoo' | 'bell' | 'boing' | 'drum' | 'chime' | 'whistle'
  | 'scream' | 'slide' | 'clap' | 'whirr' | 'honk' | 'recorder' | 'dialup' | 'twang' | 'theremin' | 'fart' | 'ting'
  | 'tiles' | 'dice';

/** Tabletop games a toy sets up on the ground to challenge someone (tabletop/tabletop.ts). */
export type TabletopGameId = 'words' | 'dice';

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  /** Placeholder glyph drawn on the generated art. */
  emoji?: string;
  /** Colour items: the paint swatch. */
  swatch?: string | readonly string[];
  /** Characters: portrait id in assets/ui/chonks/<chonk>.png. */
  chonk?: string;
  /** One-line flavour. */
  blurb?: string;
  /** Troop gear: also sold in the Shop's Troop tab for this many pony beads. */
  shopPrice?: number;
  /** Toys: the sound it makes when you play with it. */
  sound?: ToySound;
  /** Game toys: using it sets this game up on the ground and challenges someone to play. */
  game?: TabletopGameId;
  /** Lanterns: the glow colour. */
  glow?: string;
  /** Only obtainable from this source (shown as a tag, e.g. "Camp Pass"). */
  exclusive?: string;
}

const REGISTRY = new Map<string, Item>();

/** Add items to the catalog (content modules call this at load). Re-registering an id replaces it. */
export function registerItems(items: readonly Item[]): void {
  for (const it of items) REGISTRY.set(it.id, it);
}

export function itemById(id: string): Item | undefined { return REGISTRY.get(id); }

export function allItems(filter?: (it: Item) => boolean): Item[] {
  const all = [...REGISTRY.values()];
  return filter ? all.filter(filter) : all;
}

export const itemGroup = (it: Item): ItemGroup => KIND_INFO[it.kind].group;
