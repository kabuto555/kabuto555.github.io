// Leaderboard content. WIM has no backend, so the board is FAKED locally: a pool
// of made-up players (Figma mock names) with the local player's best score slotted
// in by rank. Swap the pool / scores here; the screen just renders entries.

export interface LeaderboardEntry {
  name: string;
  score: number;
  /** The local player — the screen scrolls to and outlines this row. */
  isPlayer?: boolean;
}

/** Exactly the Figma mock (42:4891). */
export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { name: 'monkey with gun', score: 24850 },
  { name: 'pooped in my pant', score: 18400 },
  { name: 'stinkdog', score: 14250 },
  ...Array.from({ length: 7 }, () => ({ name: 'womp womp', score: 18400 })),
];

/** Fake rivals for the local board (names in the same spirit as the mock). */
export const FAKE_RIVALS: LeaderboardEntry[] = [
  { name: 'monkey with gun', score: 24850 },
  { name: 'pooped in my pant', score: 18400 },
  { name: 'stinkdog', score: 14250 },
  { name: 'womp womp', score: 12900 },
  { name: 'Ad_Skipper_3000', score: 11620 },
  { name: 'chonk norris', score: 9875 },
  { name: 'frogtastic', score: 8400 },
  { name: 'sir waddles', score: 7210 },
  { name: 'big snack', score: 5960 },
  { name: 'noodle legs', score: 4380 },
  { name: 'lil bean', score: 2150 },
];

/** Rivals + the player's score, sorted high → low. */
export function buildLeaderboard(playerName: string, playerScore: number,
                                 rivals: LeaderboardEntry[] = FAKE_RIVALS): LeaderboardEntry[] {
  return [...rivals, { name: playerName, score: playerScore, isPlayer: true }]
    .sort((a, b) => b.score - a.score);
}
