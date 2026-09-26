/**
 * Character appearance — which animal a character is and what they wear.
 *
 * Registries are data-only so new animals drop in without touching the bot
 * logic: add a SPECIES entry (with its GLB). What a character wears is an
 * avatar loadout (customization/loadout.ts: headwear, top, bottom, footwear,
 * accessory, toy); `applyAppearance` dresses the model (customization/attire.ts).
 */
import type { Rng } from '../rng';
import type { AvatarLoadout } from '../customization/loadout';
import { dressCharacter } from '../customization/attire';

type Object3D = InstanceType<typeof THREE.Object3D>;

export type SpeciesId = 'frog' | 'kangaroo' | 'chicken' | 'dog' | DogSkinId | 'bear';

/** Re-skins of the dog body (assets/skins/dog_<id>.jpg, all on dog_wim.glb's UV layout). */
export type DogSkinId =
  | 'cheetah'
  | 'tiger'
  | 'raccoon'
  | 'black_white_dog'
  | 'brown_bear'
  | 'grey_cat'
  | 'fox'
  | 'grey_wolf_dog'
  | 'jindo'
  | 'german_shepherd'
  | 'shiba'
  | 'tuxedo';

export interface SpeciesDef {
  label: string;
  modelUrl: string;
  /**
   * Optional skin: a base-colour texture painted on `modelUrl`'s UV layout
   * (see loadSpeciesGltf). Skins of one body share its GLB, clips and LODs.
   */
  skinUrl?: string;
  /** Relative roll weight for procedural characters. */
  weight: number;
  /**
   * Per-species fine-tune multiplier/offset, applied ON TOP of the shared
   * bot scale/footOffset (params.frogScale / params.footOffset in main.ts).
   * Every asset is normalized to match the frog's idle-pose height during
   * export, so these should stay near 1 / 0 — they exist as a live-tunable
   * safety valve (via the debug panel's "Character lineup", see
   * debug-lineup.ts) for whatever residual per-asset mismatch slips through
   * export, without needing per-species branches in engine code. Tune live,
   * then lock the read-off values here as the new hardcoded defaults.
   */
  scale: number;
  footOffset: number;
}

/**
 * All species share the frog's animation clip names and are normalized to
 * the frog's natural (unscaled) height during asset export, so a single
 * global scale/animation pipeline applies to every entry here with no
 * per-species tuning beyond the `scale`/`footOffset` safety valve above.
 */
/**
 * Rolled bot mix (minigame rosters; the camp uses CAMP_BODY_MIX) is balanced
 * by BODY, not by entry: the dog body has 13 entries (base + 12 skins), so
 * they split one body's share between them.
 */
const BODY_WEIGHT = 3;
const DOG_BODY_WEIGHT = 4; // a bit more: 13 styles to show off
const DOG = { modelUrl: 'assets/dog_wim.glb', weight: 0, scale: 1.14, footOffset: -0.29 }; // weight set below
const dogSkin = (label: string, id: DogSkinId): SpeciesDef => ({ ...DOG, label, skinUrl: `assets/skins/dog_${id}.jpg` });

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  frog: { label: 'Frog', modelUrl: 'assets/frog_wim.glb', weight: BODY_WEIGHT, scale: 1, footOffset: 0 },
  kangaroo: { label: 'Kangaroo', modelUrl: 'assets/kangaroo_wim.glb', weight: BODY_WEIGHT, scale: 1.26, footOffset: 0.52 },
  chicken: { label: 'Chicken', modelUrl: 'assets/chicken_wim.glb', weight: BODY_WEIGHT, scale: 1.12, footOffset: -0.27 },
  dog: { ...DOG, label: 'Dog' },
  cheetah: dogSkin('Cheetah', 'cheetah'),
  tiger: dogSkin('Tiger', 'tiger'),
  raccoon: dogSkin('Raccoon', 'raccoon'),
  black_white_dog: dogSkin('Black & White Dog', 'black_white_dog'),
  brown_bear: dogSkin('Brown Bear', 'brown_bear'),
  grey_cat: dogSkin('Grey Cat', 'grey_cat'),
  fox: dogSkin('Fox', 'fox'),
  grey_wolf_dog: dogSkin('Grey Wolf Dog', 'grey_wolf_dog'),
  jindo: dogSkin('Jindo', 'jindo'),
  german_shepherd: dogSkin('German Shepherd', 'german_shepherd'),
  shiba: dogSkin('Shiba', 'shiba'),
  tuxedo: dogSkin('Tuxedo', 'tuxedo'),
  // NPC-only (weight 0: never rolled for bots, not in CHONK_SPECIES). scale 1.31 tuned by eye
  // (live slider) as the base bear; COUNSELOR.scale sizes it up. footOffset is tuned for
  // COUNSELOR.scale (feet on the ground at 1.5; measured in-game).
  bear: { label: 'Bear', modelUrl: 'assets/bear_wim.glb', weight: 0, scale: 1.31, footOffset: -0.58 },
};

