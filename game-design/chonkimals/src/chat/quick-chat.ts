/**
 * Quick chat — the catalog of pre-canned messages players can put in their
 * chat loadout. Messages are grouped into categories and tagged with the
 * situations they fit, which is how bots (and later, contextual suggestions
 * for players) pick an appropriate line.
 *
 * Message ids are `<category>/<slug of the text>`. They're what loadouts
 * store, so if you reword a message, pin its old id with an explicit `id`.
 */

export type ChatCategory =
  | 'hype' | 'accuse' | 'fail' | 'team' | 'chaos' | 'roast' | 'cheer' | 'bet' | 'chill';

/** Situations a message fits. `self_*` = it happened to me, `watch_*` = I saw it happen. */
export type ChatContext =
  | 'self_start' | 'self_doing_well' | 'self_struggling' | 'self_win' | 'self_fail' | 'self_quit'
  | 'self_bumped' | 'self_bumped_other'
  | 'watch_start' | 'watch_doing_well' | 'watch_struggling' | 'watch_big_play' | 'watch_win'
  | 'watch_fail' | 'watch_bump'
  | 'spectate_idle' | 'finish_line' | 'social' | 'campfire' | 'wander'
  /** Works as a response to whatever someone nearby just said. */
  | 'reply';

export interface QuickChatMessage {
  id: string;
  text: string;
  category: ChatCategory;
  contexts: readonly ChatContext[];
}

export const CATEGORY_LABELS: Record<ChatCategory, string> = {
  hype: 'Hype, Flex & Victory',
  accuse: 'Accusations, Griefing & Theft',
  fail: 'Failure, Self-Deprecation & Confusion',
  team: 'Teamwork, Strategy & Orders',
  chaos: 'Random Camp Chaos & Memes',
  roast: 'Roasting & Lock-In',
  cheer: 'Hype & Cheering',
  bet: 'Side-Hustle Spectator Chaos',
  chill: 'Sideline Vibe & Chill',
};

type Def = [text: string, contexts: ChatContext[], id?: string];

