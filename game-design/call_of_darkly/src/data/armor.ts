// §5 Armor pieces and sets. All absorb/poise/weight numbers are placeholders (PLAN gives qualitative values only).
import type { ArmorDef, ArmorSetDef, ArmorSetId, ItemId } from './types';

// placeholder: physAbsorb/fireAbsorb/explosiveAbsorb/poise/weight are not in PLAN §5.
// Weight by class (light < medium = heavy, as before). Light is tuned so the starting kit (AR 3 + pistol 3 + knife 1 +
// 4 Operator Fatigues pieces = 10.6 / ~44.6 max load = 0.24) lands in the FAST roll tier (§5, ratio < 0.25).
const CLASS_WEIGHT: Record<ArmorDef['weightClass'], number> = { light: 0.9, medium: 3, heavy: 3 };

function piece(
  d: Pick<ArmorDef, 'id' | 'name' | 'slot' | 'set' | 'weightClass' | 'source'> & Partial<ArmorDef>,
): ArmorDef {
  return {
    kind: 'armor',
    description: '',
    maxStack: 1,
    physAbsorb: 0.05, // placeholder
    fireAbsorb: 0.05, // placeholder
    explosiveAbsorb: 0.05, // placeholder
    poise: 5, // placeholder
    weight: CLASS_WEIGHT[d.weightClass], // placeholder
    ...d,
  };
}

const ARMOR_LIST: ArmorDef[] = [
  // Operator Fatigues (Light, Start)
  piece({ id: 'patrol_cap', description: 'Issued to a man who expected a parade. Keeps the sun off and the optimism on.', name: 'Patrol Cap', slot: 'head', set: 'operator_fatigues', weightClass: 'light', source: 'start' }),
  piece({ id: 'bdu_shirt', description: 'Battle dress, unpressed. Sweat stains at the collar tell a story nobody asked for.', name: 'BDU Shirt', slot: 'chest', set: 'operator_fatigues', weightClass: 'light', source: 'start' }),
  piece({ id: 'shooting_gloves', description: 'Thin leather, thinner promises. Good grip, bad for whatever you were grabbing.', name: 'Shooting Gloves', slot: 'arms', set: 'operator_fatigues', weightClass: 'light', source: 'start' }),
  piece({ id: 'cargo_pants', description: 'Eleven pockets, all empty. You will fill them, and then you will regret it.', name: 'Cargo Pants', slot: 'legs', set: 'operator_fatigues', weightClass: 'light', source: 'start' }),

  // Plate Carrier (Medium, scattered Firelink + Burg chests)
  piece({ id: 'fast_helmet', description: 'Lightweight helmet with one ear cup still taped on. Stops most of what the Burg throws.', name: 'FAST Helmet', slot: 'head', set: 'plate_carrier', weightClass: 'medium', source: 'found' }),
  piece({ id: 'plate_carrier', description: 'Ceramic plates, vest straps, and a pouch full of someone else spare magazines.', name: 'Plate Carrier', slot: 'chest', set: 'plate_carrier', weightClass: 'medium', source: 'found' }),
  piece({ id: 'kevlar_sleeves', description: 'Padded sleeves that rustle on every reload. The enemy hears that too.', name: 'Kevlar Sleeves', slot: 'arms', set: 'plate_carrier', weightClass: 'medium', source: 'found' }),
  piece({ id: 'knee_pad_pants', description: 'Knee pads for crawling through Burg drainage. The sprawled Hollows never learned that lesson.', name: 'Knee-Pad Pants', slot: 'legs', set: 'plate_carrier', weightClass: 'medium', source: 'found' }),

  // Ghillie Suit (Light, Petrus). No arms piece in PLAN.
  piece({ id: 'ghillie_hood', description: 'Burlap strips and dried grass. Blends into the hedges, and burns like the hedges.', name: 'Ghillie Hood', slot: 'head', set: 'ghillie_suit', weightClass: 'light', source: 'shop', fireAbsorb: 0 }),
  piece({ id: 'ghillie_wrap', description: 'A poncho of fake grass. The enemy loses track of you. So does your squad.', name: 'Ghillie Wrap', slot: 'chest', set: 'ghillie_suit', weightClass: 'light', source: 'shop', fireAbsorb: 0 }),
  piece({ id: 'ghillie_leggings', description: 'Dry grass knotted to canvas. Wear two pieces and the Hollows lose interest. Dry grass also loses interest in not burning.', name: 'Ghillie Leggings', slot: 'legs', set: 'ghillie_suit', weightClass: 'light', source: 'shop', fireAbsorb: 0 }),

  // Hollow Soldier Kit (Medium, rare hollow soldier drops)
  piece({ id: 'rusted_helm', description: 'Taken from a Hollow who no longer needed it. The rust is part of the design.', name: 'Rusted Helm', slot: 'head', set: 'hollow_soldier_kit', weightClass: 'medium', source: 'drop', poise: 10 }),
  piece({ id: 'chainmail_vest', description: 'Rings that rattle on every step. Good poise, bad for sneaking.', name: 'Chainmail Vest', slot: 'chest', set: 'hollow_soldier_kit', weightClass: 'medium', source: 'drop', poise: 10 }),
  piece({ id: 'leather_bracers', description: 'Old straps dyed the color of old blood. Keeps a shield arm steady when it counts.', name: 'Leather Bracers', slot: 'arms', set: 'hollow_soldier_kit', weightClass: 'medium', source: 'drop', poise: 10 }),
  piece({ id: 'hollow_greaves', description: 'Greaves from a soldier who had no more use for them. Looks fantastic with an M4.', name: 'Hollow Greaves', slot: 'legs', set: 'hollow_soldier_kit', weightClass: 'medium', source: 'drop', poise: 10 }),

  // EOD Bomb Suit (Heavy, Burg Merchant)
  // placeholder: explosiveAbsorb per EOD piece (PLAN says "huge"); 4 x 0.16 = 0.64 full set (inside the resolver's cap)
  piece({ id: 'eod_helmet', description: 'Bomb-disposal visor with a fogged window. Big explosive resist, which matters when the RPG is yours.', name: 'EOD Helmet', slot: 'head', set: 'eod_bomb_suit', weightClass: 'heavy', source: 'shop', explosiveAbsorb: 0.16 }),
  piece({ id: 'eod_jacket', description: 'Heavy blast jacket. Walks like a fridge and absorbs like a bunker.', name: 'EOD Jacket', slot: 'chest', set: 'eod_bomb_suit', weightClass: 'heavy', source: 'shop', explosiveAbsorb: 0.16 }),
  piece({ id: 'eod_gauntlets', description: 'Thick gloves for defusing things. Your fingers stop feeling the weight after a while. Eventually the weight stops feeling you.', name: 'EOD Gauntlets', slot: 'arms', set: 'eod_bomb_suit', weightClass: 'heavy', source: 'shop', explosiveAbsorb: 0.16 }),
  piece({ id: 'eod_trousers', description: 'Blast trousers, stiff as a plank. Slow roll unless you have invested in Endurance.', name: 'EOD Trousers', slot: 'legs', set: 'eod_bomb_suit', weightClass: 'heavy', source: 'shop', explosiveAbsorb: 0.16 }),

  // Night-Vision Visor (Light, Burg hidden chest, head only)
  piece({ id: 'night_vision_visor', description: 'Green-tinted visor that finds the dark corners. Everything looks like a bad PS1 demo, which is the point.', name: 'Night-Vision Visor', slot: 'head', set: 'nv_visor', weightClass: 'light', source: 'found' }),
];

