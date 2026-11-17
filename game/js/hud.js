// Marisol Bay — HUD: DOM readouts and the circular minimap canvas.
import { ROADS, CITY_HALF, BEACH_X, WATER_X } from './city.js';
import { money, clamp } from './util.js';

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      cash: document.getElementById('cash-value'),
      respect: document.getElementById('respect-value'),
      clock: document.getElementById('clock'),
      wanted: document.getElementById('wanted'),
      objective: document.getElementById('objective-text'),
      toast: document.getElementById('toast'),
      healthBar: document.getElementById('health-bar'),
      healthText: document.getElementById('health-text'),
      weapon: document.getElementById('weapon'),
      speed: document.getElementById('speed-value'),
      speedUnit: document.getElementById('speed-unit'),
      carName: document.getElementById('car-name'),
      hint: document.getElementById('hint'),
      damage: document.getElementById('damage'),
      center: document.getElementById('center-msg'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.centerTimer = null;
    this.lastCash = -1;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  toast(title, sub) {
    this.el.toast.innerHTML = sub ? `${title}<br><span style="font-size:15px;color:#e8ecff">${sub}</span>` : title;
    this.el.toast.style.opacity = 1;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.opacity = 0; }, 4200);
  }

  centerMsg(text, ms = 1800) {
    this.el.center.textContent = text;
    clearTimeout(this.centerTimer);
    this.centerTimer = setTimeout(() => { this.el.center.textContent = ''; }, ms);
  }

  setDamageFlash(amount) {
    this.el.damage.style.opacity = clamp(amount, 0, 0.85);
    setTimeout(() => { this.el.damage.style.opacity = 0; }, 180);
  }

  update(s) {
    if (s.cash !== this.lastCash) {
      this.el.cash.textContent = money(s.cash);
      this.lastCash = s.cash;
    }
    this.el.respect.textContent = s.respect;
    this.el.clock.textContent = s.clock;
    const stars = this.el.wanted.querySelectorAll('.star');
    stars.forEach((st, i) => st.classList.toggle('on', i < s.wanted));
    this.el.wanted.classList.toggle('hot', s.wanted >= 3);
    this.el.objective.textContent = s.objective || '';
    this.el.healthBar.style.width = `${clamp(s.health, 0, 100)}%`;
    this.el.healthBar.classList.toggle('low', s.health < 35);
    this.el.healthText.textContent = Math.ceil(s.health);
    this.el.weapon.textContent = s.inCar ? `${s.carName || 'CAR'} — ${s.weapon}` : s.weapon;
    this.el.speed.textContent = Math.round(s.speedKmh);
    this.el.speedUnit.textContent = s.inCar ? 'km/h' : '';
    this.el.carName.textContent = s.inCar ? (s.carName || '') : (s.nearCar ? `E — STEAL ${s.nearCar}` : '');
    this.el.hint.textContent = s.hint || '';
  }

  drawMinimap(world) {
    const ctx = this.mapCtx;
    const S = 220, half = CITY_HALF + 20;
    const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
    ctx.clearRect(0, 0, S, S);
    // Water + sand (west edge).
    const [wx] = toMap(WATER_X, 0);
    ctx.fillStyle = '#164e6b';
    ctx.fillRect(0, 0, wx, S);
    const [bx] = toMap(BEACH_X, 0);
    ctx.fillStyle = '#c9b078';
    ctx.fillRect(wx, 0, bx - wx, S);
    // Land.
    ctx.fillStyle = '#232838';
    ctx.fillRect(bx, 0, S - bx, S);
    // Docks water (south).
    const [, dz] = toMap(0, 228);
    ctx.fillStyle = '#164e6b';
    ctx.fillRect(0, dz, S, S - dz);
    // Park.
    const [px, pz] = toMap(-32, -32);
    ctx.fillStyle = '#2f6b2f';
    ctx.fillRect(px - 13, pz - 13, 26, 26);
    // Roads.
    ctx.strokeStyle = '#565d6e';
    ctx.lineWidth = 5;
    for (const r of ROADS) {
      const [x0, y0] = toMap(r, -half);
      const [x1, y1] = toMap(r, half);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const [hx0, hy0] = toMap(-half, r);
      const [hx1, hy1] = toMap(half, r);
      ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();
    }
    ctx.strokeStyle = '#8a90a5';
    ctx.lineWidth = 1;
    for (const r of ROADS) {
      const [x0, y0] = toMap(r, -half);
      const [x1, y1] = toMap(r, half);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const [hx0, hy0] = toMap(-half, r);
      const [hx1, hy1] = toMap(half, r);
      ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();
    }
    const dot = (x, z, color, r = 2.5) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2); ctx.fill();
    };
    // Traffic (white), police (flashing red/blue), rivals (red).
    for (const c of world.traffic || []) if (!c.dead) dot(c.x, c.z, '#cfd6e4', 2);
    for (const c of world.police || []) if (!c.dead) dot(c.x, c.z, Math.floor(performance.now() / 200) % 2 ? '#ff4444' : '#4488ff', 3);
    for (const r of world.rivals || []) if (r.state !== 'down') dot(r.x, r.z, '#ff2222', 3);
    if (world.fareCustomer) dot(world.fareCustomer.x, world.fareCustomer.z, '#37d67a', 3);
    // Mission marker: pulsing yellow diamond.
    if (world.marker) {
      const [mx, my] = toMap(world.marker.x, world.marker.z);
      const pulse = 5 + Math.sin(performance.now() / 250) * 2;
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse); ctx.lineTo(mx + pulse, my);
      ctx.lineTo(mx, my + pulse); ctx.lineTo(mx - pulse, my);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Player arrow.
    const [px2, py2] = toMap(world.playerX, world.playerZ);
    ctx.save();
    ctx.translate(px2, py2);
    ctx.rotate(-world.playerHeading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
