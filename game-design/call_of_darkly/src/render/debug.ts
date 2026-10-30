import type { Ps1Options, Ps1Pipeline } from './types';
import { FOG_PRESETS, applyFogPreset, type FogPresetName } from './fog';

/** F6 cycle: full PS1 -> each effect off in turn -> bypass (full-res, no effects). */
export const PS1_DEBUG_MODES: ReadonlyArray<{ label: string; opts: Partial<Ps1Options> }> = [
  { label: 'PS1: all on', opts: { enabled: true, snap: true, affine: true, dither: true } },
  { label: 'PS1: snap off', opts: { enabled: true, snap: false, affine: true, dither: true } },
  { label: 'PS1: affine off', opts: { enabled: true, snap: true, affine: false, dither: true } },
  { label: 'PS1: dither off', opts: { enabled: true, snap: true, affine: true, dither: false } },
  { label: 'PS1: bypass (full-res)', opts: { enabled: false } },
];

/**
 * Debug keys: F6 cycles PS1_DEBUG_MODES, F7 cycles fog presets. Shows a fading label in #ui.
 * Returns a detach function.
 */
export function attachPs1DebugKeys(pipeline: Ps1Pipeline, target: Window = window): () => void {
  let mode = 0;
  let fogIdx = 0;
  const fogNames = Object.keys(FOG_PRESETS) as FogPresetName[];
  const label = document.createElement('div');
  label.style.cssText =
    'position:absolute;top:20px;right:6px;font:12px monospace;color:#ddd;text-shadow:1px 1px 0 #000;opacity:0;transition:opacity .6s';
  (document.getElementById('ui') ?? document.body).appendChild(label);
  let hideTimer = 0;
  const show = (text: string) => {
    label.textContent = text;
    label.style.opacity = '1';
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => (label.style.opacity = '0'), 1500);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'F6') {
      e.preventDefault();
      mode = (mode + 1) % PS1_DEBUG_MODES.length;
      const m = PS1_DEBUG_MODES[mode]!;
      // Reset to all-on before applying so modes don't accumulate.
      pipeline.setOptions?.({ ...PS1_DEBUG_MODES[0]!.opts, ...m.opts });
      show(m.label);
    } else if (e.code === 'F7') {
      e.preventDefault();
      fogIdx = (fogIdx + 1) % fogNames.length;
      applyFogPreset(pipeline, fogNames[fogIdx]!);
      show(`fog: ${fogNames[fogIdx]}`);
    }
  };
  target.addEventListener('keydown', onKey);
  return () => {
    target.removeEventListener('keydown', onKey);
    clearTimeout(hideTimer);
    label.remove();
  };
}
