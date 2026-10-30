import type { EventBus } from '../core/events';
import { events as globalEvents } from '../core/events';
import type { System } from '../core/types';
import { WEAPONS } from '../data/weapons';
import type { CombatSystem } from './system';

/**
 * Temporary combat HUD (M6 replaces it): ammo mag/reserve, dynamic crosshair, hitmarker flash,
 * left-hand state. Plain DOM appended to `#ui`.
 */
export function createCombatHud(combat: CombatSystem, parent: HTMLElement, bus: EventBus = globalEvents): System & { el: HTMLElement; dispose(): void } {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;font:13px monospace;color:#eee;text-shadow:1px 1px 0 #000';
  parent.appendChild(root);

  const cross = document.createElement('div');
  cross.style.cssText = 'position:absolute;left:50%;top:50%;width:0;height:0';
  const bars: HTMLElement[] = [];
  for (let i = 0; i < 4; i++) {
    const b = document.createElement('div');
    b.style.cssText = 'position:absolute;background:#fff;opacity:.85;box-shadow:0 0 0 1px #0008';
    cross.appendChild(b);
    bars.push(b);
  }
  const dot = document.createElement('div');
  dot.style.cssText = 'position:absolute;left:-1px;top:-1px;width:2px;height:2px;background:#fff;opacity:.9';
  cross.appendChild(dot);
  root.appendChild(cross);

  const mark = document.createElement('div');
  mark.style.cssText = 'position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;font:bold 26px/26px monospace;text-align:center;color:#fff';
  mark.textContent = 'x';
  root.appendChild(mark);

  const ammo = document.createElement('div');
  ammo.style.cssText = 'position:absolute;right:16px;bottom:14px;text-align:right;font-size:18px;white-space:pre';
  root.appendChild(ammo);

  const left = document.createElement('div');
  left.style.cssText = 'position:absolute;left:8px;bottom:14px;font-size:13px;white-space:pre';
  root.appendChild(left);

  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;left:50%;top:58%;transform:translateX(-50%);font-size:12px;opacity:0;white-space:pre';
  root.appendChild(info);

  let markT = 0;
  let infoT = 0;
  const off = bus.on('hit', (e) => {
    markT = 0.18;
    mark.style.color = e.killed ? '#ff3030' : e.blocked ? '#60a0ff' : e.headshot ? '#ff9020' : '#ffffff';
    mark.textContent = e.killed ? 'X' : 'x';
    const h = combat.lastHit;
    if (h) {
      infoT = 1.2;
      info.textContent = `${h.label} ${h.dist.toFixed(0)}m  ${h.blocked ? 'BLOCKED' : (h.head ? 'HEADSHOT ' : '') + h.dealt.toFixed(0)}${h.killed ? '  KILL' : ''}`;
    }
  });

  let acc = 0;
  return {
    el: root,
    name: 'combatHud',
    update() {},
    render(_a, dt) {
      if (markT > 0) {
        markT -= dt;
        mark.style.opacity = String(Math.max(0, Math.min(1, markT / 0.12)));
      }
      if (infoT > 0) {
        infoT -= dt;
        info.style.opacity = String(Math.max(0, Math.min(1, infoT / 0.4)));
      }
      acc += dt;
      if (acc < 0.03) return;
      acc = 0;
      // crosshair gap from the last spread (deg) -> px
      const px = Math.round(Math.max(3, combat.lastSpread * 9 + 5) * (1 - 0.7 * combat.ads));
      const L = 6;
      const set = (el: HTMLElement, x: number, y: number, w: number, h: number) => {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
      };
      set(bars[0]!, -1, -px - L, 2, L);
      set(bars[1]!, -1, px, 2, L);
      set(bars[2]!, -px - L, -1, L, 2);
      set(bars[3]!, px, -1, L, 2);
      cross.style.opacity = String(1 - 0.6 * combat.ads);

      const g = combat.gun;
      const def = combat.gunDefNow;
      if (g && def) {
        const reserve = combat.ammo.get(def.ammo);
        const state = g.reloading ? `RELOADING ${Math.round(g.reloadT * 100)}%` : g.mag === 0 ? (reserve ? 'RELOAD [R]' : 'NO AMMO') : combat.swapping ? 'SWAPPING' : '';
        ammo.style.color = g.mag === 0 ? '#ff5050' : '#eee';
        ammo.textContent = `${def.name}\n${String(g.mag).padStart(2, '0')} / ${reserve}  (cap ${combat.ammo.cap(def.ammo)})\n${state}`;
      } else ammo.textContent = '';
      const ld = combat.leftDefNow;
      const ldef = ld ? WEAPONS[ld.id] : null;
      const st = combat.guardBroken ? ' GUARD BROKEN' : combat.blocking ? ' [BLOCK]' : combat.swinging ? ' [SWING]' : combat.swingDeniedT < 0.4 ? ' NO STAMINA' : '';
      left.textContent = ldef ? `L: ${ldef.name}${st}` : '';
    },
    dispose() {
      off();
      root.remove();
    },
  };
}