/** Every camp counselor uses this body, 1.5× a camper. */
export const COUNSELOR = { species: 'bear' as SpeciesId, scale: 1.5 };

/** Every style of the dog body (the base + its skins), in a stable order. */
export const DOG_STYLES = (Object.keys(SPECIES) as SpeciesId[]).filter((id) => SPECIES[id].modelUrl === DOG.modelUrl);
for (const id of DOG_STYLES) SPECIES[id].weight = DOG_BODY_WEIGHT / DOG_STYLES.length;

export const isDogBody = (id: SpeciesId): boolean => SPECIES[id].modelUrl === DOG.modelUrl;

/**
 * Character Select / FTUE chonk id → the 3D species it plays as. Chonks not
 * listed here have portrait art but no model yet (shown as "coming soon").
 */
export const CHONK_SPECIES: Readonly<Record<string, SpeciesId>> = {
  froggo: 'frog',
  joey: 'kangaroo',
  doggo: 'dog',
  little: 'chicken',
  garbo: 'raccoon',
  yogi: 'brown_bear',
  // Dog-body skins with their own portrait (assets/ui/chonks/<id>.png; cheetah has no art yet).
  grey_cat: 'grey_cat',
  fox: 'fox',
  shiba: 'shiba',
  jindo: 'jindo',
  tuxedo: 'tuxedo',
  german_shepherd: 'german_shepherd',
  grey_wolf_dog: 'grey_wolf_dog',
  black_white_dog: 'black_white_dog',
  tiger: 'tiger',
};

/** Portrait (chonk art id) for a species: its chonk, else the dog body's (Doggo) for any other
 * dog skin, else Froggo. For rosters / cards that show a bot by its body. */
export function portraitForSpecies(species: SpeciesId): string {
  for (const [chonk, sp] of Object.entries(CHONK_SPECIES)) if (sp === species) return chonk;
  return isDogBody(species) ? 'doggo' : 'froggo';
}

/** Species for a chonk id (unknown / model-less chonks fall back to the frog). */
export const speciesForChonk = (id: string): SpeciesId => CHONK_SPECIES[id] ?? 'frog';

export interface Appearance {
  species: SpeciesId;
  /** Avatar slot → item id, only for filled slots. */
  attire: AvatarLoadout;
}

/** A body shape: a non-dog species, or `dog` for any dog style. */
/** Camper bodies (the bear is NPC-only, see COUNSELOR). */
export type Body = Exclude<SpeciesId, DogSkinId | 'bear'>;

/**
 * Exact body mix for the camp roster (dealt from a fixed shuffled deck, see
 * roster.ts). Camp bots past the deck's end get a dog.
 */
export const CAMP_BODY_MIX: Readonly<Record<Body, number>> = { frog: 12, kangaroo: 11, chicken: 11, dog: 17 };

/**
 * `body`: forces the body (the camp deck); `dogStyle`: when given and the roll lands on the dog body, use
 * DOG_STYLES[dogStyle] instead of the rolled skin — the roster deals styles out
 * in rotation so every skin shows up rather than leaving it to chance.
 */
export function rollAppearance(rng: Rng, dogStyle?: number, body?: Body): Appearance {
  const ids = Object.keys(SPECIES) as SpeciesId[];
  let species = rng.weighted(ids, (id) => SPECIES[id].weight) ?? 'frog'; // always rolled, keeps later rolls stable
  if (body) species = body === 'dog' ? DOG_STYLES[0] : body;
  if (dogStyle !== undefined && isDogBody(species)) species = DOG_STYLES[dogStyle % DOG_STYLES.length];
  // The outfit rolls from its own stream (roster.ts, rollBotAvatar) so it never shifts the body.
  return { species, attire: {} };
}

/** Dresses a spawned character (made by createCharacter) in its outfit. */
export function applyAppearance(root: Object3D, appearance: Appearance): void {
  dressCharacter(root, appearance.attire);
}
