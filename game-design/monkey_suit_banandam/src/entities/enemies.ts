// Enemy ship factories — snake, eagle, leopard + boss variants
// Each enemy has animated sub-groups stored on EnemyShip for per-frame animation.
import { COLORS } from '../config';
import { createFlatMaterial } from '../materials';

type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;

export type EnemyType = 'snake' | 'eagle' | 'leopard' | 'boss_snake' | 'boss_eagle' | 'boss_leopard';

export interface EnemyAnimParts {
  // Snake: body segments that undulate
  snakeSegs?: Group[];
  // Eagle: wing pivots that flap
  wingL?: Group;
  wingR?: Group;
  // Leopard: tail that sways, head that bobs
  leopardTail?: Group;
  leopardHead?: Group;
}

export type FlyInState = 'pending' | 'flying' | 'arrived';
export type MotionPattern = 'h' | 'v' | 'circle' | 'poly';

export interface EnemyShip {
  root: Group;          // scene-level group: receives world position + yaw
  shakeGroup: Group;    // child of root: receives hit-shake offset only
  weakPoints: Mesh[];
  anim: EnemyAnimParts;
  hp: number;
  maxHp: number;
  type: EnemyType;
  isBoss: boolean;
  spawnT: number;
  offsetX: number;
  offsetY: number;
  age: number;
  shootCooldown: number;
  hasEnteredRange: boolean;
  dead: boolean;
  scaleProgress: number;
  // Fly-in spawn state
  flyIn: FlyInState;
  flyInTimer: number;
  flyInDuration: number;
  flyInOrigin: InstanceType<typeof THREE.Vector3> | null;
  inScene: boolean;
  // Motion oscillation
  motionPattern: MotionPattern;
  motionPhase: number;
  motionAmp: number;
  // Shoot telegraph
  chargeMesh: Mesh;
  chargeTimer: number;
  chargeMax: number;
  // Hit shake (simple, no spring)
  shakeTimer: number;  // counts down from shakeMax to 0
  shakeMax: number;    // total shake duration in seconds
}

