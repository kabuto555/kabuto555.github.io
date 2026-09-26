/**
 * WorldTrack — chains stage rails end-to-end in world space with a smooth
 * lerp/slerp tween across the gap between stages. No bridge segment exists;
 * instead the gap is a fixed number of world units over which position and
 * orientation interpolate from the exit of stage N to the entry of stage N+1.
 */

import type { Rail } from './rail';
import type { Stage } from './stage';

type V3 = InstanceType<typeof THREE.Vector3>;
type Q  = InstanceType<typeof THREE.Quaternion>;

/** Gap in world units between the end of one stage and the start of the next. */
export const STAGE_GAP = 4;

export interface TrackSegment {
  /** The rail curve for this segment */
  rail: Rail;
  /** Stage data */
  stage: Stage;
  /** World-space position of this segment's local origin (curve start) */
  worldOrigin: V3;
  /** Quaternion that rotates local rail space into world space */
  worldRotation: Q;
  /** Cumulative world distance at the START of this segment's rail */
  startDist: number;
  /** Cumulative world distance at the END of this segment's rail */
  endDist: number;
  /**
   * Cumulative world distance at the START of the gap AFTER this segment.
   * gapEndDist = endDist + STAGE_GAP (= next segment's startDist).
   */
  gapEndDist: number;
}

export interface WorldTrack {
  segments: TrackSegment[];
  /** Total world distance covered (last segment's gapEndDist) */
  totalDist: number;
}

// ── Segment placement ──────────────────────────────────────────────────────────

/**
 * Place a new stage segment after `prev` (or at world origin when prev is null).
 * The segment's worldOrigin is set so its local t=0 sits exactly STAGE_GAP
 * world units past the end of the previous segment.
 */
export function buildSegment(
  stage: Stage,
  prev: TrackSegment | null,
): TrackSegment {
  let worldOrigin: V3;
  let worldRotation: Q;
  let startDist: number;

  if (!prev) {
    worldOrigin   = new THREE.Vector3(0, 0, 0);
    worldRotation = new THREE.Quaternion(); // identity
    startDist     = 0;
  } else {
    // World-space end point of prev stage
    const localEnd = prev.rail.curve.getPointAt(1);
    const prevEndWorld = localEnd.clone().applyQuaternion(prev.worldRotation).add(prev.worldOrigin);

    // World-space exit tangent of prev stage
    const localTangent = prev.rail.curve.getTangentAt(0.999).normalize();
    const worldTangent = localTangent.clone().applyQuaternion(prev.worldRotation);

    // Place new segment's origin STAGE_GAP units along that exit tangent
    worldOrigin = prevEndWorld.clone().addScaledVector(worldTangent, STAGE_GAP);

    // Orient new segment: its local -Z should align with the entry tangent.
    // Use the ENTRY tangent of the new stage's rail (t=0.001 in local space)
    // rotated into world space via the exit tangent direction.
    // We keep it simple: inherit prev's world rotation as the base so there's
    // no large discontinuity, then clamp any delta.
    const defaultForward = new THREE.Vector3(0, 0, -1);
    const fullDelta = new THREE.Quaternion().setFromUnitVectors(defaultForward, worldTangent);
    const MAX_JOINT_ANGLE = Math.PI / 5; // 36° max
    const angle = 2 * Math.acos(Math.min(1, Math.abs(fullDelta.w)));
    if (angle > MAX_JOINT_ANGLE) {
      fullDelta.slerp(new THREE.Quaternion(), 1 - MAX_JOINT_ANGLE / angle);
    }
    worldRotation = prev.worldRotation.clone().multiply(fullDelta);

    startDist = prev.gapEndDist; // gap of prev ends where this stage begins
  }

  const endDist    = startDist + stage.rail.length;
  const gapEndDist = endDist + STAGE_GAP;

  return {
    rail: stage.rail,
    stage,
    worldOrigin,
    worldRotation,
    startDist,
    endDist,
    gapEndDist,
  };
}

// ── World-space sampling ───────────────────────────────────────────────────────

/**
 * Given a worldDist, find which segment the player is in (or in the gap after it).
 * Returns the segment, the localT within it (clamped 0-1), and a gapT (0-1)
 * if the player is in the gap after this segment (null if inside the rail itself).
 */
function resolveWorldDist(
  track: WorldTrack,
  worldDist: number,
): { seg: TrackSegment; localT: number; gapT: number | null; nextSeg: TrackSegment | null } {
  const clamped = Math.max(0, Math.min(track.totalDist, worldDist));
  for (let i = 0; i < track.segments.length; i++) {
    const seg = track.segments[i];
    if (clamped <= seg.endDist) {
      // Inside this segment's rail
      const span = seg.endDist - seg.startDist;
      const localT = span > 0 ? Math.max(0, Math.min(1, (clamped - seg.startDist) / span)) : 0;
      return { seg, localT, gapT: null, nextSeg: null };
    }
    if (clamped <= seg.gapEndDist) {
      // Inside the gap after this segment
      const gapT = (clamped - seg.endDist) / STAGE_GAP; // 0=exit of this, 1=entry of next
      const nextSeg = track.segments[i + 1] ?? null;
      return { seg, localT: 1, gapT, nextSeg };
    }
  }
  // Fallback: end of last segment
  const last = track.segments[track.segments.length - 1];
  return { seg: last, localT: 1, gapT: null, nextSeg: null };
}

