// Menu screens — Settings (Figma 42:4680) and Leaderboard (42:4887). Both sit on
// the dimmed camp backdrop with the header row + critter title, like Character Select.

import { COLORS } from './theme';
import { critterHeader, el, PLAQUE_MODAL, PLAQUE_SCREEN } from './components';
import { headerRow, pillButton } from './store-components';
import { StoreScreen, campBackdrop, scroller } from './store-screens';
import {
  accountLine, chunkyScrollbar, contentPanel, dangerLink, optionRow, rankRow, sectionCard, slider,
} from './menu-components';
import type { LeaderboardEntry } from './leaderboard-presets';

// ── Settings ────────────────────────────────────────────────────────────────

/** Declarative settings content, so new options are data, not layout code. */
export type SettingControl =
  | { kind: 'slider'; key: string; label: string; value: number; format?: (v: number) => string }
  | { kind: 'options'; key: string; label: string; options: string[]; value: number };

export interface SettingsSection { title: string; controls: SettingControl[]; }

export interface SettingsOptions {
  sections: SettingsSection[];
  coins: number;
  playerName: string;
  title?: string;
  /** Fires on every change — `value` is 0..1 for sliders, the option index for option rows. */
  onChange?: (key: string, value: number) => void;
  onLogOut?: () => void;
  onDeleteAccount?: () => void;
  onBack?: () => void;
  onAddCoins?: () => void;
}

export class SettingsScreen extends StoreScreen {
  constructor(host: HTMLElement, opts: SettingsOptions) {
    super(host);
    const f = this.frame;
    campBackdrop(f);

    // Content block (1000 wide at x40, y200 in Figma).
    const block = el('div', 'position:absolute;left:40px;top:200px;width:1000px;bottom:0;');
    const header = critterHeader(opts.title ?? 'Settings', { style: PLAQUE_SCREEN });
    header.root.style.cssText += 'position:absolute;left:90px;top:17.46px;';

    // Panel scrolls internally once the sections outgrow the screen.
    const panel = contentPanel('position:absolute;left:8.532px;top:496.762px;max-height:calc(100% - 496.762px - 80px);' +
      'overflow:hidden;');
    const list = scroller('display:flex;flex-direction:column;gap:15.46px;align-items:center;width:891.923px;' +
      'max-height:100%;min-height:0;flex:1 1 auto;padding:14px 0;margin:-14px 0;');

    for (const sec of opts.sections) {
      const card = sectionCard(sec.title);
      const gap = sec.controls.some((c) => c.kind === 'slider') ? 16 : 10;
      card.root.style.gap = `${gap}px`;
      for (const c of sec.controls) {
        if (c.kind === 'slider') {
          card.body.appendChild(slider(c.label, c.value, (v) => opts.onChange?.(c.key, v), c.format).root);
        } else {
          card.body.appendChild(optionRow(c.label, c.options, c.value, (i) => opts.onChange?.(c.key, i)).root);
        }
      }
      list.appendChild(card.root);
    }

    // ACCOUNT (Figma section-card-account).
    const acct = sectionCard('ACCOUNT', true);
    const actions = el('div', 'display:flex;flex-direction:column;gap:27.304px;align-items:flex-start;width:100%;');
    actions.append(pillButton('Log Out', () => opts.onLogOut?.(), 'wide'),
      dangerLink('Delete Account', () => opts.onDeleteAccount?.()));
    acct.body.append(accountLine(opts.playerName), actions);
    list.appendChild(acct.root);

    panel.appendChild(list);
    block.append(header.root, panel);
    f.appendChild(block);

    const row = headerRow({ backSize: 80, coins: opts.coins, onBack: () => (opts.onBack ?? (() => this.close()))(),
      onAddCoins: opts.onAddCoins });
    this.wallet = row.wallet;
    row.root.style.cssText += 'position:absolute;left:24px;top:40px;';
    f.appendChild(row.root);

    this.mount();
  }
}

export function showSettings(host: HTMLElement, opts: SettingsOptions): SettingsScreen {
  return new SettingsScreen(host, opts);
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardOptions {
  entries: LeaderboardEntry[];
  coins: number;
  /** Open scrolled to the player's row. Off by default (opens at the top) — turn on once real scores exist. */
  focusPlayer?: boolean;
  title?: string;
  doneLabel?: string;
  onDone?: () => void;
  onBack?: () => void;
  onAddCoins?: () => void;
}

export class LeaderboardScreen extends StoreScreen {
  constructor(host: HTMLElement, opts: LeaderboardOptions) {
    super(host);
    const f = this.frame;
    campBackdrop(f);
    const close = () => this.close();

    // Block 1000 × 1611 centred at 50% − 66.5 (Figma 42:4890).
    const block = el('div', 'position:absolute;left:50%;width:1000px;height:1611.458px;transform:translateX(-50%);');
    const board = el('div',
      `position:absolute;left:0;top:355.21px;width:1000px;height:1256.25px;background:${COLORS.cream};` +
      `border:8.823px solid ${COLORS.brown};border-radius:66.169px;box-shadow:0 17.646px 0 0 ${COLORS.brownDark};` +
      'overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:80px 41.667px 0;');
    const content = el('div', 'display:flex;gap:8.333px;align-items:flex-start;justify-content:center;height:1120px;width:874px;flex-shrink:0;');
    const rows = scroller('position:relative;display:flex;flex-direction:column;gap:16.667px;align-items:center;height:1120px;width:840.347px;' +
      'padding-bottom:40px;flex-shrink:0;');
    let playerRow: HTMLElement | null = null;
    opts.entries.forEach((e, i) => {
      const r = rankRow(i + 1, e.name, e.score);
      if (e.isPlayer) playerRow = r; // same styling as its rank; the board just scrolls to it
      rows.appendChild(r);
    });
    content.append(rows, chunkyScrollbar(rows, 1084.375));
    board.appendChild(content);
    const header = critterHeader(opts.title ?? 'Leaderboard', { style: PLAQUE_MODAL });
    header.root.style.cssText += 'position:absolute;left:90px;top:-48.77px;';
    block.append(board, header.root);

    // Centre via a wrapper so the button's own transform stays free for the press sink.
    const done = el('div', 'position:absolute;left:-1px;right:0;display:flex;justify-content:center;');
    done.appendChild(pillButton(opts.doneLabel ?? 'DONE!', () => (opts.onDone ?? close)(), 'done'));
    f.append(block, done);

    const row = headerRow({ backSize: 80, coins: opts.coins, onBack: () => (opts.onBack ?? close)(), onAddCoins: opts.onAddCoins });
    this.wallet = row.wallet;
    row.root.style.cssText += 'position:absolute;left:24px;top:40px;';
    f.appendChild(row.root);

    this.mount((h) => {
      const top = Math.max(150, h / 2 - 66.5 - 805.729);
      block.style.top = `${top}px`;
      // DONE! sits 98px under the board in Figma (top 2007 on a 2340 frame); keep it on-screen.
      done.style.top = `${Math.min(top + 1709.2, h - 180 - 40)}px`;
    });
    if (playerRow && opts.focusPlayer) {
      const pr = playerRow as HTMLElement;
      requestAnimationFrame(() => { rows.scrollTop = pr.offsetTop - (rows.clientHeight - pr.offsetHeight) / 2; });
    }
  }
}

export function showLeaderboard(host: HTMLElement, opts: LeaderboardOptions): LeaderboardScreen {
  return new LeaderboardScreen(host, opts);
}
