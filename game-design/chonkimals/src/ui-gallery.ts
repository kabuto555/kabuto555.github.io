// DEV TOOL — living gallery of the Chonkimals UI kit (src/ui). Entry point for
// ui-gallery.html; never imported by the game, so it isn't in dist/game.js.
// Every specimen is the real component, so what you see here is what ships.

import {
  COLORS, FONT, DODGEBALL_TUTORIAL, TEMPLATE_TUTORIAL, TutorialModal,
  clayCard, el, headerPlaque, navButton, pagerDots, primaryButton, critterHeader, PLAQUE_SCREEN,
  backButton, wallet, badge, itemCard, priceFooter, selectFooter, tabBar, outlinePill, tinyButton, currentPill,
  CharacterSelectScreen, ShopScreen, OWNED_CHARACTERS, SHOP_TABS,
  SettingsScreen, LeaderboardScreen, MOCK_LEADERBOARD, buildLeaderboard, settingsSections, applySettingChange,
  sectionCard, slider, optionRow, accountLine, dangerLink, rankRow, contentPanel, pillButton,
  type TutorialModalConfig,
  speechBubble, DialogueBox, NewCamperScreen, textField, iconSquare, TroopScreen,
  CarePackageScreen, showCheckout, pineconePackArt,
} from './ui';
import { CHONK_SPECIES } from './bots/appearance';
import { gameSettings } from './game-settings';

const root = document.getElementById('gallery')!;
const page = el('div', 'max-width:1100px;margin:0 auto;padding:32px 20px 80px;');
root.appendChild(page);

// ── Layout helpers ──────────────────────────────────────────────────────────
function section(title: string, blurb: string): HTMLElement {
  const s = el('section', 'margin-top:48px;');
  s.append(
    el('h2', `font-family:${FONT};font-weight:700;font-size:28px;color:${COLORS.creamDim};`, title),
    el('p', 'font-size:15px;opacity:0.7;margin:4px 0 18px;max-width:720px;line-height:1.4;', blurb),
  );
  page.appendChild(s);
  return s;
}

function row(parent: HTMLElement): HTMLElement {
  const r = el('div', 'display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end;');
  parent.appendChild(r);
  return r;
}

/** A labelled tile holding a design-px component, scaled down to fit. */
function specimen(parent: HTMLElement, label: string, code: string, node: HTMLElement | SVGElement,
                  designW: number, designH: number, scale: number): void {
  scale = Math.min(scale, tileRoom() / designW); // never overflow a narrow (phone) screen
  const tile = el('div',
    'background:#3a2a1e;border:1px solid #4d3a2b;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;');
  const stage = el('div', `position:relative;width:${designW * scale}px;height:${designH * scale}px;`);
  const inner = el('div',
    `position:absolute;left:0;top:0;width:${designW}px;height:${designH}px;transform:scale(${scale});transform-origin:0 0;` +
    'display:flex;align-items:center;justify-content:center;');
  inner.appendChild(node);
  stage.appendChild(inner);
  tile.append(stage, caption(label, code));
  parent.appendChild(tile);
}

/** Usable width inside a tile: page content minus tile padding + border. */
function tileRoom(): number {
  return page.clientWidth - 40 - 34;
}

function caption(label: string, code: string): HTMLElement {
  const c = el('div', 'display:flex;flex-direction:column;gap:3px;');
  c.append(
    el('div', 'font-size:14px;font-weight:600;', label),
    el('code', 'font:12px ui-monospace,Menlo,monospace;color:#c9a883;white-space:pre-wrap;', code),
  );
  return c;
}

// ── Header ──────────────────────────────────────────────────────────────────
page.append(
  el('h1', `font-family:${FONT};font-weight:700;font-size:44px;color:${COLORS.creamDim};` +
    `text-shadow:0 3px 0 ${COLORS.brownInk};`, 'Chonkimals UI Kit'),
  el('p', 'font-size:16px;opacity:0.75;margin-top:6px;line-height:1.4;',
    'Every reusable component in src/ui, rendered live. Built 1:1 from the Figma “Hackathon” file ' +
    'at design size (1080-wide frame) and scaled for display here.'),
);