const DEFS: Record<ChatCategory, Def[]> = {
  hype: [
    ['GOATED 🐐🔥', ['self_win', 'watch_win', 'watch_big_play']],
    ['Peak Chonk! 🏔️✨', ['self_win', 'self_doing_well', 'social']],
    ['Cooked. 🧑‍🍳🔥', ['self_win', 'watch_big_play']],
    ['Full Aura +1000 ✨🗿', ['self_win', 'self_bumped_other']],
    ['W in the chat! 🏆🔥', ['self_win', 'watch_win', 'reply']],
    ['Built different 🦾💥', ['self_win', 'self_doing_well', 'self_bumped_other']],
    ['We ball! ⚽🔥', ['self_start', 'social']],
    ['Cinema 🍿🎬', ['watch_big_play', 'watch_bump', 'watch_win', 'reply']],
  ],
  accuse: [
    ['Stealing your beads 😈📿', ['self_bumped_other', 'social']],
    ['Who pushed me?! 😡💥', ['self_bumped']],
    ['Bro thinks he’s slick 💀🥷', ['self_bumped', 'watch_bump', 'reply']],
    ['Fanum Taxed! 🍔💸', ['self_bumped_other', 'watch_bump']],
    ['Bro is toxic ☣️💀', ['self_bumped', 'watch_bump']],
    ['You did that on purpose 🤨💥', ['self_bumped']],
    ['BANNED FROM CAMP 🚫⛺', ['self_bumped', 'watch_bump']],
    ['Watch it! 🛑👀', ['self_bumped']],
  ],
  fail: [
    ['I cooked... myself 😭🔥', ['self_fail', 'self_quit']],
    ['Negative Aura -1000 📉💀', ['self_fail', 'self_quit', 'watch_fail']],
    ['My bad frfr 🙈💀', ['self_fail', 'self_bumped_other']],
    ['I tripped 🪵😵', ['self_fail']],
    ['Brainrot moments 🧠💨', ['self_fail', 'wander', 'reply']],
    ['AFK for s’mores 🪵🍫', ['self_quit', 'campfire']],
    ['HUH?! 🤔❓', ['self_bumped', 'watch_bump', 'reply']],
    ['Lagging real hard 📶💀', ['self_fail', 'self_quit', 'wander']],
  ],
  team: [
    ['Push Peak Gogogo! 🏔️🏃', ['self_start', 'wander']],
    ['Lock in! 🔒🔥', ['self_start', 'self_doing_well']],
    ['Protect the beads! 📿🛡️', ['social', 'watch_bump']],
    ['Help me! 🆘🐻', ['self_struggling']],
    ['Follow the Chonk! 🐾👉', ['wander', 'social']],
    ['Gg no cap 🤝🔥', ['self_win', 'watch_win', 'reply']],
    ['Group up at camp! ⛺️🔥', ['social', 'wander', 'campfire']],
    ['Let him cook 🧑‍🍳🍳', ['watch_start', 'watch_doing_well']],
  ],
  chaos: [
    ['Mewing in the woods 🤫🗿', ['wander', 'social']],
    ['Skibidi energy 🚽⚡', ['self_start', 'social', 'reply']],
    ['S’more time! 🪵🔥', ['campfire']],
    ['Slurping bug juice 🧃🧃', ['social', 'spectate_idle']],
    ['Honk! 🪿🔊', ['social', 'wander', 'reply']],
    ['Chonk mode activated 🦛💥', ['self_start', 'self_doing_well']],
    ['No thoughts, head empty 🫧🐻', ['wander', 'social', 'spectate_idle']],
    ['Camp Counselor is watching 👁️👄👁️', ['social', 'watch_bump']],
  ],
  roast: [
    ['LOCK IN BRO 🔒🔥', ['watch_struggling', 'watch_fail']],
    ['Bro is struggling 😭💀', ['watch_struggling', 'watch_fail']],
    ['Absolute zero aura 📉🗿', ['watch_fail']],
    ['Who let him cook?! 😭🧑‍🍳', ['watch_fail']],
    ['Watching you fall 🍿👀', ['watch_fail']],
    ['Bro tripped again 🪵🤾', ['watch_fail']],
    ['Not like this... 🙈💔', ['watch_fail', 'self_fail']],
    ['Skill issue frfr 📉💀', ['watch_fail', 'watch_bump']],
  ],
  cheer: [
    ['LET HIM COOK! 🧑‍🍳🔥', ['watch_doing_well', 'watch_big_play']],
    ['GOATED RUN! 🐐🏔️', ['watch_win']],
    ['Chonk Power! 🦛💥', ['watch_big_play', 'watch_doing_well']],
    ['HE’S INSANE 🤯🔥', ['watch_big_play', 'watch_win']],
    ['Clutch it up! 🏆✨', ['watch_doing_well']],
    ['W gameplay 🍿🎬', ['watch_win']],
    ['Speedrun status ⏱️⚡', ['watch_win', 'self_doing_well']],
    ['Unstoppable chonk! 💨🐻', ['watch_doing_well', 'self_doing_well']],
  ],
  bet: [
    ['Betting 10 beads on blue 📿🟦', ['watch_start', 'spectate_idle']],
    ['He’s not gonna make it 🛑💀', ['watch_start', 'watch_doing_well', 'watch_struggling']],
    ['Watch out behind you! ⚠️👀', ['watch_doing_well', 'watch_bump']],
    ['Drop the banana! 🍌💥', ['watch_doing_well', 'watch_bump']],
    ['Steal their spot! 😈👣', ['watch_bump']],
    ['Camp counselor incoming 👁️👄👁️', ['watch_bump', 'spectate_idle']],
  ],
  chill: [
    ['Eaten popcorn fr 🍿🥤', ['spectate_idle']],
    ['Cheering from the bench 🛋️📣', ['spectate_idle']],
    ['Better than TV 📺🍿', ['spectate_idle', 'watch_big_play']],
    ['Spamming emotes 📢✨', ['spectate_idle', 'social']],
    ['Spectator aura +500 🗿✨', ['spectate_idle']],
    ['Waiting at the finish line 🏁🏁', ['finish_line']],
  ],
};

const slug = (text: string) =>
  text.normalize('NFKD').replace(/[’']/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const QUICK_CHAT: readonly QuickChatMessage[] = (Object.keys(DEFS) as ChatCategory[]).flatMap(
  (category) => DEFS[category].map(([text, contexts, id]) => ({
    id: id ?? `${category}/${slug(text)}`,
    text,
    category,
    contexts,
  })),
);

const byId = new Map(QUICK_CHAT.map((m) => [m.id, m]));
if (byId.size !== QUICK_CHAT.length) throw new Error('quick-chat: duplicate message ids');

export function getQuickChat(id: string): QuickChatMessage | undefined {
  return byId.get(id);
}

export function messagesFor(context: ChatContext, pool: readonly QuickChatMessage[] = QUICK_CHAT): QuickChatMessage[] {
  return pool.filter((m) => m.contexts.includes(context));
}
