# Camp Chonkimal — Game Summary (Hackathon Pitch Brief)

> **Purpose of this doc:** A complete, factual inventory of what's built in the game, written so another AI (or a human) can draft pitch decks, trailers, one-pagers, and talking points. Everything below exists in the current build unless it's marked as a caveat.

---

## 1. The Elevator Pitch (raw material)

**Camp Chonkimal** is a cozy, social, mobile-first 3D summer camp game. You play as a chubby animal (a "chonk") at **Camp Chonkton**, a handcrafted camp valley with a lake, a river, a beach, and a mountain. You hang out, ride ziplines, fly hang gliders, play party minigames, take on friends in board games, dress up your chonk, decorate your tent, join a scout troop, and collect merit badges.

- **Tone:** A cozy arts-and-crafts summer camp look (clay and felt textures) with Gen-Z "brainrot" meme humor mixed in (Skibidi, Rizz, Sigma, Fanum Tax, "67", aura).
- **Platform:** Mobile portrait (9:19.5), runs in the browser. Built with three.js and Rapier physics in TypeScript.
- **Genre mix:** Social hub (Animal Crossing / Club Penguin energy), party minigames (Fall Guys / Stumble Guys), live-ops meta (battle pass, gacha, dailies, achievements), and Zynga "With Friends" board games.
- **Currencies:** **Pony Beads** (soft) and **Golden Pinecones** (premium).
- **Scale of the hackathon build:** about 46k lines of TypeScript across about 177 source files and 98 commits. It includes 6 minigames/activities, 2 board games, 2 rides, and 8+ interlocking meta systems.

**Possible taglines** (drafts):
- "Summer camp never ends."
- "Get chonky. Get camping."
- "Camp is in session."

---

## 2. The World — Camp Chonkton

The world is built from modular 24×24 m level pieces joined into one continuous hub: camp base → slopes → switchback → fork → hang-glider launch.

**Landmarks and areas**
- **Arrival:** torii gate entrance, spawn plaza, a big cherry blossom tree, north gate.
- **Water:** lake with a dock, a river running through camp, a waterfall pool, and a beach.
- **Social spots:** campfire circle (animated log teepee with layered flames, embers, sparks, smoke, and flicker light), hub porch, cabins yard.
- **Services:**
  - The Canteen, a snack-shack store.
  - The Bulletin Board.
  - The Mailbox, whose red flag goes up when you have mail.
  - Troop HQ tent.
  - Photo Booth.
- **Tent sites:** Campfire Circle, Beach Picnic, and Trailhead Meadow. Your personal tent lives at one of them.
- **Minigame venues:** Dodge Ball court, Sumo ring, River Log Course, Lunch Delivery route, and tabletop game spots.
- **The mountain:** a switchback climb up to a fork with a zipline deck (the line runs down to a beach tower), and a steep branch up to a hang-glider launch.
- **Horizon:** a snow-capped hero mountain that always frames the view.

**Ambient life and polish**
- Animated water shaders with waterfalls and swim ripples.
- Storybook cumulus clouds (inspired by Animal Crossing and Mario Wonder).
- Circling bird flocks.
- Butterflies that land on flowers and scatter when you walk close.
- Drifting pollen and dandelion fluff.
- Swaying grass and flowers.

---

## 3. Characters

**Playable species (chonks)**
- Frog, Kangaroo, Chicken, and Dog.
- The Dog model has 12 skins: Cheetah, Tiger, Raccoon, Black & White Dog, Brown Bear, Grey Cat, Fox, Grey Wolf Dog, Jindo, German Shepherd, Shiba, and Tuxedo.
- Named chonks in the shop include Froggo, Joey, Doggo, Little, Garbo, and Yogi.
- There are 15 illustrated chonk portraits. Several more are marked "coming soon" (e.g., George, Chippy, Peppy, Hedgehog, Goat).
- Legendary gacha characters: George, Chippy, Peppy, Prickles, and Gruff.
- Every character model has 3 levels of detail (LOD) for mobile performance.

