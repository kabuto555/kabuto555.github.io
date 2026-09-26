// DOM HUD for ApeStrike — clean, minimal, portrait-safe
import type { PlayerState } from '../types';
import { makePickupIconCanvas } from '../ui/damageNumbers';

export interface HudElements {
  hpFill: HTMLDivElement;
  expFill: HTMLDivElement;
  scoreEl: HTMLDivElement;
  stageEl: HTMLDivElement;
  levelEl: HTMLDivElement;
  hpText: HTMLDivElement;
  atkText: HTMLDivElement;
  boostEl: HTMLDivElement;
  boostReminder: HTMLDivElement;
  weaponEl: HTMLDivElement;
  bossWrap: HTMLDivElement;
  bossFill: HTMLDivElement;
  overlay: HTMLDivElement;
  container: HTMLDivElement;
}

// Safe-edge shorthand
const TOP  = 'max(10px,env(safe-area-inset-top),var(--sat,0px))';
const LEFT = 'max(10px,env(safe-area-inset-left),var(--sal,0px))';
const RIGHT = 'max(10px,env(safe-area-inset-right),var(--sar,0px))';
const BOT  = 'max(10px,env(safe-area-inset-bottom),var(--sab,0px))';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, css: string, parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (parent) parent.appendChild(e);
  return e;
}