// ── Tokens: colour ──────────────────────────────────────────────────────────
{
  const s = section('Colour tokens', 'COLORS in src/ui/theme.ts. Every component reads from these.');
  const grid = el('div', 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;');
  for (const [name, value] of Object.entries(COLORS)) {
    const sw = el('div', 'background:#3a2a1e;border:1px solid #4d3a2b;border-radius:12px;overflow:hidden;');
    sw.append(
      el('div', `height:64px;background:${value};border-bottom:1px solid #0003;`),
      el('div', 'padding:8px 10px;', ''),
    );
    const meta = sw.lastElementChild as HTMLElement;
    meta.append(el('div', 'font-size:13px;font-weight:600;', name),
      el('code', 'font:11px ui-monospace,Menlo,monospace;color:#c9a883;', value));
    grid.appendChild(sw);
  }
  s.appendChild(grid);
}

// ── Tokens: type ────────────────────────────────────────────────────────────
{
  const s = section('Typography', 'Fredoka (assets/fredoka.woff2), sizes in design px as used by the modal.');
  const list = el('div',
    `background:${COLORS.cream};border-radius:16px;padding:20px 24px;display:flex;flex-direction:column;gap:14px;color:${COLORS.brown};`);
  const SAMPLES: [string, number, number, string][] = [
    ['Header title', 84, 700, 'Dodge Ball'],
    ['CTA', 64.503, 700, 'Ready!'],
    ['Page title', 60, 600, 'Dodging and Catching'],
    ['Body', 40, 400, 'Run to a ball to pick it up, tap the action button to throw!'],
    ['Nav button', 37.04, 600, 'Back · Next'],
  ];
  const SCALE = 0.5;
  for (const [label, size, weight, text] of SAMPLES) {
    const r = el('div', 'display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;');
    r.append(
      el('code', 'font:12px ui-monospace,Menlo,monospace;color:#8a6a4f;width:190px;flex-shrink:0;',
        `${label} — ${size}px / ${weight}`),
      el('span', `font-family:${FONT};font-size:${size * SCALE}px;font-weight:${weight};line-height:1.1;`, text),
    );
    list.appendChild(r);
  }
  list.appendChild(el('div', 'font-size:12px;opacity:0.6;', 'Shown at 50% of design size.'));
  s.appendChild(list);
}

// ── Buttons ─────────────────────────────────────────────────────────────────
{
  const s = section('Buttons', 'Tap them — they sink by their hard shadow while held. Disabled = 30% opacity, taps ignored.');
  const r = row(s);
  const SC = 0.55;
  const light = navButton('Back', 'light', () => {});
  specimen(r, 'Nav — light', "navButton('Back', 'light', onTap)", light.root, 420, 140, SC);
  const dark = navButton('Next', 'dark', () => {});
  specimen(r, 'Nav — dark', "navButton('Next', 'dark', onTap)", dark.root, 420, 140, SC);
  const lightOff = navButton('Back', 'light', () => {}); lightOff.setDisabled(true);
  specimen(r, 'Nav — light, disabled', 'btn.setDisabled(true)', lightOff.root, 420, 140, SC);
  const darkOff = navButton('Next', 'dark', () => {}); darkOff.setDisabled(true);
  specimen(r, 'Nav — dark, disabled', 'btn.setDisabled(true)', darkOff.root, 420, 140, SC);
  let taps = 0;
  const cta = primaryButton('Ready!', () => cta.setLabel(`Tapped ×${++taps}`));
  specimen(r, 'Primary (CTA)', "primaryButton('Ready!', onTap)", cta.slot, 560, 220, SC);
}

// ── Pager dots ──────────────────────────────────────────────────────────────
{
  const s = section('Pager dots', 'pagerDots(count, index) — white = current page. Grows with page count.');
  const r = row(s);
  for (const [n, i] of [[2, 0], [2, 1], [3, 1], [5, 3]] as const) {
    const box = el('div',
      `width:148px;height:46px;background:${COLORS.pagerTab};border-radius:20px 20px 0 0;` +
      'display:flex;align-items:center;justify-content:center;padding-top:4px;');
    const bg = el('div', 'background:#6a8f3a;padding:24px 40px 0;border-radius:12px;display:flex;justify-content:center;');
    box.appendChild(pagerDots(n, i));
    bg.appendChild(box);
    specimen(r, `${n} pages, on ${i + 1}`, `pagerDots(${n}, ${i})`, bg, 300, 110, 0.8);
  }
}

// ── Surfaces ────────────────────────────────────────────────────────────────
{
  const s = section('Surfaces',
    'Figma’s “Clay” and “Felt Fabric” shader fills, ported to WebGL and baked once to a texture (src/ui/shader-textures.ts).');
  const r = row(s);
  const plaque = headerPlaque('Header Plaque');
  plaque.root.style.position = 'relative';
  specimen(r, 'Header plaque (felt)', "headerPlaque('Title')", plaque.root, 860, 200, 0.5);

  const card = clayCard('position:relative;width:700px;height:420px;display:flex;align-items:center;justify-content:center;');
  card.root.appendChild(el('p', `font-family:${FONT};font-weight:600;font-size:48px;color:${COLORS.brown};`, 'Clay card'));
  specimen(r, 'Clay card', "clayCard(css).root  // then .bake()", card.root, 740, 470, 0.5);
  requestAnimationFrame(() => card.bake());
}

// ── Headers ─────────────────────────────────────────────────────────────────
{
  const s = section('Critter headers',
    'critterHeader(title, opts) — the title block on every screen. Normal (modal, Character Select) and compact (Shop).');
  const r = row(s);
  specimen(r, 'Normal — modal plaque', "critterHeader('Dodge Ball')", critterHeader('Dodge Ball').root, 820, 460, 0.4);
  specimen(r, 'Normal — screen plaque', "critterHeader(title, { style: PLAQUE_SCREEN })",
    critterHeader('Select a Chonkimal!', { style: PLAQUE_SCREEN }).root, 820, 460, 0.4);
  specimen(r, 'Compact (Shop)', "critterHeader('Chonky Shop', { compact: true })",
    critterHeader('Chonky Shop', { compact: true }).root, 622, 391, 0.5);
  specimen(r, 'Plaque only', "critterHeader(title, { image: null })",
    critterHeader('No Art', { image: null }).root, 820, 460, 0.4);
}

// ── Store controls ──────────────────────────────────────────────────────────
{
  const s = section('Store controls',
    'Header row pieces, card buttons, tabs and badges from Character Select + Shop (src/ui/store-components.ts).');
  const r = row(s);
  const blueBg = (n: HTMLElement | SVGElement) => {
    const b = el('div', `background:${COLORS.cream};padding:16px;border-radius:12px;display:flex;gap:16px;align-items:center;`);
    b.appendChild(n); return b;
  };
  const backs = el('div', 'display:flex;gap:24px;align-items:center;');
  backs.append(backButton(80, () => {}), backButton(60, () => {}));
  specimen(r, 'Back button (80 / 60)', 'backButton(size, onTap)', blueBg(backs), 220, 130, 0.8);
  let coins = 240;
  const w = wallet(coins, () => w.setCoins(coins += 50));
  specimen(r, 'Wallet — tap +', 'wallet(coins, onAdd).setCoins(n)', blueBg(w.root), 360, 150, 0.6);
  const tiny = el('div', 'display:flex;gap:14px;align-items:center;');
  tiny.append(tinyButton('BUY', 'brown', () => {}), tinyButton('BUY', 'blue', () => {}), tinyButton('SELECT', 'dark', () => {}));
  specimen(r, 'Tiny buttons', "tinyButton(text, 'brown' | 'blue' | 'dark', onTap)", blueBg(tiny), 320, 110, 0.9);
  specimen(r, 'Currently Using', 'currentPill()', blueBg(currentPill()), 300, 100, 0.9);
  specimen(r, 'Outline pill', "outlinePill('Get More!', onTap)", blueBg(outlinePill('Get More!', () => {})), 430, 130, 0.6);
  const tabs = tabBar(['Chonkimals', 'Colours', 'Accessories', 'Emotes'], 0, () => {});
  specimen(r, 'Tab bar — tap a tab', 'tabBar(labels, active, onChange)', tabs.root, 1020, 100, 0.34);
  const badges = el('div', 'display:flex;gap:40px;padding:40px 30px 10px;');
  for (const spec of [{ kind: 'new' as const }, { kind: 'sale' as const, percent: 50 }]) {
    const slot = el('div', `position:relative;width:120px;height:70px;background:#fff;border-radius:18px;`);
    slot.appendChild(badge(spec));
    badges.appendChild(slot);
  }
  specimen(r, 'Badges', "badge({ kind: 'new' }) · badge({ kind: 'sale', percent: 50 })", blueBg(badges), 360, 170, 0.8);
}

// ── Cards ───────────────────────────────────────────────────────────────────
{
  const s = section('Item cards', "itemCard({ variant, name, art, badge, footer }) — the same card, two Figma variants.");
  const r = row(s);
  const SC = 0.55;
  specimen(r, 'Select — current', "footer: selectFooter(true, onSelect)",
    itemCard({ variant: 'select', name: 'Doggo', art: 'doggo', footer: selectFooter(true, () => {}) }), 330, 380, SC);
  specimen(r, 'Select', "footer: selectFooter(false, onSelect)",
    itemCard({ variant: 'select', name: 'Froggo', art: 'froggo', footer: selectFooter(false, () => {}) }), 330, 380, SC);
  specimen(r, 'Shop — NEW', "badge: { kind: 'new' }, footer: priceFooter(150, 'brown', onBuy)",
    itemCard({ variant: 'shop', name: 'Doggo', art: 'doggo', badge: { kind: 'new' }, footer: priceFooter(150, 'brown', () => {}) }),
    370, 400, SC);
  specimen(r, 'Shop — sale', "badge: { kind: 'sale', percent: 50 }",
    itemCard({ variant: 'shop', name: 'Froggo', art: 'froggo', badge: { kind: 'sale', percent: 50 }, footer: priceFooter(75, 'brown', () => {}) }),
    370, 400, SC);
  specimen(r, 'Shop — blue BUY', "priceFooter(150, 'blue', onBuy)",
    itemCard({ variant: 'shop', name: 'little', art: 'little', footer: priceFooter(150, 'blue', () => {}) }), 370, 400, SC);
}

/** A live phone-sized frame; `open(host)` mounts a screen into it (re-opened after it closes). */
function phone(parent: HTMLElement, label: string, code: string, open: (host: HTMLElement, reopen: () => void) => void,
               openFull: (host: HTMLElement, done: () => void) => void): void {
  const W = Math.min(340, tileRoom()), H = Math.round(W * 700 / 340);
  const tile = el('div',
    'background:#3a2a1e;border:1px solid #4d3a2b;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;');
  const host = el('div',
    `position:relative;width:${W}px;height:${H}px;border-radius:10px;overflow:hidden;` +
    'background:linear-gradient(#8fc4ec,#bfe4ff 45%,#7fb85a 46%,#5f9a3f);');
  const reopen = () => setTimeout(() => open(host, reopen), 500);
  const full = el('button',
    `align-self:flex-start;font-family:${FONT};font-weight:600;font-size:13px;padding:6px 12px;border-radius:8px;` +
    `border:2px solid ${COLORS.brown};background:${COLORS.cream};color:${COLORS.brownDark};cursor:pointer;`,
    'Open fullscreen');
  full.addEventListener('click', () => {
    const overlay = el('div', 'position:fixed;inset:0;z-index:1000;');
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden'; // no page scrollbar beside the fullscreen screen
    openFull(overlay, () => setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; }, 200));
  });
  full.dataset.open = label.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
  tile.append(host, caption(label, code), full);
  parent.appendChild(tile);
  open(host, reopen);
}

