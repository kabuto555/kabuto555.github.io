// MonkeyModel — clean-slate implementation.
// Reference: chunky cartoon monkey, big round head, large eyes, wide muzzle,
// stubby body, arms that reach FORWARD in front of the body.
//
// Coordinate convention (all local to this.group):
//   +Y = up,  +Z = toward camera (front of monkey),  +X = monkey's right
//
// Arms are built pointing along +Z so they naturally extend in front.
// The jaw hinge is at the top-back of the lower jaw; positive rotation.x
// opens the mouth (chin swings down = +X rotation by right-hand rule).

type Group = InstanceType<typeof THREE.Group>;
type Mesh  = InstanceType<typeof THREE.Mesh>;
type StdMat = InstanceType<typeof THREE.MeshStandardMaterial>;

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function stdMat(hex: number, rough = 0.75): StdMat {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });
}
function mkSphere(r: number, hex: number, rough = 0.75): Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 24, 18), stdMat(hex, rough));
}
function mkBox(w: number, h: number, d: number, hex: number): Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stdMat(hex));
}
function mkCapsule(r: number, len: number, hex: number): Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 12), stdMat(hex));
}

// ── Palette (based on the reference image) ────────────────────────────────────
// Warm brown fur, cream/peach face & belly, dark eyes, pink inner ear/mouth
const FUR   = 0xb5651d;   // medium brown
const FACE  = 0xf0c08a;   // warm peach, lighter than fur
const BELLY = 0xf0c08a;
const EAR_I = 0xe8907a;   // pinkish inner ear
const EYE_W = 0xffffff;
const PUPIL = 0x111111;
const NOSE  = 0x7a3b10;
const MOUTH = 0xcc3311;   // red inside mouth
const TONGUE= 0xff7788;

// ── Head ──────────────────────────────────────────────────────────────────────

function buildHead(): { headGroup: Group; jawPivot: Group } {
  const headGroup = new THREE.Group();

  // Skull — large round sphere
  const skull = mkSphere(0.42, FUR);
  headGroup.add(skull);

  // Face plate — flattened sphere on the front
  const face = mkSphere(0.32, FACE);
  face.scale.set(0.95, 0.82, 0.55);
  face.position.set(0, -0.05, 0.22);
  headGroup.add(face);

  // Ears — one each side, slightly behind mid-head
  for (const side of [-1, 1] as const) {
    const earOut = mkSphere(0.16, FUR);
    earOut.position.set(side * 0.42, 0.08, -0.05);
    const earIn = mkSphere(0.1, EAR_I);
    earIn.position.set(side * 0.47, 0.08, -0.02);
    headGroup.add(earOut, earIn);
  }

  // Eyes — white sclera + dark pupil, placed on face plate
  for (const side of [-1, 1] as const) {
    const sclera = mkSphere(0.095, EYE_W, 0.3);
    sclera.position.set(side * 0.15, 0.08, 0.38);
    const pupil = mkSphere(0.062, PUPIL, 0.1);
    pupil.position.set(side * 0.15, 0.08, 0.43);
    // Tiny specular highlight
    const hi = mkSphere(0.02, 0xffffff, 0.05);
    hi.position.set(side * 0.165, 0.1, 0.448);
    headGroup.add(sclera, pupil, hi);
  }

  // ── Muzzle + jaw ─────────────────────────────────────────────────────────────
  // The muzzle group sits on the lower-front of the face.
  // Upper muzzle is fixed. Lower jaw is a child of jawPivot which is a child
  // of headGroup, positioned at the hinge line (top of lower jaw).

  // Upper muzzle (fixed, above the jaw hinge)
  const upperMuz = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 16, 12),
    stdMat(FACE),
  );
  upperMuz.scale.set(1.1, 0.55, 0.85);
  // Sits at the lower-front of the face, slightly above the hinge
  upperMuz.position.set(0, -0.14, 0.32);
  headGroup.add(upperMuz);

  // Nose — on top of the upper muzzle
  const nose = mkSphere(0.048, NOSE);
  nose.position.set(0, -0.06, 0.48);
  headGroup.add(nose);

  // ── Jaw pivot — the hinge sits just below the upper muzzle ───────────────────
  // Pivot at (0, -0.22, 0.28) in head-local space.
  // Positive rotation.x = chin swings DOWN (mouth opens). ✓
  const jawPivot = new THREE.Group();
  jawPivot.position.set(0, -0.22, 0.28);

  // Lower jaw geometry — built relative to the pivot.
  // The jaw extends FORWARD (+Z) and slightly DOWN (-Y) from the pivot.
  const lowerJaw = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 16, 12),
    stdMat(FACE),
  );
  lowerJaw.scale.set(1.1, 0.5, 0.85);
  lowerJaw.position.set(0, -0.05, 0.08);  // hangs below + forward of hinge

  // Mouth cavity — visible when jaw opens
  const cavity = mkSphere(0.14, MOUTH, 0.9);
  cavity.position.set(0, 0.0, 0.1);

  // Tongue
  const tongue = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 8),
    stdMat(TONGUE, 0.7),
  );
  tongue.scale.set(1.1, 0.4, 1.0);
  tongue.position.set(0, -0.06, 0.14);

  jawPivot.add(lowerJaw, cavity, tongue);
  headGroup.add(jawPivot);

  return { headGroup, jawPivot };
}