**NPC counselors** (all bears, 1.5× camper size, gold nameplates, and they turn to greet you)
- **Counselor Chonk** is the first-time-user-experience (FTUE) guide: "Welcome to Camp Chonkton… Explore, play and socialize with friends."
- **Counselor Crumbs** runs the Canteen: "Snacks, gear & Care Packages! 📦"
- **Scoutmaster Tubbs** runs Troop HQ: "Join a scout troop! ⛺"
- **Counselor Zippy** runs the zipline: "Want to ride? 🪂"
- **Counselor Swoop** runs the glider: "Ready to fly? 🪁"
- **Mr Kodak** is the camp photographer.

**A living camp of 51 simulated campers**
- Meme usernames, for example SkibidiBear67, RizzlyBear, Afk_InTheLake, StealsYourBeads, Smore_Enjoyer, CampCounselor_No, Mums_Credit_Card, and ProfessionalGriefer (who camps the log course start).
- Each bot has a fixed troop, a look, and a personality: walk and run speed, how often it hops, how long it lingers, favorite spots, and how aggressive it is.
- Bots wander to places based on interest and how crowded they are. They also ride the zipline and glider, play minigames, kick balls around, start board games, and challenge you.
- Bots chat with delays that feel like typing. They hype wins, get salty when bumped, roast splashes, and start "toy battles."
- MMO-style floating nameplates show troop tags, e.g. `<Poop Troop>`.

---

## 4. Social and Communication

- **Quick chat** is safe by design: there's no free text. You equip canned phrases from 9 categories: Hype, Accuse, Fail, Team, Chaos, Roast, Cheer, Bet, and Chill.
  - Samples: "GOATED 🐐🔥", "Peak Chonk! 🏔️✨", "Stealing your beads 😈📿", "Fanum Taxed! 🍔💸", "BANNED FROM CAMP 🚫⛺", "AFK for s'mores 🪵🍫"
- **Speech bubbles** are proximity-based (only nearby players see them) and spam-limited.
- **Emotes** float over your character. They're always available and work during minigames too, so you can trash-talk.
- **Toys** play sound effects with a big, enthusiastic performance animation. Examples: kazoo, rubber chicken, goose honker, whoopee cushion, and dial-up walkie.
- **One-thumb action arc:** a big Jump button in the corner, with Chat, Emote and Toy buttons on an even quarter-circle around it.
- **Spectating:** people who are knocked out or just walking by can watch matches live. The camp crowd walks over to watch sumo.
- **Scout Troops** (see Meta).

---

## 5. Minigames and Activities

Every minigame uses walk-up gates. When you get close, a "Play <mode>" button appears, followed by a quick tutorial card and then Ready. A "✕ Leave" pill with a confirm dialog lets you exit anytime. Each venue also runs an AI-only "attract match" when no one is playing, so there's always something to watch.

### 🏐 Dodge Ball (4v4)
- Blue team vs Red team on the camp court. There are 3 balls on the center line at the start.
- **One-button controls:**
  - Tap to throw straight.
  - Press and flick to aim (up to about 60°, with aim assist).
  - With no ball, the button becomes CATCH (a 0.45 s window). A good catch knocks out the thrower.
- Throw speed and homing ramp up over the match.
- **Juice:** players who get hit ragdoll (backflip, bounce, lie flat), and there are ball trails, screen shake, dust puffs, "ya!" throw sounds, a parry clang, and a whistle.
- Knocked-out players walk to the bench and the camera switches to spectating.

### 🪵 River Log Course (Frogger-style race)
- Hop across 5 lanes of drifting logs to reach the far bridge.
- Tap to hop and swipe to change lanes.
- Big gaps force lane changes, and logs sink as they go under the bridges.
- **Spring pads** fling you 4–13 spots ahead.
- **Bumping:** landing on someone shoves them, and shoves can chain. Players get knocked into the river or onto the bank, and each bump plays a fart sound.
- If you splash, a modal asks you to Retry or Give Up (you swim to the bank).
- Bots play it like humans would, with reaction delays, misjudged hops, and griefing.

