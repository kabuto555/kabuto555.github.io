/**
 * Title screen — "Monkey Suit Banandam"
 * DOM overlay with anime-styled title text layered over the 3D scene.
 * The player character is posed in a hero stance behind the UI.
 */

import type { PlayerShip } from '../entities/player';

export interface TitleScreen {
  root: HTMLDivElement;
  /** Call every frame while title is showing — animates the text effects. */
  update(elapsed: number): void;
  /** Fade out and call onDone when animation is complete. */
  dismiss(onDone: () => void): void;
}

export function createTitleScreen(container: HTMLElement): TitleScreen {
  const root = document.createElement('div');
  root.style.cssText = `
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    pointer-events: auto;
    z-index: 20;
    overflow: hidden;
  `;

  // ── Gradient background (semi-transparent so 3D shows through) ──────────────
  const bg = document.createElement('div');
  bg.style.cssText = `
    position: absolute; inset: 0;
    background: linear-gradient(
      180deg,
      rgba(0,0,0,0.72) 0%,
      rgba(4,8,30,0.55) 38%,
      rgba(4,8,30,0.30) 60%,
      rgba(0,0,0,0.78) 100%
    );
    pointer-events: none;
  `;
  root.appendChild(bg);

  // ── Scan-line overlay (pure CSS stripes — no images) ───────────────────────
  const scanLines = document.createElement('div');
  scanLines.style.cssText = `
    position: absolute; inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(0,0,0,0.10) 3px,
      rgba(0,0,0,0.10) 4px
    );
    pointer-events: none;
  `;
  root.appendChild(scanLines);

  // ── Content wrapper ─────────────────────────────────────────────────────────
  const content = document.createElement('div');
  content.style.cssText = `
    position: relative;
    display: flex; flex-direction: column;
    align-items: center;
    gap: 0;
    width: 100%;
    padding: max(14px, env(safe-area-inset-top), var(--sat, 0px)) 12px 0;
    box-sizing: border-box;
  `;
  root.appendChild(content);

  // ── Subtitle line above title ───────────────────────────────────────────────
  const subtitle = document.createElement('div');
  subtitle.textContent = '— SPACE DEFENDER OF THE GALAXY —';
  subtitle.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(8px, 2.2vmin, 13px);
    font-weight: 700;
    letter-spacing: 0.22em;
    color: #88ccff;
    text-transform: uppercase;
    text-shadow: 0 0 8px rgba(80,180,255,0.9);
    margin-bottom: 6px;
    opacity: 0.92;
  `;
  content.appendChild(subtitle);

  // ── Main title ──────────────────────────────────────────────────────────────
  const titleWrap = document.createElement('div');
  titleWrap.style.cssText = `
    position: relative;
    display: flex; flex-direction: column; align-items: center;
  `;
  content.appendChild(titleWrap);

  // Shadow / outline layer (drawn behind, offset, same text)
  const titleShadow = document.createElement('div');
  titleShadow.textContent = 'MONKEY SUIT';
  titleShadow.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(36px, 11vmin, 68px);
    font-weight: 900;
    letter-spacing: -0.01em;
    color: #002244;
    text-transform: uppercase;
    position: absolute; top: 3px; left: 3px;
    white-space: nowrap;
    pointer-events: none;
  `;
  titleWrap.appendChild(titleShadow);

  const titleLine1 = document.createElement('div');
  titleLine1.textContent = 'MONKEY SUIT';
  titleLine1.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(36px, 11vmin, 68px);
    font-weight: 900;
    letter-spacing: -0.01em;
    color: #ffffff;
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow:
      0 0 12px rgba(80,180,255,1),
      0 0 28px rgba(80,180,255,0.7),
      0 0 50px rgba(80,140,255,0.4);
    position: relative;
    line-height: 1.0;
  `;
  titleWrap.appendChild(titleLine1);

  // BANANDAM — bigger, gold accent
  const titleWrap2 = document.createElement('div');
  titleWrap2.style.cssText = `
    position: relative; display: flex; align-items: center;
    margin-top: -4px;
  `;
  content.appendChild(titleWrap2);

  const titleShadow2 = document.createElement('div');
  titleShadow2.textContent = 'BANANDAM';
  titleShadow2.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(48px, 15vmin, 92px);
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #553300;
    text-transform: uppercase;
    position: absolute; top: 4px; left: 4px;
    white-space: nowrap;
    pointer-events: none;
  `;
  titleWrap2.appendChild(titleShadow2);

  const titleLine2 = document.createElement('div');
  titleLine2.textContent = 'BANANDAM';
  titleLine2.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(48px, 15vmin, 92px);
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #ffdd44;
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow:
      0 0 10px rgba(255,220,0,1),
      0 0 24px rgba(255,180,0,0.8),
      0 0 48px rgba(255,140,0,0.5);
    position: relative;
    line-height: 1.0;
  `;
  titleWrap2.appendChild(titleLine2);

  // ── Horizontal divider ─────────────────────────────────────────────────────
  const divider = document.createElement('div');
  divider.style.cssText = `
    width: min(72%, 320px);
    height: 2px;
    margin: 10px 0 8px;
    background: linear-gradient(90deg, transparent, #88ccff, #ffdd44, #88ccff, transparent);
    opacity: 0.80;
  `;
  content.appendChild(divider);

  // ── Tagline ────────────────────────────────────────────────────────────────
  const tagline = document.createElement('div');
  tagline.textContent = 'APE WARRIOR · SPACE DEFENDER · BANANA REPUBLIC';
  tagline.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(7px, 1.8vmin, 11px);
    font-weight: 600;
    letter-spacing: 0.18em;
    color: #aaddff;
    text-transform: uppercase;
    opacity: 0.75;
    text-align: center;
    padding: 0 8px;
  `;
  content.appendChild(tagline);

  // ── "TAP TO START" prompt — bottom of screen ────────────────────────────────
  const tapPrompt = document.createElement('div');
  tapPrompt.textContent = '▶  TAP TO START  ◀';
  tapPrompt.style.cssText = `
    position: absolute;
    bottom: max(52px, calc(env(safe-area-inset-bottom, 0px) + var(--sab, 0px) + 44px));
    left: 50%; transform: translateX(-50%);
    font-family: sans-serif;
    font-size: clamp(13px, 3.5vmin, 20px);
    font-weight: 800;
    letter-spacing: 0.15em;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(80,200,255,1), 0 0 22px rgba(80,180,255,0.7);
    white-space: nowrap;
    pointer-events: none;
  `;
  root.appendChild(tapPrompt);

  container.appendChild(root);

  // ── Animation state ────────────────────────────────────────────────────────
  let _dismissed = false;

  function update(elapsed: number): void {
    if (_dismissed) return;
    // Pulse the tap prompt
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 3.2);
    tapPrompt.style.opacity = (0.55 + pulse * 0.45).toFixed(2);
    // Subtle hue shift on BANANDAM glow
    const hue = 40 + Math.sin(elapsed * 0.8) * 18;
    titleLine2.style.textShadow = `
      0 0 10px hsla(${hue},100%,55%,1),
      0 0 24px hsla(${hue},100%,50%,0.8),
      0 0 48px hsla(${hue - 10},100%,45%,0.5)
    `;
    // Shimmer MONKEY SUIT glow
    const blueHue = 210 + Math.sin(elapsed * 1.1) * 15;
    titleLine1.style.textShadow = `
      0 0 12px hsla(${blueHue},90%,75%,1),
      0 0 28px hsla(${blueHue},80%,65%,0.7),
      0 0 50px hsla(${blueHue},70%,55%,0.4)
    `;
  }

  function dismiss(onDone: () => void): void {
    if (_dismissed) return;
    _dismissed = true;
    root.style.transition = 'opacity 0.45s ease-out';
    root.style.opacity = '0';
    setTimeout(() => {
      root.remove();
      onDone();
    }, 460);
  }

  return { root, update, dismiss };
}

