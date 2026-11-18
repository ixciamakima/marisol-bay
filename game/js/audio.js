// Marisol Bay — synthesized sound: WebAudio only, no audio files.
// Music is a laid-back synthwave loop (chords + bass + hats); SFX are built
// from oscillators and filtered noise. Everything is guarded so the game
// plays fine even when audio is unavailable or suspended.
import { clamp } from './util.js';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoiseBuffer();
    } catch (e) { this.ctx = null; }
    return !!this.ctx;
  }

  resume() {
    if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  makeNoiseBuffer() {
    const len = this.ctx.sampleRate * 1;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!this.ensure() || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  noise(dur, vol, filterFreq, when = 0, type = 'lowpass') {
    if (!this.ensure() || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + when;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = type; f.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t0); src.stop(t0 + dur + 0.05);
    } catch (e) {}
  }

  // ---- SFX ----
  click() { this.tone(880, 0.07, 'square', 0.12); }
  horn() { this.tone(370, 0.28, 'sawtooth', 0.16); this.tone(466, 0.28, 'sawtooth', 0.12); }
  punch() { this.noise(0.12, 0.5, 300); this.tone(120, 0.1, 'sine', 0.4, 0, 60); }
  gunshot() { this.noise(0.16, 0.7, 2400, 0, 'highpass'); this.tone(160, 0.12, 'square', 0.3, 0, 50); }
  gunshotSmg() { this.noise(0.09, 0.5, 2600, 0, 'highpass'); this.tone(190, 0.07, 'square', 0.22, 0, 70); }
  gunshotShotgun() {
    this.noise(0.32, 0.95, 1500, 0, 'lowpass'); this.noise(0.2, 0.6, 3000, 0, 'highpass');
    this.tone(110, 0.22, 'square', 0.4, 0, 36);
  }
  crash() { this.noise(0.4, 0.6, 500); this.tone(90, 0.3, 'sine', 0.5, 0, 40); }
  explosion() {
    this.noise(0.9, 0.9, 300); this.tone(70, 0.8, 'sine', 0.7, 0, 28);
    this.noise(0.4, 0.5, 3000, 0, 'highpass');
  }
  pickup() { this.tone(660, 0.1, 'sine', 0.25); this.tone(990, 0.16, 'sine', 0.25, 0.09); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.28, i * 0.11));
  }
  wantedUp() { this.tone(220, 0.18, 'square', 0.2); this.tone(175, 0.3, 'square', 0.2, 0.14); }
  sirenStart() {
    if (!this.ensure() || this.sirenOsc) return;
    try {
      const o = this.ctx.createOscillator(); o.type = 'triangle';
      const g = this.ctx.createGain(); g.gain.value = 0.0;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.7;
      const lg = this.ctx.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(o.frequency);
      o.frequency.value = 800;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      g.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.5);
      this.sirenOsc = o; this.sirenGain = g; this.sirenLfo = lfo;
    } catch (e) {}
  }
  sirenStop() {
    if (!this.sirenOsc) return;
    try {
      this.sirenGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
      const o = this.sirenOsc, l = this.sirenLfo;
      setTimeout(() => { try { o.stop(); l.stop(); } catch (e) {} }, 400);
    } catch (e) {}
    this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
  }
  engineStart() {
    if (!this.ensure() || this.engineOsc) return;
    try {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = this.ctx.createGain(); g.gain.value = 0.0;
      o.connect(f); f.connect(g); g.connect(this.master);
      o.start();
      this.engineOsc = o; this.engineGain = g; this.engineFilter = f;
    } catch (e) {}
  }
  engineSet(speedNorm, on) {
    if (!this.engineOsc) return;
    try {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(52 + speedNorm * 130, t, 0.08);
      this.engineGain.gain.setTargetAtTime(on ? 0.05 + speedNorm * 0.05 : 0, t, 0.12);
      this.engineFilter.frequency.setTargetAtTime(380 + speedNorm * 900, t, 0.1);
    } catch (e) {}
  }
  engineStop() {
    if (!this.engineOsc) return;
    try { this.engineOsc.stop(); } catch (e) {}
    this.engineOsc = null; this.engineGain = null;
  }

  // ---- Radio: three synthesized stations, cycled with the R key ----
  // Each station is a chord table, a bass line, a tempo and a flavour.
  startRadio(stationIndex = 0) {
    if (!this.ensure()) return;
    this.station = stationIndex;
    if (this.musicTimer) return; // already playing; the step reads this.station
    this.musicStep = 0;
    const playStep = () => {
      const st = RADIO_STATIONS[this.station || 0];
      const stepDur = 60 / st.bpm / 2;
      if (!this.muted) {
        const s = this.musicStep;
        const bar = Math.floor(s / 8) % st.chords.length;
        const beat = s % 8;
        if (beat === 0) {
          st.chords[bar].forEach((f) => this.tone(f, stepDur * 7.5, st.wave, 0.05));
          if (!st.pulse) this.tone(st.bass[bar], stepDur * 7.5, 'sine', 0.13);
        }
        if (st.pulse) this.tone(st.bass[bar], stepDur * 0.9, 'sawtooth', 0.075);
        else if (beat === 4) this.tone(st.bass[bar] * 2, stepDur * 3, 'sine', 0.08);
        if (st.hats && beat % 2 === 0) this.noise(0.03, 0.045, 8000, 0, 'highpass');
        if (st.hats && (beat === 2 || beat === 6)) this.noise(0.09, 0.09, 1800, 0, 'bandpass');
        if (st.arp && s % 32 >= 16 && beat % 2 === 1) {
          const arpNote = st.chords[bar][(s >> 1) % st.chords[bar].length] * 2;
          this.tone(arpNote, stepDur * 1.6, 'sine', 0.04);
        }
      }
      this.musicStep++;
      // Re-arm with the current station's tempo so a station change also
      // changes the pace on the very next step.
      const next = RADIO_STATIONS[this.station || 0];
      this.musicTimer = setTimeout(playStep, (60 / next.bpm / 2) * 1000);
    };
    playStep();
    // musicTimer is set inside playStep; mark the radio as running.
    if (!this.musicTimer) this.musicTimer = -1;
  }
  nextStation() {
    this.station = ((this.station || 0) + 1) % RADIO_STATIONS.length;
    if (!this.musicTimer) this.startRadio(this.station);
    return RADIO_STATIONS[this.station].name;
  }
  stationName() { return RADIO_STATIONS[this.station || 0].name; }
  startMusic() { this.startRadio(0); }
  stopMusic() {
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
  }
}

