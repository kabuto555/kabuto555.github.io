import {
  GAME_WIDTH, GAME_HEIGHT, COLORS, TEXT_STYLES, createGameConfig,
  TRACK_CENTER_X, TRACK_TOP_Y, FORK_Y, FORK_END_Y,
  LEFT_FORK_X, RIGHT_FORK_X, TRACK_BOTTOM_Y, TRACK_WIDTH,
  TRAIN_SPEED_MS, TRAIN_BRANCH_MS, TRAIN_CONTINUE_MS,
  KARMA_BAR_Y, KARMA_BAR_W, KARMA_BAR_H, KARMA_MIN, KARMA_MAX, KARMA_START,
  TOTAL_ROUNDS, RESULT_DISPLAY_MS,
} from './config';
import { Entity, GamePhase, GameState, Scenario, SwitchDir } from './types';

// ─── Entity Roster ────────────────────────────────────────────────────────────

const ENTITIES: Entity[] = [
  // Very good (+)
  { spriteKey: 'sp_baby',       name: 'Innocent Baby',        karma: 20 },
  { spriteKey: 'sp_child',      name: 'Little Child',         karma: 18 },
  { spriteKey: 'sp_kitten',     name: 'Fluffy Kitten',        karma: 16 },
  { spriteKey: 'sp_dog',        name: 'Good Boy',             karma: 15 },
  { spriteKey: 'sp_doctor',     name: 'Life-Saving Doctor',   karma: 14 },
  { spriteKey: 'sp_scientist',  name: 'Vaccine Scientist',    karma: 13 },
  { spriteKey: 'sp_firefighter',name: 'Brave Firefighter',    karma: 12 },
  { spriteKey: 'sp_teacher',    name: 'Kind Teacher',         karma: 11 },
  { spriteKey: 'sp_elder',      name: 'Wise Elder',           karma: 10 },
  { spriteKey: 'sp_grandma',    name: 'Chef Grandma',         karma: 9  },
  // Mildly good
  { spriteKey: 'sp_artist',     name: 'Street Artist',        karma: 5  },
  { spriteKey: 'sp_joe',        name: 'Average Joe',          karma: 4  },
  { spriteKey: 'sp_dev',        name: 'Overworked Dev',       karma: 3  },
  // Neutral / ambiguous
  { spriteKey: 'sp_politician', name: 'The Politician',       karma: 1  },
  { spriteKey: 'sp_lawyer',     name: 'Lawyer (Shark)',       karma: -1 },
  { spriteKey: 'sp_lobbyist',   name: 'Lobbyist',             karma: -2 },
  // Mildly evil
  { spriteKey: 'sp_bully',      name: 'Town Bully',           karma: -5 },
  { spriteKey: 'sp_clown',      name: 'Creepy Clown',         karma: -7 },
  { spriteKey: 'sp_conartist',  name: 'Con Artist',           karma: -8 },
  { spriteKey: 'sp_villain',    name: 'Small-Time Villain',   karma: -10 },
  // Very evil (-)
  { spriteKey: 'sp_crimelord',  name: 'Crime Lord',           karma: -14 },
  { spriteKey: 'sp_vampire',    name: 'Bloodthirsty Vampire', karma: -13 },
  { spriteKey: 'sp_warlord',    name: 'Warlord',              karma: -16 },
  { spriteKey: 'sp_warcriminal',name: 'War Criminal',         karma: -20 },
  { spriteKey: 'sp_murderer',   name: 'Mass Murderer',        karma: -20 },
  // Morally ambiguous
  { spriteKey: 'sp_soldier',    name: 'Conscripted Soldier',  karma: 0   },
  { spriteKey: 'sp_executioner',name: 'State Executioner',    karma: -3  },
  { spriteKey: 'sp_journalist', name: 'Paparazzi',            karma: -2  },
  { spriteKey: 'sp_influencer', name: 'Influencer',           karma: -1  },
  { spriteKey: 'sp_ceo',        name: 'Tech CEO',             karma: 0   },
  { spriteKey: 'sp_hacker',     name: 'Hacktivist',           karma: 2   },
  { spriteKey: 'sp_bounty',     name: 'Bounty Hunter',        karma: -3  },
  { spriteKey: 'sp_cultleader', name: 'Cult Leader',          karma: -12 },
  { spriteKey: 'sp_taxman',     name: 'Tax Collector',        karma: -4  },
  { spriteKey: 'sp_assassin',   name: 'Assassin for Hire',   karma: -9  },
  // Mythology / religion
  { spriteKey: 'sp_angel',      name: 'Fallen Angel',         karma: 8   },
  { spriteKey: 'sp_demon',      name: 'Minor Demon',          karma: -15 },
  { spriteKey: 'sp_zeus',       name: 'Zeus (Petty God)',     karma: 2   },
  { spriteKey: 'sp_anubis',     name: 'Anubis',               karma: 5   },
  { spriteKey: 'sp_loki',       name: 'Loki',                 karma: -6  },
  { spriteKey: 'sp_valkyrie',   name: 'Valkyrie',             karma: 7   },
  { spriteKey: 'sp_banshee',    name: 'Banshee',              karma: -8  },
  { spriteKey: 'sp_minotaur',   name: 'Minotaur',             karma: -11 },
  // Aliens & sci-fi
  { spriteKey: 'sp_alien',      name: 'Grey Alien',           karma: 0   },
  { spriteKey: 'sp_alien_evil', name: 'Invader Alien',        karma: -18 },
  { spriteKey: 'sp_robot',      name: 'Rogue AI Robot',       karma: -7  },
  { spriteKey: 'sp_android',    name: 'Helpful Android',      karma: 6   },
  { spriteKey: 'sp_astronaut',  name: 'Brave Astronaut',      karma: 11  },
  // Weird / unexpected
  { spriteKey: 'sp_mime',       name: 'Mime Artist',          karma: 1   },
  { spriteKey: 'sp_ghost',      name: 'Restless Ghost',       karma: -3  },
  { spriteKey: 'sp_zombie',     name: 'Zombie',               karma: -6  },
  { spriteKey: 'sp_witch',      name: 'Good Witch',           karma: 6   },
  { spriteKey: 'sp_pirate',     name: 'Pirate Captain',       karma: -5  },
  { spriteKey: 'sp_ninja',      name: 'Ninja (Freelance)',    karma: -2  },
  { spriteKey: 'sp_clown2',     name: 'Birthday Clown',       karma: 4   },
  { spriteKey: 'sp_tourist',    name: 'Oblivious Tourist',    karma: 3   },
  { spriteKey: 'sp_nun',        name: 'Compassionate Nun',    karma: 13  },
  { spriteKey: 'sp_hitman',     name: 'Professional Hitman',  karma: -17 },
];

// ─── Sprite Generation ───────────────────────────────────────────────────────
// All sprites are 80×100 pixel-art-style figures drawn procedurally.
// Each is generated once at scene startup and stored as a Phaser texture.

const SPRITE_W = 80;
const SPRITE_H = 100;