// ── Store screens ───────────────────────────────────────────────────────────
{
  const s = section('Store screens',
    'showCharacterSelect(host, opts) / showShop(host, opts). Content in src/ui/store-presets.ts. Live — the grids ' +
    'scroll, SELECT swaps the current pick, BUY deducts from the wallet, tabs switch, back closes (and re-opens here).');
  const r = row(s);
  const cs = (host: HTMLElement, onBack: () => void) => {
    const scr: CharacterSelectScreen = new CharacterSelectScreen(host, {
      characters: OWNED_CHARACTERS, selectedId: 'doggo', coins: 240,
      onBack: () => { scr.close(); onBack(); },
    });
  };
  phone(r, 'Character Select', 'showCharacterSelect(host, { characters, selectedId, coins, onSelect })', cs, cs);
  const shop = (host: HTMLElement, onBack: () => void) => {
    const scr: ShopScreen = new ShopScreen(host, {
      tabs: SHOP_TABS, coins: 240,
      onBack: () => { scr.close(); onBack(); },
    });
  };
  phone(r, 'Shop', 'showShop(host, { tabs, coins, onBuy })', shop, shop);
}

// ── Settings & leaderboard parts ────────────────────────────────────────────
{
  const s = section('Settings & leaderboard parts',
    'src/ui/menu-components.ts. Option rows are new (Figma has no toggle) — the system tab bar at 0.68 scale.');
  const r = row(s);
  const sound = sectionCard('SOUND');
  sound.body.append(slider('Music Volume', 0.75, () => {}).root, slider('SFX Volume', 0.9, () => {}).root);
  specimen(r, 'Section card + sliders — drag', "sectionCard('SOUND') · slider(label, value, onChange)", sound.root, 892, 230, 0.4);
  const opts = sectionCard('DISPLAY');
  opts.body.style.gap = '10px';
  opts.body.append(optionRow('Graphics', ['Low', 'High'], 1, () => {}).root,
    optionRow('Player Names', ['Off', 'On'], 1, () => {}).root);
  specimen(r, 'Option rows — tap', "optionRow(label, ['Off', 'On'], active, onChange)", opts.root, 892, 200, 0.4);
  const acct = sectionCard('ACCOUNT', true);
  const act = el('div', 'display:flex;flex-direction:column;gap:27.304px;width:100%;');
  act.append(pillButton('Log Out', () => {}, 'wide'), dangerLink('Delete Account', () => {}));
  acct.body.append(accountLine('poopy pants'), act);
  specimen(r, 'Account section', "accountLine(name) · pillButton('Log Out', onTap, 'wide') · dangerLink(text, onTap)",
    acct.root, 892, 310, 0.4);
  const pills = el('div', 'display:flex;flex-direction:column;gap:40px;align-items:center;');
  pills.append(pillButton('DONE!', () => {}, 'done'), pillButton('Get More!', () => {}, 'getMore'));
  specimen(r, 'Pill buttons', "pillButton(text, onTap, 'done' | 'getMore' | 'wide')", pills, 620, 340, 0.4);
  const ranks = el('div', 'display:flex;flex-direction:column;gap:16.667px;');
  [[1, 'monkey with gun', 24850], [2, 'pooped in my pant', 18400], [3, 'stinkdog', 14250], [4, 'womp womp', 18400]]
    .forEach(([n, name, sc]) => ranks.appendChild(rankRow(n as number, name as string, sc as number)));
  specimen(r, 'Rank rows (1st / 2nd / 3rd / rest)', 'rankRow(rank, name, score)', ranks, 850, 640, 0.38);
  specimen(r, 'Content panel', 'contentPanel(css)', contentPanel('height:260px;'), 990, 290, 0.33);
}

