/**
 * Lunch Delivery HUD — DOM overlay in the camp's clay style:
 *   top      lunch meter (the cart's "health"), route progress with checkpoint
 *            pips, elapsed timer
 *   top-left your HP
 *   right    ATTACK button (left of the kept jump button) with the tool + ammo
 *   world    a small lunch bar floating over the cart, or an edge arrow
 *            pointing at it when it's off screen
 *   centre   banners, respawn countdown, hurt vignette
 */
import { COLORS, FONT } from '../ui/theme';
import type { ToolKind } from './models';

type Camera = InstanceType<typeof THREE.PerspectiveCamera>;
type Vec3 = InstanceType<typeof THREE.Vector3>;

const TOOL_LABEL: Record<ToolKind, string> = { swatter: 'SWAT', spray: 'SPRAY', watergun: 'SQUIRT' };
const TOOL_COLOR: Record<ToolKind, string> = { swatter: '#ff4f6d', spray: '#49c46a', watergun: '#3a8cff' };

const TOOL_ICON: Record<ToolKind, string> = {
  swatter:
    '<svg viewBox="0 0 24 24"><rect x="11" y="11" width="2.4" height="12" rx="1.2" fill="#f2c14e" stroke="#4a3320" stroke-width="1.2"/>' +
    '<rect x="5.5" y="1.5" width="13" height="11" rx="2.5" fill="#ff4f6d" stroke="#4a3320" stroke-width="1.6"/>' +
    '<path d="M9 2v10M12 2v10M15 2v10M6 5h12M6 8.5h12" stroke="#b8203a" stroke-width="0.8"/></svg>',
  spray:
    '<svg viewBox="0 0 24 24"><rect x="7" y="8" width="9" height="14" rx="2" fill="#49c46a" stroke="#4a3320" stroke-width="1.6"/>' +
    '<rect x="8.5" y="4" width="6" height="4" rx="1" fill="#f4f4f4" stroke="#4a3320" stroke-width="1.4"/>' +
    '<rect x="8.5" y="12" width="6" height="5" rx="1" fill="#ffe14a"/>' +
    '<circle cx="19" cy="4" r="1.2" fill="#b7f5c4"/><circle cx="21.5" cy="6.5" r="1" fill="#b7f5c4"/><circle cx="19.5" cy="8" r="0.8" fill="#b7f5c4"/></svg>',
  watergun:
    '<svg viewBox="0 0 24 24"><path d="M3 9h14l2 2v3H9l-1 7H4l1-7H3z" fill="#ff8a2a" stroke="#4a3320" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<circle cx="11" cy="6" r="3.2" fill="#6fd0ff" stroke="#4a3320" stroke-width="1.4"/><rect x="18" y="10" width="4" height="2.4" fill="#3a8cff" stroke="#4a3320" stroke-width="1"/></svg>',
};

const div = (css: string, html = ''): HTMLDivElement => {
  const d = document.createElement('div');
  d.style.cssText = css;
  if (html) d.innerHTML = html;
  return d;
};

const PANEL = `background:${COLORS.cream};border:3px solid ${COLORS.brown};border-radius:16px;` +
  `box-shadow:0 4px 0 ${COLORS.brownDark};font-family:${FONT};color:${COLORS.brown};`;

function barColor(f: number): string {
  return f > 0.55 ? '#6ccf4a' : f > 0.28 ? '#ffc23a' : '#ff5a48';
}

export class LunchHud {
  readonly root: HTMLDivElement;
  private readonly lunchFill: HTMLDivElement;
  private readonly lunchText: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private readonly trackFill: HTMLDivElement;
  private readonly cartPip: HTMLDivElement;
  private readonly pips: HTMLDivElement[] = [];
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLDivElement;
  private readonly attack: HTMLDivElement;
  private readonly attackIcon: HTMLDivElement;
  private readonly attackLabel: HTMLDivElement;
  private readonly ammo: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly respawn: HTMLDivElement;
  private readonly vignette: HTMLDivElement;
  private readonly edge: HTMLDivElement;
  private readonly edgeArrow: HTMLDivElement;
  private readonly cartTag: HTMLDivElement;
  private readonly cartTagFill: HTMLDivElement;
  private bannerT = 0;
  private hurtT = 0;
  private tool: ToolKind | null = null;
  private pressed = false;
  private tapped = false;
  private pointerId: number | null = null;
  private readonly v = new THREE.Vector3();

