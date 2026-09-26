// DOM HUD for Monkey Munch — fruit buttons, stage info, result overlays.
// Win goal: find all 3 hidden stars by eating the emoji splat points.

import { StageInfo, StageResult } from './stageManager';
import { IntroMonkey } from './introMonkey';

export type ButtonPressHandler = (emojiIndex: number) => void;

// CSS keyframes + shared design tokens — injected once
const _style = document.createElement('style');
_style.textContent = `
  @keyframes hud-shake {
    0%,100%{transform:translateX(0)}
    20%{transform:translateX(-6px)}
    40%{transform:translateX(6px)}
    60%{transform:translateX(-4px)}
    80%{transform:translateX(4px)}
  }
  @keyframes hud-hint-bob {
    0%,100%{transform:translateX(-50%) translateY(0)}
    50%{transform:translateX(-50%) translateY(10px)}
  }
  @keyframes hud-btn-pop {
    0%{transform:scale(1)} 35%{transform:scale(1.22)} 100%{transform:scale(1)}
  }
  @keyframes hud-fade-in {
    from{opacity:0;transform:scale(0.96) translateY(6px)}
    to{opacity:1;transform:scale(1) translateY(0)}
  }
  @keyframes hud-slide-up {
    from{opacity:0;transform:translateX(-50%) translateY(12px)}
    to{opacity:1;transform:translateX(-50%) translateY(0)}
  }
  @keyframes hud-star-pop {
    0%{transform:scale(1)} 40%{transform:scale(1.6) rotate(-8deg)} 70%{transform:scale(0.9) rotate(4deg)} 100%{transform:scale(1) rotate(0deg)}
  }
  @keyframes hud-glow-pulse {
    0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,0)}
    50%{box-shadow:0 0 0 6px rgba(251,191,36,0.35)}
  }
  @keyframes hud-bite-drain {
    from{width:var(--bite-pct-from)} to{width:var(--bite-pct-to)}
  }
  @keyframes hud-coconut-pop {
    0%{transform:scale(1)} 35%{transform:scale(1.5) rotate(10deg)} 100%{transform:scale(1) rotate(0deg)}
  }
  .hud-overlay-card {
    animation: hud-fade-in 0.28s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  /* Browsers don't inherit font-family into buttons/inputs by default */
  button, input, select, textarea {
    font-family: inherit;
  }
`;
document.head.appendChild(_style);

export class GameHUD {
  private root: HTMLDivElement;
  private stageEl!: HTMLDivElement;
  private pressesEl!: HTMLDivElement;
  private starSlots: HTMLDivElement[] = [];  // 3 individual star slots
  private starsRow!: HTMLDivElement;
  private powerupSlot!: HTMLDivElement;
  private buttonsRow!: HTMLDivElement;
  private overlayEl!: HTMLDivElement;
  private dragHintEl!: HTMLDivElement;
  private onPress: ButtonPressHandler;
  private _dragHintDismissed = false;
  private _badgeEls: Map<number, HTMLDivElement> = new Map();
  private _coconutEl!: HTMLDivElement;
  private _introMonkey: IntroMonkey | null = null;
  private _resultMonkey: IntroMonkey | null = null;
  // Icon elements that dance to the beat (rebuilt each stage)
  private _fruitIcons: HTMLElement[] = [];
  private _beatTime = 0;

  constructor(container: HTMLElement, onPress: ButtonPressHandler) {
    this.onPress = onPress;
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;display:flex;flex-direction:column;' +
      'justify-content:space-between;' +
      'padding:' +
      'max(3vmin,env(safe-area-inset-top),var(--sat,0px)) ' +
      'max(2vmin,env(safe-area-inset-right),var(--sar,0px)) ' +
      'max(3vmin,env(safe-area-inset-bottom),var(--sab,0px)) ' +
      'max(2vmin,env(safe-area-inset-left),var(--sal,0px));' +
      "font-family:'Comic Sans MS','Comic Sans',cursive;";
    this._buildHeader();
    this._buildFooter();
    this._buildDragHint();
    this._buildOverlay();
    container.appendChild(this.root);
  }

  private _buildHeader(): void {
    // Frosted glass card wrapping all header content
    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:1.4vmin;pointer-events:none;' +
      'background:rgba(0,0,0,0.38);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(255,255,255,0.12);border-radius:20px;' +
      'padding:clamp(8px,2.2vmin,14px) clamp(14px,4vmin,28px);' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.1);';

    // Gradient title
    const title = document.createElement('div');
    title.style.cssText =
      'font-size:clamp(17px,4.8vmin,26px);font-weight:900;letter-spacing:-0.03em;text-align:center;' +
      'background:linear-gradient(135deg,#ffe066 0%,#ffb347 55%,#ff6b35 100%);' +
      '-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;' +
      'filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));';
    title.textContent = '🐒 Munchy Monkey';

