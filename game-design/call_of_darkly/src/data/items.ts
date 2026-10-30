// §7 Consumables / quick items and grenades. Numbers not in PLAN are placeholders.
import { DamageType } from '../core/entity';
import type { ConsumableDef, GrenadeDef, ItemId } from './types';

const consumable = (d: Omit<ConsumableDef, 'kind' | 'maxStack' | 'useTime'> & Partial<Pick<ConsumableDef, 'useTime'>>): ConsumableDef => ({
  kind: 'consumable',
  maxStack: 99,
  useTime: 1.5, // placeholder
  ...d,
});

const grenade = (d: Omit<GrenadeDef, 'kind' | 'maxStack'>): GrenadeDef => ({ kind: 'grenade', maxStack: 99, ...d });

export const CONSUMABLES: Record<ItemId, ConsumableDef> = {
  dogtags_lost_operator: consumable({
    id: 'dogtags_lost_operator', name: 'Dogtags of a Lost Operator', description: 'Tags from an operator nobody filed a report on. Gain 200 souls.',
    effect: { type: 'souls', amount: 200 },
  }),
  dogtags_large: consumable({
    id: 'dogtags_large', name: 'Large Dogtags', description: 'A thick stack of tags, one for every name you forgot to remember. Gain 400 souls.',
    effect: { type: 'souls', amount: 400 },
  }),
  extraction_flare: consumable({
    id: 'extraction_flare', name: 'Extraction Flare', description: 'Fire it, and the sky remembers where you last rested. Warp to the last rested bonfire (keeps souls).',
    effect: { type: 'warpToBonfire' },
  }),
  incendiary_rounds: consumable({
    id: 'incendiary_rounds', name: 'Incendiary Rounds', description: 'Resin packed into the casings, and a lot of smoke. Gun shots deal +fire damage for 60 s.',
    effect: {
      type: 'buff', buffId: 'incendiary_rounds', duration: 60,
      modifiers: [{ key: 'gunFireDamage', op: 'add', value: 10 }], // placeholder value
    },
  }),
  ammo_crate_small: consumable({
    id: 'ammo_crate_small', name: 'Ammo Crate (small)', description: 'Dented crate with a stenciled ration number. Refill reserve of all owned ammo types (capped).',
    effect: { type: 'ammoRefill', fraction: 0.25 }, // placeholder fraction (PLAN: "X%")
  }),
  ammo_crate_large: consumable({
    id: 'ammo_crate_large', name: 'Ammo Crate (large)', description: 'Lid still sealed, and nobody has been brave enough to open it. Refill reserve of all owned ammo types (capped).',
    effect: { type: 'ammoRefill', fraction: 0.5 }, // placeholder fraction (PLAN: "X%")
  }),
  energy_drink: consumable({
    id: 'energy_drink', name: 'Energy Drink', description: 'Lukewarm can, and the label promises wings. Stamina regen +50% for 30 s.',
    effect: {
      type: 'buff', buffId: 'energy_drink', duration: 30,
      modifiers: [{ key: 'staminaRegen', op: 'pct', value: 0.5 }],
    },
  }),
};

export const GRENADES: Record<ItemId, GrenadeDef> = {
  frag_grenade: grenade({
    id: 'frag_grenade', name: 'Frag Grenade', description: 'Pin, lever, count to two and a half. 150 splash, 2.5 s fuse, cookable. Count faster and you learn the hard way.',
    damage: 150, radius: 6, fuse: 2.5, cookable: true, damageType: DamageType.Explosive, poiseDamage: 50, // radius/poise placeholder
  }),
  molotov: grenade({
    id: 'molotov', name: 'Molotov', description: 'A bottle, a rag, and a bad plan. Fire pool for 5 s, DoT.',
    damage: 0, radius: 3, fuse: 0, cookable: false, damageType: DamageType.Fire, poiseDamage: 0,
    dot: { dps: 10, duration: 5, radius: 3 }, // dps/radius placeholder
  }),
  flashbang: grenade({
    id: 'flashbang', name: 'Flashbang', description: 'Bright, loud, and very rude. Stuns non-boss enemies for 3 s (opens riposte/crit window).',
    damage: 0, radius: 8, fuse: 1.5, cookable: false, damageType: DamageType.Physical, poiseDamage: 0, // radius/fuse placeholder
    stun: 3,
  }),
  throwing_knife: grenade({
    id: 'throwing_knife', name: 'Throwing Knife', description: 'Cheap, silent, pulls single enemies. Quiet is a feature when everything else in the Burg is shouting.',
    damage: 30, radius: 0, fuse: 0, cookable: false, damageType: DamageType.Physical, poiseDamage: 5, // damage/poise placeholder
    silent: true,
  }),
};