function generateSprites(sc: Phaser.Scene): void {
  // Helper: create a named texture from a draw callback
  function make(key: string, draw: (g: Phaser.GameObjects.Graphics) => void): void {
    if (sc.textures.exists(key)) return;
    const g = sc.make.graphics({}, false);
    draw(g);
    g.generateTexture(key, SPRITE_W, SPRITE_H);
    g.destroy();
  }

  // ── shared body-part helpers ──────────────────────────────────────────────
  function head(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, skin: number): void {
    g.fillStyle(skin, 1); g.fillCircle(x, y, r);
  }
  function body(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    g.fillStyle(color, 1); g.fillRoundedRect(x - w / 2, y, w, h, 4);
  }
  function legs(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
    g.fillStyle(color, 1);
    g.fillRect(x - 14, y, 11, 24);
    g.fillRect(x + 3,  y, 11, 24);
  }
  function arms(g: Phaser.GameObjects.Graphics, x: number, y: number, color: number): void {
    g.fillStyle(color, 1);
    g.fillRect(x - 26, y, 10, 20);
    g.fillRect(x + 16, y, 10, 20);
  }
  // standard humanoid at centre of 80×100
  function human(g: Phaser.GameObjects.Graphics, skin: number, shirt: number, pants: number, hair: number): void {
    const cx = SPRITE_W / 2;
    legs(g, cx, 72, pants);
    body(g, cx, 46, 30, 28, shirt);
    arms(g, cx, 48, shirt);
    head(g, cx, 32, 16, skin);
    // hair
    g.fillStyle(hair, 1); g.fillRect(cx - 14, 16, 28, 9);
  }
  // small animal (cat/dog) at centre
  function animal(g: Phaser.GameObjects.Graphics, bodyColor: number, earColor: number, eyeColor: number): void {
    const cx = SPRITE_W / 2;
    // body
    g.fillStyle(bodyColor, 1); g.fillEllipse(cx, 66, 46, 34);
    // head
    g.fillStyle(bodyColor, 1); g.fillCircle(cx, 42, 20);
    // ears
    g.fillStyle(earColor, 1);
    g.fillTriangle(cx - 18, 32, cx - 8, 18, cx - 4, 32);
    g.fillTriangle(cx + 18, 32, cx + 8, 18, cx + 4, 32);
    // eyes
    g.fillStyle(eyeColor, 1); g.fillCircle(cx - 7, 40, 4); g.fillCircle(cx + 7, 40, 4);
    g.fillStyle(0x000000, 1); g.fillCircle(cx - 7, 40, 2); g.fillCircle(cx + 7, 40, 2);
    // tail
    g.fillStyle(bodyColor, 1); g.fillEllipse(cx + 28, 72, 10, 24);
    // legs
    g.fillRect(cx - 18, 78, 9, 16);
    g.fillRect(cx - 5,  78, 9, 16);
    g.fillRect(cx + 5,  78, 9, 16);
  }

  const SKIN_LIGHT  = 0xffcc99;
  const SKIN_MED    = 0xd48a5a;
  const SKIN_DARK   = 0x8b5e3c;
  const HAIR_BROWN  = 0x5c3a1e;
  const HAIR_GREY   = 0x888888;
  const HAIR_BLACK  = 0x222222;
  const HAIR_BLOND  = 0xf0c040;
  const PANTS_BLUE  = 0x2244aa;
  const PANTS_BLACK = 0x222233;
  const PANTS_GREY  = 0x556677;

  // ── Good entities ─────────────────────────────────────────────────────────
  make('sp_baby', g => {
    const cx = SPRITE_W / 2;
    // onesie
    g.fillStyle(0xffffff, 1); g.fillEllipse(cx, 68, 40, 34);
    g.fillStyle(SKIN_LIGHT, 1); g.fillCircle(cx, 40, 20);
    // rosy cheeks
    g.fillStyle(0xffaaaa, 0.7); g.fillCircle(cx - 8, 44, 5); g.fillCircle(cx + 8, 44, 5);
    // tuft of hair
    g.fillStyle(HAIR_BROWN, 1); g.fillRect(cx - 6, 22, 12, 6);
    // tiny arms
    g.fillStyle(0xffffff, 1); g.fillRect(cx - 22, 55, 9, 14); g.fillRect(cx + 13, 55, 9, 14);
    // halo
    g.lineStyle(3, 0xffd700, 1); g.strokeEllipse(cx, 16, 26, 10);
  });

  make('sp_child', g => {
    human(g, SKIN_LIGHT, 0x4499ff, PANTS_BLUE, HAIR_BROWN);
    // backpack
    g.fillStyle(0xff8800, 1); g.fillRoundedRect(SPRITE_W / 2 + 14, 44, 12, 22, 3);
  });

  make('sp_kitten', g => {
    animal(g, 0xf0c080, 0xffaa44, 0x44cc44);
    // collar
    g.fillStyle(0xff4444, 1); g.fillRect(SPRITE_W / 2 - 10, 56, 20, 5);
  });

  make('sp_dog', g => {
    animal(g, 0xcc8844, 0xaa6622, 0x663300);
    // collar & tag
    g.fillStyle(0x4444ff, 1); g.fillRect(SPRITE_W / 2 - 10, 56, 20, 5);
    g.fillStyle(0xffdd00, 1); g.fillCircle(SPRITE_W / 2, 64, 4);
  });

  make('sp_doctor', g => {
    human(g, SKIN_MED, 0xffffff, PANTS_GREY, HAIR_BLACK);
    // stethoscope
    g.lineStyle(2, 0x888888, 1);
    g.beginPath(); g.moveTo(SPRITE_W / 2 - 8, 52); g.lineTo(SPRITE_W / 2 - 14, 62); g.strokePath();
    // red cross on shirt
    g.fillStyle(0xff2222, 1);
    g.fillRect(SPRITE_W / 2 - 2, 48, 4, 12);
    g.fillRect(SPRITE_W / 2 - 6, 52, 12, 4);
  });

  make('sp_scientist', g => {
    human(g, SKIN_LIGHT, 0xeeeeff, PANTS_GREY, HAIR_BLOND);
    // lab coat lapels
    g.fillStyle(0xccccff, 1); g.fillRect(SPRITE_W / 2 - 15, 46, 8, 18);
    // flask
    g.fillStyle(0x44ffcc, 1); g.fillEllipse(SPRITE_W / 2 + 20, 54, 10, 14);
    g.fillStyle(0xaaaaaa, 1); g.fillRect(SPRITE_W / 2 + 18, 46, 6, 6);
  });

  make('sp_firefighter', g => {
    human(g, SKIN_LIGHT, 0xdd4400, PANTS_BLACK, HAIR_BLACK);
    // helmet
    g.fillStyle(0xdd4400, 1); g.fillEllipse(SPRITE_W / 2, 20, 36, 16);
    g.fillStyle(0xffcc00, 1); g.fillRect(SPRITE_W / 2 - 18, 25, 36, 5);
  });

  make('sp_teacher', g => {
    human(g, SKIN_MED, 0x336699, PANTS_BLUE, HAIR_BROWN);
    // glasses
    g.lineStyle(2, 0x333333, 1);
    g.strokeCircle(SPRITE_W / 2 - 7, 32, 5); g.strokeCircle(SPRITE_W / 2 + 7, 32, 5);
    g.lineBetween(SPRITE_W / 2 - 2, 32, SPRITE_W / 2 + 2, 32);
  });

  make('sp_elder', g => {
    human(g, SKIN_LIGHT, 0x8899aa, PANTS_GREY, HAIR_GREY);
    // walking cane
    g.lineStyle(3, 0x775533, 1);
    g.lineBetween(SPRITE_W / 2 + 16, 48, SPRITE_W / 2 + 20, 96);
    g.strokeCircle(SPRITE_W / 2 + 16, 47, 4);
    // wrinkles (two lines on face)
    g.lineStyle(1, HAIR_GREY, 0.7);
    g.lineBetween(SPRITE_W / 2 - 8, 34, SPRITE_W / 2 - 4, 36);
    g.lineBetween(SPRITE_W / 2 + 4, 34, SPRITE_W / 2 + 8, 36);
  });

  make('sp_grandma', g => {
    human(g, SKIN_LIGHT, 0xdd88bb, PANTS_GREY, HAIR_GREY);
    // apron
    g.fillStyle(0xffffff, 0.6); g.fillRect(SPRITE_W / 2 - 12, 48, 24, 24);
    // spoon
    g.lineStyle(3, 0xaaaaaa, 1); g.lineBetween(SPRITE_W / 2 + 18, 46, SPRITE_W / 2 + 22, 64);
    g.fillStyle(0xaaaaaa, 1); g.fillCircle(SPRITE_W / 2 + 19, 44, 5);
  });

  make('sp_artist', g => {
    human(g, SKIN_MED, 0x552288, PANTS_BLACK, HAIR_BLACK);
    // beret
    g.fillStyle(0x993333, 1); g.fillEllipse(SPRITE_W / 2, 18, 32, 12);
    // palette
    g.fillStyle(0xf5deb3, 1); g.fillEllipse(SPRITE_W / 2 + 20, 52, 14, 10);
    g.fillStyle(0xff4444, 1); g.fillCircle(SPRITE_W / 2 + 16, 50, 3);
    g.fillStyle(0x4444ff, 1); g.fillCircle(SPRITE_W / 2 + 22, 48, 3);
    g.fillStyle(0xffff00, 1); g.fillCircle(SPRITE_W / 2 + 25, 54, 3);
  });

  make('sp_joe', g => { human(g, SKIN_LIGHT, 0x558844, PANTS_BLUE, HAIR_BROWN); });
  make('sp_dev',  g => {
    human(g, SKIN_LIGHT, 0x333344, PANTS_BLACK, HAIR_BLACK);
    // laptop
    g.fillStyle(0x222222, 1); g.fillRect(SPRITE_W / 2 - 14, 58, 28, 16);
    g.fillStyle(0x4466aa, 1); g.fillRect(SPRITE_W / 2 - 12, 60, 24, 12);
  });

  // ── Neutral entities ──────────────────────────────────────────────────────
  make('sp_politician', g => {
    human(g, SKIN_LIGHT, 0x223388, PANTS_BLACK, HAIR_BLACK);
    // tie
    g.fillStyle(0xff2222, 1);
    g.fillTriangle(SPRITE_W / 2, 46, SPRITE_W / 2 - 4, 52, SPRITE_W / 2 + 4, 52);
    g.fillRect(SPRITE_W / 2 - 3, 52, 6, 14);
    // flag pin
    g.fillStyle(0xffcc00, 1); g.fillCircle(SPRITE_W / 2 - 10, 47, 3);
  });

  make('sp_lawyer', g => {
    human(g, SKIN_MED, 0x222222, PANTS_BLACK, HAIR_BLACK);
    // briefcase
    g.fillStyle(0x8b6914, 1); g.fillRoundedRect(SPRITE_W / 2 + 14, 56, 16, 14, 2);
    g.fillStyle(0x6b4a10, 1); g.fillRect(SPRITE_W / 2 + 19, 53, 6, 5);
    // monocle
    g.lineStyle(2, 0xccaa44, 1); g.strokeCircle(SPRITE_W / 2 + 7, 31, 6);
  });

  make('sp_lobbyist', g => {
    human(g, SKIN_LIGHT, 0x445566, PANTS_BLACK, HAIR_GREY);
    // money bag
    g.fillStyle(0x88aa44, 1); g.fillCircle(SPRITE_W / 2 + 20, 58, 9);
    g.fillStyle(0x556622, 1); g.fillRect(SPRITE_W / 2 + 17, 50, 6, 6);
    g.fillStyle(0xffffff, 1);
    g.fillRect(SPRITE_W / 2 + 17, 56, 6, 2);
    g.fillRect(SPRITE_W / 2 + 19, 54, 2, 6);
  });

  // ── Evil entities ─────────────────────────────────────────────────────────
  make('sp_bully', g => {
    human(g, SKIN_LIGHT, 0xaa2200, PANTS_BLUE, HAIR_BLACK);
    // black eye
    g.fillStyle(0x440000, 1); g.fillEllipse(SPRITE_W / 2 - 7, 32, 10, 7);
    // scowl
    g.lineStyle(2, 0x333333, 1);
    g.beginPath(); g.moveTo(SPRITE_W / 2 - 6, 39); g.lineTo(SPRITE_W / 2 + 6, 39); g.strokePath();
  });

  make('sp_clown', g => {
    human(g, 0xffffff, 0xff4400, PANTS_BLUE, 0xcc2200);
    // clown nose
    g.fillStyle(0xff0000, 1); g.fillCircle(SPRITE_W / 2, 35, 6);
    // wig puffs
    g.fillStyle(0xffaa00, 1); g.fillCircle(SPRITE_W / 2 - 20, 24, 11); g.fillCircle(SPRITE_W / 2 + 20, 24, 11);
    // creepy grin
    g.lineStyle(2, 0x000000, 1);
    g.beginPath(); g.moveTo(SPRITE_W / 2 - 8, 40); g.lineTo(SPRITE_W / 2, 45); g.lineTo(SPRITE_W / 2 + 8, 40); g.strokePath();
  });

  make('sp_conartist', g => {
    human(g, SKIN_DARK, 0x334400, PANTS_BLACK, HAIR_BLACK);
    // fedora
    g.fillStyle(0x222200, 1); g.fillRect(SPRITE_W / 2 - 18, 18, 36, 6);
    g.fillEllipse(SPRITE_W / 2, 16, 28, 10);
    // shifty eyes (side-glance)
    g.fillStyle(0xffffff, 1); g.fillCircle(SPRITE_W / 2 - 7, 31, 5); g.fillCircle(SPRITE_W / 2 + 7, 31, 5);
    g.fillStyle(0x000000, 1); g.fillCircle(SPRITE_W / 2 - 5, 31, 3); g.fillCircle(SPRITE_W / 2 + 9, 31, 3);
  });

  make('sp_villain', g => {
    human(g, SKIN_DARK, 0x220022, PANTS_BLACK, HAIR_BLACK);
    // cape
    g.fillStyle(0x330033, 1);
    g.fillTriangle(SPRITE_W / 2 - 15, 46, SPRITE_W / 2 + 15, 46, SPRITE_W / 2 - 20, 82);
    g.fillTriangle(SPRITE_W / 2 - 15, 46, SPRITE_W / 2 + 15, 46, SPRITE_W / 2 + 20, 82);
    // evil grin
    g.lineStyle(2, 0xaa0000, 1);
    g.beginPath(); g.moveTo(SPRITE_W / 2 - 7, 38); g.lineTo(SPRITE_W / 2 + 7, 38); g.strokePath();
  });

  make('sp_crimelord', g => {
    human(g, SKIN_DARK, 0x111111, PANTS_BLACK, HAIR_BLACK);
    // cigar
    g.fillStyle(0xeecc88, 1); g.fillRect(SPRITE_W / 2 + 10, 35, 14, 4);
    g.fillStyle(0xff6600, 1); g.fillCircle(SPRITE_W / 2 + 24, 37, 3);
    // scar
    g.lineStyle(2, 0xaa2222, 1); g.lineBetween(SPRITE_W / 2 - 4, 28, SPRITE_W / 2 + 2, 38);
    // gold chain
    g.lineStyle(3, 0xddaa00, 1); g.strokeCircle(SPRITE_W / 2, 52, 8);
  });

  make('sp_vampire', g => {
    human(g, 0xddddff, 0x111122, PANTS_BLACK, HAIR_BLACK);
    // widow's peak
    g.fillStyle(HAIR_BLACK, 1); g.fillTriangle(SPRITE_W / 2, 20, SPRITE_W / 2 - 14, 14, SPRITE_W / 2 + 14, 14);
    // fangs
    g.fillStyle(0xffffff, 1); g.fillTriangle(SPRITE_W / 2 - 4, 40, SPRITE_W / 2 - 2, 40, SPRITE_W / 2 - 3, 46);
    g.fillTriangle(SPRITE_W / 2 + 2, 40, SPRITE_W / 2 + 4, 40, SPRITE_W / 2 + 3, 46);
    // blood drip
    g.fillStyle(0xcc0000, 1); g.fillCircle(SPRITE_W / 2, 44, 3);
    // red eyes
    g.fillStyle(0xff0000, 1); g.fillCircle(SPRITE_W / 2 - 7, 30, 4); g.fillCircle(SPRITE_W / 2 + 7, 30, 4);
  });

  make('sp_warlord', g => {
    human(g, SKIN_DARK, 0x443300, PANTS_BLACK, HAIR_BLACK);
    // helmet
    g.fillStyle(0x556655, 1); g.fillEllipse(SPRITE_W / 2, 20, 36, 20);
    g.fillStyle(0x445544, 1); g.fillRect(SPRITE_W / 2 - 4, 14, 8, 10);
    // sword
    g.lineStyle(3, 0xaaaaaa, 1); g.lineBetween(SPRITE_W / 2 + 16, 32, SPRITE_W / 2 + 28, 72);
    g.fillStyle(0x888844, 1); g.fillRect(SPRITE_W / 2 + 10, 50, 18, 4);
  });

  make('sp_warcriminal', g => {
    human(g, SKIN_LIGHT, 0x556644, PANTS_BLACK, HAIR_BLACK);
    // military cap
    g.fillStyle(0x445533, 1); g.fillRect(SPRITE_W / 2 - 18, 17, 36, 8);
    g.fillEllipse(SPRITE_W / 2, 16, 30, 10);
    // skull badge
    g.fillStyle(0xffffff, 1); g.fillCircle(SPRITE_W / 2 - 10, 50, 5);
    g.fillStyle(0x333333, 1); g.fillCircle(SPRITE_W / 2 - 12, 49, 2); g.fillCircle(SPRITE_W / 2 - 8, 49, 2);
    // biohazard stripe on arm
    g.fillStyle(0xffcc00, 1); g.fillRect(SPRITE_W / 2 - 28, 50, 10, 4);
  });

  make('sp_murderer', g => {
    // skull-faced figure
    human(g, 0xdddddd, 0x111111, PANTS_BLACK, HAIR_BLACK);
    // hollow eye sockets
    g.fillStyle(0x000000, 1); g.fillCircle(SPRITE_W / 2 - 7, 30, 5); g.fillCircle(SPRITE_W / 2 + 7, 30, 5);
    g.fillStyle(0xff0000, 0.6); g.fillCircle(SPRITE_W / 2 - 7, 30, 3); g.fillCircle(SPRITE_W / 2 + 7, 30, 3);
    // teeth grin
    g.fillStyle(0xffffff, 1); g.fillRect(SPRITE_W / 2 - 8, 38, 16, 5);
    g.fillStyle(0x000000, 1);
    for (let i = 0; i < 3; i++) g.fillRect(SPRITE_W / 2 - 6 + i * 5, 38, 2, 5);
    // bloody hands
    g.fillStyle(0xcc0000, 1); g.fillCircle(SPRITE_W / 2 - 22, 66, 6); g.fillCircle(SPRITE_W / 2 + 22, 66, 6);
  });

  // ── Morally ambiguous ────────────────────────────────────────────────
  make('sp_soldier', g => {
    human(g, SKIN_MED, 0x556644, PANTS_BLACK, HAIR_BLACK);
    g.fillStyle(0x445533, 1); g.fillRect(SPRITE_W/2-18, 17, 36, 8); g.fillEllipse(SPRITE_W/2, 16, 30, 10);
    // rifle
    g.fillStyle(0x444444, 1); g.fillRect(SPRITE_W/2+16, 42, 6, 28);
    // question-mark badge (ambiguity)
    g.fillStyle(0xffcc00, 1); g.fillCircle(SPRITE_W/2-10, 50, 6);
    g.fillStyle(0x333300, 1); g.fillRect(SPRITE_W/2-12, 47, 4, 5); g.fillCircle(SPRITE_W/2-10, 55, 2);
  });
  make('sp_executioner', g => {
    human(g, SKIN_DARK, 0x111111, PANTS_BLACK, HAIR_BLACK);
    // black hood
    g.fillStyle(0x111111, 1); g.fillEllipse(SPRITE_W/2, 26, 36, 28);
    // eye slits
    g.fillStyle(0xff3300, 0.7); g.fillRect(SPRITE_W/2-10, 24, 8, 4); g.fillRect(SPRITE_W/2+2, 24, 8, 4);
    // axe
    g.fillStyle(0x888888, 1); g.fillRect(SPRITE_W/2+14, 38, 4, 24);
    g.fillTriangle(SPRITE_W/2+18, 38, SPRITE_W/2+28, 44, SPRITE_W/2+18, 52);
  });
  make('sp_journalist', g => {
    human(g, SKIN_LIGHT, 0xdddd44, PANTS_GREY, HAIR_BLACK);
    // camera
    g.fillStyle(0x222222, 1); g.fillRect(SPRITE_W/2-28, 50, 18, 12);
    g.fillStyle(0x4488ff, 0.8); g.fillCircle(SPRITE_W/2-19, 56, 5);
    g.fillStyle(0x888888, 1); g.fillRect(SPRITE_W/2-26, 46, 6, 4);
    // notepad
    g.fillStyle(0xffffff, 1); g.fillRect(SPRITE_W/2+14, 52, 12, 16);
    g.fillStyle(0x888888, 1); g.fillRect(SPRITE_W/2+16, 55, 8, 2); g.fillRect(SPRITE_W/2+16, 59, 8, 2);
  });
  make('sp_influencer', g => {
    human(g, SKIN_LIGHT, 0xff66aa, PANTS_BLACK, HAIR_BLOND);
    // selfie phone
    g.fillStyle(0x222222, 1); g.fillRoundedRect(SPRITE_W/2+14, 44, 10, 18, 2);
    g.fillStyle(0x66ccff, 1); g.fillRect(SPRITE_W/2+15, 46, 8, 12);
    // sparkles
    g.fillStyle(0xffdd00, 1);
    g.fillCircle(SPRITE_W/2-24, 22, 3); g.fillCircle(SPRITE_W/2+22, 18, 4);
    g.fillCircle(SPRITE_W/2-20, 14, 2);
  });
  make('sp_ceo', g => {
    human(g, SKIN_LIGHT, 0x224466, PANTS_BLACK, HAIR_BLACK);
    // power tie
    g.fillStyle(0xff2200, 1);
    g.fillTriangle(SPRITE_W/2, 46, SPRITE_W/2-4, 54, SPRITE_W/2+4, 54);
    g.fillRect(SPRITE_W/2-3, 54, 6, 14);
    // money symbol
    g.fillStyle(0x44aa44, 1); g.fillCircle(SPRITE_W/2-24, 54, 7);
    g.fillStyle(0xffffff, 1); g.fillRect(SPRITE_W/2-25, 50, 2, 8); g.fillRect(SPRITE_W/2-21, 52, 2, 8);
  });
  make('sp_hacker', g => {
    human(g, SKIN_LIGHT, 0x113311, PANTS_BLACK, HAIR_BLACK);
    // glowing laptop
    g.fillStyle(0x002200, 1); g.fillRect(SPRITE_W/2-26, 56, 22, 14);
    g.fillStyle(0x00ff44, 0.85); g.fillRect(SPRITE_W/2-24, 58, 18, 10);
    g.fillStyle(0x00ff00, 1); g.fillRect(SPRITE_W/2-22, 60, 6, 2); g.fillRect(SPRITE_W/2-22, 63, 10, 2);
    // hoodie
    g.fillStyle(0x1a1a1a, 0.7); g.fillEllipse(SPRITE_W/2, 22, 34, 18);
  });
  make('sp_bounty', g => {
    human(g, SKIN_MED, 0x664422, PANTS_BLACK, HAIR_BROWN);
    // cowboy hat
    g.fillStyle(0x443311, 1); g.fillRect(SPRITE_W/2-22, 14, 44, 8);
    g.fillEllipse(SPRITE_W/2, 13, 30, 12);
    // lasso
    g.lineStyle(3, 0xcc8844, 1); g.strokeCircle(SPRITE_W/2+20, 52, 8);
    // pistol
    g.fillStyle(0x555555, 1); g.fillRect(SPRITE_W/2-28, 52, 14, 6);
    g.fillRect(SPRITE_W/2-22, 58, 5, 8);
  });
  make('sp_cultleader', g => {
    human(g, SKIN_LIGHT, 0xffffff, 0xaaaacc, HAIR_BLACK);
    // long white robe extra
    g.fillStyle(0xffffff, 0.6); g.fillRect(SPRITE_W/2-16, 74, 32, 24);
    // glowing eyes
    g.fillStyle(0xff4400, 1); g.fillCircle(SPRITE_W/2-6, 30, 5); g.fillCircle(SPRITE_W/2+6, 30, 5);
    // aura
    g.lineStyle(2, 0xff8800, 0.6); g.strokeCircle(SPRITE_W/2, 32, 22);
  });
  make('sp_taxman', g => {
    human(g, SKIN_LIGHT, 0x334455, PANTS_GREY, HAIR_GREY);
    // briefcase
    g.fillStyle(0x8b6914, 1); g.fillRoundedRect(SPRITE_W/2+14, 56, 16, 14, 2);
    g.fillStyle(0x6b4a10, 1); g.fillRect(SPRITE_W/2+19, 53, 6, 5);
    // dollar sign stamp
    g.fillStyle(0xff2222, 1); g.fillCircle(SPRITE_W/2-10, 50, 7);
    g.fillStyle(0xffffff, 1); g.fillRect(SPRITE_W/2-11, 46, 2, 8); g.fillRect(SPRITE_W/2-9, 48, 2, 8);
  });
  make('sp_assassin', g => {
    human(g, SKIN_DARK, 0x111111, PANTS_BLACK, HAIR_BLACK);
    // all-black mask
    g.fillStyle(0x111111, 1); g.fillEllipse(SPRITE_W/2, 28, 28, 22);
    // glowing red eyes
    g.fillStyle(0xff0000, 1); g.fillCircle(SPRITE_W/2-6, 27, 3); g.fillCircle(SPRITE_W/2+6, 27, 3);
    // daggers
    g.fillStyle(0xcccccc, 1);
    g.fillTriangle(SPRITE_W/2-24, 48, SPRITE_W/2-20, 48, SPRITE_W/2-22, 62);
    g.fillTriangle(SPRITE_W/2+20, 48, SPRITE_W/2+24, 48, SPRITE_W/2+22, 62);
  });

  // -- Mythology / religion
  make('sp_angel', g => {
    human(g, 0xffe8cc, 0xffffff, 0xeeeeff, HAIR_BLOND);
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(SPRITE_W/2-28, 52, 24, 40);
    g.fillEllipse(SPRITE_W/2+28, 52, 24, 40);
    g.lineStyle(3, 0xffdd00, 1); g.strokeEllipse(SPRITE_W/2, 14, 26, 10);
    g.fillStyle(0x333333, 0.4);
    g.fillTriangle(SPRITE_W/2-32, 48, SPRITE_W/2-20, 52, SPRITE_W/2-28, 62);
  });
  make('sp_demon', g => {
    human(g, 0xcc2200, 0x440000, PANTS_BLACK, 0x220000);
    g.fillStyle(0x880000, 1);
    g.fillTriangle(SPRITE_W/2-12, 18, SPRITE_W/2-6, 8, SPRITE_W/2-4, 18);
    g.fillTriangle(SPRITE_W/2+12, 18, SPRITE_W/2+6, 8, SPRITE_W/2+4, 18);
    g.fillStyle(0xff8800, 1); g.fillCircle(SPRITE_W/2-6, 30, 5); g.fillCircle(SPRITE_W/2+6, 30, 5);
    g.fillStyle(0x000000, 1); g.fillCircle(SPRITE_W/2-6, 30, 2); g.fillCircle(SPRITE_W/2+6, 30, 2);
    g.lineStyle(3, 0xaa1100, 1);
    g.beginPath(); g.moveTo(SPRITE_W/2, 84); g.lineTo(SPRITE_W/2+18, 94); g.lineTo(SPRITE_W/2+22, 88); g.strokePath();
  });
  make('sp_zeus', g => {
    human(g, SKIN_LIGHT, 0xffffff, 0xaaaaff, HAIR_GREY);
    g.fillStyle(0xdddddd, 1); g.fillEllipse(SPRITE_W/2, 44, 22, 18);
    g.fillStyle(0xffdd00, 1);
    g.fillTriangle(SPRITE_W/2+14, 42, SPRITE_W/2+22, 54, SPRITE_W/2+16, 54);
    g.fillTriangle(SPRITE_W/2+16, 54, SPRITE_W/2+24, 66, SPRITE_W/2+10, 58);
    g.fillStyle(0xffcc00, 1); g.fillRect(SPRITE_W/2-14, 14, 28, 8);
    for (let i=0;i<3;i++) g.fillTriangle(SPRITE_W/2-12+i*12, 14, SPRITE_W/2-6+i*12, 6, SPRITE_W/2+i*12, 14);
  });
  make('sp_anubis', g => {
    const cx = SPRITE_W/2;
    human(g, 0x1a1a2e, 0x000000, PANTS_BLACK, 0x000000);
    g.fillStyle(0x111122, 1); g.fillEllipse(cx, 26, 22, 28);
    g.fillTriangle(cx-10, 16, cx-16, 4, cx-4, 12);
    g.fillTriangle(cx+10, 16, cx+16, 4, cx+4, 12);
    g.lineStyle(4, 0xffcc00, 1); g.strokeEllipse(cx, 50, 28, 12);
    g.fillStyle(0xffcc00, 1); g.fillRect(cx+18, 42, 4, 30);
    g.lineStyle(2, 0xffcc00, 1); g.strokeCircle(cx+20, 42, 5);
  });
  make('sp_loki', g => {
    human(g, SKIN_LIGHT, 0x226622, PANTS_BLACK, HAIR_BLACK);
    g.fillStyle(0x888866, 1); g.fillEllipse(SPRITE_W/2, 18, 32, 14);
    g.fillTriangle(SPRITE_W/2-16, 14, SPRITE_W/2-20, 4, SPRITE_W/2-8, 12);
    g.fillTriangle(SPRITE_W/2+16, 14, SPRITE_W/2+20, 4, SPRITE_W/2+8, 12);
    g.lineStyle(2, 0x333333, 1);
    g.beginPath(); g.moveTo(SPRITE_W/2-7, 38); g.lineTo(SPRITE_W/2-2, 42); g.lineTo(SPRITE_W/2+7, 36); g.strokePath();
    g.lineStyle(2, 0x228822, 1); g.strokeCircle(SPRITE_W/2-22, 54, 5);
  });
  make('sp_valkyrie', g => {
    human(g, SKIN_LIGHT, 0x8899cc, 0x556699, HAIR_BLOND);
    g.fillStyle(0xaabb99, 1); g.fillEllipse(SPRITE_W/2, 18, 32, 14);
    g.fillStyle(0xffffff, 0.8);
    g.fillEllipse(SPRITE_W/2-22, 16, 12, 24); g.fillEllipse(SPRITE_W/2+22, 16, 12, 24);
    g.fillStyle(0x888888, 1); g.fillRect(SPRITE_W/2+16, 34, 4, 36);
    g.fillTriangle(SPRITE_W/2+14, 34, SPRITE_W/2+22, 34, SPRITE_W/2+18, 24);
  });
  make('sp_banshee', g => {
    human(g, 0xccddff, 0xaabbdd, 0xddeeff, HAIR_GREY);
    g.fillStyle(0xaabbee, 0.5); g.fillEllipse(SPRITE_W/2, 88, 36, 28);
    g.fillStyle(0x000033, 1); g.fillEllipse(SPRITE_W/2, 38, 12, 16);
    g.lineStyle(2, HAIR_GREY, 0.8);
    for (let i=0;i<5;i++) g.lineBetween(SPRITE_W/2-16+i*8, 18, SPRITE_W/2-16+i*8+(i-2)*6, 4);
  });
  make('sp_minotaur', g => {
    human(g, SKIN_DARK, 0x442200, PANTS_BLACK, 0x332200);
    g.fillStyle(0x5c3a1e, 1); g.fillEllipse(SPRITE_W/2, 24, 32, 28);
    g.fillTriangle(SPRITE_W/2-14, 14, SPRITE_W/2-22, 4, SPRITE_W/2-6, 10);
    g.fillTriangle(SPRITE_W/2+14, 14, SPRITE_W/2+22, 4, SPRITE_W/2+6, 10);
    g.lineStyle(3, 0xddaa44, 1); g.strokeCircle(SPRITE_W/2, 34, 5);
    g.fillStyle(0x5c3a1e, 1);
    g.fillRect(SPRITE_W/2-32, 46, 14, 22); g.fillRect(SPRITE_W/2+18, 46, 14, 22);
  });

  // -- Aliens & sci-fi
  make('sp_alien', g => {
    const cx = SPRITE_W/2;
    g.fillStyle(0x99bbaa, 1); g.fillEllipse(cx, 70, 36, 48);
    g.fillStyle(0xaaccbb, 1); g.fillEllipse(cx, 32, 44, 40);
    g.fillStyle(0x000000, 1); g.fillEllipse(cx-10, 30, 14, 18); g.fillEllipse(cx+10, 30, 14, 18);
    g.lineStyle(1, 0x557766, 1); g.lineBetween(cx-5, 44, cx+5, 44);
    g.fillStyle(0x99bbaa, 1); g.fillRect(cx-28, 58, 8, 22); g.fillRect(cx+20, 58, 8, 22);
  });
  make('sp_alien_evil', g => {
    const cx = SPRITE_W/2;
    g.fillStyle(0x335522, 1); g.fillEllipse(cx, 68, 40, 52);
    g.fillStyle(0x224411, 1); g.fillEllipse(cx, 32, 38, 34);
    g.fillStyle(0xff6600, 1); g.fillEllipse(cx-9, 28, 12, 8); g.fillEllipse(cx+9, 28, 12, 8);
    g.fillStyle(0x000000, 1); g.fillRect(cx-10, 26, 2, 8); g.fillRect(cx+8, 26, 2, 8);
    g.fillStyle(0x224411, 1);
    g.fillRect(cx-30, 56, 10, 20); g.fillTriangle(cx-30, 76, cx-24, 76, cx-27, 84); g.fillTriangle(cx-26, 76, cx-20, 76, cx-23, 84);
    g.fillRect(cx+20, 56, 10, 20); g.fillTriangle(cx+20, 76, cx+26, 76, cx+23, 84); g.fillTriangle(cx+24, 76, cx+30, 76, cx+27, 84);
  });
  make('sp_robot', g => {
    const cx = SPRITE_W/2;
    g.fillStyle(0x556677, 1); g.fillRect(cx-18, 46, 36, 40);
    g.fillStyle(0x667788, 1); g.fillRect(cx-16, 14, 32, 28);
    g.fillStyle(0xff2200, 1); g.fillRect(cx-12, 22, 24, 8);
    g.fillStyle(0x334455, 1); g.fillRect(cx-10, 34, 20, 6);
    g.fillStyle(0x44ff44, 1); for (let i=0;i<4;i++) g.fillRect(cx-9+i*6, 35, 3, 4);
    g.fillStyle(0x888888, 1); g.fillRect(cx-1, 6, 3, 10);
    g.fillStyle(0xff4400, 1); g.fillCircle(cx, 6, 4);
    g.fillStyle(0x445566, 1); g.fillRect(cx-14, 86, 10, 14); g.fillRect(cx+4, 86, 10, 14);
  });
  make('sp_android', g => {
    const cx = SPRITE_W/2;
    human(g, 0xddeeff, 0x4488cc, PANTS_BLUE, 0x224466);
    g.fillStyle(0x00ffcc, 0.9); g.fillRect(cx-8, 50, 16, 10);
    g.fillStyle(0xffffff, 0.5); g.fillRect(cx-6, 52, 4, 6);
    g.lineStyle(1, 0x00ffcc, 0.6);
    g.lineBetween(cx-8, 26, cx-14, 20); g.lineBetween(cx+8, 26, cx+14, 20);
    g.fillStyle(0x0099ff, 0.4); g.fillRect(cx-12, 26, 24, 8);
  });
  make('sp_astronaut', g => {
    const cx = SPRITE_W/2;
    g.fillStyle(0xffffff, 1); g.fillEllipse(cx, 68, 44, 50);
    g.fillStyle(0xddeeff, 1); g.fillCircle(cx, 28, 22);
    g.fillStyle(0x000000, 1); g.fillCircle(cx, 28, 19);
    g.fillStyle(SKIN_LIGHT, 1); g.fillCircle(cx, 28, 13);
    g.fillStyle(0x4488ff, 0.35); g.fillRect(cx-13, 20, 26, 14);
    g.fillStyle(0xff2200, 1); g.fillRect(cx-24, 56, 14, 9);
    g.fillStyle(0xffffff, 1); g.fillRect(cx-24, 58, 14, 3);
    g.fillStyle(0x2244cc, 1); g.fillRect(cx-24, 62, 14, 3);
  });

  // -- Weird
  make('sp_mime', g => {
    human(g, 0xffffff, 0x000000, PANTS_BLACK, HAIR_BLACK);
    g.fillStyle(0xffffff, 1); g.fillCircle(SPRITE_W/2, 30, 16);
    g.fillStyle(0x000000, 1); g.fillEllipse(SPRITE_W/2-6, 28, 8, 10); g.fillEllipse(SPRITE_W/2+6, 28, 8, 10);
    g.fillStyle(0xff2244, 1); g.fillEllipse(SPRITE_W/2, 38, 12, 8);
    g.fillStyle(0x111111, 1); g.fillEllipse(SPRITE_W/2-2, 16, 28, 10);
  });
  make('sp_ghost', g => {
    const cx = SPRITE_W/2;
    g.fillStyle(0xeeeeff, 0.85); g.fillEllipse(cx, 58, 44, 60);
    for (let i=0;i<4;i++) g.fillTriangle(cx-20+i*12, 82, cx-14+i*12, 96, cx-8+i*12, 82);
    g.fillStyle(0x000033, 1); g.fillEllipse(cx-10, 50, 12, 14); g.fillEllipse(cx+10, 50, 12, 14);
    g.fillStyle(0x3333ff, 0.5); g.fillEllipse(cx-10, 50, 6, 8); g.fillEllipse(cx+10, 50, 6, 8);
    g.fillStyle(0x000033, 1); g.fillEllipse(cx, 64, 10, 8);
  });
  make('sp_zombie', g => {
    human(g, 0x88aa77, 0x334422, PANTS_GREY, 0x445533);
    g.fillStyle(0x557755, 0.7); g.fillEllipse(SPRITE_W/2+8, 28, 12, 10);
    g.fillStyle(0xffffff, 1); g.fillCircle(SPRITE_W/2-6, 30, 5); g.fillCircle(SPRITE_W/2+6, 30, 5);
    g.fillStyle(0x889977, 1); g.fillCircle(SPRITE_W/2-6, 30, 2); g.fillCircle(SPRITE_W/2+6, 30, 2);
    g.fillStyle(0x88aa77, 1); g.fillRect(SPRITE_W/2-30, 44, 12, 8);
  });
  make('sp_witch', g => {
    human(g, SKIN_MED, 0x442266, PANTS_BLACK, HAIR_BLACK);
    g.fillStyle(0x220044, 1);
    g.fillTriangle(SPRITE_W/2, 4, SPRITE_W/2-18, 20, SPRITE_W/2+18, 20);
    g.fillRect(SPRITE_W/2-22, 18, 44, 6);
    g.fillStyle(0xffdd00, 1); g.fillCircle(SPRITE_W/2, 10, 4);
    g.fillStyle(0x884422, 1); g.fillRect(SPRITE_W/2+12, 48, 4, 30);
    g.fillStyle(0xcc8844, 1); g.fillTriangle(SPRITE_W/2+8, 78, SPRITE_W/2+20, 78, SPRITE_W/2+16, 92);
  });
  make('sp_pirate', g => {
    human(g, SKIN_MED, 0x222222, PANTS_BLACK, HAIR_BLACK);
    g.fillStyle(0x111111, 1);
    g.fillRect(SPRITE_W/2-20, 14, 40, 8);
    g.fillEllipse(SPRITE_W/2, 12, 28, 10);
    g.fillStyle(0xffffff, 1); g.fillCircle(SPRITE_W/2, 10, 5);
    g.fillStyle(0x000000, 1); g.fillRect(SPRITE_W/2-3, 7, 2, 6); g.fillRect(SPRITE_W/2+1, 7, 2, 6);
    g.fillStyle(0x000000, 1); g.fillRect(SPRITE_W/2+2, 26, 10, 7);
    g.lineStyle(1, 0x444444, 1); g.lineBetween(SPRITE_W/2+7, 22, SPRITE_W/2+7, 26);
    g.fillStyle(0xaaaaaa, 1);
    g.fillRect(SPRITE_W/2-26, 52, 14, 4);
    g.fillTriangle(SPRITE_W/2-26, 50, SPRITE_W/2-26, 56, SPRITE_W/2-36, 53);
  });
  make('sp_ninja', g => {
    human(g, SKIN_DARK, 0x111111, PANTS_BLACK, HAIR_BLACK);
    g.fillStyle(0x111111, 1); g.fillRect(SPRITE_W/2-14, 26, 28, 12);
    g.fillStyle(0xff4400, 0.8); g.fillRect(SPRITE_W/2-10, 28, 8, 4); g.fillRect(SPRITE_W/2+2, 28, 8, 4);
    g.fillStyle(0x999999, 1);
    const nx = SPRITE_W/2+22, ny = 52;
    for (let i=0;i<4;i++) {
      const ra = i*Math.PI/2;
      g.fillTriangle(nx, ny, nx+Math.cos(ra)*10, ny+Math.sin(ra)*10, nx+Math.cos(ra+0.4)*8, ny+Math.sin(ra+0.4)*8);
    }
  });
  make('sp_clown2', g => {
    human(g, SKIN_LIGHT, 0xff8800, 0x2244cc, HAIR_BLOND);
    g.fillStyle(0xff2200, 1); g.fillCircle(SPRITE_W/2-14, 18, 10);
    g.fillStyle(0xffcc00, 1); g.fillCircle(SPRITE_W/2, 14, 10);
    g.fillStyle(0x2244cc, 1); g.fillCircle(SPRITE_W/2+14, 18, 10);
    g.fillStyle(0xff0000, 1); g.fillCircle(SPRITE_W/2, 34, 5);
    g.lineStyle(3, 0xcc2200, 1);
    g.beginPath(); g.arc(SPRITE_W/2, 34, 10, 0.3, Math.PI-0.3, false); g.strokePath();
    g.fillStyle(0xff44aa, 1); g.fillCircle(SPRITE_W/2+24, 46, 9);
    g.lineStyle(1, 0xffaacc, 1); g.lineBetween(SPRITE_W/2+24, 55, SPRITE_W/2+20, 66);
  });
  make('sp_tourist', g => {
    human(g, SKIN_LIGHT, 0xffcc44, PANTS_BLUE, HAIR_BROWN);
    g.fillStyle(0xffaa22, 1); g.fillRect(SPRITE_W/2-22, 14, 44, 6); g.fillEllipse(SPRITE_W/2, 12, 26, 10);
    g.fillStyle(0x222222, 1); g.fillRect(SPRITE_W/2-7, 54, 14, 10);
    g.fillStyle(0x4488ff, 0.8); g.fillCircle(SPRITE_W/2, 59, 4);
    g.fillStyle(0xffffcc, 1); g.fillRect(SPRITE_W/2-24, 52, 14, 10);
    g.lineStyle(1, 0xcc8844, 0.7); g.lineBetween(SPRITE_W/2-22, 55, SPRITE_W/2-12, 55); g.lineBetween(SPRITE_W/2-22, 58, SPRITE_W/2-14, 58);
  });
  make('sp_nun', g => {
    human(g, SKIN_LIGHT, 0xffffff, PANTS_BLACK, HAIR_BLACK);
    g.fillStyle(0x000000, 1); g.fillRect(SPRITE_W/2-20, 8, 40, 32);
    g.fillStyle(0xffffff, 1); g.fillEllipse(SPRITE_W/2, 28, 26, 22);
    g.fillStyle(0xcc8822, 1);
    g.fillRect(SPRITE_W/2-1, 52, 3, 16); g.fillRect(SPRITE_W/2-6, 56, 13, 3);
    g.lineStyle(1, 0x996655, 1);
    g.beginPath(); g.arc(SPRITE_W/2, 34, 6, 0.2, Math.PI-0.2, false); g.strokePath();
  });
  make('sp_hitman', g => {
    human(g, SKIN_LIGHT, 0x111111, PANTS_BLACK, HAIR_BLACK);
    g.fillStyle(0x222222, 1);
    g.fillTriangle(SPRITE_W/2, 46, SPRITE_W/2-10, 56, SPRITE_W/2-2, 72);
    g.fillTriangle(SPRITE_W/2, 46, SPRITE_W/2+10, 56, SPRITE_W/2+2, 72);
    g.fillStyle(0xeeeeee, 1); g.fillTriangle(SPRITE_W/2-4, 46, SPRITE_W/2+4, 46, SPRITE_W/2, 54);
    g.fillStyle(0xcc0000, 1); g.fillTriangle(SPRITE_W/2-3, 50, SPRITE_W/2+3, 50, SPRITE_W/2, 64);
    g.fillStyle(0x333333, 1);
    g.fillRect(SPRITE_W/2+14, 50, 14, 5); g.fillRect(SPRITE_W/2+24, 48, 4, 9);
  });
} // end generateSprites
// --- Karma Labels (alignment descriptors) ---