// ── Snake / Serpent ship ─────────────────────────────────────────────────────
// A space serpent in armour: triangular hooded head, thick coiled body segments,
// forked tongue, frilled neck collar, small fin stabilisers.
function buildSnakeShip(boss: boolean): { root: Group; weakPoints: Mesh[]; anim: EnemyAnimParts } {
  const root = new THREE.Group();
  const col  = boss ? COLORS.bossColor : COLORS.snakeColor;
  const scaleCol = boss ? 0x882222 : 0x228833; // scale accent
  const weakPoints: Mesh[] = [];
  const snakeSegs: Group[] = [];

  const segCount = boss ? 6 : 4;

  // Body segments — each is a pivot group so they can undulate independently
  for (let i = 0; i < segCount; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0, i * 0.38);  // extends backward (+Z)
    const r  = 0.22 - i * 0.018;
    const seg = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.08, r), 8, 6),
      createFlatMaterial(col),
    );
    seg.scale.set(1, 0.8, 1.15);
    seg.castShadow = true;
    pivot.add(seg);
    // Scale stripe ring on each segment
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(0.07, r * 0.88), 0.025, 4, 10),
      createFlatMaterial(scaleCol),
    );
    ring.rotation.x = Math.PI / 2;
    pivot.add(ring);
    root.add(pivot);
    snakeSegs.push(pivot);
  }

  // Neck frill — collar of flat triangular spines
  const frillGroup = new THREE.Group();
  frillGroup.position.set(0, 0, -0.05);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spine = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.28, 3),
      createFlatMaterial(scaleCol),
    );
    spine.position.set(Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 0);
    spine.rotation.z = angle + Math.PI / 2;
    frillGroup.add(spine);
  }
  root.add(frillGroup);

  // Head — wide triangular shape (flattened cone + snout box)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0, -0.55);
  // Skull: flattened sphere, wide
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 8, 6),
    createFlatMaterial(boss ? 0x991111 : 0x1a8833),
  );
  skull.scale.set(1.3, 0.65, 1.1);
  skull.castShadow = true;
  headGroup.add(skull);
  // Snout — wedge pointing forward (-Z)
  const snout = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.12, 0.28),
    createFlatMaterial(boss ? 0x881111 : 0x226622),
  );
  snout.position.set(0, -0.05, -0.28);
  headGroup.add(snout);
  // Eyes — two glowing spheres on either side
  const eyeGeo = new THREE.SphereGeometry(0.055, 6, 4);
  const eyeMat = new THREE.MeshBasicMaterial({ color: boss ? 0xff4400 : 0xffff00 });
  [-1, 1].forEach(side => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.2, 0.06, -0.1);
    headGroup.add(eye);
  });
  // Forked tongue
  const tongueL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.008, 0.22, 4),
    createFlatMaterial(0xff2244),
  );
  tongueL.rotation.x = Math.PI / 2;
  tongueL.rotation.z = 0.25;
  tongueL.position.set(-0.06, -0.08, -0.5);
  headGroup.add(tongueL);
  const tongueR = tongueL.clone();
  tongueR.rotation.z = -0.25;
  tongueR.position.set(0.06, -0.08, -0.5);
  headGroup.add(tongueR);

  // Head fin — dorsal spike
  const headFin = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.22, 3),
    createFlatMaterial(scaleCol),
  );
  headFin.position.set(0, 0.28, -0.08);
  headGroup.add(headFin);

  root.add(headGroup);

  // Small stabiliser fins along body
  [0.18, 0.56].forEach(z => {
    [-1, 1].forEach(side => {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.04, 0.18),
        createFlatMaterial(scaleCol),
      );
      fin.position.set(side * 0.3, 0, z);
      fin.rotation.z = side * 0.35;
      root.add(fin);
    });
  });

  if (boss) {
    // Wide lateral hood fins — dramatically increase silhouette width
    [-1, 1].forEach(side => {
      // Primary broad fin
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.06, 0.55),
        createFlatMaterial(scaleCol),
      );
      fin.position.set(side * 1.1, 0, -0.18);
      fin.rotation.z = side * 0.18;
      root.add(fin);
      // Outer swept tip
      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.05, 0.32),
        createFlatMaterial(col),
      );
      tip.position.set(side * 2.1, -0.06, -0.05);
      tip.rotation.z = side * 0.35;
      root.add(tip);
      // Cannon arm
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 0.6, 6),
        createFlatMaterial(0x442222),
      );
      arm.rotation.x = Math.PI / 2;
      arm.position.set(side * 1.5, -0.1, -0.42);
      root.add(arm);
      // Muzzle glow
      const muzzle = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xff4400 }),
      );
      muzzle.position.set(side * 1.5, -0.1, -0.75);
      root.add(muzzle);
      // Weak point on each muzzle
      const wp = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 6),
        new THREE.MeshBasicMaterial({ color: COLORS.weakPoint }),
      );
      wp.position.copy(muzzle.position);
      root.add(wp);
      weakPoints.push(wp);
    });
  }

  return { root, weakPoints, anim: { snakeSegs } };
}

