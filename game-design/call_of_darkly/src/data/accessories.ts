// §6 Accessories (DS1 rings → COD perks). Modifier values are the PLAN percentages, expressed in the
// ModifierKey convention from inventory/types.ts (multiplier keys base 1: 'pct' +0.4 = +40%).
import type { AccessoryDef, ItemId } from './types';

const acc = (d: Omit<AccessoryDef, 'kind' | 'maxStack'>): AccessoryDef => ({ kind: 'accessory', maxStack: 1, ...d });

export const ACCESSORIES: Record<ItemId, AccessoryDef> = {
  // Firelink cliff corpse
  scavenger_patch: acc({
    id: 'scavenger_patch', name: 'Scavenger Patch', description: 'Stitched by someone who never came back for their share. +50% ammo drop chance; ammo packs give +25%.',
    dsAnalog: 'Covetous Silver Serpent',
    modifiers: [
      { key: 'ammoDropChance', op: 'pct', value: 0.5 },
      { key: 'ammoPackAmount', op: 'pct', value: 0.25 },
    ],
  }),
  // Burg chest (bonfire house)
  sleight_of_hand_patch: acc({
    id: 'sleight_of_hand_patch', name: 'Sleight of Hand Patch', description: 'Taped onto a glove that was too quick for its own good. Reload speed +40%.',
    modifiers: [{ key: 'reloadSpeed', op: 'pct', value: 0.4 }],
  }),
  // Burg Merchant
  marathon_patch: acc({
    id: 'marathon_patch', name: 'Marathon Patch', description: 'A runner patch from a camp that had no finish line. Sprint stamina cost -40%.',
    dsAnalog: 'Grass Crest (regen)',
    modifiers: [{ key: 'sprintStaminaCost', op: 'pct', value: -0.4 }],
  }),
  // Residence Key room chest
  bounty_tag: acc({
    id: 'bounty_tag', name: 'Bounty Tag', description: 'A tag with a price written in someone else handwriting. +20% souls from kills.',
    dsAnalog: 'Covetous Gold Serpent',
    modifiers: [{ key: 'soulGain', op: 'pct', value: 0.2 }],
  }),
  // Burg tower corpse
  steady_aim_patch: acc({
    id: 'steady_aim_patch', name: 'Steady Aim Patch', description: 'Stitched over a tremor it does not have. ADS sway and recoil -30%.',
    modifiers: [
      { key: 'adsSway', op: 'pct', value: -0.3 },
      { key: 'recoil', op: 'pct', value: -0.3 },
    ],
  }),
  // Watchtower stash (key)
  tac_vest_frame: acc({
    id: 'tac_vest_frame', name: 'Tac Vest Frame', description: 'A vest frame that remembers every load it ever carried. Max equip load +40%.',
    dsAnalog: "Havel's Ring",
    modifiers: [{ key: 'equipLoad', op: 'pct', value: 0.4 }],
  }),
  // Petrus (Firelink)
  fire_discipline_patch: acc({
    id: 'fire_discipline_patch', name: 'Fire Discipline Patch', description: 'Off a soldier who never let a cigarette near the dry grass. Fire absorb +25%.',
    dsAnalog: 'Flame Stoneplate',
    modifiers: [{ key: 'fireAbsorb', op: 'add', value: 0.25 }],
  }),
  // Mimic drop (§7)
  dead_silence_patch: acc({
    id: 'dead_silence_patch', name: 'Dead Silence Patch', description: 'Taken from something that breathes wrong. Footsteps silent; enemy hearing radius -50%.',
    dsAnalog: 'Slumbering Dragoncrest',
    modifiers: [
      { key: 'footstepVolume', op: 'mul', value: 0 },
      { key: 'hearingRadius', op: 'pct', value: -0.5 },
    ],
  }),
  // Black Knight area corpse
  martyrdom_dogtag: acc({
    id: 'martyrdom_dogtag', name: 'Martyrdom Dogtag',
    description: 'A tag that waits for you to die and then takes someone with it. On death, drop a live frag that hits nearby enemies (does not damage your returning self).',
    dsAnalog: 'Ring of Sacrifice (joke inverse)',
    modifiers: [{ key: 'martyrdom', op: 'add', value: 1 }],
  }),
};
