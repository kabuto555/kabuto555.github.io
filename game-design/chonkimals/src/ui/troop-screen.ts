// Scout Troop screen (no Figma mock yet) — opened from the Troop HQ tent. Built from
// the kit: camp backdrop + header row + critter header + the Settings content panel
// and tab bar, with rows in the Leaderboard's scale so they read on a phone.
//   Solo:     Join a Troop (list) / Start a Troop (name field).
//   In troop: boost card, then Members / Chat tabs.
// Everything behind it is local and faked (troop-life.ts) — there's no backend.

import { COLORS, FONT, buttonRadius, chonkArt } from './theme';
import { critterHeader, dragToScroll, el, pressable, PLAQUE_SCREEN } from './components';
import { headerRow, pillButton, tabBar, tinyButton } from './store-components';
import { StoreScreen, campBackdrop, scroller } from './store-screens';
import { contentPanel, dangerLink, MENU, sectionCard } from './menu-components';
import { iconSquare, textField } from './profile-screen';
import {
  createPlayerTroop, joinPlayerTroop, leavePlayerTroop, listTroops, playerTroop, subscribeTroop, TROOP_BOOST,
  TROOP_NAME_MAX, troopNameProblem,
} from '../troops';
import {
  troopChat, troopRoster, troopSummary, type PlayerInfo, type TroopMember, type TroopMessage, type TroopSummary,
} from '../troop-life';
import { TROOP_NAME_PARTS, TROOP_QUICK_LINES } from '../troop-presets';
import { icon } from './icons';

export interface TroopScreenOptions {
  coins: number;
  player: () => PlayerInfo;
  /** After the player joins or founds a troop (e.g. troopmates in camp wave). */
  onJoined?: (troopId: string) => void;
  /** After the screen closes (any way). */
  onClose?: () => void;
  onBack?: () => void;
  onAddCoins?: () => void;
}

const INNER_W = 891.923; // section-card width inside the content panel
const TEXT = `font-family:${FONT};line-height:normal;`;
const GREEN = '#5cc25a';

/** White list card (store card look) sized for full-width rows. */
function rowCard(css = ''): HTMLElement {
  return el('div',
    `background:#fff;border:5px solid ${COLORS.cardBorder};box-shadow:0 7.753px 0 ${COLORS.cardShadow};` +
    `border-radius:36px;width:${INNER_W}px;flex-shrink:0;display:flex;align-items:center;gap:28px;padding:22px 30px;` +
    'box-sizing:border-box;' + css);
}

/** Round chonk portrait. */
function avatar(art: string, size = 96): HTMLElement {
  const box = el('div', `width:${size}px;height:${size}px;border-radius:50%;background:${COLORS.cream};` +
    `border:5px solid ${COLORS.cardBorder};overflow:hidden;flex-shrink:0;position:relative;`);
  const img = el('img', 'position:absolute;left:50%;top:6%;width:82%;transform:translateX(-50%);pointer-events:none;');
  img.src = chonkArt(art); img.alt = ''; img.draggable = false; img.loading = 'lazy';
  box.appendChild(img);
  return box;
}

/** Small rounded label (LEADER / YOU / boost). */
function chip(text: string, bg: string, border: string, ink: string, size = 22): HTMLElement {
  return el('p', `${TEXT}font-weight:700;font-size:${size}px;color:${ink};background:${bg};border:4px solid ${border};` +
    'border-radius:16px;padding:2px 14px;white-space:nowrap;flex-shrink:0;', text);
}

/** Uppercase list heading, like the Settings section titles but bigger. */
const sectionHeading = (text: string) => el('p',
  `${TEXT}font-weight:700;font-size:28px;color:${MENU.sectionInk};width:${INNER_W}px;padding:8px 12px 0;letter-spacing:1px;`, text);

/** Club emoji in a cream disc (featured cards). */
function emojiBadge(emoji: string): HTMLElement {
  const b = el('div', `width:96px;height:96px;border-radius:50%;background:${COLORS.cream};border:5px solid ${COLORS.cardBorder};` +
    'display:flex;align-items:center;justify-content:center;flex-shrink:0;');
  b.appendChild(el('p', 'font-size:50px;line-height:1;', emoji));
  return b;
}

