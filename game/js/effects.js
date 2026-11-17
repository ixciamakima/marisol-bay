// Marisol Bay — particles: sparks, smoke, explosions and muzzle flashes.
// One THREE.Points pool, no textures, no network.
import * as THREE from 'three';

const MAX = 700;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.size = new Float32Array(MAX);
    this.head = 0;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.PointsMaterial({
      size: 0.9, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.flash = null;
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b) {
    const i = this.head;
    this.head = (this.head + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life;
  }

  sparks(x, y, z, n = 10) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * 7;
      this.spawn(x, y, z, Math.cos(a) * s, 2 + Math.random() * 5, Math.sin(a) * s,
        0.35 + Math.random() * 0.3, 1, 0.8, 0.25);
    }
  }

  smoke(x, y, z) {
    this.spawn(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5),
      (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), (Math.random() - 0.5) * 0.6,
      1.4, 0.25, 0.25, 0.25);
  }

  explosion(x, y, z) {
    for (let k = 0; k < 46; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI;
      const s = 4 + Math.random() * 13;
      this.spawn(x, y, z,
        Math.cos(a) * Math.sin(e) * s, Math.abs(Math.cos(e)) * s * 0.8 + 2, Math.sin(a) * Math.sin(e) * s,
        0.5 + Math.random() * 0.7,
        1, 0.45 + Math.random() * 0.4, 0.1);
    }
    for (let k = 0; k < 14; k++) this.smoke(x, y + 0.5, z);
    // Flash light.
    const light = new THREE.PointLight(0xffa040, 60, 30, 1.8);
    light.position.set(x, y + 2, z);
    this.scene.add(light);
    this.flash = { light, t: 0.35 };
  }

  muzzle(x, y, z) {
    for (let k = 0; k < 6; k++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4,
        0.12, 1, 0.9, 0.4);
    }
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -100; // hide
        continue;
      }
      alive++;
      this.vel[i * 3 + 1] -= 6 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) { this.pos[i * 3 + 1] = 0.05; this.vel[i * 3 + 1] *= -0.3; }
      const f = this.life[i] / this.maxLife[i];
      this.col[i * 3] *= 0.995;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, MAX);
    if (this.flash) {
      this.flash.t -= dt;
      this.flash.light.intensity = Math.max(0, this.flash.t / 0.35) * 60;
      if (this.flash.t <= 0) {
        this.scene.remove(this.flash.light);
        this.flash = null;
      }
    }
  }
}
