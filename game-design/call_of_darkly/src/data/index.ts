// Re-exports every data table and builds id lookup maps. Throws at load if an id collides across item tables.
import type { AmmoDef, ArmorDef, AccessoryDef, ConsumableDef, EnemyDef, GrenadeDef, GunDef, ItemDef, KeyDef, WeaponDef, ItemId, DropTableDef, ShopDef } from './types';
import { AMMO } from './ammo';
import { WEAPONS } from './weapons';
import { ARMOR, ARMOR_SETS } from './armor';
import { ACCESSORIES } from './accessories';
import { CONSUMABLES, GRENADES } from './items';
import { KEYS } from './keys';
import { ENEMIES } from './enemies';
import { DROP_TABLES } from './droptables';
import { SHOPS } from './shops';

export type * from './types';
export { AMMO, WEAPONS, ARMOR, ARMOR_SETS, ACCESSORIES, CONSUMABLES, GRENADES, KEYS, ENEMIES, DROP_TABLES, SHOPS };
export { STATS, levelCost } from './stats';

export const WEAPON_LIST: WeaponDef[] = Object.values(WEAPONS);
export const GUN_LIST: GunDef[] = WEAPON_LIST.filter((w): w is GunDef => 'ammo' in w);
export const ARMOR_LIST: ArmorDef[] = Object.values(ARMOR);
export const ACCESSORY_LIST: AccessoryDef[] = Object.values(ACCESSORIES);
export const CONSUMABLE_LIST: ConsumableDef[] = Object.values(CONSUMABLES);
export const GRENADE_LIST: GrenadeDef[] = Object.values(GRENADES);
export const KEY_LIST: KeyDef[] = Object.values(KEYS);
export const ENEMY_LIST: EnemyDef[] = Object.values(ENEMIES);
export const DROP_TABLE_LIST: DropTableDef[] = Object.values(DROP_TABLES);
export const SHOP_LIST: ShopDef[] = Object.values(SHOPS);
export const AMMO_LIST: AmmoDef[] = Object.values(AMMO);

/** Every item record across all item tables. */
export const ALL_ITEMS: ItemDef[] = [
  ...WEAPON_LIST, ...ARMOR_LIST, ...ACCESSORY_LIST, ...CONSUMABLE_LIST, ...GRENADE_LIST, ...KEY_LIST,
];

function indexById<T extends { id: string }>(label: string, list: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of list) {
    if (m.has(x.id)) throw new Error(`duplicate ${label} id: ${x.id}`);
    m.set(x.id, x);
  }
  return m;
}

export const ITEMS_BY_ID: ReadonlyMap<ItemId, ItemDef> = indexById('item', ALL_ITEMS);
export const ENEMIES_BY_ID: ReadonlyMap<string, EnemyDef> = indexById('enemy', ENEMY_LIST);
export const DROP_TABLES_BY_ID: ReadonlyMap<string, DropTableDef> = indexById('drop table', DROP_TABLE_LIST);
export const SHOPS_BY_ID: ReadonlyMap<string, ShopDef> = indexById('shop', SHOP_LIST);
