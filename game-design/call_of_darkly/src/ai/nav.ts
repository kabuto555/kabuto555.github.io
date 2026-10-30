// §10 navigation: per-area authored waypoint graph + A* with cached paths. Pure (no three).
import type { Vec3Like } from '../core/types';
import type { NavGraph } from './types';

const EMPTY: Vec3Like[] = [];

/**
 * Waypoint graph. Edges are bidirectional, cost = euclidean length. `path()` results are cached
 * per (fromNode, toNode) pair and shared — callers must not mutate them. Search scratch is
 * preallocated typed arrays, so a cache miss allocates only the result array.
 */
export class WaypointGraph implements NavGraph {
  readonly nodes: Vec3Like[];
  readonly edges: [a: number, b: number][];
  /** Optional names (authoring/debug), parallel to `nodes`. */
  readonly names: string[];
  /**
   * Optional clear-line test used by `nearest()` so the start/goal node is one the agent can walk
   * to (not the closest node behind a wall). Set by the AI system from the collision world.
   */
  los: ((a: Vec3Like, b: Vec3Like) => boolean) | null = null;
  /** Stats (debug/tests). */
  searches = 0;
  cacheHits = 0;

  private readonly adjStart: Int32Array;
  private readonly adj: Int32Array;
  private readonly adjCost: Float32Array;
  private readonly g: Float32Array;
  private readonly f: Float32Array;
  private readonly came: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private readonly heap: Int32Array;
  private stamp = 0;
  private readonly cache = new Map<number, Vec3Like[]>();
  private readonly idxCache = new Map<number, readonly number[]>();

