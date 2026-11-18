// Marisol Bay — the MBPD police helicopter. It joins the chase at wanted
// level 4 and 5: it orbits the player from above, paints them with a
// searchlight cone and a real spotlight, and while it is overhead the
// wanted level cannot cool down. When the heat drops it flies away.
import * as THREE from 'three';
import { clamp, damp, angleLerp } from './util.js';

const HOVER_HEIGHT = 17.5;
const ORBIT_RADIUS = 15;

function buildHelicopterMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2f55 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x14202e });
  // Fuselage: a stretched sphere with a glass nose and a blue cheatline.
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 10), white);
  body.scale.set(1.05, 0.95, 1.9);
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 8), glass);
  nose.position.set(0, 0.15, 1.55);
  nose.scale.set(0.95, 0.8, 0.9);
  g.add(nose);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.5, 3.4), dark);
  stripe.position.y = -0.25;
  g.add(stripe);
  // Tail boom, fin and tail rotor.
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.6), white);
  boom.position.set(0, 0.35, -3.9);
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.5, 0.9), dark);
  fin.position.set(0, 0.9, -6.1);
  g.add(fin);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.22), dark);
  tailRotor.position.set(0.35, 0.9, -6.1);
  g.add(tailRotor);
  g.userData.tailRotor = tailRotor;
  // Skids.
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const sx of [-0.95, 0.95]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.6), skidMat);
    skid.position.set(sx, -1.55, 0.2);
    g.add(skid);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), skidMat);
    strut.position.set(sx, -1.1, 0.9);
    g.add(strut);
    const strut2 = strut.clone();
    strut2.position.z = -0.6;
    g.add(strut2);
  }
  // Main rotor: two crossed bars over a translucent blur disc.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.7, 6), skidMat);
  mast.position.y = 1.6;
  g.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.95;
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.07, 0.55), bladeMat);
  const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 11.5), bladeMat);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.8, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  rotor.add(blade, blade2, disc);
  g.add(rotor);
  g.userData.rotor = rotor;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class PoliceHelicopter {
  constructor(scene) {
    this.scene = scene;
    this.group = buildHelicopterMesh();
    this.group.visible = false;
    scene.add(this.group);
    // The visible light cone: a scene-level beam that stretches from the
    // fuselage to the player it is hunting, so the searchlight reads in
    // stills as well as in motion.
    const coneGeo = new THREE.CylinderGeometry(0.6, 6.5, 20, 20, 1, true);
    coneGeo.translate(0, -10, 0); // hangs from the origin, widening downward
    this.cone = new THREE.Mesh(coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffe9a8, transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      }));
    this.cone.visible = false;
    scene.add(this.cone);
    // A real spotlight so the pool of light lands on the street.
    this.spot = new THREE.SpotLight(0xffe9b0, 0, 90, 0.36, 0.55, 1.7);
    this.spotTarget = new THREE.Object3D();
    scene.add(this.spotTarget);
    this.spot.target = this.spotTarget;
    this.group.add(this.spot);
    this.spot.position.set(0, -1, 0.5);
    this.active = false;
    this.leaving = false;
    this.holdStaged = false; // screenshot staging: stay where stageAt put it
    this.x = 0; this.z = 0; this.y = HOVER_HEIGHT;
    this.heading = 0;
    this.orbitA = 0;
  }

  // Put the helicopter somewhere specific right now (screenshot staging).
  stageAt(x, z, playerX, playerZ, height = 14) {
    this.x = x; this.z = z; this.y = height;
    this.orbitA = Math.atan2(z - playerZ, x - playerX);
    this.active = true;
    this.leaving = false;
    this.holdStaged = true;
    this.group.visible = true;
    this.cone.visible = true;
    this.spot.intensity = 700;
    this.sync(0);
    this.aimBeam(playerX, playerZ);
  }

  // Stretch and point the searchlight beam from the helicopter to the
  // player, and keep the spotlight's target on them too.
  aimBeam(playerX, playerZ) {
    const dx = playerX - this.x, dy = 0 - this.y, dz = playerZ - this.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    this.cone.position.set(this.x, this.y, this.z);
    const dir = new THREE.Vector3(dx / dist, dy / dist, dz / dist);
    this.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    const s = dist / 20;
    // The beam lengthens with distance but only widens a little, so it
    // stays a shaft of light instead of a fog bank.
    const w = Math.min(s, 1.25);
    this.cone.scale.set(w, s, w);
    this.spotTarget.position.set(playerX, 0, playerZ);
  }

  sync(rotSpeed) {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;
    this.group.rotation.z = clamp(Math.sin(this.orbitA) * 0.12, -0.2, 0.2);
    if (rotSpeed) {
      this.group.userData.rotor.rotation.y += rotSpeed;
      this.group.userData.tailRotor.rotation.x += rotSpeed * 1.7;
    }
  }

  update(dt, playerX, playerZ, wanted, now) {
    const wantedHigh = wanted >= 4;
    if (wantedHigh && !this.active) {
      // Fly in from down the coast.
      this.active = true;
      this.leaving = false;
      this.x = playerX + 95;
      this.z = playerZ + 95;
      this.y = 32;
      this.group.visible = true;
      this.cone.visible = true;
      this.spot.intensity = 700;
    }
    if (!this.active) return;
    if (this.holdStaged && wantedHigh) {
      // Staged composition: hover in place, beam and rotors alive.
      this.aimBeam(playerX, playerZ);
      this.cone.material.opacity = 0.09 + Math.sin(now * 7) * 0.015;
      this.sync(dt * 30);
      return;
    }
    if (!wantedHigh && !this.leaving) {
      this.leaving = true;
      this.cone.visible = false;
      this.spot.intensity = 0;
    }
    if (this.leaving) {
      // Climb away from the player and despawn once it is far off.
      const dx = this.x - playerX, dz = this.z - playerZ;
      const d = Math.hypot(dx, dz) || 1;
      this.x += (dx / d) * 34 * dt;
      this.z += (dz / d) * 34 * dt;
      this.y = damp(this.y, 36, 1.2, dt);
      this.heading = angleLerp(this.heading, Math.atan2(dx, dz), 1 - Math.exp(-3 * dt));
      this.sync(dt * 30);
      if (d > 150) {
        this.active = false;
        this.leaving = false;
        this.group.visible = false;
        this.cone.visible = false;
        this.spot.intensity = 0;
      }
      return;
    }
    // Orbit the player, searchlight pinned to them.
    this.orbitA += dt * 0.22;
    const tx = playerX + Math.cos(this.orbitA) * ORBIT_RADIUS;
    const tz = playerZ + Math.sin(this.orbitA) * ORBIT_RADIUS;
    this.x = damp(this.x, tx, 1.4, dt);
    this.z = damp(this.z, tz, 1.4, dt);
    this.y = damp(this.y, HOVER_HEIGHT + Math.sin(now * 0.8) * 1.2, 2, dt);
    const face = Math.atan2(playerX - this.x, playerZ - this.z);
    this.heading = angleLerp(this.heading, face, 1 - Math.exp(-2.5 * dt));
    this.aimBeam(playerX, playerZ);
    this.cone.material.opacity = 0.09 + Math.sin(now * 7) * 0.015;
    this.sync(dt * 30);
  }
}