export function createHud(parent: HTMLElement): HudElements {
  const container = el('div',
    'position:absolute;inset:0;pointer-events:none;' +
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;",
    parent as HTMLElement,
  );

  // ── Top strip: score | stage | level ─────────────────────────────────────
  // One semi-transparent pill across the top — no stacking rows.
  const topStrip = el('div',
    `position:absolute;top:${TOP};left:${LEFT};right:${RIGHT};` +
    'display:flex;align-items:center;justify-content:space-between;' +
    'background:rgba(0,0,0,0.42);border-radius:8px;' +
    'padding:5px 10px;backdrop-filter:blur(4px);',
    container,
  );

  const scoreEl = el('div',
    'color:#fff;font-size:clamp(11px,2.8vmin,17px);font-weight:700;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.7);',
    topStrip,
  );
  scoreEl.textContent = '0';

  const stageEl = el('div',
    'color:#aaccff;font-size:clamp(10px,2.5vmin,15px);font-weight:600;' +
    'letter-spacing:0.04em;',
    topStrip,
  );
  stageEl.textContent = 'STAGE 1';

  const levelEl = el('div',
    'color:#aaffcc;font-size:clamp(10px,2.5vmin,15px);font-weight:700;',
    topStrip,
  );
  levelEl.textContent = 'Lv 1';

  // Shared bar-row style: label | track side-by-side
  const barRowCss =
    'display:flex;align-items:center;gap:6px;' +
    `left:${LEFT};right:${RIGHT};position:absolute;`;
  const labelCss =
    'font-size:clamp(9px,2vmin,12px);font-weight:700;letter-spacing:0.05em;' +
    'white-space:nowrap;flex-shrink:0;width:clamp(34px,8vmin,50px);text-align:right;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.9);';

  // ── HP bar row ────────────────────────────────────────────────────────────
  const hpRow = el('div',
    barRowCss + `top:calc(${TOP} + clamp(30px,7vmin,46px));`,
    container,
  );
  const hpLabel = el('div', labelCss + 'color:rgba(255,120,150,1);', hpRow);
  hpLabel.textContent = 'Health';

  const hpTrack = el('div',
    'flex:1;position:relative;height:clamp(12px,3vmin,18px);' +
    'background:rgba(255,255,255,0.15);border-radius:5px;overflow:hidden;',
    hpRow,
  );
  const hpFill = el('div',
    'position:absolute;inset:0;width:100%;background:#ff3366;' +
    'border-radius:5px;transition:width 0.12s,background 0.3s;',
    hpTrack,
  );
  // HP numbers sit on top of the fill inside the track
  const hpText = el('div',
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'font-size:clamp(8px,1.9vmin,12px);font-weight:700;color:#fff;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.9);pointer-events:none;',
    hpTrack,
  );

  // ── EXP bar row ───────────────────────────────────────────────────────────
  const expRow = el('div',
    barRowCss + `top:calc(${TOP} + clamp(48px,11vmin,70px));`,
    container,
  );
  const expLabel = el('div', labelCss + 'color:rgba(140,255,180,1);', expRow);
  expLabel.textContent = 'XP';

  const expTrack = el('div',
    'flex:1;height:clamp(7px,1.8vmin,11px);background:rgba(255,255,255,0.10);' +
    'border-radius:4px;overflow:hidden;',
    expRow,
  );
  const expFill = el('div',
    'width:0%;height:100%;background:#88ffaa;border-radius:4px;transition:width 0.3s;',
    expTrack,
  );

  // ── Boost + ATK line: just below XP bar ──────────────────────────────────
  const statRow = el('div',
    `position:absolute;` +
    `top:calc(${TOP} + clamp(62px,14.5vmin,92px));` +
    `left:${LEFT};right:${RIGHT};` +
    'display:flex;justify-content:space-between;align-items:center;',
    container,
  );
  const atkText = el('div',
    'color:rgba(100,220,255,0.9);font-size:clamp(9px,2.2vmin,13px);font-weight:600;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.8);',
    statRow,
  );
  const boostEl = el('div',
    'color:rgba(100,220,255,0.9);font-size:clamp(9px,2.2vmin,13px);font-weight:700;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.8);letter-spacing:0.04em;',
    statRow,
  );
  boostEl.textContent = 'BOOST';

  // ── Weapon pills: bottom-left, stacked vertically ────────────────────────
  // A container that shows one pill per collected weapon.
  const weaponEl = el('div',
    `position:absolute;bottom:calc(${BOT} + 10px);left:${LEFT};` +
    'display:flex;flex-direction:column;gap:4px;align-items:flex-start;',
    container,
  );

  // ── Boss bar: bottom-center ───────────────────────────────────────────────
  const bossWrap = el('div',
    `position:absolute;bottom:calc(${BOT} + 10px);` +
    'left:50%;transform:translateX(-50%);' +
    'width:min(55vmin,280px);display:none;flex-direction:column;align-items:center;gap:3px;',
    container,
  );
  bossWrap.id = 'apeStrikeBossWrap';

  const bossLabel = el('div',
    'color:#ff4444;font-size:clamp(9px,2.2vmin,13px);font-weight:800;' +
    'letter-spacing:0.08em;text-shadow:0 1px 3px rgba(0,0,0,0.9);',
    bossWrap,
  );
  bossLabel.textContent = '⚠ BOSS';

  const bossTrack = el('div',
    'width:100%;height:clamp(6px,1.6vmin,10px);background:rgba(255,255,255,0.18);' +
    'border-radius:4px;overflow:hidden;',
    bossWrap,
  );
  const bossFill = el('div',
    'width:100%;height:100%;background:#ff2200;border-radius:4px;transition:width 0.1s;',
    bossTrack,
  );

  // ── Boost reminder: shown centre-screen between stages ──────────────────
  const boostReminder = el('div',
    'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
    'display:none;flex-direction:column;align-items:center;gap:4px;pointer-events:none;',
    container,
  );
  const _brLine1 = el('div',
    'color:#ffee44;font-size:clamp(13px,3.5vmin,22px);font-weight:800;' +
    'text-shadow:0 0 12px #ffaa00,0 2px 4px rgba(0,0,0,0.9);letter-spacing:0.06em;',
    boostReminder,
  );
  _brLine1.textContent = 'DOUBLE-TAP TO BOOST';
  const _brLine2 = el('div',
    'color:rgba(255,255,255,0.75);font-size:clamp(10px,2.5vmin,16px);font-weight:600;' +
    'text-shadow:0 1px 3px rgba(0,0,0,0.9);',
    boostReminder,
  );
  _brLine2.textContent = 'cross to the next stage faster';

  // ── Full-screen overlay ───────────────────────────────────────────────────
  const overlay = el('div',
    'position:absolute;inset:0;display:none;flex-direction:column;' +
    'align-items:center;justify-content:center;pointer-events:auto;' +
    'background:rgba(0,0,0,0.65);',
    container,
  );

  return {
    hpFill, expFill, scoreEl, stageEl, levelEl,
    hpText, atkText, boostEl, boostReminder,
    weaponEl, bossWrap, bossFill, overlay, container,
  };
}

// Weapon display names (no emoji)
const WEAPON_NAMES: Record<string, string> = {
  vulcan:  'VULCAN',
  missile: 'MISSILE',
  beam:    'BEAM',
  sword:   'SWORD',
};

