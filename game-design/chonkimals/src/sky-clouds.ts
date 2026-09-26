/**
 * Sky clouds — big fluffy storybook cumulus (Animal Crossing / Mario Wonder read):
 * bright sunlit tops, soft cool-grey bellies, a few shapes. They fill a ring all
 * the way round the camp (not one patch of sky) and drift slowly on the wind. A few
 * thin low wisps sit around the hero mountain's base, and sky clouds fade out while
 * they cross in front of it, so the peak always stays in view.
 *
 * Procedural (canvas puffs, no texture asset) and cheap: a pool of camera-facing
 * Sprites, no per-frame allocation. The ring rides along with the camera (like the
 * hero mountain) so the sky stays full wherever you are. Fog off: the clouds are
 * pre-tinted toward the sky instead, so far ones don't turn into flat blue smudges.
 */

type Scene = InstanceType<typeof THREE.Scene>;
type Texture = InstanceType<typeof THREE.Texture>;
type Sprite = InstanceType<typeof THREE.Sprite>;
type Vector3 = InstanceType<typeof THREE.Vector3>;
type Object3D = InstanceType<typeof THREE.Object3D>;

export const CLOUD_TUNING = {
  /** Ring of sky clouds around the camp. */
  count: 26,
  radius: [230, 470] as [number, number],
  height: [95, 190] as [number, number],
  size: [55, 120] as [number, number],
  /** Low wisps around the hero mountain's base (world units from the camp centre, toward north) —
   * kept low + thin so they frame the peak rather than hide it. */
  bandCount: 4,
  bandDistance: 340,
  bandHeight: [18, 38] as [number, number],
  bandOpacity: 0.6,
  /** Sky clouds fade out while they drift in front of the mountain (radians either side of north). */
  clearArc: [0.35, 0.75] as [number, number],
  /** Wind (world units / s) and how much the ring follows the camera. */
  wind: 2.2,
  follow: 0.9,
};

/** A lumpy cumulus: overlapping lobes on a flat-ish base, lit from above. */
function makeCloudTexture(seed: number): Texture {
  const w = 512, h = 256;
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const base = h * 0.8;
  // Lobes along the baseline, tallest near the middle (px).
  const lobes: Array<[number, number, number]> = [];
  const n = 6 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const tall = Math.sin(Math.PI * t);
    const rad = h * (0.16 + tall * 0.2 + r() * 0.06);
    lobes.push([w * (0.12 + t * 0.76 + (r() - 0.5) * 0.04), base - rad * (0.55 + tall * 0.35), rad]);
  }
  // Silhouette: soft-edged white discs.
  for (const [x, y, rad] of lobes) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.97)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  // Flatten the underside.
  ctx.globalCompositeOperation = 'destination-out';
  const cut = ctx.createLinearGradient(0, base - 6, 0, base + 18);
  cut.addColorStop(0, 'rgba(0,0,0,0)');
  cut.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = cut;
  ctx.fillRect(0, base - 6, w, h - base + 6);
  // Shading inside the silhouette: cool grey belly, sunlit top, rim highlights.
  ctx.globalCompositeOperation = 'source-atop';
  const shade = ctx.createLinearGradient(0, h * 0.1, 0, base);
  shade.addColorStop(0, 'rgba(255,252,244,0)');
  shade.addColorStop(0.55, 'rgba(210,222,242,0.3)');
  shade.addColorStop(1, 'rgba(160,182,222,0.75)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  for (const [x, y, rad] of lobes) {
    const hx = x - rad * 0.3, hy = y - rad * 0.35;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, rad * 0.8);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Cloud { s: Sprite; a: number; rad: number; y: number; speed: number; band: boolean; off: number; opacity: number }

export class CloudLayer {
  private readonly clouds: Cloud[] = [];
  private readonly centre = new THREE.Vector3();
  private readonly north = new THREE.Vector3(0, 0, 1);
  private readonly origin = new THREE.Vector3();

  constructor(scene: Scene) {
    const T = CLOUD_TUNING;
    const texes = [makeCloudTexture(1), makeCloudTexture(2), makeCloudTexture(3)];
    const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    const make = (band: boolean, i: number): Cloud => {
      const far = band ? 0.25 : Math.random();
      const mat = new THREE.SpriteMaterial({
        map: texes[i % texes.length], transparent: true, depthWrite: false, fog: false,
        opacity: band ? T.bandOpacity : 0.96 - far * 0.18,
        // Further clouds lean toward the sky blue (their own aerial perspective).
        color: new THREE.Color(1, 1, 1).lerp(new THREE.Color(0.8, 0.9, 1.0), far * 0.5),
      });
      const s = new THREE.Sprite(mat);
      const size = band ? rnd(32, 55) : rnd(T.size[0], T.size[1]) * (1 + far * 0.4);
      s.scale.set(size * rnd(2.0, 2.5), size, 1);
      s.renderOrder = -1;
      scene.add(s);
      return {
        s, band, a: Math.random() * Math.PI * 2,
        rad: band ? T.bandDistance + rnd(-30, 40) : T.radius[0] + far * (T.radius[1] - T.radius[0]),
        y: band ? rnd(T.bandHeight[0], T.bandHeight[1]) : rnd(T.height[0], T.height[1]),
        opacity: mat.opacity, speed: T.wind * rnd(0.6, 1.4), off: band ? ((i + Math.random() * 0.6) / T.bandCount - 0.5) * 340 : 0,
      };
    };
    for (let i = 0; i < T.count; i++) this.clouds.push(make(false, i));
    for (let i = 0; i < T.bandCount; i++) this.clouds.push(make(true, i));
    this.place(0);
  }

  /** Show this share of the sky ring (low graphics thins it out; the mountain wisps always stay). */
  setDensity(share: number): void {
    let i = 0;
    for (const c of this.clouds) if (!c.band) c.s.visible = (i++ % 10) < share * 10;
  }

  /** Centre the ring on the camp, with the mountain band toward `north` (world). */
  setCamp(centre: Vector3, north: Vector3): void {
    this.centre.copy(centre).setY(0);
    this.origin.copy(this.centre);
    this.north.copy(north).setY(0).normalize();
    this.place(0);
  }

  update(dt: number, camera?: Object3D): void {
    if (camera) {
      const f = CLOUD_TUNING.follow;
      this.origin.set(this.centre.x + (camera.position.x - this.centre.x) * f, 0,
        this.centre.z + (camera.position.z - this.centre.z) * f);
    }
    this.place(dt);
  }

  private place(dt: number): void {
    const o = this.origin;
    const nx = this.north.x, nz = this.north.z;   // band axis (toward the mountain)
    const ex = nz, ez = -nx;                      // across it
    const north = Math.atan2(nx, nz);
    const [clear0, clear1] = CLOUD_TUNING.clearArc;
    for (const c of this.clouds) {
      if (c.band) {
        // Slide sideways across the mountain's waist, wrapping.
        c.off += c.speed * dt * 0.6;
        if (c.off > 170) c.off = -170;
        c.s.position.set(o.x + nx * c.rad + ex * c.off, c.y, o.z + nz * c.rad + ez * c.off);
      } else {
        c.a += (c.speed / c.rad) * dt;
        c.s.position.set(o.x + Math.sin(c.a) * c.rad, c.y, o.z + Math.cos(c.a) * c.rad);
        // Fade while crossing in front of the mountain.
        const off = Math.abs(Math.atan2(Math.sin(c.a - north), Math.cos(c.a - north)));
        c.s.material.opacity = c.opacity * THREE.MathUtils.smoothstep(off, clear0, clear1);
      }
    }
  }
}
