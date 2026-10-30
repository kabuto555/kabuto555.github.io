// §7 Keys (only for in-scope doors). `opens` is a door id for the level DSL; null = joke key.
import type { ItemId, KeyDef } from './types';

export const KEYS: Record<ItemId, KeyDef> = {
  residence_key: {
    id: 'residence_key', kind: 'key', name: 'Residence Key', maxStack: 1,
    description: 'Brass key on a loop of wire, worn smooth by a previous owner. Opens the locked house next to the Burg Merchant. Chest inside holds the Bounty Tag and a Plate Carrier piece.',
    opens: 'burg_residence',
  },
  watchtower_key: {
    id: 'watchtower_key', kind: 'key', name: 'Watchtower Key', maxStack: 1,
    description: 'Heavy iron key, too clean for this place. Watchtower side door. Shortcut to the Burg bonfire plus a stash (Tac Vest Frame).',
    opens: 'burg_watchtower',
  },
  basement_key: {
    id: 'basement_key', kind: 'key', name: 'Basement Key', maxStack: 1,
    description: 'Opens the basement door. The door is behind a construction barrier. Pending budget approval.',
    opens: null,
  },
};