// ── Menu screens ────────────────────────────────────────────────────────────
{
  const s = section('Menu screens',
    'Settings: openGameSettings(host, { coins }) — bound to the persisted game settings (src/game-settings.ts). ' +
    'Leaderboard: showLeaderboard(host, { entries }) — faked locally (buildLeaderboard); Figma mock shown here.');
  const r = row(s);
  const settings = (host: HTMLElement, onBack: () => void) => {
    const scr: SettingsScreen = new SettingsScreen(host, {
      sections: settingsSections(gameSettings.get()),
      playerName: gameSettings.get().playerName, coins: 240, onChange: applySettingChange,
      onBack: () => { scr.close(); onBack(); },
    });
  };
  phone(r, 'Settings', 'openGameSettings(host, { coins, onLogOut, onDeleteAccount })', settings, settings);
  const board = (host: HTMLElement, onBack: () => void) => {
    const scr: LeaderboardScreen = new LeaderboardScreen(host, {
      entries: MOCK_LEADERBOARD, coins: 240,
      onDone: () => { scr.close(); onBack(); }, onBack: () => { scr.close(); onBack(); },
    });
  };
  phone(r, 'Leaderboard (Figma mock)', 'showLeaderboard(host, { entries: MOCK_LEADERBOARD, coins })', board, board);
  const local = (host: HTMLElement, onBack: () => void) => {
    const scr: LeaderboardScreen = new LeaderboardScreen(host, {
      entries: buildLeaderboard('You', 10500), coins: 240,
      onDone: () => { scr.close(); onBack(); }, onBack: () => { scr.close(); onBack(); },
    });
  };
  phone(r, 'Leaderboard (faked local)', "showLeaderboard(host, { entries: buildLeaderboard('You', score) })", local, local);
}

