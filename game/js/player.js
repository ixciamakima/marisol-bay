// Marisol Bay — Leo Marchetti, the player: on-foot movement and combat,
// carjacking, entering and leaving cars, health and weapons.
import * as THREE from 'three';
import { clamp, angleLerp, dist2d, damp } from './util.js';

function makeLeoMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x1f8a70 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x23272e });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc99878 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x1a1210 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.33, 0.9, 8), jacket);
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.74;
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), hair);
  hairTop.position.y = 1.78;
  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.78, 6), pants);
  legL.position.set(-0.14, 0.39, 0);
  const legR = legL.clone(); legR.position.x = 0.14;
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.72, 6), jacket);
  armL.position.set(-0.39, 1.05, 0);
  const armR = armL.clone(); armR.position.x = 0.39;
  g.add(body, head, hairTop, legL, legR, armL, armR);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armL = armL; g.userData.armR = armR;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Player {
  constructor(scene, city, fx, sound) {
    this.scene = scene;
    this.city = city;
    this.fx = fx;
    this.sound = sound;
    this.mesh = makeLeoMesh();
    scene.add(this.mesh);
    this.x = 0; this.z = 0; this.heading = 0;
    this.speed = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.weapon = 'fists';      // fists | pistol
    this.hasPistol = false;
    this.inCar = null;          // Car or null
    this.punchT = 0;
    this.shootT = 0;
    this.walkPhase = 0;
    this.lastDamageT = -99;
    this.dead = false;
  }

  place(x, z, heading) {
    this.x = x; this.z = z; this.heading = heading;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    this.mesh.visible = true;
  }

  get speedKmh() {
    return this.inCar ? Math.abs(this.inCar.speed) * 3.6 : Math.abs(this.speed) * 3.6;
  }

  damage(amount, now) {
    if (this.dead) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageT = now;
    if (this.health <= 0) this.dead = true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  enterCar(car) {
    this.inCar = car;
    this.mesh.visible = false;
    this.sound.engineStart();
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    const f = car.forward();
    const side = { x: -f.z, z: f.x };
    this.place(car.x + side.x * 2.6, car.z + side.z * 2.6, car.heading);
    this.sound.engineStop();
  }

  // On-foot movement. input: {up,down,left,right,sprint}, camYaw: camera heading.
  updateOnFoot(input, camYaw, dt, now) {
    this.punchT = Math.max(0, this.punchT - dt);
    this.shootT = Math.max(0, this.shootT - dt);
    // Slow health regen out of combat.
    if (now - this.lastDamageT > 8 && this.health > 0) this.heal(2.5 * dt);
    let mx = 0, mz = 0;
    if (input.up) { mx += Math.sin(camYaw); mz += Math.cos(camYaw); }
    if (input.down) { mx -= Math.sin(camYaw); mz -= Math.cos(camYaw); }
    if (input.left) { mx -= Math.cos(camYaw); mz += Math.sin(camYaw); }
    if (input.right) { mx += Math.cos(camYaw); mz -= Math.sin(camYaw); }
    const len = Math.hypot(mx, mz);
    const target = len > 0 ? (input.sprint ? 8.2 : 5.0) : 0;
    this.speed = damp(this.speed, target, 8, dt);
    if (len > 0) {
      mx /= len; mz /= len;
      const wantHeading = Math.atan2(mx, mz);
      this.heading = angleLerp(this.heading, wantHeading, 1 - Math.exp(-12 * dt));
      let nx = this.x + mx * this.speed * dt;
      let nz = this.z + mz * this.speed * dt;
      nx = clamp(nx, -224, 256);
      nz = clamp(nz, -256, 256);
      const hit = this.city.collide(nx, nz, 0.5);
      this.x = hit.x; this.z = hit.z;
    }
    // Walk cycle.
    this.walkPhase += dt * this.speed * 2.4;
    const swing = Math.sin(this.walkPhase) * 0.55 * clamp(this.speed / 5, 0, 1);
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.userData.armL.rotation.x = -swing * 0.7;
    this.mesh.userData.armR.rotation.x = swing * 0.7;
    // Punching animation.
    if (this.punchT > 0.25) {
      this.mesh.userData.armR.rotation.x = -1.6;
    }
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  punch(peds) {
    if (this.punchT > 0 || this.inCar) return null;
    this.punchT = 0.45;
    this.sound.punch();
    const f = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
    const target = peds.nearestPed(this.x + f.x * 1.2, this.z + f.z * 1.2, 1.9);
    if (target) {
      peds.knockDown(target);
      return target;
    }
    return null;
  }

  // Hitscan shot toward a world direction. Returns the ped hit, if any.
  shoot(dirX, dirZ, peds, cars) {
    if (this.shootT > 0 || this.weapon !== 'pistol' || this.inCar) return null;
    this.shootT = 0.32;
    this.sound.gunshot();
    const ox = this.x, oz = this.z;
    const mx = ox + dirX * 1.2, mz = oz + dirZ * 1.2;
    this.fx.muzzle(mx, 1.35, mz);
    peds.scare(ox, oz, 26);
    // Nearest ped roughly in the line of fire.
    let best = null, bd = 42;
    for (const p of peds.peds) {
      if (p.state === 'down') continue;
      const dx = p.x - ox, dz = p.z - oz;
      const along = dx * dirX + dz * dirZ;
      if (along < 1 || along > bd) continue;
      const perp = Math.abs(dx * dirZ - dz * dirX);
      if (perp < 1.1 + along * 0.06) { bd = along; best = p; }
    }
    if (best) {
      if (best.isRival) {
        best.hp = (best.hp ?? 100) - 34;
        this.fx.sparks(best.x, 1.2, best.z, 6);
        if (best.hp <= 0) peds.knockDown(best);
      } else {
        peds.knockDown(best);
      }
      return { ped: best };
    }
    // Or a car: damage it.
    let bestCar = null, bcd = 42;
    for (const c of [...cars.traffic, ...cars.police]) {
      if (c.dead) continue;
      const dx = c.x - ox, dz = c.z - oz;
      const along = dx * dirX + dz * dirZ;
      if (along < 1 || along > bcd) continue;
      const perp = Math.abs(dx * dirZ - dz * dirX);
      if (perp < 1.8 + along * 0.05) { bcd = along; bestCar = c; }
    }
    if (bestCar) {
      cars.damageCar(bestCar, 34, true);
      this.fx.sparks(bestCar.x, 1, bestCar.z, 6);
      return { car: bestCar };
    }
    return { miss: true };
  }

  sync() {
    if (!this.inCar) {
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.heading;
    }
  }
}
