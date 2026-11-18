// audio.js — JOB: Procedural WebAudio cues (shots, engine, sirens, clicks) with a mute toggle.
// EXPORTS: Audio2
// USES: nothing

export class Audio2 {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
    this.siren = null;
  }
  unlock() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }
  noise(dur, freq, gain, type = 'square') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.35), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  shot() { this.noise(0.11, 380, 0.35, 'square'); this.noise(0.06, 1400, 0.12, 'sawtooth'); }
  hit() { this.noise(0.07, 220, 0.22, 'triangle'); }
  pickup() { this.noise(0.18, 660, 0.18, 'sine'); setTimeout(() => this.noise(0.18, 990, 0.15, 'sine'), 70); }
  sirenOn() {
    if (!this.ctx || this.siren) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 620;
    lfo.frequency.value = 1.5; lg.gain.value = 220;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0.0;
    o.connect(g); g.connect(this.master); o.start(); lfo.start();
    this.siren = { o, g, lfo };
  }
  sirenLevel(v) {
    if (!this.siren) return;
    this.siren.g.gain.setTargetAtTime(this.muted ? 0 : Math.max(0, Math.min(0.09, v)), this.ctx.currentTime, 0.15);
  }
  sirenOff() {
    if (!this.siren) return;
    try { this.siren.o.stop(); this.siren.lfo.stop(); } catch (e) { /* already stopped */ }
    this.siren = null;
  }
  engineOn() {
    if (!this.ctx || this.engine) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = 60; g.gain.value = 0;
    o.connect(g); g.connect(this.master); o.start();
    this.engine = { o, g };
  }
  engineLevel(speed01) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.o.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
    this.engine.g.gain.setTargetAtTime(this.muted ? 0 : 0.025 + speed01 * 0.05, t, 0.1);
  }
  engineOff() {
    if (!this.engine) return;
    try { this.engine.o.stop(); } catch (e) { /* already stopped */ }
    this.engine = null;
  }
}