  constructor(private readonly host: HTMLElement, checkpoints: readonly number[]) {
    this.root = div('position:absolute;inset:0;z-index:26;pointer-events:none;display:none;overflow:hidden;');

    // ── Top panel: lunch meter + route progress + timer ──
    const top = div(`position:absolute;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);` +
      `width:min(84%,420px);padding:8px 12px 10px;${PANEL}`);
    const row = div('display:flex;align-items:center;gap:8px;');
    row.appendChild(div('line-height:0;margin:-4px 0;', '<img src="assets/ui/icons/game/lunch_meter.png" alt="" style="width:30px;height:30px;display:block;pointer-events:none">'));
    const bar = div(`flex:1;height:20px;border-radius:10px;background:#5a3d1a33;border:2px solid ${COLORS.brown};overflow:hidden;position:relative;`);
    this.lunchFill = div('position:absolute;left:0;top:0;bottom:0;width:100%;background:#6ccf4a;transition:width 120ms linear,background 200ms;');
    this.lunchText = div('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'font-weight:700;font-size:13px;color:#fff;text-shadow:0 1px 2px #3a2415,0 0 2px #3a2415;', 'LUNCH 100%');
    bar.append(this.lunchFill, this.lunchText);
    this.timer = div('font-weight:700;font-size:16px;min-width:44px;text-align:right;', '0:00');
    row.append(bar, this.timer);
    top.appendChild(row);

    const trackRow = div('display:flex;align-items:center;gap:6px;margin-top:8px;');
    trackRow.appendChild(div('line-height:0;margin:-4px 0;', '<img src="assets/ui/icons/game/home.png" alt="" style="width:22px;height:22px;display:block;pointer-events:none">'));
    this.track = div(`flex:1;height:8px;border-radius:4px;background:#5a3d1a33;position:relative;`);
    this.trackFill = div(`position:absolute;left:0;top:0;bottom:0;width:0;border-radius:4px;background:${COLORS.blue};`);
    this.track.appendChild(this.trackFill);
    for (const f of checkpoints) {
      const p = div(`position:absolute;top:50%;left:${(f * 100).toFixed(1)}%;width:10px;height:10px;margin:-5px 0 0 -5px;` +
        `border-radius:50%;background:#bfbfbf;border:2px solid ${COLORS.brown};`);
      this.pips.push(p);
      this.track.appendChild(p);
    }
    this.cartPip = div('position:absolute;top:50%;left:0;transform:translate(-50%,-60%);line-height:0;', '<img src="assets/ui/icons/game/lunch_cart.png" alt="" style="width:26px;height:26px;display:block;pointer-events:none">');
    this.track.appendChild(this.cartPip);
    trackRow.append(this.track, div('line-height:0;margin:-4px 0;', '<img src="assets/ui/icons/game/beach.png" alt="" style="width:22px;height:22px;display:block;pointer-events:none">'));
    top.appendChild(trackRow);

    // ── HP (top-left, under the top panel's row so it never hides the meter) ──
    const hp = div(`position:absolute;left:calc(14px + env(safe-area-inset-left));top:calc(104px + env(safe-area-inset-top));` +
      `padding:6px 10px;display:flex;align-items:center;gap:6px;${PANEL}`);
    hp.appendChild(div('line-height:0;margin:-3px 0;', '<img src="assets/ui/icons/game/heart.png" alt="" style="width:20px;height:20px;display:block;pointer-events:none">'));
    const hpBar = div(`width:96px;height:14px;border-radius:7px;background:#5a3d1a33;border:2px solid ${COLORS.brown};overflow:hidden;position:relative;`);
    this.hpFill = div('position:absolute;left:0;top:0;bottom:0;width:100%;background:#ff5a78;transition:width 100ms linear;');
    hpBar.appendChild(this.hpFill);
    this.hpText = div('font-weight:700;font-size:13px;min-width:26px;', '100');
    hp.append(hpBar, this.hpText);

    // ── Attack button ──
    this.attack = div(
      'position:absolute;right:calc(122px + env(safe-area-inset-right));bottom:calc(58px + env(safe-area-inset-bottom));' +
      'width:100px;height:100px;border-radius:50%;box-sizing:border-box;background:#e4d4b3;border:6px solid #6d5236;' +
      'box-shadow:0 5px 0 #3a2917,0 6px 8px rgba(0,0,0,0.28);display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;touch-action:none;pointer-events:auto;user-select:none;-webkit-user-select:none;cursor:pointer;' +
      'transition:transform 0.06s ease,box-shadow 0.06s ease;');
    this.attack.setAttribute('role', 'button');
    this.attack.setAttribute('aria-label', 'Attack');
    this.attackIcon = div('width:44px;height:44px;pointer-events:none;');
    this.attackLabel = div(`font-family:${FONT};font-weight:700;font-size:13px;color:#4a3320;line-height:1;margin-top:2px;pointer-events:none;`);
    this.ammo = div(`position:absolute;top:-6px;right:-6px;min-width:30px;height:30px;padding:0 6px;box-sizing:border-box;border-radius:15px;` +
      `background:${COLORS.blue};border:3px solid ${COLORS.brown};color:#fff;font-family:${FONT};font-weight:700;font-size:14px;` +
      'display:none;align-items:center;justify-content:center;pointer-events:none;');
    this.attack.append(this.attackIcon, this.attackLabel, this.ammo);
    this.attack.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.pressed = true; this.tapped = true; this.pointerId = e.pointerId;
      try { this.attack.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      this.attack.style.transform = 'translateY(3px) scale(0.96)';
      this.attack.style.boxShadow = '0 2px 0 #3a2917';
    });
    const release = (e: PointerEvent) => {
      if (this.pointerId !== e.pointerId) return;
      this.pressed = false; this.pointerId = null;
      this.attack.style.transform = '';
      this.attack.style.boxShadow = '0 5px 0 #3a2917,0 6px 8px rgba(0,0,0,0.28)';
    };
    this.attack.addEventListener('pointerup', release);
    this.attack.addEventListener('pointercancel', release);

    // ── Centre messages ──
    this.banner = div(`position:absolute;left:50%;top:26%;transform:translateX(-50%);padding:10px 20px;${PANEL}` +
      'font-weight:700;font-size:clamp(18px,5.2vmin,28px);text-align:center;white-space:pre-line;display:none;max-width:86%;width:max-content;');
    this.hint = div(`position:absolute;left:50%;top:calc(150px + env(safe-area-inset-top));transform:translateX(-50%);padding:6px 14px;` +
      `border-radius:12px;background:rgba(58,36,21,0.78);color:#fff;font-family:${FONT};font-weight:600;font-size:15px;` +
      'white-space:nowrap;display:none;');
    this.respawn = div(`position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);padding:14px 26px;${PANEL}` +
      'font-weight:700;font-size:26px;text-align:center;display:none;');
    this.vignette = div('position:absolute;inset:0;box-shadow:inset 0 0 90px 30px rgba(255,40,40,0.75);opacity:0;');

    // ── Cart edge indicator + floating tag ──
    this.edge = div(`position:absolute;left:0;top:0;width:54px;height:54px;margin:-27px 0 0 -27px;display:none;`);
    this.edgeArrow = div('position:absolute;inset:0;',
      `<svg viewBox="0 0 54 54" style="width:100%;height:100%;overflow:visible"><path d="M27 -9 L37 5 L17 5 Z" fill="${COLORS.brown}"/></svg>`);
    const edgeBadge = div(`position:absolute;inset:4px;border-radius:50%;${PANEL}display:flex;align-items:center;justify-content:center;`, '<img src="assets/ui/icons/game/lunch_cart.png" alt="" style="width:34px;height:34px;display:block;pointer-events:none">');
    this.edge.append(this.edgeArrow, edgeBadge);
    this.cartTag = div(`position:absolute;left:0;top:0;width:74px;height:12px;margin-left:-37px;border-radius:6px;` +
      `background:#3a241588;border:2px solid ${COLORS.brown};overflow:hidden;display:none;`);
    this.cartTagFill = div('position:absolute;left:0;top:0;bottom:0;width:100%;background:#6ccf4a;');
    this.cartTag.appendChild(this.cartTagFill);

    this.root.append(this.vignette, this.cartTag, this.edge, top, hp, this.hint, this.banner, this.respawn, this.attack);
    host.appendChild(this.root);
    this.setTool('swatter', Infinity);
  }

