// The Care Package roll (all local, persisted) + a Care-Package view of the player's
// inventory. Ownership itself lives in the shared inventory (inventory/inventory.ts);
// this keeps the pity counter. Rolls are weighted by rarity (rewards.ts), with a pity
// guarantee of Epic+ every CARE_PACKAGE.pityEvery opens. No duplicates: a package only
// gives items you haven't collected — from the rolled rarity if any are left, else the
// nearest rarity that still has some — and once you own everything it pays out golden
// pinecones instead (CARE_PACKAGE.allCollectedPinecones).

import { storageGet, storageSet } from '../storage';
import { playerInventory } from '../inventory/inventory';
import {
  CARE_PACKAGE, CARE_PACKAGE_TOKEN, RARITIES, RARITY_INFO, poolOf, rewardById, type Rarity, type Reward,
} from './rewards';
import { PREMIUM } from '../economy';

/** What the card shows when everything's collected (not a real item — never granted). */
export const ALL_COLLECTED_REWARD: Reward = {
  id: 'bonus_all_collected', name: `${CARE_PACKAGE.allCollectedPinecones} ${PREMIUM.name}`, kind: 'token', rarity: 'epic',
  emoji: '🌲', blurb: "You've collected everything in the Care Package! Have some pinecones instead.",
};

const KEY = 'chonk.inventory.v1';

interface InventoryState {
  /** Opens since the last Epic-or-better. */
  sincePity: number;
  opened: number;
}

export interface CarePackageResult {
  reward: Reward;
  /** First time you've got this item. */
  isNew: boolean;
  /** How many you own now (including this one). */
  count: number;
  /** Pony beads given back for a duplicate (0 when new). */
  refund: number;
  /** This roll was forced up by the pity counter. */
  pity: boolean;
  /** Everything's collected: golden pinecones paid out instead of an item (reward is ALL_COLLECTED_REWARD). */
  pinecones?: number;
}

type Listener = () => void;

class Inventory {
  private s: InventoryState = { sincePity: 0, opened: 0, ...storageGet<Partial<InventoryState>>(KEY, {}) };
  private listeners = new Set<Listener>();
  /** Debug: the next roll is this rarity. */
  forceNext: Rarity | null = null;

  count(id: string): number { return playerInventory.count(id); }
  owns(id: string): boolean { return playerInventory.owns(id); }
  /** Free packages waiting to be opened (Camp Pass rewards). */
  get freePackages(): number { return playerInventory.count(CARE_PACKAGE_TOKEN.id); }
  /** Use up a free package; false if there isn't one. */
  takeFreePackage(): boolean { return playerInventory.take(CARE_PACKAGE_TOKEN.id); }
  get opened(): number { return this.s.opened; }
  /** Opens left until an Epic+ is guaranteed. */
  get pityLeft(): number { return Math.max(1, CARE_PACKAGE.pityEvery - this.s.sincePity); }

  /** Rolls one package and adds the reward. The caller has already taken the pinecones. */
  open(rng: () => number = Math.random): CarePackageResult {
    let rarity = this.forceNext ?? pickRarity(rng);
    this.forceNext = null;
    const pity = this.s.sincePity + 1 >= CARE_PACKAGE.pityEvery && RARITIES.indexOf(rarity) < RARITIES.indexOf('epic');
    if (pity) rarity = rng() < 0.85 ? 'epic' : 'legendary';
    const got = uncollectedNear(rarity);
    this.s.opened++;
    if (!got) {
      // Nothing left to collect anywhere: pinecones (the screen adds them to the wallet).
      this.s.sincePity = 0;
      this.save();
      return { reward: ALL_COLLECTED_REWARD, isNew: true, count: 0, refund: 0, pity: false, pinecones: CARE_PACKAGE.allCollectedPinecones };
    }
    rarity = got.rarity;
    const reward = got.pool[Math.floor(rng() * got.pool.length)];
    const { count } = playerInventory.grant(reward.id, 'care_package');
    this.s.sincePity = RARITIES.indexOf(rarity) >= RARITIES.indexOf('epic') ? 0 : this.s.sincePity + 1;
    this.save();
    const isNew = count === 1;
    return { reward, isNew, count, refund: isNew ? 0 : RARITY_INFO[rarity].dupeBeads, pity };
  }

  /** Adds an item bought outright (e.g. troop gear from the Shop). */
  grant(id: string): void {
    playerInventory.grant(id, 'shop');
  }

  /** Owned rewards (for the collection view). */
  list(): { reward: Reward; count: number }[] {
    return playerInventory.list((it) => !!rewardById(it.id)).map(({ item, count }) => ({ reward: item, count }));
  }

  /** Debug: wipes the whole player inventory (not just Care Package items) and the pity counter. */
  reset(): void {
    this.s = { sincePity: 0, opened: 0 };
    playerInventory.reset();
    this.save();
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    const off = playerInventory.subscribe(l);
    return () => { this.listeners.delete(l); off(); };
  }

  private save(): void {
    storageSet(KEY, this.s);
    this.listeners.forEach((l) => l());
  }
}

/**
 * Items of `rarity` not collected yet; if there are none, the nearest rarity that has some
 * (ties go to the rarer one — a nice surprise). Null once everything is collected.
 */
function uncollectedNear(rarity: Rarity): { rarity: Rarity; pool: Reward[] } | null {
  const at = RARITIES.indexOf(rarity);
  for (let d = 0; d < RARITIES.length; d++) {
    for (const i of [at + d, at - d]) {
      const r = RARITIES[i];
      if (!r) continue;
      const pool = poolOf(r).filter((x) => !playerInventory.ownsReally(x.id));
      if (pool.length) return { rarity: r, pool };
    }
  }
  return null;
}

function pickRarity(rng: () => number): Rarity {
  const live = RARITIES.filter((r) => poolOf(r).length > 0);
  const total = live.reduce((s, r) => s + RARITY_INFO[r].weight, 0);
  let x = rng() * total;
  for (const r of live) {
    x -= RARITY_INFO[r].weight;
    if (x < 0) return r;
  }
  return live[live.length - 1];
}

export const inventory = new Inventory();