// ── Arm ───────────────────────────────────────────────────────────────────────
// The arm is built pointing FORWARD along +Z from the shoulder socket.
// Upper arm runs from Z=0 to Z=0.32; forearm from Z=0.32 to Z=0.58; hand at tip.
// This means NO rotation is needed for the neutral "arms forward" pose.
// We only rotate around Y (side-to-side splay) and slightly around Z (up/down).

function buildLeg(side: 1 | -1): Group {
  const g = new THREE.Group();
  const upper = mkCapsule(0.09, 0.22, FUR);
  upper.position.set(side * 0.14, -0.55, 0.0);
  const foot = mkSphere(0.1, FACE);
  foot.scale.set(1.2, 0.6, 1.15);
  foot.position.set(side * 0.15, -0.72, 0.06);
  g.add(upper, foot);
  return g;
}

function buildArm(side: 1 | -1): { armGroup: Group; forearmPivot: Group } {
  const armGroup = new THREE.Group();

  // Upper arm — capsule along Z axis (rotated 90° around X so length = Z)
  const upper = mkCapsule(0.075, 0.26, FUR);
  upper.rotation.x = Math.PI / 2;   // capsule default is along Y; rotate to align with Z
  upper.position.set(0, 0, 0.13);   // centre of upper arm at Z=0.13

  armGroup.add(upper);

  // Forearm pivot at the elbow (Z=0.26 from shoulder)
  const forearmPivot = new THREE.Group();
  forearmPivot.position.set(0, 0, 0.26);

  const lower = mkCapsule(0.062, 0.22, FUR);
  lower.rotation.x = Math.PI / 2;
  lower.position.set(0, 0, 0.11);

  // Hand sphere at the wrist
  const hand = mkSphere(0.09, FACE);
  hand.position.set(0, 0, 0.25);

  forearmPivot.add(lower, hand);
  armGroup.add(forearmPivot);

  return { armGroup, forearmPivot };
}

// ── MonkeyModel ───────────────────────────────────────────────────────────────

export class MonkeyModel {
  readonly group: Group;

  private headGroup: Group;
  private jawPivot:  Group;
  private leftArm:   Group;
  private rightArm:  Group;
  private leftForearm:  Group;
  private rightForearm: Group;
  private leftLeg:   Group;
  private rightLeg:  Group;

  // Animation state
  private idleT    = 0;
  private _baseY   = 0;
  private danceEnergy = 0;

  // Munch
  private munching    = false;
  private munchT      = 0;
  private MUNCH_DUR   = 0.65;

  // Sunglasses (x-ray power-up)
  private sunglasses: Group | null = null;
  private sunglassesVisible = false;

  // Bomb throw
  private bombThrowT    = 0;
  private bombThrowDur  = 0.65;
  private isThrowing    = false;
  private bombOnLand: (() => void) | null = null;
  private bombSprite: InstanceType<typeof THREE.Sprite> | null = null;
  private bombScene:  InstanceType<typeof THREE.Object3D> | null = null;
  private bombStart   = new THREE.Vector3();
  private bombTarget  = new THREE.Vector3();

  // Fruit rotation tracking (for hand wiggle)
  private armRotY       = 0;   // horizontal drag accumulator, decays to 0
  private armRotX       = 0;   // vertical drag accumulator, decays to 0
  private lastDragRotY  = 0;
  private lastDragRotX  = 0;
  private isDragging    = false;