  /** Held, or tapped since the last read (a quick tap can start and end between two frames). */
  get attackHeld(): boolean {
    const v = this.pressed || this.tapped;
    this.tapped = false;
    return v;
  }

  show(): void { this.root.style.display = 'block'; }
  hide(): void {
    this.root.style.display = 'none';
    this.pressed = false;
    this.banner.style.display = 'none';
    this.respawn.style.display = 'none';
  }

  setLunch(f: number): void {
    const pct = Math.max(0, Math.ceil(f * 100));
    this.lunchFill.style.width = `${f * 100}%`;
    this.lunchFill.style.background = barColor(f);
    this.lunchText.textContent = `LUNCH ${pct}%`;
    this.cartTagFill.style.width = `${f * 100}%`;
    this.cartTagFill.style.background = barColor(f);
  }

  setTime(seconds: number): void {
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    this.timer.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }

  setProgress(f: number, reached: number): void {
    this.trackFill.style.width = `${f * 100}%`;
    this.cartPip.style.left = `${f * 100}%`;
    this.pips.forEach((p, i) => { p.style.background = i < reached ? '#6ccf4a' : '#bfbfbf'; });
  }

  setHp(f: number): void {
    this.hpFill.style.width = `${Math.max(0, f) * 100}%`;
    this.hpText.textContent = String(Math.max(0, Math.ceil(f * 100)));
  }