// ── FTUE: dialogue + New Camper ─────────────────────────────────────────────
{
  const s = section('FTUE (first arrival)',
    'speechBubble(name, text) = Figma "Speech" (42:4883). In-game it runs through DialogueBox.play(lines) with the real 3D ' +
    'speaker framed above it (src/ftue.ts). New Camper = name field + chonk grid; only chonks with a model are selectable.');
  const r = row(s);
  specimen(r, 'Speech bubble', "speechBubble('Counselor Chonk', text)",
    speechBubble('Counselor Chonk', 'Walk up to any area to check it out and learn how to play!').root, 860, 220, 0.38);
  const fieldRow = el('div', 'display:flex;gap:22px;align-items:center;width:840px;');
  fieldRow.append(textField('Jojo').root, iconSquare('🎲', () => {}));
  specimen(r, 'Name field + dice', "textField(value, { onInput }) · iconSquare('🎲', onTap)", fieldRow, 860, 130, 0.38);
  const talk = (host: HTMLElement, again: () => void) => {
    const box = new DialogueBox(host);
    void box.play([
      { name: 'Counselor Chonk', text: 'Welcome to Camp Chonkton, Jojo! Explore, play and socialize with friends.' },
      { name: 'Counselor Chonk', text: 'Walk up to any area to check it out and learn how to play!' },
    ]).then(() => { box.dispose(); again(); });
  };
  phone(r, 'Dialogue (tap to advance)', 'new DialogueBox(host).play([{ name, text }, …])', talk, talk);
  const camper = (host: HTMLElement, done: () => void) => {
    new NewCamperScreen(host, {
      name: '', characters: OWNED_CHARACTERS, selectedId: 'froggo', playable: (id) => id in CHONK_SPECIES,
      onDone: () => done(),
    });
  };
  phone(r, 'New Camper', 'showNewCamper(host, { name, characters, selectedId, playable, onDone })', camper, camper);
}

