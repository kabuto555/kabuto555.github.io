import type { EventBus } from '../core/events';
import { CONSUMABLES, ITEMS_BY_ID } from '../data';
import { AmmoBlock } from './ammo';
import type { UiCtx } from './ctx';
import { CrossSlots } from './crossSlots';
import { h, setText, show, toggle } from './dom';
import './events';
import { iconUrl } from './icons';
import { barWidthPx, damageArcDeg, fmtClock, fmtInt } from './logic';
import { Prompts, type PromptOptions } from './prompts';
import type { Hud } from './types';

interface Buff {
  el: HTMLElement;
  t: HTMLElement;
  remaining: number;
  shown: string;
}

const BUFF_BY_ID = new Map<string, string>();
for (const c of Object.values(CONSUMABLES)) if (c.effect.type === 'buff') BUFF_BY_ID.set(c.effect.buffId, c.id);

/** Restart a CSS animation class. */
function retrigger(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/**
 * Gameplay HUD (DS1 left, COD right). DOM overlay; components poll game state each render frame but only
 * write the DOM when a displayed value changes, except bar fills (CSS transforms).
 */
export class HudImpl implements Hud {
  readonly el = h('div', 'hud');
  readonly ammo: AmmoBlock;
  readonly cross: CrossSlots;
  readonly prompts: Prompts;
  /** Mount point for the toast queue (top-left stack). */
  readonly toastBox = h('div', 'toasts');

  // bars
  private readonly hpBar = h('div', 'bar hp');
  private readonly hpFill = h('div', 'fill');
  private readonly hpGhost = h('div', 'ghost');
  private readonly stBar = h('div', 'bar st');
  private readonly stFill = h('div', 'fill');
  private readonly chip = h('span', 'chip');
  private hpR = -1;
  private ghostR = 1;
  private ghostHold = 0;
  private ghostShown = -1;
  private stR = -1;
  private hpMax = -1;
  private stMax = -1;
  // buffs
  private readonly buffsEl = h('div', 'buffs');
  private readonly buffs = new Map<string, Buff>();
  // souls
  private readonly soulsVal = h('span', 'val');
  private readonly pops = h('div', 'pops');
  private souls = -1;
  // center
  private readonly xh = h('div', 'xh');
  private readonly xhBars: HTMLElement[] = [];
  private readonly hm = h('div', 'hm', [h('i'), h('i'), h('i'), h('i')]);
  private xhSig = '';
  // overlays
  private readonly vig = h('div', 'vig');
  private vigV = -1;
  private readonly arcs: HTMLElement[] = [];
  private arcI = 0;
  // boss
  private readonly boss = h('div', 'boss');
  private readonly bossName = h('div', 'bn');
  private readonly bossFill = h('i');
  private bossR = -1;

  private offs: (() => void)[] = [];
  private hintsOn: boolean | null = null;

  constructor(
    private readonly ctx: UiCtx,
    promptOpts: PromptOptions = {},
  ) {
    this.ammo = new AmmoBlock(ctx);
    this.cross = new CrossSlots(ctx, () => ctx.hints.poke(ctx.now()));
    this.prompts = new Prompts(ctx, promptOpts);

    for (const f of [this.hpGhost, this.hpFill]) this.hpBar.append(f);
    this.stBar.append(this.stFill);
    const bars = h('div', 'bars', [h('div', 'barrow', [this.hpBar]), h('div', 'barrow', [this.stBar, this.chip])]);

    for (let i = 0; i < 4; i++) {
      const b = h('i');
      this.xhBars.push(b);
      this.xh.append(b);
    }
    this.xh.append(h('i', 'dot'));

    for (let i = 0; i < 4; i++) {
      const a = h('div', 'arc', [h('i')]);
      this.arcs.push(a);
    }

    const souls = h('div', 'souls', [h('span', 'lbl', 'SOULS'), this.soulsVal, this.pops]);
    this.boss.append(this.bossName, h('div', 'bb', [this.bossFill]));
    show(this.boss, false);

    this.el.append(this.vig, ...this.arcs, bars, this.buffsEl, this.toastBox, this.xh, this.hm, this.prompts.el, this.cross.el, h('div', 'br', [souls, this.ammo.el]), this.boss);
  }

  mount(root: HTMLElement, bus: EventBus): void {
    root.append(this.el);
    this.prompts.mount(bus);
    this.offs.push(
      bus.on('hit', (e) => {
        this.hm.classList.toggle('kill', e.killed);
        this.hm.classList.toggle('head', e.headshot && !e.killed);
        this.hm.classList.toggle('block', e.blocked);
        retrigger(this.hm, 'on');
      }),
      bus.on('soulsChanged', (e) => this.pop(e.delta)),
      bus.on('buffChanged', (e) => this.onBuff(e.buffId, e.active, e.remaining)),
      bus.on('damage', (e) => {
        if (e.target !== this.ctx.player.id || !(e.amount > 0)) return;
        const d = e.dir;
        if (!d) return;
        const arc = this.arcs[this.arcI++ % this.arcs.length]!;
        arc.style.transform = `rotate(${damageArcDeg(this.ctx.player.state.yaw, d.x, d.z).toFixed(0)}deg)`;
        retrigger(arc, 'on');
      }),
      bus.on('bossBar', (e) => {
        show(this.boss, e.show);
        if (!e.show) return;
        if (e.name !== undefined) setText(this.bossName, e.name);
        if (e.hp !== undefined && e.max) {
          const r = Math.max(0, Math.min(1, e.hp / e.max));
          if (r !== this.bossR) {
            this.bossR = r;
            this.bossFill.style.transform = `scaleX(${r})`;
          }
        }
      }),
      bus.on('bonfireRest', () => this.ctx.hints.poke(this.ctx.now())),
      bus.on('estusChanged', () => this.ctx.hints.poke(this.ctx.now())),
      bus.on('weaponSwap', () => this.ctx.hints.poke(this.ctx.now())),
      bus.on('quickBeltChanged', () => this.ctx.hints.poke(this.ctx.now())),
    );
    this.ctx.hints.poke(this.ctx.now()); // spawn: show keycaps for 8 s
  }

  unmount(): void {
    for (const o of this.offs) o();
    this.offs = [];
    this.prompts.unmount();
    this.el.remove();
  }

  setVisible(v: boolean): void {
    show(this.el, v);
  }

  private pop(delta: number): void {
    if (delta === 0) return;
    const p = h('div', delta < 0 ? 'pop neg' : 'pop', `${delta > 0 ? '+' : '-'}${fmtInt(Math.abs(delta))}`);
    p.addEventListener('animationend', () => p.remove());
    this.pops.append(p);
    while (this.pops.childElementCount > 4) this.pops.firstElementChild?.remove();
  }

  private onBuff(id: string, active: boolean, remaining: number): void {
    const cur = this.buffs.get(id);
    if (!active || remaining <= 0) {
      if (cur) {
        cur.el.remove();
        this.buffs.delete(id);
      }
      return;
    }
    if (cur) {
      cur.remaining = remaining;
      return;
    }
    const itemId = BUFF_BY_ID.get(id);
    const def = itemId ? ITEMS_BY_ID.get(itemId) : undefined;
    const img = h('img', 'ic s') as HTMLImageElement;
    img.src = iconUrl(itemId ?? id);
    const t = h('span');
    const el = h('div', 'buff', [img, t]);
    if (def) el.title = def.name;
    this.buffsEl.append(el);
    this.buffs.set(id, { el, t, remaining, shown: '' });
  }

  update(dt: number): void {
    const { player } = this.ctx;
    const hp = player.health;
    const st = player.state;

    // --- bars
    if (hp.maxHp !== this.hpMax) {
      this.hpMax = hp.maxHp;
      this.hpBar.style.width = `${barWidthPx(hp.maxHp, 100, 140, 3, 420)}px`;
    }
    if (st.maxStamina !== this.stMax) {
      this.stMax = st.maxStamina;
      this.stBar.style.width = `${barWidthPx(st.maxStamina, 100, 120, 2, 360)}px`;
    }
    const hr = hp.maxHp > 0 ? Math.max(0, Math.min(1, hp.hp / hp.maxHp)) : 0;
    if (hr !== this.hpR) {
      if (hr > this.hpR) this.ghostR = hr;
      else this.ghostHold = 0.5;
      this.hpR = hr;
      this.hpFill.style.transform = `scaleX(${hr})`;
    }
    if (this.ghostR > hr) {
      if (this.ghostHold > 0) this.ghostHold -= dt;
      else this.ghostR = Math.max(hr, this.ghostR - dt * 0.5);
    }
    const gq = Math.round(this.ghostR * 200) / 200;
    if (gq !== this.ghostShown) {
      this.ghostShown = gq;
      this.hpGhost.style.transform = `scaleX(${gq})`;
    }
    const sr = st.maxStamina > 0 ? Math.max(0, Math.min(1, st.stamina / st.maxStamina)) : 0;
    const sq = Math.round(sr * 200) / 200;
    if (sq !== this.stR) {
      this.stR = sq;
      this.stFill.style.transform = `scaleX(${sq})`;
    }
    toggle(this.stBar, 'exh', st.exhausted);
    const tier = player.rollTier;
    if (this.chip.dataset.t !== tier) {
      this.chip.dataset.t = tier;
      this.chip.className = `chip ${tier}`;
      this.chip.textContent = tier.toUpperCase();
    }

    // --- low HP vignette (no regen: stays until you drink)
    const vv = hr < 0.3 ? Math.round(((0.3 - hr) / 0.3) * 20) / 20 : 0;
    if (vv !== this.vigV) {
      this.vigV = vv;
      this.vig.style.opacity = String(vv);
    }

    // --- souls
    const souls = this.ctx.wallet.souls;
    if (souls !== this.souls) {
      this.souls = souls;
      setText(this.soulsVal, fmtInt(souls));
    }

    // --- buff timers
    for (const [id, b] of this.buffs) {
      b.remaining -= dt;
      if (b.remaining <= 0) {
        b.el.remove();
        this.buffs.delete(id);
        continue;
      }
      const s = fmtClock(b.remaining);
      if (s !== b.shown) {
        b.shown = s;
        b.t.textContent = s;
      }
    }

    // --- crosshair: widens with spread, hides on ADS
    const ads = Math.max(0, Math.min(1, this.ctx.combat.ads));
    const gap = Math.round(Math.max(3, this.ctx.combat.lastSpread * 9 + 5) * (1 - 0.7 * ads));
    const op = Math.round((1 - ads) * 10) / 10;
    const xs = `${gap}|${op}`;
    if (xs !== this.xhSig) {
      this.xhSig = xs;
      const L = 6;
      const set = (el: HTMLElement, x: number, y: number, w: number, hh: number) => {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.width = `${w}px`;
        el.style.height = `${hh}px`;
      };
      set(this.xhBars[0]!, -gap - L, -1, L, 2);
      set(this.xhBars[1]!, gap, -1, L, 2);
      set(this.xhBars[2]!, -1, -gap - L, 2, L);
      set(this.xhBars[3]!, -1, gap, 2, L);
      this.xh.style.opacity = String(op);
    }

    // --- key hints
    const on = this.ctx.hints.visible(this.ctx.now());
    if (on !== this.hintsOn) {
      this.hintsOn = on;
      this.el.classList.toggle('hints-on', on);
    }

    this.cross.update(dt);
    this.ammo.update();
    this.prompts.update();
  }
}

export function createHud(ctx: UiCtx, promptOpts?: PromptOptions): HudImpl {
  return new HudImpl(ctx, promptOpts);
}