  setTool(tool: ToolKind, ammo: number): void {
    if (tool !== this.tool) {
      this.tool = tool;
      this.attackIcon.innerHTML = TOOL_ICON[tool];
      const svg = this.attackIcon.querySelector('svg');
      if (svg) { svg.style.width = '100%'; svg.style.height = '100%'; }
      this.attackLabel.textContent = TOOL_LABEL[tool];
      this.attack.style.borderColor = tool === 'swatter' ? '#6d5236' : TOOL_COLOR[tool];
    }
    this.ammo.style.display = Number.isFinite(ammo) ? 'flex' : 'none';
    if (Number.isFinite(ammo)) this.ammo.textContent = String(ammo);
  }

  setAttackEnabled(on: boolean): void { this.attack.style.opacity = on ? '1' : '0.45'; }

  showBanner(text: string, seconds: number): void {
    this.banner.textContent = text;
    this.banner.style.display = 'block';
    this.bannerT = seconds;
    this.banner.animate([{ transform: 'translateX(-50%) scale(0.7)', opacity: 0 }, { transform: 'translateX(-50%) scale(1.06)', opacity: 1, offset: 0.7 },
      { transform: 'translateX(-50%) scale(1)', opacity: 1 }], { duration: 240, easing: 'ease-out' });
  }

  setHint(text: string | null): void {
    if (!text) { this.hint.style.display = 'none'; return; }
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.style.display = 'block';
  }

