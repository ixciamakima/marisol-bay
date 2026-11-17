// Marisol Bay — story missions and side jobs.
// Six story jobs for fixer Vera Solano, plus repeatable taxi fares.
// The manager owns the objective text, the 3D beacon and the mission timers.
import * as THREE from 'three';
import { dist2d, clamp } from './util.js';

const MISSIONS = [
  {
    id: 'welcome-home', title: 'Welcome Home', reward: 200,
    intro: 'Vera Solano is waiting at Plaza del Sol. Go and say hello.',
    steps: [
      { kind: 'goto', x: -32, z: -32, radius: 6, text: 'Meet Vera at Plaza del Sol' },
    ],
  },
  {
    id: 'first-fare', title: 'First Fare', reward: 150,
    intro: 'A customer is waiting on the beachfront. Pick them up — in any car — and drop them at the Bayview Hotel.',
    steps: [
      { kind: 'pickup', x: -216, z: -120, radius: 5, text: 'Pick up the customer at Solmarina Beach' },
      { kind: 'deliver', x: -210, z: 65, radius: 7, time: 90, text: 'Drop the customer at the Bayview Hotel' },
    ],
  },
  {
    id: 'borrowed-wheels', title: 'Borrowed Wheels', reward: 300,
    intro: 'Sal needs a Comet GT, and there is one parked at the marina yard. Take it. Quietly is optional.',
    steps: [
      { kind: 'steal', x: 32, z: 210, radius: 5, text: 'Steal the Comet GT at the marina yard' },
      { kind: 'deliver', x: 97, z: 97, radius: 8, time: 120, text: 'Deliver the Comet GT to Sal\u2019s garage' },
    ],
  },
  {
    id: 'heat', title: 'Heat', reward: 350,
    intro: 'The MBPD is all over you. Survive a 3-star wanted level for 45 seconds — on foot or in a car.',
    steps: [
      { kind: 'survive', time: 45, wanted: 3, text: 'Survive the heat — 45 seconds' },
    ],
  },
  {
    id: 'dockside-deal', title: 'Dockside Deal', reward: 500,
    intro: 'Vera\u2019s deal at the marina went bad. The Solano crew is shooting. Take them out and grab the package. Vera gave you a pistol.',
    steps: [
      { kind: 'combat', x: 0, z: 250, radius: 40, count: 4, text: 'Clear the docks of the rival crew' },
      { kind: 'collect', x: 65, z: 250, radius: 5, text: 'Collect the package from pier 4' },
    ],
  },
  {
    id: 'the-getaway', title: 'The Getaway', reward: 800,
    intro: 'One last run. Four stars on your tail — reach the north bridge checkpoint before they box you in.',
    steps: [
      { kind: 'drive', x: 0, z: -248, radius: 10, time: 120, wanted: 4, text: 'Reach the north bridge checkpoint' },
    ],
  },
];

export class MissionManager {
  constructor(scene, G) {
    this.scene = scene;
    this.G = G; // game context: player, vehicles, peds, city, fx, sound, hud callbacks
    this.index = 0;             // current story mission
    this.completed = 0;
    this.stepIndex = 0;
    this.active = false;
    this.stepT = 0;
    this.stepState = {};
    this.customer = null;
    this.rivals = [];
    this.stealCar = null;
    this.fare = null;           // active taxi fare {customer, destX, destZ, time, pay}
    this.fareCooldown = 12;
    this.beacon = this.makeBeacon();
    this.scene.add(this.beacon);
    this.beacon.visible = false;
  }

