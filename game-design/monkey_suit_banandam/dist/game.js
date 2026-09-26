(function() {
  "use strict";
  const CANVAS_ASPECT = "9:19.5";
  function deriveCanvasDims() {
    const longEdge = 1704;
    const raw = CANVAS_ASPECT;
    const parts = raw.split(":");
    if (parts.length !== 2) return { width: 786, height: longEdge };
    const w = parseFloat(parts[0]);
    const h = parseFloat(parts[1]);
    if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return { width: 786, height: longEdge };
    const shortEdge = Math.round(longEdge * Math.min(w, h) / Math.max(w, h));
    if (w < h) return { width: shortEdge, height: longEdge };
    return { width: longEdge, height: shortEdge };
  }
  const _dims = deriveCanvasDims();
  const GAME_WIDTH = _dims.width;
  const GAME_HEIGHT = _dims.height;
  const COLORS = {
    background: 133144,
    // deep space black-blue
    hemisphereSky: 4482764,
    // brighter mid-blue sky
    hemisphereGround: 2241365,
    // dark-blue space ground bounce
    directionalLight: 16772829,
    // Player
    playerBody: 2245836,
    // cobalt blue gundam suit
    playerAccent: 16768256,
    // yellow V-fin accent
    playerCockpit: 65484,
    // teal visor
    playerJetpack: 4478310,
    // grey jetpack
    // Enemies
    snakeColor: 4500036,
    // green snake ship
    eagleColor: 12290099,
    // gold eagle fighter
    leopardColor: 13395490,
    // orange leopard cruiser
    bossColor: 11149858,
    // red boss
    weakPoint: 16776960,
    // bright yellow weak point
    // Projectiles
    playerShot: 65535,
    // cyan vulcan
    playerMissile: 16746496,
    // orange missile
    playerBeam: 16711935,
    // magenta beam
    enemyShot: 16729088,
    // red-orange enemy bullet
    // Pickups
    healthPickup: 16724838,
    // hot pink health
    weaponPickup: 16755200
  };
  const MAX_DEVICE_PIXEL_RATIO = 2;
  const COARSE_POINTER_MAX_DEVICE_PIXEL_RATIO = 1.5;
  function hasCoarsePointer() {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  }
  function resolveDevicePixelRatio() {
    const cap = hasCoarsePointer() ? COARSE_POINTER_MAX_DEVICE_PIXEL_RATIO : MAX_DEVICE_PIXEL_RATIO;
    return Math.min(window.devicePixelRatio || 1, cap);
  }
  function configureRenderer(renderer2) {
    renderer2.setPixelRatio(resolveDevicePixelRatio());
    renderer2.shadowMap.enabled = true;
    renderer2.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  function observeContainerResize(container2, renderer2, camera2) {
    let pendingFrame = null;
    function applyResize() {
      pendingFrame = null;
      const width = container2.clientWidth;
      const height = container2.clientHeight;
      if (width <= 0 || height <= 0) return;
      renderer2.setPixelRatio(resolveDevicePixelRatio());
      renderer2.setSize(width, height, false);
      camera2.aspect = width / height;
      camera2.updateProjectionMatrix();
    }
    function scheduleResize() {
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(applyResize);
    }
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(container2);
    applyResize();
    return () => {
      observer.disconnect();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    };
  }
  function createLightingRig(scene2, frustumSize = 6) {
    const hemisphereLight = new THREE.HemisphereLight(
      COLORS.hemisphereSky,
      COLORS.hemisphereGround,
      2.2
    );
    scene2.add(hemisphereLight);
    const fillLight = new THREE.DirectionalLight(8952268, 1);
    fillLight.position.set(-6, 2, -8);
    scene2.add(fillLight);
    const directionalLight = new THREE.DirectionalLight(COLORS.directionalLight, 2);
    directionalLight.position.set(4, 6, 3);
    directionalLight.target.position.set(0, 0, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.set(1024, 1024);
    directionalLight.shadow.camera.left = -frustumSize;
    directionalLight.shadow.camera.right = frustumSize;
    directionalLight.shadow.camera.top = frustumSize;
    directionalLight.shadow.camera.bottom = -frustumSize;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 20;
    directionalLight.shadow.bias = -5e-4;
    scene2.add(directionalLight);
    scene2.add(directionalLight.target);
    return { hemisphereLight, directionalLight };
  }
  const STYLE_TAG_ID = "__game-boot-gesture-hardening-styles";
  const REQUIRED_VIEWPORT_TOKENS = {
    "maximum-scale": "1.0",
    "user-scalable": "no",
    "viewport-fit": "cover"
  };
  function hardenViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    const parts = /* @__PURE__ */ new Map();
    for (const pair of meta.content.split(",")) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (key) parts.set(key, value ?? "");
    }
    if (!parts.has("width")) parts.set("width", "device-width");
    if (!parts.has("initial-scale")) parts.set("initial-scale", "1.0");
    for (const [key, value] of Object.entries(REQUIRED_VIEWPORT_TOKENS)) {
      parts.set(key, value);
    }
    meta.content = Array.from(parts.entries()).map(([key, value]) => value ? `${key}=${value}` : key).join(", ");
  }
  function hardenGestures() {
    if (document.getElementById(STYLE_TAG_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_TAG_ID;
    style.textContent = `
    html, body {
      touch-action: pan-x pan-y;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      -webkit-tap-highlight-color: transparent;
      overscroll-behavior: none;
    }
    :where(input, textarea) {
      user-select: text;
      -webkit-user-select: text;
      -webkit-touch-callout: default;
    }
  `;
    document.head.appendChild(style);
  }
  class KeyboardInput {
    constructor(target = window) {
      this.held = /* @__PURE__ */ new Set();
      this.handleKeyDown = (event) => {
        this.held.add(event.code);
      };
      this.handleKeyUp = (event) => {
        this.held.delete(event.code);
      };
      this.target = target;
      target.addEventListener("keydown", this.handleKeyDown);
      target.addEventListener("keyup", this.handleKeyUp);
    }
    isDown(code) {
      return this.held.has(code);
    }
    /** WASD/arrow-key movement collapsed to a normalized {x,y} vector. */
    getMoveVector() {
      const x = (this.isDown("KeyD") || this.isDown("ArrowRight") ? 1 : 0) - (this.isDown("KeyA") || this.isDown("ArrowLeft") ? 1 : 0);
      const y = (this.isDown("KeyS") || this.isDown("ArrowDown") ? 1 : 0) - (this.isDown("KeyW") || this.isDown("ArrowUp") ? 1 : 0);
      const length = Math.hypot(x, y);
      if (length === 0) return { x: 0, y: 0 };
      return { x: x / length, y: y / length };
    }
    dispose() {
      this.target.removeEventListener("keydown", this.handleKeyDown);
      this.target.removeEventListener("keyup", this.handleKeyUp);
    }
  }
  function createFlatMaterial(color, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: options.roughness ?? 0.8,
      metalness: options.metalness ?? 0.05
    });
  }
  function createPlayerShip() {
    const root = new THREE.Group();
    const recoilPivot = new THREE.Group();
    recoilPivot.scale.setScalar(0.52);
    root.add(recoilPivot);
    const bodyMat = createFlatMaterial(COLORS.playerBody);
    const accentMat = createFlatMaterial(COLORS.playerAccent);
    const jetMat = createFlatMaterial(COLORS.playerJetpack);
    const furMat = createFlatMaterial(4861450);
    const faceMat = createFlatMaterial(9133098);
    const gunMat = createFlatMaterial(2236979);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), bodyMat);
    torso.castShadow = true;
    recoilPivot.add(torso);
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.12), accentMat);
    chestPlate.position.set(0, 0.05, -0.5);
    recoilPivot.add(chestPlate);
    const paulGeo = new THREE.SphereGeometry(0.32, 7, 5);
    const paulL = new THREE.Mesh(paulGeo, bodyMat);
    paulL.scale.set(1, 0.85, 0.85);
    paulL.position.set(-0.72, 0.22, -0.05);
    recoilPivot.add(paulL);
    const paulR = new THREE.Mesh(paulGeo, bodyMat);
    paulR.scale.set(1, 0.85, 0.85);
    paulR.position.set(0.72, 0.22, -0.05);
    recoilPivot.add(paulR);
    const uArmGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.55, 7);
    const fArmGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.48, 7);
    const fistGeo = new THREE.BoxGeometry(0.22, 0.16, 0.2);
    const armL = new THREE.Group();
    armL.position.set(-0.72, 0, -0.25);
    const uArmL = new THREE.Mesh(uArmGeo, bodyMat);
    uArmL.rotation.x = -0.5;
    uArmL.rotation.z = 0.25;
    armL.add(uArmL);
    const fArmL = new THREE.Mesh(fArmGeo, furMat);
    fArmL.position.set(0, -0.35, -0.32);
    fArmL.rotation.x = -0.9;
    armL.add(fArmL);
    const fistL = new THREE.Mesh(fistGeo, furMat);
    fistL.position.set(0, -0.48, -0.68);
    armL.add(fistL);
    const beamBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.075, 0.6, 7),
      gunMat
    );
    beamBarrel.rotation.x = Math.PI / 2;
    beamBarrel.position.set(0, -0.48, -1.02);
    armL.add(beamBarrel);
    const beamHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.13, 0.42),
      gunMat
    );
    beamHousing.position.set(0, -0.44, -0.98);
    armL.add(beamHousing);
    const beamTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.065, 0.06, 8),
      createFlatMaterial(COLORS.playerCockpit)
    );
    beamTip.rotation.x = Math.PI / 2;
    beamTip.position.set(0, -0.48, -1.34);
    armL.add(beamTip);
    recoilPivot.add(armL);
    const armR = new THREE.Group();
    armR.position.set(0.72, 0, -0.25);
    const uArmR = new THREE.Mesh(uArmGeo, bodyMat);
    uArmR.rotation.x = -0.5;
    uArmR.rotation.z = -0.25;
    armR.add(uArmR);
    const fArmR = new THREE.Mesh(fArmGeo, furMat);
    fArmR.position.set(0, -0.35, -0.32);
    fArmR.rotation.x = -0.9;
    armR.add(fArmR);
    const fistR = new THREE.Mesh(fistGeo, furMat);
    fistR.position.set(0, -0.48, -0.68);
    armR.add(fistR);
    const vulcanBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.45, 6),
      gunMat
    );
    vulcanBarrel.rotation.x = Math.PI / 2;
    vulcanBarrel.position.set(0, -0.48, -0.96);
    armR.add(vulcanBarrel);
    recoilPivot.add(armR);
    function makeMissilePod(side) {
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.18, 0.4),
        gunMat
      );
      pod.position.set(side * 0.72, 0.44, -0.14);
      recoilPivot.add(pod);
      for (let i = -1; i <= 1; i += 2) {
        const tube = new THREE.Mesh(
          new THREE.CylinderGeometry(0.038, 0.038, 0.44, 5),
          createFlatMaterial(3355460)
        );
        tube.rotation.x = Math.PI / 2;
        tube.position.set(side * 0.72 + i * 0.07, 0.44, -0.38);
        recoilPivot.add(tube);
      }
    }
    makeMissilePod(-1);
    makeMissilePod(1);
    const thighGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.44, 7);
    const shinGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.38, 7);
    const bootGeo = new THREE.BoxGeometry(0.2, 0.14, 0.32);
    function makeLeg(side) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.35, -0.48, 0.22);
      const thigh = new THREE.Mesh(thighGeo, bodyMat);
      thigh.rotation.x = 0.4;
      leg.add(thigh);
      const shin = new THREE.Mesh(shinGeo, furMat);
      shin.position.set(0, -0.3, 0.18);
      shin.rotation.x = 0.6;
      leg.add(shin);
      const boot = new THREE.Mesh(bootGeo, jetMat);
      boot.position.set(0, -0.45, 0.38);
      leg.add(boot);
      recoilPivot.add(leg);
    }
    makeLeg(-1);
    makeLeg(1);
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
    const nostrilMat = createFlatMaterial(2759174);
    [-0.07, 0.07].forEach((x) => {
      const n = new THREE.Mesh(nostrilGeo, nostrilMat);
      n.position.set(x, -0.06, -0.5);
      headGroup.add(n);
    });
    const cockpit = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.12, 0.07),
      new THREE.MeshBasicMaterial({ color: COLORS.playerCockpit })
    );
    cockpit.position.set(0, 0.1, -0.34);
    headGroup.add(cockpit);
    [[-0.1, 0.18], [0, 0], [0.1, -0.18]].forEach(([x, rz]) => {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.3, 4), accentMat);
      fin.position.set(x, 0.42, -0.18);
      fin.rotation.z = rz * 0.1;
      headGroup.add(fin);
    });
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.18), bodyMat);
      ear.position.set(side * 0.3, 0.08, -0.1);
      headGroup.add(ear);
    });
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.45), jetMat);
    pack.position.set(0, 0.05, 0.58);
    recoilPivot.add(pack);
    const houseGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.3, 8);
    const houseMatC = createFlatMaterial(3359829);
    [-0.22, 0.22].forEach((x) => {
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
    const verniers = [];
    const vernierNozzleGeo = new THREE.CylinderGeometry(0.045, 0.065, 0.1, 6);
    new THREE.ConeGeometry(0.055, 0.28, 6);
    const vernierDefs = [
      // Left wing tip — fires right to push left
      [-0.95, -0.05, 0.18, 0, 0.5],
      // Right wing tip — fires left to push right
      [0.95, -0.05, 0.18, 0, -0.5],
      // Top of pack — fires up to push down
      [0, 0.32, 0.62, -0.5, 0],
      // Bottom of pack — fires down to push up
      [0, -0.28, 0.62, 0.5, 0],
      // Left side torso — fires left
      [-0.62, 0, 0.1, 0, 0.8],
      // Right side torso — fires right
      [0.62, 0, 0.1, 0, -0.8]
    ];
    vernierDefs.forEach(([x, y, z, baseRotX, baseRotZ]) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      pivot.rotation.x = baseRotX;
      pivot.rotation.z = baseRotZ;
      const housing = new THREE.Mesh(
        vernierNozzleGeo,
        createFlatMaterial(2241348)
      );
      housing.rotation.x = Math.PI / 2;
      pivot.add(housing);
      const throat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.038, 0.06, 6),
        createFlatMaterial(1118498)
      );
      throat.rotation.x = Math.PI / 2;
      throat.position.z = 0.04;
      pivot.add(throat);
      const rimGlow = new THREE.Mesh(
        new THREE.TorusGeometry(0.048, 0.014, 5, 12),
        new THREE.MeshBasicMaterial({
          color: 4500223,
          transparent: true,
          opacity: 0,
          depthWrite: false
        })
      );
      rimGlow.rotation.x = Math.PI / 2;
      rimGlow.position.z = 0.07;
      pivot.add(rimGlow);
      function makeFlameCone(radiusBase, length, color, opacity) {
        const m = new THREE.Mesh(
          new THREE.ConeGeometry(radiusBase, length, 7, 1, true),
          // open base
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
            side: THREE.FrontSide
          })
        );
        m.rotation.x = -Math.PI / 2;
        m.position.z = 0.09;
        m.scale.z = 0.01;
        return m;
      }
      const flameCore = makeFlameCone(0.022, 0.22, 11197951, 0.95);
      pivot.add(flameCore);
      const flameMid = makeFlameCone(0.055, 0.32, 3386111, 0.55);
      pivot.add(flameMid);
      const flameHalo = makeFlameCone(0.11, 0.42, 26316, 0.22);
      pivot.add(flameHalo);
      recoilPivot.add(pivot);
      verniers.push({ pivot, flameCore, flameMid, flameHalo, rimGlow, baseRotX, baseRotZ });
    });
    const tail = new THREE.Group();
    tail.position.set(0, -0.1, 0.55);
    recoilPivot.add(tail);
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.04, 0.1 - i * 0.012), 6, 4),
        furMat
      );
      const a = i / 5 * 1.4;
      seg.position.set(0, Math.sin(a) * 0.28 * i * 0.4, i * 0.16);
      tail.add(seg);
    }
    const muzzleVulcan = new THREE.Group();
    muzzleVulcan.position.set(0, -0.48, -1.22);
    armR.add(muzzleVulcan);
    const muzzleBeam = new THREE.Group();
    muzzleBeam.position.set(0, -0.48, -1.36);
    armL.add(muzzleBeam);
    const muzzleSword = new THREE.Group();
    muzzleSword.position.set(0, -0.48, -1.22);
    armR.add(muzzleSword);
    const muzzleMissileL = new THREE.Group();
    muzzleMissileL.position.set(-0.72, 0.44, -0.6);
    recoilPivot.add(muzzleMissileL);
    const muzzleMissileR = new THREE.Group();
    muzzleMissileR.position.set(0.72, 0.44, -0.6);
    recoilPivot.add(muzzleMissileR);
    const muzzleMissile = muzzleMissileL;
    const swordBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.06, 1.4),
      new THREE.MeshBasicMaterial({ color: 65535, transparent: true, opacity: 0.85 })
    );
    swordBlade.position.set(0.72, 0, -0.85);
    swordBlade.visible = false;
    recoilPivot.add(swordBlade);
    const stripeGeo = new THREE.BoxGeometry(1.08, 0.07, 0.1);
    [0.32, -0.32].forEach((y) => {
      const s = new THREE.Mesh(stripeGeo, accentMat);
      s.position.set(0, y, -0.1);
      recoilPivot.add(s);
    });
    return {
      root,
      recoilPivot,
      jetL,
      jetR,
      cockpit,
      swordBlade,
      tail,
      armL,
      armR,
      headGroup,
      verniers,
      muzzleVulcan,
      muzzleMissile,
      muzzleMissileL,
      muzzleMissileR,
      muzzleBeam,
      muzzleSword
    };
  }
  let _missileAlternate = false;
  function getMuzzlePosition(ship, type) {
    const target = new THREE.Vector3();
    switch (type) {
      case "missile":
        _missileAlternate = !_missileAlternate;
        (_missileAlternate ? ship.muzzleMissileL : ship.muzzleMissileR).getWorldPosition(target);
        break;
      case "beam":
        ship.muzzleBeam.getWorldPosition(target);
        break;
      case "sword":
        ship.muzzleSword.getWorldPosition(target);
        break;
      default:
        ship.muzzleVulcan.getWorldPosition(target);
        break;
    }
    return target;
  }
  function animatePlayerShip(ship, t) {
    ship.recoilPivot.quaternion.identity();
    ship.recoilPivot.rotateZ(Math.sin(t * 2.1) * 0.04);
    ship.recoilPivot.rotateX(Math.sin(t * 1.3) * 0.025);
    ship.tail.rotation.x = Math.sin(t * 3.5) * 0.25;
    ship.tail.rotation.z = Math.sin(t * 2.8) * 0.12;
    ship.armL.rotation.x = Math.sin(t * 1.8) * 0.06;
    ship.armR.rotation.x = Math.sin(t * 1.8 + 0.5) * 0.06;
  }
  function generateRail(stageIndex) {
    const baseLen = 80 + stageIndex * 20;
    const numPoints = 8 + Math.floor(Math.random() * 4);
    const points = [];
    points.push(new THREE.Vector3(0, 0, 0));
    let x = 0, y = 0;
    for (let i = 1; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      const z = -t * baseLen;
      const spread = 3 + Math.random() * 4;
      x += (Math.random() - 0.5) * spread;
      y += (Math.random() - 0.5) * spread * 0.5;
      x = Math.max(-12, Math.min(12, x));
      y = Math.max(-5, Math.min(5, y));
      points.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5);
    return { curve, length: baseLen };
  }
  function buildSnakeShip(boss) {
    const root = new THREE.Group();
    const col = boss ? COLORS.bossColor : COLORS.snakeColor;
    const scaleCol = boss ? 8921634 : 2263091;
    const weakPoints = [];
    const snakeSegs = [];
    const segCount = boss ? 6 : 4;
    for (let i = 0; i < segCount; i++) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, i * 0.38);
      const r = 0.22 - i * 0.018;
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.08, r), 8, 6),
        createFlatMaterial(col)
      );
      seg.scale.set(1, 0.8, 1.15);
      seg.castShadow = true;
      pivot.add(seg);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.max(0.07, r * 0.88), 0.025, 4, 10),
        createFlatMaterial(scaleCol)
      );
      ring.rotation.x = Math.PI / 2;
      pivot.add(ring);
      root.add(pivot);
      snakeSegs.push(pivot);
    }
    const frillGroup = new THREE.Group();
    frillGroup.position.set(0, 0, -0.05);
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2;
      const spine = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.28, 3),
        createFlatMaterial(scaleCol)
      );
      spine.position.set(Math.cos(angle) * 0.28, Math.sin(angle) * 0.28, 0);
      spine.rotation.z = angle + Math.PI / 2;
      frillGroup.add(spine);
    }
    root.add(frillGroup);
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0, -0.55);
    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 6),
      createFlatMaterial(boss ? 10031377 : 1738803)
    );
    skull.scale.set(1.3, 0.65, 1.1);
    skull.castShadow = true;
    headGroup.add(skull);
    const snout = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.12, 0.28),
      createFlatMaterial(boss ? 8917265 : 2254370)
    );
    snout.position.set(0, -0.05, -0.28);
    headGroup.add(snout);
    const eyeGeo = new THREE.SphereGeometry(0.055, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: boss ? 16729088 : 16776960 });
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.2, 0.06, -0.1);
      headGroup.add(eye);
    });
    const tongueL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 8e-3, 0.22, 4),
      createFlatMaterial(16720452)
    );
    tongueL.rotation.x = Math.PI / 2;
    tongueL.rotation.z = 0.25;
    tongueL.position.set(-0.06, -0.08, -0.5);
    headGroup.add(tongueL);
    const tongueR = tongueL.clone();
    tongueR.rotation.z = -0.25;
    tongueR.position.set(0.06, -0.08, -0.5);
    headGroup.add(tongueR);
    const headFin = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.22, 3),
      createFlatMaterial(scaleCol)
    );
    headFin.position.set(0, 0.28, -0.08);
    headGroup.add(headFin);
    root.add(headGroup);
    [0.18, 0.56].forEach((z) => {
      [-1, 1].forEach((side) => {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.04, 0.18),
          createFlatMaterial(scaleCol)
        );
        fin.position.set(side * 0.3, 0, z);
        fin.rotation.z = side * 0.35;
        root.add(fin);
      });
    });
    if (boss) {
      [-1, 1].forEach((side) => {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.06, 0.55),
          createFlatMaterial(scaleCol)
        );
        fin.position.set(side * 1.1, 0, -0.18);
        fin.rotation.z = side * 0.18;
        root.add(fin);
        const tip = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.05, 0.32),
          createFlatMaterial(col)
        );
        tip.position.set(side * 2.1, -0.06, -0.05);
        tip.rotation.z = side * 0.35;
        root.add(tip);
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, 0.6, 6),
          createFlatMaterial(4465186)
        );
        arm.rotation.x = Math.PI / 2;
        arm.position.set(side * 1.5, -0.1, -0.42);
        root.add(arm);
        const muzzle = new THREE.Mesh(
          new THREE.SphereGeometry(0.075, 6, 4),
          new THREE.MeshBasicMaterial({ color: 16729088 })
        );
        muzzle.position.set(side * 1.5, -0.1, -0.75);
        root.add(muzzle);
        const wp = new THREE.Mesh(
          new THREE.SphereGeometry(0.14, 8, 6),
          new THREE.MeshBasicMaterial({ color: COLORS.weakPoint })
        );
        wp.position.copy(muzzle.position);
        root.add(wp);
        weakPoints.push(wp);
      });
    }
    return { root, weakPoints, anim: { snakeSegs } };
  }
  function buildEagleShip(boss) {
    const root = new THREE.Group();
    const col = boss ? COLORS.bossColor : COLORS.eagleColor;
    const darkCol = boss ? 6689041 : 8934690;
    const weakPoints = [];
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 6),
      createFlatMaterial(col)
    );
    body.scale.set(0.9, 0.75, 1.4);
    body.castShadow = true;
    root.add(body);
    const breast = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 7, 5),
      createFlatMaterial(16777215)
    );
    breast.scale.set(0.85, 0.7, 0.7);
    breast.position.set(0, -0.08, -0.2);
    root.add(breast);
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.22, -0.42);
    root.add(headGroup);
    const headSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      createFlatMaterial(darkCol)
    );
    headSphere.scale.set(1, 1.05, 0.95);
    headGroup.add(headSphere);
    const beakTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.28),
      createFlatMaterial(14527010)
    );
    beakTop.position.set(0, -0.02, -0.26);
    beakTop.rotation.x = 0.25;
    headGroup.add(beakTop);
    const beakBot = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.06, 0.18),
      createFlatMaterial(13412915)
    );
    beakBot.position.set(0, -0.1, -0.24);
    headGroup.add(beakBot);
    const eyeGeo = new THREE.SphereGeometry(0.055, 6, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: boss ? 16724736 : 16772608 });
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.12, 0.04, -0.17);
      headGroup.add(eye);
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.04, 0.06),
        createFlatMaterial(darkCol)
      );
      brow.position.set(side * 0.12, 0.1, -0.18);
      headGroup.add(brow);
    });
    [0, -0.08, 0.08].forEach((x, i) => {
      const feather = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.18, 3),
        createFlatMaterial(darkCol)
      );
      feather.position.set(x, 0.22 - i * 0.02, 0);
      headGroup.add(feather);
    });
    const wingSpan = boss ? 2.8 : 1;
    function makeWing(side, span, yOff, zOff, sweepZ) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.3, yOff, zOff);
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(span, 0.07, 0.5),
        createFlatMaterial(col)
      );
      upper.position.set(side * span * 0.5, 0, sweepZ);
      upper.rotation.z = side * -0.12;
      pivot.add(upper);
      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(span * 0.32, 0.055, 0.32),
        createFlatMaterial(darkCol)
      );
      tip.position.set(side * (span + span * 0.16), -0.05, sweepZ + 0.1);
      tip.rotation.z = side * -0.32;
      pivot.add(tip);
      const fCount = boss ? 5 : 3;
      for (let f = 0; f < fCount; f++) {
        const feather = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.04, span * 0.16),
          createFlatMaterial(darkCol)
        );
        feather.position.set(
          side * (0.3 + f * span * 0.18),
          0,
          sweepZ + 0.3 - f * 0.04
        );
        pivot.add(feather);
      }
      root.add(pivot);
      return pivot;
    }
    const wingL = makeWing(-1, wingSpan, 0, 0, -0.05);
    const wingR = makeWing(1, wingSpan, 0, 0, -0.05);
    if (boss) {
      makeWing(-1, wingSpan * 0.55, 0.25, 0.3, 0.1);
      makeWing(1, wingSpan * 0.55, 0.25, 0.3, 0.1);
      [-1, 1].forEach((side) => {
        const pod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.16, 0.55, 7),
          createFlatMaterial(4460817)
        );
        pod.rotation.x = Math.PI / 2;
        pod.position.set(side * 0.7, -0.1, -0.15);
        root.add(pod);
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, 0.45, 6),
          createFlatMaterial(2228224)
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(side * 0.7, -0.1, -0.46);
        root.add(barrel);
        const muzzle = new THREE.Mesh(
          new THREE.SphereGeometry(0.065, 6, 4),
          new THREE.MeshBasicMaterial({ color: 16729088 })
        );
        muzzle.position.set(side * 0.7, -0.1, -0.7);
        root.add(muzzle);
      });
    }
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0, 0.45);
    const tailCount = boss ? 7 : 5;
    for (let i = -(tailCount >> 1); i <= tailCount >> 1; i++) {
      const feather = new THREE.Mesh(
        new THREE.BoxGeometry(boss ? 0.1 : 0.07, 0.04, boss ? 0.55 : 0.35),
        createFlatMaterial(i === 0 ? col : darkCol)
      );
      feather.position.set(i * (boss ? 0.14 : 0.09), 0, 0.12);
      feather.rotation.y = i * (boss ? 0.22 : 0.18);
      tailGroup.add(feather);
    }
    root.add(tailGroup);
    [-1, 1].forEach((side) => {
      const xOff = boss ? side * 0.5 : side * 0.18;
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.03, boss ? 0.35 : 0.22, 5),
        createFlatMaterial(14527010)
      );
      leg.rotation.x = 0.8;
      leg.rotation.z = side * 0.3;
      leg.position.set(xOff, -0.28, 0.15);
      root.add(leg);
      for (let t = -1; t <= 1; t++) {
        const talon = new THREE.Mesh(
          new THREE.ConeGeometry(0.025, 0.1, 4),
          createFlatMaterial(12298803)
        );
        talon.rotation.x = Math.PI / 2;
        talon.position.set(xOff + t * 0.06, -0.42, 0.28);
        root.add(talon);
      }
    });
    if (boss) {
      const wpGeo = new THREE.SphereGeometry(0.18, 8, 6);
      const wpMat = new THREE.MeshBasicMaterial({ color: COLORS.weakPoint });
      [-0.7, 0.7].forEach((x) => {
        const wp = new THREE.Mesh(wpGeo, wpMat.clone());
        wp.position.set(x, -0.1, -0.7);
        root.add(wp);
        weakPoints.push(wp);
      });
    }
    return { root, weakPoints, anim: { wingL, wingR } };
  }
  function buildLeopardShip(boss) {
    const root = new THREE.Group();
    const col = boss ? COLORS.bossColor : COLORS.leopardColor;
    const spotCol = 3346688;
    const weakPoints = [];
    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(boss ? 0.55 : 0.38, 9, 7),
      createFlatMaterial(col)
    );
    hull.scale.set(1, 0.7, 1.6);
    hull.castShadow = true;
    root.add(hull);
    [-1, 1].forEach((side) => {
      const hump = new THREE.Mesh(
        new THREE.SphereGeometry(boss ? 0.3 : 0.2, 7, 5),
        createFlatMaterial(col)
      );
      hump.scale.set(1, 0.65, 0.9);
      hump.position.set(side * (boss ? 0.42 : 0.3), boss ? 0.15 : 0.1, -0.2);
      root.add(hump);
    });
    const leopardHead = new THREE.Group();
    leopardHead.position.set(0, boss ? 0.22 : 0.16, boss ? -0.72 : -0.52);
    root.add(leopardHead);
    const headSphere = new THREE.Mesh(
      new THREE.SphereGeometry(boss ? 0.28 : 0.2, 8, 6),
      createFlatMaterial(boss ? 8917265 : 11162897)
    );
    headSphere.scale.set(1.1, 0.9, 0.95);
    leopardHead.add(headSphere);
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(
        new THREE.ConeGeometry(0.075, 0.18, 4),
        createFlatMaterial(col)
      );
      ear.position.set(side * 0.14, 0.2, -0.04);
      ear.rotation.z = side * -0.25;
      leopardHead.add(ear);
      const innerEar = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.1, 4),
        createFlatMaterial(16750950)
      );
      innerEar.position.set(side * 0.14, 0.21, -0.03);
      innerEar.rotation.z = side * -0.25;
      leopardHead.add(innerEar);
    });
    const snout = new THREE.Mesh(
      new THREE.SphereGeometry(boss ? 0.14 : 0.1, 6, 5),
      createFlatMaterial(14527112)
    );
    snout.scale.set(1.1, 0.7, 0.9);
    snout.position.set(0, -0.06, -0.2);
    leopardHead.add(snout);
    const catEyeMat = new THREE.MeshBasicMaterial({ color: boss ? 16729088 : 4521864 });
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 4), catEyeMat);
      eye.position.set(side * 0.1, 0.05, -0.19);
      leopardHead.add(eye);
      const pupil = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.07, 0.015),
        new THREE.MeshBasicMaterial({ color: 0 })
      );
      pupil.position.set(side * 0.1, 0.05, -0.2);
      leopardHead.add(pupil);
    });
    [-1, 1].forEach((side) => {
      for (let w = 0; w < 2; w++) {
        const whisker = new THREE.Mesh(
          new THREE.CylinderGeometry(8e-3, 3e-3, 0.28, 4),
          createFlatMaterial(16777215)
        );
        whisker.rotation.z = Math.PI / 2;
        whisker.rotation.x = (w - 0.5) * 0.25;
        whisker.position.set(side * 0.22, -0.04 + w * 0.04, -0.2);
        leopardHead.add(whisker);
      }
    });
    const spotPositions = [
      [-0.2, 0.24, 0.05],
      [0.2, 0.24, 0.05],
      [0, 0.26, -0.28],
      [-0.15, 0.22, 0.3],
      [0.15, 0.22, 0.3]
    ];
    spotPositions.forEach(([x, y, z]) => {
      const spot = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 5, 4),
        createFlatMaterial(spotCol)
      );
      spot.scale.setScalar(boss ? 1.4 : 1);
      spot.position.set(x, y, z);
      root.add(spot);
    });
    const legOffsets = [
      [-0.35, -0.28, -0.25],
      [0.35, -0.28, -0.25],
      [-0.3, -0.28, 0.3],
      [0.3, -0.28, 0.3]
    ];
    legOffsets.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.07, 0.32, 6),
        createFlatMaterial(4478310)
      );
      leg.rotation.x = 0.35;
      leg.position.set(x * (boss ? 1.35 : 1), y, z);
      root.add(leg);
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.09, 0.1, 7),
        createFlatMaterial(3359829)
      );
      nozzle.rotation.x = 0.35;
      nozzle.position.set(x * (boss ? 1.35 : 1), y - 0.18, z + 0.12);
      root.add(nozzle);
    });
    const leopardTail = new THREE.Group();
    leopardTail.position.set(0, 0, 0.62);
    root.add(leopardTail);
    const tailSegCount = 5;
    for (let i = 0; i < tailSegCount; i++) {
      const r = 0.08 - i * 0.01;
      const seg = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.035, r), 6, 4),
        createFlatMaterial(i % 2 === 0 ? col : spotCol)
      );
      seg.position.set(0, Math.sin(i / tailSegCount * 1.2) * 0.2, i * 0.14);
      leopardTail.add(seg);
    }
    const tuft = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 4),
      createFlatMaterial(col)
    );
    tuft.position.set(0, 0.22, 0.72);
    leopardTail.add(tuft);
    if (boss) {
      [-1, 1].forEach((side) => {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 0.07, 0.5),
          createFlatMaterial(col)
        );
        blade.position.set(side * 1.1, 0.05, -0.1);
        blade.rotation.z = side * 0.14;
        root.add(blade);
        const outer = new THREE.Mesh(
          new THREE.BoxGeometry(0.7, 0.06, 0.35),
          createFlatMaterial(spotCol)
        );
        outer.position.set(side * 2.1, -0.04, 0.1);
        outer.rotation.z = side * 0.32;
        root.add(outer);
        for (let c = 0; c < 3; c++) {
          const claw = new THREE.Mesh(
            new THREE.ConeGeometry(0.04, 0.22, 4),
            createFlatMaterial(2228224)
          );
          claw.rotation.z = side * (Math.PI / 2);
          claw.position.set(side * (2.4 + c * 0.01), -0.04 - c * 0.06, 0.05 + c * 0.1);
          root.add(claw);
        }
        const thruster = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.12, 0.4, 7),
          createFlatMaterial(3359829)
        );
        thruster.rotation.x = 0.3;
        thruster.position.set(side * 0.85, -0.22, 0.35);
        root.add(thruster);
        const nozzle = new THREE.Mesh(
          new THREE.SphereGeometry(0.095, 6, 4),
          new THREE.MeshBasicMaterial({ color: 16737792 })
        );
        nozzle.position.set(side * 0.85, -0.3, 0.58);
        root.add(nozzle);
      });
      const wp = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: COLORS.weakPoint })
      );
      wp.position.set(0, 0.05, -0.22);
      leopardHead.add(wp);
      weakPoints.push(wp);
      const wp2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 0.1, 8),
        new THREE.MeshBasicMaterial({ color: COLORS.weakPoint })
      );
      wp2.position.set(0, -0.18, 0.72);
      root.add(wp2);
      weakPoints.push(wp2);
    }
    return { root, weakPoints, anim: { leopardTail, leopardHead } };
  }
  function createEnemy(type, spawnT, offsetX, offsetY, stageIndex = 0) {
    const isBoss = type.startsWith("boss_");
    let built;
    if (type === "snake" || type === "boss_snake") {
      built = buildSnakeShip(isBoss);
    } else if (type === "eagle" || type === "boss_eagle") {
      built = buildEagleShip(isBoss);
    } else {
      built = buildLeopardShip(isBoss);
    }
    const stageScale = Math.pow(1.45, stageIndex);
    const baseHp = isBoss ? 3e3 : type === "leopard" ? 45 : type === "eagle" ? 30 : 22;
    const hp = Math.round(baseHp * stageScale);
    const PATTERNS = ["h", "v", "circle", "poly"];
    const motionPattern = isBoss ? "circle" : PATTERNS[Math.floor(spawnT * 137.508 % 1 * PATTERNS.length)];
    const motionPhase = spawnT * 6.283 % (Math.PI * 2);
    const motionAmp = isBoss ? 1.4 : type === "snake" ? 1 : type === "eagle" ? 0.8 : 0.6;
    const shakeGroup = new THREE.Group();
    const outerRoot = new THREE.Group();
    shakeGroup.add(built.root);
    outerRoot.add(shakeGroup);
    const chargeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 7, 5),
      new THREE.MeshBasicMaterial({ color: 16720384, transparent: true, opacity: 0 })
    );
    chargeMesh.visible = false;
    shakeGroup.add(chargeMesh);
    const chargeMax = isBoss ? 0.7 : 0.9;
    return {
      root: outerRoot,
      shakeGroup,
      weakPoints: built.weakPoints,
      anim: built.anim,
      hp,
      maxHp: hp,
      type,
      isBoss,
      spawnT,
      offsetX,
      offsetY,
      age: 0,
      shootCooldown: 0,
      hasEnteredRange: false,
      dead: false,
      scaleProgress: 0,
      flyIn: "pending",
      flyInTimer: 0,
      flyInDuration: 1.2,
      flyInOrigin: null,
      inScene: false,
      motionPattern,
      motionPhase,
      motionAmp,
      chargeMesh,
      chargeTimer: 0,
      chargeMax,
      shakeTimer: 0,
      shakeMax: 0.28
    };
  }
  function getEnemyMeshes(enemy) {
    const meshes = [];
    enemy.root.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
    return meshes;
  }
  function animateEnemy(enemy, t) {
    const { anim } = enemy;
    if (anim.snakeSegs) {
      anim.snakeSegs.forEach((seg, i) => {
        seg.rotation.y = Math.sin(t * 2.5 + i * 0.9) * 0.28;
        seg.rotation.x = Math.sin(t * 1.8 + i * 0.7) * 0.12;
      });
    }
    if (anim.wingL && anim.wingR) {
      const flap = Math.sin(t * 3.5) * 0.32;
      anim.wingL.rotation.z = flap;
      anim.wingR.rotation.z = -flap;
      enemy.root.rotation.z = Math.sin(t * 3.5) * 0.06;
    }
    if (anim.leopardTail) {
      anim.leopardTail.rotation.x = Math.sin(t * 2.2) * 0.3;
      anim.leopardTail.rotation.z = Math.sin(t * 1.8 + 1) * 0.2;
    }
    if (anim.leopardHead) {
      anim.leopardHead.rotation.x = Math.sin(t * 1.4) * 0.08;
      anim.leopardHead.rotation.z = Math.sin(t * 1.1) * 0.05;
    }
  }
  let _healthGeo = null;
  let _orbGeo = null;
  function buildHealthPickup() {
    const root = new THREE.Group();
    if (!_healthGeo) _healthGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const crossH = new THREE.Mesh(
      _healthGeo,
      new THREE.MeshBasicMaterial({ color: COLORS.healthPickup })
    );
    root.add(crossH);
    const barH = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.12, 0.45),
      new THREE.MeshBasicMaterial({ color: 16777215 })
    );
    root.add(barH);
    const barV = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.38, 0.45),
      new THREE.MeshBasicMaterial({ color: 16777215 })
    );
    root.add(barV);
    return root;
  }
  function buildWeaponPickup(kind) {
    const root = new THREE.Group();
    if (!_orbGeo) _orbGeo = new THREE.IcosahedronGeometry(0.25, 1);
    const color = kind === "vulcan" ? 43775 : kind === "missile" ? COLORS.playerMissile : kind === "beam" ? COLORS.playerBeam : 65484;
    const orb = new THREE.Mesh(
      _orbGeo,
      new THREE.MeshBasicMaterial({ color, wireframe: false })
    );
    root.add(orb);
    const ringGeo = new THREE.TorusGeometry(0.38, 0.04, 6, 16);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: COLORS.weaponPickup })
    );
    root.add(ring);
    return root;
  }
  function createPickup(kind, spawnT, offsetX, offsetY) {
    const root = kind === "health" ? buildHealthPickup() : buildWeaponPickup(kind);
    return {
      root,
      kind,
      position: new THREE.Vector3(0, 0, 0),
      spawnT,
      offsetX,
      offsetY,
      age: 0,
      dead: false,
      scaleProgress: 0,
      magnetOffset: new THREE.Vector3(0, 0, 0)
    };
  }
  const MAGNET_RADIUS = 7;
  const MAGNET_SPEED = 5.5;
  function updatePickupMagnet(pickup, playerPos, dt) {
    const toPlayer = new THREE.Vector3().subVectors(playerPos, pickup.root.position);
    const dist = toPlayer.length();
    if (dist < 0.01 || dist > MAGNET_RADIUS) return;
    const strength = Math.min(1, (MAGNET_RADIUS - dist) / MAGNET_RADIUS);
    toPlayer.normalize().multiplyScalar(MAGNET_SPEED * strength * dt);
    pickup.magnetOffset.add(toPlayer);
  }
  function animatePickup(pickup, dt) {
    pickup.age += dt;
    pickup.root.rotation.y += dt * 1.5;
    pickup.root.position.y = pickup.position.y + pickup.magnetOffset.y + Math.sin(pickup.age * 2.5) * 0.15;
  }
  function asteroid(size, color) {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(size, 0),
      createFlatMaterial(color)
    );
    m.castShadow = true;
    m.scale.set(0.7 + Math.random() * 0.6, 0.7 + Math.random() * 0.6, 0.7 + Math.random() * 0.6);
    return m;
  }
  function crystal(size, color) {
    const m = new THREE.Mesh(
      new THREE.OctahedronGeometry(size * 0.9, 0),
      createFlatMaterial(color)
    );
    m.castShadow = true;
    m.scale.set(0.55 + Math.random() * 0.4, 1.4 + Math.random() * 0.8, 0.55 + Math.random() * 0.4);
    return m;
  }
  function cube(size, color) {
    const s = size * (0.8 + Math.random() * 0.4);
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      createFlatMaterial(color)
    );
    m.castShadow = true;
    m.rotation.set(Math.random(), Math.random(), Math.random());
    return m;
  }
  function cylinder(size, color) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.3, size * 0.5, size * 2.2, 7),
      createFlatMaterial(color)
    );
    m.castShadow = true;
    m.rotation.set(Math.random() * Math.PI, 0, Math.random() * Math.PI);
    return m;
  }
  function torus(size, color) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(size * 0.7, size * 0.22, 6, 10),
      createFlatMaterial(color)
    );
    m.castShadow = true;
    m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    return m;
  }
  function spire(size, color) {
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(size * 0.28, size * 2.5, 5),
      createFlatMaterial(color)
    );
    m.castShadow = true;
    m.rotation.set(Math.random() * 0.4 - 0.2, Math.random() * Math.PI, Math.random() * 0.4 - 0.2);
    return m;
  }
  function banana(size) {
    const g = new THREE.TorusGeometry(size * 0.55, size * 0.18, 6, 12, Math.PI * 1.1);
    const m = new THREE.Mesh(g, createFlatMaterial(16772642));
    m.rotation.z = Math.PI * 0.55;
    m.castShadow = true;
    return m;
  }
  function apple(size) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.55, 8, 7),
      createFlatMaterial(14492194)
    );
    m.scale.set(1, 1.1, 0.95);
    m.castShadow = true;
    return m;
  }
  function watermelon(size) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.6, 8, 6),
      createFlatMaterial(2263091)
    );
    m.scale.set(1.3, 1, 1);
    m.castShadow = true;
    return m;
  }
  function orange(size) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.52, 8, 7),
      createFlatMaterial(16746496)
    );
    m.castShadow = true;
    return m;
  }
  function mango(size) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.5, 8, 7),
      createFlatMaterial(16755200)
    );
    m.scale.set(0.8, 1.25, 0.9);
    m.castShadow = true;
    return m;
  }
  function grape(size) {
    const root = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.38, 7, 6),
      createFlatMaterial(8926156)
    );
    root.castShadow = true;
    return root;
  }
  function pineapple(size) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(size * 0.3, size * 0.35, size * 1.1, 7),
      createFlatMaterial(14527010)
    );
    m.castShadow = true;
    return m;
  }
  function coconut(size) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.5, 7, 6),
      createFlatMaterial(8939059)
    );
    m.scale.set(0.95, 1.05, 1);
    m.castShadow = true;
    return m;
  }
  function kiwi(size) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size * 0.45, 7, 6),
      createFlatMaterial(5601058)
    );
    m.scale.set(0.9, 1.2, 0.9);
    m.castShadow = true;
    return m;
  }
  function starfruit(size) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(size * 0.45, size * 0.2, 5, 5),
      createFlatMaterial(15658564)
    );
    m.castShadow = true;
    return m;
  }
  const WORLD_THEMES = [
    // 0 – Deep Space (default)
    {
      name: "Deep Space",
      skyColor: 463406,
      fogDensity: 0.026,
      starColor: 16777215,
      starOpacity: 0.85,
      hemisphereSky: 4482764,
      hemisphereGround: 2241365,
      enemyTints: { snake: null, eagle: null, leopard: null },
      buildObstacle: (s) => asteroid(s, 5596791),
      buildFruit: (s) => banana(s)
    },
    // 1 – Crimson Nebula
    {
      name: "Crimson Nebula",
      skyColor: 4852244,
      fogDensity: 0.024,
      starColor: 16751274,
      starOpacity: 0.9,
      hemisphereSky: 13382485,
      hemisphereGround: 5570577,
      enemyTints: { snake: 13378082, eagle: 14500898, leopard: 11145523 },
      buildObstacle: (s) => asteroid(s, 11154244),
      buildFruit: (s) => apple(s)
    },
    // 2 – Toxic Cloud
    {
      name: "Toxic Cloud",
      skyColor: 863764,
      fogDensity: 0.03,
      starColor: 10092475,
      starOpacity: 0.8,
      hemisphereSky: 3368499,
      hemisphereGround: 1122833,
      enemyTints: { snake: 2280516, eagle: 4504354, leopard: 8965120 },
      buildObstacle: (s) => crystal(s, 4508774),
      buildFruit: (s) => watermelon(s)
    },
    // 3 – Ice Field
    {
      name: "Ice Field",
      skyColor: 860740,
      fogDensity: 0.02,
      starColor: 12312063,
      starOpacity: 0.95,
      hemisphereSky: 5609932,
      hemisphereGround: 2241365,
      enemyTints: { snake: 4500172, eagle: 6732765, leopard: 2263210 },
      buildObstacle: (s) => crystal(s, 8965358),
      buildFruit: (s) => kiwi(s)
    },
    // 4 – Volcanic Belt
    {
      name: "Volcanic Belt",
      skyColor: 4002304,
      fogDensity: 0.032,
      starColor: 16764006,
      starOpacity: 0.75,
      hemisphereSky: 11154176,
      hemisphereGround: 4460800,
      enemyTints: { snake: 14500864, eagle: 16737792, leopard: 13382400 },
      buildObstacle: (s) => cube(s, 13386752),
      buildFruit: (s) => mango(s)
    },
    // 5 – Neon Grid
    {
      name: "Neon Grid",
      skyColor: 3374,
      fogDensity: 0.018,
      starColor: 4521983,
      starOpacity: 0.85,
      hemisphereSky: 21964,
      hemisphereGround: 2099,
      enemyTints: { snake: 65450, eagle: 52479, leopard: 8913151 },
      buildObstacle: (s) => cube(s, 39423),
      buildFruit: (s) => starfruit(s)
    },
    // 6 – Gravity Ruins
    {
      name: "Gravity Ruins",
      skyColor: 1708083,
      fogDensity: 0.028,
      starColor: 14531583,
      starOpacity: 0.88,
      hemisphereSky: 6697898,
      hemisphereGround: 2228275,
      enemyTints: { snake: 8926156, eagle: 11158783, leopard: 6693529 },
      buildObstacle: (s) => torus(s, 8926156),
      buildFruit: (s) => grape(s)
    },
    // 7 – Sand Storm
    {
      name: "Sand Storm",
      skyColor: 4007936,
      fogDensity: 0.036,
      starColor: 16768409,
      starOpacity: 0.65,
      hemisphereSky: 11175987,
      hemisphereGround: 5583616,
      enemyTints: { snake: 13408563, eagle: 14527044, leopard: 12285730 },
      buildObstacle: (s) => spire(s, 12294468),
      buildFruit: (s) => coconut(s)
    },
    // 8 – Frozen Core
    {
      name: "Frozen Core",
      skyColor: 269870,
      fogDensity: 0.022,
      starColor: 13434879,
      starOpacity: 0.9,
      hemisphereSky: 34986,
      hemisphereGround: 13124,
      enemyTints: { snake: 48076, eagle: 4513262, leopard: 39338 },
      buildObstacle: (s) => cylinder(s, 4504524),
      buildFruit: (s) => orange(s)
    },
    // 9 – Void Rift
    {
      name: "Void Rift",
      skyColor: 1703962,
      fogDensity: 0.024,
      starColor: 16738047,
      starOpacity: 0.95,
      hemisphereSky: 6684774,
      hemisphereGround: 2228258,
      enemyTints: { snake: 16711850, eagle: 13369480, leopard: 8912998 },
      buildObstacle: (s) => torus(s, 13369497),
      buildFruit: (s) => pineapple(s)
    }
  ];
  function getTheme(stageIndex) {
    return WORLD_THEMES[stageIndex % WORLD_THEMES.length];
  }
  const ENEMY_TYPES = ["snake", "eagle", "leopard"];
  const PICKUP_KINDS = ["health", "vulcan", "missile", "beam", "sword"];
  function generateStage(index) {
    const rail = generateRail(index);
    const themeIndex = Math.floor(Math.random() * WORLD_THEMES.length);
    const theme = WORLD_THEMES[themeIndex];
    const enemies = [];
    const pickups = [];
    const obstacles = [];
    const enemyCount = 6 + index * 2;
    const ENEMY_MIN_T = 0.25;
    const ENEMY_MAX_T = 0.83;
    for (let i = 0; i < enemyCount; i++) {
      const t = ENEMY_MIN_T + Math.random() * Math.max(0, ENEMY_MAX_T - ENEMY_MIN_T);
      const type = ENEMY_TYPES[Math.floor(Math.random() * 3)];
      const ox = (Math.random() - 0.5) * 5;
      const oy = (Math.random() - 0.5) * 2.5;
      enemies.push(createEnemy(type, t, ox, oy, index));
    }
    const pickupCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < pickupCount; i++) {
      const t = 0.1 + Math.random() * 0.75;
      const kind = PICKUP_KINDS[Math.floor(Math.random() * PICKUP_KINDS.length)];
      const actualKind = i === 0 ? "health" : kind;
      const ox = (Math.random() - 0.5) * 4;
      const oy = (Math.random() - 0.5) * 2;
      pickups.push(createPickup(actualKind, t, ox, oy));
    }
    const obsCount = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < obsCount; i++) {
      const t = ENEMY_MIN_T + Math.random() * Math.max(0, 0.85 - ENEMY_MIN_T);
      const ox = (Math.random() - 0.5) * 6;
      const oy = (Math.random() - 0.5) * 3;
      const size = 0.3 + Math.random() * 0.5;
      const mesh = theme.buildObstacle(size);
      const obsStageScale = Math.pow(1.45, index);
      const hp = Math.round((30 + size * 60) * obsStageScale);
      obstacles.push({ root: mesh, spawnT: t, offsetX: ox, offsetY: oy, hp, maxHp: hp, dead: false, scaleProgress: 0 });
    }
    const fruitCount = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < fruitCount; i++) {
      const t = ENEMY_MIN_T + Math.random() * Math.max(0, 0.85 - ENEMY_MIN_T);
      const ox = (Math.random() - 0.5) * 6;
      const oy = (Math.random() - 0.5) * 3;
      const size = 0.25 + Math.random() * 0.3;
      const mesh = theme.buildFruit(size);
      const obsStageScale = Math.pow(1.45, index);
      const hp = Math.round((20 + size * 40) * obsStageScale);
      obstacles.push({ root: mesh, spawnT: t, offsetX: ox, offsetY: oy, hp, maxHp: hp, dead: false, scaleProgress: 0 });
    }
    const bossTypes = ["boss_snake", "boss_eagle", "boss_leopard"];
    const bossType = bossTypes[Math.floor(Math.random() * bossTypes.length)];
    const boss = createEnemy(bossType, 0.92, 0, 0, index);
    return { index, themeIndex, theme, rail, enemies, pickups, obstacles, boss, bossDefeated: false };
  }
  function createImpromptuEnemy(atRailT, stageIndex) {
    const types = ["snake", "eagle", "leopard"];
    const type = types[Math.floor(Math.random() * 3)];
    const ox = (Math.random() - 0.5) * 4;
    const oy = (Math.random() - 0.5) * 2;
    return createEnemy(type, atRailT, ox, oy, 0);
  }
  const STAGE_GAP = 4;
  function buildSegment(stage, prev) {
    let worldOrigin;
    let worldRotation;
    let startDist;
    if (!prev) {
      worldOrigin = new THREE.Vector3(0, 0, 0);
      worldRotation = new THREE.Quaternion();
      startDist = 0;
    } else {
      const localEnd = prev.rail.curve.getPointAt(1);
      const prevEndWorld = localEnd.clone().applyQuaternion(prev.worldRotation).add(prev.worldOrigin);
      const localTangent = prev.rail.curve.getTangentAt(0.999).normalize();
      const worldTangent = localTangent.clone().applyQuaternion(prev.worldRotation);
      worldOrigin = prevEndWorld.clone().addScaledVector(worldTangent, STAGE_GAP);
      const defaultForward = new THREE.Vector3(0, 0, -1);
      const fullDelta = new THREE.Quaternion().setFromUnitVectors(defaultForward, worldTangent);
      const MAX_JOINT_ANGLE = Math.PI / 5;
      const angle = 2 * Math.acos(Math.min(1, Math.abs(fullDelta.w)));
      if (angle > MAX_JOINT_ANGLE) {
        fullDelta.slerp(new THREE.Quaternion(), 1 - MAX_JOINT_ANGLE / angle);
      }
      worldRotation = prev.worldRotation.clone().multiply(fullDelta);
      startDist = prev.gapEndDist;
    }
    const endDist = startDist + stage.rail.length;
    const gapEndDist = endDist + STAGE_GAP;
    return {
      rail: stage.rail,
      stage,
      worldOrigin,
      worldRotation,
      startDist,
      endDist,
      gapEndDist
    };
  }
  function resolveWorldDist(track, worldDist2) {
    const clamped = Math.max(0, Math.min(track.totalDist, worldDist2));
    for (let i = 0; i < track.segments.length; i++) {
      const seg = track.segments[i];
      if (clamped <= seg.endDist) {
        const span = seg.endDist - seg.startDist;
        const localT = span > 0 ? Math.max(0, Math.min(1, (clamped - seg.startDist) / span)) : 0;
        return { seg, localT, gapT: null, nextSeg: null };
      }
      if (clamped <= seg.gapEndDist) {
        const gapT = (clamped - seg.endDist) / STAGE_GAP;
        const nextSeg = track.segments[i + 1] ?? null;
        return { seg, localT: 1, gapT, nextSeg };
      }
    }
    const last = track.segments[track.segments.length - 1];
    return { seg: last, localT: 1, gapT: null, nextSeg: null };
  }
  function segWorldPos(seg, localT) {
    const t = Math.max(0, Math.min(1, localT));
    return seg.rail.curve.getPointAt(t).applyQuaternion(seg.worldRotation).add(seg.worldOrigin);
  }
  function segWorldFwd(seg, localT) {
    const t = Math.max(1e-3, Math.min(0.999, localT));
    return seg.rail.curve.getTangentAt(t).normalize().applyQuaternion(seg.worldRotation);
  }
  function getWorldPosition(track, worldDist2) {
    const { seg, localT, gapT, nextSeg } = resolveWorldDist(track, worldDist2);
    if (gapT === null || nextSeg === null) {
      return segWorldPos(seg, localT);
    }
    const t = gapT * gapT * (3 - 2 * gapT);
    const posA = segWorldPos(seg, 1);
    const posB = segWorldPos(nextSeg, 0);
    return posA.lerp(posB, t);
  }
  function getWorldBasis(track, worldDist2) {
    const { seg, localT, gapT, nextSeg } = resolveWorldDist(track, worldDist2);
    let forward;
    if (gapT === null || nextSeg === null) {
      forward = segWorldFwd(seg, localT);
    } else {
      const t = gapT * gapT * (3 - 2 * gapT);
      const fwdA = segWorldFwd(seg, 1);
      const fwdB = segWorldFwd(nextSeg, 0);
      const qA = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwdA);
      const qB = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fwdB);
      const q = qA.slerp(qB, t);
      forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
    }
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    return { forward, right, up };
  }
  function getEntityWorldPosition(segment, spawnT, offsetX, offsetY) {
    const t = Math.max(0, Math.min(1, spawnT));
    const localPt = segment.rail.curve.getPointAt(t);
    const localFwd = segment.rail.curve.getTangentAt(Math.max(1e-3, Math.min(0.999, t))).normalize();
    const localRight = new THREE.Vector3().crossVectors(localFwd, new THREE.Vector3(0, 1, 0)).normalize();
    const localUp = new THREE.Vector3().crossVectors(localRight, localFwd).normalize();
    localPt.addScaledVector(localRight, offsetX);
    localPt.addScaledVector(localUp, offsetY);
    return localPt.applyQuaternion(segment.worldRotation).add(segment.worldOrigin);
  }
  function createInitialTrack(stage0, stage1) {
    const seg0 = buildSegment(stage0, null);
    const seg1 = buildSegment(stage1, seg0);
    return { segments: [seg0, seg1], totalDist: seg1.gapEndDist };
  }
  function appendStage(track, newStage) {
    const last = track.segments[track.segments.length - 1];
    const seg = buildSegment(newStage, last);
    track.segments.push(seg);
    track.totalDist = seg.gapEndDist;
    return seg;
  }
  function pruneOldSegments(track, worldDist2) {
    const KEEP_BEHIND = 5;
    const removed = [];
    while (track.segments.length > 1) {
      const oldest = track.segments[0];
      if (oldest.gapEndDist < worldDist2 - KEEP_BEHIND) {
        track.segments.shift();
        removed.push(oldest);
      } else {
        break;
      }
    }
    return removed;
  }
  function isInGap(track, worldDist2) {
    for (const seg of track.segments) {
      if (worldDist2 > seg.endDist && worldDist2 <= seg.gapEndDist) return true;
    }
    return false;
  }
  function resolveCurrentSegment(track, worldDist2) {
    for (const seg of track.segments) {
      if (worldDist2 <= seg.endDist) return seg;
    }
    return track.segments[track.segments.length - 1];
  }
  const MAX_WEAPON_LEVEL = 5;
  let _vulcanGeo = null;
  let _missileGeo = null;
  let _enemyShotGeo = null;
  function getVulcanGeo() {
    if (!_vulcanGeo) _vulcanGeo = new THREE.SphereGeometry(0.07, 4, 3);
    return _vulcanGeo;
  }
  function getMissileGeo() {
    if (!_missileGeo) _missileGeo = new THREE.CylinderGeometry(0.04, 0.09, 0.38, 5);
    return _missileGeo;
  }
  function getBeamGeo(level) {
    const thick = 0.05 + level * 0.04;
    const len = 1.2 + level * 0.6;
    return new THREE.BoxGeometry(thick, thick, len);
  }
  function getEnemyShotGeo() {
    if (!_enemyShotGeo) _enemyShotGeo = new THREE.SphereGeometry(0.12, 5, 4);
    return _enemyShotGeo;
  }
  function fireWeapon(weapon, origin, forward, damageMultiplier, nearestEnemy) {
    const shots = [];
    if (weapon.type === "vulcan") {
      const OFFSETS = [
        [0, 0],
        // always: center
        [0.22, 0],
        // lv2: right
        [-0.22, 0],
        // lv3: left
        [0, 0.18],
        // lv4: top
        [0, -0.18]
        // lv5: bottom
      ];
      const count = weapon.level;
      for (let i = 0; i < count; i++) {
        const [ox, oy] = OFFSETS[i];
        const dir = forward.clone();
        const mesh = new THREE.Mesh(
          getVulcanGeo(),
          new THREE.MeshBasicMaterial({ color: COLORS.playerShot })
        );
        mesh.position.copy(origin);
        mesh.position.x += ox;
        mesh.position.y += oy;
        shots.push({
          mesh,
          velocity: dir.clone().multiplyScalar(22),
          type: "vulcan",
          damage: (8 + weapon.level * 2) * damageMultiplier,
          lifetime: 1.2
        });
      }
    }
    if (weapon.type === "missile") {
      if (!nearestEnemy) return shots;
      const count = weapon.level;
      const spread = (weapon.level - 1) * 0.28;
      for (let i = 0; i < count; i++) {
        const angle = (i - (count - 1) / 2) * spread;
        const mesh = new THREE.Mesh(
          getMissileGeo(),
          new THREE.MeshBasicMaterial({ color: COLORS.playerMissile })
        );
        mesh.position.copy(origin);
        mesh.position.x += Math.sin(angle) * 0.45;
        const launchVel = new THREE.Vector3(
          Math.sin(angle) * 1.5,
          // spread
          3,
          // gentle upward kick (halved)
          forward.z * 3
          // gentle forward push
        );
        const initSpeed = 8;
        shots.push({
          mesh,
          velocity: launchVel.normalize().multiplyScalar(initSpeed),
          type: "missile",
          damage: (4 + weapon.level * 1) * damageMultiplier,
          lifetime: 2,
          launchTimer: 0.35,
          // 0.35s upward arc before homing kicks in
          missileSpeed: initSpeed,
          homing: nearestEnemy ? { ship: nearestEnemy, lastPos: nearestEnemy.root.position.clone() } : null
        });
      }
    }
    if (weapon.type === "beam") {
      const mesh = new THREE.Mesh(
        getBeamGeo(weapon.level),
        new THREE.MeshBasicMaterial({ color: COLORS.playerBeam, transparent: true, opacity: 0.9 })
      );
      mesh.position.copy(origin);
      const vel = forward.clone().multiplyScalar(55);
      shots.push({
        mesh,
        velocity: vel,
        type: "beam",
        damage: (30 + weapon.level * 10) * damageMultiplier,
        lifetime: 0.5,
        age: 0
      });
    }
    return shots;
  }
  function createSwordState(level) {
    return {
      active: true,
      swingCooldown: 0,
      swingTimer: 0,
      range: 1.2 + level * 0.2,
      damage: 25 + level * 8,
      attackRate: 1 + level * 0.1
    };
  }
  function spawnEnemyShot(origin, toward) {
    const mesh = new THREE.Mesh(
      getEnemyShotGeo(),
      new THREE.MeshBasicMaterial({ color: COLORS.enemyShot })
    );
    mesh.position.copy(origin);
    const vel = toward.clone().normalize().multiplyScalar(7);
    return { mesh, velocity: vel, type: "vulcan", damage: 18, lifetime: 3 };
  }
  function updateProjectile(proj, dt) {
    proj.lifetime -= dt;
    if (proj.lifetime <= 0) return false;
    if (proj.type === "missile") {
      if (proj.launchTimer !== void 0 && proj.launchTimer > 0) {
        proj.launchTimer -= dt;
      } else if (proj.homing) {
        const h = proj.homing;
        if (!h.ship.dead) h.lastPos.copy(h.ship.root.position);
        const toTarget = h.lastPos.clone().sub(proj.mesh.position);
        const dist = toTarget.length();
        if (h.ship.dead && dist < 1.5) {
          return false;
        } else if (dist > 0.1) {
          toTarget.divideScalar(dist);
          if (proj.missileSpeed !== void 0) {
            proj.missileSpeed = Math.min(proj.missileSpeed + 18 * dt, 22);
          }
          const speed = proj.missileSpeed ?? proj.velocity.length();
          const steer = 1 - Math.exp(-7 * dt);
          proj.velocity.lerp(toTarget.multiplyScalar(speed), steer);
        }
      }
      if (proj.velocity.lengthSq() > 0.01) {
        const dir = proj.velocity.clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        proj.mesh.quaternion.setFromUnitVectors(up, dir);
      }
    }
    proj.mesh.position.addScaledVector(proj.velocity, dt);
    if (proj.type === "beam") {
      proj.mesh.lookAt(proj.mesh.position.clone().add(proj.velocity));
      if (proj.age !== void 0) {
        proj.age += dt;
        const flash = Math.sin(proj.age * 110) > 0;
        const mat = proj.mesh.material;
        mat.color.setHex(flash ? 16777215 : COLORS.playerBeam);
      }
    }
    return true;
  }
  function makeCube(s, color) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshBasicMaterial({ color })
    );
    m.rotation.set(Math.random(), Math.random(), Math.random());
    return m;
  }
  function makeStar(r, color) {
    return new THREE.Mesh(
      new THREE.OctahedronGeometry(r, 0),
      new THREE.MeshBasicMaterial({ color })
    );
  }
  function makeSlash(color) {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.07, 0.07),
      new THREE.MeshBasicMaterial({ color })
    );
    blade.rotation.z = Math.PI / 4;
    g.add(blade);
    const blade2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.07, 0.07),
      new THREE.MeshBasicMaterial({ color })
    );
    blade2.rotation.z = -Math.PI / 4;
    g.add(blade2);
    return g;
  }
  function makeRing(color) {
    return new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.06, 5, 10),
      new THREE.MeshBasicMaterial({ color })
    );
  }
  const SNAKE_BOSS_CONFIG = {
    cooldownRange: [1.6, 2.4],
    shotOffsets: [[-1.4, 0], [0, 0.2], [1.4, 0]],
    // 3 shots: left, centre, right
    trailColor: 4521796,
    buildProjectile: () => makeCube(0.18, 2284868),
    speed: 8,
    damage: 14
  };
  const EAGLE_BOSS_CONFIG = {
    cooldownRange: [1.2, 1.9],
    shotOffsets: [[-0.65, 0.1], [0.65, 0.1]],
    // 2 shots from wing cannons
    trailColor: 16746496,
    buildProjectile: () => makeStar(0.2, 16737792),
    speed: 10,
    damage: 16
  };
  const LEOPARD_BOSS_CONFIG = {
    cooldownRange: [1.8, 2.6],
    shotOffsets: [[-1, 0.2], [0, 0], [1, 0.2]],
    // blades from claws + centre
    trailColor: 13387007,
    buildProjectile: () => Math.random() < 0.5 ? makeSlash(14492415) : makeRing(16729292),
    speed: 9,
    damage: 15
  };
  const BOSS_CONFIGS = {
    boss_snake: SNAKE_BOSS_CONFIG,
    boss_eagle: EAGLE_BOSS_CONFIG,
    boss_leopard: LEOPARD_BOSS_CONFIG
  };
  function getBossConfig(type) {
    return BOSS_CONFIGS[type] ?? SNAKE_BOSS_CONFIG;
  }
  function fireBossBurst(config, bossPos, bossRight, bossUp, toPlayer) {
    const dir = toPlayer.clone().normalize();
    const results = [];
    for (const [ox, oy] of config.shotOffsets) {
      const origin = bossPos.clone().addScaledVector(bossRight, ox).addScaledVector(bossUp, oy);
      const spread = new THREE.Vector3(
        dir.x + -ox * 0.04,
        dir.y + -oy * 0.04,
        dir.z
      ).normalize();
      const obj = config.buildProjectile();
      obj.position.copy(origin);
      const proj = {
        mesh: obj,
        velocity: spread.multiplyScalar(config.speed),
        type: "vulcan",
        damage: config.damage,
        lifetime: 3.5
      };
      results.push({ proj, trailColor: config.trailColor });
    }
    return results;
  }
  function createStarfield(count = 1200) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 16777215,
      size: 0.18,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8
    });
    const points = new THREE.Points(geo, mat);
    return { points };
  }
  function updateStarfield(sf, cameraPos) {
    sf.points.position.copy(cameraPos);
  }
  let _ctx = null;
  let _masterGain = null;
  let _masterComp = null;
  let _playing = false;
  let _curIdx = -1;
  let _curLoop = null;
  async function startAudio() {
    if (_ctx) return;
    _ctx = new AudioContext();
    if (_ctx.state === "suspended") await _ctx.resume();
    _masterComp = _ctx.createDynamicsCompressor();
    _masterComp.threshold.value = -10;
    _masterComp.knee.value = 8;
    _masterComp.ratio.value = 4;
    _masterComp.attack.value = 3e-3;
    _masterComp.release.value = 0.2;
    _masterComp.connect(_ctx.destination);
    _masterGain = _ctx.createGain();
    _masterGain.gain.value = 0.8;
    _masterGain.connect(_masterComp);
  }
  let _whiteBuf = null;
  let _pinkBuf = null;
  function getWhite() {
    if (_whiteBuf) return _whiteBuf;
    const sr = _ctx.sampleRate, len = sr * 2;
    _whiteBuf = _ctx.createBuffer(1, len, sr);
    const d = _whiteBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return _whiteBuf;
  }
  function getPink() {
    if (_pinkBuf) return _pinkBuf;
    const sr = _ctx.sampleRate, len = sr * 2;
    _pinkBuf = _ctx.createBuffer(1, len, sr);
    const d = _pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return _pinkBuf;
  }
  function hz(n) {
    const T = {
      "B0": 30.87,
      "C1": 32.7,
      "C#1": 34.65,
      "D1": 36.71,
      "Eb1": 38.89,
      "E1": 41.2,
      "F1": 43.65,
      "F#1": 46.25,
      "G1": 49,
      "Ab1": 51.91,
      "A1": 55,
      "Bb1": 58.27,
      "B1": 61.74,
      "C2": 65.41,
      "C#2": 69.3,
      "D2": 73.42,
      "Eb2": 77.78,
      "E2": 82.41,
      "F2": 87.31,
      "F#2": 92.5,
      "G2": 98,
      "Ab2": 103.8,
      "A2": 110,
      "Bb2": 116.5,
      "B2": 123.5,
      "C3": 130.8,
      "C#3": 138.6,
      "D3": 146.8,
      "Eb3": 155.6,
      "E3": 164.8,
      "F3": 174.6,
      "F#3": 185,
      "G3": 196,
      "Ab3": 207.7,
      "A3": 220,
      "Bb3": 233.1,
      "B3": 246.9,
      "C4": 261.6,
      "C#4": 277.2,
      "D4": 293.7,
      "Eb4": 311.1,
      "E4": 329.6,
      "F4": 349.2,
      "F#4": 370,
      "G4": 392,
      "Ab4": 415.3,
      "A4": 440,
      "Bb4": 466.2,
      "B4": 493.9,
      "C5": 523.3,
      "C#5": 554.4,
      "D5": 587.3,
      "Eb5": 622.3,
      "E5": 659.3,
      "F5": 698.5,
      "F#5": 740,
      "G5": 784,
      "Ab5": 830.6,
      "A5": 880,
      "Bb5": 932.3,
      "B5": 987.8,
      "C6": 1047,
      "D6": 1175,
      "E6": 1319,
      "G6": 1568
    };
    return T[n] ?? 220;
  }
  function burst(dest2, when, type, freq, attackT, decayT, peakGain, freqEnd) {
    const ctx2 = _ctx;
    const g = ctx2.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peakGain, when + attackT);
    g.gain.exponentialRampToValueAtTime(1e-4, when + attackT + decayT);
    g.connect(dest2);
    const o = ctx2.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (freqEnd !== void 0) o.frequency.exponentialRampToValueAtTime(freqEnd, when + attackT + decayT);
    o.connect(g);
    o.start(when);
    o.stop(when + attackT + decayT + 0.05);
  }
  function noiseBurst(dest2, buf, when, filterType, filterFreq, filterQ, decayT, gain) {
    const ctx2 = _ctx;
    const g = ctx2.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(1e-4, when + decayT);
    const f = ctx2.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterFreq;
    f.Q.value = filterQ;
    const s = ctx2.createBufferSource();
    s.buffer = buf;
    s.connect(f);
    f.connect(g);
    g.connect(dest2);
    s.start(when);
    s.stop(when + decayT + 0.02);
  }
  function kick(dest2, when, rootHz = 54, gain = 0.9) {
    const ctx2 = _ctx;
    const sg = ctx2.createGain();
    sg.gain.setValueAtTime(0, when);
    sg.gain.linearRampToValueAtTime(gain, when + 2e-3);
    sg.gain.exponentialRampToValueAtTime(1e-4, when + 0.4);
    sg.connect(dest2);
    const so = ctx2.createOscillator();
    so.type = "sine";
    so.frequency.setValueAtTime(rootHz * 4.5, when);
    so.frequency.exponentialRampToValueAtTime(rootHz, when + 0.07);
    so.frequency.exponentialRampToValueAtTime(rootHz * 0.55, when + 0.36);
    so.connect(sg);
    so.start(when);
    so.stop(when + 0.42);
    burst(dest2, when, "sine", 2600, 1e-3, 0.016, 0.5, 110);
    noiseBurst(dest2, getWhite(), when, "lowpass", 160, 1, 0.055, 0.24);
  }
  function sidechainDuck(gainNode, when, fullGain) {
    const g = gainNode.gain;
    g.setValueAtTime(fullGain * 0.12, when);
    g.setTargetAtTime(fullGain, when + 4e-3, 0.055);
  }
  function snare(dest2, when, gain = 0.65) {
    noiseBurst(dest2, getWhite(), when, "highpass", 950, 0.8, 0.13, gain);
    noiseBurst(dest2, getWhite(), when, "bandpass", 2400, 1.6, 0.06, gain * 0.6);
    burst(dest2, when, "sine", 340, 1e-3, 0.028, gain * 0.38, 120);
  }
  function hat(dest2, when, gain = 0.2, open = false) {
    noiseBurst(dest2, getWhite(), when, "highpass", 7200, 0.4, open ? 0.11 : 0.025, gain);
  }
  function clap(dest2, when, gain = 0.6) {
    for (let i = 0; i < 3; i++) {
      noiseBurst(dest2, getWhite(), when + i * 8e-3, "bandpass", 1800, 1.2, 0.06, gain * (1 - i * 0.2));
    }
  }
  const LOOKAHEAD = 0.15;
  const SCHEDULE_MS = 25;
  function buildLoop(bpm, stepFn, dest2, fullGain) {
    const ctx2 = _ctx;
    const gainNode = ctx2.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(dest2);
    const stepSecs = 60 / bpm / 4;
    let step = 0;
    let bar = 0;
    let phrase = 0;
    let nextTime = ctx2.currentTime + 0.05;
    let stopped = false;
    let timerId = -1;
    function schedule() {
      if (stopped) return;
      while (nextTime < ctx2.currentTime + LOOKAHEAD) {
        stepFn(gainNode, nextTime, step, bar, phrase);
        step++;
        if (step >= 16) {
          step = 0;
          bar++;
          if (bar >= 4) {
            bar = 0;
            phrase++;
          }
        }
        nextTime += stepSecs;
      }
      timerId = window.setTimeout(schedule, SCHEDULE_MS);
    }
    schedule();
    return {
      stop() {
        stopped = true;
        clearTimeout(timerId);
      },
      setGain(value, rampSecs) {
        const g = gainNode.gain;
        g.cancelScheduledValues(ctx2.currentTime);
        g.setValueAtTime(Math.max(g.value, 1e-5), ctx2.currentTime);
        if (rampSecs <= 0) g.setValueAtTime(value, ctx2.currentTime);
        else g.setTargetAtTime(value, ctx2.currentTime, rampSecs / 3);
      }
    };
  }
  function makeSweepFilter(dest2, baseFreq, sweepHz, sweepPeriodSec) {
    const ctx2 = _ctx;
    const f = ctx2.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 1.2;
    f.frequency.value = baseFreq;
    f.connect(dest2);
    const now = ctx2.currentTime;
    const steps = 32;
    for (let i = 0; i <= steps; i++) {
      const t = now + i / steps * sweepPeriodSec * 4;
      const v = baseFreq + sweepHz * Math.sin(i / steps * Math.PI * 2 * 4);
      if (i === 0) f.frequency.setValueAtTime(Math.max(80, v), t);
      else f.frequency.linearRampToValueAtTime(Math.max(80, v), t);
    }
    return f;
  }
  function buildTrack0(dest2) {
    const ctx2 = _ctx;
    const FG = 0.68;
    const dly = ctx2.createDelay(1);
    dly.delayTime.value = 0.52;
    const dlFB = ctx2.createGain();
    dlFB.gain.value = 0.4;
    const dlOut = ctx2.createGain();
    dlOut.gain.value = 0.28;
    dly.connect(dlFB);
    dlFB.connect(dly);
    dly.connect(dlOut);
    dlOut.connect(dest2);
    const sweep = makeSweepFilter(dest2, 400, 380, 16);
    function bell(when, freq, gain, dur) {
      burst(sweep, when, "sine", freq, 3e-3, dur, gain);
      burst(sweep, when, "sine", freq * 2, 3e-3, dur * 0.6, gain * 0.3);
      burst(dlOut, when, "sine", freq, 3e-3, dur, gain * 0.35);
    }
    function shimmer(when, freq) {
      burst(sweep, when, "sine", freq, 1e-3, 0.08, 0.12);
    }
    const CM = [hz("C4"), hz("Eb4"), hz("G4"), hz("Bb4"), hz("C5"), hz("Eb5"), hz("G5")];
    const BASS_SEQ = [hz("C2"), hz("Ab1"), hz("Bb1"), hz("G1")];
    const ARP_SEQS = [
      [0, 2, 4, 2, 1, 3, 5, 3],
      // phrase 0
      [4, 2, 0, 2, 6, 4, 2, 4],
      // phrase 1
      [6, 5, 4, 3, 2, 1, 0, 1],
      // phrase 2
      [2, 4, 6, 5, 3, 4, 2, 0]
      // phrase 3
    ];
    return buildLoop(128, (g, when, step, bar, phrase) => {
      const ph4 = phrase % 4;
      const barsTotal = phrase * 4 + bar;
      if (step === 0 || step === 8) {
        kick(g, when, 50, 0.85);
        sidechainDuck(g, when, FG);
      }
      if ((step === 4 || step === 12) && phrase >= 1) snare(g, when, 0.5);
      if (step % 2 === 0 && phrase >= 2) hat(g, when, 0.14);
      if ((step === 6 || step === 14) && phrase >= 3) hat(g, when, 0.18, true);
      if (step === 0) {
        const bNote = BASS_SEQ[bar % BASS_SEQ.length];
        burst(g, when, "sine", bNote, 0.04, 1.8, 0.55);
        burst(g, when, "sine", bNote * 0.5, 0.04, 1.8, 0.28);
      }
      if (step % 2 === 0) {
        const arpSeq = ARP_SEQS[ph4];
        const noteIdx = arpSeq[step / 2 % arpSeq.length];
        const freq = CM[noteIdx % CM.length];
        const arpGain = 0.18 + (barsTotal % 8 > 3 ? 0.06 : 0);
        bell(when, freq, arpGain, 0.38);
      }
      if ((step === 3 || step === 7 || step === 11) && phrase >= 2) {
        shimmer(when, 2200 + step * 180);
      }
    }, dest2);
  }
  function buildTrack1(dest2) {
    const ctx2 = _ctx;
    const FG = 0.72;
    const ws = ctx2.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = i * 2 / 256 - 1;
      curve[i] = Math.tanh(x * 4);
    }
    ws.curve = curve;
    ws.connect(dest2);
    const dly = ctx2.createDelay(0.5);
    dly.delayTime.value = 0.218;
    const dlFB = ctx2.createGain();
    dlFB.gain.value = 0.32;
    const dlOut = ctx2.createGain();
    dlOut.gain.value = 0.2;
    dly.connect(dlFB);
    dlFB.connect(dly);
    dly.connect(dlOut);
    dlOut.connect(dest2);
    function sqLead(when, freq, dur, gain) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 6e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
      g.connect(ws);
      g.connect(dlOut);
      const o1 = ctx2.createOscillator();
      o1.type = "square";
      o1.frequency.setValueAtTime(freq, when);
      const o2 = ctx2.createOscillator();
      o2.type = "square";
      o2.frequency.setValueAtTime(freq * 1.008, when);
      const g2 = ctx2.createGain();
      g2.gain.value = 0.7;
      g2.connect(g);
      o1.connect(g);
      o2.connect(g2);
      o1.start(when);
      o2.start(when);
      o1.stop(when + dur + 0.05);
      o2.stop(when + dur + 0.05);
    }
    function sqBass(when, freq, dur) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.58, when + 4e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur * 0.85);
      const lp = ctx2.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      lp.Q.value = 3;
      lp.connect(g);
      g.connect(dest2);
      const o = ctx2.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(freq, when);
      o.connect(lp);
      o.start(when);
      o.stop(when + dur + 0.03);
      burst(dest2, when, "sine", freq * 0.5, 4e-3, dur * 0.8, 0.4);
    }
    const AM_CHORDS = [
      [hz("A3"), hz("C4"), hz("E4")],
      [hz("F3"), hz("A3"), hz("C4")],
      [hz("G3"), hz("B3"), hz("D4")],
      [hz("E3"), hz("G3"), hz("B3")]
    ];
    const AM_ARP = [hz("A4"), hz("C5"), hz("E5"), hz("A5"), hz("G5"), hz("E5"), hz("C5"), hz("A4")];
    const BASS_ROOTS = [hz("A1"), hz("F1"), hz("G1"), hz("E1")];
    const stepSecs = 60 / 138 / 4;
    return buildLoop(138, (g, when, step, bar, phrase) => {
      if (step === 0 || step === 4 || step === 8 || step === 12) {
        kick(g, when, 56, 0.88);
        sidechainDuck(g, when, FG);
      }
      if (step === 4 || step === 12) clap(g, when, 0.62);
      if (phrase >= 1) hat(g, when, 0.16 + (step % 4 === 2 ? 0.06 : 0));
      if (step === 0) sqBass(when, BASS_ROOTS[bar % 4], stepSecs * 3.5);
      if (step === 10 && phrase >= 1) sqBass(when, BASS_ROOTS[bar % 4] * 1.5, stepSecs * 1.5);
      if (step % 4 === 0) {
        const chord = AM_CHORDS[(bar + phrase) % AM_CHORDS.length];
        const dur = phrase >= 2 ? stepSecs * 3.5 : stepSecs * 1.8;
        for (const f of chord) sqLead(when, f, dur, 0.2);
      }
      if (step % 2 === 0 && phrase >= 1) {
        const f = AM_ARP[(step / 2 + bar * 4 + phrase) % AM_ARP.length];
        burst(dest2, when, "square", f, 3e-3, stepSecs * 1.6, 0.12);
      }
    }, dest2);
  }
  function buildTrack2(dest2) {
    const ctx2 = _ctx;
    const FG = 0.7;
    function ringBass(when, carrierHz, modHz, dur, gain) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 8e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur * 0.9);
      const lp = ctx2.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 6;
      lp.frequency.setValueAtTime(200, when);
      lp.frequency.exponentialRampToValueAtTime(1800, when + dur * 0.4);
      lp.frequency.exponentialRampToValueAtTime(300, when + dur * 0.85);
      lp.connect(g);
      g.connect(dest2);
      const carrier = ctx2.createOscillator();
      carrier.type = "sawtooth";
      carrier.frequency.setValueAtTime(carrierHz, when);
      const modGain = ctx2.createGain();
      modGain.gain.setValueAtTime(carrierHz * 0.8, when);
      const mod = ctx2.createOscillator();
      mod.type = "sine";
      mod.frequency.setValueAtTime(modHz, when);
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      carrier.connect(lp);
      carrier.start(when);
      mod.start(when);
      carrier.stop(when + dur + 0.05);
      mod.stop(when + dur + 0.05);
      burst(dest2, when, "sine", carrierHz * 0.5, 0.01, dur * 0.8, gain * 0.35);
    }
    function eerePad(when, freqs, dur, gain) {
      for (const f of freqs) {
        burst(dest2, when, "sine", f, 0.18, dur - 0.18, gain);
        burst(dest2, when, "sine", f * 2.007, 0.18, dur - 0.18, gain * 0.22);
      }
    }
    const FM_BASS_ROOTS = [hz("F1"), hz("Db1"), hz("Ab1"), hz("Eb1")];
    const MOD_RATIOS = [1.5, 2, 0.75, 3];
    const FM_CHORDS = [
      [hz("F3"), hz("Ab3"), hz("C4"), hz("Eb4")],
      [hz("Db3"), hz("F3"), hz("Ab3"), hz("C4")],
      [hz("Ab3"), hz("C4"), hz("Eb4"), hz("Ab4")],
      [hz("Eb3"), hz("G3"), hz("Bb3"), hz("Db4")]
    ];
    const stepSecs = 60 / 132 / 4;
    return buildLoop(132, (g, when, step, bar, phrase) => {
      if (step === 0 || step === 4 || step === 8 || step === 12) {
        kick(g, when, 52, 0.75);
        sidechainDuck(g, when, FG);
      }
      if (step === 4 || step === 12) noiseBurst(g, getPink(), when, "bandpass", 1600, 1.4, 0.18, 0.55);
      if (step % 2 === 0 && phrase >= 2) hat(g, when, 0.12);
      if (step === 14 && phrase >= 3) hat(g, when, 0.16, true);
      if (step === 0) {
        const root = FM_BASS_ROOTS[bar % 4];
        const modRatio = MOD_RATIOS[bar % 4];
        ringBass(when, root, root * modRatio, stepSecs * 3.8, 0.6);
      }
      if (step === 10 && phrase >= 1) {
        const root = FM_BASS_ROOTS[(bar + 1) % 4];
        ringBass(when, root * 1.5, root * 2, stepSecs * 1.6, 0.42);
      }
      if (step === 0 && bar === 0) {
        const chord = FM_CHORDS[phrase % FM_CHORDS.length];
        eerePad(when, chord, stepSecs * 64, 0.1);
      }
      if (step % 3 === 0 && phrase >= 1) {
        const noteSet = FM_CHORDS[bar % FM_CHORDS.length];
        const f = noteSet[Math.floor(step / 3) % noteSet.length];
        burst(g, when, "sawtooth", f * 2, 4e-3, stepSecs * 2.2, 0.13);
      }
    }, dest2);
  }
  function buildTrack3(dest2) {
    const ctx2 = _ctx;
    const FG = 0.68;
    const dly = ctx2.createDelay(1.2);
    dly.delayTime.value = 0.68;
    const dlFB = ctx2.createGain();
    dlFB.gain.value = 0.44;
    const dlOut = ctx2.createGain();
    dlOut.gain.value = 0.24;
    dly.connect(dlFB);
    dlFB.connect(dly);
    dly.connect(dlOut);
    dlOut.connect(dest2);
    function chime(when, freq, gain, dur) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 2e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
      g.connect(dest2);
      g.connect(dlOut);
      const o = ctx2.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, when);
      o.connect(g);
      o.start(when);
      o.stop(when + dur + 0.05);
      const g2 = ctx2.createGain();
      g2.gain.value = 0.18;
      g2.connect(dlOut);
      const o2 = ctx2.createOscillator();
      o2.type = "sine";
      o2.frequency.setValueAtTime(freq * 3.01, when);
      o2.connect(g2);
      o2.start(when);
      o2.stop(when + dur * 0.5 + 0.05);
    }
    function crystalPad(when, freqs, dur, gain) {
      for (const f of freqs) {
        burst(dest2, when, "triangle", f, 0.25, dur - 0.25, gain);
        burst(dest2, when, "triangle", f * 2, 0.35, dur - 0.35, gain * 0.15);
      }
    }
    function icyHat(when, freq) {
      burst(dest2, when, "triangle", freq, 1e-3, 0.035, 0.1);
      noiseBurst(dest2, getWhite(), when, "highpass", 8e3, 0.3, 0.018, 0.08);
    }
    const AM_NOTES = [hz("A4"), hz("C5"), hz("E5"), hz("G5"), hz("A5"), hz("B5"), hz("D5"), hz("F5")];
    const CHORDS = [
      [hz("A3"), hz("C4"), hz("E4"), hz("G4")],
      [hz("F3"), hz("A3"), hz("C4"), hz("E4")],
      [hz("C3"), hz("E3"), hz("G3"), hz("B3")],
      [hz("G3"), hz("B3"), hz("D4"), hz("F4")]
    ];
    const ICY_HAT_FREQS = [1760, 2093, 2637, 1975, 2349, 1760, 2093, 2637];
    const stepSecs = 60 / 124 / 4;
    return buildLoop(124, (g, when, step, bar, phrase) => {
      if (step === 0 && bar % 2 === 0) {
        kick(g, when, 54, 0.6);
        sidechainDuck(g, when, FG);
      }
      if (step === 8) {
        kick(g, when, 54, 0.4);
        sidechainDuck(g, when, FG * 0.7);
      }
      if (step === 4 || step === 12) burst(g, when, "triangle", 220, 1e-3, 0.06, 0.22);
      if (step % 2 === 0) icyHat(when, ICY_HAT_FREQS[step / 2]);
      if (step % 2 === 0) {
        const noteIdx = (step / 2 + bar * 8 + phrase * 3) % AM_NOTES.length;
        const dur = stepSecs * (1.8 + phrase % 2 * 0.8);
        chime(when, AM_NOTES[noteIdx], 0.2 + (phrase > 1 ? 0.06 : 0), dur);
      }
      if (step === 0 && bar === 0) {
        const ch = CHORDS[phrase % CHORDS.length];
        crystalPad(when, ch, stepSecs * 64, 0.09);
      }
    }, dest2);
  }
  function buildTrack4(dest2) {
    const ctx2 = _ctx;
    const FG = 0.74;
    const wsB = ctx2.createWaveShaper();
    const crvB = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = i * 2 / 512 - 1;
      crvB[i] = Math.tanh(x * 2.5);
    }
    wsB.curve = crvB;
    wsB.connect(dest2);
    function unisonBass(when, freq, dur, gain) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 5e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur * 0.9);
      const lp = ctx2.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(500, when);
      lp.frequency.linearRampToValueAtTime(1200, when + dur * 0.3);
      lp.frequency.exponentialRampToValueAtTime(600, when + dur * 0.8);
      lp.connect(g);
      g.connect(wsB);
      const detunes = [0, -8, 8, -16];
      for (const d of detunes) {
        const o = ctx2.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(freq * Math.pow(2, d / 1200), when);
        o.connect(lp);
        o.start(when);
        o.stop(when + dur + 0.05);
      }
      burst(dest2, when, "sine", freq * 0.5, 5e-3, dur * 0.8, gain * 0.45);
    }
    function powerChord(when, rootHz, dur, gain) {
      for (const f of [rootHz, rootHz * 1.5, rootHz * 2]) {
        burst(dest2, when, "sawtooth", f, 8e-3, dur, gain * (f === rootHz * 1.5 ? 0.7 : 0.5));
      }
    }
    const EM_BASS = [hz("E1"), hz("D1"), hz("G1"), hz("C1"), hz("A1"), hz("B1")];
    const EM_LEAD = [hz("E3"), hz("G3"), hz("D3"), hz("C3")];
    const EM_ARP = [hz("E4"), hz("G4"), hz("B4"), hz("D5"), hz("E5"), hz("D5"), hz("B4"), hz("G4")];
    const stepSecs = 60 / 140 / 4;
    return buildLoop(140, (g, when, step, bar, phrase) => {
      if (step === 0 || step === 4 || step === 8 || step === 12) {
        kick(g, when, 48, 0.95);
        sidechainDuck(g, when, FG);
      }
      if (step === 2 && phrase >= 2) kick(g, when, 48, 0.5);
      if ((step === 4 || step === 12) && phrase >= 1) snare(g, when, 0.7);
      const hatStep = phrase >= 3 ? 1 : 2;
      if (step % hatStep === 0 && phrase >= 1) hat(g, when, 0.15);
      if (step === 0) unisonBass(when, EM_BASS[bar % EM_BASS.length], stepSecs * 3.6, 0.65);
      if (step === 9 && phrase >= 1) unisonBass(when, EM_BASS[(bar + 1) % EM_BASS.length], stepSecs * 1.4, 0.45);
      if (step % 4 === 0) {
        powerChord(when, EM_LEAD[bar % EM_LEAD.length], stepSecs * 3.8, 0.18);
      }
      if (step % 2 === 0 && phrase >= 1) {
        const f = EM_ARP[(step / 2 + bar * 2) % EM_ARP.length];
        burst(dest2, when, "sawtooth", f, 3e-3, stepSecs * 1.5, 0.14);
      }
    }, dest2);
  }
  function buildTrack5(dest2) {
    const ctx2 = _ctx;
    const FG = 0.72;
    const comb = ctx2.createDelay(0.05);
    comb.delayTime.value = 1 / 440;
    const combFB = ctx2.createGain();
    combFB.gain.value = 0.85;
    const combOut = ctx2.createGain();
    combOut.gain.value = 0.3;
    comb.connect(combFB);
    combFB.connect(comb);
    comb.connect(combOut);
    combOut.connect(dest2);
    function pwmLead(when, freq, dur, gain) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 4e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
      const lp = ctx2.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(800, when);
      lp.frequency.linearRampToValueAtTime(3200, when + dur * 0.2);
      lp.frequency.exponentialRampToValueAtTime(1200, when + dur * 0.8);
      lp.Q.value = 3;
      lp.connect(g);
      g.connect(dest2);
      g.connect(combOut);
      const o1 = ctx2.createOscillator();
      o1.type = "square";
      o1.frequency.setValueAtTime(freq, when);
      const o2 = ctx2.createOscillator();
      o2.type = "square";
      o2.frequency.setValueAtTime(freq * 1.006, when);
      const g2 = ctx2.createGain();
      g2.gain.value = -0.8;
      o2.connect(g2);
      g2.connect(lp);
      o1.connect(lp);
      o1.start(when);
      o2.start(when);
      o1.stop(when + dur + 0.05);
      o2.stop(when + dur + 0.05);
    }
    function blip(when, freq, gain) {
      burst(comb, when, "square", freq, 1e-3, 0.022, gain);
    }
    const GM_BASS = [hz("G1"), hz("Eb1"), hz("Bb1"), hz("F1")];
    const GM_LEAD = [hz("G3"), hz("Eb3"), hz("Bb3"), hz("F3")];
    const GM_ARP = [hz("G4"), hz("Bb4"), hz("D5"), hz("F5"), hz("G5"), hz("F5"), hz("D5"), hz("Bb4")];
    const BLIP_FREQS = [880, 1047, 1175, 988, 1319, 1175, 987, 1047];
    const stepSecs = 60 / 142 / 4;
    return buildLoop(142, (g, when, step, bar, phrase) => {
      if (step === 0 || step === 4 || step === 8 || step === 12) {
        kick(g, when, 55, 0.85);
        sidechainDuck(g, when, FG);
      }
      if (step === 4 || step === 12) snare(g, when, 0.6);
      hat(g, when, 0.13 + (step % 4 === 2 ? 0.05 : 0));
      if (step % 4 === 0) {
        const f = GM_BASS[bar % GM_BASS.length];
        burst(dest2, when, "square", f, 3e-3, stepSecs * 1.5, 0.5);
        burst(dest2, when, "sine", f * 0.5, 3e-3, stepSecs * 1.5, 0.35);
      }
      if (step % 4 === 0) pwmLead(when, GM_LEAD[bar % GM_LEAD.length], stepSecs * 3.5, 0.22);
      if (step % 2 === 0) blip(when, BLIP_FREQS[step / 2], 0.18);
      if (step % 2 === 0 && phrase >= 1) {
        const f = GM_ARP[(step / 2 + bar * 4 + phrase) % GM_ARP.length];
        pwmLead(when, f, stepSecs * 1.6, 0.15);
      }
      if ((step === 3 || step === 7 || step === 11) && phrase >= 2) {
        blip(when, BLIP_FREQS[(step + 3) % BLIP_FREQS.length] * 2, 0.14);
      }
    }, dest2);
  }
  function buildTrack6(dest2) {
    const ctx2 = _ctx;
    const FG = 0.68;
    const ap1 = ctx2.createBiquadFilter();
    ap1.type = "allpass";
    ap1.Q.value = 10;
    const ap2 = ctx2.createBiquadFilter();
    ap2.type = "allpass";
    ap2.Q.value = 10;
    const sweepNow = ctx2.currentTime;
    for (let i = 0; i <= 64; i++) {
      const t = sweepNow + i * 2;
      const v = 200 + 800 * Math.abs(Math.sin(i * 0.18));
      if (i === 0) {
        ap1.frequency.setValueAtTime(v, t);
        ap2.frequency.setValueAtTime(v * 1.3, t);
      } else {
        ap1.frequency.linearRampToValueAtTime(v, t);
        ap2.frequency.linearRampToValueAtTime(v * 1.3, t);
      }
    }
    ap1.connect(ap2);
    ap2.connect(dest2);
    function gravPad(when, freq, dur, gain) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.6);
      g.gain.setValueAtTime(gain, when + dur - 0.5);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
      g.connect(ap1);
      const o = ctx2.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, when);
      o.connect(g);
      o.start(when);
      o.stop(when + dur + 0.1);
      burst(ap1, when, "sine", freq * 1.998, 0.5, dur - 0.5, gain * 0.2);
    }
    function muteBass(when, freq, stepSecs2) {
      burst(dest2, when, "triangle", freq, 3e-3, stepSecs2 * 0.55, 0.55);
      burst(dest2, when, "sine", freq * 0.5, 3e-3, stepSecs2 * 0.55, 0.3);
    }
    const BBM_CHORDS = [
      [hz("Bb3"), hz("Db4"), hz("F4"), hz("Ab4")],
      [hz("Gb3"), hz("Bb3"), hz("Db4"), hz("F4")],
      [hz("Db3"), hz("F3"), hz("Ab3"), hz("C4")],
      [hz("Ab3"), hz("C4"), hz("Eb4"), hz("Gb4")]
    ];
    const BBM_BASS = [hz("Bb1"), hz("Gb1"), hz("Db1"), hz("Ab1")];
    const BBM_ARP = [hz("Bb4"), hz("Db5"), hz("F5"), hz("Ab5"), hz("Gb5"), hz("Eb5"), hz("Db5"), hz("Bb4")];
    const stepSecs = 60 / 126 / 4;
    return buildLoop(126, (g, when, step, bar, phrase) => {
      if (step === 0) {
        kick(g, when, 51, 0.78);
        sidechainDuck(g, when, FG);
      }
      if (step === 8 && bar % 2 === 1) {
        kick(g, when, 51, 0.55);
        sidechainDuck(g, when, FG * 0.8);
      }
      if (step === 4 || step === 12) clap(g, when, 0.44);
      if ((step === 2 || step === 6 || step === 10 || step === 14) && phrase >= 2) hat(g, when, 0.11);
      if (step % 4 === 0) muteBass(when, BBM_BASS[bar % BBM_BASS.length], stepSecs);
      if (step === 0 && bar === 0) {
        const ch = BBM_CHORDS[phrase % BBM_CHORDS.length];
        for (const f of ch) gravPad(when, f, stepSecs * 62, 0.11);
      }
      if (step % 2 === 0 && phrase >= 1) {
        const f = BBM_ARP[(step / 2 + bar * 3) % BBM_ARP.length];
        burst(ap1, when, "sine", f, 0.02, stepSecs * 2.8, 0.12);
      }
    }, dest2);
  }
  function buildTrack7(dest2) {
    const ctx2 = _ctx;
    const FG = 0.7;
    function tabla(when, freq, gain, dur) {
      noiseBurst(dest2, getPink(), when, "bandpass", freq, 8, dur, gain);
      burst(dest2, when, "sine", freq * 0.8, 1e-3, dur * 0.5, gain * 0.45);
    }
    function pluck(when, freq, gain, dur) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
      const lp = ctx2.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(freq * 5, when);
      lp.frequency.exponentialRampToValueAtTime(freq * 1.5, when + dur * 0.6);
      lp.Q.value = 1.5;
      lp.connect(g);
      g.connect(dest2);
      const o = ctx2.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(freq, when);
      o.connect(lp);
      o.start(when);
      o.stop(when + dur + 0.04);
      burst(dest2, when, "sine", freq * 1.5, 1e-3, dur * 0.4, gain * 0.18);
    }
    function dustPad(when, freq, dur, gain) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.4);
      g.gain.setValueAtTime(gain, when + dur - 0.4);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
      const lp = ctx2.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600;
      lp.Q.value = 0.5;
      lp.connect(g);
      g.connect(dest2);
      const o = ctx2.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, when);
      o.connect(lp);
      o.start(when);
      o.stop(when + dur + 0.1);
    }
    const DM_PLUCK = [hz("D4"), hz("F4"), hz("A4"), hz("C5"), hz("D5"), hz("E4"), hz("G4"), hz("Bb4")];
    const DM_BASS = [hz("D1"), hz("Bb1"), hz("F1"), hz("C1")];
    const DM_CHORDS = [
      [hz("D3"), hz("F3"), hz("A3"), hz("C4")],
      [hz("Bb2"), hz("D3"), hz("F3"), hz("A3")],
      [hz("F3"), hz("A3"), hz("C4"), hz("E4")],
      [hz("C3"), hz("E3"), hz("G3"), hz("Bb3")]
    ];
    const TABLA_FREQS = [180, 260, 220, 320, 180, 280, 200, 240];
    const stepSecs = 60 / 134 / 4;
    return buildLoop(134, (g, when, step, bar, phrase) => {
      if (step === 0 || step === 8) {
        kick(g, when, 53, 0.8);
        sidechainDuck(g, when, FG);
      }
      const tablaPattern = [0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0];
      if (tablaPattern[step] && !(step === 0 || step === 8)) {
        tabla(when, TABLA_FREQS[step % TABLA_FREQS.length], 0.45, 0.06);
      }
      if ((step === 5 || step === 13) && phrase >= 1) tabla(when, 420, 0.35, 0.04);
      if (step % 4 === 0) {
        pluck(when, DM_BASS[bar % DM_BASS.length], 0.58, stepSecs * 1.6);
        burst(dest2, when, "sine", DM_BASS[bar % DM_BASS.length] * 0.5, 5e-3, stepSecs * 1.6, 0.3);
      }
      if (step % 2 === 0) {
        const noteIdx = (step / 2 + bar * 5 + phrase * 3) % DM_PLUCK.length;
        const dur = stepSecs * (1.4 + phrase % 2 * 0.6);
        pluck(when, DM_PLUCK[noteIdx], 0.22, dur);
      }
      if (step === 0 && bar === 0) {
        const ch = DM_CHORDS[phrase % DM_CHORDS.length];
        for (const f of ch) dustPad(when, f, stepSecs * 60, 0.08);
      }
    }, dest2);
  }
  function buildTrack8(dest2) {
    const ctx2 = _ctx;
    const FG = 0.68;
    const hp = ctx2.createBiquadFilter();
    hp.type = "highpass";
    hp.Q.value = 0.5;
    const hpNow = ctx2.currentTime;
    hp.frequency.setValueAtTime(800, hpNow);
    hp.frequency.linearRampToValueAtTime(80, hpNow + 60 * 8);
    hp.connect(dest2);
    function organ(when, freq, dur, gain) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.02);
      g.gain.setValueAtTime(gain * 0.85, when + dur - 0.06);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
      g.connect(hp);
      const o1 = ctx2.createOscillator();
      o1.type = "square";
      o1.frequency.setValueAtTime(freq, when);
      const g2 = ctx2.createGain();
      g2.gain.value = 0.45;
      const o2 = ctx2.createOscillator();
      o2.type = "square";
      o2.frequency.setValueAtTime(freq * 2, when);
      const g3 = ctx2.createGain();
      g3.gain.value = 0.3;
      const o3 = ctx2.createOscillator();
      o3.type = "sine";
      o3.frequency.setValueAtTime(freq * 0.5, when);
      o1.connect(g);
      g2.connect(g);
      g3.connect(g);
      o2.connect(g2);
      o3.connect(g3);
      [o1, o2, o3].forEach((o) => {
        o.start(when);
        o.stop(when + dur + 0.06);
      });
      burst(dest2, when, "sine", freq * 0.25, 0.02, dur * 0.9, gain * 0.28);
    }
    const FM_CHORDS = [
      [hz("F3"), hz("Ab3"), hz("C4"), hz("Eb4")],
      [hz("Db3"), hz("F3"), hz("Ab3"), hz("C4")],
      [hz("Ab3"), hz("C4"), hz("Eb4"), hz("Ab4")],
      [hz("Eb3"), hz("G3"), hz("Bb3"), hz("Db4")]
    ];
    const FM_MELODY = [hz("F4"), hz("Ab4"), hz("C5"), hz("Eb5"), hz("Db5"), hz("Ab4"), hz("Bb4"), hz("F4")];
    const FM_BASS = [hz("F1"), hz("Db1"), hz("Ab1"), hz("Eb1")];
    const stepSecs = 60 / 130 / 4;
    return buildLoop(130, (g, when, step, bar, phrase) => {
      if (step === 0) {
        kick(g, when, 50, 0.72);
        sidechainDuck(g, when, FG);
      }
      if (step === 8 && phrase >= 2) {
        kick(g, when, 50, 0.48);
        sidechainDuck(g, when, FG * 0.7);
      }
      if ((step === 4 || step === 12) && phrase >= 1) clap(g, when, 0.38);
      if ((step === 2 || step === 6 || step === 10 || step === 14) && phrase >= 2) hat(g, when, 0.1);
      if (step % 4 === 0) organ(when, FM_BASS[bar % FM_BASS.length], stepSecs * 3.5, 0.48);
      if (step === 0 && bar === 0) {
        const ch = FM_CHORDS[phrase % FM_CHORDS.length];
        for (const f of ch) organ(when, f, stepSecs * 63, 0.12);
      }
      if (step % 2 === 0 && phrase >= 1) {
        const f = FM_MELODY[(step / 2 + bar * 2 + phrase) % FM_MELODY.length];
        organ(when, f, stepSecs * 1.8, 0.16);
      }
    }, dest2);
  }
  function buildTrack9(dest2) {
    const ctx2 = _ctx;
    const FG = 0.76;
    const wsH = ctx2.createWaveShaper();
    const crvH = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = i * 2 / 512 - 1;
      crvH[i] = Math.tanh(x * 8) * 0.9;
    }
    wsH.curve = crvH;
    const wsGain = ctx2.createGain();
    wsGain.gain.value = 0.38;
    wsGain.connect(dest2);
    wsH.connect(wsGain);
    function chaosSaw(when, freq, dur, gain) {
      const g = ctx2.createGain();
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 6e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, when + dur);
      const lp = ctx2.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 2;
      lp.frequency.setValueAtTime(600, when);
      lp.frequency.linearRampToValueAtTime(4e3, when + dur * 0.15);
      lp.frequency.exponentialRampToValueAtTime(800, when + dur * 0.75);
      lp.connect(g);
      g.connect(wsH);
      const detunes = [-24, -12, 0, 12, 24];
      for (const d of detunes) {
        const o = ctx2.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(freq * Math.pow(2, d / 1200), when);
        o.connect(lp);
        o.start(when);
        o.stop(when + dur + 0.05);
      }
      burst(dest2, when, "sine", freq * 0.5, 4e-3, dur * 0.8, gain * 0.55);
    }
    function chaosPerc(when) {
      noiseBurst(dest2, getWhite(), when, "bandpass", 3200 + Math.random() * 800, 4, 0.04, 0.55);
    }
    const BM_BASS = [hz("B1"), hz("F1"), hz("D1"), hz("A1"), hz("G1"), hz("E1")];
    const BM_CHORDS = [
      [hz("B3"), hz("D4"), hz("F4"), hz("A4")],
      [hz("G3"), hz("B3"), hz("D4"), hz("F4")],
      [hz("F3"), hz("A3"), hz("C4"), hz("E4")],
      [hz("A3"), hz("C4"), hz("E4"), hz("G4")]
    ];
    const BM_ARP = [hz("B4"), hz("D5"), hz("F5"), hz("A5"), hz("B5"), hz("A5"), hz("F5"), hz("D5")];
    const stepSecs = 60 / 148 / 4;
    return buildLoop(148, (g, when, step, bar, phrase) => {
      if (step === 0 || step === 4 || step === 8 || step === 12) {
        kick(g, when, 60, 0.95);
        sidechainDuck(g, when, FG);
      }
      if ((step === 2 || step === 10) && phrase >= 2) kick(g, when, 60, 0.55);
      if (step === 4 || step === 12) snare(g, when, 0.72);
      if ((step === 3 || step === 11) && phrase >= 2) snare(g, when, 0.28);
      hat(g, when, 0.16 + (step % 4 === 2 ? 0.07 : 0));
      if ((step === 2 || step === 6 || step === 10 || step === 14) && phrase >= 1) chaosPerc(when);
      if (step % 2 === 0) {
        const f2 = BM_BASS[(Math.floor(step / 2) + bar) % BM_BASS.length];
        chaosSaw(when, f2, stepSecs * 1.7, 0.6);
      }
      if (step % 4 === 0) {
        const ch = BM_CHORDS[bar % BM_CHORDS.length];
        for (const f2 of ch) chaosSaw(when, f2, stepSecs * 3.5, 0.16);
      }
      const f = BM_ARP[(step / 2 + bar * 5 + phrase) % BM_ARP.length];
      if (step % 2 === 0) burst(dest2, when, "sawtooth", f, 3e-3, stepSecs * 1.4, 0.16);
    }, dest2);
  }
  const TRACK_BUILDERS = [
    buildTrack0,
    buildTrack1,
    buildTrack2,
    buildTrack3,
    buildTrack4,
    buildTrack5,
    buildTrack6,
    buildTrack7,
    buildTrack8,
    buildTrack9
  ];
  const TRACK_GAINS = [0.68, 0.72, 0.7, 0.68, 0.74, 0.72, 0.68, 0.7, 0.68, 0.76];
  function beginMusic() {
    if (_playing || !_ctx || !_masterGain) return;
    _playing = true;
    const i = _curIdx < 0 ? 0 : _curIdx;
    _curIdx = i;
    _curLoop = TRACK_BUILDERS[i % TRACK_BUILDERS.length](_masterGain);
    _curLoop.setGain(TRACK_GAINS[i % TRACK_GAINS.length], 1.8);
  }
  function playThemeTrack(idx) {
    if (!_ctx || !_masterGain) {
      _curIdx = idx;
      return;
    }
    const i = (idx % TRACK_BUILDERS.length + TRACK_BUILDERS.length) % TRACK_BUILDERS.length;
    if (!_playing) {
      _curIdx = i;
      return;
    }
    if (i === _curIdx) return;
    const prev = _curLoop;
    _curIdx = i;
    _curLoop = TRACK_BUILDERS[i](_masterGain);
    _curLoop.setGain(TRACK_GAINS[i], 2);
    if (prev) {
      prev.setGain(0, 1.5);
      setTimeout(() => prev.stop(), 2500);
    }
  }
  function pauseMusic() {
    _curLoop == null ? void 0 : _curLoop.setGain(0, 0.4);
  }
  function restartMusic(startIdx) {
    if (!_ctx || !_masterGain) return;
    _curLoop == null ? void 0 : _curLoop.stop();
    _curLoop = null;
    _playing = false;
    _curIdx = startIdx !== void 0 ? startIdx : 0;
    beginMusic();
  }
  function duckMusic(targetGain, rampSecs) {
    if (!_masterGain) return;
    const g = _masterGain.gain;
    g.cancelScheduledValues(_ctx.currentTime);
    g.setValueAtTime(Math.max(g.value, 1e-4), _ctx.currentTime);
    g.setTargetAtTime(targetGain, _ctx.currentTime, Math.max(0.01, rampSecs / 3));
  }
  function unduckMusic(rampSecs) {
    if (!_masterGain) return;
    const g = _masterGain.gain;
    g.cancelScheduledValues(_ctx.currentTime);
    g.setValueAtTime(Math.max(g.value, 1e-4), _ctx.currentTime);
    g.setTargetAtTime(0.8, _ctx.currentTime, Math.max(0.01, rampSecs / 3));
  }
  function getAudioContext() {
    return _ctx;
  }
  let _sfxGain = null;
  function ctx() {
    return getAudioContext();
  }
  function initSfx() {
    const c = ctx();
    if (!c || _sfxGain) return;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.ratio.value = 12;
    lim.attack.value = 1e-3;
    lim.release.value = 0.05;
    lim.connect(c.destination);
    _sfxGain = c.createGain();
    _sfxGain.gain.value = 0.85;
    _sfxGain.connect(lim);
  }
  function dest() {
    return _sfxGain;
  }
  function osc(type, freq, attackT, decayT, peakGain, freqEnd) {
    const c = ctx();
    const d = dest();
    if (!c || !d) return;
    const now = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peakGain, now + attackT);
    g.gain.exponentialRampToValueAtTime(1e-4, now + attackT + decayT);
    g.connect(d);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (freqEnd !== void 0)
      o.frequency.exponentialRampToValueAtTime(freqEnd, now + attackT + decayT);
    o.connect(g);
    o.start(now);
    o.stop(now + attackT + decayT + 0.04);
  }
  function noise(filterType, filterFreq, filterQ, decayT, gain, filterFreqEnd) {
    const c = ctx();
    const d = dest();
    if (!c || !d) return;
    const now = c.currentTime;
    const len = Math.ceil(c.sampleRate * (decayT + 0.04));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(filterFreq, now);
    f.Q.value = filterQ;
    if (filterFreqEnd !== void 0)
      f.frequency.exponentialRampToValueAtTime(filterFreqEnd, now + decayT);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(1e-4, now + decayT);
    src.connect(f);
    f.connect(g);
    g.connect(d);
    src.start(now);
    src.stop(now + decayT + 0.04);
  }
  function oscAt(type, freq, when, attackT, decayT, peakGain) {
    const c = ctx();
    const d = dest();
    if (!c || !d) return;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peakGain, when + attackT);
    g.gain.exponentialRampToValueAtTime(1e-4, when + attackT + decayT);
    g.connect(d);
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    o.connect(g);
    o.start(when);
    o.stop(when + attackT + decayT + 0.04);
  }
  function sfxShoot(type) {
    if (!_sfxGain) return;
    if (type === "vulcan") {
      osc("sine", 1800, 1e-3, 0.028, 0.28, 420);
      noise("bandpass", 3200, 4, 0.018, 0.14);
    } else if (type === "beam") {
      osc("sawtooth", 680, 1e-3, 0.09, 0.22, 140);
      osc("square", 340, 1e-3, 0.06, 0.1, 90);
    } else if (type === "missile") {
      noise("bandpass", 280, 3, 0.22, 0.32, 600);
      osc("sine", 120, 0.01, 0.18, 0.18, 55);
    } else if (type === "sword") {
      osc("triangle", 1200, 2e-3, 0.2, 0.3, 180);
      noise("highpass", 3e3, 1.5, 0.14, 0.18);
    }
  }
  function sfxEnemyHit(isWeakPoint) {
    if (!_sfxGain) return;
    if (isWeakPoint) {
      osc("sine", 1100, 1e-3, 0.07, 0.45, 320);
      noise("bandpass", 4200, 3, 0.05, 0.35);
    } else {
      osc("sine", 340, 1e-3, 0.06, 0.32, 110);
      noise("bandpass", 1800, 2, 0.04, 0.22);
    }
  }
  function sfxEnemyDie(isBoss) {
    if (!_sfxGain) return;
    if (isBoss) {
      osc("sine", 80, 2e-3, 0.7, 0.9, 22);
      osc("sine", 160, 2e-3, 0.4, 0.55, 40);
      noise("lowpass", 600, 1, 0.55, 0.75);
      noise("bandpass", 2800, 2, 0.18, 0.45);
    } else {
      osc("sine", 180, 1e-3, 0.2, 0.55, 45);
      noise("bandpass", 2200, 2, 0.12, 0.4);
    }
  }
  function sfxPlayerHurt() {
    if (!_sfxGain) return;
    osc("square", 200, 1e-3, 0.22, 0.45, 55);
    osc("sine", 100, 1e-3, 0.18, 0.38, 40);
    noise("lowpass", 800, 2, 0.14, 0.3);
  }
  function sfxPickup(kind) {
    if (!_sfxGain) return;
    const c = ctx();
    if (!c) return;
    const now = c.currentTime;
    if (kind === "health") {
      oscAt("triangle", 523.3, now, 5e-3, 0.18, 0.36);
      oscAt("triangle", 784, now + 0.09, 5e-3, 0.22, 0.4);
    } else {
      const freqs = [523.3, 659.3, 784, 1047];
      freqs.forEach((f, i) => oscAt("triangle", f, now + i * 0.055, 4e-3, 0.16, 0.32));
    }
  }
  function sfxBoost() {
    if (!_sfxGain) return;
    const c = ctx();
    if (!c) return;
    const d = dest();
    const now = c.currentTime;
    const DUR = 1.85;
    {
      const len = Math.ceil(c.sampleRate * (DUR + 0.1));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.8;
      bp.frequency.setValueAtTime(400, now);
      bp.frequency.exponentialRampToValueAtTime(3200, now + 0.18);
      bp.frequency.exponentialRampToValueAtTime(1800, now + DUR);
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.38, now + 0.08);
      g.gain.setValueAtTime(0.32, now + DUR * 0.6);
      g.gain.exponentialRampToValueAtTime(1e-4, now + DUR);
      src.connect(bp);
      bp.connect(g);
      g.connect(d);
      src.start(now);
      src.stop(now + DUR + 0.05);
    }
    {
      const len = Math.ceil(c.sampleRate * (DUR + 0.1));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b = 0.98 * b + 0.14 * w;
        data[i] = b * 6;
      }
      const src = c.createBufferSource();
      src.buffer = buf;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 0.8;
      lp.frequency.setValueAtTime(200, now);
      lp.frequency.exponentialRampToValueAtTime(900, now + 0.25);
      lp.frequency.exponentialRampToValueAtTime(500, now + DUR);
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.28, now + 0.12);
      g.gain.exponentialRampToValueAtTime(1e-4, now + DUR);
      src.connect(lp);
      lp.connect(g);
      g.connect(d);
      src.start(now);
      src.stop(now + DUR + 0.05);
    }
    {
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.11, now + 0.1);
      g.gain.exponentialRampToValueAtTime(1e-4, now + DUR);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      lp.Q.value = 1;
      lp.connect(g);
      g.connect(d);
      for (const detune of [-8, 0, 8]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(60, now);
        o.frequency.exponentialRampToValueAtTime(220, now + 0.3);
        o.frequency.exponentialRampToValueAtTime(160, now + DUR);
        o.detune.value = detune;
        o.connect(lp);
        o.start(now);
        o.stop(now + DUR + 0.05);
      }
    }
    {
      const len = Math.ceil(c.sampleRate * 0.06);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "highpass";
      bp.frequency.value = 5e3;
      const g = c.createGain();
      g.gain.setValueAtTime(0.28, now);
      g.gain.exponentialRampToValueAtTime(1e-4, now + 0.055);
      src.connect(bp);
      bp.connect(g);
      g.connect(d);
      src.start(now);
      src.stop(now + 0.07);
    }
  }
  function sfxCriticalHit(isBoss) {
    if (!_sfxGain) return;
    const c = ctx();
    const d = dest();
    if (!c || !d) return;
    const now = c.currentTime;
    const scale = isBoss ? 1.4 : 1;
    const echoDelay1 = c.createDelay(0.5);
    echoDelay1.delayTime.value = 0.18;
    const echoDelay2 = c.createDelay(0.5);
    echoDelay2.delayTime.value = 0.36;
    const echoGain1 = c.createGain();
    echoGain1.gain.value = 0.38;
    const echoGain2 = c.createGain();
    echoGain2.gain.value = 0.18;
    const echoHP = c.createBiquadFilter();
    echoHP.type = "highpass";
    echoHP.frequency.value = 300;
    echoDelay1.connect(echoHP);
    echoHP.connect(echoGain1);
    echoGain1.connect(d);
    echoHP.connect(echoDelay2);
    echoDelay2.connect(echoGain2);
    echoGain2.connect(d);
    function withEcho(node) {
      node.connect(d);
      node.connect(echoDelay1);
    }
    for (const [freq, amp, decay] of [
      [1480, 0.7 * scale, 0.9],
      // fundamental clang
      [2960, 0.35 * scale, 0.5],
      // 2nd harmonic
      [4200, 0.2 * scale, 0.32]
      // 3rd harmonic shimmer
    ]) {
      const g = c.createGain();
      g.gain.setValueAtTime(amp, now);
      g.gain.exponentialRampToValueAtTime(1e-4, now + decay);
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, now);
      o.connect(g);
      o.start(now);
      o.stop(now + decay + 0.05);
      withEcho(g);
    }
    {
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.9 * scale, now + 3e-3);
      g.gain.exponentialRampToValueAtTime(1e-4, now + 0.55);
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(isBoss ? 140 : 120, now);
      o.frequency.exponentialRampToValueAtTime(22, now + 0.5);
      o.connect(g);
      o.start(now);
      o.stop(now + 0.6);
      withEcho(g);
    }
    {
      const len = Math.ceil(c.sampleRate * 0.04);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 3500;
      f.Q.value = 1.2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.6 * scale, now);
      g.gain.exponentialRampToValueAtTime(1e-4, now + 0.038);
      src.connect(f);
      f.connect(g);
      g.connect(d);
      src.start(now);
      src.stop(now + 0.05);
    }
    {
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.18 * scale, now + 0.1);
      g.gain.linearRampToValueAtTime(0.22 * scale, now + 0.3);
      g.gain.exponentialRampToValueAtTime(1e-4, now + 1.2);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 900;
      lp.Q.value = 1.5;
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(80, now);
      o.frequency.exponentialRampToValueAtTime(isBoss ? 320 : 260, now + 1);
      o.connect(lp);
      lp.connect(g);
      o.start(now);
      o.stop(now + 1.25);
      withEcho(g);
    }
    {
      const ringFreq = isBoss ? 6800 : 5600;
      const ringDur = isBoss ? 2.2 : 1.6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.28 * scale, now);
      g.gain.exponentialRampToValueAtTime(1e-4, now + ringDur);
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.setValueAtTime(ringFreq, now);
      o.frequency.exponentialRampToValueAtTime(ringFreq * 0.92, now + ringDur);
      o.connect(g);
      o.start(now);
      o.stop(now + ringDur + 0.05);
      withEcho(g);
    }
    if (isBoss) {
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.45, now + 0.06);
      g.gain.exponentialRampToValueAtTime(1e-4, now + 1.4);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 200;
      lp.Q.value = 0.8;
      lp.connect(g);
      g.connect(d);
      const len = Math.ceil(c.sampleRate * 1.5);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.connect(lp);
      src.start(now);
      src.stop(now + 1.5);
    }
  }
  function sfxLevelUp() {
    if (!_sfxGain) return;
    const c = ctx();
    if (!c) return;
    const now = c.currentTime;
    const freqs = [261.6, 329.6, 392, 523.3];
    freqs.forEach((f, i) => {
      oscAt("sawtooth", f, now + i * 0.08, 8e-3, 0.38, 0.26);
      oscAt("sine", f * 2, now + i * 0.08, 8e-3, 0.3, 0.12);
    });
  }
  function makeFlashOverlay() {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;inset:0;background:#fff;pointer-events:none;z-index:9999;opacity:1;transition:opacity 0.08s linear;";
    document.body.appendChild(d);
    return d;
  }
  function makeRay(length, width, color) {
    const geo = new THREE.PlaneGeometry(width, length);
    geo.translate(0, length / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    return new THREE.Mesh(geo, mat);
  }
  function makeSphere(r, color, opacity = 1) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    return new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
  }
  function makeTorus(r, tube, color) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 32), mat);
  }
  function startEpicExplosion(scene2, worldPos, isBoss, onComplete) {
    const pos = worldPos.clone();
    let t = 0;
    let done = false;
    const TOTAL = 2.8;
    const overlay = makeFlashOverlay();
    requestAnimationFrame(() => {
      overlay.style.opacity = "0";
    });
    setTimeout(() => overlay.remove(), 300);
    const root = new THREE.Group();
    root.position.copy(pos);
    scene2.add(root);
    const allMeshes = [];
    function track(m) {
      allMeshes.push(m);
      return m;
    }
    const RAY_COUNT = isBoss ? 14 : 10;
    const rayGroup = track(new THREE.Group());
    root.add(rayGroup);
    const rays = [];
    const rayAngles = [];
    const raySpeeds = [];
    for (let i = 0; i < RAY_COUNT; i++) {
      const baseAngle = i / RAY_COUNT * Math.PI * 2;
      const speed = (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random() * 1.4);
      const len = isBoss ? 3.5 + Math.random() * 4 : 2 + Math.random() * 2.5;
      const width = 0.18 + Math.random() * 0.28;
      const ray = makeRay(len, width, 16777215);
      ray.rotation.z = baseAngle;
      ray.renderOrder = 10;
      rayGroup.add(ray);
      rays.push(ray);
      rayAngles.push(baseAngle);
      raySpeeds.push(speed);
    }
    const coreR = isBoss ? 1 : 0.55;
    const core = track(makeSphere(coreR, 16777215));
    core.renderOrder = 11;
    root.add(core);
    const ringR = isBoss ? 2.2 : 1.3;
    const shockwave = track(makeTorus(ringR, 0.18, 16755268));
    shockwave.renderOrder = 9;
    shockwave.visible = false;
    root.add(shockwave);
    const outerRing = track(makeTorus(ringR * 1.6, 0.1, 16737792));
    outerRing.renderOrder = 9;
    outerRing.visible = false;
    root.add(outerRing);
    const novaMax = isBoss ? 18 : 10;
    const nova = track(makeSphere(0.1, 16777215, 0));
    nova.renderOrder = 12;
    root.add(nova);
    const SPARK_COUNT = isBoss ? 80 : 48;
    const sparkPos = new Float32Array(SPARK_COUNT * 3);
    const sparkVel = new Float32Array(SPARK_COUNT * 3);
    for (let i = 0; i < SPARK_COUNT; i++) {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      const spd = (isBoss ? 4 : 2.5) * (0.4 + Math.random() * 0.6);
      sparkVel[i * 3] = spd * Math.sin(theta) * Math.cos(phi);
      sparkVel[i * 3 + 1] = spd * Math.sin(theta) * Math.sin(phi);
      sparkVel[i * 3 + 2] = spd * Math.cos(theta);
    }
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    const sparkMat = new THREE.PointsMaterial({
      color: 16763972,
      size: isBoss ? 0.18 : 0.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sparks = new THREE.Points(sparkGeo, sparkMat);
    sparks.renderOrder = 10;
    root.add(sparks);
    allMeshes.push(sparks);
    const sparkPositions = sparkPos.slice();
    function lerpColor(a, b, f) {
      const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
      const br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
      return Math.round(ar + (br - ar) * f) << 16 | Math.round(ag + (bg - ag) * f) << 8 | Math.round(ab + (bb - ab) * f);
    }
    function update(dt) {
      if (done) return false;
      const effectiveDt = t < 0.015 ? dt * 0.05 : dt;
      t += effectiveDt;
      if (t >= TOTAL) {
        done = true;
        dispose();
        onComplete();
        return false;
      }
      if (t >= 0.2) {
        const rayT = Math.min(1, (t - 0.2) / 2.2);
        const rayColor = rayT < 0.3 ? lerpColor(16777215, 16746496, rayT / 0.3) : rayT < 0.7 ? lerpColor(16746496, 16763904, (rayT - 0.3) / 0.4) : lerpColor(16763904, 16729088, (rayT - 0.7) / 0.3);
        const rayOpacity = rayT < 0.7 ? 0.9 : 0.9 * (1 - (rayT - 0.7) / 0.3);
        const scaleGrow = 0.3 + rayT * 1.4;
        rays.forEach((ray, i) => {
          const mat = ray.material;
          mat.color.setHex(rayColor);
          mat.opacity = Math.max(0, rayOpacity);
          rayAngles[i] += raySpeeds[i] * effectiveDt;
          ray.rotation.z = rayAngles[i];
          ray.scale.set(scaleGrow * (0.7 + i % 3 * 0.2), scaleGrow, 1);
        });
      }
      if (t >= 0.2) {
        const cT = Math.min(1, (t - 0.2) / 2.2);
        const pulse = 0.85 + 0.15 * Math.sin(t * 22);
        const coreScale = (0.5 + cT * 1.8) * pulse;
        core.scale.setScalar(coreScale);
        const cMat = core.material;
        const cColor = cT < 0.5 ? lerpColor(16777215, 16746496, cT * 2) : lerpColor(16746496, 16720384, (cT - 0.5) * 2);
        cMat.color.setHex(cColor);
        cMat.opacity = cT < 0.8 ? 1 : 1 - (cT - 0.8) / 0.2;
      }
      if (t >= 0.9 && t < 1.8) {
        shockwave.visible = true;
        const sw = (t - 0.9) / 0.9;
        shockwave.scale.setScalar(1 + sw * 3.5);
        const swMat = shockwave.material;
        swMat.opacity = 0.9 * (1 - sw);
      } else {
        shockwave.visible = false;
      }
      if (t >= 1.1 && t < 2) {
        outerRing.visible = true;
        const or = (t - 1.1) / 0.9;
        outerRing.scale.setScalar(1 + or * 5);
        const orMat = outerRing.material;
        orMat.opacity = 0.7 * (1 - or);
      } else {
        outerRing.visible = false;
      }
      if (t >= 0.2) {
        const elapsed2 = t - 0.2;
        const attr = sparks.geometry.attributes["position"];
        for (let i = 0; i < SPARK_COUNT; i++) {
          sparkPositions[i * 3] = sparkVel[i * 3] * elapsed2;
          sparkPositions[i * 3 + 1] = sparkVel[i * 3 + 1] * elapsed2;
          sparkPositions[i * 3 + 2] = sparkVel[i * 3 + 2] * elapsed2;
        }
        attr.array.set(sparkPositions);
        attr.needsUpdate = true;
        const sMat = sparks.material;
        sMat.opacity = Math.max(0, 1 - (t - 0.2) / 2);
      }
      if (t >= 2.1) {
        const nt = (t - 2.1) / 0.7;
        nova.scale.setScalar(nt * novaMax);
        const nMat = nova.material;
        nMat.opacity = nt < 0.4 ? nt / 0.4 : 1 - (nt - 0.4) / 0.6;
      }
      if (t >= 2.35 && t < 2.45) {
        const f = makeFlashOverlay();
        f.style.opacity = String(0.7 * (1 - (t - 2.35) / 0.1));
        setTimeout(() => {
          f.style.opacity = "0";
          setTimeout(() => f.remove(), 200);
        }, 50);
      }
      return true;
    }
    function dispose() {
      scene2.remove(root);
      allMeshes.forEach((m) => {
        if (m.geometry) m.geometry.dispose();
        if (m.material) m.material.dispose();
      });
      sparkGeo.dispose();
      sparkMat.dispose();
    }
    return { update, dispose };
  }
  function createDragInput(element) {
    const state = {
      active: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      pointerId: null,
      deltaX: 0,
      deltaY: 0,
      doubleTapped: false
    };
    let lastTapTime = 0;
    const DOUBLE_TAP_MS = 300;
    function onDown(e) {
      if (state.pointerId !== null) return;
      const now = performance.now();
      if (now - lastTapTime < DOUBLE_TAP_MS) {
        state.doubleTapped = true;
      }
      lastTapTime = now;
      state.active = true;
      state.pointerId = e.pointerId;
      const rect = element.getBoundingClientRect();
      state.startX = e.clientX - rect.left;
      state.startY = e.clientY - rect.top;
      state.currentX = state.startX;
      state.currentY = state.startY;
      state.deltaX = 0;
      state.deltaY = 0;
      element.setPointerCapture(e.pointerId);
    }
    function onMove(e) {
      if (e.pointerId !== state.pointerId) return;
      const rect = element.getBoundingClientRect();
      state.currentX = e.clientX - rect.left;
      state.currentY = e.clientY - rect.top;
      state.deltaX = state.currentX - state.startX;
      state.deltaY = state.currentY - state.startY;
    }
    function onUp(e) {
      if (e.pointerId !== state.pointerId) return;
      state.active = false;
      state.pointerId = null;
      state.deltaX = 0;
      state.deltaY = 0;
    }
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    return {
      state,
      dispose: () => {
        element.removeEventListener("pointerdown", onDown);
        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerup", onUp);
        element.removeEventListener("pointercancel", onUp);
      }
    };
  }
  function createRecoilState() {
    return {
      offset: new THREE.Vector3(),
      velPos: new THREE.Vector3(),
      angleX: 0,
      angleY: 0,
      angleZ: 0,
      velAngX: 0,
      velAngY: 0,
      velAngZ: 0
    };
  }
  function applyRecoilKick(state, posKick, angKick) {
    state.velPos.add(posKick);
    state.velAngX += angKick.x ?? 0;
    state.velAngY += angKick.y ?? 0;
    state.velAngZ += angKick.z ?? 0;
  }
  function updateRecoil(state, dt, stiffness = 220, damping = 20) {
    const apx = -stiffness * state.offset.x - damping * state.velPos.x;
    const apy = -stiffness * state.offset.y - damping * state.velPos.y;
    const apz = -stiffness * state.offset.z - damping * state.velPos.z;
    state.velPos.x += apx * dt;
    state.offset.x += state.velPos.x * dt;
    state.velPos.y += apy * dt;
    state.offset.y += state.velPos.y * dt;
    state.velPos.z += apz * dt;
    state.offset.z += state.velPos.z * dt;
    state.velAngX += (-stiffness * state.angleX - damping * state.velAngX) * dt;
    state.angleX += state.velAngX * dt;
    state.velAngY += (-stiffness * state.angleY - damping * state.velAngY) * dt;
    state.angleY += state.velAngY * dt;
    state.velAngZ += (-stiffness * state.angleZ - damping * state.velAngZ) * dt;
    state.angleZ += state.velAngZ * dt;
    const posRest = state.offset.lengthSq() < 1e-6 && state.velPos.lengthSq() < 1e-6;
    const angRest = Math.abs(state.angleX) < 1e-4 && Math.abs(state.angleY) < 1e-4 && Math.abs(state.angleZ) < 1e-4 && Math.abs(state.velAngX) < 1e-4 && Math.abs(state.velAngY) < 1e-4 && Math.abs(state.velAngZ) < 1e-4;
    if (posRest) {
      state.offset.set(0, 0, 0);
      state.velPos.set(0, 0, 0);
    }
    if (angRest) {
      state.angleX = 0;
      state.angleY = 0;
      state.angleZ = 0;
      state.velAngX = 0;
      state.velAngY = 0;
      state.velAngZ = 0;
    }
  }
  function applyRecoilRotation(state, obj) {
    if (state.angleX !== 0) obj.rotateX(state.angleX);
    if (state.angleY !== 0) obj.rotateY(state.angleY);
    if (state.angleZ !== 0) obj.rotateZ(state.angleZ);
  }
  const EXP_PER_LEVEL = 60;
  const LEVEL_DAMAGE_BONUS = 0.08;
  const LEVEL_HP_BONUS = 20;
  function createPlayerState() {
    return {
      hp: 100,
      maxHp: 100,
      level: 1,
      exp: 0,
      expToNext: EXP_PER_LEVEL,
      score: 0,
      weapons: [{ type: "vulcan", level: 1 }],
      activeWeaponIndex: 0,
      invincibleTimer: 0,
      damageMultiplier: 1
    };
  }
  function applyWeaponPickup(player, kind) {
    if (kind === "health") return { leveled: false, expGained: 0 };
    const wType = kind;
    const existing = player.weapons.find((w) => w.type === wType);
    if (existing) {
      if (existing.level >= MAX_WEAPON_LEVEL) {
        const gained = 30;
        player.exp += gained;
        return { leveled: false, expGained: gained };
      }
      existing.level += 1;
      return { leveled: true, expGained: 0 };
    }
    if (player.weapons.length < 4) {
      player.weapons.push({ type: wType, level: 1 });
    }
    return { leveled: true, expGained: 0 };
  }
  function applyDamageToPlayer(player, dmg) {
    if (player.invincibleTimer > 0) return { downgraded: false };
    player.hp -= dmg;
    player.invincibleTimer = 1.2;
    const downgradeThreshold = player.maxHp * 0.3;
    if (player.hp <= downgradeThreshold && player.weapons.length > 0) {
      const primary = player.weapons[player.activeWeaponIndex];
      if (primary && primary.level > 1) {
        primary.level -= 1;
        return { downgraded: true };
      }
    }
    return { downgraded: false };
  }
  function gainExp(player, amount) {
    player.exp += amount;
    if (player.exp >= player.expToNext) {
      player.exp -= player.expToNext;
      player.level += 1;
      player.expToNext = Math.floor(EXP_PER_LEVEL * Math.pow(1.18, player.level - 1));
      player.maxHp += LEVEL_HP_BONUS;
      player.hp = Math.min(player.hp + LEVEL_HP_BONUS, player.maxHp);
      player.damageMultiplier = 1 + (player.level - 1) * LEVEL_DAMAGE_BONUS;
      return true;
    }
    return false;
  }
  function sphereCollides(aPos, aRadius, bPos, bRadius) {
    return aPos.distanceToSquared(bPos) < (aRadius + bRadius) ** 2;
  }
  function testProjectileEnemy(proj, enemy) {
    const hitRadius = proj.type === "beam" ? 0.4 : 0.25;
    const enemyRadius = enemy.isBoss ? 1.2 : 0.7;
    const pPos = proj.mesh.position;
    const ePos = enemy.root.position;
    for (const wp of enemy.weakPoints) {
      const wpWorld = new THREE.Vector3();
      wp.getWorldPosition(wpWorld);
      if (sphereCollides(pPos, hitRadius, wpWorld, 0.45)) {
        return { hit: true, isWeakPoint: true };
      }
    }
    if (!sphereCollides(pPos, hitRadius, ePos, enemyRadius)) {
      return { hit: false, isWeakPoint: false };
    }
    return { hit: true, isWeakPoint: false };
  }
  function testEnemyShotPlayer(proj, playerPos) {
    return sphereCollides(proj.mesh.position, 0.2, playerPos, 0.6);
  }
  function testPickupPlayer(pickup, playerPos) {
    return sphereCollides(pickup.root.position, 0.4, playerPos, 0.7);
  }
  function applyDamageToEnemy(enemy, damage, isWeakPoint) {
    const actualDmg = enemy.isBoss && isWeakPoint ? damage * 4 : damage;
    enemy.hp -= actualDmg;
    if (enemy.hp <= 0) {
      enemy.dead = true;
      const exp = enemy.isBoss ? 80 : enemy.type === "leopard" ? 20 : 12;
      return { killed: true, expGained: exp };
    }
    return { killed: false, expGained: 0 };
  }
  function testSwordEnemies(playerPos, swordRange, stage) {
    const hits = [];
    const allEnemies = [...stage.enemies, ...stage.boss && !stage.boss.dead ? [stage.boss] : []];
    for (const enemy of allEnemies) {
      if (enemy.dead) continue;
      if (playerPos.distanceTo(enemy.root.position) <= swordRange) {
        hits.push(enemy);
      }
    }
    return hits;
  }
  const active = [];
  function makeTexture(text, opts = {}) {
    const {
      size = 128,
      fontSize = 38,
      color = "#ffffff",
      strokeColor = "#000000",
      glowColor = color,
      bold = true
    } = opts;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx2 = canvas.getContext("2d");
    ctx2.clearRect(0, 0, size, size);
    const weight = bold ? "900" : "700";
    ctx2.font = `${weight} ${fontSize}px system-ui,sans-serif`;
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.shadowColor = glowColor;
    ctx2.shadowBlur = 12;
    ctx2.fillStyle = glowColor;
    ctx2.globalAlpha = 0.4;
    for (let i = 0; i < 3; i++) ctx2.fillText(text, size / 2, size / 2);
    ctx2.globalAlpha = 1;
    ctx2.shadowColor = "rgba(0,0,0,0.9)";
    ctx2.shadowBlur = 5;
    ctx2.shadowOffsetX = 1;
    ctx2.shadowOffsetY = 1;
    ctx2.lineWidth = fontSize * 0.2;
    ctx2.strokeStyle = strokeColor;
    ctx2.lineJoin = "round";
    ctx2.strokeText(text, size / 2, size / 2);
    ctx2.shadowBlur = 0;
    ctx2.shadowOffsetX = 0;
    ctx2.shadowOffsetY = 0;
    ctx2.fillStyle = color;
    ctx2.fillText(text, size / 2, size / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function drawHealthIcon(ctx2, cx, cy, r) {
    ctx2.fillStyle = "#ff3366";
    ctx2.shadowColor = "#ff3366";
    ctx2.shadowBlur = 8;
    ctx2.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx2.shadowBlur = 0;
    ctx2.fillStyle = "#ffffff";
    const t = r * 0.28;
    ctx2.fillRect(cx - r * 0.7, cy - t, r * 1.4, t * 2);
    ctx2.fillRect(cx - t, cy - r * 0.7, t * 2, r * 1.4);
  }
  function drawVulcanIcon(ctx2, cx, cy, r) {
    const bw = r * 0.38, bh = r * 0.72;
    const gap = r * 0.22;
    ctx2.shadowColor = "#00aaff";
    ctx2.shadowBlur = 8;
    ctx2.fillStyle = "#00aaff";
    for (const dx of [-gap - bw / 2, gap + bw / 2]) {
      const x = cx + dx - bw / 2, y = cy - bh / 2;
      const rx = bw / 2;
      ctx2.beginPath();
      ctx2.moveTo(x + rx, y);
      ctx2.lineTo(x + bw - rx, y);
      ctx2.quadraticCurveTo(x + bw, y, x + bw, y + rx);
      ctx2.lineTo(x + bw, y + bh - rx);
      ctx2.quadraticCurveTo(x + bw, y + bh, x + bw - rx, y + bh);
      ctx2.lineTo(x + rx, y + bh);
      ctx2.quadraticCurveTo(x, y + bh, x, y + bh - rx);
      ctx2.lineTo(x, y + rx);
      ctx2.quadraticCurveTo(x, y, x + rx, y);
      ctx2.closePath();
      ctx2.fill();
    }
    ctx2.shadowBlur = 0;
    ctx2.fillStyle = "rgba(180,240,255,0.55)";
    for (const dx of [-gap - bw / 2, gap + bw / 2]) {
      ctx2.fillRect(cx + dx - bw / 2 + bw * 0.25, cy - bh / 2, bw * 0.5, bh * 0.22);
    }
  }
  function drawBeamIcon(ctx2, cx, cy, r) {
    const w = r * 2.1, h = r * 0.38;
    const x = cx - w / 2, y = cy - h / 2;
    ctx2.shadowColor = "#ff00ff";
    ctx2.shadowBlur = 10;
    ctx2.fillStyle = "#cc00cc";
    ctx2.fillRect(x, y, w, h);
    ctx2.shadowBlur = 0;
    ctx2.fillStyle = "#ffffff";
    ctx2.globalAlpha = 0.7;
    ctx2.fillRect(x, cy - h * 0.15, w, h * 0.3);
    ctx2.globalAlpha = 1;
  }
  function drawMissileIcon(ctx2, cx, cy, r) {
    const bw = r * 1.7, bh = r * 0.42;
    ctx2.shadowColor = "#ff8800";
    ctx2.shadowBlur = 8;
    ctx2.fillStyle = "#ff8800";
    ctx2.beginPath();
    ctx2.moveTo(cx - bw / 2, cy - bh / 2);
    ctx2.lineTo(cx + bw * 0.35, cy - bh / 2);
    ctx2.lineTo(cx + bw / 2, cy);
    ctx2.lineTo(cx + bw * 0.35, cy + bh / 2);
    ctx2.lineTo(cx - bw / 2, cy + bh / 2);
    ctx2.closePath();
    ctx2.fill();
    ctx2.shadowBlur = 0;
    ctx2.fillStyle = "rgba(0,0,0,0.3)";
    ctx2.fillRect(cx - bw * 0.15, cy - bh / 2, bw * 0.12, bh);
    ctx2.fillStyle = "#cc5500";
    ctx2.beginPath();
    ctx2.moveTo(cx - bw / 2, cy);
    ctx2.lineTo(cx - bw * 0.3, cy - bh * 0.75);
    ctx2.lineTo(cx - bw * 0.25, cy);
    ctx2.fill();
    ctx2.beginPath();
    ctx2.moveTo(cx - bw / 2, cy);
    ctx2.lineTo(cx - bw * 0.3, cy + bh * 0.75);
    ctx2.lineTo(cx - bw * 0.25, cy);
    ctx2.fill();
  }
  function drawSwordIcon(ctx2, cx, cy, r) {
    ctx2.strokeStyle = "#00ffcc";
    ctx2.lineWidth = r * 0.38;
    ctx2.lineCap = "round";
    ctx2.shadowColor = "#00ffcc";
    ctx2.shadowBlur = 12;
    ctx2.beginPath();
    ctx2.arc(cx - r * 0.3, cy + r * 0.3, r * 1.1, -Math.PI * 0.75, -Math.PI * 0.05);
    ctx2.stroke();
    ctx2.shadowBlur = 0;
    ctx2.strokeStyle = "rgba(180,255,240,0.6)";
    ctx2.lineWidth = r * 0.14;
    ctx2.beginPath();
    ctx2.arc(cx - r * 0.3, cy + r * 0.3, r * 1.1, -Math.PI * 0.75, -Math.PI * 0.05);
    ctx2.stroke();
    ctx2.lineCap = "butt";
  }
  function drawPickupIcon(ctx2, cx, cy, r, kind) {
    if (kind === "health") drawHealthIcon(ctx2, cx, cy, r);
    else if (kind === "vulcan") drawVulcanIcon(ctx2, cx, cy, r);
    else if (kind === "beam") drawBeamIcon(ctx2, cx, cy, r);
    else if (kind === "missile") drawMissileIcon(ctx2, cx, cy, r);
    else if (kind === "sword") drawSwordIcon(ctx2, cx, cy, r);
    else {
      ctx2.fillStyle = "#aaaaaa";
      ctx2.beginPath();
      ctx2.arc(cx, cy, r, 0, Math.PI * 2);
      ctx2.fill();
    }
  }
  function makePickupIconCanvas(kind, sizePx) {
    const c = document.createElement("canvas");
    c.width = sizePx;
    c.height = sizePx;
    const ctx2 = c.getContext("2d");
    ctx2.clearRect(0, 0, sizePx, sizePx);
    drawPickupIcon(ctx2, sizePx / 2, sizePx / 2, sizePx * 0.34, kind);
    return c;
  }
  function makeBannerTexture(line1, line2, color1, color2) {
    const W = 256, H = 128;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx2 = canvas.getContext("2d");
    ctx2.clearRect(0, 0, W, H);
    ctx2.textAlign = "center";
    ctx2.lineJoin = "round";
    function drawLine(text, color, y, size) {
      ctx2.font = `900 ${size}px system-ui,sans-serif`;
      ctx2.shadowColor = color;
      ctx2.shadowBlur = 14;
      ctx2.fillStyle = color;
      ctx2.globalAlpha = 0.4;
      for (let i = 0; i < 3; i++) ctx2.fillText(text, W / 2, y);
      ctx2.globalAlpha = 1;
      ctx2.shadowBlur = 5;
      ctx2.lineWidth = size * 0.2;
      ctx2.strokeStyle = "#000";
      ctx2.strokeText(text, W / 2, y);
      ctx2.shadowBlur = 0;
      ctx2.fillStyle = color;
      ctx2.fillText(text, W / 2, y);
    }
    drawLine(line1, color1, H * 0.36, 40);
    drawLine(line2, color2, H * 0.72, 28);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function spawnDamageNumber(scene2, worldPos, damage, color, isWeakPoint, small = false) {
    const text = isWeakPoint ? `★${Math.round(damage)}` : `${Math.round(damage)}`;
    const texSize = isWeakPoint ? 128 : 96;
    const texFontSize = isWeakPoint ? 52 : 38;
    const tex = makeTexture(text, { size: texSize, fontSize: texFontSize, color, glowColor: color });
    const scale = isWeakPoint ? 1.4 : small ? 0.5 : 0.9;
    const geo = new THREE.PlaneGeometry(scale, scale);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(worldPos);
    mesh.position.x += (Math.random() - 0.5) * 0.5;
    mesh.position.y += (Math.random() - 0.5) * 0.3;
    if (isWeakPoint) mesh.scale.setScalar(1.4);
    scene2.add(mesh);
    const lateralSign = Math.random() < 0.5 ? 1 : -1;
    active.push({
      mesh,
      vx: lateralSign * (0.15 + Math.random() * 0.25),
      vy: 0.8 + Math.random() * 0.5,
      ax: lateralSign * (0.15 + Math.random() * 0.2),
      life: 1.1,
      maxLife: 1.1,
      trackTarget: null,
      trackOffsetY: 0
    });
  }
  function spawnFloat(scene2, tex, worldPos, quadW, quadH, life, vy, vx = 0, ax = 0, trackTarget) {
    const geo = new THREE.PlaneGeometry(quadW, quadH);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(worldPos);
    if (!trackTarget) {
      mesh.position.x += (Math.random() - 0.5) * 0.4;
      mesh.position.y += (Math.random() - 0.5) * 0.2;
    }
    scene2.add(mesh);
    active.push({ mesh, vx, vy, ax, life, maxLife: life, trackTarget, trackOffsetY: 0 });
  }
  function spawnXpFloat(scene2, worldPos, amount) {
    const tex = makeTexture(`+${amount} XP`, {
      size: 128,
      fontSize: 36,
      color: "#aaffaa",
      glowColor: "#44ff44"
    });
    spawnFloat(
      scene2,
      tex,
      worldPos,
      1,
      1,
      1.4,
      1 + Math.random() * 0.4,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 0.15
    );
  }
  function spawnPickupBanner(scene2, worldPos, kind, label, getPlayerPos) {
    const W = 256, H = 96;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx2 = canvas.getContext("2d");
    ctx2.clearRect(0, 0, W, H);
    const iconCx = H / 2, iconCy = H / 2;
    const iconR = H * 0.34;
    drawPickupIcon(ctx2, iconCx, iconCy, iconR, kind);
    ctx2.textAlign = "left";
    ctx2.lineJoin = "round";
    const tx = H + 6;
    const nameColor = kind === "health" ? "#ff6688" : kind === "vulcan" ? "#44ccff" : kind === "missile" ? "#ffaa44" : kind === "beam" ? "#ff66ff" : "#44ffdd";
    const name = kind === "health" ? "HEALTH" : kind.toUpperCase();
    ctx2.font = "900 28px system-ui,sans-serif";
    ctx2.shadowColor = nameColor;
    ctx2.shadowBlur = 10;
    ctx2.fillStyle = nameColor;
    ctx2.globalAlpha = 0.45;
    ctx2.fillText(name, tx, H * 0.4);
    ctx2.globalAlpha = 1;
    ctx2.shadowBlur = 4;
    ctx2.lineWidth = 5;
    ctx2.strokeStyle = "#000";
    ctx2.strokeText(name, tx, H * 0.4);
    ctx2.shadowBlur = 0;
    ctx2.fillText(name, tx, H * 0.4);
    ctx2.font = "700 22px system-ui,sans-serif";
    ctx2.shadowColor = "#ffffff";
    ctx2.shadowBlur = 4;
    ctx2.fillStyle = "#ffffff";
    ctx2.globalAlpha = 0.45;
    ctx2.fillText(label, tx, H * 0.72);
    ctx2.globalAlpha = 1;
    ctx2.shadowBlur = 3;
    ctx2.lineWidth = 4;
    ctx2.strokeStyle = "#000";
    ctx2.strokeText(label, tx, H * 0.72);
    ctx2.shadowBlur = 0;
    ctx2.fillText(label, tx, H * 0.72);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const offset = new THREE.Vector3(0, -0.3, 1.5);
    const bannerPos = worldPos.clone().add(offset);
    const trackTarget = getPlayerPos ? { getPos: () => getPlayerPos().clone().add(offset) } : null;
    spawnFloat(scene2, tex, bannerPos, 1, 0.38, 1.6, 0.35, 0, 0, trackTarget);
  }
  function spawnLevelUpBanner(scene2, worldPos, newLevel, getPlayerPos) {
    const tex = makeBannerTexture(
      "LEVEL UP!",
      `► Level ${newLevel}`,
      "#ffee44",
      "#ffffff"
    );
    const bannerPos = worldPos.clone().add(new THREE.Vector3(0, -0.3, 1.5));
    const trackTarget = getPlayerPos ? { getPos: () => getPlayerPos().clone().add(new THREE.Vector3(0, -0.3, 1.5)) } : null;
    spawnFloat(
      scene2,
      tex,
      bannerPos,
      1.4,
      0.7,
      2.4,
      // smaller quad (was 2.4×1.2)
      0.3,
      // very gentle upward drift
      0,
      0,
      trackTarget
    );
  }
  function updateDamageNumbers(scene2, camera2, dt) {
    var _a;
    for (let i = active.length - 1; i >= 0; i--) {
      const d = active[i];
      d.life -= dt;
      if (d.life <= 0) {
        scene2.remove(d.mesh);
        (_a = d.mesh.material.map) == null ? void 0 : _a.dispose();
        d.mesh.material.dispose();
        d.mesh.geometry.dispose();
        active.splice(i, 1);
        continue;
      }
      d.vx += d.ax * dt;
      if (d.trackTarget) {
        d.trackOffsetY += d.vy * dt;
        const anchor = d.trackTarget.getPos();
        d.mesh.position.set(
          anchor.x + d.vx,
          anchor.y + d.trackOffsetY,
          anchor.z
        );
      } else {
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
      }
      d.mesh.quaternion.copy(camera2.quaternion);
      const t = 1 - d.life / d.maxLife;
      const opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      const mat = d.mesh.material;
      mat.opacity = opacity;
      if (d.mesh.scale.x > 1.3) d.mesh.scale.setScalar(1 + t * 0.25);
    }
  }
  const TOP = "max(10px,env(safe-area-inset-top),var(--sat,0px))";
  const LEFT = "max(10px,env(safe-area-inset-left),var(--sal,0px))";
  const RIGHT = "max(10px,env(safe-area-inset-right),var(--sar,0px))";
  const BOT = "max(10px,env(safe-area-inset-bottom),var(--sab,0px))";
  function el(tag, css, parent) {
    const e = document.createElement(tag);
    e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }
  function createHud(parent) {
    const container2 = el(
      "div",
      "position:absolute;inset:0;pointer-events:none;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;",
      parent
    );
    const topStrip = el(
      "div",
      `position:absolute;top:${TOP};left:${LEFT};right:${RIGHT};display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.42);border-radius:8px;padding:5px 10px;backdrop-filter:blur(4px);`,
      container2
    );
    const scoreEl = el(
      "div",
      "color:#fff;font-size:clamp(11px,2.8vmin,17px);font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,0.7);",
      topStrip
    );
    scoreEl.textContent = "0";
    const stageEl = el(
      "div",
      "color:#aaccff;font-size:clamp(10px,2.5vmin,15px);font-weight:600;letter-spacing:0.04em;",
      topStrip
    );
    stageEl.textContent = "STAGE 1";
    const levelEl = el(
      "div",
      "color:#aaffcc;font-size:clamp(10px,2.5vmin,15px);font-weight:700;",
      topStrip
    );
    levelEl.textContent = "Lv 1";
    const barRowCss = `display:flex;align-items:center;gap:6px;left:${LEFT};right:${RIGHT};position:absolute;`;
    const labelCss = "font-size:clamp(9px,2vmin,12px);font-weight:700;letter-spacing:0.05em;white-space:nowrap;flex-shrink:0;width:clamp(34px,8vmin,50px);text-align:right;text-shadow:0 1px 3px rgba(0,0,0,0.9);";
    const hpRow = el(
      "div",
      barRowCss + `top:calc(${TOP} + clamp(30px,7vmin,46px));`,
      container2
    );
    const hpLabel = el("div", labelCss + "color:rgba(255,120,150,1);", hpRow);
    hpLabel.textContent = "Health";
    const hpTrack = el(
      "div",
      "flex:1;position:relative;height:clamp(12px,3vmin,18px);background:rgba(255,255,255,0.15);border-radius:5px;overflow:hidden;",
      hpRow
    );
    const hpFill = el(
      "div",
      "position:absolute;inset:0;width:100%;background:#ff3366;border-radius:5px;transition:width 0.12s,background 0.3s;",
      hpTrack
    );
    const hpText = el(
      "div",
      "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(8px,1.9vmin,12px);font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);pointer-events:none;",
      hpTrack
    );
    const expRow = el(
      "div",
      barRowCss + `top:calc(${TOP} + clamp(48px,11vmin,70px));`,
      container2
    );
    const expLabel = el("div", labelCss + "color:rgba(140,255,180,1);", expRow);
    expLabel.textContent = "XP";
    const expTrack = el(
      "div",
      "flex:1;height:clamp(7px,1.8vmin,11px);background:rgba(255,255,255,0.10);border-radius:4px;overflow:hidden;",
      expRow
    );
    const expFill = el(
      "div",
      "width:0%;height:100%;background:#88ffaa;border-radius:4px;transition:width 0.3s;",
      expTrack
    );
    const statRow = el(
      "div",
      `position:absolute;top:calc(${TOP} + clamp(62px,14.5vmin,92px));left:${LEFT};right:${RIGHT};display:flex;justify-content:space-between;align-items:center;`,
      container2
    );
    const atkText = el(
      "div",
      "color:rgba(100,220,255,0.9);font-size:clamp(9px,2.2vmin,13px);font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.8);",
      statRow
    );
    const boostEl = el(
      "div",
      "color:rgba(100,220,255,0.9);font-size:clamp(9px,2.2vmin,13px);font-weight:700;text-shadow:0 1px 3px rgba(0,0,0,0.8);letter-spacing:0.04em;",
      statRow
    );
    boostEl.textContent = "BOOST";
    const weaponEl = el(
      "div",
      `position:absolute;bottom:calc(${BOT} + 10px);left:${LEFT};display:flex;flex-direction:column;gap:4px;align-items:flex-start;`,
      container2
    );
    const bossWrap = el(
      "div",
      `position:absolute;bottom:calc(${BOT} + 10px);left:50%;transform:translateX(-50%);width:min(55vmin,280px);display:none;flex-direction:column;align-items:center;gap:3px;`,
      container2
    );
    bossWrap.id = "apeStrikeBossWrap";
    const bossLabel = el(
      "div",
      "color:#ff4444;font-size:clamp(9px,2.2vmin,13px);font-weight:800;letter-spacing:0.08em;text-shadow:0 1px 3px rgba(0,0,0,0.9);",
      bossWrap
    );
    bossLabel.textContent = "⚠ BOSS";
    const bossTrack = el(
      "div",
      "width:100%;height:clamp(6px,1.6vmin,10px);background:rgba(255,255,255,0.18);border-radius:4px;overflow:hidden;",
      bossWrap
    );
    const bossFill = el(
      "div",
      "width:100%;height:100%;background:#ff2200;border-radius:4px;transition:width 0.1s;",
      bossTrack
    );
    const boostReminder = el(
      "div",
      "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:4px;pointer-events:none;",
      container2
    );
    const _brLine1 = el(
      "div",
      "color:#ffee44;font-size:clamp(13px,3.5vmin,22px);font-weight:800;text-shadow:0 0 12px #ffaa00,0 2px 4px rgba(0,0,0,0.9);letter-spacing:0.06em;",
      boostReminder
    );
    _brLine1.textContent = "DOUBLE-TAP TO BOOST";
    const _brLine2 = el(
      "div",
      "color:rgba(255,255,255,0.75);font-size:clamp(10px,2.5vmin,16px);font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.9);",
      boostReminder
    );
    _brLine2.textContent = "cross to the next stage faster";
    const overlay = el(
      "div",
      "position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;background:rgba(0,0,0,0.65);",
      container2
    );
    return {
      hpFill,
      expFill,
      scoreEl,
      stageEl,
      levelEl,
      hpText,
      atkText,
      boostEl,
      boostReminder,
      weaponEl,
      bossWrap,
      bossFill,
      overlay,
      container: container2
    };
  }
  const WEAPON_NAMES = {
    vulcan: "VULCAN",
    missile: "MISSILE",
    beam: "BEAM",
    sword: "SWORD"
  };
  function updateHud(els, player, stageIndex, themeName) {
    const hpPct = Math.max(0, player.hp / player.maxHp) * 100;
    els.hpFill.style.width = `${hpPct}%`;
    els.hpFill.style.background = hpPct > 40 ? "#ff3366" : hpPct > 20 ? "#ff8800" : "#ff2200";
    els.expFill.style.width = `${player.exp / player.expToNext * 100}%`;
    els.scoreEl.textContent = player.score.toLocaleString();
    els.stageEl.textContent = themeName ? `S${stageIndex + 1} ${themeName}` : `STAGE ${stageIndex + 1}`;
    els.levelEl.textContent = `Lv ${player.level}`;
    els.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    els.atkText.textContent = `ATK x${player.damageMultiplier.toFixed(2)}`;
    const desired = player.weapons.map((w) => `${w.type}:${w.level}`).join("|");
    if (els.weaponEl.dataset["weapons"] !== desired) {
      els.weaponEl.dataset["weapons"] = desired;
      els.weaponEl.innerHTML = "";
      for (const w of player.weapons) {
        const pill = document.createElement("div");
        pill.style.cssText = "display:flex;align-items:center;gap:4px;background:rgba(0,0,0,0.55);border-radius:6px;padding:3px 6px;white-space:nowrap;pointer-events:none;";
        const iconSize = 22;
        const iconCanvas = makePickupIconCanvas(w.type, iconSize);
        iconCanvas.style.cssText = `width:${iconSize}px;height:${iconSize}px;flex-shrink:0;`;
        pill.appendChild(iconCanvas);
        const nameEl = document.createElement("span");
        nameEl.style.cssText = "color:#fff;font-size:clamp(8px,2vmin,12px);font-weight:700;letter-spacing:0.04em;";
        nameEl.textContent = WEAPON_NAMES[w.type] ?? w.type.toUpperCase();
        pill.appendChild(nameEl);
        const dotsEl = document.createElement("span");
        dotsEl.style.cssText = "color:rgba(255,255,255,0.7);font-size:clamp(7px,1.8vmin,11px);";
        dotsEl.textContent = String.fromCodePoint(9679).repeat(w.level);
        pill.appendChild(dotsEl);
        els.weaponEl.appendChild(pill);
      }
    }
  }
  function updateBoostHud(els, boostTimer2, boostCooldown2, boostDuration, cooldownTotal) {
    const el2 = els.boostEl;
    if (boostTimer2 > 0) {
      el2.textContent = "BOOSTING";
      el2.style.color = "#ffee44";
      el2.style.textShadow = "0 0 8px #ffaa00, 0 1px 3px rgba(0,0,0,0.8)";
    } else if (boostCooldown2 > 0) {
      const pct = Math.ceil((1 - boostCooldown2 / cooldownTotal) * 100);
      el2.textContent = `BOOST ${pct}%`;
      el2.style.color = "rgba(100,180,255,0.5)";
      el2.style.textShadow = "0 1px 3px rgba(0,0,0,0.8)";
    } else {
      el2.textContent = "BOOST READY";
      el2.style.color = "rgba(100,220,255,0.9)";
      el2.style.textShadow = "0 1px 3px rgba(0,0,0,0.8)";
    }
  }
  function showBossBar(els, hpPct) {
    els.bossWrap.style.display = "flex";
    els.bossFill.style.width = `${Math.max(0, hpPct * 100)}%`;
  }
  function hideBossBar(els) {
    els.bossWrap.style.display = "none";
  }
  function showOverlay(els, title, sub, btnLabel, onBtn) {
    els.overlay.style.display = "flex";
    els.overlay.innerHTML = "";
    const t = document.createElement("div");
    t.textContent = title;
    t.style.cssText = "color:#fff;font-size:clamp(22px,7vmin,48px);font-weight:800;text-shadow:0 2px 8px rgba(0,0,0,0.9);margin-bottom:10px;";
    els.overlay.appendChild(t);
    const s = document.createElement("div");
    s.textContent = sub;
    s.style.cssText = "color:#adf;font-size:clamp(13px,3.5vmin,20px);margin-bottom:28px;";
    els.overlay.appendChild(s);
    const btn = document.createElement("button");
    btn.textContent = btnLabel;
    btn.style.cssText = "pointer-events:auto;background:#0874f7;color:#fff;border:none;border-radius:14px;padding:15px 34px;font-size:clamp(14px,4vmin,20px);font-weight:700;cursor:pointer;min-width:44px;min-height:44px;touch-action:manipulation;";
    btn.addEventListener("click", onBtn);
    els.overlay.appendChild(btn);
  }
  function hideOverlay(els) {
    els.overlay.style.display = "none";
  }
  function createTitleScreen(container2) {
    const root = document.createElement("div");
    root.style.cssText = `
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    pointer-events: auto;
    z-index: 20;
    overflow: hidden;
  `;
    const bg = document.createElement("div");
    bg.style.cssText = `
    position: absolute; inset: 0;
    background: linear-gradient(
      180deg,
      rgba(0,0,0,0.72) 0%,
      rgba(4,8,30,0.55) 38%,
      rgba(4,8,30,0.30) 60%,
      rgba(0,0,0,0.78) 100%
    );
    pointer-events: none;
  `;
    root.appendChild(bg);
    const scanLines = document.createElement("div");
    scanLines.style.cssText = `
    position: absolute; inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 3px,
      rgba(0,0,0,0.10) 3px,
      rgba(0,0,0,0.10) 4px
    );
    pointer-events: none;
  `;
    root.appendChild(scanLines);
    const content = document.createElement("div");
    content.style.cssText = `
    position: relative;
    display: flex; flex-direction: column;
    align-items: center;
    gap: 0;
    width: 100%;
    padding: max(14px, env(safe-area-inset-top), var(--sat, 0px)) 12px 0;
    box-sizing: border-box;
  `;
    root.appendChild(content);
    const subtitle = document.createElement("div");
    subtitle.textContent = "— SPACE DEFENDER OF THE GALAXY —";
    subtitle.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(8px, 2.2vmin, 13px);
    font-weight: 700;
    letter-spacing: 0.22em;
    color: #88ccff;
    text-transform: uppercase;
    text-shadow: 0 0 8px rgba(80,180,255,0.9);
    margin-bottom: 6px;
    opacity: 0.92;
  `;
    content.appendChild(subtitle);
    const titleWrap = document.createElement("div");
    titleWrap.style.cssText = `
    position: relative;
    display: flex; flex-direction: column; align-items: center;
  `;
    content.appendChild(titleWrap);
    const titleShadow = document.createElement("div");
    titleShadow.textContent = "MONKEY SUIT";
    titleShadow.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(36px, 11vmin, 68px);
    font-weight: 900;
    letter-spacing: -0.01em;
    color: #002244;
    text-transform: uppercase;
    position: absolute; top: 3px; left: 3px;
    white-space: nowrap;
    pointer-events: none;
  `;
    titleWrap.appendChild(titleShadow);
    const titleLine1 = document.createElement("div");
    titleLine1.textContent = "MONKEY SUIT";
    titleLine1.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(36px, 11vmin, 68px);
    font-weight: 900;
    letter-spacing: -0.01em;
    color: #ffffff;
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow:
      0 0 12px rgba(80,180,255,1),
      0 0 28px rgba(80,180,255,0.7),
      0 0 50px rgba(80,140,255,0.4);
    position: relative;
    line-height: 1.0;
  `;
    titleWrap.appendChild(titleLine1);
    const titleWrap2 = document.createElement("div");
    titleWrap2.style.cssText = `
    position: relative; display: flex; align-items: center;
    margin-top: -4px;
  `;
    content.appendChild(titleWrap2);
    const titleShadow2 = document.createElement("div");
    titleShadow2.textContent = "BANANDAM";
    titleShadow2.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(48px, 15vmin, 92px);
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #553300;
    text-transform: uppercase;
    position: absolute; top: 4px; left: 4px;
    white-space: nowrap;
    pointer-events: none;
  `;
    titleWrap2.appendChild(titleShadow2);
    const titleLine2 = document.createElement("div");
    titleLine2.textContent = "BANANDAM";
    titleLine2.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(48px, 15vmin, 92px);
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #ffdd44;
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow:
      0 0 10px rgba(255,220,0,1),
      0 0 24px rgba(255,180,0,0.8),
      0 0 48px rgba(255,140,0,0.5);
    position: relative;
    line-height: 1.0;
  `;
    titleWrap2.appendChild(titleLine2);
    const divider = document.createElement("div");
    divider.style.cssText = `
    width: min(72%, 320px);
    height: 2px;
    margin: 10px 0 8px;
    background: linear-gradient(90deg, transparent, #88ccff, #ffdd44, #88ccff, transparent);
    opacity: 0.80;
  `;
    content.appendChild(divider);
    const tagline = document.createElement("div");
    tagline.textContent = "APE WARRIOR · SPACE DEFENDER · BANANA REPUBLIC";
    tagline.style.cssText = `
    font-family: sans-serif;
    font-size: clamp(7px, 1.8vmin, 11px);
    font-weight: 600;
    letter-spacing: 0.18em;
    color: #aaddff;
    text-transform: uppercase;
    opacity: 0.75;
    text-align: center;
    padding: 0 8px;
  `;
    content.appendChild(tagline);
    const tapPrompt = document.createElement("div");
    tapPrompt.textContent = "▶  TAP TO START  ◀";
    tapPrompt.style.cssText = `
    position: absolute;
    bottom: max(52px, calc(env(safe-area-inset-bottom, 0px) + var(--sab, 0px) + 44px));
    left: 50%; transform: translateX(-50%);
    font-family: sans-serif;
    font-size: clamp(13px, 3.5vmin, 20px);
    font-weight: 800;
    letter-spacing: 0.15em;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(80,200,255,1), 0 0 22px rgba(80,180,255,0.7);
    white-space: nowrap;
    pointer-events: none;
  `;
    root.appendChild(tapPrompt);
    container2.appendChild(root);
    let _dismissed = false;
    function update(elapsed2) {
      if (_dismissed) return;
      const pulse = 0.5 + 0.5 * Math.sin(elapsed2 * 3.2);
      tapPrompt.style.opacity = (0.55 + pulse * 0.45).toFixed(2);
      const hue = 40 + Math.sin(elapsed2 * 0.8) * 18;
      titleLine2.style.textShadow = `
      0 0 10px hsla(${hue},100%,55%,1),
      0 0 24px hsla(${hue},100%,50%,0.8),
      0 0 48px hsla(${hue - 10},100%,45%,0.5)
    `;
      const blueHue = 210 + Math.sin(elapsed2 * 1.1) * 15;
      titleLine1.style.textShadow = `
      0 0 12px hsla(${blueHue},90%,75%,1),
      0 0 28px hsla(${blueHue},80%,65%,0.7),
      0 0 50px hsla(${blueHue},70%,55%,0.4)
    `;
    }
    function dismiss(onDone) {
      if (_dismissed) return;
      _dismissed = true;
      root.style.transition = "opacity 0.45s ease-out";
      root.style.opacity = "0";
      setTimeout(() => {
        root.remove();
        onDone();
      }, 460);
    }
    return { root, update, dismiss };
  }
  function applyHeroPose(ship) {
    ship.armR.rotation.set(-1, 0, -0.55);
    ship.armL.rotation.set(-0.65, 0, 0.7);
    ship.headGroup.rotation.set(-0.22, 0, 0);
  }
  function animateHeroPose(ship, elapsed2) {
    ship.recoilPivot.quaternion.identity();
    ship.recoilPivot.rotateZ(Math.sin(elapsed2 * 0.8) * 0.025);
    ship.recoilPivot.rotateX(Math.sin(elapsed2 * 0.55) * 0.018);
    ship.armR.rotation.x = -1 + Math.sin(elapsed2 * 0.9) * 0.04;
    ship.armR.rotation.z = -0.55 + Math.sin(elapsed2 * 0.65) * 0.03;
    ship.armL.rotation.x = -0.65 + Math.sin(elapsed2 * 0.9 + 0.4) * 0.04;
    ship.armL.rotation.z = 0.7 + Math.sin(elapsed2 * 0.65 + 0.4) * 0.03;
    ship.tail.rotation.x = Math.sin(elapsed2 * 1.8) * 0.35;
    ship.tail.rotation.z = Math.sin(elapsed2 * 1.4) * 0.2;
  }
  const bursts = [];
  const flashes = [];
  function spawnBurst(scene2, pos, count, color, speed, life, size) {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = speed * (0.5 + Math.random() * 0.5);
      velocities[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      velocities[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      velocities[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    scene2.add(points);
    bursts.push({ points, velocities, life, maxLife: life });
  }
  function spawnObstacleSpark(scene2, pos) {
    spawnBurst(scene2, pos, 12, 16755251, 4.5, 0.35, 0.12);
    spawnBurst(scene2, pos, 6, 13421772, 2.5, 0.25, 0.08);
  }
  function spawnEnemyHitBurst(scene2, pos, isWeakPoint) {
    const color = isWeakPoint ? 16776960 : 16737792;
    const color2 = isWeakPoint ? 16777215 : 16720384;
    const count = isWeakPoint ? 20 : 12;
    const speed = isWeakPoint ? 6 : 4;
    spawnBurst(scene2, pos, count, color, speed, 0.45, 0.14);
    spawnBurst(scene2, pos, count / 2, color2, speed * 0.6, 0.3, 0.1);
  }
  function emitSmokePuff(scene2, pos) {
    spawnBurst(scene2, pos, 3, 11184810, 0.8, 0.5, 0.09);
  }
  function spawnEnemyDeathBurst(scene2, pos, isBoss) {
    const count = isBoss ? 60 : 28;
    const speed = isBoss ? 10 : 6;
    spawnBurst(scene2, pos, count, 16729088, speed, isBoss ? 0.9 : 0.6, 0.18);
    spawnBurst(scene2, pos, count / 2, 16763904, speed * 0.7, isBoss ? 0.8 : 0.5, 0.14);
    spawnBurst(scene2, pos, count / 3, 16777215, speed * 1.2, isBoss ? 0.6 : 0.4, 0.1);
  }
  const debrisChunks = [];
  function spawnObstacleDebris(scene2, pos) {
    spawnBurst(scene2, pos, 18, 8943462, 7, 0.7, 0.13);
    spawnBurst(scene2, pos, 10, 16755268, 5, 0.4, 0.1);
    const count = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const size = 0.08 + Math.random() * 0.18;
      const geo = new THREE.IcosahedronGeometry(size, 0);
      const colVal = 5596791 + Math.floor(Math.random() * 1118481);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: colVal })
      );
      mesh.position.copy(pos);
      mesh.scale.set(
        0.7 + Math.random() * 0.6,
        0.7 + Math.random() * 0.6,
        0.7 + Math.random() * 0.6
      );
      scene2.add(mesh);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const spd = 3 + Math.random() * 5;
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.sin(phi) * Math.sin(theta) * spd,
        Math.cos(phi) * spd
      );
      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6
      );
      const life = 0.5 + Math.random() * 0.5;
      debrisChunks.push({ mesh, vel, rotVel, life, maxLife: life });
    }
  }
  const swordArcs = [];
  function spawnSwordArc(scene2, origin, aimDir, color, radius) {
    const arcGeo = new THREE.TorusGeometry(radius * 0.7, 0.06, 5, 20, Math.PI * 1.1);
    const arcMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(arcGeo, arcMat);
    mesh.position.copy(origin);
    if (aimDir.lengthSq() > 0.01) {
      const up = new THREE.Vector3(0, 1, 0);
      mesh.quaternion.setFromUnitVectors(up, aimDir.clone().normalize());
    }
    mesh.rotateOnAxis(aimDir.clone().normalize(), Math.random() * Math.PI * 2);
    scene2.add(mesh);
    swordArcs.push({ mesh, life: 0.35, maxLife: 0.35, rotSpeed: (Math.random() > 0.5 ? 1 : -1) * 8 });
    spawnBurst(scene2, origin, 14, color, 5, 0.3, 0.12);
    spawnBurst(scene2, origin, 6, 16777215, 3, 0.2, 0.08);
  }
  function spawnHitFlash(meshes, isWeakPoint) {
    const flashColor = isWeakPoint ? 16777215 : 16746496;
    const origColors = [];
    for (const mesh of meshes) {
      const mat = mesh.material;
      origColors.push(mat.color.getHex());
      mat.color.setHex(flashColor);
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      if (flashes[i].targets === meshes) flashes.splice(i, 1);
    }
    flashes.push({ targets: meshes, origColors, timer: isWeakPoint ? 0.12 : 0.08 });
  }
  function updateEffects(scene2, dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        scene2.remove(b.points);
        b.points.geometry.dispose();
        b.points.material.dispose();
        bursts.splice(i, 1);
        continue;
      }
      const posAttr = b.points.geometry.attributes["position"];
      const arr = posAttr.array;
      const fade = b.life / b.maxLife;
      const mat = b.points.material;
      mat.opacity = fade * fade;
      for (let p = 0; p < arr.length / 3; p++) {
        arr[p * 3] += b.velocities[p * 3] * dt;
        arr[p * 3 + 1] += b.velocities[p * 3 + 1] * dt;
        arr[p * 3 + 2] += b.velocities[p * 3 + 2] * dt;
        b.velocities[p * 3] *= 0.96;
        b.velocities[p * 3 + 1] *= 0.96;
        b.velocities[p * 3 + 2] *= 0.96;
      }
      posAttr.needsUpdate = true;
    }
    for (let i = debrisChunks.length - 1; i >= 0; i--) {
      const d = debrisChunks[i];
      d.life -= dt;
      if (d.life <= 0) {
        scene2.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh.material.dispose();
        debrisChunks.splice(i, 1);
        continue;
      }
      d.mesh.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(0.88);
      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;
      d.mesh.rotation.z += d.rotVel.z * dt;
      const fade = d.life / d.maxLife;
      d.mesh.material.opacity = fade;
      d.mesh.material.transparent = true;
    }
    for (let i = swordArcs.length - 1; i >= 0; i--) {
      const a = swordArcs[i];
      a.life -= dt;
      if (a.life <= 0) {
        scene2.remove(a.mesh);
        a.mesh.geometry.dispose();
        a.mesh.material.dispose();
        swordArcs.splice(i, 1);
        continue;
      }
      a.mesh.rotation.y += a.rotSpeed * dt;
      const fade = a.life / a.maxLife;
      const mat = a.mesh.material;
      mat.opacity = fade * 0.9;
      const s = 1 + (1 - fade) * 0.5;
      a.mesh.scale.setScalar(s);
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.timer -= dt;
      if (f.timer <= 0) {
        for (let m = 0; m < f.targets.length; m++) {
          const mat = f.targets[m].material;
          mat.color.setHex(f.origColors[m]);
        }
        flashes.splice(i, 1);
      }
    }
  }
  const TRAIL_POINTS = 8;
  const TRAIL_SPACING = 0.055;
  function createBulletTrail(scene2, color) {
    const history = new Float32Array(TRAIL_POINTS * 3);
    const positions = new Float32Array(TRAIL_POINTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.22,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene2.add(pts);
    return {
      points: pts,
      geo,
      mat,
      history,
      writeIdx: 0,
      alive: true,
      timeSinceSample: 0
    };
  }
  function updateBulletTrail(trail, bulletPos, dt) {
    trail.timeSinceSample += dt;
    if (trail.timeSinceSample >= TRAIL_SPACING / 7) {
      const idx = trail.writeIdx % TRAIL_POINTS;
      trail.history[idx * 3] = bulletPos.x;
      trail.history[idx * 3 + 1] = bulletPos.y;
      trail.history[idx * 3 + 2] = bulletPos.z;
      trail.writeIdx++;
      trail.timeSinceSample = 0;
    }
    const posAttr = trail.geo.attributes["position"];
    const total = Math.min(trail.writeIdx, TRAIL_POINTS);
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const histIdx = ((trail.writeIdx - 1 - i) % TRAIL_POINTS + TRAIL_POINTS) % TRAIL_POINTS;
      if (i < total) {
        posAttr.setXYZ(
          i,
          trail.history[histIdx * 3],
          trail.history[histIdx * 3 + 1],
          trail.history[histIdx * 3 + 2]
        );
      } else {
        posAttr.setXYZ(i, bulletPos.x, bulletPos.y, bulletPos.z);
      }
    }
    posAttr.needsUpdate = true;
    trail.mat.opacity = 0.75;
  }
  function removeBulletTrail(scene2, trail) {
    scene2.remove(trail.points);
    trail.geo.dispose();
    trail.mat.dispose();
    trail.alive = false;
  }
  const _streaks = [];
  const POOL_SIZE = 40;
  const _pool = [];
  function getPooledMesh() {
    return _pool.pop() ?? null;
  }
  function returnToPool(mesh, scene2) {
    scene2.remove(mesh);
    mesh.visible = false;
    _pool.push(mesh);
  }
  function makeMesh() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 16777215,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    return mesh;
  }
  function ensurePool() {
    while (_pool.length < POOL_SIZE) _pool.push(makeMesh());
  }
  function streakColor(boostNorm) {
    if (boostNorm > 0.85) return 16777215;
    if (boostNorm > 0.55) return 11197951;
    return 8965375;
  }
  function spawnBoostStreaks(scene2, playerPos, forward, right, up, boostNorm, dt, camPos) {
    ensurePool();
    if (boostNorm < 0.05) return;
    const spawnRate = boostNorm * boostNorm * 28;
    const spawnCount = Math.floor(spawnRate * dt + Math.random());
    if (spawnCount <= 0) return;
    const color = streakColor(boostNorm);
    for (let s = 0; s < spawnCount; s++) {
      const mesh = getPooledMesh() ?? makeMesh();
      const spread = 2.5 + boostNorm * 3.5;
      const lateralX = (Math.random() - 0.5) * spread;
      const lateralY = (Math.random() - 0.5) * spread * 0.65;
      const edgeBias = Math.random() < 0.6 ? Math.random() < 0.5 ? 1 : -1 : 0;
      const ox = lateralX + edgeBias * (spread * 0.5);
      const oy = lateralY;
      const t = 0.15 + Math.random() * 0.55;
      const spawnPos = camPos.clone().lerp(playerPos, t).addScaledVector(right, ox).addScaledVector(up, oy);
      mesh.position.copy(spawnPos);
      const length = (0.8 + Math.random() * 1.4) * (0.4 + boostNorm * 2.2);
      const width = 0.022 + Math.random() * 0.028;
      new THREE.Vector3(0, 1, 0);
      const lookAxis = forward.clone();
      const defaultUp = new THREE.Vector3(0, 1, 0);
      const alignQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, lookAxis);
      mesh.quaternion.copy(alignQuat);
      const rollQuat = new THREE.Quaternion().setFromAxisAngle(forward, (Math.random() - 0.5) * 0.4);
      mesh.quaternion.premultiply(rollQuat);
      mesh.scale.set(width, length, 1);
      const mat = mesh.material;
      mat.color.setHex(color);
      const baseOpacity = 0.55 + boostNorm * 0.4;
      mat.opacity = baseOpacity * (0.7 + Math.random() * 0.3);
      mesh.visible = true;
      scene2.add(mesh);
      const streakSpeed = (18 + Math.random() * 22) * boostNorm;
      const vel = forward.clone().multiplyScalar(-streakSpeed);
      vel.addScaledVector(right, (Math.random() - 0.5) * 1.5);
      vel.addScaledVector(up, (Math.random() - 0.5) * 0.8);
      const maxLife = 0.06 + Math.random() * 0.09;
      _streaks.push({ mesh, life: maxLife, maxLife, vel });
    }
  }
  function updateBoostStreaks(scene2, dt) {
    for (let i = _streaks.length - 1; i >= 0; i--) {
      const s = _streaks[i];
      s.life -= dt;
      if (s.life <= 0) {
        returnToPool(s.mesh, scene2);
        _streaks.splice(i, 1);
        continue;
      }
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(0.92);
      const t = s.life / s.maxLife;
      const mat = s.mesh.material;
      mat.opacity = t * t * 0.95;
    }
  }
  function clearBoostStreaks(scene2) {
    for (const s of _streaks) returnToPool(s.mesh, scene2);
    _streaks.length = 0;
  }
  const PROJ_COLOR = {
    vulcan: "#00ffff",
    missile: "#ff8800",
    beam: "#ff00ff"
  };
  hardenViewport();
  hardenGestures();
  const container = document.getElementById("game");
  if (!container) throw new Error("#game container not found");
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(GAME_WIDTH, GAME_HEIGHT);
  configureRenderer(renderer);
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);
  scene.fog = new THREE.FogExp2(COLORS.background, 0.028);
  const _skyColor = new THREE.Color(COLORS.background);
  const _starColor = new THREE.Color(16777215);
  let _fogDensity = 0.028;
  function applyTheme(theme, alpha) {
    _skyColor.lerp(new THREE.Color(theme.skyColor), alpha);
    _starColor.lerp(new THREE.Color(theme.starColor), alpha);
    _fogDensity += (theme.fogDensity - _fogDensity) * alpha;
    scene.background.copy(_skyColor);
    scene.fog.color.copy(_skyColor);
    scene.fog.density = _fogDensity;
    const starMat = starfield.points.material;
    starMat.color.copy(_starColor);
    starMat.opacity = theme.starOpacity;
  }
  const camera = new THREE.PerspectiveCamera(55, GAME_WIDTH / GAME_HEIGHT, 0.1, 300);
  observeContainerResize(container, renderer, camera);
  createLightingRig(scene, 20);
  const starfield = createStarfield(1400);
  starfield.points.material.fog = false;
  scene.add(starfield.points);
  const reticleGroup = new THREE.Group();
  const reticleRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.03, 6, 24),
    new THREE.MeshBasicMaterial({ color: 16720418 })
  );
  const reticleCross = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.03),
    new THREE.MeshBasicMaterial({ color: 16720418, side: THREE.DoubleSide })
  );
  const reticleCrossV = new THREE.Mesh(
    new THREE.PlaneGeometry(0.03, 0.55),
    new THREE.MeshBasicMaterial({ color: 16720418, side: THREE.DoubleSide })
  );
  reticleGroup.add(reticleRing);
  reticleGroup.add(reticleCross);
  reticleGroup.add(reticleCrossV);
  scene.add(reticleGroup);
  let reticleAimX = 0;
  let reticleAimY = 0;
  let rawInputX = 0;
  let rawInputY = 0;
  const playerShip = createPlayerShip();
  scene.add(playerShip.root);
  const playerOrigColors = /* @__PURE__ */ new Map();
  playerShip.root.traverse((child) => {
    const mesh = child;
    if (!mesh.isMesh) return;
    const mat = mesh.material;
    if (mat.color) playerOrigColors.set(mesh, mat.color.getHex());
  });
  const keyboard = new KeyboardInput();
  const drag = createDragInput(renderer.domElement);
  {
    let _audioStarted = false;
    const _startOnGesture = async () => {
      if (_audioStarted) return;
      _audioStarted = true;
      await startAudio();
      initSfx();
      playThemeTrack(currentStage.themeIndex);
      beginMusic();
    };
    renderer.domElement.addEventListener("pointerdown", _startOnGesture, { once: true });
    window.addEventListener("keydown", _startOnGesture, { once: true });
  }
  const hud = createHud(container);
  let titleScreen = createTitleScreen(container);
  function dismissTitle() {
    if (!titleScreen) return;
    titleScreen.dismiss(() => {
      gameState.phase = "playing";
      titleScreen = null;
    });
  }
  titleScreen.root.addEventListener("pointerdown", () => dismissTitle(), { once: true });
  window.addEventListener("keydown", () => dismissTitle(), { once: true });
  const gameState = {
    phase: "title",
    stageIndex: 0,
    player: createPlayerState()
  };
  const _stage0 = generateStage(0);
  const _stage1 = generateStage(1);
  let worldTrack = createInitialTrack(_stage0, _stage1);
  let activeStages = [_stage0, _stage1];
  let currentStage = _stage0;
  let nextStageIndex = 2;
  const playerProjectiles = [];
  const enemyProjectiles = [];
  const enemyProjectileTrails = [];
  let swordState = null;
  let swordSwingCooldown = 0;
  let swordAnim = null;
  const SWORD_RAISE_T = 0.12;
  const SWORD_SLASH_T = 0.1;
  const SWORD_RECOVER_T = 0.12;
  let worldDist = 0;
  const RAIL_SPEED = 0.045;
  const BASE_STAGE_LENGTH = 80;
  let smoothForward = new THREE.Vector3(0, 0, -1);
  let smoothRight = new THREE.Vector3(1, 0, 0);
  let smoothUp = new THREE.Vector3(0, 1, 0);
  const impromptuEnemies = [];
  let impromptuSpawnCooldown = 0;
  let activeExplosion = null;
  const BOOST_DURATION = 1.8;
  const BOOST_COOLDOWN = 4;
  const BOOST_MULTIPLIER = 3.2;
  let boostTimer = 0;
  let boostCooldown = 0;
  let boostFactor = 1;
  const _keyLastPress = /* @__PURE__ */ new Map();
  const DOUBLE_KEY_MS = 250;
  let playerOffsetX = 0;
  let playerOffsetY = 0;
  const MAX_OFFSET_X = 3.8;
  const MAX_OFFSET_Y = 2.2;
  let targetOffsetX = 0;
  let targetOffsetY = 0;
  const shootTimers = /* @__PURE__ */ new Map();
  const playerRecoil = createRecoilState();
  const enemyRecoilMap = /* @__PURE__ */ new WeakMap();
  function getEnemyRecoil(enemy) {
    let r = enemyRecoilMap.get(enemy.shakeGroup);
    if (!r) {
      r = createRecoilState();
      enemyRecoilMap.set(enemy.shakeGroup, r);
    }
    return r;
  }
  function shakeEnemy(enemy, isWeakPoint) {
    if (enemy.isBoss && !isWeakPoint) return;
    enemy.shakeTimer = enemy.shakeMax;
  }
  let elapsed = 0;
  let vernierInputX = 0;
  let vernierInputY = 0;
  let prevOffsetX = 0;
  let prevOffsetY = 0;
  const HURT_DURATION = 1.2;
  let hurtTimer = 0;
  function segmentForStage(stage) {
    return worldTrack.segments.find((s) => s.stage === stage) ?? null;
  }
  function addStageObjects(stage, grantIframes = false) {
    if (stage.boss && !stage.boss.dead) {
      scene.add(stage.boss.root);
      stage.boss.inScene = true;
      stage.boss.flyIn = "arrived";
    }
    for (const p of stage.pickups) scene.add(p.root);
    for (const o of stage.obstacles) scene.add(o.root);
    if (grantIframes) {
      gameState.player.invincibleTimer = Math.max(gameState.player.invincibleTimer, 2.5);
    }
  }
  function removeStageObjects(stage) {
    for (const e of stage.enemies) {
      if (e.inScene) {
        scene.remove(e.root);
        e.inScene = false;
      }
    }
    if (stage.boss && stage.boss.inScene) {
      scene.remove(stage.boss.root);
      stage.boss.inScene = false;
    }
    for (const p of stage.pickups) scene.remove(p.root);
    for (const o of stage.obstacles) scene.remove(o.root);
  }
  function placeEntityOnSegment(obj, seg, spawnT, ox, oy) {
    obj.position.copy(getEntityWorldPosition(seg, spawnT, ox, oy));
  }
  for (const s of activeStages) addStageObjects(s, true);
  const DRAG_SENSITIVITY = 8e-3;
  function readInput(dt) {
    const dragDX = drag.state.active ? drag.state.deltaX * DRAG_SENSITIVITY : 0;
    const dragDY = drag.state.active ? -drag.state.deltaY * DRAG_SENSITIVITY : 0;
    const kv = keyboard.getMoveVector();
    if (drag.state.active && (drag.state.deltaX !== 0 || drag.state.deltaY !== 0)) {
      rawInputX = Math.max(-1, Math.min(1, drag.state.deltaX / 12));
      rawInputY = Math.max(-1, Math.min(1, -drag.state.deltaY / 12));
    } else {
      rawInputX = kv.x;
      rawInputY = -kv.y;
    }
    if (drag.state.active) {
      drag.state.startX = drag.state.currentX;
      drag.state.startY = drag.state.currentY;
      drag.state.deltaX = 0;
      drag.state.deltaY = 0;
    }
    if (drag.state.doubleTapped) {
      drag.state.doubleTapped = false;
      tryActivateBoost();
    }
    const boostKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    for (const code of boostKeys) {
      if (keyboard.isDown(code)) {
        const last = _keyLastPress.get(code) ?? -9999;
        const now = performance.now();
        if (now - last < DOUBLE_KEY_MS && last > 0) {
          tryActivateBoost();
          _keyLastPress.set(code, -9999);
        } else if (last < 0 || now - last > DOUBLE_KEY_MS) {
          _keyLastPress.set(code, now);
        }
      }
    }
    const kx = kv.x * 4 * dt;
    const ky = -kv.y * 4 * dt;
    targetOffsetX = Math.max(-MAX_OFFSET_X, Math.min(MAX_OFFSET_X, targetOffsetX + dragDX + kx));
    targetOffsetY = Math.max(-MAX_OFFSET_Y, Math.min(MAX_OFFSET_Y, targetOffsetY + dragDY + ky));
  }
  function tryActivateBoost() {
    if (boostTimer > 0 || boostCooldown > 0) return;
    boostTimer = BOOST_DURATION;
    boostCooldown = BOOST_COOLDOWN;
    sfxBoost();
    duckMusic(0.28, 0.12);
  }
  function doShooting(dt, playerPos, forward) {
    const player = gameState.player;
    const allEnemies = [
      ...activeStages.flatMap((s) => s.enemies),
      ...impromptuEnemies,
      ...activeStages.flatMap((s) => s.boss && !s.boss.dead ? [s.boss] : [])
    ].filter((e) => !e.dead && e.inScene);
    const MISSILE_LOCK_RANGE = 18;
    let nearestEnemy = null;
    let nearestDist = Infinity;
    for (const e of allEnemies) {
      const d = playerPos.distanceTo(e.root.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = e;
      }
    }
    const missileTarget = nearestEnemy && nearestDist <= MISSILE_LOCK_RANGE ? nearestEnemy : null;
    for (const weapon of player.weapons) {
      if (weapon.type === "sword") continue;
      const fireRate = weapon.type === "vulcan" ? 5 : weapon.type === "missile" ? 1.5 + weapon.level * 0.3 : 1.5;
      const key = weapon.type;
      const timer = (shootTimers.get(key) ?? 0) + dt;
      const fireInterval = 1 / fireRate;
      if (timer >= fireInterval) {
        shootTimers.set(key, timer - fireInterval);
        const muzzlePos = getMuzzlePosition(playerShip, weapon.type);
        const shots = fireWeapon(
          weapon,
          muzzlePos,
          forward.clone(),
          player.damageMultiplier,
          weapon.type === "missile" ? missileTarget : null
        );
        for (const s of shots) {
          scene.add(s.mesh);
          playerProjectiles.push(s);
        }
        sfxShoot(weapon.type);
        const wt = weapon.type;
        const posStrength = wt === "beam" ? 0.55 : wt === "missile" ? 0.7 : wt === "sword" ? 0.3 : 0.22;
        const pitchKick = wt === "beam" ? -0.18 : wt === "missile" ? -0.24 : wt === "sword" ? -0.12 : -0.07;
        const rollKick = (Math.random() - 0.5) * (weapon.type === "missile" ? 0.14 : 0.06);
        const posDir = forward.clone().multiplyScalar(posStrength);
        applyRecoilKick(playerRecoil, posDir, { x: pitchKick, z: rollKick });
      } else {
        shootTimers.set(key, timer);
      }
    }
  }
  function doSword(dt, playerPos, aimDir) {
    if (!swordState) return;
    if (swordAnim === null) swordSwingCooldown -= dt;
    if (swordSwingCooldown <= 0 && swordAnim === null) {
      swordSwingCooldown = 1 / swordState.attackRate;
      const allNear = [
        ...activeStages.flatMap((s) => s.enemies),
        ...impromptuEnemies,
        ...activeStages.flatMap((s) => s.boss && !s.boss.dead ? [s.boss] : [])
      ].filter((e) => !e.dead && e.inScene && playerPos.distanceTo(e.root.position) <= swordState.range);
      let targetDir = aimDir.clone();
      if (allNear.length > 0) {
        const nearest = allNear.reduce((a, b) => playerPos.distanceTo(a.root.position) < playerPos.distanceTo(b.root.position) ? a : b);
        targetDir = nearest.root.position.clone().sub(playerPos).normalize();
      }
      swordAnim = { phase: "raise", timer: 0, targetDir };
    }
    if (swordAnim !== null) {
      swordAnim.timer += dt;
      const { phase, timer, targetDir } = swordAnim;
      if (phase === "raise") {
        const t = Math.min(1, timer / SWORD_RAISE_T);
        playerShip.swordBlade.visible = true;
        playerShip.swordBlade.position.z = -0.85 + (1 - t) * 0.8;
        playerShip.swordBlade.scale.set(1, 1, t);
        if (targetDir) {
          const tiltQ = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, -1),
            targetDir.clone().normalize()
          );
          playerShip.root.quaternion.slerp(tiltQ, t * 0.4);
        }
        if (timer >= SWORD_RAISE_T) swordAnim = { phase: "slash", timer: 0, targetDir };
      } else if (phase === "slash") {
        if (timer < dt * 2) {
          const stageHits = activeStages.flatMap((s) => testSwordEnemies(playerPos, swordState.range, s));
          const impHits = impromptuEnemies.filter(
            (e) => !e.dead && e.inScene && playerPos.distanceTo(e.root.position) <= swordState.range
          );
          const hits = [...stageHits, ...impHits];
          for (const enemy of hits) {
            const result = applyDamageToEnemy(enemy, swordState.damage, false);
            if (result.killed) {
              const leveled = gainExp(gameState.player, result.expGained);
              if (result.expGained > 0) spawnXpFloat(scene, enemy.root.position.clone(), result.expGained);
              if (leveled) {
                sfxLevelUp();
                spawnLevelUpBanner(scene, playerPos.clone(), gameState.player.level, () => playerShip.root.position.clone());
              }
              gameState.player.score += enemy.isBoss ? 500 : 100;
              sfxEnemyDie(enemy.isBoss);
              spawnEnemyDeathBurst(scene, enemy.root.position.clone(), enemy.isBoss);
              scene.remove(enemy.root);
              enemy.inScene = false;
            } else {
              shakeEnemy(enemy, false);
              spawnEnemyHitBurst(scene, enemy.root.position.clone(), false);
              spawnHitFlash(getEnemyMeshes(enemy), false);
            }
          }
          for (const obs of activeStages.flatMap((s) => s.obstacles)) {
            if (obs.dead) continue;
            if (playerPos.distanceTo(obs.root.position) <= swordState.range * 1.5) {
              obs.dead = true;
              scene.remove(obs.root);
              spawnObstacleDebris(scene, obs.root.position.clone());
            }
          }
          spawnSwordArc(scene, playerPos.clone(), targetDir ?? aimDir, 65535, swordState.range);
        }
        const t = Math.min(1, timer / SWORD_SLASH_T);
        playerShip.swordBlade.rotation.y = t * Math.PI * 1.2;
        if (timer >= SWORD_SLASH_T) swordAnim = { phase: "recover", timer: 0, targetDir };
      } else {
        const t = Math.min(1, timer / SWORD_RECOVER_T);
        playerShip.swordBlade.scale.set(1, 1, 1 - t);
        if (timer >= SWORD_RECOVER_T) {
          swordAnim = null;
          playerShip.swordBlade.visible = false;
          playerShip.swordBlade.scale.set(1, 1, 1);
          playerShip.swordBlade.rotation.y = 0;
          playerShip.swordBlade.position.z = -0.85;
        }
      }
    }
    if (swordAnim === null) playerShip.swordBlade.visible = false;
  }
  const POLY_SHAPES = [
    // Triangle
    [[0, 1], [-0.87, -0.5], [0.87, -0.5]],
    // Square
    [[0, 1], [-1, 0], [0, -1], [1, 0]],
    // Pentagon
    [[0, 1], [-0.95, 0.31], [-0.59, -0.81], [0.59, -0.81], [0.95, 0.31]]
  ];
  function getMotionOffset(enemy, t) {
    const { motionPattern: pat, motionPhase: ph, motionAmp: amp } = enemy;
    const speed = enemy.isBoss ? 0.6 : 1;
    const a = t * speed + ph;
    if (pat === "h") {
      return [Math.sin(a * 1.5) * amp, 0];
    }
    if (pat === "v") {
      return [0, Math.sin(a * 1.2) * amp * 0.7];
    }
    if (pat === "circle") {
      const r = amp * 0.75;
      return [Math.cos(a * 0.9) * r, Math.sin(a * 0.9) * r * 0.55];
    }
    const shape = POLY_SHAPES[Math.floor(enemy.spawnT * 31 % POLY_SHAPES.length)];
    const n = shape.length;
    const loopT = a * 0.35 % (Math.PI * 2) / (Math.PI * 2);
    const seg = loopT * n;
    const idx0 = Math.floor(seg) % n;
    const idx1 = (idx0 + 1) % n;
    const frac = seg - Math.floor(seg);
    const smooth = frac * frac * (3 - 2 * frac);
    const [x0, y0] = shape[idx0];
    const [x1, y1] = shape[idx1];
    return [
      (x0 + (x1 - x0) * smooth) * amp * 0.85,
      (y0 + (y1 - y0) * smooth) * amp * 0.55
    ];
  }
  const FLY_IN_TRIGGER_T = 0.42;
  const FLY_IN_DURATION = 2.8;
  function pickFlyInOrigin(dest2, right, up, forward) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const useVertical = Math.random() < 0.3;
    const lateralAxis = useVertical ? up : right;
    return dest2.clone().addScaledVector(lateralAxis, side * (80 + Math.random() * 30)).addScaledVector(up, useVertical ? 0 : (Math.random() - 0.5) * 12).addScaledVector(forward, 35 + Math.random() * 20);
  }
  function triggerFlyIn(enemy, dest2, right, up, forward) {
    enemy.flyIn = "flying";
    enemy.flyInTimer = 0;
    enemy.flyInDuration = FLY_IN_DURATION * (0.8 + Math.random() * 0.4);
    enemy.flyInOrigin = pickFlyInOrigin(dest2, right, up, forward);
    if (!enemy.inScene) {
      scene.add(enemy.root);
      enemy.inScene = true;
    }
  }
  function updateEnemies(dt, playerPos, forward) {
    const { right, up } = getWorldBasis(worldTrack, worldDist);
    const triggerWindowWU = FLY_IN_TRIGGER_T * currentStage.rail.length;
    for (const stage of activeStages) {
      const seg = segmentForStage(stage);
      if (!seg) continue;
      for (const e of stage.enemies) {
        if (e.dead || e.flyIn !== "pending") continue;
        const enemyWorldDist = seg.startDist + e.spawnT * seg.rail.length;
        const gap = enemyWorldDist - worldDist;
        if (gap >= 0 && gap <= triggerWindowWU) {
          const dest2 = getEntityWorldPosition(seg, e.spawnT, e.offsetX, e.offsetY);
          triggerFlyIn(e, dest2, right, up, forward);
        }
        if (gap < 0 && gap > -2) {
          const dest2 = getEntityWorldPosition(seg, e.spawnT, e.offsetX, e.offsetY);
          triggerFlyIn(e, dest2, right, up, forward);
        }
      }
    }
    impromptuSpawnCooldown -= dt;
    const bossNear = currentStage.boss && !currentStage.boss.dead && playerPos.distanceTo(currentStage.boss.root.position) < 30;
    if (!bossNear) {
      const hasActiveEnemy = [
        ...activeStages.flatMap((s) => s.enemies),
        ...impromptuEnemies
      ].some((e) => !e.dead && (e.flyIn === "flying" || e.flyIn === "arrived"));
      if (!hasActiveEnemy && impromptuSpawnCooldown <= 0) {
        impromptuSpawnCooldown = 6 + Math.random() * 4;
        const impWorldDist = worldDist + triggerWindowWU + (0.38 + Math.random() * 0.08) * currentStage.rail.length;
        const seg = segmentForStage(currentStage);
        const triggerT = seg ? Math.min(0.98, (impWorldDist - seg.startDist) / seg.rail.length) : 0.5;
        const imp = createImpromptuEnemy(Math.max(0, Math.min(0.98, triggerT)));
        const dest2 = seg ? getEntityWorldPosition(seg, imp.spawnT, imp.offsetX, imp.offsetY) : playerPos.clone().addScaledVector(forward, 30);
        triggerFlyIn(imp, dest2, right, up, forward);
        impromptuEnemies.push(imp);
      }
    }
    const allEnemies = [
      ...activeStages.flatMap((s) => s.enemies),
      ...impromptuEnemies,
      ...activeStages.flatMap((s) => s.boss && !s.boss.dead ? [s.boss] : [])
    ].filter((e) => !e.dead && e.inScene);
    for (const enemy of allEnemies) {
      if (enemy.dead) continue;
      enemy.age += dt;
      const ownerStage = activeStages.find(
        (s) => s.enemies.includes(enemy) || s.boss === enemy
      ) ?? currentStage;
      const ownerSeg = segmentForStage(ownerStage);
      const basePos = ownerSeg ? getEntityWorldPosition(ownerSeg, enemy.spawnT, enemy.offsetX, enemy.offsetY) : enemy.root.position.clone();
      const [motDx, motDy] = enemy.flyIn === "arrived" ? getMotionOffset(enemy, enemy.age) : [0, 0];
      if (enemy.flyIn === "flying") {
        enemy.flyInTimer += dt;
        const rawT = Math.min(1, enemy.flyInTimer / enemy.flyInDuration);
        const easedT = 1 - Math.pow(1 - rawT, 3);
        if (enemy.flyInOrigin) {
          const arrived = basePos.clone();
          const [adx, ady] = getMotionOffset(enemy, 0);
          arrived.x += adx;
          arrived.y += ady;
          enemy.root.position.lerpVectors(enemy.flyInOrigin, arrived, easedT);
        }
        if (rawT >= 1) enemy.flyIn = "arrived";
      } else {
        enemy.root.position.copy(basePos);
        enemy.root.position.x += motDx;
        enemy.root.position.y += motDy;
      }
      const toPlayer = playerPos.clone().sub(enemy.root.position);
      const distToPlayer = toPlayer.length();
      if (distToPlayer > 0.01) {
        enemy.root.rotation.set(0, Math.atan2(toPlayer.x, toPlayer.z) + Math.PI, 0);
      }
      if (enemy.shakeTimer > 0) {
        enemy.shakeTimer = Math.max(0, enemy.shakeTimer - dt);
        const progress = 1 - enemy.shakeTimer / enemy.shakeMax;
        const decay = 1 - progress * progress;
        const str = enemy.isBoss ? 0.12 : 0.2;
        const freq = Math.PI * 2 * 18;
        const age = enemy.age;
        enemy.shakeGroup.position.set(
          Math.sin(age * freq) * str * decay,
          Math.cos(age * freq * 1.1) * str * 0.5 * decay,
          Math.sin(age * freq * 0.7 + 1) * str * 0.3 * decay
        );
      } else {
        enemy.shakeGroup.position.set(0, 0, 0);
      }
      animateEnemy(enemy, elapsed);
      const SHOOT_RANGE = enemy.isBoss ? 28 : 20;
      const playerToEnemy = toPlayer.clone().negate().normalize();
      const inFront = playerToEnemy.dot(forward) > 0;
      const inRange = distToPlayer < SHOOT_RANGE && inFront;
      if (inRange && enemy.flyIn !== "arrived") {
        enemy.shootCooldown = (enemy.isBoss ? 2 : 3.5) + Math.random() * 1;
        enemy.chargeMesh.visible = false;
      } else if (inRange) {
        if (enemy.hasEnteredRange) enemy.shootCooldown -= dt;
        const CHARGE_WINDOW = enemy.chargeMax;
        const readyToCharge = enemy.hasEnteredRange && enemy.shootCooldown <= CHARGE_WINDOW;
        if (readyToCharge || !enemy.hasEnteredRange) {
          enemy.chargeTimer = Math.min(
            enemy.chargeMax,
            enemy.chargeTimer + dt
          );
        } else {
          enemy.chargeTimer = 0;
        }
        const chargeT = enemy.chargeMax > 0 ? enemy.chargeTimer / enemy.chargeMax : 0;
        const chargeMat = enemy.chargeMesh.material;
        if (chargeT > 0.05) {
          enemy.chargeMesh.visible = true;
          const pulse = 0.5 + 0.5 * Math.sin(elapsed * (4 + chargeT * 12));
          const brightness = chargeT * pulse;
          chargeMat.opacity = 0.4 + brightness * 0.6;
          const s = 0.4 + chargeT * 0.9;
          enemy.chargeMesh.scale.setScalar(s);
          const r = 1;
          const g = Math.max(0, 0.8 - chargeT * 0.8);
          chargeMat.color.setRGB(r, g, 0);
        } else {
          enemy.chargeMesh.visible = false;
        }
        const shouldFire = !enemy.hasEnteredRange || enemy.shootCooldown <= 0 && enemy.chargeTimer >= enemy.chargeMax;
        if (shouldFire) {
          enemy.hasEnteredRange = true;
          enemy.chargeMesh.visible = false;
          enemy.chargeTimer = 0;
          const [cdMin, cdMax] = enemy.isBoss ? getBossConfig(enemy.type).cooldownRange : [3.5, 5];
          enemy.shootCooldown = cdMin + Math.random() * (cdMax - cdMin);
          if (enemy.isBoss) {
            const cfg = getBossConfig(enemy.type);
            const bRight = new THREE.Vector3(1, 0, 0);
            const bUp = new THREE.Vector3(0, 1, 0);
            const burst2 = fireBossBurst(cfg, enemy.root.position.clone(), bRight, bUp, toPlayer);
            for (const { proj, trailColor } of burst2) {
              scene.add(proj.mesh);
              enemyProjectiles.push(proj);
              enemyProjectileTrails.push(createBulletTrail(scene, trailColor));
            }
          } else {
            const shot = spawnEnemyShot(enemy.root.position.clone(), toPlayer);
            scene.add(shot.mesh);
            enemyProjectiles.push(shot);
            enemyProjectileTrails.push(createBulletTrail(scene, 16729088));
          }
          const eStr = enemy.isBoss ? 0.8 : 0.45;
          const posDir = toPlayer.clone().negate().normalize().multiplyScalar(eStr);
          applyRecoilKick(getEnemyRecoil(enemy), posDir, {
            x: (Math.random() - 0.5) * (enemy.isBoss ? 0.28 : 0.16),
            y: (Math.random() - 0.5) * (enemy.isBoss ? 0.22 : 0.12),
            z: (Math.random() - 0.5) * 0.1
          });
        }
      } else {
        enemy.chargeMesh.visible = false;
        enemy.chargeTimer = 0;
        if (!inFront) enemy.hasEnteredRange = false;
      }
    }
  }
  function resolveCollisions(playerPos) {
    const player = gameState.player;
    for (let i = playerProjectiles.length - 1; i >= 0; i--) {
      const proj = playerProjectiles[i];
      let hit = false;
      for (const obs of activeStages.flatMap((s) => s.obstacles)) {
        if (obs.dead) continue;
        const obsPos = obs.root.position;
        if (proj.mesh.position.distanceTo(obsPos) < 0.9) {
          const dmg = proj.type === "beam" ? 40 : proj.type === "missile" ? 20 : 10;
          obs.hp -= dmg;
          if (obs.hp <= 0) {
            obs.dead = true;
            scene.remove(obs.root);
            spawnObstacleDebris(scene, obsPos.clone());
          } else {
            spawnObstacleSpark(scene, proj.mesh.position.clone());
            const damageFrac = obs.hp / obs.maxHp;
            obs.root.scale.setScalar(0.6 + damageFrac * 0.4);
          }
          if (proj.type !== "beam") {
            scene.remove(proj.mesh);
            playerProjectiles.splice(i, 1);
            hit = true;
          }
          break;
        }
      }
      if (hit) continue;
      const allEnemies = [
        ...activeStages.flatMap((s) => s.enemies),
        ...impromptuEnemies,
        ...activeStages.flatMap((s) => s.boss && !s.boss.dead ? [s.boss] : [])
      ].filter((e) => e.inScene);
      for (const enemy of allEnemies) {
        if (enemy.dead) continue;
        const { hit: didHit, isWeakPoint } = testProjectileEnemy(proj, enemy);
        if (didHit) {
          sfxEnemyHit(isWeakPoint);
          shakeEnemy(enemy, isWeakPoint);
          spawnEnemyHitBurst(scene, proj.mesh.position.clone(), isWeakPoint);
          spawnHitFlash(getEnemyMeshes(enemy), isWeakPoint);
          const actualDmg = enemy.isBoss && isWeakPoint ? proj.damage * 4 : proj.damage;
          const color = PROJ_COLOR[proj.type] ?? "#ffffff";
          const smallNum = enemy.isBoss && !isWeakPoint;
          spawnDamageNumber(scene, proj.mesh.position.clone(), actualDmg, color, isWeakPoint, smallNum);
          const result = applyDamageToEnemy(enemy, proj.damage, isWeakPoint);
          if (result.killed) {
            const leveled = gainExp(player, result.expGained);
            if (result.expGained > 0) spawnXpFloat(scene, enemy.root.position.clone(), result.expGained);
            if (leveled) {
              sfxLevelUp();
              spawnLevelUpBanner(scene, playerPos.clone(), player.level, () => playerShip.root.position.clone());
            }
            player.score += enemy.isBoss ? 500 : 100;
            sfxEnemyDie(enemy.isBoss);
            spawnEnemyDeathBurst(scene, enemy.root.position.clone(), enemy.isBoss);
            scene.remove(enemy.root);
            enemy.inScene = false;
          }
          if (proj.type !== "beam") {
            scene.remove(proj.mesh);
            playerProjectiles.splice(i, 1);
            hit = true;
            break;
          }
        }
      }
      if (hit) continue;
    }
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const proj = enemyProjectiles[i];
      if (testEnemyShotPlayer(proj, playerPos)) {
        if (player.invincibleTimer <= 0) {
          hurtTimer = HURT_DURATION;
          sfxPlayerHurt();
        }
        applyDamageToPlayer(player, proj.damage);
        scene.remove(proj.mesh);
        const t = enemyProjectileTrails[i];
        if (t) removeBulletTrail(scene, t);
        enemyProjectiles.splice(i, 1);
        enemyProjectileTrails.splice(i, 1);
      }
    }
    if (player.invincibleTimer <= 0) {
      for (const obs of activeStages.flatMap((s) => s.obstacles)) {
        if (obs.dead) continue;
        const obsPos = obs.root.position;
        if (playerPos.distanceTo(obsPos) < 1) {
          applyDamageToPlayer(player, 12);
          hurtTimer = HURT_DURATION;
          obs.dead = true;
          scene.remove(obs.root);
          spawnObstacleDebris(scene, obsPos.clone());
          break;
        }
      }
    }
    if (player.invincibleTimer <= 0) {
      const allEnemyBodies = [
        ...activeStages.flatMap((s) => s.enemies),
        ...impromptuEnemies,
        ...activeStages.flatMap((s) => s.boss && !s.boss.dead ? [s.boss] : [])
      ].filter((e) => e.inScene);
      for (const enemy of allEnemyBodies) {
        if (enemy.dead) continue;
        const collRadius = enemy.isBoss ? 1.4 : 0.9;
        if (playerPos.distanceTo(enemy.root.position) < collRadius) {
          applyDamageToPlayer(player, enemy.isBoss ? 18 : 10);
          hurtTimer = HURT_DURATION;
          spawnEnemyHitBurst(scene, playerPos.clone(), false);
          break;
        }
      }
    }
    for (const pickup of activeStages.flatMap((s) => s.pickups)) {
      if (pickup.dead) continue;
      if (testPickupPlayer(pickup, playerPos)) {
        pickup.dead = true;
        scene.remove(pickup.root);
        const getPos = () => playerShip.root.position.clone();
        if (pickup.kind === "health") {
          player.hp = Math.min(player.maxHp, player.hp + 40);
          sfxPickup("health");
          spawnPickupBanner(scene, playerPos.clone(), "health", "+40 HP", getPos);
        } else {
          const r = applyWeaponPickup(player, pickup.kind);
          sfxPickup(pickup.kind);
          if (r.expGained > 0) {
            const leveled = gainExp(player, r.expGained);
            spawnXpFloat(scene, pickup.root.position.clone(), r.expGained);
            spawnPickupBanner(scene, playerPos.clone(), pickup.kind, "MAX LEVEL!", getPos);
            if (leveled) {
              sfxLevelUp();
              spawnLevelUpBanner(scene, playerPos.clone(), player.level, getPos);
            }
          } else {
            const weapon = player.weapons.find((w) => w.type === pickup.kind);
            const lvStr = weapon ? `Level ${weapon.level}` : "ACQUIRED";
            spawnPickupBanner(scene, playerPos.clone(), pickup.kind, lvStr, getPos);
          }
          const sw = player.weapons.find((w) => w.type === "sword");
          if (sw) {
            swordState = createSwordState(sw.level);
            playerShip.swordBlade.visible = false;
          }
        }
      }
    }
  }
  function handleDeath() {
    if (gameState.phase === "dead") return;
    gameState.phase = "dead";
    clearBoostStreaks(scene);
    pauseMusic();
    const deathPos = playerShip.root.position.clone();
    sfxCriticalHit(false);
    duckMusic(0, 0.08);
    activeExplosion = startEpicExplosion(scene, deathPos, false, () => {
      activeExplosion = null;
      showOverlay(hud, "GAME OVER", `Score: ${gameState.player.score}`, "Restart", () => {
        restartGame();
      });
    });
  }
  function restartGame() {
    if (activeExplosion) {
      activeExplosion.dispose();
      activeExplosion = null;
    }
    for (const p of playerProjectiles) scene.remove(p.mesh);
    for (const p of enemyProjectiles) scene.remove(p.mesh);
    for (const t of enemyProjectileTrails) if (t) removeBulletTrail(scene, t);
    playerProjectiles.length = 0;
    enemyProjectiles.length = 0;
    enemyProjectileTrails.length = 0;
    for (const s of activeStages) removeStageObjects(s);
    activeStages.length = 0;
    for (const e of impromptuEnemies) if (e.inScene) scene.remove(e.root);
    impromptuEnemies.length = 0;
    impromptuSpawnCooldown = 0;
    clearBoostStreaks(scene);
    gameState.player = createPlayerState();
    gameState.stageIndex = 0;
    gameState.phase = "playing";
    worldDist = 0;
    _skyColor.setHex(getTheme(0).skyColor);
    _starColor.setHex(getTheme(0).starColor);
    _fogDensity = getTheme(0).fogDensity;
    smoothForward.set(0, 0, -1);
    smoothRight.set(1, 0, 0);
    smoothUp.set(0, 1, 0);
    playerOffsetX = 0;
    playerOffsetY = 0;
    targetOffsetX = 0;
    targetOffsetY = 0;
    swordState = null;
    elapsed = 0;
    shootTimers.clear();
    const r0 = generateStage(0);
    const r1 = generateStage(1);
    worldTrack = createInitialTrack(r0, r1);
    activeStages.push(r0, r1);
    currentStage = r0;
    nextStageIndex = 2;
    for (const s of activeStages) addStageObjects(s, true);
    hideOverlay(hud);
    hideBossBar(hud);
    restartMusic(r0.themeIndex);
    unduckMusic(0);
  }
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    if (activeExplosion) {
      const stillRunning = activeExplosion.update(dt);
      if (!stillRunning) activeExplosion = null;
      renderer.render(scene, camera);
      return;
    }
    if (gameState.phase === "title") {
      playerShip.root.position.set(0, -0.5, 2);
      playerShip.root.rotation.set(0, Math.PI, 0);
      applyHeroPose(playerShip);
      animateHeroPose(playerShip, elapsed);
      playerShip.verniers.forEach((v) => {
        const idleThrust = 0.18 + Math.sin(elapsed * 14) * 0.06;
        v.flameCore.scale.set(1, 1, idleThrust);
        v.flameMid.scale.set(0.7, 0.7, idleThrust * 0.9);
        v.flameHalo.scale.set(0.5, 0.5, idleThrust * 0.7);
        const coreMat = v.flameCore.material;
        coreMat.opacity = 0.55;
        coreMat.color.setRGB(0.75, 0.9, 1);
        const midMat = v.flameMid.material;
        midMat.opacity = 0.3;
        midMat.color.setRGB(0.2, 0.6, 1);
        const haloMat = v.flameHalo.material;
        haloMat.opacity = 0.12;
        const rimMat = v.rimGlow.material;
        rimMat.opacity = 0.45;
        v.rimGlow.scale.set(1, 1, 1);
      });
      camera.position.set(0, 0.2, 6.5);
      camera.fov = 52;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0.4, 2);
      updateStarfield(starfield, camera.position);
      titleScreen == null ? void 0 : titleScreen.update(elapsed);
      renderer.render(scene, camera);
      return;
    }
    if (gameState.phase !== "playing") {
      renderer.render(scene, camera);
      return;
    }
    const player = gameState.player;
    if (player.hp <= 0) {
      handleDeath();
      renderer.render(scene, camera);
      return;
    }
    if (player.invincibleTimer > 0) player.invincibleTimer -= dt;
    readInput(dt);
    playerOffsetX += (targetOffsetX - playerOffsetX) * (1 - Math.exp(-8 * dt));
    playerOffsetY += (targetOffsetY - playerOffsetY) * (1 - Math.exp(-8 * dt));
    if (boostTimer > 0) {
      boostTimer -= dt;
      if (boostTimer <= 0) {
        boostTimer = 0;
        unduckMusic(0.6);
      }
    }
    if (boostCooldown > 0) {
      boostCooldown -= dt;
      if (boostCooldown <= 0) boostCooldown = 0;
    }
    const boostTarget = boostTimer > 0 ? BOOST_MULTIPLIER : 1;
    boostFactor += (boostTarget - boostFactor) * (1 - Math.exp(-(boostTimer > 0 ? 12 : 6) * dt));
    const worldSpeed = RAIL_SPEED * BASE_STAGE_LENGTH * boostFactor;
    worldDist += worldSpeed * dt;
    const currentSeg = resolveCurrentSegment(worldTrack, worldDist);
    if (currentSeg.stage !== currentStage) {
      currentStage = currentSeg.stage;
      gameState.stageIndex = currentStage.index;
      playThemeTrack(currentStage.themeIndex);
    }
    const bossAlive = currentStage.boss && !currentStage.boss.dead;
    if (bossAlive) {
      const seg = segmentForStage(currentStage);
      if (seg) {
        const bossWorldDist = seg.startDist + currentStage.boss.spawnT * seg.rail.length - 14;
        if (worldDist >= bossWorldDist) worldDist = bossWorldDist;
        if (worldDist >= bossWorldDist - 12) {
          showBossBar(hud, currentStage.boss.hp / currentStage.boss.maxHp);
        }
      }
    }
    if (currentStage.boss && currentStage.boss.dead && !currentStage.bossDefeated) {
      currentStage.bossDefeated = true;
      player.score += 1e3;
      hideBossBar(hud);
      const bossPos = currentStage.boss.root.position.clone();
      scene.remove(currentStage.boss.root);
      currentStage.boss.inScene = false;
      const clearedStage = currentStage;
      sfxCriticalHit(true);
      duckMusic(0.08, 0.1);
      activeExplosion = startEpicExplosion(scene, bossPos, true, () => {
        activeExplosion = null;
        unduckMusic(1.2);
        const newStage = generateStage(nextStageIndex++);
        appendStage(worldTrack, newStage);
        addStageObjects(newStage);
        activeStages.push(newStage);
        const pruned = pruneOldSegments(worldTrack, worldDist);
        for (const seg of pruned) {
          if (seg.stage && seg.stage !== clearedStage) {
            removeStageObjects(seg.stage);
            activeStages = activeStages.filter((s) => s !== seg.stage);
          }
        }
      });
    }
    const railPos = getWorldPosition(worldTrack, worldDist);
    const rawBasis = getWorldBasis(worldTrack, worldDist);
    const alpha = 1 - Math.exp(-12 * dt);
    smoothForward.lerp(rawBasis.forward, alpha).normalize();
    const worldUpRef = new THREE.Vector3(0, 1, 0);
    smoothRight.crossVectors(smoothForward, worldUpRef).normalize();
    smoothUp.crossVectors(smoothRight, smoothForward).normalize();
    const forward = smoothForward;
    const right = smoothRight;
    const up = smoothUp;
    const playerWorldPos = railPos.clone().addScaledVector(right, playerOffsetX).addScaledVector(up, playerOffsetY);
    updateRecoil(playerRecoil, dt, 80, 12);
    playerShip.root.position.copy(playerWorldPos).add(playerRecoil.offset);
    const lookTarget = playerWorldPos.clone().addScaledVector(forward, -3);
    playerShip.root.lookAt(lookTarget);
    animatePlayerShip(playerShip, elapsed);
    const velX = (playerOffsetX - prevOffsetX) / Math.max(dt, 1e-3);
    const velY = (playerOffsetY - prevOffsetY) / Math.max(dt, 1e-3);
    prevOffsetX = playerOffsetX;
    prevOffsetY = playerOffsetY;
    const inputInfluenceX = rawInputX * 0.6 + Math.sign(velX) * Math.min(Math.abs(velX) / 4, 0.4);
    const inputInfluenceY = rawInputY * 0.6 + Math.sign(velY) * Math.min(Math.abs(velY) / 4, 0.4);
    const VERNIER_SMOOTH = 1 - Math.exp(-10 * dt);
    vernierInputX += (inputInfluenceX - vernierInputX) * VERNIER_SMOOTH;
    vernierInputY += (inputInfluenceY - vernierInputY) * VERNIER_SMOOTH;
    const boostNorm = (boostFactor - 1) / (BOOST_MULTIPLIER - 1);
    playerShip.recoilPivot.rotateX(boostNorm * 0.32);
    const fwdThrust = 0.3 + Math.sin(elapsed * 18) * 0.08 + boostNorm * 3.5;
    const flickerSpeedMult = 1 + boostNorm * 2.2;
    playerShip.verniers.forEach((v, idx) => {
      const isXAxis = idx !== 2 && idx !== 3;
      const input = isXAxis ? vernierInputX : vernierInputY;
      const fireSign = idx === 0 || idx === 2 || idx === 4 ? -1 : 1;
      const thrust = Math.max(0, fwdThrust + Math.max(0, input * fireSign) * 0.9);
      const TILT_MAX = 0.35;
      const boostTiltBack = boostNorm * 0.55;
      v.pivot.rotation.x = v.baseRotX + boostTiltBack + (idx === 2 || idx === 3 ? vernierInputY * TILT_MAX : 0);
      v.pivot.rotation.z = v.baseRotZ + (isXAxis ? vernierInputX * TILT_MAX * (idx % 2 === 0 ? 1 : -1) : 0);
      const fs = flickerSpeedMult;
      const flickerCore = 0.88 + Math.sin(elapsed * 52 * fs + idx * 2.3) * (0.12 + boostNorm * 0.1);
      const flickerMid = 0.82 + Math.sin(elapsed * 31 * fs + idx * 1.7) * (0.18 + boostNorm * 0.12);
      const flickerHalo = 0.75 + Math.sin(elapsed * 19 * fs + idx * 1.1) * (0.25 + boostNorm * 0.15);
      const coreHeat = Math.min(1, thrust * (boostNorm > 0.1 ? 0.5 : 1.3));
      const boostHeat = boostNorm * boostNorm;
      const coreLen = Math.max(0.02, thrust * flickerCore);
      v.flameCore.scale.set(
        1 + boostNorm * 0.6,
        // widens slightly at boost
        1 + boostNorm * 0.6,
        coreLen
      );
      const coreMat = v.flameCore.material;
      coreMat.opacity = Math.min(1, 0.5 + thrust * 0.18 + boostNorm * 0.5);
      coreMat.color.setRGB(
        0.6 + coreHeat * 0.4 + boostHeat * 0.4,
        0.85 + coreHeat * 0.15 - boostHeat * 0.1,
        1 - boostHeat * 0.3
        // less blue = more white/orange at full boost
      );
      const midLen = Math.max(0.01, thrust * flickerMid * 1.1);
      const midWidth = 0.6 + thrust * 0.5 + boostNorm * 1.8;
      v.flameMid.scale.set(midWidth, midWidth, midLen);
      const midMat = v.flameMid.material;
      midMat.opacity = Math.min(0.92, 0.15 + thrust * 0.18 + boostNorm * 0.75);
      midMat.color.setRGB(
        0.1 + thrust * 0.1 + boostHeat * 0.9,
        0.55 + thrust * 0.12 - boostHeat * 0.08,
        1 - boostHeat * 0.85
      );
      const haloLen = Math.max(0.01, thrust * flickerHalo * 1.2);
      const haloWidth = 0.4 + thrust * 0.7 + boostNorm * 3.2;
      v.flameHalo.scale.set(haloWidth, haloWidth, haloLen);
      const haloMat = v.flameHalo.material;
      haloMat.opacity = Math.min(0.88, 0.02 + thrust * 0.1 + boostNorm * 0.8);
      haloMat.color.setRGB(
        0.4 + boostHeat * 0.6,
        0.3 + boostHeat * 0.3,
        1 - boostHeat * 0.9
      );
      const rimMat = v.rimGlow.material;
      rimMat.opacity = Math.min(1, thrust * flickerCore * 0.3 + boostNorm * 0.95);
      rimMat.color.setRGB(
        0.3 + thrust * 0.2 + boostHeat * 0.7,
        0.7 + thrust * 0.1 - boostHeat * 0.2,
        1 - boostHeat * 0.8
      );
      const rimScale = 1 + boostNorm * 1.4;
      v.rimGlow.scale.set(rimScale, rimScale, 1);
    });
    if (hurtTimer > 0) {
      hurtTimer -= dt;
      const hurtT = hurtTimer / HURT_DURATION;
      const shakeAmt = hurtT * 0.18;
      playerShip.root.position.x += Math.sin(elapsed * 55) * shakeAmt;
      playerShip.root.position.y += Math.sin(elapsed * 47) * shakeAmt * 0.7;
    }
    const flashRed = hurtTimer > 0 && Math.sin(elapsed * 62) > 0;
    playerShip.root.traverse((child) => {
      const mesh = child;
      if (!mesh.isMesh) return;
      const mat = mesh.material;
      if (!mat.color) return;
      const stored = playerOrigColors.get(mesh);
      if (stored === void 0) return;
      mat.color.setHex(flashRed ? 16716049 : stored);
    });
    const camDist = 4.5 + boostNorm * 2.5;
    const camBack = forward.clone().multiplyScalar(-camDist);
    const camUp = up.clone().multiplyScalar(1.2 + boostNorm * 0.4);
    camera.position.copy(playerWorldPos).add(camBack).add(camUp);
    camera.fov = 55 + boostNorm * 12;
    camera.updateProjectionMatrix();
    const camLookAt = playerWorldPos.clone().addScaledVector(forward, 8 + boostNorm * 4);
    camera.lookAt(camLookAt);
    for (const stage of activeStages) {
      const seg = segmentForStage(stage);
      if (!seg) continue;
      if (stage.boss && !stage.boss.dead && stage.boss.inScene) {
        placeEntityOnSegment(stage.boss.root, seg, stage.boss.spawnT, 0, 0);
      }
      for (const p of stage.pickups) {
        if (!p.dead) {
          placeEntityOnSegment(p.root, seg, p.spawnT, p.offsetX, p.offsetY);
          p.root.position.add(p.magnetOffset);
          p.position.copy(p.root.position);
          updatePickupMagnet(p, playerWorldPos, dt);
          animatePickup(p, dt);
        }
      }
      for (const o of stage.obstacles) {
        if (!o.dead) placeEntityOnSegment(o.root, seg, o.spawnT, o.offsetX, o.offsetY);
      }
    }
    const RETICLE_DIST = 12;
    const RETICLE_MAX_AIM = 1.8;
    const hasInput = Math.abs(rawInputX) > 0.01 || Math.abs(rawInputY) > 0.01;
    if (hasInput) {
      reticleAimX += (rawInputX * RETICLE_MAX_AIM - reticleAimX) * (1 - Math.exp(-6 * dt));
      reticleAimY += (rawInputY * RETICLE_MAX_AIM - reticleAimY) * (1 - Math.exp(-6 * dt));
    } else {
      reticleAimX *= Math.exp(-3.5 * dt);
      reticleAimY *= Math.exp(-3.5 * dt);
    }
    reticleAimX = Math.max(-RETICLE_MAX_AIM, Math.min(RETICLE_MAX_AIM, reticleAimX));
    reticleAimY = Math.max(-RETICLE_MAX_AIM, Math.min(RETICLE_MAX_AIM, reticleAimY));
    const reticlePos = playerWorldPos.clone().addScaledVector(forward, RETICLE_DIST).addScaledVector(right, reticleAimX).addScaledVector(up, reticleAimY);
    reticleGroup.position.copy(reticlePos);
    reticleGroup.quaternion.copy(camera.quaternion);
    const reticleScale = 1 + 0.1 * Math.sin(elapsed * 6);
    reticleGroup.scale.setScalar(reticleScale);
    const aimDir = reticlePos.clone().sub(playerWorldPos).normalize();
    const leanX = reticleAimX / RETICLE_MAX_AIM;
    const leanY = reticleAimY / RETICLE_MAX_AIM;
    playerShip.recoilPivot.rotateY(leanX * 0.18);
    playerShip.recoilPivot.rotateX(-leanY * 0.12);
    const headWorldPos = new THREE.Vector3();
    playerShip.headGroup.getWorldPosition(headWorldPos);
    const toReticleWorld = reticlePos.clone().sub(headWorldPos).normalize();
    const rootInvQuat = playerShip.root.quaternion.clone().invert();
    const toReticleLocal = toReticleWorld.clone().applyQuaternion(rootInvQuat);
    const headRestDir = new THREE.Vector3(0, 0, -1);
    const headTargetQuat = new THREE.Quaternion().setFromUnitVectors(headRestDir, toReticleLocal.normalize());
    const headAngle = headTargetQuat.angleTo(new THREE.Quaternion());
    const MAX_HEAD_ANGLE = Math.PI / 5;
    if (headAngle > MAX_HEAD_ANGLE) {
      headTargetQuat.slerp(new THREE.Quaternion(), 1 - MAX_HEAD_ANGLE / headAngle);
    }
    playerShip.headGroup.quaternion.slerp(headTargetQuat, 1 - Math.exp(-8 * dt));
    function aimArmAtReticle(armGroup, maxAngleDeg) {
      const armWorldPos = new THREE.Vector3();
      armGroup.getWorldPosition(armWorldPos);
      const toRet = reticlePos.clone().sub(armWorldPos).normalize();
      const toRetLocal = toRet.clone().applyQuaternion(rootInvQuat);
      const armRestDir = new THREE.Vector3(0, -0.48, -0.85).normalize();
      const armQuat = new THREE.Quaternion().setFromUnitVectors(armRestDir, toRetLocal.normalize());
      const angle = armQuat.angleTo(new THREE.Quaternion());
      const maxRad = maxAngleDeg * Math.PI / 180;
      if (angle > maxRad) armQuat.slerp(new THREE.Quaternion(), 1 - maxRad / angle);
      armGroup.quaternion.slerp(armQuat, 1 - Math.exp(-8 * dt));
    }
    aimArmAtReticle(playerShip.armR, 50);
    aimArmAtReticle(playerShip.armL, 50);
    applyRecoilRotation(playerRecoil, playerShip.recoilPivot);
    doShooting(dt, playerWorldPos, aimDir);
    doSword(dt, playerWorldPos, aimDir);
    for (let i = playerProjectiles.length - 1; i >= 0; i--) {
      const proj = playerProjectiles[i];
      if (!updateProjectile(proj, dt)) {
        if (proj.type === "missile") {
          spawnEnemyHitBurst(scene, proj.mesh.position.clone(), false);
        }
        scene.remove(proj.mesh);
        playerProjectiles.splice(i, 1);
      } else if (proj.type === "missile") {
        emitSmokePuff(scene, proj.mesh.position.clone());
      }
    }
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const eproj = enemyProjectiles[i];
      const trail = enemyProjectileTrails[i];
      if (!updateProjectile(eproj, dt)) {
        scene.remove(eproj.mesh);
        if (trail) removeBulletTrail(scene, trail);
        enemyProjectiles.splice(i, 1);
        enemyProjectileTrails.splice(i, 1);
      } else {
        if (trail) updateBulletTrail(trail, eproj.mesh.position, dt);
      }
    }
    updateEnemies(dt, playerWorldPos, forward);
    for (let i = impromptuEnemies.length - 1; i >= 0; i--) {
      const ie = impromptuEnemies[i];
      if (ie.dead) {
        if (ie.inScene) {
          scene.remove(ie.root);
          ie.inScene = false;
        }
        impromptuEnemies.splice(i, 1);
      }
    }
    resolveCollisions(playerWorldPos);
    updateStarfield(starfield, camera.position);
    spawnBoostStreaks(scene, playerWorldPos, forward, right, up, boostNorm, dt, camera.position);
    updateBoostStreaks(scene, dt);
    applyTheme(currentStage.theme, 1 - Math.exp(-1.2 * dt));
    updateEffects(scene, dt);
    updateDamageNumbers(scene, camera, dt);
    updateHud(hud, player, gameState.stageIndex, currentStage.theme.name);
    updateBoostHud(hud, boostTimer, boostCooldown, BOOST_DURATION, BOOST_COOLDOWN);
    hud.boostReminder.style.display = isInGap(worldTrack, worldDist) ? "flex" : "none";
    renderer.render(scene, camera);
  }
  animate();
})();
//# sourceMappingURL=game.js.map
