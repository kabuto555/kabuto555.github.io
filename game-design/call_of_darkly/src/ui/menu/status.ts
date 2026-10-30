import type { UiCtx } from '../ctx';
import { clear, h } from '../dom';
import { STAT_LABEL, STAT_NAMES, derivedFor, fmtInt, playerLevel } from '../logic';
import { loadBlock } from './detail';
import type { MenuTab } from './types';

/** Status page: level, souls, the four stats, derived values, absorb %, poise, equip load. */
export class StatusTab implements MenuTab {
  readonly title = 'Status';
  readonly el = h('div', 'pbody');
  private readonly a = h('div', 'col');
  private readonly b = h('div', 'col');

  constructor(private readonly ctx: UiCtx) {
    this.a.style.width = '330px';
    this.b.style.width = '340px';
    this.el.append(this.a, this.b);
  }

  refresh(): void {
    const { ctx } = this;
    const lv = ctx.player.levels;
    const d = derivedFor(lv);
    const st = ctx.inv.stats;
    const pct = (k: 'physAbsorb' | 'fireAbsorb' | 'explosiveAbsorb') => `${Math.round(st.get(k) * 100)}%`;
    const f1 = (n: number) => String(Math.round(n * 10) / 10);

    clear(this.a);
    this.a.append(h('div', 'sec', 'ATTRIBUTES'));
    const t = h('div', 'tbl');
    t.append(h('span', '', 'Level'), h('span', 'v gold', String(playerLevel(lv))));
    t.append(h('span', '', 'Souls'), h('span', 'v', fmtInt(ctx.wallet.souls)));
    this.a.append(t, h('div', 'sec', 'STATS'));
    const s = h('div', 'tbl');
    for (const n of STAT_NAMES) s.append(h('span', '', STAT_LABEL[n]), h('span', 'v', String(lv[n])));
    this.a.append(s, h('div', 'sec', 'DERIVED'));
    const dv = h('div', 'tbl');
    // gun/melee multipliers already include the level curve (main registers `level:stats`): show them once.
    const rows: [string, string][] = [
      ['HP', `${Math.round(ctx.player.health.hp)} / ${Math.round(ctx.player.health.maxHp)}`],
      ['Stamina', `${Math.round(ctx.player.state.maxStamina)}`],
      ['Stamina regen', `${f1(d.staminaRegen * st.get('staminaRegen'))}/s`],
      ['Gun damage', `x${st.get('gunDamage').toFixed(2)}`],
      ['Melee damage', `x${st.get('meleeDamage').toFixed(2)}`],
      ['Stagger', `x${d.meleePoise.toFixed(2)}`],
    ];
    for (const [k, v] of rows) dv.append(h('span', 'dim', k), h('span', 'v', v));
    this.a.append(dv);

    clear(this.b);
    this.b.append(h('div', 'sec', 'DEFENSE'));
    const df = h('div', 'tbl');
    for (const [k, v] of [
      ['Physical absorb', pct('physAbsorb')],
      ['Fire absorb', pct('fireAbsorb')],
      ['Explosive absorb', pct('explosiveAbsorb')],
      ['Poise', String(Math.round(ctx.inv.poise()))],
    ] as const)
      df.append(h('span', '', k), h('span', 'v', v));
    this.b.append(df, h('div', 'sec', 'LOAD'));
    const eq = ctx.inv.equipment;
    this.b.append(loadBlock({ weight: eq.weight(), max: eq.maxLoad(), ratio: eq.loadRatio(), tier: eq.rollTier() }));
    this.b.append(h('div', 'desc', 'Armor adds absorb and poise but costs equip load. Endurance raises max load. Heavier loads mean slower rolls.'));
  }
}