function getAlignmentLabel(alignment: number): string {
  if (alignment >= 90) return 'DIVINE SAINT';
  if (alignment >= 70) return 'TRULY GOOD';
  if (alignment >= 50) return 'VIRTUOUS';
  if (alignment >= 30) return 'DECENT';
  if (alignment >= 10) return 'MOSTLY GOOD';
  if (alignment >= -9) return 'NEUTRAL';
  if (alignment >= -29) return 'SHADY';
  if (alignment >= -49) return 'MORALLY GREY';
  if (alignment >= -69) return 'WICKED';
  if (alignment >= -89) return 'VILE';
  return 'PURE EVIL';
}

function getAlignmentColor(alignment: number): number {
  if (alignment > 10) return COLORS.good;
  if (alignment < -10) return COLORS.evil;
  return COLORS.neutral;
}

// ─── Scenario Generator ───────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], count: number): T[] {
  const pool = [...arr];
  const result: T[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

function generateScenario(): Scenario {
  const shuffled = pickRandom(ENTITIES, ENTITIES.length);
  const leftCount  = Math.floor(Math.random() * 3) + 1; // 1-3
  const rightCount = Math.floor(Math.random() * 3) + 1;
  return {
    left:  shuffled.slice(0, leftCount),
    right: shuffled.slice(leftCount, leftCount + rightCount),
  };
}

// ─── Sound Engine (Web Audio API, procedural) ──────────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Helper: fill a buffer with white noise
function whiteNoiseBuf(ctx: AudioContext, duration: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function sfxLeverClick(): void {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    // Very short highpass noise snap — sounds like a mechanical switch click
    const src = ctx.createBufferSource();
    src.buffer = whiteNoiseBuf(ctx, 0.04);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 4000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    src.connect(hp); hp.connect(gain); gain.connect(ctx.destination);
    src.start();
  } catch (_) { /* */ }
}

function sfxLeverClunk(): void {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    // Heavy body: lowpass noise with fast transient
    const src = ctx.createBufferSource();
    src.buffer = whiteNoiseBuf(ctx, 0.22);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(60, t + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    src.connect(lp); lp.connect(gain); gain.connect(ctx.destination);
    src.start();
    // Subtle high crunch layer (wood-block texture)
    const src2 = ctx.createBufferSource();
    src2.buffer = whiteNoiseBuf(ctx, 0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 3;
    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.4, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src2.connect(bp); bp.connect(gain2); gain2.connect(ctx.destination);
    src2.start();
  } catch (_) { /* */ }
}

function sfxCountdownTick(secondsRemaining: number): void {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    // Each tick is a semitone higher: 5s=A4, 4s=C5, 3s=Eb5, 2s=F#5, 1s=A5
    const freqs: Record<number, number> = { 5: 440, 4: 523, 3: 622, 2: 740, 1: 880 };
    const freq = freqs[secondsRemaining] ?? 440 * Math.pow(2, (5 - secondsRemaining) / 4);
    const dur  = 0.12 - (5 - secondsRemaining) * 0.01; // slightly shorter as urgency rises
    const vol  = 0.35 + (5 - secondsRemaining) * 0.06;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t); osc.stop(t + dur);
  } catch (_) { /* */ }
}

