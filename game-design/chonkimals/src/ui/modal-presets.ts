// Content for tutorial modals — keep copy here (thin code, thick content).
// Add a new minigame's modal by adding a config here (title, pages, media);
// the TutorialModal component stays untouched.

import { UI_ASSETS } from './theme';
import type { TutorialMedia, TutorialModalConfig } from './tutorial-modal';

/** Figma's exact crop of the dodgeball screen recording inside the 875 × 600 frame. */
const DODGEBALL_PREVIEW: TutorialMedia = {
  src: UI_ASSETS.previewDodgeball,
  crop: { width: '109.26%', height: '344.89%', left: '-4.55%', top: '-135.78%' },
};

/** An in-game shot of a mechanic (assets/ui/tutorials/, framed for the 875 × 600 preview). */
const shot = (name: string): TutorialMedia => ({ src: `assets/ui/tutorials/${name}.jpg` });

/** Ready-to-ship: Figma "Modal Instance — Throwing" + "— Dodging and Catching". */
export const DODGEBALL_TUTORIAL: TutorialModalConfig = {
  title: 'Dodge Ball',
  media: shot('dodgeball_throw'),
  pages: [
    {
      title: 'Throwing',
      media: shot('dodgeball_throw'),
      description: 'Run to a ball to pick it up, tap the action button to throw!',
    },
    {
      title: 'Dodging and Catching',
      media: shot('dodgeball_catch'),
      description:
        'Use the joystick to run around and avoid getting hit, or if you’re about to get hit tap the action button to catch it and stay alive!',
    },
  ],
};

/** The blank example from Figma — copy this to start a new minigame's modal. */
export const TEMPLATE_TUTORIAL: TutorialModalConfig = {
  title: 'Overall Title',
  media: DODGEBALL_PREVIEW,
  pages: [
    { title: 'Mechanic', description: 'Explaining the mechanic' },
    { title: 'Mechanic', description: 'Explaining the mechanic' },
  ],
};

/** Log course tutorial — placeholder copy until the Figma pass (no mock yet). */
export const LOG_COURSE_TUTORIAL: TutorialModalConfig = {
  title: 'Log Course',
  media: shot('logcourse_hop'),
  pages: [
    { title: 'Hopping', description: 'Tap to hop from log to log and make it across the river!', media: shot('logcourse_hop') },
    { title: 'Don’t Fall In', description: 'Logs drift and dive under — time your hops and reach the finish line.', media: shot('logcourse_fall') },
  ],
};

/** Lunch Delivery tutorial — placeholder copy until the Figma pass (no mock yet). */
export const LUNCH_DELIVERY_TUTORIAL: TutorialModalConfig = {
  title: 'Lunch Delivery',
  media: shot('lunch_push'),
  pages: [
    {
      title: 'Push the Cart',
      media: shot('lunch_push'),
      description: 'The lunch cart only rolls while someone is near it. Get it from the Camp Hub all the way to the beach picnic!',
    },
    {
      title: 'Squash the Bugs',
      media: shot('lunch_bugs'),
      description: 'Tap ATTACK to swat bugs before they eat the lunch. Grab bug spray and water guns for extra power!',
    },
    {
      title: 'Clear the Path',
      media: shot('lunch_clear'),
      description: 'Stand next to fallen logs, rocks and leaves to clear them — more friends clear it faster. Squash maggots blocking the way!',
    },
  ],
};

/** Sumo tutorial — placeholder copy until the Figma pass (no mock yet). */
export const SUMO_TUTORIAL: TutorialModalConfig = {
  title: 'Sumo',
  media: shot('sumo_launch'),
  pages: [
    {
      title: 'Pull Back & Launch',
      media: shot('sumo_launch'),
      description: 'Drag anywhere to pull back like a slingshot, then let go to charge the opposite way. The arrow shows where you’ll go!',
    },
    {
      title: 'Bump Them Out',
      media: shot('sumo_bump'),
      description: 'Slam into the other chonks to knock them out of the ring. Launch again mid-slide to recover from the edge!',
    },
    {
      title: 'Last Chonk Standing',
      media: shot('sumo_last'),
      description: 'Hits get stronger the longer the match goes. Knocked out? Cheer or taunt from the sidelines!',
    },
  ],
};
