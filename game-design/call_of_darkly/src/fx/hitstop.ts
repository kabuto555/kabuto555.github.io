import type { GameLoop } from '../core/loop';

/** Hitstop durations in seconds (§M9). Never used for plain gunfire body hits. */
export const HITSTOP = { melee: 0.05, meleeKill: 0.07, headshotKill: 0.06, guardBreak: 0.08, plunge: 0.12 } as const;

/** Thin wrapper so fx code reads `hitstop.trigger(HITSTOP.melee)`; honours the global fx toggle. */
export class Hitstop {
  enabled = true;
  constructor(private readonly loop: Pick<GameLoop, 'hitstop'>) {}
  trigger(seconds: number): void {
    if (this.enabled) this.loop.hitstop(seconds);
  }
}