// ── Scout Troop ─────────────────────────────────────────────────────────────
{
  const s = section('Scout Troop',
    'src/ui/troop-screen.ts (no Figma mock yet). Opened at the Troop HQ tent in camp. Solo: Join / Start a troop; ' +
    'in a troop: boost card + Members / Chat. Uses the REAL local troop state (chonk.troop.v1), so joining here joins in-game too.');
  const r = row(s);
  const troop = (host: HTMLElement, done: () => void) => {
    const scr: TroopScreen = new TroopScreen(host, {
      coins: 240, player: () => ({ name: gameSettings.get().playerName, art: gameSettings.get().character }),
      onBack: () => { scr.close(); done(); },
    });
  };
  phone(r, 'Scout Troop', 'showTroopScreen(host, { coins, player })', troop, troop);
}

// ── Camp Care Package ───────────────────────────────────────────────────────
{
  const s = section('Camp Care Package',
    'src/ui/care-package-screen.ts + src/care-package/* (no Figma mock yet). Opened at the Canteen. A live three.js stage ' +
    'plays the opening; intensity scales with rarity (−1 for duplicates, extra sparkles for NEW). Uses the REAL local ' +
    'golden pinecones + inventory (chonk.premium.v1 / chonk.inventory.v1). Reward list: src/care-package/rewards.ts.');
  const r = row(s);
  const cp = (host: HTMLElement, done: () => void) => {
    const scr: CarePackageScreen = new CarePackageScreen(host, { onBack: () => { scr.close(); done(); } });
  };
  phone(r, 'Care Package', 'showCarePackage(host, { onGetPremium, onResult })', cp, cp);
  const checkout = (host: HTMLElement, done: () => void) => {
    showCheckout(host, { title: '550 Golden Pinecones (+10%)', price: '$4.99', image: pineconePackArt(1, 4),
      onPurchased: () => setTimeout(done, 700), onCancel: done });
  };
  phone(r, 'Checkout (faked)', "showCheckout(host, { title, price, image, onPurchased })", checkout, checkout);
}

