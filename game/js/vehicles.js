// Marisol Bay — vehicles: car meshes, arcade driving, traffic AI, police pursuit.
import * as THREE from 'three';
import { ROADS, ROAD_HALF } from './city.js';
import { mulberry32, pick, clamp, angleLerp, angleDiff, dist2d, damp } from './util.js';

export const CAR_DEFS = [
  { name: 'Strada Sedan', kind: 'sedan', color: 0xc0c8d0, topSpeed: 26, accel: 11 },
  { name: 'Vulcaro Coupe', kind: 'coupe', color: 0xd84040, topSpeed: 30, accel: 13 },
  { name: 'Comet GT', kind: 'sports', color: 0xffc21c, topSpeed: 36, accel: 16 },
  { name: 'Bison Van', kind: 'van', color: 0x4a7a9e, topSpeed: 22, accel: 9 },
  { name: 'Marisol Taxi', kind: 'taxi', color: 0xf2c200, topSpeed: 26, accel: 11 },
  { name: 'Solano Pickup', kind: 'pickup', color: 0x5a7a4a, topSpeed: 25, accel: 11 },
];

function makeCarMesh(def, isPolice) {
  const g = new THREE.Group();
  const bodyColor = isPolice ? 0xf2f2f2 : def.color;
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const bodyH = def.kind === 'sports' ? 0.55 : def.kind === 'van' ? 0.95 : 0.7;
  const bodyL = def.kind === 'van' ? 5.0 : 4.4;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, bodyH, bodyL), bodyMat);
  body.position.y = 0.55 + bodyH / 2 - 0.35;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, def.kind === 'van' ? 2.6 : 2.0), glassMat);
  cabin.position.set(0, body.position.y + bodyH / 2 + 0.3, def.kind === 'van' ? -0.4 : -0.2);
  g.add(cabin);
  if (def.kind === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.35), darkMat);
    spoiler.position.set(0, 1.25, -2.05);
    g.add(spoiler);
  }
  if (def.kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffe9b0, emissive: 0x664400 }));
    sign.position.set(0, 1.65, -0.2);
    g.add(sign);
  }
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.28, bodyL * 0.7), darkMat);
    stripe.position.set(0, body.position.y, 0);
    g.add(stripe);
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4), darkMat);
    barBase.position.set(0, 1.62, -0.2);
    g.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.38),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff0000 }));
    red.position.set(-0.28, 1.72, -0.2);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.38),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0022ff }));
    blue.position.set(0.28, 1.72, -0.2);
    g.add(red, blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  // Headlights + taillights.
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c9, emissive: 0xaa9933 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x880000 });
  for (const sx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), headMat);
    h.position.set(sx, body.position.y, bodyL / 2);
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), tailMat);
    t.position.set(sx, body.position.y, -bodyL / 2);
    g.add(t);
  }
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Car {
  constructor(def, isPolice, scene) {
    this.def = def;
    this.isPolice = !!isPolice;
    this.group = makeCarMesh(def, isPolice);
    scene.add(this.group);
    this.x = 0; this.z = 0; this.heading = 0; this.speed = 0;
    this.health = 100;
    this.steer = 0;
    this.dead = false;
    this.smoke = 0;
  }
  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading; this.speed = 0;
    this.sync();
  }
  sync() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
  }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
}

export class VehicleManager {
  constructor(scene, city, fx, sound, seed) {
    this.scene = scene;
    this.city = city;
    this.fx = fx;
    this.sound = sound;
    this.rng = mulberry32(seed);
    this.traffic = [];
    this.police = [];
    this.parked = [];   // enterable cars that never move on their own
    this.wrecks = [];
    this.flashT = 0;
  }

  allCars() { return [...this.traffic, ...this.police, ...this.parked]; }

  spawnCar(def, x, z, heading, isPolice) {
    const car = new Car(def, isPolice, this.scene);
    car.place(x, z, heading);
    return car;
  }