### 🤼 Sumo (5-chonk free-for-all)
- Last chonk in the ring wins.
- **Slingshot controls:** pull back to aim and release to charge. A rubber band and a 3D arrow show your aim, and the arrow turns red if the launch would take you out of the ring. You can re-launch mid-slide to recover.
- Knockback escalates over time (up to 4×), so matches don't stall.
- 0–3 random obstacles per match: logs, picnic tables, and rocks.
- **Power-ups:**
  - **Bomb** blasts everyone nearby.
  - **Spicy Pepper** puts you "on fire" for 8 s with 1.9× harder bumps.
- A kabuki taiko countdown speeds up into GO.
- Speed trails, booms, and punches. Knocked-out chonks watch from the ring edge and cheer with emotes.

### 🥪 Lunch Delivery (4–6 player co-op escort)
- Escort the lunch cart from the Camp Hub over the bridge and down the cliff ramp to the beach picnic. A run takes about 2.5 minutes.
- The cart only moves when a player is near it. It stops for bugs, debris, and maggots.
- **Bug enemies:**
  - Ant swarms.
  - Wasps that hunt players.
  - Flies that go for the food.
  - Path-blocking maggots.
- **Weapons:**
  - Fly Swatter (melee, unlimited).
  - Bug Spray (cone).
  - Water Gun (auto-aim).
- Lunch % is the team's health. There are checkpoint respawns at 20/40/60/80%.
- Players who get knocked out become **sobbing ghosts** with halos that float up to heaven, with a crying sound.
- After a win, the lunch stays on the picnic tables for 2 minutes and campers gather to eat.
- AI crews start runs on their own, and you can join mid-run.

### 🎲 Tabletop: Words With Friends and Dice With Friends
Real Zynga "With Friends" games, played in the 3D world. They're a natural brand tie-in.
- You start a game by using a **board game toy** from your inventory. The board tips out onto the ground, a nearby camper runs over, and the camera zooms in.
- **Anyone can spectate** on the physical board.
- Bots challenge each other, or they set up near you and call out "Hey!" If you ignore them, they give up after 32 s ("nvm 😔").
- **Words With Friends:**
  - 11×11 board with real WWF tile values and a 35-point bingo.
  - Bots search a dictionary of about 190k words for plays and have variable skill.
- **Dice With Friends:**
  - Standard Yahtzee rules with dice that physically tumble in a felt tray and a paper scorecard.
  - Bots evaluate all 32 ways to hold the dice.
- **Banter lines:** "TRIPLE WORD 😤", "BINGO!!! 🎉", "YAHTZEE!!! 🎲🎉", "rage quit?? 😭"

### 🪂 Zipline and 🪁 Hang Glider (rides)
- **Zipline:** runs from the mountain fork down to the beach. The rider swings, and top speed is 25.
- **Hang Glider:**
  - Launches from the summit ramp and soars over camp to the cabins.
  - Steer left and right, dive to go faster, or flare to float. The wing banks as you turn.
  - A gentle pull guides you toward the landing zone.
- Bots ride both.

### ⚽ Camp Balls
- A beach ball and a soccer ball you kick by running into them.
- Bots pass them around.
- Balls respawn if they're lost in the lake.

---

## 6. Meta, Progression, and Live-Ops Systems

### 💰 Economy
- **Pony Beads** (soft currency): you start with 240. You spend them on chonks and troop gear.
- **Golden Pinecones** (premium currency): you start with 30. You spend them on Care Packages (10 each) and Camp Pass Premium (50).
- **Pinecone packs:**

  | Pack | Price | Bonus |
  |---|---|---|
  | 10 | $0.99 | — |
  | 55 | $4.99 | +10% |
  | 120 | $9.99 | +20% |
  | 260 | $19.99 | +30% |
  | 700 | $49.99 | +40% |

  Checkout is simulated; nothing is charged.
- **Pinecone purchase celebration:** a flash, a big pinecone with light rays and a "+N" counter, then a spray of pinecones that stream in arcs into your wallet, ticking the number up as each lands. It scales with pack size (5 tiers), and the biggest packs add sparkles and screen shake.

### 🏪 The Canteen (Shop)
- Run by Counselor Crumbs.
- Tabs: Chonkimals, Colours, Accessories, Emotes, Troop, and Pinecones.
- Includes a sale item (Froggo is 50% off).

