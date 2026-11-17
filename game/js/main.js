// Marisol Bay — bootstrap, game loop, camera, wanted system, menus, saves
// and the deterministic ?shot= staging used for the entry screenshots.
import * as THREE from 'three';
import { City } from './city.js';
import { VehicleManager, CAR_DEFS } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { Player } from './player.js';
import { MissionManager } from './missions.js';
import { SoundEngine } from './audio.js';
import { Effects } from './effects.js';
import { Hud } from './hud.js';
import { clamp, damp, angleLerp, dist2d, pick, mulberry32 } from './util.js';

const SAVE_KEY = 'marisol-bay-save-v1';
const SPAWN = { x: -32, z: -20, heading: Math.PI * 0.75 };
const CITY_SEED = 1337;

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

class Game {
  constructor() {
    this.mode = 'title'; // title | playing | paused | gameover
    this.now = 0;
    this.cash = 500;
    this.respect = 0;
    this.wanted = 0;
    this.lastCrimeT = -999;
    this.gameMinutes = 18 * 60 + 42;
    this.camYaw = SPAWN.heading;
    this.camYawOffset = 0;
    this.camDist = 10;
    this.camDistTarget = 10;
    this.keys = {};
    this.dragging = false;
    this.lastCrashSound = 0;
    this.policeTimer = 0;
    this.missionTimer = null;
    this.shotMode = new URLSearchParams(location.search).get('shot') || null;
    this.shotReady = false;

    this.sound = new SoundEngine();
    this.hud = new Hud();
    this.setupRenderer();
    this.city = new City(this.scene, CITY_SEED);
    this.fx = new Effects(this.scene);
    this.vehicles = new VehicleManager(this.scene, this.city, this.fx, this.sound, CITY_SEED + 7);
    this.peds = new PedestrianManager(this.scene, this.city, this.fx, this.sound, CITY_SEED + 11);
    this.player = new Player(this.scene, this.city, this.fx, this.sound);
    this.missions = new MissionManager(this.scene, this.gameContext());
    this.vehicles.spawnTraffic(14, SPAWN.x, SPAWN.z);
    this.peds.spawnCrowd(26, SPAWN.x, SPAWN.z);
    this.player.place(SPAWN.x, SPAWN.z, SPAWN.heading);
    this.setupInput();
    this.setupMenus();
    this.updateContinueButton();
    if (this.shotMode) this.setupShot();
    this.clock = new THREE.Clock();
    this.loop();
  }

  gameContext() {
    const self = this;
    return {
      get player() { return self.player; },
      get vehicles() { return self.vehicles; },
      get peds() { return self.peds; },
      get city() { return self.city; },
      get fx() { return self.fx; },
      get sound() { return self.sound; },
      get scene() { return self.scene; },
      get wanted() { return self.wanted; },
      get now() { return self.now; },
      toast: (t, s) => self.hud.toast(t, s),
      addCash: (n) => { self.cash += n; },
      addRespect: (n) => { self.respect += n; },
      setWanted: (n) => self.setWanted(n),
      onMissionComplete: (i) => self.onMissionComplete(i),
      onPlayerHit: () => self.hud.setDamageFlash(0.55),
    };
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('game').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf7b26a);
    this.scene.fog = new THREE.Fog(0xe8a06a, 180, 620);
    // Golden-hour sun from the west-southwest.
    this.sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
    this.sun.position.set(-190, 150, 120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -260;
    this.sun.shadow.camera.right = 260;
    this.sun.shadow.camera.top = 260;
    this.sun.shadow.camera.bottom = -260;
    this.sun.shadow.camera.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(new THREE.HemisphereLight(0x87a5c9, 0x8a6f4d, 0.85));
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
    this.camera.position.set(SPAWN.x, 8, SPAWN.z + 12);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
  }

