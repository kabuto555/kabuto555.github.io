// trippyBackground.ts
// Full-screen trippy background: hue-cycling gradient + audio-reactive
// pulsing rings rendered behind all scene content.
//
// Uses a THREE.Mesh with ShaderMaterial on an oversized plane so it fills the
// entire view regardless of camera settings. Rendered at Z far-back so it is
// always behind scene content.

import { GAME_WIDTH, GAME_HEIGHT } from './config';

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.999, 1.0); // clip-space, always behind
}
`;

const FRAG = /* glsl */`
precision mediump float;
varying vec2 vUv;

uniform float uTime;
uniform float uEnergy;   // smoothed amplitude  0-1
uniform float uBeat;     // transient beat       0-1
uniform float uAspect;   // width / height

// HSL → RGB helper
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = mod(h * 6.0, 6.0);
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 m = vec3(l - c * 0.5);
  if (hp < 1.0) return m + vec3(c, x, 0.0);
  if (hp < 2.0) return m + vec3(x, c, 0.0);
  if (hp < 3.0) return m + vec3(0.0, c, x);
  if (hp < 4.0) return m + vec3(0.0, x, c);
  if (hp < 5.0) return m + vec3(x, 0.0, c);
  return m + vec3(c, 0.0, x);
}

void main() {
  vec2 uv = vUv;
  // aspect-correct UV centred at 0,0
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  // --- continuous rotation ---
  // Rotate the whole coordinate space slowly around the centre.
  // Speed: one full turn every ~50 s, gentle and hypnotic.
  float rotAngle = uTime * 0.126;  // ~7.2 deg/s
  float cosR = cos(rotAngle);
  float sinR = sin(rotAngle);
  p = vec2(cosR * p.x - sinR * p.y,
           sinR * p.x + cosR * p.y);

  float dist = length(p);

  // --- hue cycling ---
  // base hue drifts slowly, offset by angle so it swirls
  float angle = atan(p.y, p.x);
  float hueBase = mod(uTime * 0.08, 1.0);
  float hue = mod(hueBase + dist * 0.35 + angle / (2.0 * 3.14159) * 0.25, 1.0);

  // saturation & lightness: richer toward edges, brighter base
  float sat = 0.88 + uEnergy * 0.12;
  // Raised floor: centre starts at 0.28 (was 0.12), edge reaches ~0.52
  float lit = 0.28 + dist * 0.24 + uEnergy * 0.10;
  lit = clamp(lit, 0.22, 0.62);

  vec3 col = hsl2rgb(hue, sat, lit);

  // --- radial pulse rings driven by beat ---
  // 4 rings travel outward at a steady pace; beat gently swells their width.
  // Rings are evenly spaced (phase step = 0.25) and travel out to radius 1.1
  // so they clear the screen before looping — no clustering.
  float beatPulse = uBeat;
  float ringCount = 4.0;
  for (float i = 0.0; i < 4.0; i++) {
    float phase   = i / ringCount;             // 0, 0.25, 0.5, 0.75
    // constant travel speed — beat does NOT modulate speed
    float rRadius = mod(phase + uTime * 0.12, 1.0) * 1.1;
    // width: thin baseline, swells softly on beat (no flicker)
    float ringW   = 0.018 + beatPulse * 0.022;
    float ringVal = smoothstep(ringW, 0.0, abs(dist - rRadius));
    float ringHue = mod(hueBase + phase * 0.7 + 0.4, 1.0);
    vec3 ringCol  = hsl2rgb(ringHue, 1.0, 0.62 + beatPulse * 0.15);
    // opacity: gentle blend, beat adds a soft glow (not a hard flash)
    col = mix(col, ringCol, ringVal * (0.45 + beatPulse * 0.25));
  }

  // --- waveform bars: vertical frequency bars at bottom, audio-reactive ---
  // Simulate 16 vertical bars across the width that pulse with energy
  float barCount = 16.0;
  float barIdx   = floor(uv.x * barCount);
  float barFrac  = fract(uv.x * barCount);
  // each bar has a slightly different phase offset to create a waveform look
  float barPhase = barIdx / barCount;
  float barHeight = (0.04 + 0.18 * uEnergy) * (0.5 + 0.5 * sin(uTime * 3.0 + barPhase * 12.566));
  barHeight = max(barHeight, 0.01);
  float barY = 1.0 - uv.y; // flip: bars grow from bottom
  float inBar = step(barY, barHeight) * step(0.05, barFrac) * step(barFrac, 0.95);
  float barHue = mod(hueBase + barPhase * 0.6, 1.0);
  vec3 barCol = hsl2rgb(barHue, 1.0, 0.6 + uEnergy * 0.25);
  col = mix(col, barCol, inBar * 0.65);

  // --- beat brightness flash ---
  // On each beat, lift the whole image toward white smoothly.
  // uBeat is already a fast-attack/slow-decay envelope so this feels punchy
  // without flickering. Strength: up to +0.22 brightness at peak beat.
  col += uBeat * 0.22;

  // --- vignette ---
  // Lightened floor (0.72, was 0.55) so the centre stays visible and lively.
  float vig = 1.0 - smoothstep(0.28, 0.82, dist);
  col *= mix(0.72, 1.0, vig);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export class TrippyBackground {
  private mesh: InstanceType<typeof THREE.Mesh>;
  private mat: InstanceType<typeof THREE.ShaderMaterial>;

  constructor(scene: InstanceType<typeof THREE.Scene>) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime:   { value: 0 },
        uEnergy: { value: 0 },
        uBeat:   { value: 0 },
        uAspect: { value: GAME_WIDTH / GAME_HEIGHT },
      },
      depthWrite: false,
      depthTest: false,
    });

    // Fullscreen triangle trick: a plane that exactly covers clip space
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.renderOrder = -1000; // draw first (behind everything)
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Call each frame with elapsed time and audio values */
  update(time: number, energy: number, beat: number): void {
    this.mat.uniforms.uTime.value   = time;
    this.mat.uniforms.uEnergy.value = energy;
    this.mat.uniforms.uBeat.value   = beat;
  }

  /** Call when the canvas is resized */
  setAspect(aspect: number): void {
    this.mat.uniforms.uAspect.value = aspect;
  }
}