const RADIO_STATIONS = [
  {
    name: 'SOLSTICE FM', bpm: 100, wave: 'triangle', arp: true, hats: true, pulse: false,
    chords: [
      [220.0, 261.6, 329.6, 392.0],
      [174.6, 220.0, 261.6, 329.6],
      [196.0, 246.9, 293.7, 329.6],
      [164.8, 196.0, 246.9, 293.7],
    ],
    bass: [55.0, 43.65, 49.0, 41.2],
  },
  {
    name: 'BAY BREEZE', bpm: 76, wave: 'sine', arp: false, hats: false, pulse: false,
    chords: [
      [261.6, 329.6, 392.0, 493.9],
      [220.0, 261.6, 329.6, 392.0],
      [174.6, 220.0, 261.6, 349.2],
      [196.0, 246.9, 293.7, 392.0],
    ],
    bass: [65.4, 55.0, 43.65, 49.0],
  },
  {
    name: 'NIGHT DRIVE FM', bpm: 112, wave: 'sawtooth', arp: true, hats: true, pulse: true,
    chords: [
      [220.0, 261.6, 329.6],
      [220.0, 261.6, 329.6],
      [174.6, 220.0, 261.6],
      [164.8, 196.0, 246.9],
    ],
    bass: [55.0, 55.0, 43.65, 41.2],
  },
];
