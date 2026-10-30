import type { DamageEvent, EntityId } from '../core/entity';
import { events as globalEvents, type EventBus } from '../core/events';
import './events';
import type { Damageable, DamageResult } from './types';

/**
 * Resolve a player attack on a non-player target: target.applyDamage → `damage` event (pre-absorb
 * notification for audio/UI) → `hit` event (hitmarker). Player-targeted damage goes through
 * `CombatSystem.hitPlayer` instead. Pass `emitHit=false` to suppress the hitmarker event (caller emits one aggregate) (shield/i-frames, then the `damage` event the controller applies).
 */
export function dealDamage(target: Damageable, ev: DamageEvent, bus: EventBus = globalEvents, emitHit = true): DamageResult {
  const r = target.applyDamage(ev);
  bus.emit('damage', ev);
  if (!emitHit) return r; // caller aggregates one `hit` per target per attack
  bus.emit('hit', {
    targetId: target.id as EntityId,
    pos: ev.hitPos,
    headshot: !!ev.headshot,
    dealt: r.dealt,
    blocked: r.blocked,
    killed: r.killed,
    weaponId: ev.weaponId ?? '',
  });
  return r;
}
