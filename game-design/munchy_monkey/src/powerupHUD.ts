// PowerUpHUD: DOM bar with power-up buttons + overlay animations.
// Power-ups are reusable (except X-Ray which stays on once triggered).
// Each costs POWERUP_COST coconuts; buttons dim when player can't afford.

import { POWERUP_COST } from './coconuts';

export type PowerUpId = 'banana' | 'xray' | 'megabomb' | 'frenzy';
export type PowerUpHandler = (id: PowerUpId) => void;

interface PowerUpDef {
  id: PowerUpId;
  icon: string;
  label: string;
  color: string;
  tip: string;
}

const DEFS: PowerUpDef[] = [
  { id: 'banana',   icon: '🍌', label: 'Peel',   color: '#f59e0b',
    tip: '🍌 Banana Peel\nSweeps off the outer layer of emojis!' },
  { id: 'xray',     icon: '🕶️', label: 'X-Ray',  color: '#06b6d4',
    tip: '🕶️ X-Ray Vision\nMakes emojis see-through so you can spot the stars!' },
  { id: 'megabomb', icon: '💣', label: 'Mega',   color: '#ef4444',
    tip: '💣 Mega Bomb\nThrown at the fruit — blasts a big area of emojis!' },
  { id: 'frenzy',   icon: '🐒', label: 'Frenzy', color: '#8b5cf6',
    tip: '🐒 Frenzy!\nMonkey goes wild and auto-eats 3 random bites!' },
];

export class PowerUpHUD {
  private root: HTMLDivElement;
  private buttons: Map<PowerUpId, HTMLButtonElement> = new Map();
  private _iconEls: HTMLElement[] = [];
  private overlayRoot: HTMLDivElement;
  private onUse: PowerUpHandler;
  private _xrayLocked = false;
  private _beatTime = 0;

  constructor(container: HTMLElement, onUse: PowerUpHandler) {
    this.onUse = onUse;

    // Power-up bar — frosted glass pill, sits above the fruit buttons
    this.root = document.createElement('div');
    this.root.style.cssText =
      'display:flex;justify-content:center;gap:2vmin;pointer-events:auto;' +
      'padding:clamp(6px,1.8vmin,10px) clamp(10px,3vmin,18px);flex-wrap:nowrap;' +
      'background:rgba(0,0,0,0.38);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(255,255,255,0.12);border-radius:999px;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.1);';

    for (const def of DEFS) {
      const btn = document.createElement('button');
      btn.dataset.id = def.id;
      // Derive a lighter tint for the inner highlight
      btn.style.cssText =
        `background:${def.color};color:#fff;` +
        'border:none;border-radius:16px;' +
        'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
        'gap:0.5vmin;' +
        'width:clamp(52px,13vmin,70px);height:clamp(52px,13vmin,70px);' +
        'font-size:clamp(20px,5.5vmin,30px);line-height:1;' +
        'cursor:pointer;touch-action:manipulation;user-select:none;' +
        'box-shadow:0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25);' +
        'transition:transform 0.1s ease,opacity 0.2s,box-shadow 0.15s;';

      const iconEl = document.createElement('div');
      iconEl.textContent = def.icon;
      iconEl.style.display = 'inline-block'; // needed for transform to apply
      this._iconEls.push(iconEl);

      const labelEl = document.createElement('div');
      labelEl.textContent = def.label;
      labelEl.style.cssText =
        'font-size:clamp(8px,2vmin,11px);font-weight:700;line-height:1;';

      // Cost badge — shown below the label
      const costEl = document.createElement('div');
      costEl.textContent = `🥥×${POWERUP_COST}`;
      costEl.style.cssText =
        'font-size:clamp(7px,1.8vmin,10px);font-weight:700;line-height:1;' +
        'opacity:0.85;letter-spacing:0.01em;';

      btn.appendChild(iconEl);
      btn.appendChild(labelEl);
      btn.appendChild(costEl);

      // Hold-to-see tooltip
      let tipEl: HTMLDivElement | null = null;
      let holdTimer: ReturnType<typeof setTimeout> | null = null;

      const showTip = () => {
        if (tipEl) return;
        tipEl = document.createElement('div');
        tipEl.style.cssText =
          'position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);' +
          'background:rgba(0,0,0,0.88);color:#fff;border-radius:10px;' +
          'padding:8px 12px;font-size:clamp(10px,2.8vmin,14px);font-weight:600;' +
          'white-space:pre;text-align:center;pointer-events:none;z-index:50;' +
          'backdrop-filter:blur(6px);line-height:1.4;min-width:120px;' +
          'box-shadow:0 4px 16px rgba(0,0,0,0.4);';
        tipEl.textContent = def.tip;
        btn.style.position = 'relative';
        btn.appendChild(tipEl);
      };
      const hideTip = () => {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        tipEl?.remove(); tipEl = null;
      };

      btn.addEventListener('pointerenter', () => {
        if (btn.disabled) return;
        btn.style.transform = 'scale(1.06)';
        btn.style.boxShadow = '0 6px 18px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.3)';
      });
      btn.addEventListener('pointerdown', () => {
        if (btn.disabled) return;
        btn.style.transform = 'scale(0.9)';
        btn.style.boxShadow = '0 1px 6px rgba(0,0,0,0.3)';
        holdTimer = setTimeout(showTip, 400);
      });
      btn.addEventListener('pointerup', () => {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25)';
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        if (!tipEl && !btn.disabled) this.onUse(def.id);
        hideTip();
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25)';
        hideTip();
      });

