// What bots say around a tabletop game (free-text bubbles, not quick chat). `{name}` is who
// they're talking to; `{game}` / `{emoji}` the game's name and badge. Each game's own shouts
// (a big move, the best move, no move) live with it in games.ts.

export const TABLE_LINES = {
  /** Set up a game and waiting for the human to come over. */
  invite: ['anyone up for {game}? {emoji}', 'who wants to lose at {game}? 😤', 'bored… wanna play? {emoji}',
    '1v1 me in {game} {emoji}', 'come play {game}!! {emoji}'],
  /** Calling another bot over. */
  challenge: ['{name}! {game}? {emoji}', 'yo {name}, 1v1 me 😤', '{name} bet you can\'t beat me {emoji}',
    '{name} come play!! {emoji}'],
  /** Taking up a challenge. */
  accept: ['you\'re on 😤', 'ooh I\'m in! {emoji}', 'prepare to lose 🤓', 'let\'s gooo {emoji}', 'say less'],
  /** Gave up waiting for the human. */
  giveUp: ['nvm 😔', 'fine I\'ll play by myself', 'ok nobody then 🥲'],
  /** Their opponent just scored big. */
  ouch: ['bro what 💀', 'no wayyy', 'hacks 🤨', 'ok that was good 😤', 'lucky 🙄'],
  win: ['gg ez 😎', 'gg!', 'GG 🏆', 'too easy', 'undefeated 😤'],
  lose: ['gg 😭', 'rematch?? 😤', 'I got robbed', 'gg wp', 'next time 😤'],
  draw: ['a TIE?? 😳', 'gg we\'re both geniuses'],
  /** The human walked away mid-game. */
  quit: ['rage quit?? 😭', 'gg I guess 🤷', 'hey come back!!'],
} as const;

export function line(pool: readonly string[], pick: (n: number) => number,
  fill: { name?: string; game?: string; emoji?: string } = {}): string {
  return pool[pick(pool.length)].replace(/\{name\}/g, fill.name ?? '')
    .replace(/\{game\}/g, fill.game ?? 'a game').replace(/\{emoji\}/g, fill.emoji ?? '');
}