function sfxDeathScream(): void {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    // Classic arcade "hit cry": pitch rises then falls rapidly
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    const base = 300 + Math.random() * 150; // slight variation each hit
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base * 2.8, t + 0.06);  // shoot up
    osc.frequency.exponentialRampToValueAtTime(base * 0.4, t + 0.28); // fall off
    gain.gain.setValueAtTime(0.30, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.start(t); osc.stop(t + 0.29);
  } catch (_) { /* */ }
}

function sfxBodyImpact(): void {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    // Classic arcade "bonk": fast downward pitch sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    gain.gain.setValueAtTime(0.40, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    osc.start(t); osc.stop(t + 0.14);
  } catch (_) { /* */ }
}

// ─── Music Engine ─────────────────────────────────────────────────────────────────
//
// OWA-style: E Phrygian Dominant, 172 BPM, grandiose ominous doom
// Scale (semitones from E): 0=E 1=F 4=G# 5=A 7=B 8=C 10=D
// Progression: Em → Fmaj → G#dim → Am  (no resolution, endless tension)
//
// Voices: Square lead (brass stabs), Sine pad chords,
//         Sub-bass + square, Triangle arpeggio, Percussion

let musicInterval: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;
let musicMasterGain: GainNode | null = null;

// Helper: note frequency from MIDI note number
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// E-based helper: midi note 64 = E4
const En = (oct: number, semi: number) => midi(64 + (oct - 4) * 12 + semi);
// Phrygian Dominant semitone offsets from E
const E = 0, _F = 1, Gs = 4, _A = 5, B = 7, _C = 8, _D = 10;

// ── Melody: aggressive brass-style stabs, chromatic + tritone movement
const MELODY: (readonly [number, number] | null)[] = [
  [E,4],  null,   [E,4],  [_F,4],  [Gs,4], null,   null,   [_F,4],
  [E,4],  null,   [_D,3], null,    [B,3],  null,   [_C,4], null,
  [_F,4], null,   [_F,4], [Gs,4],  [_A,4], null,   [B,4],  null,
  [_C,5], [B,4],  [_A,4], [Gs,4],  [_F,4], [E,4],  null,   null,
];

// ── Bass: syncopated root movement with flat-2 menace
const BASS: (number | null)[] = [
  E,    null, E,    null,  null, E,    null, null,
  _D,   null, _D,   null,  _C,   null, null, null,
  _F,   null, null, _F,    null, Gs-12,null, null,
  _A-12,null, B-12, null,  E,    null, _F,   null,
];

// ── Arpeggios: diminished + minor 7th patterns per 8-step bar
const ARP_CHORDS: number[][] = [
  [E,Gs,B,E+12,Gs+12,B+12,E+12,Gs+12],
  [_F,_A,_C,_F+12,_A+12,_C+12,_F+12,_A+12],
  [Gs,B,_D+12,Gs+12,B+12,_D+12,Gs+12,B+12],
  [_A-12,_C,E,_A,_C+12,E+12,_A,_C+12],
];

// ── Percussion: driving double-kick, heavy snare
// bit flags: 1=kick, 2=snare, 4=hat
const PERC: number[] = [
  5,0,4,1,  2,4,5,0,  5,0,4,1,  2,4,4,0,
  5,1,4,0,  2,4,5,0,  5,1,4,1,  2,4,5,0,
];

// ── Pad chords: held dark voicings
const PAD_CHORDS: number[][] = [
  [E, Gs, B],
  [_F, _A, _C],
  [Gs, B, _F+12],
  [_A-12, _C, E],
];

// ── Per-voice note players ──────────────────────────────────────────

function playMelody(semi: number, oct: number, dur: number): void {
  const ctx = getAudioCtx();
  const freq = En(oct, semi);
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = 'square'; // brass stab character
  osc.frequency.setValueAtTime(freq, t);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 1800; filt.Q.value = 1.2;
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.18, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.80);
  osc.connect(filt); filt.connect(g); g.connect(musicMasterGain!);
  osc.start(t); osc.stop(t + dur);
}

function playBass(semi: number, dur: number): void {
  const ctx = getAudioCtx();
  const freq = En(2, semi); // bass octave 2
  const t = ctx.currentTime;
  // Sub sine layer
  const sub = ctx.createOscillator();
  const sg  = ctx.createGain();
  sub.type = 'sine'; sub.frequency.value = freq;
  sg.gain.setValueAtTime(0.0, t);
  sg.gain.linearRampToValueAtTime(0.35, t + 0.008);
  sg.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
  sub.connect(sg); sg.connect(musicMasterGain!);
  sub.start(t); sub.stop(t + dur);
  // Square octave layer
  const sq  = ctx.createOscillator();
  const sqg = ctx.createGain();
  sq.type = 'square'; sq.frequency.value = freq * 2;
  sqg.gain.setValueAtTime(0.0, t);
  sqg.gain.linearRampToValueAtTime(0.10, t + 0.008);
  sqg.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.6);
  sq.connect(sqg); sqg.connect(musicMasterGain!);
  sq.start(t); sq.stop(t + dur);
}

function playArp(semi: number, dur: number): void {
  const ctx = getAudioCtx();
  const freq = En(4, semi % 12) * (semi >= 12 ? 2 : 1);
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
  osc.connect(g); g.connect(musicMasterGain!);
  osc.start(t); osc.stop(t + dur);
}

function playPad(semis: number[], dur: number): void {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  semis.forEach(semi => {
    const freq = En(3, semi);
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.04, t + 0.06);
    g.gain.linearRampToValueAtTime(0.04, t + dur - 0.06);
    g.gain.linearRampToValueAtTime(0.0,  t + dur);
    osc.connect(g); g.connect(musicMasterGain!);
    osc.start(t); osc.stop(t + dur);
  });
}

function playKick(dur: number): void {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  // Punchy sine-sweep kick
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
  g.gain.setValueAtTime(0.8, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.5);
  osc.connect(g); g.connect(musicMasterGain!);
  osc.start(t); osc.stop(t + dur);
}

