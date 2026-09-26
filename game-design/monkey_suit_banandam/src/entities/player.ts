// Kongo — ape warrior in a Gundam/tokusatsu space battle suit
import { COLORS } from '../config';
import { createFlatMaterial } from '../materials';

type Group = InstanceType<typeof THREE.Group>;
type Mesh = InstanceType<typeof THREE.Mesh>;
type V3 = InstanceType<typeof THREE.Vector3>;

export interface VernierJet {
  pivot: Group;       // rotates to aim the nozzle
  flameCore: Mesh;    // tight bright inner cone
  flameMid: Mesh;     // wider mid-glow cone
  flameHalo: Mesh;    // soft outer bloom cone
  rimGlow: Mesh;      // torus ring at nozzle exit
  baseRotX: number;
  baseRotZ: number;
}

export interface PlayerShip {
  root: Group;          // positioned + lookAt only — no rotation modifications
  recoilPivot: Group;   // child of root; recoil rotation applied here
  jetL: Group;
  jetR: Group;
  cockpit: Mesh;
  swordBlade: Mesh;
  tail: Group;
  armL: Group;
  armR: Group;
  headGroup: Group;
  // Vernier attitude thrusters — animated per input
  verniers: VernierJet[];
  // Muzzle marker groups — get world position each frame for shot origins
  muzzleVulcan: Group;    // right fist gun barrel
  muzzleMissile: Group;   // alias for muzzleMissileL (kept for compat)
  muzzleMissileL: Group;  // left shoulder pod
  muzzleMissileR: Group;  // right shoulder pod
  muzzleBeam: Group;      // left fist beam cannon tip
  muzzleSword: Group;     // right fist sword emitter
}

