/**
 * Chat loadouts — the handful of quick-chat messages a player has equipped.
 * Only equipped messages can be said. The local player's loadout persists in
 * localStorage; bots roll theirs from their seed.
 */
import type { Rng } from '../rng';
import { storageGet, storageSet } from '../storage';
import {
  QUICK_CHAT, getQuickChat, type ChatCategory, type ChatContext, type QuickChatMessage,
} from './quick-chat';

export const LOADOUT_SIZE = 12;

const STORAGE_KEY = 'chat_loadout_v1';

export const DEFAULT_LOADOUT: readonly string[] = [
  'hype/goated',
  'hype/w-in-the-chat',
  'accuse/who-pushed-me',
  'accuse/stealing-your-beads',
  'fail/my-bad-frfr',
  'fail/i-tripped',
  'team/lock-in',
  'team/gg-no-cap',
  'chaos/honk',
  'roast/skill-issue-frfr',
  'cheer/let-him-cook',
  'chill/eaten-popcorn-fr',
];

export class ChatLoadout {
  private readonly slots: (string | null)[];

  constructor(ids: readonly (string | null)[] = DEFAULT_LOADOUT) {
    this.slots = Array.from({ length: LOADOUT_SIZE }, (_, i) => {
      const id = ids[i] ?? null;
      return id && getQuickChat(id) ? id : null;
    });
  }

  /** Equipped message ids by slot (null = empty slot). */
  get ids(): readonly (string | null)[] {
    return this.slots;
  }

  messages(): QuickChatMessage[] {
    return this.slots.flatMap((id) => (id ? [getQuickChat(id)!] : []));
  }

  has(id: string): boolean {
    return this.slots.includes(id);
  }

  /** Equips a message in a slot (null clears it). Duplicates move rather than copy. */
  setSlot(slot: number, id: string | null): void {
    if (slot < 0 || slot >= LOADOUT_SIZE) throw new Error(`ChatLoadout: bad slot ${slot}`);
    if (id !== null && !getQuickChat(id)) throw new Error(`ChatLoadout: unknown message ${id}`);
    const prev = id === null ? -1 : this.slots.indexOf(id);
    if (prev >= 0) this.slots[prev] = null;
    this.slots[slot] = id;
  }

  /** Equipped messages that fit a situation. */
  forContext(context: ChatContext): QuickChatMessage[] {
    return this.messages().filter((m) => m.contexts.includes(context));
  }
}

// ── Local player ─────────────────────────────────────────────────────────────
export function loadPlayerLoadout(): ChatLoadout {
  return new ChatLoadout(storageGet<(string | null)[]>(STORAGE_KEY, [...DEFAULT_LOADOUT]));
}

export function savePlayerLoadout(loadout: ChatLoadout): void {
  storageSet(STORAGE_KEY, loadout.ids);
}

// ── Procedural (bots) ────────────────────────────────────────────────────────
const ALL_CONTEXTS: readonly ChatContext[] = [...new Set(QUICK_CHAT.flatMap((m) => m.contexts))];

/**
 * Rolls a loadout that covers as many situations as it can (so the owner has
 * something to say in most of them), biased toward categories the owner likes.
 */
export function rollLoadout(rng: Rng, categoryBias: Partial<Record<ChatCategory, number>> = {}): ChatLoadout {
  const weight = (m: QuickChatMessage) => categoryBias[m.category] ?? 1;
  const chosen: QuickChatMessage[] = [];
  const covered = (c: ChatContext) => chosen.some((m) => m.contexts.includes(c));
  const contexts = [...ALL_CONTEXTS];
  for (let i = contexts.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [contexts[i], contexts[j]] = [contexts[j], contexts[i]];
  }
  for (const c of contexts) {
    if (chosen.length >= LOADOUT_SIZE) break;
    if (covered(c)) continue;
    const pick = rng.weighted(QUICK_CHAT.filter((m) => m.contexts.includes(c) && !chosen.includes(m)), weight);
    if (pick) chosen.push(pick);
  }
  while (chosen.length < LOADOUT_SIZE) {
    const pick = rng.weighted(QUICK_CHAT.filter((m) => !chosen.includes(m)), weight);
    if (!pick) break;
    chosen.push(pick);
  }
  return new ChatLoadout(chosen.map((m) => m.id));
}