  makeBeacon() {
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    cyl.position.y = 30;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.28, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xffd75e }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.4;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd75e }));
    arrow.position.y = 8;
    arrow.rotation.x = Math.PI;
    g.add(cyl, ring, arrow);
    g.userData.ring = ring;
    g.userData.arrow = arrow;
    return g;
  }

  current() { return MISSIONS[this.index] || null; }
  currentStep() {
    const m = this.current();
    return m ? m.steps[this.stepIndex] : null;
  }

  objectiveText() {
    if (this.fare) return this.fare.text;
    const s = this.currentStep();
    if (!s) return this.index >= MISSIONS.length
      ? 'Story complete — free roam. Taxi fares pay the bills.'
      : 'Talk to Vera to start the next job.';
    if (s.kind === 'survive') return `${s.text} — ${Math.ceil(this.stepT)}s left`;
    if (s.time) return `${s.text} — ${Math.ceil(this.stepT)}s left`;
    return s.text;
  }

  marker() {
    if (this.fare) return { x: this.fare.destX, z: this.fare.destZ, kind: 'fare' };
    const s = this.currentStep();
    if (!s) return null;
    if (s.kind === 'survive') return null;
    if (s.kind === 'combat') return { x: s.x, z: s.z, kind: 'combat' };
    return { x: s.x, z: s.z, kind: 'mission' };
  }

  startStory() {
    if (this.index >= MISSIONS.length) return;
    this.active = true;
    this.stepIndex = 0;
    this.beginStep();
    const m = this.current();
    this.G.toast(m.title.toUpperCase(), m.intro);
    this.G.sound.missionDone();
  }

  beginStep() {
    const s = this.currentStep();
    if (!s) return;
    this.stepState = {};
    this.stepT = s.time || 0;
    const G = this.G;
    if (s.kind === 'pickup') {
      this.customer = G.peds.spawnCustomer(s.x, s.z);
    }
    if (s.kind === 'steal') {
      // Park a Comet GT at the marina yard.
      const def = G.vehicles.spawnCar(
        { name: 'Comet GT', kind: 'sports', color: 0xffc21c, topSpeed: 36, accel: 16 },
        s.x, s.z, Math.PI / 2, false);
      def.isParkedTarget = true;
      this.stealCar = def;
      G.vehicles.parked.push(def); // enterable, but not part of moving traffic
    }
    if (s.kind === 'combat') {
      G.player.hasPistol = true;
      G.player.weapon = 'pistol';
      G.toast('PISTOL ACQUIRED', 'Click to fire. Watch your health.');
      this.rivals = [];
      for (let i = 0; i < s.count; i++) {
        const a = (i / s.count) * Math.PI * 2;
        const p = G.peds.spawnPed(s.x + Math.cos(a) * 12, s.z + Math.sin(a) * 8, false);
        p.isRival = true;
        p.hp = 100;
        p.state = 'chase';
        p.speed = 3.4;
        this.rivals.push(p);
      }
    }
    if (s.kind === 'survive' || s.kind === 'drive') {
      G.setWanted(s.wanted || 3);
    }
    this.updateBeacon();
  }

  updateBeacon() {
    const m = this.marker();
    if (m) {
      this.beacon.visible = true;
      this.beacon.position.set(m.x, 0, m.z);
    } else {
      this.beacon.visible = false;
    }
  }

  advanceStep() {
    const m = this.current();
    this.stepIndex++;
    if (this.stepIndex >= m.steps.length) {
      this.completeMission(m);
    } else {
      this.beginStep();
    }
  }

  completeMission(m) {
    this.G.addCash(m.reward);
    this.G.addRespect(10);
    this.G.sound.missionDone();
    this.G.toast('MISSION COMPLETE', `${m.title} — +$${m.reward}`);
    this.completed++;
    this.index++;
    this.active = false;
    this.stepIndex = 0;
    this.beacon.visible = false;
    this.G.setWanted(0);
    this.G.onMissionComplete(this.index);
    if (this.index < MISSIONS.length) {
      this.G.toast('NEW JOB AVAILABLE', 'Drive to the next marker — or keep exploring.');
    } else {
      this.G.toast('STORY COMPLETE', 'Marisol Bay is yours, Leo. Free roam!');
    }
  }

  failMission(reason) {
    this.G.toast('MISSION FAILED', reason);
    this.G.sound.wantedUp();
    // Restart the current mission from its first step.
    this.active = true;
    this.stepIndex = 0;
    this.cleanupStep();
    this.beginStep();
  }

  cleanupStep() {
    if (this.customer) { this.G.peds.removePed(this.customer); this.customer = null; }
    if (this.stealCar) {
      this.G.vehicles.parked = this.G.vehicles.parked.filter((c) => c !== this.stealCar);
      this.G.scene.remove(this.stealCar.group);
      this.stealCar = null;
    }
    for (const r of this.rivals) this.G.peds.removePed(r);
    this.rivals = [];
  }

  playerPos() {
    const p = this.G.player;
    return p.inCar ? { x: p.inCar.x, z: p.inCar.z } : { x: p.x, z: p.z };
  }

  update(dt) {
    // Beacon pulse.
    if (this.beacon.visible) {
      this.beacon.userData.ring.scale.setScalar(1 + Math.sin(performance.now() / 300) * 0.12);
      this.beacon.userData.arrow.position.y = 8 + Math.sin(performance.now() / 240) * 1.2;
      this.beacon.rotation.y += dt * 0.8;
    }
    // Rivals shoot at the player.
    const G = this.G;
    const pp = this.playerPos();
    for (const r of [...this.rivals]) {
      if (r.state === 'down') continue;
      const d = dist2d(r.x, r.z, pp.x, pp.z);
      if (d < 40) {
        const want = Math.atan2(pp.x - r.x, pp.z - r.z);
        r.heading = want;
        r.group.rotation.y = want;
        r.shootT = (r.shootT || 0) - dt;
        if (r.shootT <= 0 && d < 34) {
          r.shootT = 1.1 + Math.random() * 0.7;
          G.sound.gunshot();
          G.fx.muzzle(r.x + Math.sin(want), 1.4, r.z + Math.cos(want));
          if (Math.random() < 0.55) {
            G.player.damage(5 + Math.random() * 7, G.now);
            G.fx.sparks(pp.x, 1.2, pp.z, 4);
            G.onPlayerHit();
          }
        }
        if (d > 6) {
          r.x += Math.sin(want) * r.speed * dt;
          r.z += Math.cos(want) * r.speed * dt;
          r.sync();
        }
      }
    }
    // Taxi fares: spawn a waiting customer now and then while free-roaming.
    this.fareCooldown -= dt;
    if (!this.fare && !this.active && this.index >= 1 && this.fareCooldown <= 0) {
      this.fareCooldown = 26;
      const a = Math.random() * Math.PI * 2;
      const cx = clamp(pp.x + Math.cos(a) * 60, -210, 240);
      const cz = clamp(pp.z + Math.sin(a) * 60, -240, 240);
      if (!G.city.isWater(cx, cz) && cx > -220) {
        this.fare = {
          customer: G.peds.spawnCustomer(cx, cz),
          destX: 0, destZ: 0, time: 0, pay: 0, picked: false,
          text: 'Taxi fare waiting — drive close and press T',
        };
        this.updateBeacon();
      }
    }
    if (this.fare && !this.fare.picked) {
      const c = this.fare.customer;
      if (!c || c.state === 'down') { this.cancelFare(); return; }
      this.beacon.visible = true;
      this.beacon.position.set(c.x, 0, c.z);
      const d = dist2d(pp.x, pp.z, c.x, c.z);
      if (d > 120) { this.cancelFare(); return; }
    }
    // Story steps.
    if (!this.active) return;
    const s = this.currentStep();
    if (!s) return;
    if (s.time && s.kind !== 'survive') {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.failMission('Out of time.');
        return;
      }
    } else if (s.kind === 'survive') {
      this.stepT -= dt;
    }
    switch (s.kind) {
      case 'goto':
      case 'deliver':
      case 'collect':
      case 'drive': {
        const d = dist2d(pp.x, pp.z, s.x, s.z);
        if (d < s.radius) this.advanceStep();
        break;
      }
      case 'pickup': {
        const p = this.G.player;
        if (p.inCar && this.customer && dist2d(p.inCar.x, p.inCar.z, s.x, s.z) < s.radius) {
          G.peds.removePed(this.customer);
          this.customer = null;
          G.toast('PASSENGER ABOARD', 'Drive carefully — the meter is running.');
          this.advanceStep();
        } else if (!p.inCar && this.customer && dist2d(p.x, p.z, s.x, s.z) < 3) {
          G.toast('YOU NEED A CAR', 'Steal or borrow any car, then pick them up.');
        }
        break;
      }
      case 'steal': {
        const p = this.G.player;
        if (p.inCar === this.stealCar) {
          G.setWanted(Math.max(G.wanted, 1));
          G.toast('NICE WHEELS', 'Now get it to Sal\u2019s garage in one piece.');
          this.advanceStep();
        }
        break;
      }
      case 'survive': {
        this.stepT = Math.max(this.stepT, 0);
        if (this.stepT <= 0) this.advanceStep();
        break;
      }
      case 'combat': {
        const alive = this.rivals.filter((r) => r.state !== 'down').length;
        if (alive === 0) {
          G.toast('DOCKS CLEAR', 'Grab the package from pier 4.');
          this.advanceStep();
        }
        break;
      }
      default:
        break;
    }
  }

  // Player pressed T near a waiting fare customer.
  tryPickupFare() {
    if (!this.fare || this.fare.picked) return false;
    const p = this.G.player;
    if (!p.inCar) return false;
    const c = this.fare.customer;
    if (dist2d(p.inCar.x, p.inCar.z, c.x, c.z) < 6) {
      this.G.peds.removePed(c);
      this.fare.picked = true;
      // Destination: a hotel or landmark on the far side of town.
      const dests = [[-210, 65], [65, -195], [195, 195], [-32, -32], [130, -130]];
      const [dx, dz] = dests[Math.floor(Math.random() * dests.length)];
      this.fare.destX = dx; this.fare.destZ = dz;
      this.fare.time = 75;
      const d = dist2d(p.inCar.x, p.inCar.z, dx, dz);
      this.fare.pay = Math.round(60 + d * 0.35);
      this.fare.text = `Taxi fare — deliver in ${Math.ceil(this.fare.time)}s for $${this.fare.pay}`;
      this.G.toast('FARE ACCEPTED', `Destination marked — $${this.fare.pay} on delivery.`);
      this.updateBeacon();
      return true;
    }
    return false;
  }

  updateFare(dt) {
    if (!this.fare || !this.fare.picked) return;
    this.fare.time -= dt;
    const p = this.playerPos();
    if (dist2d(p.x, p.z, this.fare.destX, this.fare.destZ) < 8) {
      this.G.addCash(this.fare.pay);
      this.G.sound.pickup();
      this.G.toast('FARE DELIVERED', `+$${this.fare.pay}`);
      this.fare = null;
      this.fareCooldown = 20;
      this.updateBeacon();
      return;
    }
    if (this.fare.time <= 0) {
      this.G.toast('FARE LOST', 'Too slow — the customer walked away.');
      this.fare = null;
      this.fareCooldown = 20;
      this.updateBeacon();
    }
  }

  cancelFare() {
    if (this.fare && this.fare.customer) this.G.peds.removePed(this.fare.customer);
    this.fare = null;
    this.fareCooldown = 20;
    this.updateBeacon();
  }
}