export function createPlayerShip(): PlayerShip {
  const root = new THREE.Group();
  // recoilPivot holds all geometry; root is used only for position + lookAt
  const recoilPivot = new THREE.Group();
  recoilPivot.scale.setScalar(0.52);
  root.add(recoilPivot);

  const bodyMat   = createFlatMaterial(COLORS.playerBody);
  const accentMat = createFlatMaterial(COLORS.playerAccent);
  const jetMat    = createFlatMaterial(COLORS.playerJetpack);
  const furMat    = createFlatMaterial(0x4a2e0a);
  const faceMat   = createFlatMaterial(0x8b5c2a);
  const gunMat    = createFlatMaterial(0x222233);

  // ── Torso ─────────────────────────────────────────────────────────────────
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), bodyMat);
  torso.castShadow = true;
  recoilPivot.add(torso);

  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.12), accentMat);
  chestPlate.position.set(0, 0.05, -0.5);
  recoilPivot.add(chestPlate);

  // ── Shoulders ─────────────────────────────────────────────────────────────
  const paulGeo = new THREE.SphereGeometry(0.32, 7, 5);
  const paulL = new THREE.Mesh(paulGeo, bodyMat);
  paulL.scale.set(1, 0.85, 0.85);
  paulL.position.set(-0.72, 0.22, -0.05);
  recoilPivot.add(paulL);
  const paulR = new THREE.Mesh(paulGeo, bodyMat);
  paulR.scale.set(1, 0.85, 0.85);
  paulR.position.set(0.72, 0.22, -0.05);
  recoilPivot.add(paulR);

  // ── Arms ──────────────────────────────────────────────────────────────────
  const uArmGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.55, 7);
  const fArmGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.48, 7);
  const fistGeo = new THREE.BoxGeometry(0.22, 0.16, 0.2);

  // LEFT arm — beam cannon
  const armL = new THREE.Group();
  armL.position.set(-0.72, 0, -0.25);
  const uArmL = new THREE.Mesh(uArmGeo, bodyMat);
  uArmL.rotation.x = -0.5; uArmL.rotation.z = 0.25;
  armL.add(uArmL);
  const fArmL = new THREE.Mesh(fArmGeo, furMat);
  fArmL.position.set(0, -0.35, -0.32); fArmL.rotation.x = -0.9;
  armL.add(fArmL);
  const fistL = new THREE.Mesh(fistGeo, furMat);
  fistL.position.set(0, -0.48, -0.68);
  armL.add(fistL);
  // Beam cannon barrel — long thick tube on left fist
  const beamBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.075, 0.6, 7),
    gunMat,
  );
  beamBarrel.rotation.x = Math.PI / 2;
  beamBarrel.position.set(0, -0.48, -1.02);
  armL.add(beamBarrel);
  // Beam housing block
  const beamHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.13, 0.42),
    gunMat,
  );
  beamHousing.position.set(0, -0.44, -0.98);
  armL.add(beamHousing);
  // Beam emitter tip (accent glow ring)
  const beamTip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.065, 0.06, 8),
    createFlatMaterial(COLORS.playerCockpit),
  );
  beamTip.rotation.x = Math.PI / 2;
  beamTip.position.set(0, -0.48, -1.34);
  armL.add(beamTip);
  recoilPivot.add(armL);

  // RIGHT arm — vulcan cannon
  const armR = new THREE.Group();
  armR.position.set(0.72, 0, -0.25);
  const uArmR = new THREE.Mesh(uArmGeo, bodyMat);
  uArmR.rotation.x = -0.5; uArmR.rotation.z = -0.25;
  armR.add(uArmR);
  const fArmR = new THREE.Mesh(fArmGeo, furMat);
  fArmR.position.set(0, -0.35, -0.32); fArmR.rotation.x = -0.9;
  armR.add(fArmR);
  const fistR = new THREE.Mesh(fistGeo, furMat);
  fistR.position.set(0, -0.48, -0.68);
  armR.add(fistR);
  // Vulcan barrel — slightly narrower, shorter
  const vulcanBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.45, 6),
    gunMat,
  );
  vulcanBarrel.rotation.x = Math.PI / 2;
  vulcanBarrel.position.set(0, -0.48, -0.96);
  armR.add(vulcanBarrel);
  recoilPivot.add(armR);

  // ── Symmetric missile pods on both shoulders ───────────────────────────────
  function makeMissilePod(side: number): void {
    const pod = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.18, 0.40),
      gunMat,
    );
    pod.position.set(side * 0.72, 0.44, -0.14);
    recoilPivot.add(pod);
    for (let i = -1; i <= 1; i += 2) {
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.038, 0.44, 5),
        createFlatMaterial(0x333344),
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(side * 0.72 + i * 0.07, 0.44, -0.38);
      recoilPivot.add(tube);
    }
  }
  makeMissilePod(-1); // left
  makeMissilePod(1);  // right

  // ── Legs ──────────────────────────────────────────────────────────────────
  const thighGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.44, 7);
  const shinGeo  = new THREE.CylinderGeometry(0.1,  0.12, 0.38, 7);
  const bootGeo  = new THREE.BoxGeometry(0.2, 0.14, 0.32);

  function makeLeg(side: number): void {
    const leg = new THREE.Group();
    leg.position.set(side * 0.35, -0.48, 0.22);
    const thigh = new THREE.Mesh(thighGeo, bodyMat);
    thigh.rotation.x = 0.4;
    leg.add(thigh);
    const shin = new THREE.Mesh(shinGeo, furMat);
    shin.position.set(0, -0.3, 0.18); shin.rotation.x = 0.6;
    leg.add(shin);
    const boot = new THREE.Mesh(bootGeo, jetMat);
    boot.position.set(0, -0.45, 0.38);
    leg.add(boot);
    recoilPivot.add(leg);
  }
  makeLeg(-1); makeLeg(1);

  // ── Head ──────────────────────────────────────────────────────────────────
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.6, -0.18);
  recoilPivot.add(headGroup);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.32, 9, 7), bodyMat);
  skull.scale.set(1, 1.08, 0.92);
  skull.castShadow = true;
  headGroup.add(skull);

  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.1), bodyMat);
  brow.position.set(0, 0.1, -0.28);
  headGroup.add(brow);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.22), faceMat);
  snout.position.set(0, -0.08, -0.38);
  headGroup.add(snout);

  const nostrilGeo = new THREE.SphereGeometry(0.04, 5, 4);
  const nostrilMat = createFlatMaterial(0x2a1a06);
  [-0.07, 0.07].forEach(x => {
    const n = new THREE.Mesh(nostrilGeo, nostrilMat);
    n.position.set(x, -0.06, -0.5);
    headGroup.add(n);
  });

  const cockpit = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.12, 0.07),
    new THREE.MeshBasicMaterial({ color: COLORS.playerCockpit }),
  );
  cockpit.position.set(0, 0.1, -0.34);
  headGroup.add(cockpit);

  [[-0.1, 0.18], [0, 0], [0.1, -0.18]].forEach(([x, rz]) => {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.3, 4), accentMat);
    fin.position.set(x, 0.42, -0.18);
    fin.rotation.z = (rz as number) * 0.1;
    headGroup.add(fin);
  });

  [-1, 1].forEach(side => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.18), bodyMat);
    ear.position.set(side * 0.3, 0.08, -0.1);
    headGroup.add(ear);
  });

  // ── Jetpack ───────────────────────────────────────────────────────────────
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.45), jetMat);
  pack.position.set(0, 0.05, 0.58);
  recoilPivot.add(pack);

  const houseGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.3, 8);
  const houseMatC = createFlatMaterial(0x334455);
  [-0.22, 0.22].forEach(x => {
    const h = new THREE.Mesh(houseGeo, houseMatC);
    h.rotation.x = Math.PI / 2;
    h.position.set(x, 0.05, 0.76);
    recoilPivot.add(h);
  });

  const jetL = new THREE.Group();
  jetL.position.set(-0.22, 0.05, 0.9);
  const nozzleGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.14, 8);
  const nL = new THREE.Mesh(nozzleGeo, jetMat);
  nL.rotation.x = Math.PI / 2;
  jetL.add(nL);
  recoilPivot.add(jetL);

  const jetR = new THREE.Group();
  jetR.position.set(0.22, 0.05, 0.9);
  const nR = new THREE.Mesh(nozzleGeo, jetMat);
  nR.rotation.x = Math.PI / 2;
  jetR.add(nR);
  recoilPivot.add(jetR);

  // ── Vernier thrusters — attitude-control jets that tilt with input ─────────
  // Small nozzle + glowing exhaust cone at each placement.
  const verniers: VernierJet[] = [];
  const vernierNozzleGeo = new THREE.CylinderGeometry(0.045, 0.065, 0.1, 6);
  const vernierFlameGeo  = new THREE.ConeGeometry(0.055, 0.28, 6);

  // Positions and base orientations: [x, y, z, baseRotX, baseRotZ]
  // Placed on wings (left/right), top and bottom of pack, and both sides of torso
  const vernierDefs: [number, number, number, number, number][] = [
    // Left wing tip — fires right to push left
    [-0.95, -0.05, 0.18,  0,      0.5],
    // Right wing tip — fires left to push right
    [ 0.95, -0.05, 0.18,  0,     -0.5],
    // Top of pack — fires up to push down
    [ 0,    0.32,  0.62, -0.5,    0  ],
    // Bottom of pack — fires down to push up
    [ 0,   -0.28,  0.62,  0.5,    0  ],
    // Left side torso — fires left
    [-0.62, 0,     0.1,   0,      0.8],
    // Right side torso — fires right
    [ 0.62, 0,     0.1,   0,     -0.8],
  ];

  vernierDefs.forEach(([x, y, z, baseRotX, baseRotZ]) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.x = baseRotX;
    pivot.rotation.z = baseRotZ;

    // Outer housing ring
    const housing = new THREE.Mesh(
      vernierNozzleGeo,
      createFlatMaterial(0x223344),
    );
    housing.rotation.x = Math.PI / 2;
    pivot.add(housing);

    // Inner dark throat
    const throat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.038, 0.06, 6),
      createFlatMaterial(0x111122),
    );
    throat.rotation.x = Math.PI / 2;
    throat.position.z = 0.04;
    pivot.add(throat);

    // Rim glow ring — torus at the nozzle exit
    const rimGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.048, 0.014, 5, 12),
      new THREE.MeshBasicMaterial({
        color: 0x44aaff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      }),
    );
    rimGlow.rotation.x = Math.PI / 2;
    rimGlow.position.z = 0.07;
    pivot.add(rimGlow);

    function makeFlameCone(
      radiusBase: number, length: number,
      color: number, opacity: number,
    ): Mesh {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(radiusBase, length, 7, 1, true), // open base
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
          side: THREE.FrontSide,
        }),
      );
      m.rotation.x = -Math.PI / 2;  // point cone along +Z
      m.position.z = 0.09;           // start just past nozzle
      m.scale.z = 0.01;              // collapsed at rest
      return m;
    }

    // Inner core: tight, bright white-blue
    const flameCore = makeFlameCone(0.022, 0.22, 0xaaddff, 0.95);
    pivot.add(flameCore);

    // Mid glow: wider cyan plume
    const flameMid = makeFlameCone(0.055, 0.32, 0x33aaff, 0.55);
    pivot.add(flameMid);

    // Outer halo: wide soft bloom
    const flameHalo = makeFlameCone(0.11, 0.42, 0x0066cc, 0.22);
    pivot.add(flameHalo);

    recoilPivot.add(pivot);
    verniers.push({ pivot, flameCore, flameMid, flameHalo, rimGlow, baseRotX, baseRotZ });
  });

  // ── Tail ──────────────────────────────────────────────────────────────────
  const tail = new THREE.Group();
  tail.position.set(0, -0.1, 0.55);
  recoilPivot.add(tail);
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.04, 0.1 - i * 0.012), 6, 4),
      furMat,
    );
    const a = (i / 5) * 1.4;
    seg.position.set(0, Math.sin(a) * 0.28 * i * 0.4, i * 0.16);
    tail.add(seg);
  }

  // ── Muzzle markers ─────────────────────────────────────────────────────────
  // Vulcan: tip of right fist barrel
  const muzzleVulcan = new THREE.Group();
  muzzleVulcan.position.set(0, -0.48, -1.22);
  armR.add(muzzleVulcan);

  // Beam: tip of left fist beam cannon
  const muzzleBeam = new THREE.Group();
  muzzleBeam.position.set(0, -0.48, -1.36);
  armL.add(muzzleBeam);

  // Sword: right fist
  const muzzleSword = new THREE.Group();
  muzzleSword.position.set(0, -0.48, -1.22);
  armR.add(muzzleSword);

  // Missiles: symmetric — left and right shoulder pod fronts
  const muzzleMissileL = new THREE.Group();
  muzzleMissileL.position.set(-0.72, 0.44, -0.60);
  recoilPivot.add(muzzleMissileL);
  const muzzleMissileR = new THREE.Group();
  muzzleMissileR.position.set(0.72, 0.44, -0.60);
  recoilPivot.add(muzzleMissileR);
  // muzzleMissile = average of L+R, stored as muzzleMissileL (caller handles both)
  const muzzleMissile = muzzleMissileL; // alias — getMuzzlePosition uses both

  // ── Sword blade ───────────────────────────────────────────────────────────
  const swordBlade = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 1.4),
    new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 }),
  );
  swordBlade.position.set(0.72, 0, -0.85);
  swordBlade.visible = false;
  recoilPivot.add(swordBlade);

  // ── Accent stripes ────────────────────────────────────────────────────────
  const stripeGeo = new THREE.BoxGeometry(1.08, 0.07, 0.1);
  [0.32, -0.32].forEach(y => {
    const s = new THREE.Mesh(stripeGeo, accentMat);
    s.position.set(0, y, -0.1);
    recoilPivot.add(s);
  });

  return {
    root, recoilPivot, jetL, jetR, cockpit, swordBlade,
    tail, armL, armR, headGroup,
    verniers,
    muzzleVulcan, muzzleMissile, muzzleMissileL, muzzleMissileR,
    muzzleBeam, muzzleSword,
  };
}

