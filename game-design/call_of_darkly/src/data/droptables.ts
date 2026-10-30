// §4 Drops (COD-style). Per PLAN: souls are always dropped (EnemyDef.souls), ammo is common, gun rare,
// grenade uncommon, armor pieces rare (hollow soldiers). Chances/amounts are placeholders.
import type { DropTableDef, DropTableId } from './types';

export const DROP_TABLES: Record<DropTableId, DropTableDef> = {
  drops_hollow_sword: {
    id: 'drops_hollow_sword',
    entries: [
      { kind: 'ammo', chance: 0.65, types: [1, 2], amount: [12, 30] }, // balance: Firelink hollows are reliable ammo farms (EV ~10 rifle/kill vs ~6.4 spent)
    ],
  },
  drops_hollow_firebomb: {
    id: 'drops_hollow_firebomb',
    entries: [
      { kind: 'item', chance: 0.1, ids: ['molotov', 'frag_grenade'] }, // placeholder chance (grenade uncommon)
    ],
  },
  drops_hollow_crossbow: {
    id: 'drops_hollow_crossbow',
    entries: [
      { kind: 'ammo', chance: 0.5, types: [1, 1], amount: [10, 24] }, // balance
    ],
  },
  drops_hollow_soldier: {
    id: 'drops_hollow_soldier',
    entries: [
      { kind: 'ammo', chance: 0.4, types: [1, 1], amount: [12, 24] }, // balance: shield soldiers cost ~2x the rounds of a hollow
      { kind: 'item', chance: 0.05, ids: ['smg_mp5'] }, // placeholder chance (gun rare; SMG example in PLAN)
      { kind: 'item', chance: 0.02, ids: ['rusted_helm', 'chainmail_vest', 'leather_bracers', 'hollow_greaves'] }, // placeholder (armor rare)
    ],
    // PLAN §7: Basement Key is a guaranteed first-kill drop from a Burg hollow soldier.
    firstKill: ['basement_key'],
  },
  drops_black_knight: {
    id: 'drops_black_knight',
    entries: [
      // PLAN §10 "guaranteed weapon": the Black Knight's Halberd (§4 table); chance 1, and he only dies once.
      { kind: 'item', chance: 1, ids: ['black_knights_halberd'] },
    ],
  },
  // PLAN §7/§10 B7: the Burg mimic always drops the Dead Silence Patch.
  drops_mimic: {
    id: 'drops_mimic',
    entries: [],
    // guaranteed first-kill drop: never despawns, persists until taken (a plain chance-1 entry would time out on the floor)
    firstKill: ['dead_silence_patch'],
  },
};
