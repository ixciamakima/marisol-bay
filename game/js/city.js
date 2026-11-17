// Marisol Bay — the city itself: road grid, buildings, beach, marina, park.
// All geometry is generated from a seed, so every run builds the same city.
// Exports colliders (building AABBs) and helpers the AI and the player use.
import * as THREE from 'three';
import { mulberry32, pick, clamp } from './util.js';

export const ROADS = [-195, -130, -65, 0, 65, 130, 195];
export const ROAD_HALF = 7;          // asphalt half-width
export const CITY_HALF = 260;        // playable half-extent
export const BEACH_X = -228;         // sand starts west of here
export const WATER_X = -252;         // water starts west of here
export const DOCKS_Z = 228;          // marina piers start south of here

const BUILDING_COLORS = [0xe8b98a, 0xd9a06f, 0xc98f7a, 0xe6d3a3, 0xb9c4c9, 0xd8c2b2,
  0xf0e0c0, 0xc9a06a, 0xa8b8c4, 0xe0b090, 0xd4a5a5, 0x9fb4a8];
const GLASS_COLORS = [0x2e4a5e, 0x3a5a6e, 0x24384a, 0x4a6a7a];

function windowTexture(rng, base, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 256);
  const cols = 6, rows = 12;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#ffe9b0') : 'rgba(20,28,40,0.85)';
      g.fillRect(8 + x * 20, 10 + y * 20, 13, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#484e5a'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#f5d76e';
  g.fillRect(62, 8, 4, 34); g.fillRect(62, 68, 4, 34);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(6, 0, 2, 128); g.fillRect(120, 0, 2, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.colliders = [];      // {minX, maxX, minZ, maxZ}
    this.animated = [];       // {obj, kind, phase}
    this.palms = [];
    this.roadTex = roadTexture();
    this.buildingTexes = [];
    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildBeach();
    this.buildDocks();
    this.buildProps();
  }

  addCollider(x, z, hw, hd) {
    this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  }

  // Push a circle out of building AABBs. Returns true if it hit something.
  collide(x, z, r) {
    let hit = false;
    for (const c of this.colliders) {
      const cx = clamp(x, c.minX, c.maxX);
      const cz = clamp(z, c.minZ, c.maxZ);
      const dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          x += r; // inside: shove out on +x
        }
      }
    }
    return { x, z, hit };
  }

  isWater(x, z) { return x < WATER_X; }
  isSand(x) { return x < BEACH_X; }
  isRoad(x, z) {
    for (const r of ROADS) {
      if (Math.abs(x - r) <= ROAD_HALF + 0.5) return true;
      if (Math.abs(z - r) <= ROAD_HALF + 0.5) return true;
    }
    return false;
  }
  nearestRoad(x, z) {
    let best = null, bd = 1e9;
    for (const r of ROADS) {
      const d = Math.min(Math.abs(x - r), Math.abs(z - r));
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY_HALF * 2 + 120, CITY_HALF * 2 + 120),
      new THREE.MeshLambertMaterial({ color: 0x5d6157 }));
    g.rotation.x = -Math.PI / 2; g.position.set(0, 0, 10);
    g.receiveShadow = true;
    this.scene.add(g);
  }

  buildRoads() {
    const len = CITY_HALF * 2 + 40;
    for (const r of ROADS) {
      // North-south road: dashes run along Z (texture V).
      const texV = this.roadTex.clone();
      texV.needsUpdate = true;
      texV.repeat.set(1, len / 14);
      const ns = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len),
        new THREE.MeshLambertMaterial({ map: texV }));
      ns.rotation.x = -Math.PI / 2;
      ns.position.set(r, 0.03, 0);
      ns.receiveShadow = true;
      this.scene.add(ns);
      // East-west road: same texture rotated 90 degrees so dashes run along X.
      const texH = this.roadTex.clone();
      texH.needsUpdate = true;
      texH.center.set(0.5, 0.5);
      texH.rotation = Math.PI / 2;
      texH.repeat.set(1, len / 14);
      const ew = new THREE.Mesh(new THREE.PlaneGeometry(len, ROAD_HALF * 2),
        new THREE.MeshLambertMaterial({ map: texH }));
      ew.rotation.x = -Math.PI / 2;
      ew.position.set(0, 0.03, r);
      ew.receiveShadow = true;
      this.scene.add(ew);
    }
    // Sidewalk frames around every block.
    const swMat = new THREE.MeshLambertMaterial({ color: 0x8f9296 });
    for (let i = 0; i < ROADS.length - 1; i++) {
      for (let j = 0; j < ROADS.length - 1; j++) {
        const x0 = ROADS[i] + ROAD_HALF, x1 = ROADS[i + 1] - ROAD_HALF;
        const z0 = ROADS[j] + ROAD_HALF, z1 = ROADS[j + 1] - ROAD_HALF;
        const s = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.35, z1 - z0), swMat);
        s.position.set((x0 + x1) / 2, 0.17, (z0 + z1) / 2);
        s.receiveShadow = true;
        this.scene.add(s);
      }
    }
  }

  buildBlocks() {
    const rng = this.rng;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < ROADS.length - 1; i++) {
      for (let j = 0; j < ROADS.length - 1; j++) {
        const x0 = ROADS[i] + ROAD_HALF + 3, x1 = ROADS[i + 1] - ROAD_HALF - 3;
        const z0 = ROADS[j] + ROAD_HALF + 3, z1 = ROADS[j + 1] - ROAD_HALF - 3;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        // Plaza del Sol — the central park.
        if (i === 3 && j === 3) { this.buildPark(cx, cz, x1 - x0, z1 - z0); continue; }
        // Marina blocks stay open (docks are south).
        if (j === 5 && i >= 2 && i <= 3) { this.buildMarinaYard(cx, cz); continue; }
        if (x0 < BEACH_X + 8) continue; // beachfront: no buildings
        const downtown = Math.abs(cx) < 140 && Math.abs(cz) < 140;
        const isTower = (i === 4 && j === 1);
        const isHotel = (i === 0 && j === 2);
        const n = isTower || isHotel ? 1 : (rng() < 0.45 ? 1 : rng() < 0.6 ? 2 : 4);
        const plots = this.splitPlots(x0, x1, z0, z1, n, rng);
        for (const p of plots) {
          let h = downtown ? 16 + rng() * 34 : 8 + rng() * 14;
          if (isTower) h = 92;
          if (isHotel) h = 34;
          const base = '#' + pick(rng, BUILDING_COLORS).toString(16).padStart(6, '0');
          const glass = rng() < 0.4;
          let mat;
          if (glass) {
            mat = new THREE.MeshLambertMaterial({ color: pick(rng, GLASS_COLORS), emissive: 0x0a141c });
          } else {
            const ti = this.buildingTexes.length;
            if (ti < 8) {
              this.buildingTexes.push(windowTexture(rng, base, 0.28));
              mat = new THREE.MeshLambertMaterial({ map: this.buildingTexes[ti] });
            } else {
              mat = new THREE.MeshLambertMaterial({ map: pick(rng, this.buildingTexes) });
            }
          }
          const b = new THREE.Mesh(boxGeo, mat);
          b.scale.set(p.w, h, p.d);
          b.position.set(p.x, 0.35 + h / 2, p.z);
          b.castShadow = true; b.receiveShadow = true;
          this.scene.add(b);
          // Roof rim.
          const rim = new THREE.Mesh(boxGeo,
            new THREE.MeshLambertMaterial({ color: 0x3c3f46 }));
          rim.scale.set(p.w + 0.6, 0.8, p.d + 0.6);
          rim.position.set(p.x, 0.35 + h + 0.4, p.z);
          this.scene.add(rim);
          if (isTower) {
            const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2.2, 14, 6),
              new THREE.MeshLambertMaterial({ color: 0xffd75e, emissive: 0xaa7711 }));
            spire.position.set(p.x, 0.35 + h + 8, p.z);
            this.scene.add(spire);
            this.animated.push({ obj: spire, kind: 'beacon' });
          }
          this.addCollider(p.x, p.z, p.w / 2, p.d / 2);
        }
      }
    }
  }

  splitPlots(x0, x1, z0, z1, n, rng) {
    const plots = [];
    if (n === 1) {
      plots.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: (x1 - x0) * (0.72 + rng() * 0.2), d: (z1 - z0) * (0.72 + rng() * 0.2) });
    } else if (n === 2) {
      const vertical = rng() < 0.5;
      const mid = vertical ? (x0 + x1) / 2 : (z0 + z1) / 2;
      if (vertical) {
        plots.push({ x: (x0 + mid) / 2, z: (z0 + z1) / 2, w: (mid - x0) * 0.86, d: (z1 - z0) * 0.86 });
        plots.push({ x: (mid + x1) / 2, z: (z0 + z1) / 2, w: (x1 - mid) * 0.86, d: (z1 - z0) * 0.86 });
      } else {
        plots.push({ x: (x0 + x1) / 2, z: (z0 + mid) / 2, w: (x1 - x0) * 0.86, d: (mid - z0) * 0.86 });
        plots.push({ x: (x0 + x1) / 2, z: (mid + z1) / 2, w: (x1 - x0) * 0.86, d: (z1 - mid) * 0.86 });
      }
    } else {
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      for (const [px, pz] of [[(x0 + mx) / 2, (z0 + mz) / 2], [(mx + x1) / 2, (z0 + mz) / 2],
        [(x0 + mx) / 2, (mz + z1) / 2], [(mx + x1) / 2, (mz + z1) / 2]]) {
        plots.push({ x: px, z: pz, w: (x1 - x0) / 2 * 0.84, d: (z1 - z0) / 2 * 0.84 });
      }
    }
    return plots;
  }

  buildPark(cx, cz, w, d) {
    const grass = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d),
      new THREE.MeshLambertMaterial({ color: 0x4d7a45 }));
    grass.position.set(cx, 0.4, cz);
    grass.receiveShadow = true;
    this.scene.add(grass);
    // Fountain.
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 1.2, 20),
      new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }));
    basin.position.set(cx, 0.9, cz);
    basin.castShadow = true;
    this.scene.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.4, 20),
      new THREE.MeshLambertMaterial({ color: 0x3fa7c9, transparent: true, opacity: 0.85 }));
    water.position.set(cx, 1.35, cz);
    this.scene.add(water);
    this.animated.push({ obj: water, kind: 'fountain' });
    const rng = this.rng;
    for (let k = 0; k < 10; k++) {
      const a = rng() * Math.PI * 2, r = 12 + rng() * (w / 2 - 14);
      this.addPalm(cx + Math.cos(a) * r, cz + Math.sin(a) * r, rng);
    }
    // Plaza sign.
    this.addSign(cx, cz - d / 2 + 4, 'PLAZA DEL SOL', 0xffd75e);
  }

  buildMarinaYard(cx, cz) {
    // Open lot with crates and a couple of parked trucks near the docks.
    const rng = this.rng;
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4f });
    const crateGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
    for (let k = 0; k < 8; k++) {
      const c = new THREE.Mesh(crateGeo, crateMat);
      c.position.set(cx - 16 + rng() * 32, 1.55, cz - 14 + rng() * 28);
      c.rotation.y = rng() * Math.PI;
      c.castShadow = true;
      this.scene.add(c);
      this.addCollider(c.position.x, c.position.z, 1.7, 1.7);
    }
  }

  buildBeach() {
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(36, CITY_HALF * 2 + 120),
      new THREE.MeshLambertMaterial({ color: 0xd9c08a }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(-240, 0.06, 10);
    sand.receiveShadow = true;
    this.scene.add(sand);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(90, CITY_HALF * 2 + 160),
      new THREE.MeshLambertMaterial({ color: 0x1e6f8e, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(-300, 0.12, 10);
    this.scene.add(water);
    this.animated.push({ obj: water, kind: 'water' });
    // Boardwalk.
    const walk = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, CITY_HALF * 2 + 40),
      new THREE.MeshLambertMaterial({ color: 0xb08d5f }));
    walk.position.set(-226, 0.3, 10);
    walk.receiveShadow = true;
    this.scene.add(walk);
    const rng = this.rng;
    for (let z = -240; z < 260; z += 26) {
      this.addPalm(-232 + rng() * 6, z + rng() * 8, rng);
      this.addPalm(-218 + rng() * 4, z + 12 + rng() * 8, rng);
    }
    this.addSign(-218, -120, 'SOLMARINA BEACH', 0x7dd8ff);
  }

  buildDocks() {
    // Piers jutting south into the bay, with boats.
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(520, 90),
      new THREE.MeshLambertMaterial({ color: 0x1e6f8e, transparent: true, opacity: 0.92 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.12, 285);
    this.scene.add(water);
    this.animated.push({ obj: water, kind: 'water' });
    for (const px of [-130, -65, 0, 65, 130]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 60), pierMat);
      pier.position.set(px, 0.6, 255);
      pier.castShadow = true; pier.receiveShadow = true;
      this.scene.add(pier);
      this.addCollider(px, 255, 5, 30);
      // A boat moored beside each pier.
      const boat = this.makeBoat();
      boat.position.set(px + 12, 0.4, 250 + (px % 3) * 4);
      this.scene.add(boat);
      this.animated.push({ obj: boat, kind: 'boat', phase: px });
    }
    this.addSign(0, 232, 'MARISOL MARINA', 0x7dd8ff);
  }

  makeBoat() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 12),
      new THREE.MeshLambertMaterial({ color: 0xe8e4da }));
    hull.position.y = 0.4;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 5),
      new THREE.MeshLambertMaterial({ color: 0x2e4a5e }));
    cabin.position.set(0, 1.9, -1);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x5a4a33 }));
    mast.position.set(0, 4, 1.5);
    g.add(hull, cabin, mast);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  addPalm(x, z, rng) {
    const g = new THREE.Group();
    const lean = (rng() - 0.5) * 0.16;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 7, 7),
      new THREE.MeshLambertMaterial({ color: 0x8a6f4d }));
    trunk.position.y = 3.5; trunk.rotation.z = lean;
    g.add(trunk);
    const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3d, side: THREE.DoubleSide });
    for (let k = 0; k < 6; k++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.6, 4), frondMat);
      const a = (k / 6) * Math.PI * 2;
      f.position.set(Math.cos(a) * 1.7, 7.1, Math.sin(a) * 1.7);
      f.rotation.z = Math.cos(a) * 1.9;
      f.rotation.x = -Math.sin(a) * 1.9;
      f.scale.set(1, 1, 0.22);
      g.add(f);
    }
    g.position.set(x, 0, z);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.palms.push(g);
    return g;
  }

  addSign(x, z, text, color) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#10152a'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#' + color.toString(16).padStart(6, '0');
    g.lineWidth = 6; g.strokeRect(4, 4, 504, 88);
    g.fillStyle = '#' + color.toString(16).padStart(6, '0');
    g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 52);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3),
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x222222 }));
    sign.position.set(x, 6.5, z);
    this.scene.add(sign);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5, 6),
      new THREE.MeshLambertMaterial({ color: 0x3c3f46 }));
    pole.position.set(x, 2.5, z);
    this.scene.add(pole);
  }

  buildProps() {
    const rng = this.rng;
    // Street lamps along the central avenue and the beachfront road.
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffe9b0, emissive: 0xcc9933 });
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.5, 6);
    const bulbGeo = new THREE.SphereGeometry(0.45, 8, 6);
    for (const rx of [0, -195]) {
      for (let z = -240; z <= 240; z += 32) {
        const pole = new THREE.Mesh(poleGeo, lampMat);
        pole.position.set(rx + 9.5, 3.25, z);
        this.scene.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(rx + 9.5, 6.6, z);
        this.scene.add(bulb);
      }
    }
    // Palms down the central avenue.
    for (let z = -230; z <= 230; z += 32) {
      this.addPalm(9.5, z + 16, rng);
      this.addPalm(-9.5, z, rng);
    }
    // Traffic cones near the marina yard.
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xff6a2a });
    const coneGeo = new THREE.ConeGeometry(0.5, 1.1, 8);
    for (let k = 0; k < 10; k++) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(30 + rng() * 20, 0.9, 205 + rng() * 16);
      cone.castShadow = true;
      this.scene.add(cone);
    }
  }

  update(t) {
    for (const a of this.animated) {
      if (a.kind === 'water') a.obj.position.y = 0.12 + Math.sin(t * 0.7 + a.obj.position.x) * 0.06;
      else if (a.kind === 'boat') {
        a.obj.position.y = 0.4 + Math.sin(t * 0.9 + a.phase) * 0.15;
        a.obj.rotation.z = Math.sin(t * 0.6 + a.phase) * 0.02;
      } else if (a.kind === 'fountain') a.obj.scale.setScalar(1 + Math.sin(t * 2.2) * 0.03);
      else if (a.kind === 'beacon') a.obj.material.emissiveIntensity = 0.6 + Math.sin(t * 3) * 0.5;
    }
  }
}
