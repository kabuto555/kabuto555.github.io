// Player currencies — local, persisted balances shared by the camp HUD wallets,
// the Shop and every screen that shows a wallet. (No backend: it's all local.)
//   pony beads  — SOFT currency (`economy`), earned in camp, buys chonkimals in the Shop.
//                 (Was "coins"; the storage key is unchanged so balances carry over.)
//   golden pinecones — PREMIUM currency (`premium`), bought with (faked) real money in
//                 the Shop's Pinecones tab, spent on Camp Care Packages at the Canteen.
// Display names live in SOFT / PREMIUM — rename a currency there.

import { storageGet, storageSet } from './storage';

type Listener = (balance: number) => void;

class Currency {
  private amount: number;
  private listeners = new Set<Listener>();

  constructor(private readonly key: string, start: number) {
    this.amount = storageGet<number>(key, start);
  }

  get balance(): number { return this.amount; }

  add(n: number): void { this.set(this.amount + n); }

  /** Spend if affordable; returns false (and changes nothing) otherwise. */
  spend(n: number): boolean {
    if (n > this.amount) return false;
    this.set(this.amount - n);
    return true;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.amount);
    return () => this.listeners.delete(l);
  }

  private set(n: number): void {
    this.amount = Math.max(0, Math.round(n));
    storageSet(this.key, this.amount);
    this.listeners.forEach((l) => l(this.amount));
  }
}

export const SOFT = { name: 'Pony Beads', one: 'Pony Bead' } as const;
export const PREMIUM = { name: 'Golden Pinecones', one: 'Golden Pinecone', short: 'Pinecones' } as const;

/** Soft currency: pony beads. */
export const economy = new Currency('chonk.coins.v1', 240);
/** Premium currency: small numbers, pricey per unit (a Care Package is 10). Starts with enough for
 * three opens so the Canteen can be tried straight away. (v2: rescaled from the 100-per-package test economy.) */
export const premium = new Currency('chonk.premium.v2', 30);
