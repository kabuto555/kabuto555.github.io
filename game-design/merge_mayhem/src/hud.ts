// ── DOM HUD overlay for Merge Mayhem ─────────────────────────────────────────
import { PIECE_COLORS, MERGE_CONFIG } from './merge-config';
import { type ColorProgress } from './game-state';

const CLEAR_STACK_VALUE = MERGE_CONFIG.CLEAR_STACK_VALUE;

export interface HudElements {
  root: HTMLDivElement;
  stageEl: HTMLSpanElement;
  scoreEl: HTMLSpanElement;
  progressBars: HTMLDivElement;
  messageEl: HTMLDivElement;
  update(stage: number, score: number, progress: ColorProgress[]): void;
  showMessage(text: string, sub?: string): void;
  hideMessage(): void;
}

export function createHud(container: HTMLElement): HudElements {
  // Root overlay — pointer-events none so it never blocks the canvas
  const root = document.createElement('div');
  root.style.cssText = [
    'position:absolute;inset:0;pointer-events:none;',
    "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;",
    'display:flex;flex-direction:column;justify-content:space-between;',
    'padding:max(10px,env(safe-area-inset-top),var(--sat,0px)) ',
    'max(10px,env(safe-area-inset-right),var(--sar,0px)) ',
    'max(10px,env(safe-area-inset-bottom),var(--sab,0px)) ',
    'max(10px,env(safe-area-inset-left),var(--sal,0px));',
  ].join('');

  // ── Top bar ───────────────────────────────────────────────────────────────
  const topBar = document.createElement('div');
  topBar.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;' +
    'background:rgba(20,30,48,0.82);border-radius:14px;padding:8px 16px;' +
    'backdrop-filter:blur(6px);';

  const stageEl = document.createElement('span');
  stageEl.style.cssText = 'color:#7ec8e3;font-size:clamp(14px,3.5vmin,20px);font-weight:700;';
  stageEl.textContent = 'Stage 1';

  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'color:#ffffff;font-size:clamp(16px,4vmin,22px);font-weight:800;letter-spacing:0.03em;';
  titleEl.textContent = 'MERGE MAYHEM';

  const scoreEl = document.createElement('span');
  scoreEl.style.cssText = 'color:#f9ca24;font-size:clamp(14px,3.5vmin,20px);font-weight:700;';
  scoreEl.textContent = '0';

  topBar.appendChild(stageEl);
  topBar.appendChild(titleEl);
  topBar.appendChild(scoreEl);

  // ── Bottom: color progress bars ───────────────────────────────────────────
  const progressBars = document.createElement('div');
  progressBars.style.cssText =
    'display:flex;flex-direction:column;gap:6px;' +
    'background:rgba(20,30,48,0.82);border-radius:14px;padding:10px 14px;' +
    'backdrop-filter:blur(6px);';

  const progressLabel = document.createElement('div');
  progressLabel.style.cssText = 'color:#aab8c8;font-size:clamp(10px,2.5vmin,13px);font-weight:600;margin-bottom:2px;';
  progressLabel.textContent = 'COLOR PROGRESS';
  progressBars.appendChild(progressLabel);

  // ── Center: message overlay ───────────────────────────────────────────────
  const messageEl = document.createElement('div');
  messageEl.style.cssText = [
    'position:absolute;inset:0;display:none;flex-direction:column;',
    'align-items:center;justify-content:center;pointer-events:none;',
    'background:rgba(10,15,30,0.75);backdrop-filter:blur(4px);',
  ].join('');

  const msgTitle = document.createElement('div');
  msgTitle.style.cssText = 'color:#fff;font-size:clamp(28px,7vmin,48px);font-weight:900;text-align:center;';
  const msgSub = document.createElement('div');
  msgSub.style.cssText = 'color:#aab8c8;font-size:clamp(14px,3.5vmin,22px);margin-top:12px;text-align:center;';
  messageEl.appendChild(msgTitle);
  messageEl.appendChild(msgSub);

  root.appendChild(topBar);
  root.appendChild(progressBars);
  container.appendChild(root);
  container.appendChild(messageEl);

  // ── API ───────────────────────────────────────────────────────────────────
  function update(stage: number, score: number, progress: ColorProgress[]): void {
    stageEl.textContent = `Stage ${stage}`;
    scoreEl.textContent = String(score);

    // Rebuild progress bars
    // Remove all bar rows (keep the label)
    while (progressBars.children.length > 1) progressBars.removeChild(progressBars.lastChild!);

    for (const cp of progress) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;';

      const dot = document.createElement('div');
      const hex = PIECE_COLORS[cp.colorIndex];
      const r = (hex >> 16) & 0xff;
      const g = (hex >> 8) & 0xff;
      const b = hex & 0xff;
      dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:rgb(${r},${g},${b});flex-shrink:0;`;

      const track = document.createElement('div');
      track.style.cssText =
        'flex:1;height:8px;background:rgba(255,255,255,0.12);border-radius:4px;overflow:hidden;';

      const fill = document.createElement('div');
      const pct = Math.min(100, (cp.maxStack / CLEAR_STACK_VALUE) * 100);
      fill.style.cssText = `height:100%;border-radius:4px;background:rgb(${r},${g},${b});` +
        `width:${pct.toFixed(1)}%;transition:width 0.3s ease;`;

      const valEl = document.createElement('div');
      valEl.style.cssText = 'color:#ccd6f6;font-size:clamp(10px,2.5vmin,13px);font-weight:600;min-width:28px;text-align:right;';
      valEl.textContent = `${cp.maxStack}/${CLEAR_STACK_VALUE}`;

      track.appendChild(fill);
      row.appendChild(dot);
      row.appendChild(track);
      row.appendChild(valEl);
      progressBars.appendChild(row);
    }
  }

  function showMessage(text: string, sub = ''): void {
    msgTitle.textContent = text;
    msgSub.textContent = sub;
    messageEl.style.display = 'flex';
  }

  function hideMessage(): void {
    messageEl.style.display = 'none';
  }

  return { root, stageEl, scoreEl, progressBars, messageEl, update, showMessage, hideMessage };
}