// ── Eagle / Raptor fighter ────────────────────────────────────────────────────────────
// A space raptor: recognisable bird head with hooked beak, swept feathered wings
// that flap, taloned feet tucked back, fan tail.
function buildEagleShip(boss: boolean): { root: Group; weakPoints: Mesh[]; anim: EnemyAnimParts } {
  const root = new THREE.Group();
  const col     = boss ? COLORS.bossColor : COLORS.eagleColor;
  const darkCol = boss ? 0x661111 : 0x885522;
  const weakPoints: Mesh[] = [];

  // Fuselage body — teardrop shape (sphere + tapered tail)
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 6),
    createFlatMaterial(col),
  );
  body.scale.set(0.9, 0.75, 1.4);
  body.castShadow = true;
  root.add(body);

  // Chest / breast plate
  const breast = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 7, 5),
    createFlatMaterial(0xffffff),
  );
  breast.scale.set(0.85, 0.7, 0.7);
  breast.position.set(0, -0.08, -0.2);
  root.add(breast);

  // ── Head ──
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.22, -0.42);
  root.add(headGroup);

  // Skull — rounded
  const headSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6),
    createFlatMaterial(darkCol),
  );
  headSphere.scale.set(1, 1.05, 0.95);
  headGroup.add(headSphere);

  // Hooked beak — two parts: upper (curved box) and lower (smaller)
  const beakTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, 0.28),
    createFlatMaterial(0xddaa22),
  );
  beakTop.position.set(0, -0.02, -0.26);
  beakTop.rotation.x = 0.25; // hook downward
  headGroup.add(beakTop);
  const beakBot = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.06, 0.18),
    createFlatMaterial(0xccaa33),
  );
  beakBot.position.set(0, -0.1, -0.24);
  headGroup.add(beakBot);

  // Eagle eyes — forward-facing, yellow
  const eyeGeo = new THREE.SphereGeometry(0.055, 6, 4);
  const eyeMat = new THREE.MeshBasicMaterial({ color: boss ? 0xff3300 : 0xffee00 });
  [-1, 1].forEach(side => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.12, 0.04, -0.17);
    headGroup.add(eye);
    // Brow ridge over each eye
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.04, 0.06),
      createFlatMaterial(darkCol),
    );
    brow.position.set(side * 0.12, 0.1, -0.18);
    headGroup.add(brow);
  });

  // Crest feathers on top
  [0, -0.08, 0.08].forEach((x, i) => {
    const feather = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.18, 3),
      createFlatMaterial(darkCol),
    );
    feather.position.set(x, 0.22 - i * 0.02, 0);
    headGroup.add(feather);
  });

  // ── Wings — pivot groups for flapping ──
  // Boss eagle has a much wider primary wingspan + a second swept pair
  const wingSpan = boss ? 2.8 : 1.0;

  function makeWing(side: number, span: number, yOff: number, zOff: number, sweepZ: number): Group {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.3, yOff, zOff);
    // Upper wing panel
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.07, 0.5),
      createFlatMaterial(col),
    );
    upper.position.set(side * span * 0.5, 0, sweepZ);
    upper.rotation.z = side * -0.12;
    pivot.add(upper);
    // Wing tip — angled downward
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(span * 0.32, 0.055, 0.32),
      createFlatMaterial(darkCol),
    );
    tip.position.set(side * (span + span * 0.16), -0.05, sweepZ + 0.1);
    tip.rotation.z = side * -0.32;
    pivot.add(tip);
    // Feather slots
    const fCount = boss ? 5 : 3;
    for (let f = 0; f < fCount; f++) {
      const feather = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.04, span * 0.16),
        createFlatMaterial(darkCol),
      );
      feather.position.set(
        side * (0.3 + f * span * 0.18),
        0,
        sweepZ + 0.3 - f * 0.04,
      );
      pivot.add(feather);
    }
    root.add(pivot);
    return pivot;
  }

  const wingL = makeWing(-1, wingSpan, 0, 0, -0.05);
  const wingR = makeWing( 1, wingSpan, 0, 0, -0.05);

  // Boss only: second swept pair — smaller, angled upward behind the primaries
  if (boss) {
    makeWing(-1, wingSpan * 0.55, 0.25, 0.3, 0.1);
    makeWing( 1, wingSpan * 0.55, 0.25, 0.3, 0.1);

    // Shoulder cannon pods — wide armament hardpoints
    [-1, 1].forEach(side => {
      const pod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.55, 7),
        createFlatMaterial(0x441111),
      );
      pod.rotation.x = Math.PI / 2;
      pod.position.set(side * 0.7, -0.1, -0.15);
      root.add(pod);
      // Barrel
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 0.45, 6),
        createFlatMaterial(0x220000),
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * 0.7, -0.1, -0.46);
      root.add(barrel);
      // Glowing muzzle
      const muzzle = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xff4400 }),
      );
      muzzle.position.set(side * 0.7, -0.1, -0.7);
      root.add(muzzle);
    });
  }

  // Tail fan — wider for boss
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0, 0.45);
  const tailCount = boss ? 7 : 5;
  for (let i = -(tailCount >> 1); i <= (tailCount >> 1); i++) {
    const feather = new THREE.Mesh(
      new THREE.BoxGeometry(boss ? 0.1 : 0.07, 0.04, boss ? 0.55 : 0.35),
      createFlatMaterial(i === 0 ? col : darkCol),
    );
    feather.position.set(i * (boss ? 0.14 : 0.09), 0, 0.12);
    feather.rotation.y = i * (boss ? 0.22 : 0.18);
    tailGroup.add(feather);
  }
  root.add(tailGroup);

  // Talons / landing struts
  [-1, 1].forEach(side => {
    const xOff = boss ? side * 0.5 : side * 0.18;
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.03, boss ? 0.35 : 0.22, 5),
      createFlatMaterial(0xddaa22),
    );
    leg.rotation.x = 0.8; leg.rotation.z = side * 0.3;
    leg.position.set(xOff, -0.28, 0.15);
    root.add(leg);
    for (let t = -1; t <= 1; t++) {
      const talon = new THREE.Mesh(
        new THREE.ConeGeometry(0.025, 0.1, 4),
        createFlatMaterial(0xbbaa33),
      );
      talon.rotation.x = Math.PI / 2;
      talon.position.set(xOff + t * 0.06, -0.42, 0.28);
      root.add(talon);
    }
  });

  if (boss) {
    // Weak points: one on each shoulder cannon muzzle
    const wpGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const wpMat = new THREE.MeshBasicMaterial({ color: COLORS.weakPoint });
    // Weak points sit on the glowing cannon muzzles
    ([-0.7, 0.7] as number[]).forEach(x => {
      const wp = new THREE.Mesh(wpGeo, wpMat.clone() as InstanceType<typeof THREE.MeshBasicMaterial>);
      wp.position.set(x, -0.1, -0.7);
      root.add(wp);
      weakPoints.push(wp);
    });
  }

  return { root, weakPoints, anim: { wingL, wingR } };
}