  constructor() {
    this.group = new THREE.Group();

    // ── Body ──────────────────────────────────────────────────────────────────
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 20, 16),
      stdMat(FUR),
    );
    body.scale.set(1.0, 1.25, 0.85);
    body.position.y = -0.22;

    const belly = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 12),
      stdMat(BELLY),
    );
    belly.scale.set(0.95, 1.1, 0.6);
    belly.position.set(0, -0.18, 0.2);

    // ── Head ──────────────────────────────────────────────────────────────────
    const { headGroup, jawPivot } = buildHead();
    this.headGroup = headGroup;
    this.jawPivot  = jawPivot;
    headGroup.position.y = 0.35;

    // ── Arms — attached at shoulder level, extend FORWARD (+Z) ────────────────
    const lArmResult = buildArm(-1);
    const rArmResult = buildArm(1);
    this.leftArm      = lArmResult.armGroup;
    this.rightArm     = rArmResult.armGroup;
    this.leftForearm  = lArmResult.forearmPivot;
    this.rightForearm = rArmResult.forearmPivot;

    // Shoulder sockets: on the sides of the body, at chest height, at the FRONT
    // of the body so arms naturally point forward from there.
    this.leftArm.position.set(-0.32, 0.05, 0.12);
    this.rightArm.position.set( 0.32, 0.05, 0.12);

    // Slight upward angle so hands reach toward the fruit above
    this.leftArm.rotation.z  =  0.25;   // tilt left arm up on left side
    this.rightArm.rotation.z = -0.25;   // tilt right arm up on right side
    // Slight inward angle so hands converge toward fruit centre
    this.leftArm.rotation.y  =  0.2;
    this.rightArm.rotation.y = -0.2;

    // ── Legs (stored for dance animation) ───────────────────────────────────
    this.leftLeg  = buildLeg(-1);
    this.rightLeg = buildLeg(1);

    // ── Tail ──────────────────────────────────────────────────────────────────
    const tail = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.048, 8, 20, Math.PI * 1.4),
      stdMat(FUR),
    );
    tail.rotation.y = Math.PI / 2;
    tail.position.set(0.18, -0.28, -0.3);

    // ── Sunglasses (hidden until x-ray activated) ──────────────────────────
    this.sunglasses = new THREE.Group();
    this.sunglasses.visible = false;
    // Frame bridge — spans between the two lenses
    const bridge = mkBox(0.08, 0.022, 0.03, 0x111111);
    // Left lens — matches eye at (±0.15, 0.08)
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x00ccff, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.72,
    });
    const lLens = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 10), lensMat);
    lLens.scale.set(1, 0.68, 0.28);  // squash into a flat oval
    lLens.position.set(-0.15, 0, 0);
    const rLens = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 10), lensMat);
    rLens.scale.set(1, 0.68, 0.28);
    rLens.position.set(0.15, 0, 0);
    // Lens rims
    const lRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.10, 0.012, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    );
    lRim.scale.set(1, 0.68, 0.28);
    lRim.position.set(-0.15, 0, 0);
    const rRim = lRim.clone();
    rRim.position.set(0.15, 0, 0);
    // Temple arms
    const lArm2 = mkBox(0.13, 0.018, 0.012, 0x111111);
    lArm2.position.set(-0.27, 0, -0.025);
    const rArm2 = lArm2.clone();
    rArm2.position.set(0.27, 0, -0.025);
    this.sunglasses.add(bridge, lLens, rLens, lRim, rRim, lArm2, rArm2);
    // Sit right in front of the eyes: eyes are at Z=0.38 radius 0.095
    this.sunglasses.position.set(0, 0.08, 0.46);
    headGroup.add(this.sunglasses);

    this.group.add(body, belly, headGroup, this.leftArm, this.rightArm,
      this.leftLeg, this.rightLeg, tail);
  }

  setBaseY(y: number): void {
    this._baseY = y;
    this.group.position.y = y;
  }

  setFruitWorldY(_y: number): void { /* reserved for future use */ }

  setFruitRotation(rotX: number, rotY: number, isDragging: boolean): void {
    if (isDragging) {
      this.armRotY += rotY - this.lastDragRotY;
      this.armRotY  = Math.max(-1.2, Math.min(1.2, this.armRotY));
      this.armRotX += rotX - this.lastDragRotX;
      this.armRotX  = Math.max(-1.2, Math.min(1.2, this.armRotX));
    }
    this.lastDragRotY = rotY;
    this.lastDragRotX = rotX;
    this.isDragging   = isDragging;
  }

  /** Feed real-time beat energy (0–1) each frame from the audio analyser */
  setDanceEnergy(e: number): void { this.danceEnergy = e; }

  /** Remove sunglasses (call on stage start) */
  hideSunglasses(): void {
    if (!this.sunglasses) return;
    this.sunglassesVisible = false;
    this.sunglasses.visible = false;
  }

  /** Animate sunglasses dropping onto face, then keep them on */
  showSunglasses(): void {
    if (!this.sunglasses || this.sunglassesVisible) return;
    this.sunglassesVisible = true;
    this.sunglasses.visible = true;
    // Start above head and drop into position
    this.sunglasses.position.y = 0.9;
    const targetY = 0.08;
    const start = performance.now();
    const dur = 400;
    const animate = () => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      this.sunglasses!.position.y = 0.9 + (targetY - 0.9) * ease;
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /**
   * Animate a bomb throw: arm swings forward, a 💣 sprite arcs toward the
   * fruit, callback fires when it arrives.
   * @param scene   THREE scene to add the bomb sprite to
   * @param target  world-space position the bomb should fly to
   * @param onLand  called when the bomb reaches the target
   */
  throwBomb(
    scene: InstanceType<typeof THREE.Object3D>,
    target: InstanceType<typeof THREE.Vector3>,
    onLand: () => void,
  ): void {
    if (this.isThrowing) { onLand(); return; }
    this.isThrowing  = true;
    this.bombThrowT  = 0;
    this.bombOnLand  = onLand;
    this.bombScene   = scene;
    this.bombTarget.copy(target);

    // Build a 💣 canvas texture once
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    this.bombSprite = new THREE.Sprite(mat);
    this.bombSprite.scale.setScalar(0.28);

    // Start position: monkey's right hand in world space
    const handLocal = new THREE.Vector3(0.28, 0, 0.25); // approx right hand
    this.bombStart.copy(this.group.localToWorld(handLocal.clone()));
    this.bombSprite.position.copy(this.bombStart);
    scene.add(this.bombSprite);
  }

  triggerMunch(): void {
    if (this.munching) return;
    this.munching = true;
    this.munchT   = this.MUNCH_DUR;
  }

  /** World-space position of the mouth opening (used for eat-fly animations) */
  getMouthWorldPos(): InstanceType<typeof THREE.Vector3> {
    // jawPivot is at (0, -0.22, 0.28) in headGroup local space.
    // headGroup is at Y=0.35 in group local space.
    // Add a forward offset to place it at the open mouth.
    const local = new THREE.Vector3(0, 0, 0.18);
    return this.jawPivot.localToWorld(local);
  }

  update(dt: number): void {
    this.idleT += dt;

    // ── Dance energy ───────────────────────────────────────────────────────
    const de = this.danceEnergy;
    // Foot shuffle: alternate legs up/down faster with more energy
    const shuffleFreq = 3.5 + de * 4;          // 3.5–7.5 Hz shuffle rate
    const shuffleAmp  = 0.04 + de * 0.18;      // small idle lift → big beat stomp
    this.leftLeg.position.y  =  Math.sin(this.idleT * shuffleFreq) * shuffleAmp;
    this.rightLeg.position.y = -Math.sin(this.idleT * shuffleFreq) * shuffleAmp;
    // Side-to-side hip sway
    const swayAmp = 0.02 + de * 0.06;
    this.group.rotation.z = Math.sin(this.idleT * shuffleFreq * 0.5) * swayAmp;

    // ── Idle bob (beat-boosted) ──────────────────────────────────────────
    const bob = Math.sin(this.idleT * 1.7) * (0.016 + de * 0.06);

    // ── Munch animation ───────────────────────────────────────────────────────
    let jumpY   = 0;
    let jawOpen = 0;
    let lunge   = 0;

    if (this.munching) {
      this.munchT -= dt;
      const t = Math.max(0, this.munchT / this.MUNCH_DUR); // 1→0

      // Jump arc: rises then falls
      jumpY = Math.sin(t * Math.PI) * 0.85;

      // Lunge forward at peak
      lunge = Math.sin(t * Math.PI) * 0.5;

      // Jaw: opens quickly (phase leads the jump), snaps shut at end
      const jawPhase = Math.sin(Math.min(t * Math.PI * 1.5, Math.PI));
      jawOpen = Math.pow(Math.max(0, jawPhase), 0.5);

      if (this.munchT <= 0) {
        this.munching = false;
        this.jawPivot.rotation.x = 0;
        this.jawPivot.scale.set(1, 1, 1);
      }
    }

    // Apply body position
    this.group.position.y = this._baseY + bob + jumpY;
    this.group.position.z = -1.8 + lunge * 0.7;

    // ── Head nod (idle + lunge) ───────────────────────────────────────────────
    this.headGroup.rotation.x = -lunge * 0.35 + Math.sin(this.idleT * 0.8) * 0.02;
    this.headGroup.rotation.y = Math.sin(this.idleT * 0.6) * 0.03;

    // ── Jaw open: rotate down + scale width for cartoony effect ──────────────
    this.jawPivot.rotation.x = jawOpen * 0.9;           // chin drops ~52°
    const jw = 1 + jawOpen * 1.8;                       // grows to 2.8× wide
    this.jawPivot.scale.set(jw, 1 + jawOpen * 0.5, 1);

    // ── Bomb throw animation ───────────────────────────────────────────────
    if (this.isThrowing) {
      this.bombThrowT += dt;
      const tp = Math.min(1, this.bombThrowT / this.bombThrowDur);
      // Right arm: cocks back first, then whips forward
      const throwArc = Math.sin(tp * Math.PI);
      this.rightArm.rotation.x = -throwArc * 1.8;
      this.rightArm.rotation.z = -0.25 - throwArc * 0.5;

      // Fly the bomb sprite along a parabolic arc from start to target
      if (this.bombSprite) {
        const px = this.bombStart.x + (this.bombTarget.x - this.bombStart.x) * tp;
        const pz = this.bombStart.z + (this.bombTarget.z - this.bombStart.z) * tp;
        // Parabolic Y: lerp base + arc height
        const baseY = this.bombStart.y + (this.bombTarget.y - this.bombStart.y) * tp;
        const arcH  = Math.sin(tp * Math.PI) * 1.2; // peak height
        this.bombSprite.position.set(px, baseY + arcH, pz);
        // Spin the bomb sprite for drama
        this.bombSprite.material.rotation += dt * 8;
      }

      // Fire callback when bomb arrives
      if (tp >= 1) {
        this.isThrowing = false;
        this.rightArm.rotation.x = 0;
        this.rightArm.rotation.z = -0.25;
        // Remove bomb sprite
        if (this.bombSprite && this.bombScene) {
          this.bombScene.remove(this.bombSprite);
          (this.bombSprite.material as InstanceType<typeof THREE.SpriteMaterial>).dispose();
          this.bombSprite = null;
        }
        this.bombOnLand?.();
        this.bombOnLand = null;
      }
    }

    // ── Arm motion ───────────────────────────────────────────────────────────
    // Decay both accumulators to 0 when not dragging
    if (!this.isDragging) {
      const decayK = 1 - Math.exp(-4 * dt);
      this.armRotY *= (1 - decayK);
      this.armRotX *= (1 - decayK);
    }

    // Y drag  → arms sweep left/right (steering wheel)
    const armSwing = this.armRotY * 0.7;
    // X drag  → both arms raise (tilt up) or lower (tilt down) together
    const armLift  = this.armRotX * 0.5; // negative rotX = drag up = arms raise

    // Idle sway
    const sway = Math.sin(this.idleT * 1.3) * 0.03;

    // Left arm
    this.leftArm.rotation.z      =  0.25 + sway + armLift;
    this.leftArm.rotation.y      =  0.2  - armSwing;
    this.leftForearm.rotation.y  = -armSwing * 0.5;

    // Right arm (mirror)
    this.rightArm.rotation.z     = -0.25 - sway - armLift;
    this.rightArm.rotation.y     = -0.2  - armSwing;
    this.rightForearm.rotation.y =  armSwing * 0.5;

    // During munch: arms spread wide then snap back
    if (this.munching || jumpY > 0.01) {
      const spread = Math.sin((1 - this.munchT / this.MUNCH_DUR) * Math.PI) * 0.25;
      this.leftArm.rotation.z  += spread;
      this.rightArm.rotation.z -= spread;
    }
  }
}