### 📦 Camp Care Packages (gacha)
- **Pool:** 93 items across 5 rarities.

  | Rarity | Chance |
  |---|---|
  | Common | 50% |
  | Uncommon | 28% |
  | Rare | 15% |
  | Epic | 6% |
  | Legendary | 1.25% |

- **Pity:** you're guaranteed Epic or better every 20 opens.
- **No duplicates:** each open gives you an item you don't own yet.
- **Item types:**
  - Clothing and gear: hats, tops, bottoms, shoes, accessories, bags, necklaces.
  - Fun and flair: toys, emotes, colours, lanterns.
  - Troop pennants and tents.
  - 5 legendary characters.
- **Meme items:** Crab Rave Crab, Hot Dog Suit, Sigma Grindset Hoodie, Galaxy Brain, Air Chonkdan 1s, Warchief Raid Plate, and Buster Sword.
- **Opening animation scales with rarity.** Common gets "a polite pop." Legendary gets 5 rattles, a blackout, a triple shockwave, and a confetti storm.

### 🎟️ Camp Pass (battle pass) — Season 1: "Summer of Chonk"
- 25 tiers, each with a free and a premium reward.
- Every 100 pass points earns a stamp, and each stamp unlocks the next tier.
- **16 goal lines (53 steps).** They cover playing and winning each minigame, riding the zipline and glider, jumps, chat, checking mail, and opening packages.
- **35 exclusive cosmetics,** including a Ninja set (the premium top prize is the Ninja Sword), the Stargazer Dome tent (Legendary, the final tier), and the Cloud Pillow Pile bed.
- The free track includes Care Package tokens every 5 tiers.
- **Themed Camp Pass screen:** a critter header, section cards and pill buttons. The premium track uses the Shop's blue, and rewards ready to claim glow gold.
- **Architecture:** the Camp Pass is the stat hub. All gameplay reports to it, and badges, drives, and dailies listen to its stat stream.

### 📬 Camp Mail (daily login)
- A 7-day looping streak: beads, then pinecones, building to a free Care Package on day 7.
- The Mailbox's flag goes up when a reward is waiting.

### 📌 Camp Chonkton Community Bulletin Board
Four papers pinned to a 3D board:
- Camp map.
- Camp News.
- Leaderboards:
  - Weekly Camp Stars (resets every Monday).
  - Season-long Sumo Wins and Dodge Ball Wins.
- **Daily Challenge:** the same challenge for everyone each day, from a pool of 13. It pays beads or pinecones, Camp Pass points, and bonus Camp Stars.

### 🤝 Drives (community goals)
- **Community Drive:** a timed, camp-wide goal, e.g. a Jump-a-thon of 3,000 jumps.
  - Difficulty adapts to how the camp did last time.
  - Everyone gets rewarded if the camp succeeds, plus bonus tiers by contribution rank (Top 1% / 10% / 25% / 50% / contributor).
- **Scout Troop Drives:** 3 rolling troop goals that escalate as they're completed.
  - Every 3rd completion grants a troop-exclusive cosmetic: Scout Cap, Merit Badge Sash, Scout Whistle, Troop Hoodie, Troop Chant, or Campfire Bedroll.

### 🏕️ Scout Troops
- 14 premade troops, each with a focus. Examples:
  - Troop 67
  - Burnt Marshmallows
  - Maximum Rizz
  - Canteen Raiders
  - Pony Bead Mafia
  - Glamping Elite
  - Counselor's Nightmare
  - Brainrot Badgers
  - Zero Aura Gang
  - 404: Brain Not Found
- You can also **found your own troop**, which fills with recruits over time.
- Troop chat.
- Troop HQ is recolored by troop gear (pennants and tent colors).
- **Troop boost:** purchases add a boost for the whole troop (see caveats).

### 🎖️ Merit Badges and Badge Sash (achievements)
- 67 permanent badges in 5 sash sections:

  | Section | Badges |
  |---|---|
  | Explorer | 22 (includes 15 location discoveries) |
  | Athletics | 9 |
  | Camp Games | 17 |
  | Fellowship | 9 |
  | Camp Life | 10 |

