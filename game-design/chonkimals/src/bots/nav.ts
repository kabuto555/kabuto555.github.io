/**
 * Tiny undirected waypoint graph with A* — enough for a few dozen nodes.
 * Works on plain XZ tuples so it's coordinate-space agnostic.
 */
import type { XZ } from './camp-map';

export class NavGraph {
  readonly ids: string[];
  private readonly adj = new Map<string, string[]>();

  constructor(readonly nodes: Record<string, XZ>, edges: readonly (readonly [string, string])[]) {
    this.ids = Object.keys(nodes);
    for (const id of this.ids) this.adj.set(id, []);
    for (const [a, b] of edges) {
      if (!nodes[a] || !nodes[b]) throw new Error(`NavGraph: edge ${a}–${b} references a missing node`);
      this.adj.get(a)!.push(b);
      this.adj.get(b)!.push(a);
    }
  }

  edges(): [XZ, XZ][] {
    const out: [XZ, XZ][] = [];
    for (const [a, list] of this.adj) for (const b of list) if (a < b) out.push([this.nodes[a], this.nodes[b]]);
    return out;
  }

  nearest(p: XZ): string {
    let best = this.ids[0], bestD = Infinity;
    for (const id of this.ids) {
      const d = dist(p, this.nodes[id]);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  /** Node ids from `from` to `to` inclusive; [from] if unreachable. */
  path(from: string, to: string): string[] {
    if (from === to) return [from];
    const g = new Map<string, number>([[from, 0]]);
    const prev = new Map<string, string>();
    const open = new Set([from]);
    const h = (id: string) => dist(this.nodes[id], this.nodes[to]);
    while (open.size > 0) {
      let cur = '', curF = Infinity;
      for (const id of open) {
        const f = g.get(id)! + h(id);
        if (f < curF) { curF = f; cur = id; }
      }
      if (cur === to) break;
      open.delete(cur);
      for (const nb of this.adj.get(cur)!) {
        const cost = g.get(cur)! + dist(this.nodes[cur], this.nodes[nb]);
        if (cost < (g.get(nb) ?? Infinity)) {
          g.set(nb, cost);
          prev.set(nb, cur);
          open.add(nb);
        }
      }
    }
    if (!prev.has(to)) return [from];
    const out = [to];
    while (out[0] !== from) out.unshift(prev.get(out[0])!);
    return out;
  }

  /**
   * Full XZ route from p to q through the graph, trimming the first/last node
   * when heading to it would mean doubling back.
   */
  route(p: XZ, q: XZ): XZ[] {
    const ids = this.path(this.nearest(p), this.nearest(q));
    const pts = ids.map((id) => this.nodes[id]);
    if (pts.length >= 2 && dist(p, pts[1]) < dist(pts[0], pts[1])) pts.shift();
    if (pts.length >= 2 && dist(q, pts[pts.length - 2]) < dist(pts[pts.length - 1], pts[pts.length - 2])) pts.pop();
    pts.push(q);
    return pts;
  }
}

export function dist(a: XZ, b: XZ): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