  setRespawn(seconds: number | null): void {
    if (seconds === null) { this.respawn.style.display = 'none'; return; }
    this.respawn.style.display = 'block';
    this.respawn.innerHTML = `The bugs got you! 🐜<div style="font-size:18px;font-weight:600;margin-top:4px">Back in ${Math.ceil(seconds)}…</div>`;
  }

  hurt(): void { this.hurtT = 0.35; }

  update(dt: number): void {
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) this.banner.style.display = 'none';
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.vignette.style.opacity = (this.hurtT / 0.35).toFixed(2);
  }

  /** Floating lunch bar over the cart, or an edge arrow toward it when off screen. */
  trackCart(camera: Camera, cart: Vec3, cartTop: Vec3): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    // On screen = the cart's body is in view (its top may poke off the top edge).
    const c = this.v.copy(cart).project(camera);
    const cx0 = (c.x + 1) * 0.5 * w, cy0 = (1 - c.y) * 0.5 * h;
    if (c.z < 1 && cx0 > 0 && cx0 < w && cy0 > 0 && cy0 < h) {
      const t = this.v.copy(cartTop).project(camera);
      const x = THREE.MathUtils.clamp((t.x + 1) * 0.5 * w, 45, w - 45);
      const y = THREE.MathUtils.clamp((1 - t.y) * 0.5 * h, 175, h - 20);
      this.edge.style.display = 'none';
      this.cartTag.style.display = 'block';
      this.cartTag.style.transform = `translate3d(${x.toFixed(1)}px,${(y - 8).toFixed(1)}px,0)`;
      return;
    }
    const v = this.v.copy(cartTop).project(camera);
    const behind = v.z > 1;
    this.cartTag.style.display = 'none';
    // Direction from the screen centre to the cart (flipped when behind the camera).
    let dx = (v.x) * (behind ? -1 : 1), dy = (-v.y) * (behind ? -1 : 1);
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) dy = 1;
    const cx = w / 2, cy = h / 2;
    const hw = w / 2 - 46, hh = h / 2 - 46;
    const k = Math.min(hw / Math.max(1e-4, Math.abs(dx * cx)), hh / Math.max(1e-4, Math.abs(dy * cy)));
    const ex = cx + dx * cx * k, ey = THREE.MathUtils.clamp(cy + dy * cy * k, 190, h - 46);
    this.edge.style.display = 'block';
    this.edge.style.transform = `translate3d(${ex.toFixed(1)}px,${ey.toFixed(1)}px,0)`;
    this.edgeArrow.style.transform = `rotate(${Math.atan2(dx * cx, -dy * cy)}rad)`;
  }

  dispose(): void { this.root.remove(); }
}

/**
 * Announcement toasts ("SigmaMoose joined the Lunch Delivery!") — shown whether
 * or not you're playing, so a delivery starting up across camp is noticeable.
 */
export class JoinFeed {
  private readonly root: HTMLDivElement;

  /** `muted`: while true, announcements are dropped (e.g. during the first-time arrival). */
  constructor(host: HTMLElement, private readonly muted: () => boolean = () => false) {
    this.root = div('position:absolute;left:50%;top:calc(150px + env(safe-area-inset-top));transform:translateX(-50%);' +
      'z-index:27;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;width:max-content;max-width:90%;');
    host.appendChild(this.root);
  }

  push(text: string, seconds = 3.5): void {
    if (this.muted()) return;
    const t = div(`padding:6px 14px;border-radius:14px;background:rgba(58,36,21,0.85);border:2px solid ${COLORS.brown};` +
      `color:#fff;font-family:${FONT};font-weight:600;font-size:15px;text-align:center;box-shadow:0 3px 0 ${COLORS.brownDark};`, '');
    t.textContent = text;
    this.root.appendChild(t);
    // Keep the stack short.
    while (this.root.children.length > 3) this.root.firstElementChild?.remove();
    t.animate([{ opacity: 0, transform: 'translateY(-8px) scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
    setTimeout(() => {
      t.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).onfinish = () => t.remove();
    }, seconds * 1000);
  }
}