export function updateHud(els: HudElements, player: PlayerState, stageIndex: number, themeName?: string): void {
  // HP
  const hpPct = Math.max(0, player.hp / player.maxHp) * 100;
  els.hpFill.style.width = `${hpPct}%`;
  els.hpFill.style.background = hpPct > 40 ? '#ff3366' : hpPct > 20 ? '#ff8800' : '#ff2200';

  // EXP
  els.expFill.style.width = `${(player.exp / player.expToNext) * 100}%`;

  // Top strip
  els.scoreEl.textContent = player.score.toLocaleString();
  els.stageEl.textContent = themeName ? `S${stageIndex + 1} ${themeName}` : `STAGE ${stageIndex + 1}`;
  els.levelEl.textContent = `Lv ${player.level}`;

  // HP numbers on bar
  els.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
  els.atkText.textContent = `ATK x${player.damageMultiplier.toFixed(2)}`;
  // boostEl updated separately via updateBoostHud

  // Weapon pills — rebuild only when loadout changes
  const desired = player.weapons.map(w => `${w.type}:${w.level}`).join('|');
  if (els.weaponEl.dataset['weapons'] !== desired) {
    els.weaponEl.dataset['weapons'] = desired;
    els.weaponEl.innerHTML = '';
    for (const w of player.weapons) {
      const pill = document.createElement('div');
      pill.style.cssText =
        'display:flex;align-items:center;gap:4px;' +
        'background:rgba(0,0,0,0.55);border-radius:6px;padding:3px 6px;' +
        'white-space:nowrap;pointer-events:none;';
      // Canvas icon matching in-game pickup shape
      const iconSize = 22;
      const iconCanvas = makePickupIconCanvas(w.type, iconSize);
      iconCanvas.style.cssText = `width:${iconSize}px;height:${iconSize}px;flex-shrink:0;`;
      pill.appendChild(iconCanvas);
      // Weapon name
      const nameEl = document.createElement('span');
      nameEl.style.cssText = 'color:#fff;font-size:clamp(8px,2vmin,12px);font-weight:700;letter-spacing:0.04em;';
      nameEl.textContent = WEAPON_NAMES[w.type] ?? w.type.toUpperCase();
      pill.appendChild(nameEl);
      // Level dots (filled circles)
      const dotsEl = document.createElement('span');
      dotsEl.style.cssText = 'color:rgba(255,255,255,0.7);font-size:clamp(7px,1.8vmin,11px);';
      dotsEl.textContent = String.fromCodePoint(0x25cf).repeat(w.level);
      pill.appendChild(dotsEl);
      els.weaponEl.appendChild(pill);
    }
  }
}

export function updateBoostHud(els: HudElements, boostTimer: number, boostCooldown: number, boostDuration: number, cooldownTotal: number): void {
  const el = els.boostEl;
  if (boostTimer > 0) {
    el.textContent = 'BOOSTING';
    el.style.color = '#ffee44';
    el.style.textShadow = '0 0 8px #ffaa00, 0 1px 3px rgba(0,0,0,0.8)';
  } else if (boostCooldown > 0) {
    const pct = Math.ceil((1 - boostCooldown / cooldownTotal) * 100);
    el.textContent = `BOOST ${pct}%`;
    el.style.color = 'rgba(100,180,255,0.5)';
    el.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
  } else {
    el.textContent = 'BOOST READY';
    el.style.color = 'rgba(100,220,255,0.9)';
    el.style.textShadow = '0 1px 3px rgba(0,0,0,0.8)';
  }
}

export function showBossBar(els: HudElements, hpPct: number): void {
  els.bossWrap.style.display = 'flex';
  els.bossFill.style.width = `${Math.max(0, hpPct * 100)}%`;
}

export function hideBossBar(els: HudElements): void {
  els.bossWrap.style.display = 'none';
}

export function showOverlay(
  els: HudElements, title: string, sub: string, btnLabel: string, onBtn: () => void,
): void {
  els.overlay.style.display = 'flex';
  els.overlay.innerHTML = '';

  const t = document.createElement('div');
  t.textContent = title;
  t.style.cssText = 'color:#fff;font-size:clamp(22px,7vmin,48px);font-weight:800;' +
    'text-shadow:0 2px 8px rgba(0,0,0,0.9);margin-bottom:10px;';
  els.overlay.appendChild(t);

  const s = document.createElement('div');
  s.textContent = sub;
  s.style.cssText = 'color:#adf;font-size:clamp(13px,3.5vmin,20px);margin-bottom:28px;';
  els.overlay.appendChild(s);

  const btn = document.createElement('button');
  btn.textContent = btnLabel;
  btn.style.cssText =
    'pointer-events:auto;background:#0874f7;color:#fff;border:none;border-radius:14px;' +
    'padding:15px 34px;font-size:clamp(14px,4vmin,20px);font-weight:700;cursor:pointer;' +
    'min-width:44px;min-height:44px;touch-action:manipulation;';
  btn.addEventListener('click', onBtn);
  els.overlay.appendChild(btn);
}

export function hideOverlay(els: HudElements): void {
  els.overlay.style.display = 'none';
}