    // Stage pill badge
    this.stageEl = document.createElement('div');
    this.stageEl.style.cssText =
      'font-size:clamp(10px,2.8vmin,15px);color:rgba(255,255,240,0.9);font-weight:700;' +
      'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);' +
      'border-radius:999px;padding:2px clamp(8px,2.5vmin,14px);' +
      'letter-spacing:0.02em;text-align:center;';

    // Coconut row: counter pill + buy button side by side
    const coconutRow = document.createElement('div');
    coconutRow.style.cssText =
      'display:flex;align-items:center;gap:2vmin;pointer-events:auto;';

    this._coconutEl = document.createElement('div');
    this._coconutEl.style.cssText =
      'font-size:clamp(12px,3.4vmin,18px);font-weight:800;color:#fff;' +
      'background:rgba(120,80,20,0.55);border:1px solid rgba(255,210,100,0.35);' +
      'border-radius:999px;padding:clamp(3px,0.8vmin,6px) clamp(10px,3vmin,18px);' +
      'display:flex;align-items:center;gap:1.2vmin;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.1);' +
      'transition:transform 0.15s;';
    this._coconutEl.innerHTML = '🥥 <span id="hud-coconut-count">10</span>';

    // Buy button placeholder — populated by addBuyCoconutsButton()
    const buySlot = document.createElement('div');
    buySlot.id = 'hud-buy-slot';

    coconutRow.appendChild(this._coconutEl);
    coconutRow.appendChild(buySlot);

    // Star slots
    this.starsRow = document.createElement('div');
    this.starsRow.style.cssText =
      'display:flex;gap:3.5vmin;align-items:center;justify-content:center;';
    for (let i = 0; i < 3; i++) {
      const slot = document.createElement('div');
      slot.style.cssText =
        'font-size:clamp(28px,8.5vmin,50px);line-height:1;' +
        'filter:grayscale(1) brightness(0.5);' +
        'transition:filter 0.35s ease,transform 0.35s cubic-bezier(0.34,1.56,0.64,1);';
      slot.textContent = '⭐';
      this.starsRow.appendChild(slot);
      this.starSlots.push(slot);
    }

    // Bites counter with drain bar
    const bitesWrap = document.createElement('div');
    bitesWrap.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:0.6vmin;width:100%;';

    this.pressesEl = document.createElement('div');
    this.pressesEl.style.cssText =
      'font-size:clamp(11px,3vmin,16px);color:#ffe;font-weight:700;' +
      'text-align:center;letter-spacing:0.01em;';

    // Progress bar track
    const barTrack = document.createElement('div');
    barTrack.id = 'hud-bite-track';
    barTrack.style.cssText =
      'width:clamp(80px,28vmin,160px);height:5px;border-radius:999px;' +
      'background:rgba(255,255,255,0.15);overflow:hidden;';
    const barFill = document.createElement('div');
    barFill.id = 'hud-bite-fill';
    barFill.style.cssText =
      'height:100%;width:100%;border-radius:999px;' +
      'background:linear-gradient(90deg,#4ade80,#22c55e);' +
      'transition:width 0.4s ease,background 0.4s ease;';
    barTrack.appendChild(barFill);

    bitesWrap.appendChild(this.pressesEl);
    bitesWrap.appendChild(barTrack);