  constructor(nodes: Vec3Like[], edges: [number, number][], names: string[] = []) {
    const n = nodes.length;
    for (const [a, b] of edges) {
      if (a < 0 || a >= n || b < 0 || b >= n || a === b) throw new Error(`[nav] bad edge ${a}-${b} (${n} nodes)`);
    }
    this.nodes = nodes;
    this.edges = edges;
    this.names = names;
    const deg = new Int32Array(n);
    for (const [a, b] of edges) {
      deg[a]!++;
      deg[b]!++;
    }
    this.adjStart = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) this.adjStart[i + 1] = this.adjStart[i]! + deg[i]!;
    this.adj = new Int32Array(this.adjStart[n]!);
    this.adjCost = new Float32Array(this.adjStart[n]!);
    const fill = new Int32Array(n);
    const put = (a: number, b: number) => {
      const k = this.adjStart[a]! + fill[a]!++;
      this.adj[k] = b;
      this.adjCost[k] = dist(nodes[a]!, nodes[b]!);
    };
    for (const [a, b] of edges) {
      put(a, b);
      put(b, a);
    }
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.came = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.heap = new Int32Array(Math.max(1, this.adj.length + n));
  }

  /** Index of the nearest node (preferring ones with a clear line when `los` is set); -1 if empty. */
  nearest(p: Vec3Like): number {
    const nodes = this.nodes;
    let best = -1;
    let bestD = Infinity;
    let any = -1;
    let anyD = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const d = distSq(p, nodes[i]!);
      if (d < anyD) {
        anyD = d;
        any = i;
      }
    }
    if (!this.los) return any;
    // second pass: nearest visible node (ray only for candidates that would improve)
    for (let i = 0; i < nodes.length; i++) {
      const d = distSq(p, nodes[i]!);
      if (d < bestD && this.los(p, nodes[i]!)) {
        bestD = d;
        best = i;
      }
    }
    return best >= 0 ? best : any;
  }

  /** A* over node indices; cached. Returns [] if unreachable, [a] if a === b. Do not mutate. */
  findPath(a: number, b: number): readonly number[] {
    const n = this.nodes.length;
    if (a < 0 || b < 0 || a >= n || b >= n) return [];
    const key = a * n + b;
    const hit = this.idxCache.get(key);
    if (hit) {
      this.cacheHits++;
      return hit;
    }
    this.searches++;
    const res = this.astar(a, b);
    this.idxCache.set(key, res);
    return res;
  }

  /** Waypoint positions from nearest(from) to nearest(to). Cached; do not mutate. */
  path(from: Vec3Like, to: Vec3Like): Vec3Like[] {
    const a = this.nearest(from);
    const b = this.nearest(to);
    if (a < 0 || b < 0) return EMPTY;
    const n = this.nodes.length;
    const key = a * n + b;
    const hit = this.cache.get(key);
    if (hit) {
      this.cacheHits++;
      return hit;
    }
    const idx = this.findPath(a, b);
    const out = idx.map((i) => this.nodes[i]!);
    this.cache.set(key, out);
    return out;
  }

  clearCache(): void {
    this.cache.clear();
    this.idxCache.clear();
  }

  private astar(start: number, goal: number): number[] {
    const s = ++this.stamp;
    const { g, f, came, seen, closed, heap, nodes, adjStart, adj, adjCost } = this;
    const goalP = nodes[goal]!;
    let hs = 0;
    const push = (i: number) => {
      // binary min-heap on f
      let k = hs++;
      heap[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (f[heap[p]!]! <= f[heap[k]!]!) break;
        const t = heap[p]!;
        heap[p] = heap[k]!;
        heap[k] = t;
        k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0]!;
      heap[0] = heap[--hs]!;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < hs && f[heap[l]!]! < f[heap[m]!]!) m = l;
        if (r < hs && f[heap[r]!]! < f[heap[m]!]!) m = r;
        if (m === k) break;
        const t = heap[m]!;
        heap[m] = heap[k]!;
        heap[k] = t;
        k = m;
      }
      return top;
    };
    g[start] = 0;
    f[start] = dist(nodes[start]!, goalP);
    came[start] = -1;
    seen[start] = s;
    push(start);
    while (hs > 0) {
      const cur = pop();
      if (closed[cur] === s) continue; // stale heap entry
      closed[cur] = s;
      if (cur === goal) {
        const out: number[] = [];
        for (let i = goal; i !== -1; i = came[i]!) out.push(i);
        return out.reverse();
      }
      for (let k = adjStart[cur]!; k < adjStart[cur + 1]!; k++) {
        const nb = adj[k]!;
        if (closed[nb] === s) continue;
        const ng = g[cur]! + adjCost[k]!;
        if (seen[nb] === s && ng >= g[nb]!) continue;
        seen[nb] = s;
        g[nb] = ng;
        f[nb] = ng + dist(nodes[nb]!, goalP);
        came[nb] = cur;
        if (hs < heap.length) push(nb);
      }
    }
    return [];
  }
}

function distSq(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}
function dist(a: Vec3Like, b: Vec3Like): number {
  return Math.sqrt(distSq(a, b));
}

/** Node position in authoring form: [x, z] (y = 0) or [x, y, z]. */
export type NavNodeDef = readonly [x: number, z: number] | readonly [x: number, y: number, z: number];

/**
 * Level-file helper: named nodes + link chains. `links: ['a-b-c', 'b-d']` connects a–b, b–c, b–d.
 *
 *   export const AREA_NAV = navGraph({ nodes: { home: [25, 24], gapS: [21, 17.5] }, links: ['home-gapS'] });
 */
export function navGraph(def: { nodes: Record<string, NavNodeDef>; links: readonly string[] }): WaypointGraph {
  const names = Object.keys(def.nodes);
  const index = new Map(names.map((n, i) => [n, i] as const));
  const nodes = names.map((n) => {
    const v = def.nodes[n]!;
    return v.length === 2 ? { x: v[0], y: 0, z: v[1] } : { x: v[0], y: v[1], z: v[2] };
  });
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (const chain of def.links) {
    const parts = chain.split('-').map((s) => s.trim());
    for (let i = 0; i + 1 < parts.length; i++) {
      const a = index.get(parts[i]!);
      const b = index.get(parts[i + 1]!);
      if (a === undefined || b === undefined) throw new Error(`[nav] unknown node in link "${chain}"`);
      const k = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push([a, b]);
    }
  }
  return new WaypointGraph(nodes, edges, names);
}