let _missileAlternate = false;

/** Get the world-space position of a muzzle point */
export function getMuzzlePosition(ship: PlayerShip, type: string): V3 {
  const target = new THREE.Vector3();
  switch (type) {
    case 'missile':
      // Alternate left/right shoulder pods for symmetric look
      _missileAlternate = !_missileAlternate;
      (_missileAlternate ? ship.muzzleMissileL : ship.muzzleMissileR)
        .getWorldPosition(target);
      break;
    case 'beam':  ship.muzzleBeam.getWorldPosition(target);   break;
    case 'sword': ship.muzzleSword.getWorldPosition(target);  break;
    default:      ship.muzzleVulcan.getWorldPosition(target); break;
  }
  return target;
}

export function animatePlayerShip(ship: PlayerShip, t: number): void {
  // Reset pivot to identity each frame, then apply bob additively via quaternion
  // so recoil (applied after this) composes cleanly on top
  ship.recoilPivot.quaternion.identity();
  ship.recoilPivot.rotateZ(Math.sin(t * 2.1) * 0.04);
  ship.recoilPivot.rotateX(Math.sin(t * 1.3) * 0.025);
  ship.tail.rotation.x = Math.sin(t * 3.5) * 0.25;
  ship.tail.rotation.z = Math.sin(t * 2.8) * 0.12;
  ship.armL.rotation.x = Math.sin(t * 1.8) * 0.06;
  ship.armR.rotation.x = Math.sin(t * 1.8 + 0.5) * 0.06;
}
