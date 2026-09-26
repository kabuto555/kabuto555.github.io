// Bulletin Board content (thin code, thick content): camp announcements, the daily
// challenge pool and the leaderboard boards. Edit copy / rewards / goals here; the
// board and screen just render what's in these lists.
//
// Challenges count the Camp Pass's own stats (camp-pass/content.ts StatId): the board
// listens to the pass's stat stream, so anything the pass counts, today's challenge
// counts too — and claiming a challenge pays Camp Pass points as well.

import type { DailyReward } from '../daily-rewards';
import type { StatId } from '../camp-pass/content';

/** The Camp Pass's stats (one tracking path for both systems). */
export type CampStat = StatId;

export interface Announcement {
  /** Stable id — read state is stored by id, so never reuse one for new copy. */
  id: string;
  icon: string;
  title: string;
  body: string;
  tag?: 'NEW!' | 'EVENT' | 'TIP';
}

/** Newest first; the paper shows the first four. */
export const ANNOUNCEMENTS: Announcement[] = [
  { id: 'board-open', icon: '📌', tag: 'NEW!', title: 'The Bulletin Board is up!',
    body: 'Check back every day for a new challenge and camp news.' },
  { id: 'care-packages', icon: '📦', tag: 'NEW!', title: 'Care Packages are in!',
    body: 'Grab one at the Canteen. Legendary chonks hide inside!' },
  { id: 'sumo-champs', icon: '🏆', tag: 'EVENT', title: 'Sumo Champs wanted',
    body: 'Top 3 on the Sumo board get pinned right here. Bump your way up!' },
  { id: 'lunch-crew', icon: '🍔', tag: 'TIP', title: 'Lunch Delivery needs YOU',
    body: 'The bugs are back. Help the crew get lunch down to the beach.' },
  { id: 'troops', icon: '⛺', title: 'Join a Scout Troop',
    body: 'Visit Troop HQ by the campfire to find your crew.' },
];

export interface DailyChallenge {
  id: string;
  icon: string;
  stat: CampStat;
  goal: number;
  /** Camp Pass points on claim (PASS.pointsPerStamp = 100 → a stamp). */
  passPoints: number;
  /** Short line for the paper, e.g. "Win a Sumo match". */
  title: string;
  /** Where to go / a nudge. */
  hint: string;
  reward: DailyReward;
}

/** One is picked per local day (seeded by the date — every camper would see the same one). */
export const DAILY_CHALLENGES: DailyChallenge[] = [
  { id: 'dodge2', icon: '🏐', stat: 'play:dodgeball', goal: 2, title: 'Play 2 Dodge Ball matches',
    hint: 'The court is up the path past the campfire.', reward: { kind: 'beads', amount: 150 }, passPoints: 80 },
  { id: 'dodgewin', icon: '🏐', stat: 'win:dodgeball', goal: 1, title: 'Win a Dodge Ball match',
    hint: 'Catch a ball to bring a teammate back in!', reward: { kind: 'pinecones', amount: 3 }, passPoints: 100 },
  { id: 'sumowin', icon: '🤼', stat: 'win:sumo', goal: 1, title: 'Win a Sumo match',
    hint: 'Last chonk in the ring wins. Grab the pepper!', reward: { kind: 'pinecones', amount: 3 }, passPoints: 100 },
  { id: 'sumo3', icon: '🤼', stat: 'play:sumo', goal: 3, title: 'Enter the Sumo ring 3 times',
    hint: 'The ring is at the north end of camp.', reward: { kind: 'beads', amount: 150 }, passPoints: 80 },
  { id: 'course', icon: '🪵', stat: 'win:logCourse', goal: 1, title: 'Finish the Log Course',
    hint: 'Hop the logs across the river without a splash.', reward: { kind: 'beads', amount: 200 }, passPoints: 80 },
  { id: 'lunch', icon: '🍔', stat: 'play:lunchDelivery', goal: 1, title: 'Help with a Lunch Delivery',
    hint: 'Join the cart at the hub and swat those bugs.', reward: { kind: 'beads', amount: 150 }, passPoints: 80 },
  { id: 'zip', icon: '🪂', stat: 'ride:zipline', goal: 2, title: 'Ride the Zipline twice',
    hint: 'Hike up the climb, then zip down to the beach.', reward: { kind: 'beads', amount: 120 }, passPoints: 60 },
  { id: 'glide', icon: '🪁', stat: 'ride:glider', goal: 1, title: 'Go hang gliding',
    hint: 'Launch from the top of the steep climb.', reward: { kind: 'beads', amount: 120 }, passPoints: 60 },
  { id: 'chat', icon: '💬', stat: 'chat', goal: 5, title: 'Say hi to campers 5 times',
    hint: 'Tap the chat bubble to send a message.', reward: { kind: 'beads', amount: 100 }, passPoints: 60 },
  { id: 'jump', icon: '🦘', stat: 'jump', goal: 60, title: 'Jump 60 times',
    hint: 'Boing boing boing boing…', reward: { kind: 'beads', amount: 100 }, passPoints: 60 },
  { id: 'play3', icon: '🎮', stat: 'play:any', goal: 3, title: 'Play 3 minigames',
    hint: 'Any mix: Dodge Ball, Sumo, the Log Course or Lunch Delivery.', reward: { kind: 'beads', amount: 150 }, passPoints: 80 },
  { id: 'win2', icon: '🏆', stat: 'win:any', goal: 2, title: 'Win 2 minigames',
    hint: 'Any minigame counts. Go get em!', reward: { kind: 'pinecones', amount: 3 }, passPoints: 100 },
  { id: 'care', icon: '🎁', stat: 'care_package', goal: 1, title: 'Open a Care Package',
    hint: 'Counselor Crumbs has them at the Canteen.', reward: { kind: 'beads', amount: 150 }, passPoints: 80 },
];

// ── Leaderboards ─────────────────────────────────────────────────────────────
// No backend: rivals are the camp's own regulars (roster names you see walking
// around) with seeded scores; the weekly board's rivals climb through the week so it
// feels live. The player's row is their real local tally.

export type BoardId = 'stars' | 'sumo' | 'dodgeball';

export interface BoardDef {
  id: BoardId;
  tab: string;
  title: string;
  unit: string;
  /** Resets every Monday (local) when true; otherwise the Camp Pass season's totals. */
  weekly: boolean;
}

export const BOARDS: BoardDef[] = [
  { id: 'stars', tab: 'Camp Stars', title: 'Camp Stars · This Week', unit: '★', weekly: true },
  { id: 'sumo', tab: 'Sumo', title: 'Sumo Wins', unit: 'wins', weekly: false },
  { id: 'dodgeball', tab: 'Dodge Ball', title: 'Dodge Ball Wins', unit: 'wins', weekly: false },
];

/** Camp Stars earned per activity (the weekly board). */
export const STAR_POINTS: Partial<Record<CampStat, number>> = {
  'play:dodgeball': 40, 'win:dodgeball': 160,
  'play:sumo': 40, 'win:sumo': 160,
  'play:logCourse': 20, 'win:logCourse': 140,
  'play:lunchDelivery': 40, 'win:lunchDelivery': 120,
  'ride:zipline': 30, 'ride:glider': 30,
  care_package: 20,
};
/** Bonus stars for claiming the daily challenge. */
export const CHALLENGE_STARS = 250;

/** Rival score range per board ([top, bottom] of the pool, before the weekly ramp). */
export const RIVAL_RANGE: Record<BoardId, [number, number]> = {
  stars: [2400, 180],
  sumo: [64, 3],
  dodgeball: [58, 2],
};