// ── Leopard / Panther cruiser ────────────────────────────────────────────────────────────
// A space panther: cat-shaped head with ears, spotted armour plates,
// four leg-struts as landing gear / thrusters, long curved tail.
function buildLeopardShip(boss: boolean): { root: Group; weakPoints: Mesh[]; anim: EnemyAnimParts } {
  const root = new THREE.Group();
  const col     = boss ? COLORS.bossColor : COLORS.leopardColor;
  const spotCol = 0x331100;
  const weakPoints: Mesh[] = [];

  // Main hull — cat-body shaped: wider at shoulder, tapered toward rear
  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(boss ? 0.55 : 0.38, 9, 7),
    createFlatMaterial(col),
  );
  hull.scale.set(1, 0.7, 1.6);
  hull.castShadow = true;
  root.add(hull);

  // Shoulder armour humps
  [-1, 1].forEach(side => {
    const hump = new THREE.Mesh(
      new THREE.SphereGeometry(boss ? 0.3 : 0.2, 7, 5),
      createFlatMaterial(col),
    );
    hump.scale.set(1, 0.65, 0.9);
    hump.position.set(side * (boss ? 0.42 : 0.3), boss ? 0.15 : 0.1, -0.2);
    root.add(hump);
  });

  // ── Cat head ──
  const leopardHead = new THREE.Group();
  leopardHead.position.set(0, boss ? 0.22 : 0.16, boss ? -0.72 : -0.52);
  root.add(leopardHead);

  const headSphere = new THREE.Mesh(
    new THREE.SphereGeometry(boss ? 0.28 : 0.2, 8, 6),
    createFlatMaterial(boss ? 0x881111 : 0xaa5511),
  );
  headSphere.scale.set(1.1, 0.9, 0.95);
  leopardHead.add(headSphere);

  // Cat ears — two pointed cones on top of head
  [-1, 1].forEach(side => {
    const ear = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.18, 4),
      createFlatMaterial(col),
    );
    ear.position.set(side * 0.14, 0.2, -0.04);
    ear.rotation.z = side * -0.25;
    leopardHead.add(ear);
    // Inner ear
    const innerEar = new THREE.Mesh(
      new THREE.ConeGeometry(0.04, 0.1, 4),
      createFlatMaterial(0xff9966),
    );
    innerEar.position.set(side * 0.14, 0.21, -0.03);
    innerEar.rotation.z = side * -0.25;
    leopardHead.add(innerEar);
  });

  // Snout
  const snout = new THREE.Mesh(
    new THREE.SphereGeometry(boss ? 0.14 : 0.1, 6, 5),
    createFlatMaterial(0xddaa88),
  );
  snout.scale.set(1.1, 0.7, 0.9);
  snout.position.set(0, -0.06, -0.2);
  leopardHead.add(snout);

  // Cat eyes
  const catEyeMat = new THREE.MeshBasicMaterial({ color: boss ? 0xff4400 : 0x44ff88 });
  [-1, 1].forEach(side => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), catEyeMat);
    eye.position.set(side * 0.1, 0.05, -0.19);
    leopardHead.add(eye);
    // Slit pupil
    const pupil = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.07, 0.015),
      new THREE.MeshBasicMaterial({ color: 0x000000 }),
    );
    pupil.position.set(side * 0.1, 0.05, -0.2);
    leopardHead.add(pupil);
  });

  // Whiskers
  [-1, 1].forEach(side => {
    for (let w = 0; w < 2; w++) {
      const whisker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.003, 0.28, 4),
        createFlatMaterial(0xffffff),
      );
      whisker.rotation.z = Math.PI / 2;
      whisker.rotation.x = (w - 0.5) * 0.25;
      whisker.position.set(side * 0.22, -0.04 + w * 0.04, -0.2);
      leopardHead.add(whisker);
    }
  });

  // Spot pattern on hull
  const spotPositions: [number, number, number][] = [
    [-0.2, 0.24, 0.05], [0.2, 0.24, 0.05],
    [0, 0.26, -0.28], [-0.15, 0.22, 0.3], [0.15, 0.22, 0.3],
  ];
  spotPositions.forEach(([x, y, z]) => {
    const spot = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 5, 4),
      createFlatMaterial(spotCol),
    );
    spot.scale.setScalar(boss ? 1.4 : 1);
    spot.position.set(x, y, z);
    root.add(spot);
  });

  // Four leg-struts (thruster pods at corners)
  const legOffsets: [number, number, number][] = [
    [-0.35, -0.28, -0.25], [0.35, -0.28, -0.25],
    [-0.3, -0.28, 0.3], [0.3, -0.28, 0.3],
  ];
  legOffsets.forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.07, 0.32, 6),
      createFlatMaterial(0x445566),
    );
    leg.rotation.x = 0.35;
    leg.position.set(x * (boss ? 1.35 : 1), y, z);
    root.add(leg);
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.1, 7),
      createFlatMaterial(0x334455),
    );
    nozzle.rotation.x = 0.35;
    nozzle.position.set(x * (boss ? 1.35 : 1), y - 0.18, z + 0.12);
    root.add(nozzle);
  });

  // Tail — curves upward from rear
  const leopardTail = new THREE.Group();
  leopardTail.position.set(0, 0, 0.62);
  root.add(leopardTail);
  const tailSegCount = 5;
  for (let i = 0; i < tailSegCount; i++) {
    const r = 0.08 - i * 0.01;
    const seg = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.035, r), 6, 4),
      createFlatMaterial(i % 2 === 0 ? col : spotCol),
    );
    seg.position.set(0, Math.sin((i / tailSegCount) * 1.2) * 0.2, i * 0.14);
    leopardTail.add(seg);
  }
  // Tail tuft
  const tuft = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 6, 4),
    createFlatMaterial(col),
  );
  tuft.position.set(0, 0.22, 0.72);
  leopardTail.add(tuft);

  if (boss) {
    // Broad swept claw-blade wings for wide silhouette
    [-1, 1].forEach(side => {
      // Main blade
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.07, 0.5),
        createFlatMaterial(col),
      );
      blade.position.set(side * 1.1, 0.05, -0.1);
      blade.rotation.z = side * 0.14;
      root.add(blade);
      // Swept outer panel
      const outer = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.06, 0.35),
        createFlatMaterial(spotCol),
      );
      outer.position.set(side * 2.1, -0.04, 0.1);
      outer.rotation.z = side * 0.32;
      root.add(outer);
      // Claw tip spikes
      for (let c = 0; c < 3; c++) {
        const claw = new THREE.Mesh(
          new THREE.ConeGeometry(0.04, 0.22, 4),
          createFlatMaterial(0x220000),
        );
        claw.rotation.z = side * (Math.PI / 2);
        claw.position.set(side * (2.4 + c * 0.01), -0.04 - c * 0.06, 0.05 + c * 0.1);
        root.add(claw);
      }
      // Side thruster bank
      const thruster = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.12, 0.4, 7),
        createFlatMaterial(0x334455),
      );
      thruster.rotation.x = 0.3;
      thruster.position.set(side * 0.85, -0.22, 0.35);
      root.add(thruster);
      const nozzle = new THREE.Mesh(
        new THREE.SphereGeometry(0.095, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xff6600 }),
      );
      nozzle.position.set(side * 0.85, -0.3, 0.58);
      root.add(nozzle);
    });

    // Weak point: glowing eye on head
    const wp = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: COLORS.weakPoint }),
    );
    wp.position.set(0, 0.05, -0.22);
    leopardHead.add(wp);
    weakPoints.push(wp);
    // Second weak point: core exhaust
    const wp2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 0.1, 8),
      new THREE.MeshBasicMaterial({ color: COLORS.weakPoint }),
    );
    wp2.position.set(0, -0.18, 0.72);
    root.add(wp2);
    weakPoints.push(wp2);
  }

  return { root, weakPoints, anim: { leopardTail, leopardHead } };
}

