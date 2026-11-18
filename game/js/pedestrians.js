// Marisol Bay — pedestrians: sidewalk walkers, fleeing crowds, taxi customers,
// and the foot cops who chase the player when the wanted level is up.
import * as THREE from 'three';
import { ROADS } from './city.js';
import { mulberry32, pick, clamp, angleLerp, dist2d, damp } from './util.js';

const SHIRTS = [0xe85d5d, 0x5d8fe8, 0x5de87a, 0xe8d25d, 0xb05de8, 0xe89a5d, 0xdddddd, 0x5dd8e8, 0x8a5de8];
const PANTS = [0x2c3242, 0x3a2c22, 0x22303a, 0x4a4a4a];

function makePedMesh(shirt, pants, isCop) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: isCop ? 0x1c2f55 : shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: isCop ? 0x1c2f55 : pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xc99878 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.85, 8), shirtMat);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
  head.position.y = 1.72;
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.75, 6), pantsMat);
  legL.position.set(-0.14, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), shirtMat);
  armL.position.set(-0.38, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.38;
  g.add(body, head, legL, legR, armL, armR);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armL = armL; g.userData.armR = armR;
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 10),
      new THREE.MeshLambertMaterial({ color: 0x101828 }));
    cap.position.y = 1.9;
    g.add(cap);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Ped {
  constructor(mesh, isCop) {
    this.group = mesh;
    this.isCop = !!isCop;
    this.x = 0; this.z = 0; this.heading = 0;
    this.speed = 0; this.walkPhase = Math.random() * 6;
    this.state = 'walk';       // walk | flee | wait | down | chase
    this.stateT = 0;
    this.axis = 'x'; this.dir = 1;
    this.bustedT = 0;
  }
  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
  }
  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
  }
}

export class PedestrianManager {
  constructor(scene, city, fx, sound, seed) {
    this.scene = scene;
    this.city = city;
    this.fx = fx;
    this.sound = sound;
    this.rng = mulberry32(seed);
    this.peds = [];
    this.cops = [];
    this.customers = [];
  }

  spawnPed(x, z, isCop) {
    const mesh = makePedMesh(pick(this.rng, SHIRTS), pick(this.rng, PANTS), isCop);
    this.scene.add(mesh);
    const p = new Ped(mesh, isCop);
    p.place(x, z, this.rng() * Math.PI * 2);
    p.speed = 1.2 + this.rng() * 1.1;
    p.axis = this.rng() < 0.5 ? 'x' : 'z';
    p.dir = this.rng() < 0.5 ? 1 : -1;
    return p;
  }

  spawnCrowd(n, nearX, nearZ) {
    for (let i = 0; i < n; i++) {
      const road = pick(this.rng, ROADS);
      const along = -240 + this.rng() * 480;
      const horiz = this.rng() < 0.5;
      let x = horiz ? along : road + 10.5;
      let z = horiz ? road + 10.5 : along;
      if (nearX !== undefined && dist2d(x, z, nearX, nearZ) > 260) continue;
      if (this.city.isWater(x, z) || x < -224) continue;
      const p = this.spawnPed(x, z, false);
      p.axis = horiz ? 'x' : 'z';
      p.heading = p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (p.dir > 0 ? 0 : Math.PI);
      p.sync();
      this.peds.push(p);
    }
  }

  spawnCop(x, z) {
    const p = this.spawnPed(x, z, true);
    p.state = 'chase';
    p.speed = 4.6;
    this.cops.push(p);
    return p;
  }

  spawnCustomer(x, z) {
    const p = this.spawnPed(x, z, false);
    p.state = 'wait';
    p.speed = 0;
    this.customers.push(p);
    this.peds.push(p);
    return p;
  }