/** Pulsing green "live" dot. */
function liveDot(): HTMLElement {
  const d = el('div', `width:18px;height:18px;border-radius:50%;background:${GREEN};flex-shrink:0;`);
  d.animate([{ boxShadow: `0 0 0 0 ${GREEN}aa` }, { boxShadow: `0 0 0 12px ${GREEN}00` }],
    { duration: 1400, iterations: Infinity });
  return d;
}

const boostChip = (pct: number) => chip(`+${pct.toFixed(1)}% boost`, COLORS.coinLight, COLORS.coin, COLORS.coinInk);

/** Shrinks a nowrap title's font until it fits `maxW` design px. */
function fitTitle(t: HTMLElement, maxW: number): void {
  requestAnimationFrame(() => {
    let size = parseFloat(t.style.fontSize) || 84;
    t.style.whiteSpace = 'nowrap';
    const measure = el('span', `${t.style.cssText};position:absolute;visibility:hidden;width:auto;left:0;right:auto;transform:none;`,
      t.textContent ?? '');
    document.body.appendChild(measure);
    while (size > 40 && measure.offsetWidth > maxW) { size -= 4; measure.style.fontSize = `${size}px`; }
    measure.remove();
    t.style.fontSize = `${size}px`;
  });
}

function randomTroopName(): string {
  const r = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
  return `The ${r(TROOP_NAME_PARTS.first)} ${r(TROOP_NAME_PARTS.second)}s`.slice(0, TROOP_NAME_MAX);
}

export class TroopScreen extends StoreScreen {
  private header: ReturnType<typeof critterHeader> | null = null;
  private block: HTMLElement;
  private panel: HTMLElement;
  private cleanup: (() => void)[] = [];
  private viewCleanup: (() => void)[] = [];
  private tab = 0;
  private soloTab = 0;

  constructor(host: HTMLElement, private opts: TroopScreenOptions) {
    super(host);
    const f = this.frame;
    campBackdrop(f);
    this.block = el('div', 'position:absolute;left:40px;top:200px;width:1000px;bottom:0;');
    this.panel = contentPanel('position:absolute;left:8.532px;top:496.762px;bottom:80px;overflow:hidden;gap:26px;' +
      'justify-content:flex-start;padding:40px 45.506px;');
    this.block.appendChild(this.panel);
    f.appendChild(this.block);

    const row = headerRow({ backSize: 80, coins: opts.coins, onBack: () => (opts.onBack ?? (() => this.close()))(),
      onAddCoins: opts.onAddCoins });
    this.wallet = row.wallet;
    row.root.style.cssText += 'position:absolute;left:24px;top:40px;';
    f.appendChild(row.root);

    this.cleanup.push(subscribeTroop(() => { this.tab = 0; this.render(); }));
    this.render();
    this.mount();
  }

  close(): void {
    this.viewCleanup.forEach((c) => c());
    this.cleanup.forEach((c) => c());
    this.cleanup = [];
    super.close();
    const cb = this.opts.onClose;
    this.opts.onClose = undefined; // once
    cb?.();
  }

  private setTitle(title: string): void {
    this.header?.root.remove();
    this.header = critterHeader(title, { style: PLAQUE_SCREEN });
    this.header.root.style.cssText += 'position:absolute;left:90px;top:17.46px;';
    this.block.appendChild(this.header.root);
    fitTitle(this.header.title, 740);
  }

  private render(): void {
    this.viewCleanup.forEach((c) => c());
    this.viewCleanup = [];
    this.panel.replaceChildren();
    const troop = playerTroop();
    if (troop) this.renderTroop(troop.id, troop.name);
    else this.renderSolo();
  }

  // ── Solo: join / start ────────────────────────────────────────────────────

  private renderSolo(): void {
    this.setTitle('Scout Troops');
    const intro = el('p', `${TEXT}font-weight:600;font-size:30px;color:${MENU.sectionInk};text-align:center;width:${INNER_W}px;`,
      'Team up with other campers, chat, and boost Pony Beads + Camp Pass progress together!');
    const tabs = tabBar(['Join a Troop', 'Start a Troop'], this.soloTab, (i) => { this.soloTab = i; this.render(); },
      { width: INNER_W });
    const body = el('div', `flex:1 1 0;min-height:0;width:${INNER_W + 30}px;display:flex;flex-direction:column;align-items:center;`);
    this.panel.append(intro, tabs.root, body);
    if (this.soloTab === 0) this.renderJoinList(body);
    else this.renderStart(body);
  }