// ── Factory ───────────────────────────────────────────────────────────────────────
export function createEnemy(type: EnemyType, spawnT: number, offsetX: number, offsetY: number, stageIndex = 0): EnemyShip {
  const isBoss = type.startsWith('boss_');
  let built: { root: Group; weakPoints: Mesh[]; anim: EnemyAnimParts };

  if (type === 'snake' || type === 'boss_snake') {
    built = buildSnakeShip(isBoss);
  } else if (type === 'eagle' || type === 'boss_eagle') {
    built = buildEagleShip(isBoss);
  } else {
    built = buildLeopardShip(isBoss);
  }

  // Exponential scaling: each stage multiplies HP by ~1.45 (vs old flat +30%).
  // Stage 0: ×1.0, stage 3: ×3.0, stage 5: ×6.4, stage 10: ×60
  const stageScale = Math.pow(1.45, stageIndex);
  const baseHp = isBoss ? 3000 : (type === 'leopard' ? 45 : type === 'eagle' ? 30 : 22);
  const hp = Math.round(baseHp * stageScale);

  // Pick motion pattern — bosses always use circle for imposing presence;
  // regular enemies distributed across all four patterns based on spawnT hash.
  const PATTERNS: MotionPattern[] = ['h', 'v', 'circle', 'poly'];
  const motionPattern: MotionPattern = isBoss
    ? 'circle'
    : PATTERNS[Math.floor(((spawnT * 137.508) % 1) * PATTERNS.length)];
  const motionPhase = (spawnT * 6.283) % (Math.PI * 2);
  const motionAmp = isBoss
    ? 1.4
    : (type === 'snake' ? 1.0 : type === 'eagle' ? 0.8 : 0.6);

  // shakeGroup: sits between root (world pos/yaw) and geometry (shake offset).
  // All geometry lives inside shakeGroup so shake never conflicts with yaw or animation.
  const shakeGroup = new THREE.Group();
  // Re-parent built.root's children into shakeGroup, then make shakeGroup the scene node.
  // Simpler: shakeGroup IS the geometry container; root is a plain wrapper.
  const outerRoot = new THREE.Group();
  shakeGroup.add(built.root);   // geometry root becomes child of shakeGroup
  outerRoot.add(shakeGroup);    // shakeGroup inside outerRoot

  // Charge telegraph mesh — added to shakeGroup so it moves with the model
  const chargeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 7, 5),
    new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0 }),
  );
  chargeMesh.visible = false;
  shakeGroup.add(chargeMesh);

  const chargeMax = isBoss ? 0.7 : 0.9;

  return {
    root: outerRoot,
    shakeGroup,
    weakPoints: built.weakPoints,
    anim: built.anim,
    hp, maxHp: hp, type, isBoss,
    spawnT, offsetX, offsetY,
    age: 0, shootCooldown: 0, hasEnteredRange: false, dead: false, scaleProgress: 0,
    flyIn: 'pending', flyInTimer: 0, flyInDuration: 1.2, flyInOrigin: null, inScene: false,
    motionPattern, motionPhase, motionAmp,
    chargeMesh, chargeTimer: 0, chargeMax,
    shakeTimer: 0, shakeMax: 0.28,
  };
}

