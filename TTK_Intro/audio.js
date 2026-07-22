/* =====================================================================
   TTK Intro — audio.js
   ---------------------------------------------------------------------
   Fully procedural sound design using the Web Audio API. No audio files
   are required — every sound is synthesised on the fly from oscillators,
   filtered noise and gain envelopes.

   Sounds:
     whoosh()      soft filtered-noise swell (letters sliding in)
     sparkle()     quick high shimmer ping
     chime()       gentle bell / magic chime (major triad)
     pop()         soft rounded blip (icon appears)
     glitter()     cluster of tiny random high pings
     sweep()       ascending pitch sweep (spiral build-up)
     explosion()   layered magical boom + shimmer tail
     shimmer()     long soft descending shimmer (final hold)
     pad()         quiet evolving ambient pad bed (loops under everything)

   The context is created lazily and resumed on the first user gesture so
   it satisfies browser autoplay policies.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const util = TTK.util;

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this._noiseBuffer = null;
      this._padOn = false;
    }

    /* Create / resume the context (call from a user gesture). */
    init() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.enabled = false; return; }
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this._buildNoise();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    setMuted(m) {
      if (!this.master) return;
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.now(), 0.05);
    }

    now() { return this.ctx ? this.ctx.currentTime : 0; }

    _buildNoise() {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
    }

    _noise() {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer;
      src.loop = true;
      return src;
    }

    /* Small helper: an oscillator with a gain envelope routed to master. */
    _tone(type, freq, t0, dur, peak, dest) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(dest || this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      return { osc: osc, gain: g };
    }

    /* ---------------- Individual sounds ---------------- */

    whoosh(dur) {
      if (!this._ready()) return;
      dur = dur || 0.9;
      const t = this.now();
      const src = this._noise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(2200, t + dur * 0.6);
      bp.frequency.exponentialRampToValueAtTime(400, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.35, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.05);
    }

    sparkle() {
      if (!this._ready()) return;
      const t = this.now();
      const base = util.rand(1600, 2400);
      for (let i = 0; i < 3; i++) {
        const o = this._tone('sine', base * (1 + i * 0.5), t + i * 0.03, 0.25, 0.12);
        o.osc.frequency.exponentialRampToValueAtTime(base * (1 + i * 0.5) * 1.6, t + i * 0.03 + 0.2);
      }
    }

    chime() {
      if (!this._ready()) return;
      const t = this.now();
      // gentle bell — major triad with soft attack
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        const o = this._tone('sine', f, t + i * 0.06, 1.6, 0.16);
        // add a shimmering fifth harmonic quietly
        this._tone('sine', f * 2.01, t + i * 0.06, 1.0, 0.04);
      });
    }

    pop() {
      if (!this._ready()) return;
      const t = this.now();
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(720, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 0.3);
      // little high sparkle on top
      this._tone('triangle', 1400, t + 0.02, 0.18, 0.08);
    }

    glitter() {
      if (!this._ready()) return;
      const t = this.now();
      const n = 10;
      for (let i = 0; i < n; i++) {
        const ft = t + Math.random() * 0.5;
        const f = util.rand(1800, 4200);
        this._tone('sine', f, ft, util.rand(0.08, 0.2), 0.05);
      }
    }

    sweep(dur) {
      if (!this._ready()) return;
      dur = dur || 3.0;
      const t = this.now();
      // ascending saw + noise riser building tension
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(1600, t + dur);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, t);
      lp.frequency.exponentialRampToValueAtTime(6000, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.28, t + dur);
      osc.connect(lp); lp.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.1);

      // noise riser
      const src = this._noise();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(500, t);
      hp.frequency.exponentialRampToValueAtTime(8000, t + dur);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(0.18, t + dur);
      src.connect(hp); hp.connect(ng); ng.connect(this.master);
      src.start(t); src.stop(t + dur + 0.1);
    }

    explosion() {
      if (!this._ready()) return;
      const t = this.now();
      // low boom
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.6);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 0.9);

      // bright noise burst
      const src = this._noise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1200, t);
      bp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
      bp.Q.value = 0.6;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.4, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      src.connect(bp); bp.connect(ng); ng.connect(this.master);
      src.start(t); src.stop(t + 0.8);

      // magical rising shimmer tail (arpeggio up)
      const notes = [659.25, 783.99, 987.77, 1318.5, 1567.98];
      notes.forEach((f, i) => this._tone('sine', f, t + 0.05 + i * 0.05, 0.9, 0.1));
      this.glitter();
    }

    shimmer(dur) {
      if (!this._ready()) return;
      dur = dur || 2.4;
      const t = this.now();
      const notes = [1046.5, 1318.5, 1567.98, 2093];
      notes.forEach((f, i) => {
        const o = this._tone('sine', f, t + i * 0.08, dur - i * 0.08, 0.09);
        o.osc.frequency.setValueAtTime(f, t + i * 0.08);
        o.osc.frequency.exponentialRampToValueAtTime(f * 0.75, t + dur);
      });
    }

    /* Quiet evolving ambient pad that loops under the whole intro. */
    startPad() {
      if (!this._ready() || this._padOn) return;
      this._padOn = true;
      const t = this.now();
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 3);
      g.connect(this.master);
      this._padGain = g;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.connect(g);

      // soft detuned triad
      const freqs = [130.81, 196.0, 261.63];
      this._padOscs = [];
      freqs.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const og = this.ctx.createGain();
        og.gain.value = 0.5;
        // slow vibrato via a low-frequency oscillator
        const lfo = this.ctx.createOscillator();
        const lfoG = this.ctx.createGain();
        lfo.frequency.value = 0.08 + i * 0.03;
        lfoG.gain.value = 1.5;
        lfo.connect(lfoG); lfoG.connect(o.frequency);
        o.connect(og); og.connect(lp);
        o.start(t); lfo.start(t);
        this._padOscs.push(o, lfo);
      });
    }

    stopPad(fade) {
      if (!this._padOn || !this._padGain) return;
      const t = this.now();
      this._padGain.gain.setTargetAtTime(0, t, (fade || 1.5) / 3);
    }

    _ready() { return this.enabled && this.ctx && this._noiseBuffer; }
  }

  TTK.AudioEngine = AudioEngine;

})(window.TTK);