  private renderJoinList(body: HTMLElement): void {
    const player = this.opts.player();
    const list = scroller('flex:1 1 0;min-height:0;width:100%;display:flex;flex-direction:column;gap:22px;align-items:center;' +
      'padding:6px 0 40px;');
    const all = listTroops().map((t) => troopSummary(t.id, player)!).sort((a, b) => b.active - a.active);
    const featured = all.filter((s) => s.club?.featured);
    const rest = all.filter((s) => !s.club?.featured);
    list.appendChild(sectionHeading('ACTIVE CLUBS'));
    for (const s of featured) list.appendChild(this.troopCard(s, true));
    list.appendChild(sectionHeading('MORE TROOPS'));
    for (const s of rest) list.appendChild(this.troopCard(s, false));
    body.appendChild(list);
  }

  /** One troop in the Join list. Featured clubs get their motto, who's at camp, and the latest chat line. */
  private troopCard(s: TroopSummary, featured: boolean): HTMLElement {
    const card = rowCard(featured ? 'align-items:flex-start;' : '');
    if (featured && s.club) card.appendChild(emojiBadge(s.club.emoji));
    const info = el('div', 'display:flex;flex-direction:column;gap:8px;flex:1 1 0;min-width:0;');
    info.appendChild(el('p', `${TEXT}font-weight:700;font-size:38px;color:${COLORS.ink};overflow:hidden;text-overflow:ellipsis;` +
      'white-space:nowrap;', s.troop.name));
    if (featured && s.club) {
      info.appendChild(el('p', `${TEXT}font-weight:600;font-size:26px;color:${MENU.valueInk};font-style:italic;`, s.club.motto));
    }
    const meta = el('div', 'display:flex;gap:16px;align-items:center;flex-wrap:wrap;');
    if (s.atCamp > 0) meta.appendChild(liveDot());
    meta.appendChild(el('p', `${TEXT}font-weight:600;font-size:26px;color:${MENU.fill};white-space:nowrap;`,
      featured
        ? `${s.atCamp} at camp · ${s.active} active · ${s.members} members`
        : `${s.members} member${s.members === 1 ? '' : 's'} · ${s.active} active`));
    if (s.boost > 0) meta.appendChild(boostChip(s.boost));
    info.appendChild(meta);
    if (featured) {
      const msgs = troopChat(s.troop.id, this.opts.player).messages;
      const last = msgs[msgs.length - 1];
      if (last) {
        const preview = el('p', `${TEXT}font-weight:500;font-size:24px;color:${MENU.valueInk};background:${COLORS.cream};` +
          'border-radius:18px;padding:8px 16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
        preview.append(el('b', `color:${MENU.fill};`, `${last.from}: `), document.createTextNode(last.text));
        info.appendChild(preview);
      }
    }
    // The Shop's BUY at row scale (the wrapper scales; the button keeps its own press transform).
    const joinWrap = el('div', 'width:150px;display:flex;justify-content:flex-end;flex-shrink:0;align-self:center;' +
      'transform:scale(1.9);transform-origin:100% 50%;');
    joinWrap.appendChild(tinyButton('JOIN', 'brown', () => this.join(s.troop.id)));
    card.append(info, joinWrap);
    return card;
  }

  private renderStart(body: HTMLElement): void {
    const sec = sectionCard('NAME YOUR TROOP', true);
    sec.root.style.gap = '22px';
    const row = el('div', 'display:flex;gap:22px;align-items:center;width:100%;');
    const error = el('p', `${TEXT}font-weight:600;font-size:26px;color:${MENU.danger};min-height:34px;`);
    const field = textField('', { placeholder: 'Troop name', maxLength: TROOP_NAME_MAX, onInput: () => validate() });
    row.append(field.root, iconSquare(icon('ui', 'dice'), () => field.setValue(randomTroopName())));
    sec.body.append(row, error);
    const note = el('p', `${TEXT}font-weight:600;font-size:28px;color:${MENU.sectionInk};text-align:center;width:${INNER_W}px;`,
      'You\'ll be the Troop Leader. New campers will find your troop and join over time.');
    const go = pillButton('Start Troop!', () => {
      if (validate()) return;
      field.input.blur();
      const troop = createPlayerTroop(field.value());
      troopChat(troop.id, this.opts.player); // opens with an empty history
    }, 'wide');
    const wrap = el('div', 'display:flex;flex-direction:column;gap:34px;align-items:center;padding-top:10px;');
    wrap.append(sec.root, note, go);
    body.appendChild(wrap);
    const validate = (): string | null => {
      const problem = field.value().trim() ? troopNameProblem(field.value()) : 'Give your troop a name';
      error.textContent = field.value().trim() ? problem ?? '' : '';
      go.style.opacity = problem ? '0.45' : '1';
      return problem;
    };
    validate();
  }

  private join(troopId: string): void {
    joinPlayerTroop(troopId);
    this.tab = 1; // land in chat so the welcome lands in front of them
    this.render();
    troopChat(troopId, this.opts.player).welcome();
    this.opts.onJoined?.(troopId);
  }

  // ── In a troop ────────────────────────────────────────────────────────────

  private renderTroop(troopId: string, name: string): void {
    this.setTitle(name);
    const player = this.opts.player();
    const s = troopSummary(troopId, player)!;

    // Boost card.
    const card = sectionCard('TROOP BOOST', true);
    card.root.style.gap = '14px';
    const top = el('div', 'display:flex;align-items:center;justify-content:space-between;width:100%;');
    top.append(el('p', `${TEXT}font-weight:700;font-size:40px;color:${MENU.sectionInk};`,
      `+${s.boost.toFixed(1)}% Pony Beads & Camp Pass`),
    el('p', `${TEXT}font-weight:600;font-size:26px;color:${MENU.fill};white-space:nowrap;`,
      `${s.members} member${s.members === 1 ? '' : 's'} · ${s.active} active`));
    const track = el('div', `position:relative;width:100%;height:30px;background:#fff;border:4px solid ${MENU.trackBorder};` +
      'border-radius:16px;overflow:hidden;box-sizing:border-box;');
    track.appendChild(el('div', `position:absolute;left:0;top:0;bottom:0;width:${(s.boost / TROOP_BOOST.maxPercent) * 100}%;` +
      `background:${COLORS.coin};border-right:${s.boost > 0 ? 4 : 0}px solid ${COLORS.coinDark};`));
    if (s.club) {
      card.body.appendChild(el('p', `${TEXT}font-weight:600;font-size:28px;color:${MENU.valueInk};font-style:italic;`,
        `${s.club.emoji} ${s.club.motto}`));
    }
    card.body.append(top, track, el('p', `${TEXT}font-weight:500;font-size:24px;color:${MENU.valueInk};`,
      `Every store purchase by a troopmate adds +${TROOP_BOOST.perPurchase}% for 24h ` +
      `(max ${TROOP_BOOST.maxPercent}%). ${s.purchases} purchase${s.purchases === 1 ? '' : 's'} today.`));

    const tabs = tabBar(['Members', 'Chat'], this.tab, (i) => { this.tab = i; this.render(); }, { width: INNER_W });
    const body = el('div', `flex:1 1 0;min-height:0;width:${INNER_W + 30}px;display:flex;flex-direction:column;align-items:center;`);
    this.panel.append(card.root, tabs.root, body);
    if (this.tab === 0) this.renderMembers(body, troopRoster(troopId, player));
    else this.renderChat(body, troopId);
  }

  private renderMembers(body: HTMLElement, roster: TroopMember[]): void {
    const list = scroller('flex:1 1 0;min-height:0;width:100%;display:flex;flex-direction:column;gap:18px;align-items:center;' +
      'padding:6px 0 30px;');
    for (const m of roster) {
      const card = rowCard(m.isPlayer ? `border-color:${COLORS.blue};box-shadow:0 7.753px 0 ${COLORS.blueDark};` : '');
      const info = el('div', 'display:flex;flex-direction:column;gap:6px;flex:1 1 0;min-width:0;');
      info.appendChild(el('p', `${TEXT}font-weight:700;font-size:34px;color:${COLORS.ink};overflow:hidden;text-overflow:ellipsis;` +
        'white-space:nowrap;', m.name));
      const status = el('div', 'display:flex;gap:10px;align-items:center;');
      const on = m.status !== 'offline';
      status.append(el('div', `width:16px;height:16px;border-radius:50%;background:${on ? GREEN : '#b9b0a4'};flex-shrink:0;`),
        el('p', `${TEXT}font-weight:600;font-size:24px;color:${on ? MENU.fill : '#9a8f84'};white-space:nowrap;`, m.statusText));
      info.appendChild(status);
      card.append(avatar(m.art), info);
      if (m.leader) card.appendChild(chip('LEADER', COLORS.coinLight, COLORS.coin, COLORS.coinInk));
      if (m.isPlayer) card.appendChild(chip('YOU', COLORS.blueLight, COLORS.blue, '#fff'));
      if (!on) card.style.opacity = '0.75';
      list.appendChild(card);
    }
    list.appendChild(this.leaveLink());
    body.appendChild(list);
  }

  /** "Leave Troop" — needs a second tap within 3s. */
  private leaveLink(): HTMLElement {
    let armed = 0;
    const link = dangerLink('Leave Troop', () => {
      if (armed) { window.clearTimeout(armed); leavePlayerTroop(); return; }
      label.textContent = 'Tap again to leave';
      armed = window.setTimeout(() => { armed = 0; label.textContent = 'Leave Troop'; }, 3000);
    });
    const label = link.firstChild as HTMLElement;
    link.style.paddingTop = '24px';
    this.viewCleanup.push(() => window.clearTimeout(armed));
    return link;
  }

  private renderChat(body: HTMLElement, troopId: string): void {
    const chat = troopChat(troopId, this.opts.player);
    const log = scroller('flex:1 1 0;min-height:0;width:100%;display:flex;flex-direction:column;gap:16px;padding:6px 15px 20px;' +
      'box-sizing:border-box;');
    const empty = el('p', `${TEXT}font-weight:600;font-size:30px;color:${MENU.fill};text-align:center;padding-top:60px;`,
      'No messages yet — say hi to your troop!');
    const add = (m: TroopMessage) => {
      empty.remove();
      log.appendChild(this.bubble(m));
      log.scrollTop = log.scrollHeight;
    };
    if (chat.messages.length === 0) log.appendChild(empty);
    chat.messages.forEach(add);
    this.viewCleanup.push(chat.subscribe(add));
    chat.open();
    this.viewCleanup.push(() => chat.close());
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });

