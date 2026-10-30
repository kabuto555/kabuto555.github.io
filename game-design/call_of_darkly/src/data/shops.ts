// §4/§5/§6 merchants. Item sources come from PLAN; prices and stock are placeholders.
import type { ShopDef, ShopId } from './types';

export const SHOPS: Record<ShopId, ShopDef> = {
  petrus_firelink: {
    id: 'petrus_firelink',
    merchant: 'Petrus',
    entries: [
      { itemId: 'pump_shotgun', price: 400, stock: null }, // balance price
      { itemId: 'smg_mp5', price: 500, stock: null }, // balance price
      { itemId: 'riot_shield', price: 450, stock: null }, // balance price
      { itemId: 'ghillie_hood', price: 150, stock: null }, // balance price
      { itemId: 'ghillie_wrap', price: 150, stock: null }, // balance price
      { itemId: 'ghillie_leggings', price: 150, stock: null }, // balance price
      { itemId: 'fire_discipline_patch', price: 300, stock: null }, // balance price
      { itemId: 'frag_grenade', price: 100, stock: null, bundle: 1 }, // balance price (both merchants)
      // Ammo isn't an item id (AMMO is a type table); closest sellable fit is the ammo crate. PLAN §10: "grenades and ammo".
      { itemId: 'ammo_crate_small', price: 150, stock: null }, // balance price
    ],
  },
  burg_merchant: {
    id: 'burg_merchant',
    merchant: 'Burg Merchant',
    entries: [
      { itemId: 'marksman_rifle', price: 900, stock: null }, // balance price
      { itemId: 'lmg', price: 1100, stock: null }, // balance price
      { itemId: 'machete_fire_axe', price: 450, stock: null }, // balance price
      { itemId: 'rpg', price: 1500, stock: 1 }, // "pricey" per PLAN; price/stock balance: ~70% of a full Firelink->Black Knight run's souls (2100)
      { itemId: 'eod_helmet', price: 450, stock: null }, // balance price
      { itemId: 'eod_jacket', price: 600, stock: null }, // balance price
      { itemId: 'eod_gauntlets', price: 450, stock: null }, // balance price
      { itemId: 'eod_trousers', price: 450, stock: null }, // balance price
      { itemId: 'marathon_patch', price: 400, stock: null }, // balance price
      { itemId: 'frag_grenade', price: 100, stock: null, bundle: 1 }, // balance price (both merchants)
      { itemId: 'residence_key', price: 300, stock: 1 }, // PLAN §7/§10: DS1-faithful key seller; price placeholder
      { itemId: 'extraction_flare', price: 250, stock: null }, // PLAN §10; price placeholder
      // "all ammo types": no per-type ammo items exist, so crates stand in. // TODO: per-type ammo items
      { itemId: 'ammo_crate_small', price: 150, stock: null }, // balance price
      { itemId: 'ammo_crate_large', price: 400, stock: null }, // balance price
    ],
  },
};
