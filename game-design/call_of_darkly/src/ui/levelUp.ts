import type { StatName } from '../data/types';
import type { UiCtx } from './ctx';
import { clear, h } from './dom';
import { STAT_LABEL, STAT_MAX, STAT_NAMES, canLevelStat, fmtInt, levelUpInfo, statPreview } from './logic';
import { Modal } from './modal';

const BLURB: Record<StatName, string> = {
  vitality: 'Raises maximum HP. There is no regen, so every point counts.',
  endurance: 'Raises stamina, stamina regen and maximum equip load.',
  firearms: 'Raises gun damage (soft caps apply).',
  strength: 'Raises melee damage and stagger.',
};

/**
 * Bonfire level-up screen: four stats, cost from `levelCost(target)`, preview of derived-stat changes.
 * Buying a level spends souls and calls `ctx.onLevelUp(stat)` (the orchestrator applies it); a `false` return refunds.
 */
export class LevelUpMenu extends Modal {
  private sel: StatName = 'vitality';
  private readonly body = h('div', 'pbody');
  /** Back-to-bonfire hook. */
  onBack: (() => void) | null = null;

  constructor(ctx: UiCtx) {
    super(ctx, 'levelup', 540);
    const title = h('div', 'ptitle', [h('span', 'gold', 'LEVEL UP'), h('div', 'sp')]);
    const back = h('div', 'tab', 'Back');
    back.addEventListener('click', () => this.onBack?.());
    title.append(back);
    this.panel.append(title, this.body);
  }

  protected override onOpen(): void {
    this.render();
  }

  /** Re-render if open (souls / levels changed). */
  refresh(): void {
    if (this.open) this.render();
  }

  /** Up/Down pick a stat, Enter levels it. Returns true when handled. */
  handleKey(code: string): boolean {
    if (!this.open) return false;
    const i = STAT_NAMES.indexOf(this.sel);
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      this.sel = STAT_NAMES[(i + (code === 'ArrowUp' ? STAT_NAMES.length - 1 : 1)) % STAT_NAMES.length]!;
      this.render();
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      this.buy(this.sel);
      return true;
    }
    return false;
  }

  private buy(stat: StatName): void {
    const { ctx } = this;
    const lv = ctx.player.levels;
    if (!canLevelStat(lv, stat, ctx.wallet.souls)) return;
    const info = levelUpInfo(lv, ctx.wallet.souls);
    if (!ctx.wallet.spend(info.cost)) return;
    if (ctx.onLevelUp(stat) === false) ctx.wallet.add(info.cost);
    this.sel = stat;
    this.render();
  }

  private render(): void {
    const { ctx } = this;
    const lv = ctx.player.levels;
    const souls = ctx.wallet.souls;
    const info = levelUpInfo(lv, souls);
    clear(this.body);
    this.body.style.flexDirection = 'column';

    const top = h('div', 'stat', [
      h('span', 'dim', 'LEVEL'),
      h('span', 'big-souls gold', String(info.level)),
      h('div', 'sp'),
      h('span', 'dim', 'SOULS'),
      h('span', 'big-souls', fmtInt(souls)),
      h('span', 'dim', 'COST'),
      h('span', `big-souls ${info.affordable ? 'good' : 'bad'}`, fmtInt(info.cost)),
    ]);
    (top.querySelector('.sp') as HTMLElement).style.flex = '1';
    this.body.append(top);

    const cols = h('div', '');
    cols.style.cssText = 'display:flex;gap:10px';
    const left = h('div', 'col');
    left.style.width = '270px';
    for (const s of STAT_NAMES) {
      const can = canLevelStat(lv, s, souls);
      const up = h('div', `up${can ? '' : ' off'}`, '+');
      up.addEventListener('click', (e) => {
        e.stopPropagation();
        this.buy(s);
      });
      const row = h('div', `lu-row${s === this.sel ? ' sel' : ''}`, [
        h('span', 'nm', STAT_LABEL[s]),
        h('span', 'val', String(lv[s])),
        h('span', 'arrow', '→'),
        h('span', `val ${can ? 'good' : lv[s] >= STAT_MAX ? 'dim' : ''}`, String(Math.min(STAT_MAX, lv[s] + 1))),
        up,
      ]);
      row.addEventListener('click', () => {
        this.sel = s;
        this.render();
      });
      left.append(row);
    }
    const right = h('div', 'detail');
    right.style.width = '230px';
    right.append(h('div', 'dname', STAT_LABEL[this.sel]), h('div', 'desc', BLURB[this.sel]));
    const t = h('div', 'tbl');
    for (const r of statPreview(lv, this.sel)) {
      const f = (n: number) => `${n.toFixed(r.digits)}${r.unit === 'x' ? '' : r.unit}`;
      t.append(h('span', 'dim', r.label), h('span', 'v', [h('span', '', `${r.unit === 'x' ? 'x' : ''}${f(r.cur)}`), ' → ', h('span', 'good', `${r.unit === 'x' ? 'x' : ''}${f(r.next)}`)]));
    }
    right.append(t);
    if (!info.affordable) right.append(h('div', 'bad', `Need ${fmtInt(info.short)} more souls.`));
    cols.append(left, right);
    this.body.append(cols);
    this.body.append(h('div', 'dim', `Level ${info.level} \u2192 ${info.target}`));
  }
}