- Bronze, silver, and gold tiers.
- Secret badges: Cannonball!, Leap of Faith, and Soggy Chonk.
- **Scout ranks:**

  | Rank | Badges needed |
  |---|---|
  | Tenderfoot | 0 |
  | Second Class | 5 |
  | First Class | 12 |
  | Star Scout | 20 |
  | Life Scout | 32 |
  | Eagle Chonk | 50 |

### 📸 Postcards and Photo Booth
- **Mr Kodak automatically photographs your best moments,** such as "Direct Hit!", "Ring Out!", "Spring Launch!", "Lunch Delivered!", and "Epic Splash!"
- Photos become souvenir postcards in 5 styles: Greetings From, Wish You Were Here, Come to Camp, Camp Memories, and Airmail.
- The album holds 30 photos, and the Photo Booth shows your latest 3.
- It's a built-in shareable-moment engine.

### 👕 Customization ("My Chonk")
- **Cabin dressing room:** Customize is a full-screen log-cabin corner with a plank floor, bunting, a clothes rack, a hat shelf, a changing curtain, and a **standing mirror that shows a live reflection** of your chonk.
- **Walk to your tent:** a waving felt-pennant button sends your chonk out through the cabin door to its tent, where you edit tent items, and back again. Edits unlock when your chonk arrives.
- **6 avatar slots:** Headwear, Top, Bottom, Footwear, Accessory, and Toy.
- **Clothing auto-fits every body shape,** thanks to fitting data measured for each body type.
- **5 tent slots:** tent style, tent material, sleeping bag, bag material, and lantern.
- Your owned items display around your tent on stumps, in rings that grow outward.
- **Backpack inventory** tabs: Camp, Outfit, Toys, Emotes, Colours, and Troop. It also tracks where each item came from.

### 🌅 First-Time User Experience (FTUE)
1. A cinematic gate fly-in, with a crowd of campers swarming to greet you.
2. The "New Camper!" screen, where you pick a name (with a random-name dice button) and your chonk.
3. Walk to the cherry blossom tree.
4. Meet Counselor Chonk.
5. Pick your tent site from a bird's-eye view.

### 🔁 How it all connects (the engagement loop)
```
Play minigames / ride / explore / chat
          │
          ▼
   Camp Pass stat hub ──► Merit Badges, Daily Challenge, Community & Troop Drives
          │                            │
          ▼                            ▼
  Pass points / Stamps  ◄──── (all pay pass points + beads/pinecones)
          │
          ▼
  Free Care Package tokens + Pinecones ──► Gacha ──► Cosmetics ──► Avatar, Tent, Troop HQ
          │
          ▼
  Postcards capture the moments ──► show off / social
```

---

## 7. Presentation, Audio, and Tech

**Art direction**
- A "cozy arts-and-crafts" finish applied across the whole scene: matte clay and felt, soft greens, subtle grain.
- A custom post-processing stack: bloom, vibrance, saturation, contrast, warmth, and vignette.
- **UI kit:**
  - Design tokens taken from the Figma "Hackathon" file.
  - Clay and Felt Fabric shader fills ported so they work on mobile.
  - Pony bead and pinecone icon art.
  - The Fredoka font.

**Audio**
- 53 audio files: a background music track ("Dads on the Beach") that ducks during win and lose moments, and sounds that fade with distance.
- **Meme sound stings:**
  - Win: airhorn and "mission passed."
  - Fail: vine boom and bruh.
  - Lose: Nelson "haha" and the Price is Right fail horn.
- Kabuki taiko, sumo booms, bug squish, swatter slaps, and 12 toy sounds.

**HUD and controls (UI polish pass)**
- The top band has the wallet (beads and pinecones) and a row of icon tiles (Camp Pass, Customize, Canteen) on a soft dark scrim. The band fades back while you run so roaming feels immersive.
- **Player badge** (portrait, name and a drop-down arrow) opens a menu: Scout Troop, Backpack, Post Cards, Ranks and Settings. Rows show "new" counts.
- **Floating joystick:** touch anywhere in the bottom third to steer. You can hide it when idle in Settings > Show Joystick.
- **New custom icon art** (about 60 icons plus 17 toy and reward images) across the HUD, social buttons, minigame HUDs, Camp Pass, map pins, Customize slots and currency.
- Chunky rounded clay buttons everywhere.