function playSnare(dur: number): void {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  // Noise body + tone transient
  const src = ctx.createBufferSource();
  src.buffer = whiteNoiseBuf(ctx, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 1800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.35);
  src.connect(hp); hp.connect(g); g.connect(musicMasterGain!);
  src.start();
  // Snare crack tone
  const osc = ctx.createOscillator();
  const og  = ctx.createGain();
  osc.type = 'triangle'; osc.frequency.value = 220;
  og.gain.setValueAtTime(0.2, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(og); og.connect(musicMasterGain!);
  osc.start(t); osc.stop(t + 0.06);
}

function playHat(vol: number, dur: number): void {
  const ctx = getAudioCtx();
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = whiteNoiseBuf(ctx, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 8000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.4);
  src.connect(hp); hp.connect(g); g.connect(musicMasterGain!);
  src.start();
}

// --- Sequencer
const BPM = 172; // E Phrygian Dominant
const STEP_MS   = Math.round(60000 / (BPM * 4)); // 16th note
const BAR_STEPS = 8;
const SEQ_LEN   = 32;

function musicTick(): void {
  const step = musicStep % SEQ_LEN;
  const bar  = Math.floor(step / BAR_STEPS) % 4; // 0–3 for chord group

  // Melody
  const mel = MELODY[step];
  if (mel) playMelody(mel[0], mel[1], STEP_MS * 1.8 / 1000);

  // Bass
  const bassNote = BASS[step];
  if (bassNote !== null) playBass(bassNote, STEP_MS * 1.6 / 1000);

  // Arpeggio
  const arpStep = step % BAR_STEPS;
  const arpNote = ARP_CHORDS[bar][arpStep];
  playArp(arpNote, STEP_MS * 0.85 / 1000);

  // Pad: fire on first step of each bar section (every 8 steps)
  if (step % BAR_STEPS === 0) {
    playPad(PAD_CHORDS[bar], (STEP_MS * BAR_STEPS * 1.05) / 1000);
  }

  // Percussion
  const perc = PERC[step];
  if (perc & 1) playKick(STEP_MS * 1.5 / 1000);
  if (perc & 2) playSnare(STEP_MS * 1.0 / 1000);
  if (perc & 4) playHat(perc & 1 ? 0.12 : 0.20, STEP_MS * 0.5 / 1000);

  musicStep++;
}

function startMusic(): void {
  if (musicInterval) return; // already playing
  const ctx = getAudioCtx();
  // Master gain with soft limiter-like ceiling
  musicMasterGain = ctx.createGain();
  musicMasterGain.gain.value = 0.22;
  musicMasterGain.connect(ctx.destination);
  musicStep = 0;
  musicTick(); // fire immediately so there's no silence gap
  musicInterval = setInterval(musicTick, STEP_MS);
}

function stopMusic(): void {
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
  if (musicMasterGain) {
    // Fade out gracefully
    const ctx = getAudioCtx();
    musicMasterGain.gain.setValueAtTime(musicMasterGain.gain.value, ctx.currentTime);
    musicMasterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    musicMasterGain = null;
  }
}

// ─── Game State ───────────────────────────────────────────────────────────────

let scene: Phaser.Scene;
let state: GameState = {
  alignment: KARMA_START,
  phase: 'choosing',
  switchDir: 'left',
  round: 1,
  scenario: null,
};

// ─── Scene Objects (module-level refs) ───────────────────────────────────────

let trackGfx: Phaser.GameObjects.Graphics;
let switchGfx: Phaser.GameObjects.Graphics;
let trainCars: Phaser.GameObjects.Container[] = [];
let leftEntityTexts: Phaser.GameObjects.Text[] = [];
let rightEntityTexts: Phaser.GameObjects.Text[] = [];
let karmaBarBg: Phaser.GameObjects.Graphics;
let karmaBarFill: Phaser.GameObjects.Graphics;
let karmaLabel: Phaser.GameObjects.Text;
let karmaValue: Phaser.GameObjects.Text;
let roundText: Phaser.GameObjects.Text;
let resultBanner: Phaser.GameObjects.Container;
let btnLeft: Phaser.GameObjects.Container;
let btnRight: Phaser.GameObjects.Container;
let switchArrow: Phaser.GameObjects.Text;
let gameOverContainer: Phaser.GameObjects.Container | null = null;
let btnLeftHighlight: Phaser.GameObjects.Graphics;
let btnRightHighlight: Phaser.GameObjects.Graphics;
let continueBtn: Phaser.GameObjects.Container | null = null;
let floatNumberTexts: Phaser.GameObjects.Text[] = [];
let approachTween: Phaser.Tweens.Tween | null = null;
let leverGfx: Phaser.GameObjects.Graphics;
let leverHandleGfx: Phaser.GameObjects.Graphics;
let trackHighlightGfx: Phaser.GameObjects.Graphics;
let trackHighlightTween: Phaser.Tweens.Tween | null = null;
let countdownGfx: Phaser.GameObjects.Graphics;
let countdownText: Phaser.GameObjects.Text;
let countdownTimer: Phaser.Time.TimerEvent | null = null;
let starLeft: Phaser.GameObjects.Container | null = null;
let starRight: Phaser.GameObjects.Container | null = null;

// ─── Terrain ───────────────────────────────────────────────────────────────────

function drawTerrain(sc: Phaser.Scene): void {
  const g = sc.add.graphics().setDepth(1);

  // Deterministic pseudo-random using a simple LCG so terrain is stable each run
  let seed = 42;
  function rand(): number { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }

  // ── Dirt patches (darker oval blobs scattered around) ────────────────────
  const DIRT_COLORS = [0x4a3018, 0x5c3d1e, 0x3d2810, 0x6b4a2a];
  for (let i = 0; i < 38; i++) {
    const x = rand() * GAME_WIDTH;
    const y = 180 + rand() * (GAME_HEIGHT - 260);
    const rx = 14 + rand() * 36;
    const ry = 5 + rand() * 14;
    const col = DIRT_COLORS[Math.floor(rand() * DIRT_COLORS.length)];
    g.fillStyle(col, 0.55);
    g.fillEllipse(x, y, rx * 2, ry * 2);
  }

  // ── Stones ────────────────────────────────────────────────────────────
  const STONE_COLORS = [0x888888, 0x777799, 0x999999, 0xaaaaaa, 0x666677];
  for (let i = 0; i < 55; i++) {
    const x = rand() * GAME_WIDTH;
    const y = 180 + rand() * (GAME_HEIGHT - 260);
    const r = 3 + rand() * 10;
    const col = STONE_COLORS[Math.floor(rand() * STONE_COLORS.length)];
    // Irregular stone shape using fillPoints
    const SIDES = 5 + Math.floor(rand() * 3);
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s < SIDES; s++) {
      const a = (Math.PI * 2 * s) / SIDES + rand() * 0.5;
      const sr = r * (0.6 + rand() * 0.6);
      pts.push({ x: x + Math.cos(a) * sr, y: y + Math.sin(a) * sr * 0.7 });
    }
    g.fillStyle(col, 0.85);
    g.fillPoints(pts, true, true);
    // Stone highlight
    g.fillStyle(0xffffff, 0.15);
    g.fillEllipse(x - r * 0.3, y - r * 0.3, r * 0.7, r * 0.4);
  }

  // ── Grass strands (thin vertical spikes in clusters) ───────────────────
  const GRASS_STRAND_COLORS = [0x22881a, 0x2da822, 0x1a7010, 0x38c030, 0x186010];
  for (let cluster = 0; cluster < 70; cluster++) {
    const cx = rand() * GAME_WIDTH;
    const cy = 180 + rand() * (GAME_HEIGHT - 260);
    const count = 3 + Math.floor(rand() * 5);
    for (let b = 0; b < count; b++) {
      const bx = cx + (rand() - 0.5) * 22;
      const by = cy + (rand() - 0.5) * 8;
      const h  = 8 + rand() * 18;
      const lean = (rand() - 0.5) * 8;  // tip lean
      const col = GRASS_STRAND_COLORS[Math.floor(rand() * GRASS_STRAND_COLORS.length)];
      g.lineStyle(2, col, 0.9);
      g.beginPath();
      g.moveTo(bx, by);
      g.lineTo(bx + lean, by - h);
      g.strokePath();
      // Tiny tip
      g.fillStyle(col, 0.8);
      g.fillCircle(bx + lean, by - h, 1.5);
    }
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

function create(this: Phaser.Scene): void {
  scene = this;

  // Generate all entity sprites first
  generateSprites(this);

  // Full-screen grass background (uniform across entire play area)
  const bg = this.add.graphics();
  bg.fillStyle(COLORS.grass, 1);
  bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  // Scanline effect over entire screen
  for (let sy = 0; sy < GAME_HEIGHT; sy += 4) {
    bg.fillStyle(0x000000, 0.10);
    bg.fillRect(0, sy, GAME_WIDTH, 2);
  }

  // Terrain decorations (grass, dirt, stones)
  drawTerrain(this);

  // Static track
  trackGfx = this.add.graphics();
  drawTrack(trackGfx, state.switchDir);

  // Track highlight overlay (pulsing, managed separately)
  trackHighlightGfx = this.add.graphics().setDepth(3).setAlpha(0);

  // Switch indicator arrow (just above fork)
  switchArrow = this.add.text(TRACK_CENTER_X, FORK_Y - 36, '◀ LEFT', {
    fontSize: '32px', fontFamily: 'Arial Black', color: '#ffff00',
  }).setOrigin(0.5).setDepth(5);

  // Train cars (separate objects)
  createTrainCars(this);

  // Entity zones
  buildEntityDisplays(this);

  // Karma bar
  buildKarmaBar(this);

  // Round counter
  roundText = this.add.text(GAME_WIDTH / 2, 142, `ROUND ${state.round} / ${TOTAL_ROUNDS}`, {
    fontSize: '32px', fontFamily: 'Arial Black', color: '#ffdd00',
    stroke: '#000000', strokeThickness: 6,
  }).setOrigin(0.5, 0).setDepth(20);

  // Lever switch
  buildLever(this);
  startCountdown();

  // Result banner (hidden)
  resultBanner = createResultBanner(this);
  resultBanner.setVisible(false).setDepth(50);

  // Load first scenario
  state.scenario = generateScenario();
  renderScenario();
  startMusic();
}

// ─── Update ───────────────────────────────────────────────────────────────────

function update(this: Phaser.Scene): void {
  // Nothing needed — driven by tweens + timers
}

// ─── Track Drawing ────────────────────────────────────────────────────────────

// Cubic Bezier control offset: fraction of the vertical span used for tangent handles.
// This ensures the curve is tangent-continuous (enters and exits vertically).
const CURVE_HANDLE = (FORK_END_Y - FORK_Y) * 0.55;

function makeForkCurve(forkX: number): Phaser.Curves.CubicBezier {
  return new Phaser.Curves.CubicBezier(
    new Phaser.Math.Vector2(TRACK_CENTER_X, FORK_Y),                 // start  — top of fork
    new Phaser.Math.Vector2(TRACK_CENTER_X, FORK_Y + CURVE_HANDLE),  // ctrl1  — pulls straight down
    new Phaser.Math.Vector2(forkX,          FORK_END_Y - CURVE_HANDLE), // ctrl2 — arrives straight down
    new Phaser.Math.Vector2(forkX,          FORK_END_Y),             // end    — bottom of fork
  );
}

function drawTrack(g: Phaser.GameObjects.Graphics, dir: SwitchDir): void {
  g.clear();

  const railOffset = 18;

  // ── Stem (top → fork): straight
  drawRailSegment(g, TRACK_CENTER_X, TRACK_TOP_Y, TRACK_CENTER_X, FORK_Y, railOffset);

  // ── Left branch: smooth cubic curve, then straight to bottom
  drawCubicRailSegment(g, makeForkCurve(LEFT_FORK_X), railOffset);
  drawRailSegment(g, LEFT_FORK_X, FORK_END_Y, LEFT_FORK_X, TRACK_BOTTOM_Y, railOffset);

  // ── Right branch: smooth cubic curve, then straight to bottom
  drawCubicRailSegment(g, makeForkCurve(RIGHT_FORK_X), railOffset);
  drawRailSegment(g, RIGHT_FORK_X, FORK_END_Y, RIGHT_FORK_X, TRACK_BOTTOM_Y, railOffset);
}

function drawTrackHighlight(dir: SwitchDir): void {
  trackHighlightGfx.clear();
  const forkX = dir === 'left' ? LEFT_FORK_X : RIGHT_FORK_X;
  const hlColor = 0x44ffcc;
  const hlWidth = TRACK_WIDTH + 8;
  // Stem: top of screen to fork
  trackHighlightGfx.lineStyle(hlWidth, hlColor, 1);
  trackHighlightGfx.lineBetween(TRACK_CENTER_X, TRACK_TOP_Y, TRACK_CENTER_X, FORK_Y);
  // Curved fork section
  const curve = makeForkCurve(forkX);
  trackHighlightGfx.lineStyle(hlWidth, hlColor, 1);
  curve.draw(trackHighlightGfx, 48);
  // Straight section to bottom
  trackHighlightGfx.lineStyle(hlWidth, hlColor, 1);
  trackHighlightGfx.lineBetween(forkX, FORK_END_Y, forkX, TRACK_BOTTOM_Y);
}

function startTrackPulse(dir: SwitchDir): void {
  stopTrackPulse();
  drawTrackHighlight(dir);
  trackHighlightGfx.setAlpha(0.5);
  trackHighlightTween = scene.tweens.add({
    targets: trackHighlightGfx,
    alpha: 0.15,
    duration: 700,
    ease: 'Sine.InOut',
    yoyo: true,
    repeat: -1,
  });
}

function stopTrackPulse(): void {
  if (trackHighlightTween) { trackHighlightTween.destroy(); trackHighlightTween = null; }
  trackHighlightGfx.setAlpha(0);
  trackHighlightGfx.clear();
}

/**
 * Draw a rail segment along a CubicBezier curve:
 * samples STEPS points, draws ties perpendicular to the tangent, and two offset rail polylines.
 */
function drawCubicRailSegment(
  g: Phaser.GameObjects.Graphics,
  curve: Phaser.Curves.CubicBezier,
  railOff: number,
): void {
  const STEPS = 32;
  const tieLen = railOff + 8;

  // Ties
  g.lineStyle(10, COLORS.tie, 1);
  for (let i = 0; i <= STEPS; i++) {
    const t   = i / STEPS;
    const pt  = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const nx = -tan.y, ny = tan.x;
    g.beginPath();
    g.moveTo(pt.x + nx * tieLen, pt.y + ny * tieLen);
    g.lineTo(pt.x - nx * tieLen, pt.y - ny * tieLen);
    g.strokePath();
  }

  // Rails
  for (const side of [-1, 1]) {
    g.lineStyle(5, COLORS.rail, 1);
    g.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const t   = i / STEPS;
      const pt  = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const nx = -tan.y, ny = tan.x;
      const px = pt.x + nx * railOff * side;
      const py = pt.y + ny * railOff * side;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.strokePath();
  }
}

function drawRailSegment(
  g: Phaser.GameObjects.Graphics,
  x1: number, y1: number, x2: number, y2: number,
  railOff: number,
): void {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len, ny = dx / len; // perpendicular

  // Ties
  const steps = Math.floor(len / 28);
  g.lineStyle(10, COLORS.tie, 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    const tieLen = railOff + 8;
    g.beginPath();
    g.moveTo(cx + nx * tieLen, cy + ny * tieLen);
    g.lineTo(cx - nx * tieLen, cy - ny * tieLen);
    g.strokePath();
  }

  // Rails (two parallel lines)
  for (const side of [-1, 1]) {
    g.lineStyle(5, COLORS.rail, 1);
    g.beginPath();
    g.moveTo(x1 + nx * railOff * side, y1 + ny * railOff * side);
    g.lineTo(x2 + nx * railOff * side, y2 + ny * railOff * side);
    g.strokePath();
  }
}

// ─── Train ────────────────────────────────────────────────────────────────────

const CAR_W   = 72;   // width of each car
const CAR_H   = 100;  // height of passenger car
const LOCO_H  = 120;  // height of locomotive
const CAR_GAP = 14;   // visual gap between cars when stationary
const NUM_CARS = 2;   // passenger cars behind the locomotive
const CAR_TRAIL_MS = 180; // ms each trailing car lags behind the one ahead

/** Draw a single locomotive graphic centred on (0,0), nose pointing DOWN. */
function makeLocoGraphic(sc: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = sc.add.graphics();
  const hw = CAR_W / 2, hh = LOCO_H / 2;
  // Body
  g.fillStyle(COLORS.trainBody, 1);
  g.fillRoundedRect(-hw, -hh, CAR_W, LOCO_H, 8);
  // Nose stripe at BOTTOM (direction of travel)
  g.fillStyle(0xdd6644, 1);
  g.fillRect(-hw, hh - 22, CAR_W, 22);
  // Headlight at BOTTOM centre
  g.fillStyle(0xffffaa, 1);
  g.fillCircle(0, hh - 6, 7);
  // Cab windows near top
  g.fillStyle(COLORS.trainWindow, 1);
  g.fillRoundedRect(-hw + 10, -hh + 10, CAR_W - 20, 30, 4);
  g.fillRoundedRect(-hw + 10, -hh + 50, CAR_W - 20, 22, 4);
  // Wheels
  g.fillStyle(COLORS.trainWheel, 1);
  g.fillCircle(-hw + 13, hh - 12, 10); g.fillCircle(hw - 13, hh - 12, 10);
  g.fillStyle(0x888888, 1);
  g.fillCircle(-hw + 13, hh - 12,  5); g.fillCircle(hw - 13, hh - 12,  5);
  // Coupler at top (connects to car behind)
  g.fillStyle(0x666666, 1);
  g.fillRect(-5, -hh, 10, 8);
  return g;
}

/** Draw a single passenger car graphic centred on (0,0). */
function makeCarGraphic(sc: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = sc.add.graphics();
  const hw = CAR_W / 2, hh = CAR_H / 2;
  // Body
  g.fillStyle(0xaa2211, 1);
  g.fillRoundedRect(-hw, -hh, CAR_W, CAR_H, 6);
  // Top stripe
  g.fillStyle(0xcc4433, 1);
  g.fillRect(-hw, -hh, CAR_W, 10);
  // Three rows of windows
  g.fillStyle(COLORS.trainWindow, 1);
  const winRows = [-hh + 18, -hh + 44, -hh + 70];
  winRows.forEach(wy => {
    g.fillRoundedRect(-hw + 8,  wy, 20, 16, 3);
    g.fillRoundedRect( hw - 28, wy, 20, 16, 3);
  });
  // Wheels
  g.fillStyle(COLORS.trainWheel, 1);
  g.fillCircle(-hw + 13, hh - 10, 10); g.fillCircle(hw - 13, hh - 10, 10);
  g.fillStyle(0x888888, 1);
  g.fillCircle(-hw + 13, hh - 10,  5); g.fillCircle(hw - 13, hh - 10,  5);
  // Couplers top & bottom
  g.fillStyle(0x666666, 1);
  g.fillRect(-5, -hh, 10, 8);
  g.fillRect(-5,  hh - 8, 10, 8);
  return g;
}

/** Create all train car containers and store in trainCars[]. Index 0 = locomotive. */
function createTrainCars(sc: Phaser.Scene): void {
  // Destroy any existing cars from a previous round
  trainCars.forEach(c => c.destroy());
  trainCars = [];

  // Locomotive
  const loco = sc.add.container(0, 0, [makeLocoGraphic(sc)]);
  loco.setSize(CAR_W, LOCO_H).setDepth(12).setVisible(false);
  trainCars.push(loco);

  // Passenger cars
  for (let i = 0; i < NUM_CARS; i++) {
    const car = sc.add.container(0, 0, [makeCarGraphic(sc)]);
    car.setSize(CAR_W, CAR_H).setDepth(11 - i).setVisible(false);
    trainCars.push(car);
  }
}

// ─── Entity Displays ──────────────────────────────────────────────────────────

const ENTITY_ZONE_Y  = FORK_END_Y + 80; // Y of first entity on each branch
const ENTITY_SPACING = 140;              // vertical gap between entities on same branch

// Speech bubble dimensions
const BUBBLE_W = 190;
const BUBBLE_H = 64;
const BUBBLE_R = 12;
const BUBBLE_TAIL = 18; // tail width/height

/**
 * Draw a speech bubble whose tail points left (toward the sprite on the left track)
 * or right (toward the sprite on the right track).
 * The bubble body is always drawn on the INWARD side (center of screen).
 * `tailSide`: 'left' means the tail pokes out to the left (used for left-track entities).
 */
function drawSpeechBubble(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  tailSide: 'left' | 'right',
): void {
  g.fillStyle(0xf5f0e8, 0.92);
  g.fillRoundedRect(cx - BUBBLE_W / 2, cy - BUBBLE_H / 2, BUBBLE_W, BUBBLE_H, BUBBLE_R);
  // Tail triangle
  const tx = tailSide === 'left'
    ? cx - BUBBLE_W / 2
    : cx + BUBBLE_W / 2;
  g.fillTriangle(
    tx, cy - BUBBLE_TAIL / 2,
    tx, cy + BUBBLE_TAIL / 2,
    tx + (tailSide === 'left' ? -BUBBLE_TAIL : BUBBLE_TAIL), cy,
  );
}

function buildEntityDisplays(_sc: Phaser.Scene): void {
  leftEntityTexts = [];
  rightEntityTexts = [];
}

function renderScenario(): void {
  if (!state.scenario) return;

  // Clear old
  leftEntityTexts.forEach(t => t.destroy());
  rightEntityTexts.forEach(t => t.destroy());
  leftEntityTexts = [];
  rightEntityTexts = [];

  const { left, right } = state.scenario;

  // Left column
  left.forEach((e, i) => {
    const trackX = LEFT_FORK_X;
    const y = ENTITY_ZONE_Y + i * ENTITY_SPACING;

    const sprite = scene.add.image(trackX, y, e.spriteKey)
      .setOrigin(0.5).setDisplaySize(SPRITE_W, SPRITE_H).setDepth(5);

    // Name pill — tight dark badge directly above the sprite
    const nameBg = scene.add.graphics().setDepth(6);
    nameBg.fillStyle(0x000000, 0.78);
    nameBg.fillRoundedRect(trackX - 66, y - SPRITE_H / 2 - 58, 132, 52, 8);
    const nameText = scene.add.text(trackX, y - SPRITE_H / 2 - 32, e.name, {
      fontSize: '21px', fontFamily: 'Arial', color: '#eeeeee',
      align: 'center', wordWrap: { width: 120 },
    }).setOrigin(0.5, 0.5).setDepth(7);

    leftEntityTexts.push(
      sprite   as unknown as Phaser.GameObjects.Text,
      nameText as unknown as Phaser.GameObjects.Text,
      nameBg   as unknown as Phaser.GameObjects.Text,
    );
  });

  // Right column
  right.forEach((e, i) => {
    const trackX = RIGHT_FORK_X;
    const y = ENTITY_ZONE_Y + i * ENTITY_SPACING;

    const sprite = scene.add.image(trackX, y, e.spriteKey)
      .setOrigin(0.5).setDisplaySize(SPRITE_W, SPRITE_H).setDepth(5);

    const nameBg = scene.add.graphics().setDepth(6);
    nameBg.fillStyle(0x000000, 0.78);
    nameBg.fillRoundedRect(trackX - 66, y - SPRITE_H / 2 - 58, 132, 52, 8);
    const nameText = scene.add.text(trackX, y - SPRITE_H / 2 - 32, e.name, {
      fontSize: '21px', fontFamily: 'Arial', color: '#eeeeee',
      align: 'center', wordWrap: { width: 120 },
    }).setOrigin(0.5, 0.5).setDepth(7);

    rightEntityTexts.push(
      sprite   as unknown as Phaser.GameObjects.Text,
      nameText as unknown as Phaser.GameObjects.Text,
      nameBg   as unknown as Phaser.GameObjects.Text,
    );
  });
}

// ─── Karma Bar ────────────────────────────────────────────────────────────────

function buildKarmaBar(sc: Phaser.Scene): void {
  const barX = (GAME_WIDTH - KARMA_BAR_W) / 2;
  const panelH = KARMA_BAR_H + 68;

  // SNES-style panel: thick black border + dark navy fill
  const panelBg = sc.add.graphics().setDepth(20);
  // Thick pixel border (4px solid black)
  panelBg.fillStyle(COLORS.snes.outline, 1);
  panelBg.fillRect(barX - 16, 2, KARMA_BAR_W + 32, panelH + 4);
  // Inner panel fill
  panelBg.fillStyle(COLORS.snes.panelBg, 1);
  panelBg.fillRect(barX - 12, 6, KARMA_BAR_W + 24, panelH - 2);
  // Yellow top accent stripe
  panelBg.fillStyle(COLORS.snes.yellow, 1);
  panelBg.fillRect(barX - 12, 6, KARMA_BAR_W + 24, 5);

  // Alignment label
  karmaLabel = sc.add.text(GAME_WIDTH / 2, 18, 'NEUTRAL', {
    fontSize: '24px', fontFamily: 'Arial Black', color: '#44aaff',
    stroke: '#000000', strokeThickness: 5,
  }).setOrigin(0.5, 0).setDepth(22);

  // Bar track (dark recessed look)
  karmaBarBg = sc.add.graphics().setDepth(21);
  karmaBarBg.fillStyle(0x080818, 1);
  karmaBarBg.fillRect(barX - 2, KARMA_BAR_Y - 2, KARMA_BAR_W + 4, KARMA_BAR_H + 4);
  karmaBarBg.fillStyle(0x1a1a3a, 1);
  karmaBarBg.fillRect(barX, KARMA_BAR_Y, KARMA_BAR_W, KARMA_BAR_H);

  karmaBarFill = sc.add.graphics().setDepth(22);

  // End labels
  sc.add.text(barX, KARMA_BAR_Y + KARMA_BAR_H + 8, '😈 EVIL', {
    fontSize: '20px', fontFamily: 'Arial Black', color: '#ff2244',
    stroke: '#000000', strokeThickness: 4,
  }).setOrigin(0, 0).setDepth(22);
  sc.add.text(barX + KARMA_BAR_W, KARMA_BAR_Y + KARMA_BAR_H + 8, 'GOOD 😇', {
    fontSize: '20px', fontFamily: 'Arial Black', color: '#ffdd00',
    stroke: '#000000', strokeThickness: 4,
  }).setOrigin(1, 0).setDepth(22);

  karmaValue = sc.add.text(GAME_WIDTH / 2, KARMA_BAR_Y + KARMA_BAR_H + 8, '', {
    fontSize: '20px', fontFamily: 'Arial Black', color: '#ffffff',
    stroke: '#000000', strokeThickness: 4,
  }).setOrigin(0.5, 0).setDepth(22);

  redrawKarmaBar();
}

function redrawKarmaBar(): void {
  const barX = (GAME_WIDTH - KARMA_BAR_W) / 2;
  const normalized = (state.alignment - KARMA_MIN) / (KARMA_MAX - KARMA_MIN);
  const midX = barX + KARMA_BAR_W / 2;
  const fillColor = getAlignmentColor(state.alignment);

  karmaBarFill.clear();
  if (state.alignment > 0) {
    const fillW = (normalized - 0.5) * KARMA_BAR_W;
    karmaBarFill.fillStyle(fillColor, 1);
    karmaBarFill.fillRect(midX, KARMA_BAR_Y + 2, Math.max(fillW, 4), KARMA_BAR_H - 4);
    // Bright top stripe highlight
    karmaBarFill.fillStyle(0xffffff, 0.25);
    karmaBarFill.fillRect(midX, KARMA_BAR_Y + 2, Math.max(fillW, 4), 6);
  } else if (state.alignment < 0) {
    const fillW = (0.5 - normalized) * KARMA_BAR_W;
    karmaBarFill.fillStyle(fillColor, 1);
    karmaBarFill.fillRect(midX - fillW, KARMA_BAR_Y + 2, Math.max(fillW, 4), KARMA_BAR_H - 4);
    karmaBarFill.fillStyle(0xffffff, 0.25);
    karmaBarFill.fillRect(midX - fillW, KARMA_BAR_Y + 2, Math.max(fillW, 4), 6);
  }

  // Center divider tick
  karmaBarFill.lineStyle(3, 0xffffff, 0.8);
  karmaBarFill.lineBetween(midX, KARMA_BAR_Y + 2, midX, KARMA_BAR_Y + KARMA_BAR_H - 2);

  const label = getAlignmentLabel(state.alignment);
  const r = (fillColor >> 16) & 0xff;
  const g = (fillColor >> 8)  & 0xff;
  const b =  fillColor        & 0xff;
  const hexStr = '#' + r.toString(16).padStart(2, '0')
                + g.toString(16).padStart(2, '0')
                + b.toString(16).padStart(2, '0');
  karmaLabel.setText(label).setColor(hexStr);
  karmaValue.setText(`KARMA: ${state.alignment > 0 ? '+' : ''}${state.alignment}`);
}


// ─── Lever Switch + Hover Zones ─────────────────────────────────────────────

const LEVER_CX    = GAME_WIDTH / 2;
const LEVER_Y     = GAME_HEIGHT - 260;
const LEVER_W     = 220;
const LEVER_H     = 80;
const HANDLE_LEN  = 120;
const HANDLE_TILT = 36;
const COUNTDOWN_SECS = 5;

function buildLever(sc: Phaser.Scene): void {
  leverGfx = sc.add.graphics().setDepth(35);

  // ── 3D base plate ───────────────────────────────────────────────
  const bx = LEVER_CX - LEVER_W / 2, by = LEVER_Y - LEVER_H / 2;
  // Drop-shadow (offset dark slab)
  leverGfx.fillStyle(0x111118, 0.7);
  leverGfx.fillRoundedRect(bx + 5, by + 6, LEVER_W, LEVER_H, 14);
  // Main body — mid tone
  leverGfx.fillStyle(0x2e3050, 1);
  leverGfx.fillRoundedRect(bx, by, LEVER_W, LEVER_H, 14);
  // Bottom-edge dark bevel
  leverGfx.fillStyle(0x1a1c35, 1);
  leverGfx.fillRoundedRect(bx, by + LEVER_H - 14, LEVER_W, 14, { bl: 14, br: 14, tl: 0, tr: 0 });
  // Top-edge highlight stripe
  leverGfx.fillStyle(0x6676cc, 0.6);
  leverGfx.fillRoundedRect(bx + 2, by + 2, LEVER_W - 4, 10, { tl: 12, tr: 12, bl: 0, br: 0 });
  // Outer border
  leverGfx.lineStyle(2, 0x8899dd, 0.8);
  leverGfx.strokeRoundedRect(bx, by, LEVER_W, LEVER_H, 14);
  // Specular glint — small bright ellipse near top-left
  leverGfx.fillStyle(0xffffff, 0.18);
  leverGfx.fillEllipse(bx + 36, by + 16, 60, 18);

  // Pivot circle
  leverGfx.fillStyle(0x16182a, 1);
  leverGfx.fillCircle(LEVER_CX, LEVER_Y, 20);
  leverGfx.fillStyle(0x3a3f6e, 1);
  leverGfx.fillCircle(LEVER_CX, LEVER_Y, 15);
  leverGfx.lineStyle(2, 0x99aaee, 0.9);
  leverGfx.strokeCircle(LEVER_CX, LEVER_Y, 15);
  // Pivot highlight dot
  leverGfx.fillStyle(0xffffff, 0.25);
  leverGfx.fillCircle(LEVER_CX - 4, LEVER_Y - 5, 5);

  // ── Labels BELOW the base plate ──────────────────────────────────
  const labelY = LEVER_Y + LEVER_H / 2 + 28;
  sc.add.text(LEVER_CX - 60, labelY, '◄ LEFT', {
    fontSize: '26px', fontFamily: 'Arial Black', color: '#aabbff',
  }).setOrigin(0.5, 0).setDepth(36);
  sc.add.text(LEVER_CX + 60, labelY, 'RIGHT ►', {
    fontSize: '26px', fontFamily: 'Arial Black', color: '#ffaabb',
  }).setOrigin(0.5, 0).setDepth(36);

  // ── Handle + countdown + zones ──────────────────────────────────
  leverHandleGfx = sc.add.graphics().setDepth(37);
  drawLeverHandle(state.switchDir);

  countdownGfx  = sc.add.graphics().setDepth(36);
  countdownText = sc.add.text(LEVER_CX, LEVER_Y - HANDLE_LEN - 48, '', {
    fontSize: '40px', fontFamily: 'Arial Black', color: '#ffffff',
    stroke: '#000000', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(37).setVisible(false);

  const zoneH = GAME_HEIGHT;
  const zoneL = sc.add.rectangle(GAME_WIDTH / 4,     zoneH / 2, GAME_WIDTH / 2, zoneH)
    .setInteractive({ useHandCursor: true });
  const zoneR = sc.add.rectangle(GAME_WIDTH * 3 / 4, zoneH / 2, GAME_WIDTH / 2, zoneH)
    .setInteractive({ useHandCursor: true });
  zoneL.on('pointermove', () => onHover('left'));
  zoneR.on('pointermove', () => onHover('right'));
  zoneL.on('pointerdown', () => onConfirm('left'));
  zoneR.on('pointerdown', () => onConfirm('right'));
  btnLeft  = zoneL as unknown as Phaser.GameObjects.Container;
  btnRight = zoneR as unknown as Phaser.GameObjects.Container;
}

function drawLeverHandle(dir: SwitchDir): void {
  leverHandleGfx.clear();
  const tiltRad = (dir === 'left' ? -HANDLE_TILT : HANDLE_TILT) * (Math.PI / 180);
  const tipX = LEVER_CX + Math.sin(tiltRad) * HANDLE_LEN;
  const tipY = LEVER_Y  - Math.cos(tiltRad) * HANDLE_LEN;

  // Drop shadow
  leverHandleGfx.lineStyle(16, 0x000000, 0.35);
  leverHandleGfx.lineBetween(LEVER_CX + 3, LEVER_Y + 4, tipX + 3, tipY + 4);

  // Rod body
  const rodColor = dir === 'left' ? 0x2255cc : 0xcc2244;
  leverHandleGfx.lineStyle(14, rodColor, 1);
  leverHandleGfx.lineBetween(LEVER_CX, LEVER_Y, tipX, tipY);

  // Rod highlight stripe (offset slightly in perpendicular direction)
  const nx = -Math.cos(tiltRad), ny = -Math.sin(tiltRad); // perpendicular
  leverHandleGfx.lineStyle(4, dir === 'left' ? 0x88bbff : 0xff88aa, 0.7);
  leverHandleGfx.lineBetween(
    LEVER_CX + nx * 4, LEVER_Y + ny * 4,
    tipX    + nx * 4, tipY    + ny * 4,
  );

  // Ball — dark base, coloured fill, bright specular glint
  leverHandleGfx.fillStyle(0x111122, 1);
  leverHandleGfx.fillCircle(tipX, tipY, 24);
  leverHandleGfx.fillStyle(dir === 'left' ? 0x4477dd : 0xdd3355, 1);
  leverHandleGfx.fillCircle(tipX, tipY, 21);
  // Rim highlight
  leverHandleGfx.lineStyle(3, dir === 'left' ? 0xaaccff : 0xffaacc, 0.7);
  leverHandleGfx.strokeCircle(tipX, tipY, 21);
  // Specular glint
  leverHandleGfx.fillStyle(0xffffff, 0.55);
  leverHandleGfx.fillEllipse(tipX - 7, tipY - 8, 10, 7);
}

function onHover(dir: SwitchDir): void {
  if (state.phase !== 'choosing') return;
  if (state.switchDir === dir) return;
  state.switchDir = dir;
  sfxLeverClick();
  drawTrack(trackGfx, dir);
  drawLeverHandle(dir);
  startTrackPulse(dir);
  showHoverStar(dir);
}

function onConfirm(dir: SwitchDir): void {
  if (state.phase !== 'choosing') return;
  stopCountdown();
  setSwitch(dir);
}

function showHoverStar(dir: SwitchDir): void {
  // Always destroy both — only one star at a time
  if (starLeft)  { starLeft.destroy();  starLeft  = null; }
  if (starRight) { starRight.destroy(); starRight = null; }

  const sx = dir === 'left' ? LEVER_CX - LEVER_W / 2 - 60 : LEVER_CX + LEVER_W / 2 + 60;
  const sy = LEVER_Y;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16 - Math.PI / 2;
    const r = i % 2 === 0 ? 72 : 32;   // larger starburst
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const g = scene.add.graphics().setDepth(38);
  g.fillStyle(0xffee00, 1);
  g.fillPoints(pts, true, true);
  // Inner ring highlight
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(0, 0, 28);
  const lbl = scene.add.text(0, 0, 'CLICK!', {
    fontSize: '22px', fontFamily: 'Arial Black', color: '#222200',
  }).setOrigin(0.5).setDepth(39);
  const star = scene.add.container(sx, sy, [g, lbl]).setDepth(38);
  star.setScale(0.1);

  // Pop-in then pulse
  scene.tweens.add({
    targets: star, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.Out',
    onComplete: () => {
      scene.tweens.add({
        targets: star,
        scaleX: 1.15, scaleY: 1.15,
        duration: 400, ease: 'Sine.InOut',
        yoyo: true, repeat: -1,
      });
    },
  });

  if (dir === 'left') starLeft = star; else starRight = star;
}

function startCountdown(): void {
  stopCountdown();
  const totalMs = COUNTDOWN_SECS * 1000;
  let elapsedMs = 0;
  let lastTickSecond = COUNTDOWN_SECS; // track last whole second for tick sound

  drawCountdownRing(1);
  countdownText.setText(COUNTDOWN_SECS.toFixed(2)).setVisible(true);
  startTrackPulse(state.switchDir);

  // Approach animation
  const karmaBarBottom = 170;
  const spawnY = karmaBarBottom;
  trainCars.forEach((car, idx) => {
    car.setPosition(TRACK_CENTER_X, spawnY - idx * (CAR_H + CAR_GAP));
    car.setAngle(0);
    car.setVisible(true);
  });
  if (approachTween) { approachTween.destroy(); approachTween = null; }
  approachTween = scene.tweens.add({
    targets: trainCars,
    y: `+=${FORK_Y - LOCO_H - spawnY}`,
    duration: totalMs,
    ease: 'Linear',
  });

  // High-frequency timer (50ms) for smooth ring + x.xx display
  countdownTimer = scene.time.addEvent({
    delay: 50,
    loop: true,
    callback: () => {
      elapsedMs += 50;
      const remaining = Math.max(0, totalMs - elapsedMs);
      const fraction = remaining / totalMs;

      drawCountdownRing(fraction);
      countdownText.setText((remaining / 1000).toFixed(2));

      // Tick on each whole-second crossing
      const currentSec = Math.ceil(remaining / 1000);
      if (currentSec < lastTickSecond && currentSec > 0) {
        lastTickSecond = currentSec;
        sfxCountdownTick(currentSec);
      }

      if (remaining <= 0) {
        countdownText.setText('0.00');
        stopCountdown();
        setSwitch(state.switchDir);
      }
    },
  });
}

function stopCountdown(): void {
  if (countdownTimer) { countdownTimer.destroy(); countdownTimer = null; }
  if (approachTween)  { approachTween.destroy();  approachTween  = null; }
  countdownGfx.clear();
  countdownText.setVisible(false);
}

function drawCountdownRing(fraction: number): void {
  countdownGfx.clear();
  const cx = LEVER_CX, cy = LEVER_Y - HANDLE_LEN - 48, r = 36;
  countdownGfx.lineStyle(8, 0x334455, 1);
  countdownGfx.strokeCircle(cx, cy, r);
  const col = fraction > 0.5 ? 0x44ff88 : fraction > 0.25 ? 0xffcc00 : 0xff3333;
  countdownGfx.lineStyle(8, col, 1);
  countdownGfx.beginPath();
  countdownGfx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction, false);
  countdownGfx.strokePath();
}

function setSwitch(dir: SwitchDir): void {
  if (state.phase !== 'choosing') return;
  sfxLeverClunk();
  state.switchDir = dir;
  drawTrack(trackGfx, dir);
  drawLeverHandle(dir);
  if (starLeft)  { starLeft.destroy();  starLeft  = null; }
  if (starRight) { starRight.destroy(); starRight = null; }

  // Capture current car positions before stopping the approach tween
  const currentYs = trainCars.map(c => c.y);
  stopCountdown(); // kills approachTween

  stopTrackPulse();
  (btnLeft  as unknown as Phaser.GameObjects.Rectangle).disableInteractive();
  (btnRight as unknown as Phaser.GameObjects.Rectangle).disableInteractive();
  state.phase = 'animating';
  scene.time.delayedCall(120, () => startTrainFromPositions(currentYs));
}

function updateButtonHighlights(): void { /* replaced by hover system */ }

// ─── Train Animation ──────────────────────────────────────────────────────────

/** Called on confirm: continue each car from its current Y toward FORK_Y. */
function startTrainFromPositions(currentYs: number[]): void {
  const APPROACH_SPAWN_Y = 170; // must match startCountdown spawn
  const totalStemDist = FORK_Y - APPROACH_SPAWN_Y;
  trainCars.forEach((car, idx) => {
    const fromY = currentYs[idx] ?? car.y;
    const remaining = FORK_Y - fromY;
    // Duration proportional to remaining distance (keeps same speed as approach)
    const stemMs = Math.max(80, (remaining / totalStemDist) * TRAIN_SPEED_MS);
    car.setPosition(TRACK_CENTER_X, fromY);
    car.setAngle(0);
    car.setVisible(true);

    // Phase 1 continuation
    scene.tweens.add({
      targets: car,
      y: FORK_Y,
      duration: stemMs,
      ease: 'Linear',
      delay: idx * CAR_TRAIL_MS,
      onComplete: () => runBranchPhases(car, idx === 0),
    });
  });
}

function startTrain(): void {
  const spawnY = TRACK_TOP_Y - LOCO_H;
  trainCars.forEach((car, idx) => {
    car.setPosition(TRACK_CENTER_X, spawnY);
    car.setAngle(0);
    car.setVisible(true);
    scene.tweens.add({
      targets: car,
      y: FORK_Y,
      duration: TRAIN_SPEED_MS,
      ease: 'Linear',
      delay: idx * CAR_TRAIL_MS,
      onComplete: () => runBranchPhases(car, idx === 0),
    });
  });
}

/** Phases 2 + 3. isLoco=true fires scheduleEntityKarma after Phase 2 completes. */
function runBranchPhases(car: Phaser.GameObjects.Container, isLoco: boolean): void {
  const targetX = state.switchDir === 'left' ? LEFT_FORK_X : RIGHT_FORK_X;
  const curve = makeForkCurve(targetX);
  const progress = { t: 0 };
  scene.tweens.add({
    targets: progress,
    t: 1,
    duration: TRAIN_BRANCH_MS,
    ease: 'Linear',
    onUpdate: () => {
      const pt  = curve.getPoint(progress.t);
      const tan = curve.getTangent(progress.t);
      car.setPosition(pt.x, pt.y);
      car.setAngle(-Math.atan2(tan.x, tan.y) * (180 / Math.PI));
    },
    onComplete: () => {
      car.setAngle(0);
      if (isLoco) scheduleEntityKarma(); // fire exactly when loco exits the curve
      scene.tweens.add({
        targets: car,
        x: targetX,
        y: TRACK_BOTTOM_Y + LOCO_H,
        angle: 0,
        duration: TRAIN_CONTINUE_MS,
        ease: 'Linear',
        onComplete: () => { car.setVisible(false); },
      });
    },
  });
}

function scheduleEntityKarma(): void {
  if (!state.scenario) return;
  const dir = state.switchDir;
  const killed = dir === 'left' ? state.scenario.left  : state.scenario.right;
  const spared = dir === 'left' ? state.scenario.right : state.scenario.left;
  const killedX = dir === 'left' ? LEFT_FORK_X : RIGHT_FORK_X;
  const sparedX = dir === 'left' ? RIGHT_FORK_X : LEFT_FORK_X;

  const totalTravel = TRACK_BOTTOM_Y + LOCO_H - FORK_END_Y;
  let totalDelta = 0;

  // For each entity on the KILLED track, schedule float when train reaches its Y
  killed.forEach((e, i) => {
    const entityY = ENTITY_ZONE_Y + i * ENTITY_SPACING;
    const travelFraction = Math.max(0, (entityY - FORK_END_Y) / totalTravel);
    const delay = travelFraction * TRAIN_CONTINUE_MS;
    const karmaChange = -e.karma; // killing good = negative, killing evil = positive
    totalDelta += karmaChange;
    scene.time.delayedCall(delay, () => {
      sfxBodyImpact();
      scene.time.delayedCall(40, sfxDeathScream); // slight offset so thud hits first
      spawnFloatNumber(killedX, entityY, karmaChange, true);
      spawnBloodSplat(killedX, entityY);
      // Fade out killed entity
      const killedTexts = dir === 'left' ? leftEntityTexts : rightEntityTexts;
      // Each entity occupies 3 slots: sprite, nameText, bg (indices i*3, i*3+1, i*3+2)
      const base = i * 3;
      [killedTexts[base], killedTexts[base + 1], killedTexts[base + 2]].forEach(t => {
        if (t) scene.tweens.add({ targets: t, alpha: 0, duration: 300 });
      });
    });
  });

  // For each entity on the SPARED track, schedule float + survivor reaction
  spared.forEach((e, i) => {
    const entityY = ENTITY_ZONE_Y + i * ENTITY_SPACING;
    const delay = 100 + i * 180;
    const karmaChange = e.karma;
    totalDelta += karmaChange;
    scene.time.delayedCall(delay, () => {
      spawnFloatNumber(sparedX, entityY, karmaChange, false);
      // Retrieve sprite from the spared entity texts array
      const sparedTexts = dir === 'left' ? rightEntityTexts : leftEntityTexts;
      const sprite = sparedTexts[i * 3] as unknown as Phaser.GameObjects.Image;
      spawnSurvivorReaction(e, sprite, sparedX, entityY);
    });
  });

  // After train fully exits, update karma bar and show result
  scene.time.delayedCall(TRAIN_CONTINUE_MS, () => {
    state.alignment = Phaser.Math.Clamp(state.alignment + totalDelta, KARMA_MIN, KARMA_MAX);
    redrawKarmaBar();
    showResultBanner(totalDelta);
    showContinueButton();
    state.phase = 'result';
  });
}

// ─── Floating Karma Numbers ───────────────────────────────────────────────────

function spawnFloatNumber(x: number, y: number, value: number, isKill: boolean): void {
  const sign = value > 0 ? '+' : (value === 0 ? '+' : '');
  // value===0 uses neutral colour regardless of kill/spare
  // Spared entities: gold for gaining good karma, grey for gaining nothing useful
  let color: string;
  if (value === 0) {
    color = '#aaaaaa'; // neutral grey for zero-karma entities
  } else if (isKill) {
    color = value < 0 ? '#ff4444' : '#ffd700'; // killed good = red loss; killed evil = gold gain
  } else {
    color = value > 0 ? '#ffd700' : '#ff4444'; // spared good = gold; spared evil = red penalty
  }

  const txt = scene.add.text(x, y, `${sign}${value}`, {
    fontSize: '38px',
    fontFamily: 'Arial Black',
    color,
    stroke: '#000000',
    strokeThickness: 5,
  }).setOrigin(0.5).setDepth(55);

  // Float up to resting position and stay
  scene.tweens.add({
    targets: txt,
    y: y - 90,
    scaleX: 1.3,
    scaleY: 1.3,
    duration: 500,
    ease: 'Back.Out',
  });

  floatNumberTexts.push(txt);
}

// ─── Blood Splat ──────────────────────────────────────────────────────────────

const BLOOD_COLORS = [0xcc0000, 0xaa0000, 0xff1111, 0x880000, 0xdd1111, 0xbb0000];
const BONE_COLORS  = [0xeeeecc, 0xddddbb, 0xffffff];

function spawnBloodSplat(x: number, y: number): void {

  // ── 1. Red screen flash ─────────────────────────────────────────────────
  const flash = scene.add.graphics().setDepth(90);
  flash.fillStyle(0xff0000, 0.28);
  flash.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  scene.tweens.add({
    targets: flash, alpha: 0, duration: 220, ease: 'Power2',
    onComplete: () => flash.destroy(),
  });

  // ── 2. Persistent blood pool (stays until next round) ────────────────────
  const pool = scene.add.graphics().setDepth(6);
  // Main dark pool
  pool.fillStyle(0x770000, 0.92);
  pool.fillEllipse(x, y, 90, 44);
  // Jagged splatter outline — irregular polygon
  pool.fillStyle(0x990000, 0.8);
  const pts: { x: number; y: number }[] = [];
  const BLOB_COUNT = 14;
  for (let i = 0; i < BLOB_COUNT; i++) {
    const a = (Math.PI * 2 * i) / BLOB_COUNT;
    const r = 46 + (Math.random() - 0.5) * 30;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.5 });
  }
  pool.fillPoints(pts, true, true);
  // Tiny satellite drops around the pool
  pool.fillStyle(0xaa0000, 0.9);
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 50 + Math.random() * 40;
    const sr = 3 + Math.random() * 8;
    pool.fillEllipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, sr * 2, sr);
  }
  floatNumberTexts.push(pool as unknown as Phaser.GameObjects.Text);

  // ── 3. Blood droplets with lofted arcs ────────────────────────────────
  const DROP_COUNT = 38;
  for (let i = 0; i < DROP_COUNT; i++) {
    const angle   = (Math.PI * 2 * i) / DROP_COUNT + (Math.random() - 0.5) * 1.1;
    const speed   = 60 + Math.random() * 160;
    const loft    = -(30 + Math.random() * 90);  // upward arc
    const w       = 3 + Math.random() * 12;
    const h       = 2 + Math.random() * 6;
    const color   = BLOOD_COLORS[Math.floor(Math.random() * BLOOD_COLORS.length)];
    const dur     = 400 + Math.random() * 500;

    const drop = scene.add.graphics().setDepth(22);
    drop.fillStyle(color, 1);
    // Elongated ellipse aligned to travel direction
    drop.fillEllipse(0, 0, w * 2, h * 2);
    drop.setPosition(x, y);
    drop.setRotation(angle + Math.PI / 2);

    const tx = x + Math.cos(angle) * speed;
    const ty = y + Math.sin(angle) * speed;

    // Phase 1: arc up & out
    scene.tweens.add({
      targets: drop,
      x: x + Math.cos(angle) * speed * 0.5,
      y: y + Math.sin(angle) * speed * 0.5 + loft,
      duration: dur * 0.4,
      ease: 'Power1',
      onComplete: () => {
        // Phase 2: fall and smear
        scene.tweens.add({
          targets: drop,
          x: tx,
          y: ty,
          scaleX: 0.3,
          scaleY: 2.2,
          alpha: 0,
          duration: dur * 0.6,
          ease: 'Power2',
          onComplete: () => drop.destroy(),
        });
      },
    });
  }

  // ── 4. Flesh chunks ──────────────────────────────────────────────────
  const CHUNKS = 6;
  for (let i = 0; i < CHUNKS; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 120;
    const size  = 8 + Math.random() * 18;
    const color = i % 3 === 0 ? 0xcc6644 : BLOOD_COLORS[i % BLOOD_COLORS.length];

    const chunk = scene.add.graphics().setDepth(23);
    chunk.fillStyle(color, 1);
    // Irregular polygon chunk
    const cpts: { x: number; y: number }[] = [];
    const CSIDES = 5 + Math.floor(Math.random() * 3);
    for (let j = 0; j < CSIDES; j++) {
      const a = (Math.PI * 2 * j) / CSIDES + Math.random() * 0.6;
      const r = size * (0.5 + Math.random() * 0.7);
      cpts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    chunk.fillPoints(cpts, true, true);
    chunk.setPosition(x, y);

    const tx = x + Math.cos(angle) * speed;
    const ty = y + Math.sin(angle) * speed;
    const spinEnd = (Math.random() - 0.5) * 540;

    scene.tweens.add({
      targets: chunk,
      x: tx,
      y: ty - 60,
      angle: spinEnd,
      duration: 350,
      ease: 'Power2',
      onComplete: () => {
        scene.tweens.add({
          targets: chunk,
          y: ty,
          alpha: 0,
          duration: 400,
          ease: 'Bounce.Out',
          onComplete: () => chunk.destroy(),
        });
      },
    });
  }

  // ── 5. Bone fragments ─────────────────────────────────────────────────
  const BONES = 5;
  for (let i = 0; i < BONES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 140;
    const color = BONE_COLORS[Math.floor(Math.random() * BONE_COLORS.length)];

    const bone = scene.add.graphics().setDepth(24);
    bone.fillStyle(color, 1);
    // Thin sliver shape
    bone.fillRect(-2, -10, 4, 20);
    bone.fillCircle(0, -10, 4);
    bone.fillCircle(0,  10, 3);
    bone.setPosition(x, y);

    const tx = x + Math.cos(angle) * speed;
    const ty = y + Math.sin(angle) * speed - 80;

    scene.tweens.add({
      targets: bone,
      x: tx,
      y: ty,
      angle: (Math.random() - 0.5) * 720,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        scene.tweens.add({
          targets: bone,
          y: ty + 80,
          alpha: 0,
          duration: 350,
          ease: 'Power1',
          onComplete: () => bone.destroy(),
        });
      },
    });
  }
}