    // One-tap lines (no typing needed), then a free-text field.
    const quick = el('div', `display:flex;gap:14px;width:${INNER_W}px;overflow-x:auto;scrollbar-width:none;flex-shrink:0;` +
      'padding:4px 0 10px;touch-action:pan-x;');
    quick.classList.add('chonk-scroll');
    dragToScroll(quick, 'x');
    for (const line of TROOP_QUICK_LINES) {
      const q = el('div', `background:${COLORS.cream};border:4px solid ${COLORS.brown};box-shadow:0 6px 0 ${COLORS.brownDark};` +
        `border-radius:${buttonRadius(72)}px;height:72px;display:flex;align-items:center;padding:0 28px;flex-shrink:0;` +
        'cursor:pointer;touch-action:manipulation;transition:transform 60ms;');
      q.appendChild(el('p', `${TEXT}font-weight:700;font-size:28px;color:${COLORS.brown};white-space:nowrap;pointer-events:none;`, line));
      pressable(q, 6, () => chat.send(line));
      quick.appendChild(q);
    }
    const row = el('div', `display:flex;gap:18px;align-items:center;width:${INNER_W}px;flex-shrink:0;`);
    const field = textField('', { placeholder: 'Message your troop', maxLength: 120 });
    field.input.style.fontSize = '40px';
    const send = () => { chat.send(field.value()); field.setValue(''); };
    field.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    row.append(field.root, iconSquare(icon('ui', 'send'), send));
    body.append(log, quick, row);
  }

  private bubble(m: TroopMessage): HTMLElement {
    const wrap = el('div', `display:flex;flex-direction:column;gap:4px;max-width:78%;align-self:${m.mine ? 'flex-end' : 'flex-start'};`);
    const who = el('p', `${TEXT}font-weight:700;font-size:22px;color:${m.mine ? COLORS.blueDark : MENU.fill};` +
      `padding:0 18px;text-align:${m.mine ? 'right' : 'left'};`,
      `${m.mine ? 'You' : m.from} · ${new Date(m.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    const text = el('p', `${TEXT}font-weight:600;font-size:30px;color:${m.mine ? '#fff' : COLORS.ink};` +
      `background:${m.mine ? COLORS.blue : '#fff'};border:4px solid ${m.mine ? COLORS.blueDark : COLORS.cardBorder};` +
      `border-radius:26px;padding:12px 22px;word-break:break-word;`, m.text);
    wrap.append(who, text);
    return wrap;
  }
}

export function showTroopScreen(host: HTMLElement, opts: TroopScreenOptions): TroopScreen {
  return new TroopScreen(host, opts);
}
