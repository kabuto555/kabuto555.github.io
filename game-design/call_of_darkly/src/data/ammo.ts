// §4 Ammo types and caps (COD-style reserve caps).
import type { AmmoDef, AmmoType } from './types';

export const AMMO: Record<AmmoType, AmmoDef> = {
  pistol: { type: 'pistol', name: 'Pistol', cap: 90 },
  rifle: { type: 'rifle', name: 'Rifle', cap: 240 },
  smg: { type: 'smg', name: 'SMG', cap: 300 },
  shotgun: { type: 'shotgun', name: 'Shotgun', cap: 40 },
  sniper: { type: 'sniper', name: 'Sniper', cap: 30 },
  launcher: { type: 'launcher', name: 'Launcher', cap: 4 },
};