  // Put a gun in a ped's hand (rival crews, so a firefight reads as one).
  armPed(p) {
    if (p.armed) return p;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.52),
      new THREE.MeshLambertMaterial({ color: 0x181a1e }));
    gun.position.set(0.34, 1.12, 0.3);
    gun.castShadow = true;
    p.group.add(gun);
    p.armed = true;
    return p;
  }

  removePed(p) {
    this.scene.remove(p.group);
    this.peds = this.peds.filter((q) => q !== p);
    this.cops = this.cops.filter((q) => q !== p);
    this.customers = this.customers.filter((q) => q !== p);
  }

  nearestPed(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const d = dist2d(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  scare(x, z, radius) {
    for (const p of this.peds) {
      // Cops hold their ground and rival crews stand and fight.
      if (p.state === 'down' || p.isCop || p.isRival) continue;
      if (dist2d(x, z, p.x, p.z) < radius) {
        p.state = 'flee';
        p.stateT = 2 + this.rng() * 2;
        p.speed = 4.5 + this.rng() * 1.5;
        p.fleeFrom = { x, z };
      }
    }
  }

  knockDown(p) {
    if (p.state === 'down') return;
    p.state = 'down';
    p.stateT = 0;
    p.group.rotation.x = -Math.PI / 2;
    p.group.position.y = 0.3;
    this.fx.sparks(p.x, 1, p.z, 5);
  }

  update(dt, playerX, playerZ, playerInCar) {
    for (const p of [...this.peds]) {
      p.stateT -= dt;
      if (p.state === 'down') {
        if (p.stateT < -6) this.removePed(p);
        continue;
      }
      if (p.state === 'wait') {
        // Wave for a taxi.
        p.walkPhase += dt * 4;
        p.group.userData.armR.rotation.z = -2.4 + Math.sin(p.walkPhase) * 0.35;
        continue;
      }
      if (p.state === 'flee') {
        if (p.stateT <= 0) { p.state = 'walk'; p.speed = 1.2 + this.rng(); }
        const away = Math.atan2(p.x - p.fleeFrom.x, p.z - p.fleeFrom.z);
        p.heading = angleLerp(p.heading, away, 1 - Math.exp(-6 * dt));
        p.x += Math.sin(p.heading) * p.speed * dt;
        p.z += Math.cos(p.heading) * p.speed * dt;
      } else if (p.state === 'walk') {
        const step = p.speed * dt * p.dir;
        if (p.axis === 'x') p.x += step; else p.z += step;
        const along = p.axis === 'x' ? p.x : p.z;
        if (Math.abs(along) > 250) p.dir *= -1;
        // Randomly turn at an intersection.
        const cross = ROADS.find((r) => Math.abs(along - r) < 1.5);
        if (cross !== undefined && this.rng() < 0.004) {
          p.axis = p.axis === 'x' ? 'z' : 'x';
          p.dir = this.rng() < 0.5 ? 1 : -1;
          p.heading = p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
            : (p.dir > 0 ? 0 : Math.PI);
        }
        // Keep on sidewalks: snap the perpendicular coordinate to the road + 10.5.
        const road = p.axis === 'x'
          ? ROADS.reduce((a, b) => Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a)
          : ROADS.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a);
        if (p.axis === 'x') p.z = damp(p.z, road + 10.5, 2, dt);
        else p.x = damp(p.x, road + 10.5, 2, dt);
      }
      // Walk cycle.
      p.walkPhase += dt * p.speed * 3.2;
      const swing = Math.sin(p.walkPhase) * 0.5 * clamp(p.speed / 3, 0.15, 1);
      p.group.userData.legL.rotation.x = swing;
      p.group.userData.legR.rotation.x = -swing;
      p.group.userData.armL.rotation.x = -swing * 0.7;
      if (p.state !== 'wait') p.group.userData.armR.rotation.x = swing * 0.7;
      // Stay inside the city and out of the water.
      p.x = clamp(p.x, -224, 256);
      p.z = clamp(p.z, -256, 256);
      p.sync();
    }
    // Foot cops chase the player on foot.
    for (const c of [...this.cops]) {
      if (c.state === 'down') continue;
      const d = dist2d(c.x, c.z, playerX, playerZ);
      if (playerInCar || d > 90) { this.removePed(c); continue; }
      const want = Math.atan2(playerX - c.x, playerZ - c.z);
      c.heading = angleLerp(c.heading, want, 1 - Math.exp(-5 * dt));
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.walkPhase += dt * c.speed * 3.2;
      const swing = Math.sin(c.walkPhase) * 0.5;
      c.group.userData.legL.rotation.x = swing;
      c.group.userData.legR.rotation.x = -swing;
      c.sync();
      if (d < 1.6) {
        c.bustedT += dt;
        if (c.bustedT > 1.6) c.bustedT = 1.6;
      } else c.bustedT = 0;
    }
  }
}