// ─── Survivor Reactions ─────────────────────────────────────────────────────────

// Phrases keyed by karma tier. Good = grateful; Evil = gloating/profane.
const SURVIVOR_PHRASES: Record<string, string[]> = {
  // karma >= 10: deeply grateful, moved
  veryGood: [
    'Thank you!\nGod bless you!',
    'I owe you\nmy life! ♥',
    'You saved me!\nBless your soul!',
    'I\'ll never\nforget this!',
    'My hero! 😢❤️',
  ],
  // karma 1-9: relieved, thankful
  mildGood: [
    'Phew! That\nwas close!',
    'Oh thank\ngoodness!',
    'So grateful\nright now!',
    'You\'re a\nlifesaver!',
    'Lucky me! 😅',
  ],
  // karma -1 to -9: smug, callous
  mildEvil: [
    'Ha! Suckers!\nBye bye!',
    'Not my\nproblem lol',
    'Heh. Losers\ndeserved it.',
    'Better them\nthan me!',
    'I win again.\nObviously.',
  ],
  // karma -10 to -15: mean, profane
  veryEvil: [
    'HAHAHA!\nEat it, trash!',
    'Get rekt\nyou morons!',
    'Die b*tches!\nI\'m free!',
    'Yes!! F*** yeah!\nSo long!',
    'Should\'ve died\nsooner, losers.',
  ],
  // karma <= -16: pure malevolence
  extremeEvil: [
    'MAGNIFICENT.\nBlood for me!',
    'I LIVE while\nthey ROT. 😈',
    'The weak\nalways perish.',
    'FINALLY some\ngood news!',
    'Their screams\nare MUSIC. 😈',
  ],
};