export const ARMOR: Record<ItemId, ArmorDef> = Object.fromEntries(ARMOR_LIST.map((a) => [a.id, a]));

export const ARMOR_SETS: Record<ArmorSetId, ArmorSetDef> = {
  operator_fatigues: {
    id: 'operator_fatigues', name: 'Operator Fatigues',
    pieces: ['patrol_cap', 'bdu_shirt', 'shooting_gloves', 'cargo_pants'],
  },
  plate_carrier: {
    id: 'plate_carrier', name: 'Plate Carrier',
    pieces: ['fast_helmet', 'plate_carrier', 'kevlar_sleeves', 'knee_pad_pants'],
  },
  ghillie_suit: {
    id: 'ghillie_suit', name: 'Ghillie Suit',
    pieces: ['ghillie_hood', 'ghillie_wrap', 'ghillie_leggings'],
    // PLAN §5: enemy aggro radius -35% when wearing 2+ pieces.
    bonus: { minPieces: 2, modifiers: [{ key: 'aggroRadius', op: 'pct', value: -0.35 }] },
  },
  hollow_soldier_kit: {
    id: 'hollow_soldier_kit', name: 'Hollow Soldier Kit',
    pieces: ['rusted_helm', 'chainmail_vest', 'leather_bracers', 'hollow_greaves'],
  },
  eod_bomb_suit: {
    id: 'eod_bomb_suit', name: 'EOD Bomb Suit',
    pieces: ['eod_helmet', 'eod_jacket', 'eod_gauntlets', 'eod_trousers'],
  },
  nv_visor: {
    id: 'nv_visor', name: 'Night-Vision Visor',
    pieces: ['night_vision_visor'],
  },
};
