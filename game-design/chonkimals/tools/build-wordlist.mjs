// Builds assets/words.txt — the Words With Friends dictionary (src/tabletop/words/dictionary.ts).
//
//   node tools/build-wordlist.mjs [/usr/share/dict/web2]
//
// Sources, 2–11 letters (the board is 11 wide):
//  • the system's Webster's 2nd word list (lower-case entries only = no proper nouns) — deep
//    but dusty: it lacks plurals, verb forms and even "box". Its 2-letter entries are swapped
//    for the standard word-game list.
//  • tools/common-words.txt — everyday English with its inflections, from the macOS spell
//    checker (tools/crawl-common-words.swift). These are flagged COMMON: bots only play those.
//  • a hand-picked supplement of modern / word-game staples (also common).
// The game still derives plurals and verb forms of anything listed at lookup time.
//
// Encoding: sorted, one word per line, each prefixed with how many leading letters it shares
// with the previous word as a single character — '0' + n for most words, 'A' + n for common
// ones:  "aardvark" → "0aardvark", "aardwolf" → "4wolf", "box" → "Bx". Roughly halves the file.

import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2] ?? '/usr/share/dict/web2';

const TWO = `aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by da de do ed ef eh el em en er es
  ew ex fa fe go gu ha he hi hm ho id if in is it jo ka ki la li lo ma me mi mm mo mu my na ne no nu od oe
  of oh oi ok om on op or os ow ox oy pa pe pi po qi re sh si so ta te ti to uh um un up us ut we wo xi xu
  ya ye yo za`;

const EXTRA = `zap zit zen fax qat yuk yum bux okay emoji blog vlog wifi meme vibe selfie taco sushi ramen nacho
  ninja laptop online pixel yeet bro emo lol app email goodbye cookie donut bestie hangry glamping podcast
  hashtag smartphone website internet texting online offline download upload username password gamer noob
  pwn emote avatar rizz sus vibe chonk chonky smol doggo pupper floof zoomies snack snacky bae fomo yolo
  lit dope epic salty legit swag cringe basic extra fam squad goat gg ez oof yikes welp nah yep yup meh
  ugh aww boop derp duh eww hmm huh oops phew shh whoa wow yay yeah zzz ok emu kiwi bok choy tofu kale
  quinoa hummus falafel burrito tamale churro salsa guac latte mocha espresso smoothie boba matcha pho
  bento kimchi gyoza wasabi sriracha nugget tater tot hotdog cheeseburger popcorn marshmallow smore
  canoe kayak paddle hike hiker trail camper cabin bonfire lantern compass sleeping zipline hammock
  qis qat qaid qoph faqir tranq suq cwm crwth jo ka ki oi xu za zas zax zek zel zep zin zoa zuz jeu
  jiao ajee djin hadj jnana pyx pht psst shh brr hm mm tsk nth`;

// Never in the game: anything containing a STRONG word, or a MILD word itself (+ s / es / ed /
// ing / er / y). Plurals and verb forms are derived from what's listed, so they go too.
const STRONG = 'fuck shit cunt nigg twat wank whore slut bitch'.split(' ');
const MILD = new Set(`piss cock dick bastard fag faggot dyke kike spic chink retard tit tits titty boob porn porno
  penis vagina anus rape rapist nazi hitler crap damn arse ass asshole jizz cum dildo skank`.split(/\s+/));
const blocked = (w) => STRONG.some((b) => w.includes(b))
  || [0, 1, 2, 3].some((n) => MILD.has(w.slice(0, w.length - n)) && ['', 's', 'es', 'ed', 'er', 'y', 'ing'].includes(w.slice(w.length - n)));

const words = new Set();
const common = new Set();
for (const line of readFileSync(src, 'utf8').split('\n')) {
  const w = line.trim();
  if (/^[a-z]{3,11}$/.test(w)) words.add(w);
}
const commonSrc = new URL('./common-words.txt', import.meta.url);
for (const w of readFileSync(commonSrc, 'utf8').split('\n')) if (/^[a-z]{3,11}$/.test(w)) common.add(w);
for (const w of `${TWO} ${EXTRA}`.split(/\s+/)) if (/^[a-z]{2,11}$/.test(w)) common.add(w);
for (const w of common) words.add(w);
for (const w of words) if (blocked(w)) { words.delete(w); common.delete(w); }

const sorted = [...words].sort();
const out = [];
let prev = '';
for (const w of sorted) {
  let n = 0;
  while (n < w.length && n < prev.length && w[n] === prev[n]) n++;
  if (n === w.length) n--; // always at least one new letter
  out.push(String.fromCharCode((common.has(w) ? 65 : 48) + n) + w.slice(n));
  prev = w;
}
writeFileSync(new URL('../assets/words.txt', import.meta.url), out.join('\n') + '\n');
console.log(`${sorted.length} words (${common.size} common) → assets/words.txt`);