  randomRoadPoint(nearX, nearZ, maxDist) {
    for (let tries = 0; tries < 20; tries++) {
      const road = pick(this.rng, ROADS);
      const along = -240 + this.rng() * 480;
      const horiz = this.rng() < 0.5;
      const x = horiz ? along : road;
      const z = horiz ? road : along;
      if (nearX === undefined || dist2d(x, z, nearX, nearZ) < maxDist) return { x, z, horiz };
    }
    return { x: 0, z: 0, horiz: true };
  }

  spawnTraffic(n, nearX, nearZ) {
    for (let i = 0; i < n; i++) {
      const p = this.randomRoadPoint(nearX, nearZ, 260);
      const def = pick(this.rng, CAR_DEFS);
      const car = this.spawnCar(def, p.x, p.z, 0, false);
      car.isTraffic = true;
      car.axis = p.horiz ? 'x' : 'z';
      car.dir = this.rng() < 0.5 ? 1 : -1;
      car.heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (car.dir > 0 ? 0 : Math.PI);
      car.cruise = 7 + this.rng() * 5;
      car.speed = car.cruise;
      car.wait = 0;
      // Lane offset (right-hand traffic).
      if (car.axis === 'x') car.z += car.dir > 0 ? 2.2 : -2.2;
      else car.x += car.dir > 0 ? -2.2 : 2.2;
      car.sync();
      this.traffic.push(car);
    }
  }

  spawnPolice(x, z) {
    const p = this.randomRoadPoint(x, z, 120);
    const car = this.spawnCar(CAR_DEFS[0], p.x, p.z, 0, true);
    car.isPolice = true;
    car.speed = 0;
    this.police.push(car);
    return car;
  }

  clearPolice() {
    for (const c of this.police) { this.scene.remove(c.group); }
    this.police = [];
  }