      this.buttons.set(def.id, btn);
      this.root.appendChild(btn);
    }

    container.appendChild(this.root);

    // Overlay root for full-screen animations (banana peel, etc.)
    this.overlayRoot = document.createElement('div');
    this.overlayRoot.style.cssText =
      'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:15;';
    container.appendChild(this.overlayRoot);
  }

  getBar(): HTMLDivElement { return this.root; }

  /** Drive BPM-locked bounce on power-up button icons each frame. */
  setBeatEnergy(beat: number, energy: number, dt: number): void {
    this._beatTime += dt;
    const BPM_HZ = 123.77 / 60;
    // Each icon gets a slight phase offset so they ripple rather than all pop together
    this._iconEls.forEach((el, i) => {
      const phase = i * (Math.PI / 2); // 90° apart
      const bpmSine = Math.sin(this._beatTime * BPM_HZ * Math.PI * 2 + phase) * 0.5 + 0.5;
      const scale = 1 + bpmSine * 0.10 * (0.4 + energy) + beat * 0.20;
      el.style.transform = `scale(${scale.toFixed(3)})`;
    });
  }

  /**
   * Permanently lock X-Ray for this stage (it stays on once triggered).
   * Other power-ups are never permanently disabled — they’re reusable.
   */
  lockXRay(): void {
    this._xrayLocked = true;
    const btn = this.buttons.get('xray');
    if (!btn) return;
    btn.disabled = true;
    btn.style.opacity = '0.3';
    btn.style.cursor = 'default';
    btn.style.filter = 'grayscale(0.7)';
    btn.style.boxShadow = 'none';
  }

  /**
   * Update all buttons’ visual state based on whether the player can afford them.
   * Buttons the player can’t afford are dimmed but NOT disabled (so the tap
   * still registers and main.ts can show a “not enough coconuts” response).
   */
  setAffordable(canAfford: boolean): void {
    for (const [id, btn] of this.buttons) {
      if (id === 'xray' && this._xrayLocked) continue; // already locked
      if (canAfford) {
        btn.style.opacity = '1';
        btn.style.filter = 'none';
        btn.style.boxShadow = '0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25)';
      } else {
        btn.style.opacity = '0.45';
        btn.style.filter = 'grayscale(0.4) brightness(0.8)';
        btn.style.boxShadow = 'none';
      }
    }
  }

  /** Reset for a new stage: unlock all (except xray lock is cleared too on new stage) */
  resetAll(): void {
    this._xrayLocked = false;
    for (const [, btn] of this.buttons) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.filter = 'none';
      btn.style.boxShadow = '0 3px 12px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25)';
    }
  }

  /** @deprecated Use lockXRay() for xray; other power-ups are now reusable */
  disableButton(id: PowerUpId): void {
    if (id === 'xray') this.lockXRay();
  }

  // ── Overlay animations ────────────────────────────────────────────────────────

  /**
   * Banana peel animation: 🍌 falls top-to-bottom upright.
   * onProgress(frac) is called each frame with 0–1 (how far down the screen
   * the banana centre is) so the caller can eat rows progressively.
   * onDone() is called when the banana exits the bottom.
   */
  /**
   * Banana peel animation: 🍌 falls top-to-bottom.
   * onProgress receives the banana element's current bottom-edge screen-Y
   * in viewport pixels so callers can compare against sprite screen positions.
   */
  animateBananaPeel(onProgress: (bananaScreenY: number) => void, onDone: () => void): void {
    const el = document.createElement('div');
    el.textContent = '🍌';
    el.style.cssText =
      'position:absolute;font-size:clamp(80px,28vmin,160px);' +
      'left:50%;transform:translateX(-50%);top:-22%;' +
      'pointer-events:none;will-change:transform;';
    this.overlayRoot.appendChild(el);

    const DURATION = 1400; // ms
    const start = performance.now();

    const tick = () => {
      const elapsed = performance.now() - start;
      const frac = Math.min(1, elapsed / DURATION);
      const eased = frac < 0.5
        ? 2 * frac * frac
        : 1 - Math.pow(-2 * frac + 2, 2) / 2;
      el.style.top = `${-22 + eased * 144}%`;
      // Pass the bottom edge of the banana in viewport pixels
      const rect = el.getBoundingClientRect();
      onProgress(rect.bottom);
      if (frac < 1) {
        requestAnimationFrame(tick);
      } else {
        el.remove();
        onDone();
      }
    };
    requestAnimationFrame(tick);
  }

  /** Show mock ad modal, calls onDone after 3 s */
  showAdModal(onDone: () => void): void {
    const modal = document.createElement('div');
    modal.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:3vmin;background:rgba(0,0,0,0.82);z-index:30;pointer-events:auto;';

    const adBox = document.createElement('div');
    adBox.style.cssText =
      'width:min(85vmin,340px);background:#1e293b;border-radius:18px;overflow:hidden;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.5);';

    const adHeader = document.createElement('div');
    adHeader.style.cssText =
      'background:#f59e0b;color:#fff;font-size:clamp(10px,2.5vmin,14px);' +
      'font-weight:700;padding:6px 12px;text-align:right;letter-spacing:0.05em;';
    adHeader.textContent = 'AD';

    const adContent = document.createElement('div');
    adContent.style.cssText =
      'padding:5vmin;text-align:center;color:#fff;' +
      "font-family:'Comic Sans MS','Comic Sans',cursive;";

    const adIcon = document.createElement('div');
    adIcon.style.cssText = 'font-size:clamp(48px,16vmin,90px);margin-bottom:2vmin;';
    adIcon.textContent = '🍌';

    const adTitle = document.createElement('div');
    adTitle.style.cssText =
      'font-size:clamp(16px,5vmin,28px);font-weight:900;margin-bottom:1vmin;';
    adTitle.textContent = 'Monkey Munch Premium';

    const adSub = document.createElement('div');
    adSub.style.cssText =
      'font-size:clamp(11px,3vmin,16px);color:rgba(255,255,255,0.7);margin-bottom:3vmin;';
    adSub.textContent = 'Unlimited power-ups & no ads!\nOnly $2.99/month';

    const timer = document.createElement('div');
    timer.style.cssText =
      'font-size:clamp(11px,3vmin,15px);color:rgba(255,255,255,0.5);';
    timer.textContent = 'Ad closes in 3…';

    adContent.appendChild(adIcon);
    adContent.appendChild(adTitle);
    adContent.appendChild(adSub);
    adContent.appendChild(timer);
    adBox.appendChild(adHeader);
    adBox.appendChild(adContent);
    modal.appendChild(adBox);
    this.overlayRoot.appendChild(modal);
    modal.style.pointerEvents = 'auto';

    let t = 3;
    const tick = setInterval(() => {
      t--;
      timer.textContent = t > 0 ? `Ad closes in ${t}…` : 'Closing…';
      if (t <= 0) {
        clearInterval(tick);
        modal.remove();
        onDone();
      }
    }, 1000);
  }

  /** Show the "out of bites" modal with retry / watch-ad options */
  showOutOfBitesModal(
    starsFound: number, starsTotal: number,
    onRetry: () => void,
    onWatchAd: () => void,
  ): void {
    const modal = document.createElement('div');
    modal.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:3vmin;background:rgba(0,0,0,0.75);' +
      'backdrop-filter:blur(6px);z-index:25;pointer-events:auto;' +
      "font-family:'Comic Sans MS','Comic Sans',cursive;";

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:clamp(44px,14vmin,80px);';
    icon.textContent = '😮';

    const msg = document.createElement('div');
    msg.style.cssText =
      'font-size:clamp(18px,5.5vmin,32px);font-weight:800;color:#fff;text-align:center;' +
      'text-shadow:0 2px 8px rgba(0,0,0,0.5);';
    msg.textContent = 'Out of Bites!';

    const sub = document.createElement('div');
    sub.style.cssText =
      'font-size:clamp(12px,3.5vmin,18px);color:rgba(255,255,255,0.85);text-align:center;';
    sub.textContent = `Found ${starsFound} / ${starsTotal} stars`;

    // Watch ad button
    const adBtn = document.createElement('button');
    adBtn.style.cssText =
      'pointer-events:auto;background:#f59e0b;color:#fff;border:none;border-radius:16px;' +
      'font-size:clamp(14px,4.5vmin,24px);font-weight:800;' +
      'padding:clamp(12px,3vmin,18px) clamp(24px,7vmin,48px);' +
      'cursor:pointer;touch-action:manipulation;' +
      'box-shadow:0 5px 18px rgba(245,158,11,0.4);';
    adBtn.textContent = '📺 Watch Ad → +3 Bites';
    adBtn.addEventListener('click', () => { modal.remove(); onWatchAd(); });

    // Retry button
    const retryBtn = document.createElement('button');
    retryBtn.style.cssText =
      'pointer-events:auto;background:rgba(255,255,255,0.15);color:#fff;' +
      'border:2px solid rgba(255,255,255,0.4);border-radius:16px;' +
      'font-size:clamp(13px,3.8vmin,20px);font-weight:600;' +
      'padding:clamp(10px,2.5vmin,15px) clamp(20px,6vmin,40px);' +
      'cursor:pointer;touch-action:manipulation;';
    retryBtn.textContent = '🔄 Restart Stage';
    retryBtn.addEventListener('click', () => { modal.remove(); onRetry(); });

    modal.appendChild(icon);
    modal.appendChild(msg);
    modal.appendChild(sub);
    modal.appendChild(adBtn);
    modal.appendChild(retryBtn);
    this.overlayRoot.appendChild(modal);
  }
}