    header.appendChild(title);
    header.appendChild(this.stageEl);
    header.appendChild(coconutRow);
    header.appendChild(this.starsRow);
    header.appendChild(bitesWrap);
    this.root.appendChild(header);
  }

  private _buildFooter(): void {
    const footer = document.createElement('div');
    footer.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:2vmin;';

    // Power-up bar slot — filled externally by PowerUpHUD
    this.powerupSlot = document.createElement('div');
    this.powerupSlot.style.cssText = 'display:flex;justify-content:center;width:100%;';

    // Frosted glass pill containing the fruit buttons
    const btnCard = document.createElement('div');
    btnCard.style.cssText =
      'background:rgba(0,0,0,0.38);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border:1px solid rgba(255,255,255,0.12);border-radius:22px;' +
      'padding:clamp(8px,2vmin,14px) clamp(10px,3vmin,20px);' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.1);';

    this.buttonsRow = document.createElement('div');
    this.buttonsRow.style.cssText =
      'display:flex;flex-wrap:wrap;justify-content:center;gap:2.5vmin;pointer-events:auto;' +
      'max-width:min(92vmin,400px);';

    btnCard.appendChild(this.buttonsRow);
    footer.appendChild(this.powerupSlot);
    footer.appendChild(btnCard);
    this.root.appendChild(footer);
  }

  private _buildOverlay(): void {
    this.overlayEl = document.createElement('div');
    this.overlayEl.style.cssText =
      'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:3.5vmin;pointer-events:auto;' +
      'background:rgba(0,0,0,0.65);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);';
    this.root.appendChild(this.overlayEl);
  }

  /** Animated drag hint — shown until the player first drags the fruit */
  private _buildDragHint(): void {
    this.dragHintEl = document.createElement('div');
    this.dragHintEl.style.cssText =
      'position:absolute;left:50%;top:52%;transform:translateX(-50%);' +
      'pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:1vmin;' +
      'opacity:0;transition:opacity 0.5s;z-index:2;';

    const hand = document.createElement('div');
    hand.style.cssText =
      'font-size:clamp(28px,9vmin,52px);' +
      'animation:hud-hint-bob 1.2s ease-in-out infinite;';
    hand.textContent = '👆';

    const label = document.createElement('div');
    label.style.cssText =
      'font-size:clamp(11px,3vmin,16px);color:rgba(255,255,255,0.9);' +
      'background:rgba(0,0,0,0.45);border-radius:10px;padding:4px 12px;' +
      'font-weight:600;white-space:nowrap;backdrop-filter:blur(4px);';
    label.textContent = 'Drag to rotate the fruit!';

    this.dragHintEl.appendChild(hand);
    this.dragHintEl.appendChild(label);
    this.root.appendChild(this.dragHintEl);
  }

  /** Show the drag hint (called when a stage starts for the first time) */
  showDragHint(): void {
    if (this._dragHintDismissed) return;
    this.dragHintEl.style.opacity = '1';
  }

  /** Dismiss the drag hint (call on first drag) */
  dismissDragHint(): void {
    if (this._dragHintDismissed) return;
    this._dragHintDismissed = true;
    this.dragHintEl.style.opacity = '0';
  }

  /** Add a mute toggle button anchored top-left, returns a toggle function */
  addMuteButton(onToggle: (muted: boolean) => void): void {
    const btn = document.createElement('button');
    let muted = false;
    btn.textContent = '🔊';
    btn.title = 'Mute / Unmute';
    btn.style.cssText =
      'position:absolute;pointer-events:auto;' +
      'top:max(3vmin,env(safe-area-inset-top),var(--sat,0px));' +
      'right:max(3vmin,env(safe-area-inset-right),var(--sar,0px));' +
      'width:clamp(44px,11vmin,58px);height:clamp(44px,11vmin,58px);' +
      'font-size:clamp(18px,5.5vmin,28px);line-height:1;' +
      'background:rgba(0,0,0,0.42);' +
      'border:1px solid rgba(255,255,255,0.15);border-radius:50%;' +
      'cursor:pointer;touch-action:manipulation;user-select:none;' +
      'display:flex;align-items:center;justify-content:center;' +
      'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.1);' +
      'transition:transform 0.1s,background 0.15s;z-index:5;';
    btn.addEventListener('pointerdown', () => { btn.style.transform = 'scale(0.9)'; });
    btn.addEventListener('pointerup',   () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', () => {
      muted = !muted;
      btn.textContent = muted ? '🔇' : '🔊';
      onToggle(muted);
    });
    this.root.appendChild(btn);
  }

  /**
   * Inject the "Watch Ad → +10 🥥" button into the buy slot beside the coconut counter.
   * onBuy() is called when the user taps it; caller is responsible for showing the ad
   * modal and granting the reward.
   */
  addBuyCoconutsButton(onBuy: () => void): void {
    const slot = document.getElementById('hud-buy-slot');
    if (!slot) return;
    const btn = document.createElement('button');
    btn.title = 'Watch an ad to earn +10 coconuts';
    btn.style.cssText =
      'pointer-events:auto;display:flex;align-items:center;gap:1vmin;' +
      'background:rgba(245,158,11,0.85);color:#fff;border:none;border-radius:999px;' +
      'font-size:clamp(10px,2.8vmin,15px);font-weight:800;' +
      'padding:clamp(3px,0.8vmin,6px) clamp(8px,2.2vmin,14px);' +
      'cursor:pointer;touch-action:manipulation;user-select:none;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.2);' +
      'transition:transform 0.1s,box-shadow 0.1s;white-space:nowrap;';
    btn.textContent = 'Get more 🥥';
    btn.addEventListener('pointerdown', () => { btn.style.transform = 'scale(0.92)'; });
    btn.addEventListener('pointerup',   () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', onBuy);
    slot.appendChild(btn);
  }

  /** Update HUD with current stage info */
  updateStage(info: StageInfo): void {
    this.stageEl.textContent = `Stage ${info.stageIndex + 1}  ·  ${info.shapeName}`;
    const bitesLeft = info.pressesAllowed - info.pressesUsed;
    const pct = Math.max(0, bitesLeft / info.pressesAllowed);

    // Urgency color
    let biteColor = '#ffe';
    let barColor = 'linear-gradient(90deg,#4ade80,#22c55e)';
    if (bitesLeft <= 2) {
      biteColor = '#fca5a5';
      barColor = 'linear-gradient(90deg,#f87171,#ef4444)';
    } else if (bitesLeft <= 4) {
      biteColor = '#fde68a';
      barColor = 'linear-gradient(90deg,#fcd34d,#f59e0b)';
    }
    this.pressesEl.style.color = biteColor;
    this.pressesEl.textContent = `🍌 ${bitesLeft} bite${bitesLeft === 1 ? '' : 's'} left`;

    // Update drain bar
    const fill = document.getElementById('hud-bite-fill');
    if (fill) {
      fill.style.width = `${pct * 100}%`;
      fill.style.background = barColor;
    }

    // Shake on crossing low thresholds
    if (bitesLeft === 4 || bitesLeft === 2) {
      this.pressesEl.style.animation = 'none';
      void this.pressesEl.offsetWidth;
      this.pressesEl.style.animation = 'hud-shake 0.45s ease';
    }

    this._rebuildButtons(info.emojis, info.emojiCounts);
  }

  /** Attach the power-up bar element into the HUD footer slot */
  attachPowerUpBar(el: HTMLDivElement): void {
    this.powerupSlot.appendChild(el);
  }

  /** Update the coconut counter display */
  updateCoconuts(balance: number): void {
    const el = document.getElementById('hud-coconut-count');
    if (el) el.textContent = String(balance);
    // Pop animation on change
    this._coconutEl.style.animation = 'none';
    void this._coconutEl.offsetWidth;
    this._coconutEl.style.animation = 'hud-coconut-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)';
  }

  /**
   * Doober: fly `count` coconut emojis from (originX, originY) to the
   * coconut counter in the header, one after another with a small delay.
   */
  punchCoconuts(count: number, originX: number, originY: number): void {
    const destRect = this._coconutEl.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const destX = destRect.left + destRect.width / 2 - rootRect.left;
    const destY = destRect.top  + destRect.height / 2 - rootRect.top;

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const d = document.createElement('div');
        d.textContent = '🥥';
        d.style.cssText =
          'position:absolute;pointer-events:none;font-size:clamp(18px,5vmin,28px);' +
          'line-height:1;z-index:20;will-change:transform,opacity;' +
          `left:${originX - rootRect.left}px;top:${originY - rootRect.top}px;` +
          'transform:translate(-50%,-50%) scale(1.3);' +
          'transition:left 0.5s cubic-bezier(0.4,0,0.2,1),' +
          'top 0.5s cubic-bezier(0.4,0,0.2,1),' +
          'transform 0.5s cubic-bezier(0.4,0,0.2,1),opacity 0.15s;';
        this.root.appendChild(d);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          d.style.left      = `${destX}px`;
          d.style.top       = `${destY}px`;
          d.style.transform = 'translate(-50%,-50%) scale(0.65)';
        }));
        setTimeout(() => {
          d.remove();
          // Pop the counter on the last doober arrival
          if (i === count - 1) {
            this._coconutEl.style.animation = 'none';
            void this._coconutEl.offsetWidth;
            this._coconutEl.style.animation = 'hud-coconut-pop 0.35s cubic-bezier(0.34,1.56,0.64,1)';
          }
        }, 520);
      }, i * 120);
    }
  }

  /** Reset all star slots to dim (call at stage start) */
  resetStars(): void {
    for (const slot of this.starSlots) {
      slot.style.filter = 'grayscale(1) brightness(0.5)';
      slot.style.transform = 'scale(1)';
      slot.style.animation = '';
    }
  }

  /**
   * Reconcile: ensure the first `revealed` slots are lit.
   * Call after doober flight time to catch any missed star reveals.
   */
  reconcileStars(revealed: number): void {
    for (let i = 0; i < this.starSlots.length; i++) {
      const slot = this.starSlots[i];
      const shouldBeLit = i < revealed;
      const isLit = slot.style.filter === 'grayscale(0) brightness(1)';
      if (shouldBeLit && !isLit) {
        slot.style.filter = 'grayscale(0) brightness(1)';
        slot.style.animation = 'hud-star-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both';
      }
    }
  }

  /**
   * Doober animation: fly a ⭐ from screen position (originX, originY)
   * to the next uncollected star slot, then light it up.
   * @param slotIndex  which slot to fill (0, 1, 2)
   * @param originX    CSS-pixel X of the 3D star in the viewport
   * @param originY    CSS-pixel Y of the 3D star in the viewport
   */
  punchStars(slotIndex: number, originX: number, originY: number): void {
    const slot = this.starSlots[slotIndex];
    if (!slot) return;

    // Get the slot's centre in viewport coords
    const slotRect = slot.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const destX = slotRect.left + slotRect.width / 2 - rootRect.left;
    const destY = slotRect.top  + slotRect.height / 2 - rootRect.top;

    // Create the flying doober
    const doober = document.createElement('div');
    doober.textContent = '⭐';
    doober.style.cssText =
      'position:absolute;pointer-events:none;font-size:clamp(22px,6vmin,36px);' +
      'line-height:1;z-index:20;will-change:transform,opacity;' +
      // Start at the origin (relative to root)
      `left:${originX - rootRect.left}px;top:${originY - rootRect.top}px;` +
      'transform:translate(-50%,-50%) scale(1.4);' +
      'transition:left 0.55s cubic-bezier(0.4,0,0.2,1),' +
      'top 0.55s cubic-bezier(0.4,0,0.2,1),' +
      'transform 0.55s cubic-bezier(0.4,0,0.2,1),' +
      'opacity 0.1s;';
    this.root.appendChild(doober);

    // Kick off the flight on the next frame so the initial position paints first
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        doober.style.left   = `${destX}px`;
        doober.style.top    = `${destY}px`;
        doober.style.transform = 'translate(-50%,-50%) scale(0.7)';
      });
    });

    // When it arrives: light up the slot with a springy pop
    setTimeout(() => {
      doober.remove();
      slot.style.filter = 'grayscale(0) brightness(1)';
      slot.style.animation = 'hud-star-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both';
    }, 570);
  }

  /** Show a brief floating toast for item triggers */
  showItemToast(type: 'bomb' | 'extrabites' | 'broke', detail?: number): void {
    const toast = document.createElement('div');
    let text: string;
    let accent: string;
    if (type === 'bomb') {
      text = `💣 BOOM! ${detail ?? 0} emojis blasted!`;
      accent = 'rgba(239,68,68,0.9)';
    } else if (type === 'broke') {
      text = '🥥 Not enough coconuts!';
      accent = 'rgba(120,60,10,0.92)';
    } else {
      text = '🐵 +3 extra bites!';
      accent = 'rgba(34,197,94,0.9)';
    }
    toast.textContent = text;
    toast.style.cssText =
      'position:absolute;left:50%;top:36%;' +
      'background:' + accent + ';' +
      'color:#fff;border-radius:999px;' +
      'padding:clamp(8px,2vmin,12px) clamp(16px,5vmin,28px);' +
      'font-size:clamp(13px,3.8vmin,20px);font-weight:800;letter-spacing:0.01em;' +
      'pointer-events:none;white-space:nowrap;z-index:10;' +
      'box-shadow:0 4px 20px rgba(0,0,0,0.4);' +
      'animation:hud-slide-up 0.25s ease both;' +
      'transition:opacity 0.4s,transform 0.4s;';
    this.root.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => toast.remove(), 420);
    }, 1100);
  }

  private _rebuildButtons(emojis: string[], counts?: number[]): void {
    this.buttonsRow.innerHTML = '';
    this._badgeEls.clear();
    emojis.forEach((emoji, idx) => {
      const count = counts?.[idx] ?? -1;
      const depleted = count === 0;

      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;display:inline-flex;';

      const btn = document.createElement('button');
      btn.textContent = emoji;
      btn.dataset.idx = String(idx);
      btn.style.cssText =
        'pointer-events:auto;' +
        'background:' + (depleted ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)') + ';' +
        'border:1.5px solid ' + (depleted ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.35)') + ';' +
        'border-radius:18px;' +
        'font-size:clamp(24px,7vmin,42px);' +
        'width:clamp(56px,14vmin,78px);height:clamp(56px,14vmin,78px);' +
        'cursor:' + (depleted ? 'default' : 'pointer') + ';' +
        'touch-action:manipulation;user-select:none;' +
        'display:flex;align-items:center;justify-content:center;' +
        'transition:transform 0.1s ease,background 0.15s,box-shadow 0.15s,opacity 0.2s;' +
        'box-shadow:' + (depleted ? 'none' : '0 2px 8px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.2)') + ';' +
        'opacity:' + (depleted ? '0.32' : '1') + ';';

      if (!depleted) {
        btn.addEventListener('pointerenter', () => {
          btn.style.background = 'rgba(255,255,255,0.26)';
          btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.25)';
        });
        btn.addEventListener('pointerleave', () => {
          btn.style.transform = 'scale(1)';
          btn.style.background = 'rgba(255,255,255,0.18)';
          btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.2)';
        });
      }
      btn.addEventListener('pointerdown', () => {
        if (depleted) return;
        btn.style.transform = 'scale(0.86)';
        btn.style.boxShadow = '0 1px 4px rgba(0,0,0,0.2)';
      });
      btn.addEventListener('pointerup', () => {
        if (depleted) return;
        btn.style.transform = 'scale(1)';
        this.onPress(idx);
      });

      // Count badge (top-right corner)
      if (count >= 0) {
        const badge = document.createElement('div');
        badge.textContent = String(count);
        badge.style.cssText =
          'position:absolute;top:-5px;right:-5px;' +
          'min-width:clamp(16px,4vmin,22px);height:clamp(16px,4vmin,22px);' +
          'background:' + (depleted ? 'rgba(100,100,100,0.8)' : 'rgba(0,0,0,0.75)') + ';' +
          'color:' + (depleted ? '#888' : '#fff') + ';' +
          'border-radius:999px;font-size:clamp(9px,2.4vmin,13px);font-weight:700;' +
          'display:flex;align-items:center;justify-content:center;' +
          'padding:0 3px;pointer-events:none;line-height:1;z-index:10;';
        wrap.appendChild(badge);
        this._badgeEls.set(idx, badge);
      }

      wrap.appendChild(btn);
      this.buttonsRow.appendChild(wrap);
    });

    // Collect the button elements themselves as dance targets
    this._fruitIcons = Array.from(
      this.buttonsRow.querySelectorAll('button'),
    ) as HTMLElement[];
  }

  /**
   * Call every frame with the current beat (0–1 transient) and elapsed time.
   * Drives a BPM-locked bounce on the fruit emoji buttons.
   */
  setBeatEnergy(beat: number, energy: number, dt: number): void {
    this._beatTime += dt;
    // 123.77 BPM sine — gives steady rhythm between transients
    const BPM_HZ = 123.77 / 60;
    const bpmSine = Math.sin(this._beatTime * BPM_HZ * Math.PI * 2) * 0.5 + 0.5; // 0–1
    // Combine: BPM pulse as baseline, beat transient adds extra pop
    const scale = 1 + bpmSine * 0.08 * (0.4 + energy) + beat * 0.18;
    // Wiggle rotation: full-wave sine so buttons rock left↔right each beat
    const rot = Math.sin(this._beatTime * BPM_HZ * Math.PI * 2) * (8 + beat * 14);
    for (const el of this._fruitIcons) {
      el.style.transform = `scale(${scale.toFixed(3)}) rotate(${rot.toFixed(2)}deg)`;
    }
  }

  /** Flash a button to give feedback */
  flashButton(emojiIndex: number, hadEffect: boolean): void {
    const btn = this.buttonsRow.querySelector(`[data-idx="${emojiIndex}"]`) as HTMLButtonElement | null;
    if (!btn) return;
    if (hadEffect) {
      btn.style.background = 'rgba(74,222,128,0.45)';
      btn.style.boxShadow = '0 0 0 3px rgba(74,222,128,0.5),0 2px 8px rgba(0,0,0,0.25)';
      btn.style.animation = 'none';
      void btn.offsetWidth;
      btn.style.animation = 'hud-btn-pop 0.28s cubic-bezier(0.34,1.56,0.64,1)';
      setTimeout(() => {
        btn.style.background = 'rgba(255,255,255,0.18)';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.2)';
      }, 320);
    } else {
      btn.style.background = 'rgba(248,113,113,0.45)';
      btn.style.boxShadow = '0 0 0 3px rgba(248,113,113,0.4),0 2px 8px rgba(0,0,0,0.25)';
      setTimeout(() => {
        btn.style.background = 'rgba(255,255,255,0.18)';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.2)';
      }, 320);
    }
  }

  /** Show result overlay */
  showResult(
    result: StageResult,
    isLastStage: boolean,
    coconutsEarned: number,
    onAction: () => void,
    onCoconutDoober?: (originX: number, originY: number) => void,
  ): void {
    this.overlayEl.innerHTML = '';
    this.overlayEl.style.display = 'flex';

    const cleared = result.state === 'cleared';

    // Animated card
    const card = document.createElement('div');
    card.className = 'hud-overlay-card';
    card.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:2.5vmin;' +
      'background:rgba(15,15,25,0.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
      'border:1px solid rgba(255,255,255,0.14);border-radius:26px;' +
      'padding:clamp(20px,5vmin,36px) clamp(24px,7vmin,52px);' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.1);' +
      'max-width:min(88vmin,360px);width:100%;';

    // For cleared: live floss-dancing monkey; for failed: sad emoji
    const icon = document.createElement('div');
    if (cleared) {
      this._resultMonkey?.dispose();
      this._resultMonkey = new IntroMonkey(240, 'floss');
      this._resultMonkey.canvas.style.cssText =
        'width:100%;height:auto;display:block;border-radius:16px;';
      icon.style.cssText = 'width:100%;';
      icon.appendChild(this._resultMonkey.canvas);
    } else {
      icon.style.cssText = 'font-size:clamp(44px,14vmin,80px);line-height:1;';
      icon.textContent = '😔';
    }

    const msg = document.createElement('div');
    msg.style.cssText =
      'font-size:clamp(18px,5.5vmin,32px);font-weight:900;color:#fff;' +
      'text-shadow:0 2px 8px rgba(0,0,0,0.5);text-align:center;letter-spacing:-0.02em;';
    msg.textContent = cleared ? 'All Stars Found!' : 'Out of Bites!';

    const sub = document.createElement('div');
    sub.style.cssText =
      'font-size:clamp(12px,3.2vmin,18px);color:rgba(255,255,255,0.7);text-align:center;';
    sub.textContent = cleared
      ? `⭐ ${result.starsFound} / ${result.starsTotal} stars collected`
      : `Found ${result.starsFound} / ${result.starsTotal} stars — so close!`;

    card.appendChild(icon);
    card.appendChild(msg);

    // Cleared: always show all 3 hidden stars found, plus a banana performance rating
    if (cleared) {
      // All 3 stars collected — show them all lit
      const starsEl = document.createElement('div');
      starsEl.style.cssText = 'display:flex;gap:2.5vmin;font-size:clamp(30px,10vmin,58px);';
      for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.textContent = '⭐';
        s.style.cssText = 'display:inline-block;transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1);';
        starsEl.appendChild(s);
        setTimeout(() => {
          s.style.transform = 'scale(1.5) rotate(-6deg)';
          setTimeout(() => { s.style.transform = 'scale(1) rotate(0deg)'; }, 250);
        }, 180 + i * 140);
      }
      card.appendChild(starsEl);

      // Banana performance rating (bites efficiency) — separate from the star mechanic
      const bitesLeft = result.pressesAllowed - result.pressesUsed;
      const pct = bitesLeft / result.pressesAllowed;
      const bananas = pct > 0.5 ? 3 : pct > 0.2 ? 2 : 1;
      const perfEl = document.createElement('div');
      perfEl.style.cssText = 'display:flex;gap:1.5vmin;font-size:clamp(18px,5.5vmin,32px);align-items:center;';
      const perfLabel = document.createElement('span');
      perfLabel.style.cssText = 'font-size:clamp(10px,2.8vmin,15px);color:rgba(255,255,255,0.6);';
      perfLabel.textContent = 'Efficiency:';
      perfEl.appendChild(perfLabel);
      for (let i = 0; i < 3; i++) {
        const b = document.createElement('span');
        b.textContent = i < bananas ? '🍌' : '🥥';
        b.style.cssText = 'display:inline-block;' + (i < bananas ? '' : 'opacity:0.3;filter:grayscale(1);');
        perfEl.appendChild(b);
      }
      card.appendChild(perfEl);
    }

    // Coconut earn row (cleared stages only)
    if (cleared && coconutsEarned > 0) {
      const earnRow = document.createElement('div');
      earnRow.style.cssText =
        'display:flex;align-items:center;justify-content:center;gap:2vmin;' +
        'background:rgba(120,80,20,0.45);border:1px solid rgba(255,210,100,0.3);' +
        'border-radius:14px;padding:clamp(8px,2vmin,12px) clamp(14px,4vmin,22px);' +
        'width:100%;box-sizing:border-box;';
      const earnIcon = document.createElement('span');
      earnIcon.style.cssText = 'font-size:clamp(20px,6vmin,32px);';
      earnIcon.textContent = '🥥';
      const earnText = document.createElement('span');
      earnText.style.cssText =
        'font-size:clamp(13px,3.8vmin,20px);font-weight:800;color:#ffe;';
      earnText.textContent = `+${coconutsEarned} Coconuts earned!`;
      earnRow.appendChild(earnIcon);
      earnRow.appendChild(earnText);
      card.appendChild(earnRow);

      // Fire doober after the card has rendered (next frame)
      if (onCoconutDoober) {
        setTimeout(() => {
          const r = earnRow.getBoundingClientRect();
          // Pass viewport-absolute centre of the earn row
          onCoconutDoober(r.left + r.width / 2, r.top + r.height / 2);
        }, 400);
      }
    }

    card.appendChild(sub);

    // CTA button
    const btn = document.createElement('button');
    let btnBg = '#ef4444';
    let btnShadow = 'rgba(239,68,68,0.4)';
    if (cleared && isLastStage) { btnBg = '#f59e0b'; btnShadow = 'rgba(245,158,11,0.4)'; }
    else if (cleared)           { btnBg = '#22c55e'; btnShadow = 'rgba(34,197,94,0.4)'; }
    btn.style.cssText =
      'pointer-events:auto;color:#fff;border:none;border-radius:999px;' +
      'font-size:clamp(15px,4.2vmin,24px);font-weight:800;letter-spacing:0.01em;' +
      'padding:clamp(12px,3vmin,18px) clamp(28px,8vmin,52px);' +
      'cursor:pointer;touch-action:manipulation;user-select:none;' +
      'background:' + btnBg + ';' +
      'box-shadow:0 6px 24px ' + btnShadow + ',inset 0 1px 0 rgba(255,255,255,0.2);' +
      'transition:transform 0.1s,box-shadow 0.1s;';
    btn.textContent = cleared && isLastStage ? '🏆 Play Again'
      : cleared ? 'Next Stage →' : 'Try Again 🔄';
    btn.addEventListener('pointerdown', () => { btn.style.transform = 'scale(0.95)'; });
    btn.addEventListener('pointerup',   () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', () => { this.hideOverlay(); onAction(); });

    card.appendChild(btn);
    this.overlayEl.appendChild(card);
  }

  hideOverlay(): void {
    this.overlayEl.style.display = 'none';
    this.overlayEl.innerHTML = '';
    this._introMonkey?.dispose();
    this._introMonkey = null;
    this._resultMonkey?.dispose();
    this._resultMonkey = null;
  }

  /** Show intro screen */
  showIntro(onStart: () => void): void {
    // Dispose any previous intro monkey renderer
    this._introMonkey?.dispose();
    this._introMonkey = null;

    this.overlayEl.innerHTML = '';
    this.overlayEl.style.display = 'flex';

    const card = document.createElement('div');
    card.className = 'hud-overlay-card';
    card.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:2vmin;' +
      'background:rgba(15,15,25,0.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
      'border:1px solid rgba(255,255,255,0.14);border-radius:26px;' +
      'padding:clamp(20px,5vmin,36px) clamp(24px,7vmin,52px);' +
      'box-shadow:0 8px 40px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.1);' +
      'max-width:min(88vmin,360px);width:100%;';

    // Live dancing monkey — render at a fixed internal resolution, display full card width
    this._introMonkey = new IntroMonkey(240);
    this._introMonkey.canvas.style.cssText =
      'width:100%;height:auto;display:block;border-radius:16px;';
    const icon = document.createElement('div');
    icon.style.cssText = 'width:100%;';
    icon.appendChild(this._introMonkey.canvas);

    const title = document.createElement('div');
    title.style.cssText =
      'font-size:clamp(24px,7.5vmin,44px);font-weight:900;letter-spacing:-0.03em;text-align:center;' +
      'background:linear-gradient(135deg,#ffe066 0%,#ffb347 55%,#ff6b35 100%);' +
      '-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;' +
      'filter:drop-shadow(0 2px 6px rgba(0,0,0,0.4));';
    title.textContent = 'Munchy Monkey: Munch-3 Puzzle';

    // Step-by-step how-to rows
    const steps: [string, string][] = [
      ['👆', 'Drag the fruit to rotate it'],
      ['🍊', 'Tap a fruit button to eat emojis'],
      ['⭐', 'Uncover all 3 hidden stars to win!'],
    ];
    const stepsEl = document.createElement('div');
    stepsEl.style.cssText =
      'display:flex;flex-direction:column;gap:2vmin;width:100%;';
    for (const [emoji, text] of steps) {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:3vmin;' +
        'background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);' +
        'border-radius:14px;padding:clamp(8px,2vmin,12px) clamp(12px,3vmin,18px);';
      const em = document.createElement('span');
      em.style.cssText = 'font-size:clamp(20px,6vmin,30px);flex-shrink:0;';
      em.textContent = emoji;
      const tx = document.createElement('span');
      tx.style.cssText =
        'font-size:clamp(12px,3.2vmin,17px);color:rgba(255,255,255,0.88);' +
        'font-weight:600;line-height:1.3;';
      tx.textContent = text;
      row.appendChild(em);
      row.appendChild(tx);
      stepsEl.appendChild(row);
    }

    const btn = document.createElement('button');
    btn.style.cssText =
      'pointer-events:auto;background:#f59e0b;color:#fff;border:none;border-radius:999px;' +
      'font-size:clamp(16px,4.8vmin,26px);font-weight:800;letter-spacing:0.01em;' +
      'padding:clamp(13px,3.2vmin,20px) clamp(30px,9vmin,60px);' +
      'cursor:pointer;touch-action:manipulation;user-select:none;' +
      'box-shadow:0 6px 24px rgba(245,158,11,0.5),inset 0 1px 0 rgba(255,255,255,0.2);' +
      'transition:transform 0.1s,box-shadow 0.1s;';
    btn.textContent = 'Start Munching! 🍌';
    btn.addEventListener('pointerdown', () => { btn.style.transform = 'scale(0.95)'; });
    btn.addEventListener('pointerup',   () => { btn.style.transform = 'scale(1)'; });
    btn.addEventListener('click', () => { this.hideOverlay(); onStart(); });

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(stepsEl);
    card.appendChild(btn);
    this.overlayEl.appendChild(card);
  }
}
