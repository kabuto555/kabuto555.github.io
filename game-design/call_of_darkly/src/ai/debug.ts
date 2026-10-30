// F9 dev overlay: nav nodes/edges, per-enemy aggro (sight) radius, current waypoint line, FSM label.
import * as THREE from 'three';
import type { System } from '../core/types';
import type { AiSystem } from './system';

const MAX = 64;
const CIRCLE_SEGS = 48;

const STATE_COLORS: Record<string, string> = {
  idle: '#9aa',
  patrol: '#9aa',
  alert: '#ff0',
  hitReact: '#fa0',
  chase: '#f80',
  windup: '#f33',
  attack: '#f0f',
  recover: '#88f',
  stagger: '#fff',
  return: '#6cf',
  dead: '#555',
};

export interface AiDebugOverlay extends System {
  visible: boolean;
  /** Rebuild nav lines (after setNav). */
  rebuildNav(): void;
  dispose(): void;
}

export function createAiDebugOverlay(ai: AiSystem, scene: THREE.Object3D, camera: THREE.Camera, uiRoot: HTMLElement): AiDebugOverlay {
  const group = new THREE.Group();
  group.name = 'aiDebug';
  group.visible = false;
  scene.add(group);

  const lineMat = (color: number) => new THREE.LineBasicMaterial({ color, fog: false, transparent: true, opacity: 0.9, depthTest: false });
  const navMat = lineMat(0x40ff80);
  const ringMat = lineMat(0xff5040);
  const wpMat = lineMat(0xffe040);

  let navLines: THREE.LineSegments | null = null;
  const rebuildNav = () => {
    if (navLines) {
      navLines.geometry.dispose();
      group.remove(navLines);
      navLines = null;
    }
    const nav = ai.nav;
    if (!nav) return;
    const pos: number[] = [];
    const y = 0.08;
    for (const [a, b] of nav.edges) {
      const p = nav.nodes[a]!;
      const q = nav.nodes[b]!;
      pos.push(p.x, p.y + y, p.z, q.x, q.y + y, q.z);
    }
    const s = 0.3;
    for (const p of nav.nodes) {
      pos.push(p.x - s, p.y + y, p.z, p.x + s, p.y + y, p.z, p.x, p.y + y, p.z - s, p.x, p.y + y, p.z + s, p.x, p.y, p.z, p.x, p.y + 1, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    navLines = new THREE.LineSegments(geo, navMat);
    navLines.renderOrder = 10;
    group.add(navLines);
  };
  rebuildNav();

  // unit circle shared by every aggro ring
  const circle = new THREE.BufferGeometry();
  const cp = new Float32Array(CIRCLE_SEGS * 3);
  for (let i = 0; i < CIRCLE_SEGS; i++) {
    const a = (i / CIRCLE_SEGS) * Math.PI * 2;
    cp[i * 3] = Math.cos(a);
    cp[i * 3 + 1] = 0.1;
    cp[i * 3 + 2] = Math.sin(a);
  }
  circle.setAttribute('position', new THREE.BufferAttribute(cp, 3));
  const rings: THREE.LineLoop[] = [];
  const ring = (i: number) => {
    let r = rings[i];
    if (!r) {
      r = new THREE.LineLoop(circle, ringMat);
      r.renderOrder = 10;
      rings[i] = r;
      group.add(r);
    }
    return r;
  };

  // waypoint lines: one dynamic buffer
  const wpPos = new Float32Array(MAX * 6);
  const wpGeo = new THREE.BufferGeometry();
  wpGeo.setAttribute('position', new THREE.BufferAttribute(wpPos, 3));
  const wpLines = new THREE.LineSegments(wpGeo, wpMat);
  wpLines.frustumCulled = false;
  wpLines.renderOrder = 10;
  group.add(wpLines);

  // DOM labels
  const labelRoot = document.createElement('div');
  labelRoot.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;display:none';
  uiRoot.appendChild(labelRoot);
  const labels: HTMLDivElement[] = [];
  const label = (i: number) => {
    let l = labels[i];
    if (!l) {
      l = document.createElement('div');
      l.style.cssText = 'position:absolute;font:11px/1.2 monospace;text-shadow:1px 1px 0 #000;white-space:pre;transform:translate(-50%,-100%)';
      labelRoot.appendChild(l);
      labels[i] = l;
    }
    return l;
  };
  const v = new THREE.Vector3();

  const o: AiDebugOverlay = {
    name: 'aiDebug',
    visible: false,
    rebuildNav,
    update() {},
    render() {
      group.visible = o.visible;
      labelRoot.style.display = o.visible ? 'block' : 'none';
      if (!o.visible) return;
      const list = ai.enemies;
      const n = Math.min(list.length, MAX);
      const mul = ai.shared.stats.get('aggroRadius');
      const w = labelRoot.clientWidth;
      const h = labelRoot.clientHeight;
      for (let i = 0; i < n; i++) {
        const e = list[i]!;
        const p = e.transform.position;
        const r = ring(i);
        r.visible = e.alive;
        r.position.set(p.x, p.y, p.z);
        const rad = e.def.aggroRadius * mul * (e.aware ? e.tuning.awareSightMul : 1);
        r.scale.set(rad, 1, rad);
        const wp = e.waypoint;
        const k = i * 6;
        wpPos[k] = p.x;
        wpPos[k + 1] = p.y + 0.2;
        wpPos[k + 2] = p.z;
        wpPos[k + 3] = wp ? wp.x : p.x;
        wpPos[k + 4] = wp ? wp.y + 0.2 : p.y + 0.2;
        wpPos[k + 5] = wp ? wp.z : p.z;
        const l = label(i);
        v.set(p.x, p.y + 2.05, p.z).project(camera);
        if (v.z > 1 || v.z < -1) {
          l.style.display = 'none';
          continue;
        }
        l.style.display = 'block';
        l.style.left = `${((v.x + 1) / 2) * w}px`;
        l.style.top = `${((1 - v.y) / 2) * h}px`;
        l.style.color = STATE_COLORS[e.state] ?? '#fff';
        const txt = `${e.state} ${Math.ceil(e.health.hp)}hp p${e.poise.current.toFixed(0)}${e.losClear ? ' los' : ''}`;
        if (l.textContent !== txt) l.textContent = txt;
      }
      for (let i = n; i < rings.length; i++) rings[i]!.visible = false;
      for (let i = n; i < labels.length; i++) labels[i]!.style.display = 'none';
      wpGeo.setDrawRange(0, n * 2);
      (wpGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      labelRoot.remove();
      navLines?.geometry.dispose();
      circle.dispose();
      wpGeo.dispose();
      navMat.dispose();
      ringMat.dispose();
      wpMat.dispose();
    },
  };
  return o;
}
