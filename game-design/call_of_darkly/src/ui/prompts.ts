import type { EventBus } from '../core/events';
import type { UiCtx } from './ctx';
import { h, kc } from './dom';
import { bindingLabel } from './logic';
import './events';

export interface PromptOptions {
  /** Polled each frame; text AFTER the "[E] " keycap (e.g. InteractSystem `current?.prompt()`). Wins over `promptChanged`. */
  getPrompt?: () => string | null;
}

interface Flash {
  label: string;
  action: string;
  until: number;
}

/**
 * Context prompts (center): `[E] <text>` from the world (event `promptChanged` or the `getPrompt` poll),
 * `[Space] Mantle` when the player's mantle probe passes, and short `hintFlash` tutorial flashes
 * (e.g. `[Ctrl] Dodge` on boss windups). Rebuilds the DOM only when the text set changes.
 */
export class Prompts {
  readonly el = h('div', 'prompts');
  private evtText: string | null = null;
  private built = false;
  private sWorld: string | null = null;
  private sMantle = false;
  private sKI = '';
  private sKJ = '';
  private sFlash: Flash[] = [];
  private flashes: Flash[] = [];
  private offs: (() => void)[] = [];

  constructor(
    private readonly ctx: UiCtx,
    private readonly opts: PromptOptions = {},
  ) {}

  mount(bus: EventBus): void {
    this.offs.push(
      bus.on('promptChanged', (e) => {
        this.evtText = e.text;
      }),
      bus.on('hintFlash', (e) => {
        this.flashes = this.flashes.filter((f) => f.action !== e.action);
        this.flashes.push({ label: e.label, action: e.action, until: this.ctx.now() + (e.hold ?? 2.5) });
      }),
    );
  }

  unmount(): void {
    for (const o of this.offs) o();
    this.offs = [];
  }

  update(): void {
    const now = this.ctx.now();
    if (this.flashes.length) this.flashes = this.flashes.filter((f) => f.until > now);
    const world = this.opts.getPrompt ? this.opts.getPrompt() : this.evtText;
    const mantle = !!this.ctx.player.canMantle;
    const kI = this.ctx.key('interact');
    const kJ = this.ctx.key('jump');
    const fl = this.flashes;
    if (this.built && world === this.sWorld && mantle === this.sMantle && kI === this.sKI && kJ === this.sKJ && fl.length === this.sFlash.length) {
      let same = true;
      for (let i = 0; i < fl.length; i++) if (fl[i] !== this.sFlash[i]) { same = false; break; }
      if (same) return;
    }
    this.built = true;
    this.sWorld = world;
    this.sMantle = mantle;
    this.sKI = kI;
    this.sKJ = kJ;
    this.sFlash = fl.slice();
    this.el.textContent = '';
    const line = (action: Parameters<typeof bindingLabel>[0], text: string): void => {
      this.el.append(h('div', '', [kc(this.ctx.key(action)), ` ${text}`]));
    };
    if (world) line('interact', world);
    if (mantle) line('jump', 'Mantle');
    for (const f of this.flashes) {
      const a = f.action as Parameters<typeof bindingLabel>[0];
      line(this.ctx.bindings()[a] ? a : 'interact', f.label);
    }
  }
}