/** World-space position at a local t within a segment */
function segWorldPos(seg: TrackSegment, localT: number): V3 {
  const t = Math.max(0, Math.min(1, localT));
  return seg.rail.curve.getPointAt(t)
    .applyQuaternion(seg.worldRotation)
    .add(seg.worldOrigin);
}

/** World-space forward tangent at a local t within a segment */
function segWorldFwd(seg: TrackSegment, localT: number): V3 {
  const t = Math.max(0.001, Math.min(0.999, localT));
  return seg.rail.curve.getTangentAt(t)
    .normalize()
    .applyQuaternion(seg.worldRotation);
}

/**
 * Get the world-space player position. In the gap between two stages,
 * lerps position smoothly between the exit of stage N and entry of stage N+1.
 */
export function getWorldPosition(track: WorldTrack, worldDist: number): V3 {
  const { seg, localT, gapT, nextSeg } = resolveWorldDist(track, worldDist);
  if (gapT === null || nextSeg === null) {
    return segWorldPos(seg, localT);
  }
  // Smooth step for a more eased tween
  const t = gapT * gapT * (3 - 2 * gapT);
  const posA = segWorldPos(seg, 1);
  const posB = segWorldPos(nextSeg, 0);
  return posA.lerp(posB, t);
}

/**
 * Get the world-space basis at worldDist. In the gap, slerps the forward
 * quaternion between exit tangent of seg N and entry tangent of seg N+1.
 */
export function getWorldBasis(
  track: WorldTrack,
  worldDist: number,
): { forward: V3; right: V3; up: V3 } {
  const { seg, localT, gapT, nextSeg } = resolveWorldDist(track, worldDist);

  let forward: V3;
  if (gapT === null || nextSeg === null) {
    forward = segWorldFwd(seg, localT);
  } else {
    const t = gapT * gapT * (3 - 2 * gapT);
    const fwdA = segWorldFwd(seg, 1);
    const fwdB = segWorldFwd(nextSeg, 0);
    // Slerp via quaternions so we get the shortest-path rotation
    const qA = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwdA);
    const qB = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwdB);
    const q  = qA.slerp(qB, t);
    forward  = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
  }

  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up    = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { forward, right, up };
}

/**
 * Get world-space position of a stage entity at its spawnT + lateral offsets.
 */
export function getEntityWorldPosition(
  segment: TrackSegment,
  spawnT: number,
  offsetX: number,
  offsetY: number,
): V3 {
  const t        = Math.max(0, Math.min(1, spawnT));
  const localPt  = segment.rail.curve.getPointAt(t);
  const localFwd = segment.rail.curve.getTangentAt(Math.max(0.001, Math.min(0.999, t))).normalize();
  const localRight = new THREE.Vector3().crossVectors(localFwd, new THREE.Vector3(0, 1, 0)).normalize();
  const localUp    = new THREE.Vector3().crossVectors(localRight, localFwd).normalize();
  localPt.addScaledVector(localRight, offsetX);
  localPt.addScaledVector(localUp,    offsetY);
  return localPt.applyQuaternion(segment.worldRotation).add(segment.worldOrigin);
}

/** Build the initial track: stage 0 + stage 1 */
export function createInitialTrack(stage0: Stage, stage1: Stage): WorldTrack {
  const seg0 = buildSegment(stage0, null);
  const seg1 = buildSegment(stage1, seg0);
  return { segments: [seg0, seg1], totalDist: seg1.gapEndDist };
}

/** Append a new stage after the last segment */
export function appendStage(track: WorldTrack, newStage: Stage): TrackSegment {
  const last = track.segments[track.segments.length - 1];
  const seg  = buildSegment(newStage, last);
  track.segments.push(seg);
  track.totalDist = seg.gapEndDist;
  return seg;
}

/** Remove stage segments whose gap has been fully passed by the player */
export function pruneOldSegments(track: WorldTrack, worldDist: number): TrackSegment[] {
  const KEEP_BEHIND = 5;
  const removed: TrackSegment[] = [];
  while (track.segments.length > 1) {
    const oldest = track.segments[0];
    if (oldest.gapEndDist < worldDist - KEEP_BEHIND) {
      track.segments.shift();
      removed.push(oldest);
    } else {
      break;
    }
  }
  return removed;
}

/** Returns true when the player is in the gap between two stages */
export function isInGap(track: WorldTrack, worldDist: number): boolean {
  for (const seg of track.segments) {
    if (worldDist > seg.endDist && worldDist <= seg.gapEndDist) return true;
  }
  return false;
}

/** Which segment is the player currently inside (rail portion only, not gap) */
export function resolveCurrentSegment(track: WorldTrack, worldDist: number): TrackSegment {
  for (const seg of track.segments) {
    if (worldDist <= seg.endDist) return seg;
  }
  return track.segments[track.segments.length - 1];
}