// ── Tutorial modal ──────────────────────────────────────────────────────────
{
  const s = section('Tutorial modal',
    'showTutorialModal(host, config, { onReady }). Content lives in src/ui/modal-presets.ts. ' +
    'These are live — page with Back/Next or swipe the preview; Ready! closes and re-opens it here.');
  const r = row(s);
  const W = Math.min(340, tileRoom()), H = Math.round(W * 700 / 340);

  const mount = (label: string, code: string, config: TutorialModalConfig) => {
    const tile = el('div',
      'background:#3a2a1e;border:1px solid #4d3a2b;border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;');
    const host = el('div',
      `position:relative;width:${W}px;height:${H}px;border-radius:10px;overflow:hidden;` +
      'background:linear-gradient(#8fc4ec,#bfe4ff 45%,#7fb85a 46%,#5f9a3f);');
    const open = () => new TutorialModal(host, { ...config, scrim: 'rgba(20,12,6,0.25)' }, {
      onReady: () => setTimeout(open, 600),
    });
    const full = el('button',
      `align-self:flex-start;font-family:${FONT};font-weight:600;font-size:13px;padding:6px 12px;border-radius:8px;` +
      `border:2px solid ${COLORS.brown};background:${COLORS.cream};color:${COLORS.brownDark};cursor:pointer;`,
      'Open fullscreen');
    full.addEventListener('click', () => {
      const overlay = el('div', 'position:fixed;inset:0;z-index:1000;');
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';
      new TutorialModal(overlay, config, {
        onReady: () => setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; }, 200),
      });
    });
    tile.append(host, caption(label, code), full);
    r.appendChild(tile);
    open();
  };

  mount('Dodge Ball (ready to ship)', 'showTutorialModal(host, DODGEBALL_TUTORIAL)', DODGEBALL_TUTORIAL);
  mount('Template (blank example)', 'showTutorialModal(host, TEMPLATE_TUTORIAL)', TEMPLATE_TUTORIAL);
}

// Deep link: ui-gallery.html?open=settings (etc.) opens that screen fullscreen on load.
{
  const want = new URLSearchParams(location.search).get('open');
  if (want) {
    const btn = [...document.querySelectorAll<HTMLButtonElement>('button[data-open]')]
      .find((b) => b.dataset.open!.startsWith(want));
    btn?.click();
  }
}
