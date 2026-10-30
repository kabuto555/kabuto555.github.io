import type { SaveData } from '../core/save';

/**
 * One-time world state keyed by level-DSL placement ids (§7 persistence): looted items, opened
 * chests/doors, misc flags (first-kill drops). Chest loot uses the looted id `chest:<id>` so a
 * chest opened but not yet emptied restores its loot glow.
 */
export class WorldProgress {
  private readonly looted = new Set<string>();
  private readonly chests = new Set<string>();
  private readonly doors = new Set<string>();
  private readonly flagSet = new Set<string>();
  /** Placed/chest loot that was partly taken: id -> remaining stacks. */
  private readonly partial = new Map<string, { id: string; count: number }[]>();
  /** Fired after any mutation (main.ts schedules a save). */
  onChange: (() => void) | null = null;

  isLooted(id: string): boolean {
    return this.looted.has(id);
  }
  markLooted(id: string): void {
    this.add(this.looted, id);
  }
  isChestOpened(id: string): boolean {
    return this.chests.has(id);
  }
  markChestOpened(id: string): void {
    this.add(this.chests, id);
  }
  isDoorOpened(id: string): boolean {
    return this.doors.has(id);
  }
  markDoorOpened(id: string): void {
    this.add(this.doors, id);
  }
  hasFlag(flag: string): boolean {
    return this.flagSet.has(flag);
  }
  setFlag(flag: string): void {
    this.add(this.flagSet, flag);
  }

  /** Remaining stacks of partly-taken loot `id`, or null. */
  getPartial(id: string): { id: string; count: number }[] | null {
    return this.partial.get(id) ?? null;
  }
  /** Record (or, with an empty/null list, clear) what is left of loot `id`. */
  setPartial(id: string, rest: readonly { id: string; count: number }[] | null): void {
    if (!rest || rest.length === 0) {
      if (this.partial.delete(id)) this.onChange?.();
      return;
    }
    this.partial.set(id, rest.map((r) => ({ id: r.id, count: r.count })));
    this.onChange?.();
  }

  private add(set: Set<string>, id: string): void {
    if (set.has(id)) return;
    set.add(id);
    this.onChange?.();
  }

  load(save: SaveData | null | undefined): void {
    this.looted.clear();
    this.chests.clear();
    this.doors.clear();
    this.flagSet.clear();
    this.partial.clear();
    if (!save) return;
    for (const id of save.lootedItems) this.looted.add(id);
    for (const id of save.openedChests) this.chests.add(id);
    for (const id of save.openedDoors) this.doors.add(id);
    for (const f of save.flags) this.flagSet.add(f);
    for (const [id, list] of Object.entries(save.partialLoot ?? {})) {
      if (!Array.isArray(list)) continue;
      const ok = list.filter((l) => l && typeof l.id === 'string' && Number.isFinite(l.count) && l.count > 0).map((l) => ({ id: l.id, count: Math.floor(l.count) }));
      if (ok.length) this.partial.set(id, ok);
    }
  }

  writeSave(save: SaveData): SaveData {
    save.lootedItems = [...this.looted];
    save.openedChests = [...this.chests];
    save.openedDoors = [...this.doors];
    // flags also carry other systems' one-shots: merge rather than overwrite.
    const merged = new Set(save.flags);
    for (const f of this.flagSet) merged.add(f);
    save.flags = [...merged];
    save.partialLoot = Object.fromEntries([...this.partial].map(([k, v]) => [k, v.map((l) => ({ id: l.id, count: l.count }))]));
    return save;
  }
}
