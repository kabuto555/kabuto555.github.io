import type { LevelDsl, LevelOp } from './types';

/**
 * Recording implementation of the level DSL: every call appends a LevelOp.
 * The level builder (Phase 1+) turns ops into merged geometry, colliders and entities,
 * and filters looted/opened ids against the save.
 */
export function createLevelDsl(ops: LevelOp[] = []): LevelDsl & { readonly ops: LevelOp[] } {
  return {
    ops,
    box(x, y, z, w, h, d, mat) {
      ops.push({ op: 'box', x, y, z, w, h, d, mat });
    },
    stairs(x, y, z, w, h, d, dir, mat, steps = Math.max(1, Math.round(h / 0.2))) {
      ops.push({ op: 'stairs', x, y, z, w, h, d, dir, steps, mat });
    },
    ramp(x, y, z, w, h, d, dir, mat) {
      ops.push({ op: 'ramp', x, y, z, w, h, d, dir, mat });
    },
    barrier(x, y, z, w, h, d, kind = 'invisible', opts = {}) {
      ops.push({ op: 'barrier', x, y, z, w, h, d, kind, ...opts });
    },
    spawn(enemy, pos, opts = {}) {
      ops.push({ op: 'spawn', enemy, pos, yaw: opts.yaw ?? 0, id: opts.id, ...(opts.trigger ? { trigger: opts.trigger } : {}), ...(opts.path ? { path: opts.path } : {}) });
    },
    cache(pos, contents) {
      ops.push({ op: 'cache', pos, contents });
    },
    item(id, pos, pose, loot) {
      ops.push({ op: 'item', id, pos, pose, loot });
    },
    chest(id, pos, contents, yaw = 0) {
      ops.push({ op: 'chest', id, pos, yaw, contents });
    },
    mimic(id, pos, yaw = 0) {
      ops.push({ op: 'mimic', id, pos, yaw });
    },
    door(id, pos, keyId = null, opts = {}) {
      ops.push({ op: 'door', id, pos, keyId, yaw: opts.yaw ?? 0, w: opts.w ?? 1.2, h: opts.h ?? 2.2 });
    },
    bonfire(id, pos) {
      ops.push({ op: 'bonfire', id, pos });
    },
  };
}