function getSurvivorPhrase(karma: number): string {
  let pool: string[];
  if (karma >= 10)       pool = SURVIVOR_PHRASES.veryGood;
  else if (karma >= 1)   pool = SURVIVOR_PHRASES.mildGood;
  else if (karma >= -9)  pool = SURVIVOR_PHRASES.mildEvil;
  else if (karma >= -15) pool = SURVIVOR_PHRASES.veryEvil;
  else                   pool = SURVIVOR_PHRASES.extremeEvil;
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnSurvivorReaction(
  entity: import('./types').Entity,
  sprite: Phaser.GameObjects.Image | null,
  x: number,
  y: number,
): void {
  const isEvil = entity.karma < 0;

  // ── Jump animation on the sprite ─────────────────────────────────────────
  if (sprite && sprite.active) {
    const origY = sprite.y;
    const jumpH  = isEvil ? 28 : 22;
    const bounces = isEvil ? 3 : 4;
    scene.tweens.add({
      targets: sprite,
      y: origY - jumpH,
      duration: 140,
      ease: 'Power2',
      yoyo: true,
      repeat: bounces - 1,
    });
    // Slight horizontal wiggle for evil gloaters
    if (isEvil) {
      scene.tweens.add({
        targets: sprite,
        x: x + 8,
        duration: 80,
        ease: 'Linear',
        yoyo: true,
        repeat: 5,
      });
    }
  }

  // ── Reaction speech bubble — centred on screen to avoid overlap with karma floats
  const phrase = getSurvivorPhrase(entity.karma);
  const bubW = 200, bubH = 76, bubR = 10;
  const tailH = 14;
  const bubCX = GAME_WIDTH / 2;                         // always centred
  const bubY  = y - SPRITE_H / 2 - bubH / 2 - tailH - 4;

  // Bubble bg
  const bubBg = scene.add.graphics().setDepth(30);
  const bgColor  = isEvil ? 0x2a0a0a : 0xfffde8;
  const txtColor = isEvil ? '#ff6666' : '#111111';
  bubBg.fillStyle(bgColor, 0.96);
  bubBg.fillRoundedRect(bubCX - bubW / 2, bubY - bubH / 2, bubW, bubH, bubR);
  // Diagonal tail: base on bubble bottom edge toward sprite side, tip at sprite X
  const tailBaseX = bubCX + (x - bubCX) * 0.4; // base offset toward the sprite
  bubBg.fillTriangle(
    tailBaseX - tailH / 2, bubY + bubH / 2,
    tailBaseX + tailH / 2, bubY + bubH / 2,
    x,                     y - SPRITE_H / 2,    // tip points at top of sprite
  );
  // Border for evil bubbles
  if (isEvil) {
    bubBg.lineStyle(2, 0xcc2222, 1);
    bubBg.strokeRoundedRect(bubCX - bubW / 2, bubY - bubH / 2, bubW, bubH, bubR);
  }

  // Phrase text
  const bubTxt = scene.add.text(bubCX, bubY, phrase, {
    fontSize: '19px', fontFamily: 'Arial', color: txtColor,
    align: 'center', wordWrap: { width: bubW - 16 },
    fontStyle: isEvil ? 'bold' : 'normal',
  }).setOrigin(0.5).setDepth(31);

  // Pop-in scale tween
  bubBg.setScale(0.1); bubTxt.setScale(0.1);
  scene.tweens.add({
    targets: [bubBg, bubTxt],
    scaleX: 1, scaleY: 1,
    duration: 200, ease: 'Back.Out',
  });

  // Track for cleanup
  floatNumberTexts.push(
    bubBg  as unknown as Phaser.GameObjects.Text,
    bubTxt as unknown as Phaser.GameObjects.Text,
  );
}

// ─── Continue Button ─────────────────────────────────────────────────────────

const CONTINUE_BTN_Y = LEVER_Y - HANDLE_LEN - 130;

function showContinueButton(): void {
  if (continueBtn) { continueBtn.destroy(); continueBtn = null; }

  const w = 380, h = 90, r = 14;

  const bg = scene.make.graphics();
  // Drop shadow
  bg.fillStyle(0x000000, 0.4);
  bg.fillRoundedRect(-w / 2 + 4, -h / 2 + 5, w, h, r);
  // Main body
  bg.fillStyle(0x1a8a84, 1);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  // Dark bottom bevel
  bg.fillStyle(0x0d5550, 1);
  bg.fillRoundedRect(-w / 2, h / 2 - 12, w, 12, { bl: r, br: r, tl: 0, tr: 0 });
  // Top highlight stripe
  bg.fillStyle(0x6ef0ea, 0.55);
  bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, 10, { tl: r - 2, tr: r - 2, bl: 0, br: 0 });
  // Specular glint
  bg.fillStyle(0xffffff, 0.15);
  bg.fillEllipse(-w / 2 + 60, -h / 2 + 14, 80, 18);
  // Border
  bg.lineStyle(2, 0x4ecdc4, 0.8);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

  const txt = scene.add.text(0, -2, 'CONTINUE →', TEXT_STYLES.button)
    .setOrigin(0.5).setDepth(52);

  continueBtn = scene.add.container(GAME_WIDTH / 2, CONTINUE_BTN_Y, [bg, txt]);
  continueBtn.setSize(w, h).setDepth(51);
  continueBtn.setInteractive({ useHandCursor: true });
  continueBtn.setAlpha(0);
  continueBtn.on('pointerdown', () => {
    scene.tweens.add({
      targets: continueBtn, scaleX: 0.95, scaleY: 0.95,
      duration: 60, yoyo: true,
      onComplete: nextRound,
    });
  });

  scene.tweens.add({ targets: continueBtn, alpha: 1, duration: 250, ease: 'Power1' });
}

function hideContinueButton(): void {
  if (continueBtn) { continueBtn.destroy(); continueBtn = null; }
}

// ─── Result Banner ────────────────────────────────────────────────────────────

function createResultBanner(sc: Phaser.Scene): Phaser.GameObjects.Container {
  const w = 580, h = 150;
  const bg = sc.add.graphics();
  // SNES pixel border
  bg.fillStyle(COLORS.snes.outline, 1);
  bg.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
  bg.fillStyle(COLORS.snes.yellow, 1);
  bg.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
  bg.fillStyle(COLORS.snes.panelBg, 1);
  bg.fillRect(-w / 2, -h / 2, w, h);
  // Top accent stripe
  bg.fillStyle(COLORS.snes.red, 1);
  bg.fillRect(-w / 2, -h / 2, w, 8);

  const line1 = sc.add.text(0, -22, '', {
    fontSize: '48px', fontFamily: 'Arial Black', color: '#ffdd00',
    stroke: '#000000', strokeThickness: 6,
  }).setOrigin(0.5).setName('line1');
  const line2 = sc.add.text(0, 40, '', {
    fontSize: '30px', fontFamily: 'Arial Black', color: '#ffffff',
    stroke: '#000000', strokeThickness: 5,
  }).setOrigin(0.5).setName('line2');

  const container = sc.add.container(GAME_WIDTH / 2, FORK_Y - 80, [bg, line1, line2]);
  container.setSize(w, h);
  return container;
}

function showResultBanner(delta: number): void {
  const line1 = resultBanner.getByName('line1') as Phaser.GameObjects.Text;
  const line2 = resultBanner.getByName('line2') as Phaser.GameObjects.Text;
  const sign = delta >= 0 ? '+' : '';
  line1.setText(`${sign}${delta} Karma`);
  line1.setColor(delta >= 0 ? '#ffd700' : '#ff4444');
  line2.setText(getAlignmentLabel(state.alignment));
  line2.setColor(delta >= 0 ? '#aaffaa' : '#ffaaaa');
  resultBanner.setVisible(true).setAlpha(0);
  scene.tweens.add({
    targets: resultBanner, alpha: 1, duration: 200, ease: 'Power1',
  });
}

// ─── Round Flow ───────────────────────────────────────────────────────────────

function nextRound(): void {
  resultBanner.setVisible(false);
  hideContinueButton();
  // Destroy all pinned float number labels
  floatNumberTexts.forEach(t => t.destroy());
  floatNumberTexts = [];
  trainCars.forEach(c => { c.setVisible(false); c.setAngle(0); });
  state.round++;

  if (state.round > TOTAL_ROUNDS) {
    showGameOver();
    return;
  }

  roundText.setText(`ROUND ${state.round} / ${TOTAL_ROUNDS}`);
  state.scenario = generateScenario();
  state.switchDir = 'left';
  drawTrack(trackGfx, state.switchDir);
  drawLeverHandle('left');
  renderScenario();
  // Re-enable hover zones
  (btnLeft  as unknown as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true });
  (btnRight as unknown as Phaser.GameObjects.Rectangle).setInteractive({ useHandCursor: true });
  startCountdown();
  state.phase = 'choosing';
}

// ─── Game Over ────────────────────────────────────────────────────────────────