  // ---------------- input ----------------
  setupInput() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyM') {
        this.sound.setMuted(!this.sound.muted);
        this.hud.toast(this.sound.muted ? 'SOUND OFF' : 'SOUND ON', '');
      }
      if (e.code === 'KeyC') this.camDistTarget = this.camDistTarget > 11 ? 8 : 13;
      if (e.code === 'KeyH' && this.player.inCar) this.sound.horn();
      if (e.code === 'KeyE' && this.mode === 'playing') this.tryEnterExitCar();
      if (e.code === 'KeyF' && this.mode === 'playing') this.tryPunch();
      if (e.code === 'KeyT' && this.mode === 'playing') this.missions.tryPickupFare();
      if (e.code === 'Escape') {
        if (this.mode === 'playing') this.pause();
        else if (this.mode === 'paused') this.resume();
      }
      if (e.code === 'Enter' && this.mode === 'title') this.startGame(false);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('mousedown', (e) => {
      if (this.mode !== 'playing') return;
      if (e.target.closest('button')) return;
      this.dragging = true;
      this.lastMouse = { x: e.clientX, y: e.clientY };
      // Click (not drag) fires the pistol.
      this.clickStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastMouse.x;
      this.camYawOffset += dx * 0.005;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    });
    addEventListener('mouseup', (e) => {
      this.dragging = false;
      if (this.clickStart && this.mode === 'playing') {
        const moved = Math.hypot(e.clientX - this.clickStart.x, e.clientY - this.clickStart.y);
        if (moved < 6 && performance.now() - this.clickStart.t < 400) this.tryShoot();
      }
      this.clickStart = null;
    });
    addEventListener('wheel', (e) => {
      this.camDistTarget = clamp(this.camDistTarget + Math.sign(e.deltaY) * 1.5, 6, 16);
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing' && !this.shotMode) this.pause();
    });
  }

  inputState() {
    return {
      up: !!(this.keys.KeyW || this.keys.ArrowUp),
      down: !!(this.keys.KeyS || this.keys.ArrowDown),
      left: !!(this.keys.KeyA || this.keys.ArrowLeft),
      right: !!(this.keys.KeyD || this.keys.ArrowRight),
      sprint: !!this.keys.ShiftLeft || !!this.keys.ShiftRight,
      brake: !!this.keys.Space,
    };
  }

  // ---------------- menus / saves ----------------
  setupMenus() {
    const $ = (id) => document.getElementById(id);
    $('btn-new').onclick = () => { this.sound.resume(); this.sound.click(); this.startGame(true); };
    $('btn-continue').onclick = () => { this.sound.resume(); this.sound.click(); this.startGame(false); };
    $('btn-how').onclick = () => {
      $('howto').classList.toggle('hidden');
      this.sound.click();
    };
    $('btn-resume').onclick = () => this.resume();
    $('btn-restart').onclick = () => {
      this.resume();
      this.missions.failMission('Restarted. Same job, cleaner run.');
    };
    $('btn-quit').onclick = () => this.quitToTitle();
    $('btn-quit2').onclick = () => this.quitToTitle();
    $('btn-retry').onclick = () => this.retryAfterGameOver();
  }

  updateContinueButton() {
    const save = this.loadSave();
    document.getElementById('btn-continue').classList.toggle('hidden', !save);
    if (save) {
      document.getElementById('btn-continue').textContent =
        `CONTINUE — MISSION ${save.missionIndex + 1} · $${save.cash}`;
    }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash,
        respect: this.respect,
        missionIndex: this.missions.index,
        completed: this.missions.completed,
        hasPistol: this.player.hasPistol,
        savedAt: Date.now(),
      }));
    } catch (e) {}
  }

  startGame(fresh) {
    const save = fresh ? null : this.loadSave();
    if (save) {
      this.cash = save.cash;
      this.respect = save.respect;
      this.missions.index = Math.min(save.missionIndex, 5);
      this.missions.completed = save.completed || 0;
      this.player.hasPistol = !!save.hasPistol;
      if (this.player.hasPistol) this.player.weapon = 'pistol';
    } else {
      this.cash = 500; this.respect = 0;
      this.missions.index = 0; this.missions.completed = 0;
      this.player.hasPistol = false;
      this.player.weapon = 'fists';
    }
    this.player.health = 100;
    this.player.dead = false;
    this.setWanted(0);
    this.player.place(SPAWN.x, SPAWN.z, SPAWN.heading);
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    this.hud.show();
    this.mode = 'playing';
    this.sound.resume();
    this.sound.startMusic();
    this.missions.startStory();
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    const s = document.getElementById('pause-stats');
    s.innerHTML = `Cash $${this.cash.toLocaleString('en-US')} &nbsp;·&nbsp; Respect ${this.respect} &nbsp;·&nbsp; ` +
      `Missions ${this.missions.completed}/6 &nbsp;·&nbsp; Wanted ${'★'.repeat(this.wanted)}${'☆'.repeat(5 - this.wanted)}`;
    document.getElementById('pause-screen').classList.remove('hidden');
  }

  resume() {
    document.getElementById('pause-screen').classList.add('hidden');
    if (this.mode === 'paused') this.mode = 'playing';
  }

  quitToTitle() {
    this.saveGame();
    clearTimeout(this.missionTimer);
    this.mode = 'title';
    this.hud.hide();
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    this.updateContinueButton();
    this.sound.stopMusic();
    this.sound.engineStop();
  }

  gameOver(kind) {
    if (this.mode !== 'playing') return;
    this.mode = 'gameover';
    this.sound.engineStop();
    this.sound.sirenStop();
    const lost = Math.min(this.cash, 100);
    this.cash -= lost;
    document.getElementById('gameover-text').innerHTML =
      kind === 'busted'
        ? `The Marisol Bay Police took you in. Bail cost you $${lost}.<br>Your car is impounded — but the city is still yours to take back.`
        : `Leo is down. The city keeps moving without him.<br>Hospital bill: $${lost}.`;
    document.getElementById('gameover-screen').classList.remove('hidden');
    this.hud.centerMsg(kind === 'busted' ? 'BUSTED' : 'WASTED', 2600);
    this.saveGame();
  }

  retryAfterGameOver() {
    document.getElementById('gameover-screen').classList.add('hidden');
    this.hud.show();
    this.mode = 'playing';
    this.player.health = 100;
    this.player.dead = false;
    this.setWanted(0);
    if (this.player.inCar) { this.player.exitCar(); }
    this.player.place(-32, -20, Math.PI * 0.75);
    this.camYaw = Math.PI * 0.75;
    this.missions.failMission('Back on your feet. Same job.');
  }

  onMissionComplete(index) {
    this.saveGame();
    if (index < 6) {
      clearTimeout(this.missionTimer);
      this.missionTimer = setTimeout(() => {
        if (this.mode === 'playing') this.missions.startStory();
      }, 4000);
    }
  }

  // ---------------- wanted ----------------
  setWanted(n) {
    const next = clamp(Math.round(n), 0, 5);
    if (next > this.wanted) {
      this.sound.wantedUp();
      this.lastCrimeT = this.now;
    }
    this.wanted = next;
  }

  addWanted(n) { this.setWanted(this.wanted + n); }

  updateWanted(dt) {
    const step = this.missions.currentStep();
    const forced = this.missions.active && step && (step.kind === 'survive' || step.kind === 'drive');
    if (!forced && this.wanted > 0 && this.now - this.lastCrimeT > 25) {
      const nearCop = this.vehicles.police.some((c) => {
        const p = this.playerPos();
        return dist2d(c.x, c.z, p.x, p.z) < 45;
      }) || this.peds.cops.some((c) => {
        const p = this.playerPos();
        return dist2d(c.x, c.z, p.x, p.z) < 30;
      });
      if (!nearCop) {
        this.wanted -= 1;
        this.lastCrimeT = this.now;
        if (this.wanted === 0) this.hud.toast('CLEAN', 'You slipped away. The heat is off.');
      }
    }
    // Police cars: keep the count matched to the wanted level.
    const wantCars = this.wanted > 0 ? Math.min(this.wanted, 4) : 0;
    this.policeTimer -= dt;
    if (this.vehicles.police.length < wantCars && this.policeTimer <= 0) {
      this.policeTimer = 2;
      const p = this.playerPos();
      this.vehicles.spawnPolice(p.x, p.z);
      if (this.wanted >= 2) this.sound.sirenStart();
    }
    if (this.vehicles.police.length > wantCars) {
      const extra = this.vehicles.police.pop();
      this.scene.remove(extra.group);
    }
    if (this.wanted === 0) this.sound.sirenStop();
    // Foot cops when the player is on foot with heat.
    const wantCops = (!this.player.inCar && this.wanted >= 2) ? 2 : 0;
    while (this.peds.cops.length < wantCops) {
      const p = this.playerPos();
      const a = Math.random() * Math.PI * 2;
      this.peds.spawnCop(p.x + Math.cos(a) * 25, p.z + Math.sin(a) * 25);
    }
    while (this.peds.cops.length > wantCops) {
      this.peds.removePed(this.peds.cops[0]);
    }
    // Busted?
    for (const c of this.peds.cops) {
      if (c.bustedT >= 1.6) { this.gameOver('busted'); return; }
    }
  }

  playerPos() {
    const p = this.player;
    return p.inCar ? { x: p.inCar.x, z: p.inCar.z } : { x: p.x, z: p.z };
  }

  // ---------------- actions ----------------
  tryEnterExitCar() {
    const p = this.player;
    if (p.inCar) { p.exitCar(); return; }
    const car = this.vehicles.nearestCar(p.x, p.z, 3.6, null);
    if (!car) return;
    const isOwned = car.isParkedTarget && this.missions.currentStep()?.kind === 'steal';
    if (car.isPolice) {
      this.addWanted(2);
      this.hud.toast('STOLEN POLICE CAR', 'Bold. The whole MBPD is coming.');
    } else if (car.isTraffic && !car.isParkedTarget) {
      this.addWanted(1);
      this.hud.toast('CARJACKED', `You took the ${car.def.name}.`);
      this.peds.scare(car.x, car.z, 12);
    } else if (!isOwned && !car.isParkedTarget) {
      this.hud.toast(car.def.name, 'Your ride.');
    }
    p.enterCar(car);
    this.sound.engineStart();
  }

  tryPunch() {
    const target = this.player.punch(this.peds);
    if (target) {
      if (target.isCop) this.addWanted(2);
      else if (target.isRival) this.addWanted(0);
      else this.addWanted(1);
      this.peds.scare(this.player.x, this.player.z, 18);
    }
  }

  tryShoot() {
    const p = this.player;
    if (!p || p.inCar || p.weapon !== 'pistol' || this.mode !== 'playing') return;
    // Shoot toward where the camera looks (screen center), on the ground plane.
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const len = Math.hypot(camDir.x, camDir.z) || 1;
    const dx = camDir.x / len, dz = camDir.z / len;
    p.heading = Math.atan2(dx, dz);
    const hit = p.shoot(dx, dz, this.peds, this.vehicles);
    if (hit && (hit.ped || hit.car)) this.addWanted(1);
  }

  // ---------------- collisions ----------------
  collideCars(dt) {
    const p = this.player;
    if (!p.inCar || p.inCar.dead) return;
    const car = p.inCar;
    for (const o of this.vehicles.allCars()) {
      if (o === car || o.dead) continue;
      const d = dist2d(car.x, car.z, o.x, o.z);
      if (d < 3.4 && d > 0.01) {
        const nx = (car.x - o.x) / d, nz = (car.z - o.z) / d;
        const push = (3.4 - d) / 2;
        car.x += nx * push; car.z += nz * push;
        if (!o.isParkedTarget) { o.x -= nx * push; o.z -= nz * push; o.sync(); }
        const impact = Math.abs(car.speed) + Math.abs(o.speed || 0);
        if (impact > 6 && this.now - this.lastCrashSound > 0.35) {
          this.lastCrashSound = this.now;
          this.sound.crash();
          this.fx.sparks((car.x + o.x) / 2, 1, (car.z + o.z) / 2, 8);
          this.vehicles.damageCar(car, impact * 0.55, false);
          if (o.isTraffic || o.isPolice) this.vehicles.damageCar(o, impact * 0.7, true);
          car.speed *= 0.55;
        }
        car.sync();
      }
    }
    // Run over pedestrians.
    for (const ped of [...this.peds.peds]) {
      if (ped.state === 'down') continue;
      const d = dist2d(car.x, car.z, ped.x, ped.z);
      if (d < 2.1 && Math.abs(car.speed) > 3) {
        this.peds.knockDown(ped);
        this.addWanted(1);
        this.fx.sparks(ped.x, 1, ped.z, 5);
        car.speed *= 0.85;
      }
    }
    // Police ramming the player.
    for (const pc of this.vehicles.police) {
      if (pc.dead) continue;
      const d = dist2d(car.x, car.z, pc.x, pc.z);
      if (d < 3.6 && this.now - (pc.ramT || 0) > 1.2) {
        pc.ramT = this.now;
        this.vehicles.damageCar(car, 9, false);
        this.sound.crash();
        this.fx.sparks(car.x, 1, car.z, 6);
      }
    }
    // Player car wrecked?
    if (car.health <= 0 && !car.dead) {
      this.vehicles.damageCar(car, 1, false);
    }
    if (car.dead && p.inCar === car) {
      p.exitCar();
      p.place(car.x + 3, car.z, p.heading);
      p.damage(20, this.now);
      this.addWanted(1);
      this.hud.centerMsg('YOUR CAR IS TOAST', 2000);
    }
    // Smoke when badly damaged.
    if (car.health < 40 && Math.random() < 0.35) this.fx.smoke(car.x, 1.4, car.z);
  }

  collidePoliceOnFoot(dt) {
    const p = this.player;
    if (p.inCar) return;
    for (const pc of this.vehicles.police) {
      if (pc.dead) continue;
      const d = dist2d(p.x, p.z, pc.x, pc.z);
      if (d < 2.2 && Math.abs(pc.speed) > 2) {
        p.damage(12, this.now);
        this.hud.setDamageFlash(0.7);
        p.x += (p.x - pc.x) / d * 2;
        p.z += (p.z - pc.z) / d * 2;
        this.sound.crash();
      }
    }
  }

  // ---------------- shot staging ----------------
  setupShot() {
    // Deterministic scenes for the entry screenshots. Title screen is skipped.
    const rng = mulberry32(99);
    const spawn = (x, z, heading, def) => {
      const car = this.vehicles.spawnCar(def, x, z, heading, false);
      this.vehicles.parked.push(car);
      return car;
    };
    const startPlaying = () => {
      document.getElementById('start-screen').classList.add('hidden');
      this.hud.show();
      this.mode = 'playing';
      this.missions.index = 0;
      this.sound.setMuted(true);
    };
    if (this.shotMode === 'cover') {
      const car = spawn(0, 96, Math.PI, CAR_DEFS[2]);
      this.player.enterCar(car);
      car.speed = 20;
      this.camYaw = Math.PI;
      this.camDistTarget = 12;
      this.vehicles.spawnTraffic(6, 0, 60);
      this.setWanted(2);
      this.missions.index = 0;
      this.missions.startStory();
      startPlaying();
    } else if (this.shotMode === 'chase') {
      const car = spawn(65, 40, 0, CAR_DEFS[2]);
      this.player.enterCar(car);
      car.speed = 26;
      this.camYaw = 0;
      this.camDistTarget = 13;
      this.setWanted(3);
      for (let i = 0; i < 3; i++) this.vehicles.spawnPolice(65, 40 + (i + 1) * 16);
      this.vehicles.spawnTraffic(5, 65, 0);
      this.missions.index = 3;
      this.missions.startStory();
      startPlaying();
    } else if (this.shotMode === 'street') {
      this.player.place(-32, -18, Math.PI * 0.9);
      this.player.hasPistol = true;
      this.player.weapon = 'pistol';
      this.camYaw = Math.PI * 0.9;
      this.camDistTarget = 8;
      this.setWanted(1);
      this.missions.index = 4;
      this.missions.startStory();
      startPlaying();
    } else if (this.shotMode === 'sunset') {
      const car = spawn(-195, 30, Math.PI, CAR_DEFS[1]);
      this.player.enterCar(car);
      car.speed = 18;
      this.camYaw = Math.PI;
      this.camDistTarget = 12;
      this.vehicles.spawnTraffic(5, -195, 0);
      this.missions.index = 5;
      this.missions.startStory();
      startPlaying();
    }
    // Flag for the screenshot driver once the scene has settled.
    setTimeout(() => { this.shotReady = true; window.__shotReady = true; }, 3500);
  }

  // ---------------- camera ----------------
  updateCamera(dt) {
    const p = this.player;
    const focus = p.inCar
      ? { x: p.inCar.x, z: p.inCar.z, heading: p.inCar.heading, h: 2.2 }
      : { x: p.x, z: p.z, heading: p.heading, h: 1.9 };
    const moving = p.inCar ? Math.abs(p.inCar.speed) > 1 : p.speed > 0.5;
    if (moving) {
      this.camYaw = angleLerp(this.camYaw, focus.heading, 1 - Math.exp(-1.4 * dt));
    }
    this.camYawOffset = damp(this.camYawOffset, 0, 0.9, dt);
    this.camDist = damp(this.camDist, this.camDistTarget, 4, dt);
    const yaw = this.camYaw + this.camYawOffset;
    const dist = this.camDist + (p.inCar ? Math.abs(p.inCar.speed) * 0.12 : 0);
    const tx = focus.x - Math.sin(yaw) * dist;
    const tz = focus.z - Math.cos(yaw) * dist;
    const ty = focus.h + dist * 0.42;
    const target = new THREE.Vector3(focus.x, focus.h, focus.z);
    const desired = new THREE.Vector3(tx, ty, tz);
    // Keep the camera out of buildings: lift it if blocked (cheap raycast substitute).
    const hit = this.city.collide(desired.x, desired.z, 1);
    if (hit.hit) { desired.y = Math.max(desired.y, 14); }
    this.camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(target);
  }

  // ---------------- main loop ----------------
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.now += dt;
    this.gameMinutes = (this.gameMinutes + dt * 0.35) % (24 * 60);
    const playing = this.mode === 'playing';
    if (playing) {
      const input = this.inputState();
      const p = this.player;
      if (p.inCar) {
        this.vehicles.drive(p.inCar, input, dt);
        this.sound.engineSet(Math.abs(p.inCar.speed) / p.inCar.def.topSpeed, true);
      } else {
        p.updateOnFoot(input, this.camYaw + this.camYawOffset, dt, this.now);
        this.sound.engineSet(0, false);
      }
      this.vehicles.updateTraffic(dt, p.inCar ? p.inCar.x : p.x, p.inCar ? p.inCar.z : p.z);
      const pp = this.playerPos();
      this.vehicles.updatePolice(dt, pp.x, pp.z, p.inCar ? p.inCar.speed : 0);
      this.peds.update(dt, pp.x, pp.z, !!p.inCar);
      this.missions.update(dt);
      this.missions.updateFare(dt);
      this.updateWanted(dt);
      this.collideCars(dt);
      this.collidePoliceOnFoot(dt);
      this.vehicles.updateWrecks(dt);
      if (p.dead && this.mode === 'playing') this.gameOver('wasted');
      this.updateHud();
    }
    this.city.update(this.now);
    this.fx.update(dt);
    if (this.mode !== 'title') this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateHud() {
    const p = this.player;
    const nearCar = !p.inCar ? this.vehicles.nearestCar(p.x, p.z, 3.6, null) : null;
    let hint = '';
    if (this.missions.fare && !this.missions.fare.picked && p.inCar) {
      const c = this.missions.fare.customer;
      if (c && dist2d(p.inCar.x, p.inCar.z, c.x, c.z) < 8) hint = 'T — PICK UP FARE';
    }
    if (!hint && nearCar) hint = `E — ENTER ${nearCar.def.name.toUpperCase()}`;
    if (!hint && p.inCar) hint = 'SPACE — HANDBRAKE · H — HORN · E — EXIT CAR';
    if (!hint && p.weapon === 'pistol') hint = 'CLICK — FIRE · F — PUNCH';
    if (!hint && this.now < 20) hint = 'WASD — MOVE · E — ENTER CAR · ESC — PAUSE';
    const hh = Math.floor(this.gameMinutes / 60);
    const mm = Math.floor(this.gameMinutes % 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    const marker = this.missions.marker();
    this.hud.update({
      cash: this.cash,
      respect: this.respect,
      wanted: this.wanted,
      health: p.health,
      weapon: p.weapon === 'pistol' ? 'PISTOL' : 'FISTS',
      speedKmh: p.speedKmh,
      carName: p.inCar ? p.inCar.def.name.toUpperCase() : '',
      inCar: !!p.inCar,
      nearCar: nearCar ? nearCar.def.name.toUpperCase() : '',
      objective: this.missions.objectiveText(),
      hint,
      clock,
    });
    this.hud.drawMinimap({
      playerX: p.inCar ? p.inCar.x : p.x,
      playerZ: p.inCar ? p.inCar.z : p.z,
      playerHeading: p.inCar ? p.inCar.heading : p.heading,
      traffic: this.vehicles.traffic,
      police: this.vehicles.police,
      rivals: this.missions.rivals,
      fareCustomer: this.missions.fare && !this.missions.fare.picked ? this.missions.fare.customer : null,
      marker,
    });
  }
}

window.__game = new Game();
