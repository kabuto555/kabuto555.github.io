/**
 * BotChatter — makes bots talk like players, using only their quick-chat loadout — and
 * play with their toys like players do: tooting to cheer a win, to mock a splash or a
 * bump, answering someone else's toy with their own (toy battles — the player's toy
 * button counts), spamming it while pestering the player, and now and then just because.
 *
 * Reactions: listens to game events and has the bots involved (and a couple
 * of bots nearby who saw it) respond after a human-ish typing delay — hype
 * on a win, salt when bumped, roasts when someone splashes, and so on.
 * Ambient: bots lingering somewhere occasionally say something that fits —
 * spectator chill at a spectate spot, banter when hanging out with others,
 * random memes while wandering. Replies: hearing a line nearby can set off a
 * response.
 */
import type { ChatService } from '../chat/chat-service';
import type { ChatContext, QuickChatMessage } from '../chat/quick-chat';
import { getQuickChat } from '../chat/quick-chat';
import { gameEvents, type GameEvent } from '../events';
import type { Bot } from './bot';

type Vector3 = import('three').Vector3;

/** What a bot is up to, as far as chatter cares. */
export type BotActivity =
  | { kind: 'course' }
  /** `hype` = watching the sumo ring: louder, and heavy on the emotes. */
  | { kind: 'spectate'; finishLine: boolean; hype?: boolean }
  | { kind: 'social'; campfire: boolean }
  | { kind: 'minigame_queue' }
  | { kind: 'wander' }
  /** Busy bugging the player (lines come from `blurt`, not ambient chatter). */
  | { kind: 'pester' };

const WATCH_RADIUS = 20;            // world units a bot notices course events within
const REPLY_RADIUS = 9;             // ...and hears nearby chat within
const MAX_WATCHERS = 2;             // bystanders reacting to a single event
const REPLY_CHANCE = 0.06;          // per nearby bot per heard line, before chattiness
const SELF_DELAY = [0.4, 1.4] as const;
const WATCH_DELAY = [0.8, 2.4] as const;
const QUIET_AFTER = [6, 14] as const; // personal cooldown after speaking (÷ chattiness)
const GLOBAL_GAP = 0.3;             // min seconds between any two bot lines
const AMBIENT_TICK = 1;             // seconds between ambient rolls per bot
const SOCIAL_RADIUS = 4.5;          // others this close make it a conversation
// Sumo crowd: it's a big bowl, so spectators across the ring still see the action.
const SUMO_WATCH_RADIUS = 34;
const SUMO_MAX_WATCHERS = 4;
const HYPE_RATE = 0.14;             // per-second ambient chance while watching sumo (before chattiness)
const HYPE_EMOTE_SHARE = 0.55;      // ...of which this share are emotes rather than lines
const HYPE_EMOTES = ['🔥', '😂', '👏', '😮', '💀', '📣', '🍿', '😤', '🙌', '💪'];
const BIG_HIT_EMOTES = ['😮', '💥', '🔥', '💀', '😂'];
const RING_OUT_EMOTES = ['😂', '💀', '👋', '🍿', '😭'];
const WIN_EMOTES = ['🎉', '👏', '🏆', '🔥', '🙌'];
const BOMB_EMOTES = ['💥', '😱', '💣', '🤯', '😂'];
const PEPPER_EMOTES = ['🌶️', '🔥', '🥵', '😈'];
// Toys.
const TOY_QUIET = [5, 12] as const;   // personal cooldown after playing a toy (÷ chattiness)
const TOY_GAP = 0.25;               // min seconds between any two bot toys (no cacophony)
const TOY_REPLY_RADIUS = 12;        // bots this close to a toy may answer it with theirs
const TOY_REPLY_CHANCE = 0.2;       // ...per heard toy (× chattiness); the player's toy is 2× as tempting
const SUMO_TOY_SHARE = 0.3;         // sumo cheers that are a toy rather than an emote
const PESTER_TOY_CHANCE = 0.4;      // a pester blurt followed by a toy in their face
/** Per-second ambient toy chance by activity, before chattiness. */
const TOY_AMBIENT: Record<BotActivity['kind'], number> = {
  course: 0, spectate: 0.006, social: 0.01, minigame_queue: 0.012, wander: 0.003, pester: 0.05,
};
const HYPE_TOY_RATE = 0.03;

