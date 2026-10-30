import { AMMO, GUN_LIST } from '../data';
import type { GunDef } from '../data/types';
import type { UiCtx } from './ctx';
import { h, kc, setText, show, toggle } from './dom';
import { iconUrl } from './icons';
import { ammoStates, filledTicks, fireModeTag, tickLayout } from './logic';

/**
 * COD ammo block (bottom-right): gun name + fire-mode tag, mag tick bar, big `MAG | RESERVE` with ammo-type
 * icon, [R] reload prompt / NO AMMO + swap hint, and the off-hand gun ghost. Polls combat each frame but only
 * touches the DOM when a displayed value changes.
 */
export class AmmoBlock {
  readonly el = h('div', 'gun');
  private readonly nameEl = h('span', 'n');
  private readonly tagEl = h('span', 'tag');
  private readonly ticksEl = h('div', 'ticks');
  private readonly magEl = h('span', 'mag');
  private readonly sepEl = h('span', 'sep', '│');
  private readonly resEl = h('span', 'res');
  private readonly icEl = h('img', 'ic s') as HTMLImageElement;
  private readonly subEl = h('div', 'sub');
  private readonly reloadEl = h('span', 'reload');
  private readonly noAmmoEl = h('span', 'noammo');
  private readonly rbar = h('div', 'rbar');
  private readonly rfill = h('i');
  private readonly offEl = h('div', 'offhand');
  private readonly offTxt = h('span');
  private readonly offKey = h('span', 'hint');
  private ticks: HTMLElement[] = [];
  private per = 1;
  private lit = 0;
  private gunId = '';
  private sig = '';
  private offSig = '';
  private rr = -1;

  constructor(private readonly ctx: UiCtx) {
    const head = h('div', '', [this.nameEl, this.tagEl]);
    this.icEl.draggable = false;
    const big = h('div', 'big', [this.magEl, this.sepEl, this.resEl, this.icEl]);
    this.rbar.append(this.rfill);
    this.subEl.append(this.reloadEl, this.noAmmoEl);
    this.offEl.append(this.offTxt, ' ', this.offKey);
    this.el.append(head, this.ticksEl, big, this.rbar, this.subEl, this.offEl);
    this.rbar.style.visibility = 'hidden';
  }

  private buildTicks(magSize: number): void {
    const t = tickLayout(magSize);
    this.per = t.per;
    this.ticksEl.textContent = '';
    this.ticks = [];
    for (let i = 0; i < t.ticks; i++) {
      const e = h('i', 'tk');
      this.ticks.push(e);
      this.ticksEl.append(e);
    }
    this.lit = 0;
  }

  private ammoOf(def: GunDef): { reserve: number; cap: number } {
    return { reserve: this.ctx.combat.ammo.get(def.ammo), cap: this.ctx.combat.ammo.cap(def.ammo) };
  }

  update(): void {
    const c = this.ctx.combat;
    const def = c.gunDefNow;
    const gs = c.gun;
    if (!def || !gs) {
      if (this.sig !== 'none') {
        this.sig = 'none';
        this.gunId = '';
        setText(this.nameEl, 'No gun');
        setText(this.tagEl, '');
        setText(this.magEl, '-');
        setText(this.resEl, '');
        this.ticksEl.textContent = '';
        this.ticks = [];
        this.icEl.style.display = 'none';
        setText(this.reloadEl, '');
        setText(this.noAmmoEl, '');
      }
      this.updateOff();
      return;
    }
    const { reserve, cap } = this.ammoOf(def);
    const reloading = gs.reloading;
    const sig = `${def.id}|${gs.mag}|${reserve}|${cap}|${reloading ? 1 : 0}`;
    if (sig !== this.sig) {
      this.sig = sig;
      if (def.id !== this.gunId) {
        this.gunId = def.id;
        setText(this.nameEl, def.name);
        setText(this.tagEl, `[${fireModeTag(def.fireMode)}]`);
        this.buildTicks(def.mag);
        this.icEl.src = iconUrl(`ammo:${def.ammo}`);
        this.icEl.style.display = '';
      }
      const st = ammoStates(gs.mag, def.mag, reserve, cap);
      setText(this.magEl, String(gs.mag));
      setText(this.resEl, String(reserve));
      this.magEl.className = `mag ${st.mag}`;
      this.resEl.className = `res ${st.reserve}`;
      toggle(this.el, 'low', st.mag !== 'ok');
      const want = filledTicks(gs.mag, this.per);
      if (want !== this.lit) {
        const lo = Math.min(want, this.lit);
        const hi = Math.max(want, this.lit);
        for (let i = lo; i < hi && i < this.ticks.length; i++) this.ticks[i]!.classList.toggle('on', i < want);
        this.lit = want;
      }
      // Sub line: reloading / reload prompt / no ammo.
      this.reloadEl.textContent = '';
      this.noAmmoEl.textContent = '';
      this.reloadEl.className = 'reload';
      if (reloading) {
        this.reloadEl.append('RELOADING');
      } else if (st.noAmmo) {
        this.noAmmoEl.append('NO AMMO ', kc(this.ctx.key('swapRight', 1)), ' swap');
      } else if (st.reloadPrompt) {
        this.reloadEl.className = 'reload pulse';
        this.reloadEl.append(kc(this.ctx.key('reload', 1)), ' reload');
      }
      this.rbar.style.visibility = reloading ? 'visible' : 'hidden';
    }
    if (reloading) {
      const r = Math.round(Math.min(1, Math.max(0, gs.reloadT)) * 50) / 50;
      if (r !== this.rr) {
        this.rr = r;
        this.rfill.style.transform = `scaleX(${r})`;
      }
    }
    this.updateOff();
  }

  /** Other right-hand gun, small, with the swap keycap. */
  private updateOff(): void {
    const c = this.ctx.combat;
    const i = 1 - c.rightIdx;
    const gs = c.guns[i] ?? null;
    const def = gs ? GUN_LIST.find((g) => g.id === gs.id) : undefined;
    if (!gs || !def) {
      if (this.offSig !== '') {
        this.offSig = '';
        show(this.offEl, false);
      }
      return;
    }
    const reserve = c.ammo.get(def.ammo);
    const sig = `${def.id}|${gs.mag}|${reserve}`;
    if (sig === this.offSig) return;
    this.offSig = sig;
    show(this.offEl, true);
    setText(this.offTxt, `▸ ${def.name}  ${gs.mag}│${reserve}`);
    this.offKey.textContent = '';
    this.offKey.append(kc(this.ctx.key('swapRight')));
  }

  /** For the controls card / tests: max reserve of a type. */
  static capOf(t: GunDef['ammo']): number {
    return AMMO[t].cap;
  }
}