/** Collect all Mesh children of an enemy (for hit-flash tinting) */
export function getEnemyMeshes(enemy: EnemyShip): Mesh[] {
  const meshes: Mesh[] = [];
  enemy.root.traverse((child) => {
    if ((child as Mesh).isMesh) meshes.push(child as Mesh);
  });
  return meshes;
}

/** Per-frame animation for each enemy type */
export function animateEnemy(enemy: EnemyShip, t: number): void {
  const { anim } = enemy;

  // Snake: sinusoidal segment undulation
  if (anim.snakeSegs) {
    anim.snakeSegs.forEach((seg, i) => {
      seg.rotation.y = Math.sin(t * 2.5 + i * 0.9) * 0.28;
      seg.rotation.x = Math.sin(t * 1.8 + i * 0.7) * 0.12;
    });
  }

  // Eagle: wing flapping
  if (anim.wingL && anim.wingR) {
    const flap = Math.sin(t * 3.5) * 0.32;
    anim.wingL.rotation.z =  flap;
    anim.wingR.rotation.z = -flap;
    // Slight body roll with wings
    enemy.root.rotation.z = Math.sin(t * 3.5) * 0.06;
  }

  // Leopard: tail sway + head bob
  if (anim.leopardTail) {
    anim.leopardTail.rotation.x = Math.sin(t * 2.2) * 0.3;
    anim.leopardTail.rotation.z = Math.sin(t * 1.8 + 1) * 0.2;
  }
  if (anim.leopardHead) {
    anim.leopardHead.rotation.x = Math.sin(t * 1.4) * 0.08;
    anim.leopardHead.rotation.z = Math.sin(t * 1.1) * 0.05;
  }
}

/** Flash weak points each frame */
export function animateWeakPoints(enemy: EnemyShip, t: number): void {
  const flash = 0.4 + 0.6 * Math.abs(Math.sin(t * 6));
  for (const wp of enemy.weakPoints) {
    const mat = wp.material as InstanceType<typeof THREE.MeshBasicMaterial>;
    mat.color.setHex(COLORS.weakPoint);
    mat.opacity = flash;
    mat.transparent = true;
  }
}
