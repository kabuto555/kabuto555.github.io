// Design tokens for the Chonkimals UI kit, lifted 1:1 from the Figma
// "Hackathon" file (Modal / Dodge Ball, node 123:147). All sizes in this kit
// are in Figma DESIGN pixels (the 1080-wide phone frame); components are laid
// out at design size and scaled to the screen as a whole (see fitToScreen).

export const DESIGN_FRAME_WIDTH = 1080;

export const COLORS = {
  cream: '#ebdecd',       // card fill fallback, Back button, light text
  creamDim: '#e9c9a4',    // header title text
  brown: '#674833',       // borders, dark button, body text
  brownDark: '#3a2415',   // drop shadows, dark borders
  brownInk: '#2b1a0e',    // plaque inner border, title shadow
  plaque: '#83644b',      // header plaque base
  plaqueFelt: '#82634a',  // header plaque felt fallback
  ready: '#885f44',       // Ready! button fill
  readyBorder: '#5e3a22',
  readyShadow: '#432a18',
  readyGlow: '#2d1d0b',
  dotStroke: '#59380D',
  dotStrokeDark: '#3D2613',
  pagerTab: 'rgba(255,255,255,0.2)',
  // Store screens (Character Select / Shop)
  plaqueScreen: '#c5a58b', // header plaque base on full screens
  cardBorder: '#dfc3a5',
  cardShadow: '#d0a780',
  cardArt: '#ebdecd',
  ink: '#24333c',          // card names / prices
  blue: '#4eb3f5',
  blueLight: '#a6dafc',
  blueDark: '#3e82b0',
  coin: '#ffd23f',
  coinLight: '#ffefa6',
  coinDark: '#d89e00',
  coinInk: '#b57648',
  badgeText: '#fad5ac',
  badgeShadow: '#572a17',
  scrim: 'rgba(0,0,0,0.4)',
} as const;

export const FONT = "'Fredoka', system-ui, sans-serif";

/**
 * Button corner radius as a fraction of button height — the chunky rounded rectangle of the
 * Figma hero buttons (Next/Back 0.36, Ready! 0.44). Every tappable button uses this instead
 * of a full pill (radius ≥ height/2), which reads short and round next to them.
 */
export const BUTTON_RADIUS = 0.38;
export const buttonRadius = (height: number): number => height * BUTTON_RADIUS;

/** Asset paths (relative, like the GLBs, so they resolve in preview + publish). */
export const UI_ASSETS = {
  headerCritters: 'assets/ui/modal_header_critters.png',
  previewDodgeball: 'assets/ui/modal_preview_dodgeball.gif',
  bgCamp: 'assets/ui/bg_camp.png', // a still of the title view (the tent-site fire, tents, the snowy peak)
  backButton: 'assets/ui/back_btn.svg',
  backButtonBrown: 'assets/ui/back_btn_brown.svg',
  walletPlus: 'assets/ui/wallet_plus.svg',
  walletPlusBrown: 'assets/ui/wallet_plus_brown.svg',
  badgeStarNew: 'assets/ui/badge_star_new.svg',
  badgeStarSale: 'assets/ui/badge_star_sale.svg',
  sliderKnob: 'assets/ui/slider_knob.svg',
} as const;

/**
 * HUD chrome tones for the wallet / back button / HUD buttons. `brown` is the current
 * direction (warm wood, matches the Ready!/BUY buttons); `blue` is the original Figma look.
 */
export type HudTone = 'brown' | 'blue';
export const HUD_TONES: Record<HudTone, { fill: string; rim: string; shadow: string; back: string; plus: string }> = {
  brown: { fill: '#885f44', rim: '#b8876b', shadow: '#432a18', back: UI_ASSETS.backButtonBrown, plus: UI_ASSETS.walletPlusBrown },
  blue:  { fill: '#4eb3f5', rim: '#a6dafc', shadow: '#3e82b0', back: UI_ASSETS.backButton, plus: UI_ASSETS.walletPlus },
};
export const DEFAULT_HUD_TONE: HudTone = 'brown';

/** Character portrait art (512px, transparent) — `assets/ui/chonks/<id>.png`. */
export const chonkArt = (id: string): string => `assets/ui/chonks/${id}.png`;

/** Crisp outline around text (Figma text strokes don't export to CSS; text-shadow rings work everywhere). */
export function textOutline(color: string, width: number): string {
  const out: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    out.push(`${(Math.cos(a) * width).toFixed(2)}px ${(Math.sin(a) * width).toFixed(2)}px 0 ${color}`);
  }
  return out.join(',');
}