function showGameOver(): void {
  state.phase = 'gameover';
  stopMusic();

  // Full dark overlay
  scene.add.graphics()
    .fillStyle(COLORS.snes.darkNavy, 0.92)
    .fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    .setDepth(60);

  const align = state.alignment;
  const label = getAlignmentLabel(align);
  const color = align >= 0 ? '#ffdd00' : '#ff2244';

  // GAME OVER panel
  const panelW = 660, panelH = 540, panelX = GAME_WIDTH / 2, panelY = 820;
  const panel = scene.add.graphics().setDepth(61);
  panel.fillStyle(COLORS.snes.outline, 1);
  panel.fillRect(panelX - panelW / 2 - 6, panelY - panelH / 2 - 6, panelW + 12, panelH + 12);
  panel.fillStyle(COLORS.snes.yellow, 1);
  panel.fillRect(panelX - panelW / 2 - 3, panelY - panelH / 2 - 3, panelW + 6, panelH + 6);
  panel.fillStyle(COLORS.snes.panelBg, 1);
  panel.fillRect(panelX - panelW / 2, panelY - panelH / 2, panelW, panelH);
  // Red stripe at top
  panel.fillStyle(COLORS.snes.red, 1);
  panel.fillRect(panelX - panelW / 2, panelY - panelH / 2, panelW, 10);

  scene.add.text(GAME_WIDTH / 2, 600, 'GAME OVER', {
    fontSize: '88px', fontFamily: 'Arial Black', color: '#ff2244',
    stroke: '#000000', strokeThickness: 8,
  }).setOrigin(0.5).setDepth(62);

  scene.add.text(GAME_WIDTH / 2, 680, '- - - - - - - - - - - - - - - - -', {
    fontSize: '24px', fontFamily: 'Arial Black', color: '#ffdd00',
  }).setOrigin(0.5).setDepth(62);

  scene.add.text(GAME_WIDTH / 2, 740, 'YOUR KARMA:', {
    fontSize: '32px', fontFamily: 'Arial Black', color: '#aabbff',
    stroke: '#000000', strokeThickness: 5,
  }).setOrigin(0.5).setDepth(62);

  scene.add.text(GAME_WIDTH / 2, 820, label, {
    fontSize: '60px', fontFamily: 'Arial Black', color,
    stroke: '#000000', strokeThickness: 8,
  }).setOrigin(0.5).setDepth(62);

  scene.add.text(GAME_WIDTH / 2, 920, `SCORE: ${align > 0 ? '+' : ''}${align}`, {
    fontSize: '42px', fontFamily: 'Arial Black', color: '#ffffff',
    stroke: '#000000', strokeThickness: 6,
  }).setOrigin(0.5).setDepth(62);
  void panel;

  // Flavor text
  const flavor = getFlavorText(align);
  scene.add.text(GAME_WIDTH / 2, 1000, flavor, {
    fontSize: '26px', fontFamily: 'Arial Black', color: '#aabbff',
    stroke: '#000000', strokeThickness: 4,
    align: 'center', wordWrap: { width: 580 },
  }).setOrigin(0.5, 0).setDepth(62);

  // SNES-style PLAY AGAIN button
  const bx = GAME_WIDTH / 2, by = 1200, bw = 360, bh = 90;
  const btnBg = scene.add.graphics().setDepth(62);
  // Black border
  btnBg.fillStyle(COLORS.snes.outline, 1);
  btnBg.fillRect(bx - bw / 2 - 4, by - bh / 2 - 4, bw + 8, bh + 8);
  // Yellow border
  btnBg.fillStyle(COLORS.snes.yellow, 1);
  btnBg.fillRect(bx - bw / 2 - 2, by - bh / 2 - 2, bw + 4, bh + 4);
  // Red main body
  btnBg.fillStyle(COLORS.snes.red, 1);
  btnBg.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
  // Top shine stripe
  btnBg.fillStyle(0xffffff, 0.2);
  btnBg.fillRect(bx - bw / 2 + 2, by - bh / 2 + 2, bw - 4, 10);

  const btnTxt = scene.add.text(bx, by, 'PLAY AGAIN', {
    fontSize: '42px', fontFamily: 'Arial Black', color: '#ffdd00',
    stroke: '#000000', strokeThickness: 6,
  }).setOrigin(0.5).setDepth(63);

  const hitZone = scene.add.rectangle(bx, by, bw, bh)
    .setInteractive({ useHandCursor: true }).setDepth(64);
  hitZone.on('pointerdown', () => {
    scene.tweens.add({
      targets: [btnBg, btnTxt], scaleX: 0.95, scaleY: 0.95,
      duration: 60, yoyo: true,
      onComplete: restartGame,
    });
  });
}

function getFlavorText(align: number): string {
  if (align >= 70) return 'The universe itself bows before your radiant compassion.';
  if (align >= 40) return 'History will remember you as one of the good ones.';
  if (align >= 10) return 'You tried your best. That counts for something.';
  if (align >= -9) return 'The scales of fate remain perfectly… balanced. As all things should be.';
  if (align >= -40) return 'Some choices haunt you in the small hours of the night.';
  if (align >= -70) return 'Philosophers will debate whether you even had a soul.';
  return 'Darkness absolute. Even the void feared you.';
}

function restartGame(): void {
  state.alignment = KARMA_START;
  state.round = 1;
  state.phase = 'choosing';
  state.switchDir = 'left';
  state.scenario = null;
  scene.scene.restart();
}

// ─── Title Scene ──────────────────────────────────────────────────────────

class TitleScene extends Phaser.Scene {
  private blinkTimer: Phaser.Time.TimerEvent | null = null;
  private pressText!: Phaser.GameObjects.Text;
  constructor() { super({ key: 'TitleScene' }); }

  create(): void {
    const W = GAME_WIDTH, H = GAME_HEIGHT, cx = W / 2;

    // ── Background: top-down grass/road scene ───────────────────────
    const bg = this.add.graphics().setDepth(0);
    // Full green ground
    bg.fillStyle(0x1a6b1a, 1);
    bg.fillRect(0, 0, W, H);
    // Scanlines
    for (let sy = 0; sy < H; sy += 4) { bg.fillStyle(0x000000, 0.10); bg.fillRect(0, sy, W, 2); }
    // Track bed (dark gravel strip down centre)
    bg.fillStyle(0x2a2218, 1); bg.fillRect(cx - 48, 0, 96, H);
    // Rail ties (horizontal brown stripes)
    for (let ty = -10; ty < H + 40; ty += 32) {
      bg.fillStyle(0x6b4a20, 1); bg.fillRect(cx - 44, ty, 88, 12);
    }
    // Left & right rail lines
    bg.fillStyle(0xaaaaaa, 1);
    bg.fillRect(cx - 36, 0, 8, H);
    bg.fillRect(cx + 28, 0, 8, H);
    // Grass detail: dirt patches
    const dc = [0x4a3018, 0x3d2810, 0x5c3d1e];
    for (let i = 0; i < 30; i++) {
      const dpx = ((i * 197) % (W - 120)) + 20;
      const dpy = ((i * 311) % H);
      if (dpx > cx + 80 || dpx + 40 < cx - 80) {
        bg.fillStyle(dc[i % 3], 0.5); bg.fillEllipse(dpx, dpy, 30 + (i % 3) * 14, 12 + (i % 2) * 6);
      }
    }

    // ── Dark overlay panel behind title text (keeps art from bleeding through) ──
    const titleMask = this.add.graphics().setDepth(9);
    titleMask.fillStyle(0x000000, 0.60);
    titleMask.fillRect(0, 0, W, 520);

    // ── Animated top-down train + people ───────────────────────────
    spawnTitleTopDownScene(this, cx);

    // ── Title treatment ──────────────────────────────────────────
    // Glow rect behind title
    this.add.graphics().setDepth(9).fillStyle(0xff0000, 0.14).fillRect(0, 148, W, 130);

    // TINDER — drop shadow
    this.add.text(cx + 5, 168, 'TINDER', {
      fontSize: '118px', fontFamily: 'Arial Black', color: '#330000',
      stroke: '#330000', strokeThickness: 18,
    }).setOrigin(0.5, 0).setDepth(10);
    // TINDER — main
    this.add.text(cx, 163, 'TINDER', {
      fontSize: '118px', fontFamily: 'Arial Black', color: '#ff2244',
      stroke: '#000000', strokeThickness: 10,
    }).setOrigin(0.5, 0).setDepth(11);
    // TINDER — glint
    this.add.text(cx, 161, 'TINDER', {
      fontSize: '118px', fontFamily: 'Arial Black', color: '#ffdd00',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setAlpha(0.35).setDepth(12);

    // 'with'
    this.add.text(cx, 286, 'w  i  t  h', {
      fontSize: '42px', fontFamily: 'Arial Black', fontStyle: 'italic',
      color: '#ffffff', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5, 0).setDepth(11);

    // TRAINS — shadow
    this.add.text(cx + 5, 334, 'TRAINS', {
      fontSize: '104px', fontFamily: 'Arial Black', color: '#003333',
      stroke: '#003333', strokeThickness: 16,
    }).setOrigin(0.5, 0).setDepth(10);
    // TRAINS — main
    this.add.text(cx, 330, 'TRAINS', {
      fontSize: '104px', fontFamily: 'Arial Black', color: '#00ffcc',
      stroke: '#000000', strokeThickness: 9,
    }).setOrigin(0.5, 0).setDepth(11);

    // Tagline
    this.add.text(cx, 454, '★  THE MORAL DILEMMA EXPERIENCE  ★', {
      fontSize: '21px', fontFamily: 'Arial Black', color: '#ffdd00',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(12);
    this.add.text(cx, 490, '\u00a9 1994  TROLLEY SOFT', {
      fontSize: '19px', fontFamily: 'Arial Black', color: '#8899cc',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(12);

    // PRESS START
    this.pressText = this.add.text(cx, H - 220, 'PRESS START', {
      fontSize: '50px', fontFamily: 'Arial Black', color: '#ffffff',
      stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(15);
    this.blinkTimer = this.time.addEvent({
      delay: 500, loop: true,
      callback: () => { this.pressText.setVisible(!this.pressText.visible); },
    });

    // Instruction strip
    const strip = this.add.graphics().setDepth(14);
    strip.fillStyle(COLORS.snes.panelBg, 1);
    strip.fillRect(0, H - 170, W, 80);
    strip.fillStyle(COLORS.snes.yellow, 1);
    strip.fillRect(0, H - 170, W, 5);
    strip.fillRect(0, H - 95, W, 5);
    this.add.text(cx, H - 132, 'HOVER  ◄►  CLICK TO DECIDE  •  5 SECONDS', {
      fontSize: '22px', fontFamily: 'Arial Black', color: '#aabbff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(15);

    this.input.once('pointerdown', () => this.startGame());
    this.input.keyboard?.once('keydown', () => this.startGame());

    // Slide-in tween for text objects
    (this.children.list.filter(o => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text[])
      .forEach((t, i) => {
        const ox = t.x; t.setX(ox - 900);
        this.tweens.add({ targets: t, x: ox, duration: 350 + i * 22, ease: 'Back.Out', delay: 80 });
      });
  }

  private startGame(): void {
    if (this.blinkTimer) this.blinkTimer.destroy();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.time.delayedCall(300, () => this.scene.start('GameScene'));
  }
}

// ─── Top-down GTA2-style title animation ───────────────────────────────────────────

// Draws a top-down person as a small coloured circle + limb stubs
function makeTitlePerson(
  sc: Phaser.Scene, x: number, y: number,
  skin: number, shirt: number,
): Phaser.GameObjects.Container {
  const g = sc.add.graphics();
  // Shadow
  g.fillStyle(0x000000, 0.3); g.fillEllipse(2, 2, 22, 14);
  // Body (top-down oval)
  g.fillStyle(shirt, 1); g.fillEllipse(0, 0, 20, 26);
  // Head (circle at top)
  g.fillStyle(skin, 1); g.fillCircle(0, -10, 9);
  // Arms (left/right stubs)
  g.fillStyle(skin, 1);
  g.fillEllipse(-12, -2, 8, 14);
  g.fillEllipse( 12, -2, 8, 14);
  const c = sc.add.container(x, y, [g]);
  c.setDepth(3);
  return c;
}

// Draws a top-down train car as a rectangle container
function makeTitleTrainCar(
  sc: Phaser.Scene, x: number, y: number,
  isLoco: boolean,
): Phaser.GameObjects.Container {
  const w = isLoco ? 72 : 68, h = isLoco ? 130 : 110;
  const g = sc.add.graphics();
  // Shadow
  g.fillStyle(0x000000, 0.4); g.fillRect(-w/2 + 4, -h/2 + 5, w, h);
  // Body
  g.fillStyle(isLoco ? 0xdd1100 : 0xaa1100, 1);
  g.fillRoundedRect(-w/2, -h/2, w, h, 6);
  // Roof detail (lighter centre stripe)
  g.fillStyle(0xffffff, 0.12); g.fillRect(-w/2 + 10, -h/2 + 8, w - 20, h - 16);
  // Windows (two side strips)
  g.fillStyle(0x99eeff, 0.85);
  g.fillRect(-w/2 + 4, -h/2 + 18, 10, h - 36);
  g.fillRect( w/2 - 14, -h/2 + 18, 10, h - 36);
  if (isLoco) {
    // Loco headlight at front (top)
    g.fillStyle(0xffffaa, 1); g.fillCircle(0, -h/2 + 10, 8);
    // Cowcatcher at front
    g.fillStyle(0x555555, 1);
    g.fillRect(-w/2 - 6, -h/2 - 8, w + 12, 8);
    // Warning stripes
    for (let s = 0; s < 4; s++) {
      g.fillStyle(s % 2 === 0 ? 0xffdd00 : 0x000000, 1);
      g.fillRect(-w/2 + s * (w/4), -h/2, w/4, 10);
    }
  }
  // Border
  g.lineStyle(3, 0x000000, 0.8); g.strokeRoundedRect(-w/2, -h/2, w, h, 6);
  const c = sc.add.container(x, y, [g]);
  c.setDepth(5);
  return c;
}

function spawnTitleTopDownScene(sc: Phaser.Scene, cx: number): void {
  const H = GAME_HEIGHT;
  const ART_TOP = 530;    // just below title text
  const ART_BOT = H - 200; // just above PRESS START
  const SPEED = 320;       // px per second train scroll speed
  const TOTAL_CAR_H = 130 + 2 * (110 + 14); // loco + 2 cars + gaps

  // ── People scattered on both sides of the track, avoiding track zone ──
  const SKINS  = [0xffcc99, 0xd48a5a, 0x8b5e3c, 0xffddbb, 0xcc9966];
  const SHIRTS = [0x2244cc, 0xff4400, 0x22aa44, 0x9922cc, 0xffdd00, 0xee2211, 0x0088cc];

  // Create 14 people: 7 left of track, 7 right
  const people: Phaser.GameObjects.Container[] = [];
  for (let i = 0; i < 14; i++) {
    const side   = i < 7 ? -1 : 1;
    const px     = cx + side * (70 + (i % 7) * 34 + ((i * 53) % 28));
    const py     = ART_TOP + 60 + (i * 137) % (ART_BOT - ART_TOP - 120);
    const skin   = SKINS[i % SKINS.length];
    const shirt  = SHIRTS[i % SHIRTS.length];
    people.push(makeTitlePerson(sc, px, py, skin, shirt));
  }

  // ── Train: loco + 2 cars stacked, scrolling downward, looping ───────
  const loco  = makeTitleTrainCar(sc, cx, ART_TOP - 20, true);
  const car1  = makeTitleTrainCar(sc, cx, ART_TOP - 20 - 144, false);
  const car2  = makeTitleTrainCar(sc, cx, ART_TOP - 20 - 144 * 2, false);
  const trainCarsTitle = [loco, car1, car2];

  // Speed line container (redrawn each loop)
  const speedLines = sc.add.graphics().setDepth(6);

  // ── Scroll loop: move train down, wrap, trigger hit effects ──────────
  // Track which people have been "hit" this pass to avoid double-firing
  const hitThisPass = new Set<number>();
  let passCount = 0;

  sc.time.addEvent({
    delay: 16, loop: true,
    callback: () => {
      const dt = 16 / 1000;
      const dy = SPEED * dt;

      // Move each car down
      trainCarsTitle.forEach(car => { car.y += dy; });

      // Redraw speed lines along the track edges
      speedLines.clear();
      const frontY = loco.y - 65; // front of loco
      for (let s = 0; s < 6; s++) {
        const lx = cx - 36 - 2 - s * 3;
        const rx = cx + 28 + 2 + s * 3;
        const ll = 28 + s * 10;
        speedLines.lineStyle(2 - s * 0.2, 0xffffff, 0.25 - s * 0.04);
        speedLines.lineBetween(lx, frontY, lx, frontY - ll);
        speedLines.lineBetween(rx, frontY, rx, frontY - ll);
      }

      // Wrap: when loco passes ART_BOT, reset all cars to above ART_TOP
      if (loco.y > ART_BOT + 80) {
        loco.y = ART_TOP - 20;
        car1.y = ART_TOP - 20 - 144;
        car2.y = ART_TOP - 20 - 144 * 2;
        hitThisPass.clear();
        passCount++;
      }

      // ── Hit detection: check each person against the loco front ──────
      people.forEach((person, idx) => {
        if (hitThisPass.has(idx)) return;
        const px = person.x, py = person.y;
        const locoFront = loco.y - 65;
        const locoBack  = loco.y + 65;
        const inTrackX  = px > cx - 42 && px < cx + 42;
        const inTrackY  = py > locoFront && py < locoBack;
        if (inTrackX && inTrackY) {
          hitThisPass.add(idx);
          titlePersonHit(sc, person, idx, people, cx, ART_TOP, ART_BOT, SKINS, SHIRTS);
        }
      });
    },
  });
}

function titlePersonHit(
  sc: Phaser.Scene,
  person: Phaser.GameObjects.Container,
  idx: number,
  people: Phaser.GameObjects.Container[],
  cx: number, artTop: number, artBot: number,
  skins: readonly number[], shirts: readonly number[],
): void {
  // Fly sideways + shrink
  const flyDir = person.x < cx ? -1 : 1;
  sc.tweens.add({
    targets: person,
    x: person.x + flyDir * (60 + Math.random() * 80),
    y: person.y + (Math.random() - 0.5) * 50,
    scaleX: 0.3, scaleY: 0.3,
    angle: flyDir * (180 + Math.random() * 360),
    duration: 350, ease: 'Power2',
    onComplete: () => {
      // Blood splat at impact position
      const splat = sc.add.graphics().setDepth(2);
      splat.fillStyle(0xaa0000, 0.85);
      splat.fillEllipse(people[idx].x - flyDir * 50, people[idx].y, 28, 14);
      // Small drops
      for (let d = 0; d < 5; d++) {
        const da = Math.random() * Math.PI * 2;
        const dr = 14 + Math.random() * 22;
        splat.fillStyle(0xcc0000, 0.7);
        splat.fillCircle(
          people[idx].x - flyDir * 50 + Math.cos(da) * dr,
          people[idx].y + Math.sin(da) * dr * 0.5,
          3 + Math.random() * 4
        );
      }
      sc.tweens.add({ targets: splat, alpha: 0, duration: 2000, delay: 1500,
        onComplete: () => splat.destroy() });

      // Respawn person off to the side after a pause
      sc.time.delayedCall(1200 + Math.random() * 800, () => {
        const side   = idx < 7 ? -1 : 1;
        const newX   = cx + side * (70 + (idx % 7) * 34 + ((idx * 53) % 28));
        const newY   = artTop + 60 + (idx * 137) % (artBot - artTop - 120);
        people[idx].setPosition(newX + side * 120, newY);
        people[idx].setScale(1); people[idx].setAngle(0); people[idx].setAlpha(0);
        // Walk back in from the side
        sc.tweens.add({
          targets: people[idx],
          x: newX, alpha: 1,
          duration: 800, ease: 'Power1',
        });
      });
    },
  });
}

// ─── Game Scene ─────────────────────────────────────────────────────────────────

class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }
  create(): void { create.call(this); }
  update(): void { update.call(this); }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

const config = createGameConfig();
config.scene = [TitleScene, GameScene];
new Phaser.Game(config);