/** Per-second ambient chance by activity, before chattiness. */
const AMBIENT_RATE: Record<BotActivity['kind'], number> = {
  course: 0, spectate: 0.03, social: 0.035, minigame_queue: 0.02, wander: 0.008, pester: 0,
};

interface Pending {
  bot: Bot;
  context: ChatContext;
  /** When set, prefer a message from this category (piling on). */
  echo?: QuickChatMessage['category'];
  /** When set, pop this emote instead of saying a line. */
  emoji?: string;
  /** Play their toy instead of saying a line. */
  toy?: boolean;
  at: number;
}

export class BotChatter {
  private readonly byActor = new Map<string, Bot>();
  private readonly quietUntil = new Map<Bot, number>();
  private readonly ambientIn = new Map<Bot, number>();
  private readonly lastBlurt = new Map<Bot, string>();
  private readonly toyQuiet = new Map<Bot, number>();
  private lastToy = -Infinity;
  private pending: Pending[] = [];
  private clock = 0;
  private lastLine = -Infinity;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly bots: readonly Bot[],
    private readonly chat: ChatService,
    private readonly activity: (bot: Bot) => BotActivity,
    private readonly headOf: (bot: Bot, out: Vector3) => Vector3,
    /** Plays the bot's toy (gesture + sound); false if it can't right now (hidden, no toy). */
    private readonly playToy?: (bot: Bot) => boolean,
  ) {
    for (const b of bots) {
      const actor = { id: b.profile.memberId, name: b.profile.name };
      this.byActor.set(actor.id, b);
      chat.register({
        actor, loadout: b.profile.chatLoadout, anchor: (out) => headOf(b, out),
        hidden: () => !b.root.visible || b.root.parent?.visible === false, // the crowd is hidden in dodge ball
      });
      this.ambientIn.set(b, b.rng.range(0, AMBIENT_TICK * 4));
    }
    this.unsubscribe = gameEvents.onAny((e) => this.onEvent(e));
  }

  dispose(): void {
    this.unsubscribe();
  }

  update(dt: number): void {
    this.clock += dt;
    this.fire();
    this.ambient(dt);
  }

  // ── Reactions ──────────────────────────────────────────────────────────────
  private onEvent(e: GameEvent): void {
    switch (e.type) {
      case 'course_start':
        this.self(e.actor.id, 'self_start', 0.35);
        this.watchers(e, 'watch_start', 0.12);
        break;
      case 'course_progress':
        this.self(e.actor.id, 'self_doing_well', e.progress >= 0.8 ? 0.25 : 0.12);
        this.watchers(e, 'watch_doing_well', e.progress >= 0.8 ? 0.2 : 0.1);
        break;
      case 'course_spring':
        // Springs are common; only some of them get a reaction.
        this.self(e.actor.id, 'self_doing_well', 0.15);
        this.watchers(e, 'watch_big_play', 0.12);
        break;
      case 'course_splash':
        if (e.bumpedBy) {
          this.self(e.actor.id, 'self_bumped', 0.65);
          this.watchers(e, 'watch_bump', 0.25);
          this.selfToy(e.bumpedBy.id, 0.3); // the bumper toots in triumph
        } else {
          this.self(e.actor.id, e.splashes >= 1 && this.coin() ? 'self_struggling' : 'self_fail', 0.5);
          this.watchers(e, e.splashes >= 1 ? 'watch_struggling' : 'watch_fail', 0.25);
        }
        this.toyWatchers(e, 0.15); // mocking the splash
        break;
      case 'course_bump':
        this.self(e.actor.id, 'self_bumped_other', 0.45);
        this.self(e.target.id, 'self_bumped', 0.55);
        this.watchers(e, 'watch_bump', 0.2, [e.target.id]);
        this.selfToy(e.actor.id, 0.2);
        break;
      case 'course_bumped_out':
        this.self(e.actor.id, 'self_bumped', 0.7);
        this.watchers(e, 'watch_bump', 0.3);
        this.toyWatchers(e, 0.2);
        break;
      case 'course_win':
        this.self(e.actor.id, 'self_win', 0.75);
        this.watchers(e, 'watch_win', e.splashes === 0 ? 0.45 : 0.3);
        this.selfToy(e.actor.id, 0.45); // victory toot
        this.toyWatchers(e, 0.3);        // and the crowd joins in
        break;
      case 'course_quit':
        this.self(e.actor.id, 'self_quit', 0.6);
        this.watchers(e, 'watch_fail', 0.15);
        this.toyWatchers(e, 0.12);
        break;
      case 'sumo_hit':
        this.watchers(e, 'watch_bump', e.force > 16 ? 0.35 : 0.18, [e.target.id], SUMO_WATCH_RADIUS, SUMO_MAX_WATCHERS);
        this.cheer(e.pos, BIG_HIT_EMOTES, e.force > 16 ? 0.4 : 0.2);
        break;
      case 'sumo_out':
        this.watchers(e, e.by ? 'watch_bump' : 'watch_fail', 0.45, [], SUMO_WATCH_RADIUS, SUMO_MAX_WATCHERS);
        this.cheer(e.pos, RING_OUT_EMOTES, 0.55);
        break;
      case 'sumo_item':
        if (e.item === 'bomb') {
          this.watchers(e, 'watch_big_play', 0.4, [], SUMO_WATCH_RADIUS, SUMO_MAX_WATCHERS);
          this.cheer(e.pos, BOMB_EMOTES, 0.65);
        } else {
          this.cheer(e.pos, PEPPER_EMOTES, 0.35);
        }
        break;
      case 'sumo_win':
        this.watchers(e, 'watch_win', 0.6, [], SUMO_WATCH_RADIUS, SUMO_MAX_WATCHERS);
        this.cheer(e.pos, WIN_EMOTES, 0.8);
        break;
      case 'chat':
        this.replies(e);
        break;
      case 'toy':
        this.toyReplies(e);
        break;
    }
  }

  // ── Toys ───────────────────────────────────────────────────────────────────
  /** Plays the bot's toy now, unless it (or the whole camp) just did. */
  private toy(bot: Bot): boolean {
    if (!this.playToy || (this.toyQuiet.get(bot) ?? 0) > this.clock || this.clock - this.lastToy < TOY_GAP) return false;
    if (!this.playToy(bot)) return false;
    this.lastToy = this.clock;
    const chatty = Math.max(0.15, bot.profile.personality.chattiness);
    this.toyQuiet.set(bot, this.clock + bot.rng.range(...TOY_QUIET) / chatty);
    return true;
  }

  private queueToy(bot: Bot, delay: readonly [number, number]): void {
    if (this.pending.some((p) => p.bot === bot && p.toy)) return;
    this.pending.push({ bot, context: 'wander', toy: true, at: this.clock + bot.rng.range(delay[0], delay[1]) });
  }

  /** The bot it happened to (or who did it) plays their toy. */
  private selfToy(actorId: string, chance: number): void {
    const bot = this.byActor.get(actorId);
    if (bot && bot.rng.chance(chance * (0.4 + bot.profile.personality.chattiness * 0.6))) this.queueToy(bot, SELF_DELAY);
  }

  /** A couple of bystanders cheer / mock with their toys. */
  private toyWatchers(e: GameEvent, chance: number, radius = WATCH_RADIUS, max = MAX_WATCHERS): void {
    const near = this.bots.filter((b) =>
      b.profile.memberId !== e.actor.id && b.root.position.distanceTo(e.pos) < radius && this.activity(b).kind !== 'course');
    let n = 0;
    for (const b of shuffle(near)) {
      if (n >= max) break;
      if (b.rng.chance(chance * b.profile.personality.chattiness)) { this.queueToy(b, WATCH_DELAY); n++; }
    }
  }

  /** Someone played a toy nearby: one bot might answer with theirs (toy battle). */
  private toyReplies(e: Extract<GameEvent, { type: 'toy' }>): void {
    const boost = e.actor.id === 'player' ? 2 : 1;
    const near = this.bots.filter((b) =>
      b.profile.memberId !== e.actor.id && b.root.position.distanceTo(e.pos) < TOY_REPLY_RADIUS && this.activity(b).kind !== 'course');
    for (const b of shuffle(near)) {
      if (!b.rng.chance(TOY_REPLY_CHANCE * boost * b.profile.personality.chattiness)) continue;
      this.queueToy(b, [0.5, 1.6]);
      break;
    }
  }

  private coin(): boolean {
    return Math.random() < 0.5;
  }

  /** The bot the event happened to (if it's a bot) reacts. */
  private self(actorId: string, context: ChatContext, chance: number): void {
    const bot = this.byActor.get(actorId);
    if (!bot || !bot.rng.chance(chance * (0.5 + bot.profile.personality.chattiness * 0.5))) return;
    this.queue(bot, context, SELF_DELAY);
  }

  /** A few bystanders who saw it react. */
  private watchers(
    e: GameEvent, context: ChatContext, chance: number, exclude: string[] = [],
    radius = WATCH_RADIUS, max = MAX_WATCHERS,
  ): void {
    const skip = new Set([e.actor.id, ...exclude]);
    const near = this.bots.filter((b) =>
      !skip.has(b.profile.memberId) && b.root.position.distanceTo(e.pos) < radius &&
      this.activity(b).kind !== 'course');
    let n = 0;
    for (const b of shuffle(near)) {
      if (n >= max) break;
      if (b.rng.chance(chance * b.profile.personality.chattiness)) { this.queue(b, context, WATCH_DELAY); n++; }
    }
  }

  /** Sumo spectators near `pos` pop an emote (each rolls `chance`). */
  private cheer(pos: Vector3, emojis: readonly string[], chance: number): void {
    for (const b of this.bots) {
      const act = this.activity(b);
      if (act.kind !== 'spectate' || !act.hype || b.root.position.distanceTo(pos) > SUMO_WATCH_RADIUS) continue;
      if (!b.rng.chance(chance * (0.4 + 0.6 * b.profile.personality.chattiness))) continue;
      if (this.pending.some((p) => p.bot === b)) continue;
      if (b.rng.chance(SUMO_TOY_SHARE)) { this.queueToy(b, [0.15, 1.2]); continue; }
      this.pending.push({ bot: b, context: 'spectate_idle', emoji: b.rng.pick([...emojis]), at: this.clock + b.rng.range(0.15, 1.2) });
    }
  }

  /** Someone said something nearby: maybe pile on or respond. */
  private replies(e: Extract<GameEvent, { type: 'chat' }>): void {
    const heard = getQuickChat(e.messageId);
    if (!heard) return;
    const near = this.bots.filter((b) =>
      b.profile.memberId !== e.actor.id && b.root.position.distanceTo(e.pos) < REPLY_RADIUS);
    for (const b of shuffle(near)) {
      if (!b.rng.chance(REPLY_CHANCE * b.profile.personality.chattiness)) continue;
      this.pending.push({
        bot: b, context: 'reply', echo: b.rng.chance(0.5) ? heard.category : undefined,
        at: this.clock + b.rng.range(...WATCH_DELAY),
      });
      break; // one reply per line keeps it from snowballing
    }
  }

  private queue(bot: Bot, context: ChatContext, delay: readonly [number, number]): void {
    if (this.pending.some((p) => p.bot === bot)) return;
    this.pending.push({ bot, context, at: this.clock + bot.rng.range(delay[0], delay[1]) });
  }

  private fire(): void {
    if (this.pending.length === 0) return;
    const due = this.pending.filter((p) => p.at <= this.clock);
    this.pending = this.pending.filter((p) => p.at > this.clock);
    for (const p of due) {
      if (p.toy) { this.toy(p.bot); continue; }
      if (p.emoji) { this.chat.emote(p.bot.profile.memberId, p.emoji); continue; } // emotes don't crowd the chat gap
      if (this.clock - this.lastLine < GLOBAL_GAP) {
        // Busy moment: let it slip a little rather than stack bubbles.
        if (p.at > this.clock - 1.5) this.pending.push({ ...p, at: this.clock + GLOBAL_GAP });
        continue;
      }
      this.speak(p.bot, p.context, p.echo);
    }
  }

  private speak(bot: Bot, context: ChatContext, echo?: QuickChatMessage['category']): boolean {
    if ((this.quietUntil.get(bot) ?? 0) > this.clock) return false;
    const loadout = bot.profile.chatLoadout;
    let options = echo ? loadout.messages().filter((m) => m.category === echo) : [];
    if (options.length === 0) options = loadout.forContext(context);
    if (options.length === 0) return false;
    const msg = bot.rng.pick(options);
    if (!this.chat.say(bot.profile.memberId, msg.id)) return false;
    this.lastLine = this.clock;
    const chatty = Math.max(0.15, bot.profile.personality.chattiness);
    this.quietUntil.set(bot, this.clock + bot.rng.range(...QUIET_AFTER) / chatty);
    return true;
  }

  /**
   * Says something chaotic right now (walking up to someone and blurting a
   * meme), ignoring the usual quiet time. Prefers the loadout's chaos lines.
   */
  blurt(bot: Bot): boolean {
    const loadout = bot.profile.chatLoadout;
    const prev = this.lastBlurt.get(bot);
    const fresh = (ms: QuickChatMessage[]) => ms.filter((m) => m.id !== prev);
    const pools = [
      fresh(loadout.messages().filter((m) => m.category === 'chaos')),
      fresh(loadout.forContext('social')),
      fresh(loadout.forContext('reply')),
      fresh(loadout.messages()),
    ];
    const options = pools.find((p) => p.length > 0);
    if (!options) return false;
    const msg = bot.rng.pick(options);
    if (!this.chat.say(bot.profile.memberId, msg.id)) return false;
    this.lastBlurt.set(bot, msg.id);
    this.lastLine = this.clock;
    if (bot.rng.chance(PESTER_TOY_CHANCE)) this.queueToy(bot, [0.6, 1.3]); // ...and a toy in your face
    return true;
  }

  // ── Ambient ────────────────────────────────────────────────────────────────
  private ambient(dt: number): void {
    for (const b of this.bots) {
      const t = (this.ambientIn.get(b) ?? 0) - dt;
      if (t > 0) { this.ambientIn.set(b, t); continue; }
      this.ambientIn.set(b, AMBIENT_TICK);
      const act = this.activity(b);
      const hype = act.kind === 'spectate' && !!act.hype;
      const toyRate = (hype ? HYPE_TOY_RATE : TOY_AMBIENT[act.kind]) * b.profile.personality.chattiness;
      if (toyRate > 0 && b.rng.chance(toyRate * AMBIENT_TICK) && this.toy(b)) continue; // just because
      const rate = (hype ? HYPE_RATE : AMBIENT_RATE[act.kind]) * b.profile.personality.chattiness;
      if (rate <= 0 || !b.rng.chance(rate * AMBIENT_TICK)) continue;
      if (hype && b.rng.chance(HYPE_EMOTE_SHARE)) { this.chat.emote(b.profile.memberId, b.rng.pick(HYPE_EMOTES)); continue; }
      if (this.clock - this.lastLine < GLOBAL_GAP) continue;
      this.speak(b, this.ambientContext(b, act));
    }
  }

  private ambientContext(b: Bot, act: BotActivity): ChatContext {
    switch (act.kind) {
      case 'spectate': return act.finishLine && b.rng.chance(0.3) ? 'finish_line' : 'spectate_idle';
      case 'social': {
        if (act.campfire && b.rng.chance(0.4)) return 'campfire';
        const company = this.bots.some((o) => o !== b && o.root.position.distanceTo(b.root.position) < SOCIAL_RADIUS);
        return company ? 'social' : 'wander';
      }
      case 'minigame_queue': return b.rng.chance(0.5) ? 'watch_start' : 'self_start';
      default: return 'wander';
    }
  }
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