  nearestCar(x, z, maxDist, exclude) {
    let best = null, bd = maxDist;
    for (const c of this.allCars()) {
      if (c === exclude || c.dead) continue;
      const d = dist2d(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // Arcade driving for the player's car. input: {up, down, left, right, brake}
  drive(car, input, dt) {
    const def = car.def;
    const fwd = input.up ? 1 : 0;
    const rev = input.down ? 1 : 0;
    const targetSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    car.steer = angleLerp(car.steer, targetSteer, 1 - Math.exp(-8 * dt));
    const spd = Math.abs(car.speed);
    if (fwd) car.speed += def.accel * dt * (car.speed < 0 ? 2.2 : 1);
    if (rev) car.speed -= (car.speed > 0 ? 16 : 8) * dt;
    if (!fwd && !rev) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    if (input.brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = clamp(car.speed, -10, def.topSpeed);
    const steerAuthority = clamp(spd / 8, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.heading += car.steer * 1.55 * steerAuthority * dt * (spd > 0.5 ? 1 : 0);
    const f = car.forward();
    let nx = car.x + f.x * car.speed * dt;
    let nz = car.z + f.z * car.speed * dt;
    // Stay out of the water and off the sand dunes; buildings push the car out.
    if (nx < -248) { nx = -248; car.speed *= 0.4; }
    if (nx > 258) { nx = 258; car.speed *= 0.4; }
    if (nz < -258) { nz = -258; car.speed *= 0.4; }
    if (nz > 258) { nz = 258; car.speed *= 0.4; }
    const hit = this.city.collide(nx, nz, 2.0);
    if (hit.hit && spd > 6) {
      car.health -= (spd - 6) * 0.9;
      this.fx.sparks(nx, 1, nz, 8);
      this.sound.crash();
      car.speed *= 0.45;
    }
    car.x = hit.x; car.z = hit.z;
    car.sync();
    // Body roll + pitch for feel.
    car.group.rotation.z = -car.steer * 0.045 * clamp(spd / 14, 0, 1);
    car.group.rotation.x = clamp(-(fwd ? 1 : 0) * 0.02 + (rev ? 0.03 : 0), -0.05, 0.05);
    return car;
  }

  updateTraffic(dt, playerX, playerZ) {
    for (const c of this.traffic) {
      if (c.dead) continue;
      // Car ahead on the same lane: slow down.
      let target = c.cruise;
      for (const o of this.traffic) {
        if (o === c || o.dead) continue;
        const dx = o.x - c.x, dz = o.z - c.z;
        const along = c.axis === 'x' ? dx * c.dir : dz * c.dir;
        const side = c.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
        if (along > 0 && along < 13 && side < 3) { target = 0; break; }
      }
      c.speed = damp(c.speed, target, 1.6, dt);
      const step = c.speed * dt * c.dir;
      if (c.axis === 'x') c.x += step; else c.z += step;
      // At an intersection, sometimes turn onto the crossing road.
      c.turnCooldown = Math.max(0, (c.turnCooldown || 0) - dt);
      if (c.turnCooldown <= 0) {
        const along = c.axis === 'x' ? c.x : c.z;
        const cross = ROADS.find((r) => Math.abs(along - r) < 3.5);
        if (cross !== undefined && this.rng() < 0.5) {
          c.turnCooldown = 3;
          if (c.axis === 'x') {
            c.axis = 'z';
            c.dir = this.rng() < 0.5 ? 1 : -1;
            c.x = cross + (c.dir > 0 ? -2.2 : 2.2);
            c.heading = c.dir > 0 ? 0 : Math.PI;
          } else {
            c.axis = 'x';
            c.dir = this.rng() < 0.5 ? 1 : -1;
            c.z = cross + (c.dir > 0 ? 2.2 : -2.2);
            c.heading = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          }
        }
      }
      // Wrap around the city edges so traffic never runs out.
      if (c.axis === 'x' && (c.x > 256 || c.x < -256)) { c.x = -c.x * 0.98; }
      if (c.axis === 'z' && (c.z > 256 || c.z < -256)) { c.z = -c.z * 0.98; }
      // Keep traffic near the player: recycle far cars.
      if (dist2d(c.x, c.z, playerX, playerZ) > 330) {
        const p = this.randomRoadPoint(playerX, playerZ, 200);
        c.x = p.x; c.z = p.z;
        c.axis = p.horiz ? 'x' : 'z';
        c.dir = this.rng() < 0.5 ? 1 : -1;
        c.heading = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      }
      c.sync();
    }
  }

  updatePolice(dt, playerX, playerZ, playerSpeed) {
    this.flashT += dt;
    const flash = Math.floor(this.flashT * 6) % 2 === 0;
    for (const c of this.police) {
      if (c.dead) continue;
      if (c.group.userData.lightRed) {
        c.group.userData.lightRed.material.emissiveIntensity = flash ? 2 : 0.2;
        c.group.userData.lightBlue.material.emissiveIntensity = flash ? 0.2 : 2;
      }
      // Pursuit: steer toward the player, capped speed a touch above traffic.
      const want = Math.atan2(playerX - c.x, playerZ - c.z);
      const diff = angleDiff(c.heading, want);
      c.heading += clamp(diff, -1.9 * dt, 1.9 * dt);
      const target = 24 + Math.min(8, Math.abs(playerSpeed) * 0.35);
      c.speed = damp(c.speed, target, 1.2, dt);
      const f = c.forward();
      let nx = c.x + f.x * c.speed * dt;
      let nz = c.z + f.z * c.speed * dt;
      const hit = this.city.collide(nx, nz, 2.0);
      if (hit.hit) { c.speed *= 0.5; }
      c.x = clamp(hit.x, -252, 256);
      c.z = clamp(hit.z, -256, 256);
      c.sync();
    }
  }

  damageCar(car, amount, byPlayer) {
    if (car.dead) return;
    car.health -= amount;
    if (car.health <= 0) {
      car.dead = true;
      car.health = 0;
      this.fx.explosion(car.x, 1.2, car.z);
      this.sound.explosion();
      car.group.rotation.z = 0.35;
      car.smoke = 1;
      this.wrecks.push(car);
    }
  }

  updateWrecks(dt) {
    for (const c of this.wrecks) {
      if (c.smoke > 0) {
        c.smoke -= dt * 0.25;
        if (Math.random() < 0.3) this.fx.smoke(c.x, 1.5, c.z);
      }
    }
  }
}