/**
 * Apply a shōnen hero pose to the player ship for the title screen.
 * Right arm raised forward-upward (gun aimed at viewer), left arm
 * spread wide (beam cannon out), body leaning slightly forward.
 */
export function applyHeroPose(ship: PlayerShip): void {
  // Right arm: raised up and forward — pointing gun heroically
  ship.armR.rotation.set(-1.0, 0.0, -0.55);
  // Left arm: spread out to the side — beam cannon pointing left-forward
  ship.armL.rotation.set(-0.65, 0.0, 0.70);
  // Head: lifted slightly, looking up and forward
  ship.headGroup.rotation.set(-0.22, 0.0, 0.0);
}

/**
 * Animate the hero pose slightly — subtle breathing + dramatic hold.
 * Call each frame instead of animatePlayerShip during title.
 */
export function animateHeroPose(ship: PlayerShip, elapsed: number): void {
  // Slow majestic bob — heavier than gameplay bob
  ship.recoilPivot.quaternion.identity();
  ship.recoilPivot.rotateZ(Math.sin(elapsed * 0.8) * 0.025);
  ship.recoilPivot.rotateX(Math.sin(elapsed * 0.55) * 0.018);

  // Arms hold pose but breathe gently
  ship.armR.rotation.x = -1.0  + Math.sin(elapsed * 0.9)  * 0.04;
  ship.armR.rotation.z = -0.55 + Math.sin(elapsed * 0.65) * 0.03;
  ship.armL.rotation.x = -0.65 + Math.sin(elapsed * 0.9 + 0.4) * 0.04;
  ship.armL.rotation.z =  0.70 + Math.sin(elapsed * 0.65 + 0.4) * 0.03;

  // Tail waves dramatically
  ship.tail.rotation.x = Math.sin(elapsed * 1.8) * 0.35;
  ship.tail.rotation.z = Math.sin(elapsed * 1.4) * 0.20;
}