**Performance and mobile**
- **120 fps performance pass:** CPU time per frame dropped from about 12–14 ms to about 5 ms, using merged static geometry, cached ground heights, character LODs, and trimmed shadows.
- Safe-area aware for notches and home indicators, with tuned tap-target sizes.
- WebView hardening: no pinch-zoom, no text selection, no overscroll.
- Lower resolution cap on touch devices.

**Built for iteration (dev tools)**
- A live tuning panel for camera, movement, and sprint.
- A species lineup tool.
- A UI component gallery.
- Deep links such as `?goto=zipline`.
- Tunable minigame difficulty (e.g., Easy/Normal/Hard for Lunch Delivery).

**Assets**
- 24 GLB models (6 characters × 3 LODs, plus 8 level pieces).
- 30 images, about 76 new UI icons and reward images, 8 SVGs, and 53 audio files.
- A word list of about 190k words.

---

## 8. Pitch Angles and Talking Points

1. **Shows the whole "social casino/casual" playbook in one prototype:** hub world, party minigames, board games, battle pass, gacha with pity, dailies, community goals, guilds (troops), achievements, and cosmetics. Every system is actually wired into every other system.
2. **Zynga DNA:** Words With Friends and Dice With Friends are playable *inside* a 3D social world. Board games become a spectator sport, and a board game is a toy you pull out to challenge someone.
3. **The camp always feels alive:** 51 bot campers with personalities, attract matches at every venue, bots who challenge you, and trash-talk in quick chat. A new player never walks into an empty lobby.
4. **Safe social by design:** quick-chat-only communication with proximity bubbles and spam limits. It's expressive (9 categories of meme lines, emotes, toys) without moderation risk.
5. **Built for sharing:** Mr Kodak auto-captures highlight moments as postcards. That's user-generated marketing content.
6. **Monetization that respects players:** cosmetic-only purchases, no-duplicate gacha, a pity timer, free Care Package tokens on the free pass track, and a troop boost that turns spending into a social benefit for the whole troop.
7. **Juice everywhere:** ragdolls, crying ghosts going to heaven, fart bumps, taiko countdowns, confetti-storm legendaries, and speed trails.
8. **Gen-Z humor resonance:** the brainrot humor (Skibidi, Rizz, 67, aura, Fanum Tax) sits on top of a wholesome summer-camp setting.
9. **Mobile-first and fast:** portrait, one-thumb controls for each mode (flick, slingshot, tap-hop), a floating joystick, a 120 fps pass, and safe-area handling.
10. **Cozy, tactile UI:** a cabin dressing room with a live mirror, felt pennant buttons, clay tiles, and a pinecone purchase celebration that makes spending feel rewarding.
11. **Hackathon velocity:** all of this was built in one hackathon, about 98 commits and about 46k lines of TypeScript.

**Genre comparisons to use:** Club Penguin × Fall Guys × Animal Crossing × Words With Friends, at summer camp, with chonky animals.

---

## 9. Honest Caveats (so the pitch doesn't over-claim)

- **Multiplayer is simulated.** Every other camper is a local AI bot, and there's no networking or backend yet. Leaderboards, troopmates, and drive participants are simulated too. Pitch this as "designed for multiplayer, with the social layer prototyped via bots."
- **Checkout is a mock.** Nothing is charged.
- **Troop boost** is calculated and shown in the UI but doesn't appear to change reward payouts yet.
- **Tabletop games** aren't yet tracked by the Camp Pass or badges.
- **Some shop tabs are empty** (Colours, Accessories, Emotes in the shop; those items come from the gacha and the pass). Some chonk names are still placeholders (e.g., "I'm out of names"), and several portraits don't have 3D models yet.
- **The Community Drive timer** is set to 5 minutes for demo pacing.
