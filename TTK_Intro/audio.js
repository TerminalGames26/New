/* =====================================================================
   TTK Intro — audio.js
   ---------------------------------------------------------------------
   Fully procedural sound design + background music using the Web Audio
   API. No audio files are required — every sound and every note is
   synthesised at runtime.

   Two layers:
     1. SFX  — whoosh, sparkle, chime, pop, glitter, sweep, explosion,
               shimmer. All richer now and routed through a procedural
               reverb for a polished, spacious feel.
     2. MUSIC — a looping dreamy chord progression (pad + sub bass +
               sparkling arpeggio + soft bell accents + a gentle pulse)
               whose intensity is driven by the timeline, so it swells
               into the spiral / explosion and resolves in the outro.

   The context is created lazily and resumed on the first user gesture to
   satisfy browser autoplay policies.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const util = TTK.util;

  /* Upbeat chiptune progression (I–V–vi–IV in C = C G Am F).
     Each entry is one bar: a bass root and a chord voicing. */
  const PROG = [
    { bass: 65.41, notes: [261.63, 329.63, 392.00] }, // C  : C4 E4 G4
    { bass: 98.00, notes: [246.94, 293.66, 392.00] }, // G  : B3 D4 G4
    { bass: 110.00, notes: [220.00, 261.63, 329.63] }, // Am : A3 C4 E4
    { bass: 87.31, notes: [220.00, 261.63, 349.23] }  // F  : A3 C4 F4
  ];
  const ARP_SEQ = [0, 1, 2, 1, 2, 1, 0, 2]; // which chord tone per 8th note

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this._noiseBuffer = null;

      // music state
      this._musicOn = false;
      this._intensity = 0.3;
      this._scheduler = null;
      this._nextNoteTime = 0;
      this._pos = 0;
      this.bpm = 112;             // brisk chiptune tempo
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

        // Music sub-mix (sits under the SFX).
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.0;      // faded in when music starts
        this.musicGain.connect(this.master);

        this._buildNoise();
        this._buildReverb();
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

    /* Procedural reverb: a decaying-noise impulse response feeding a wet
       bus. Melodic sounds send into it for depth / polish. */
    _buildReverb() {
      const ctx = this.ctx;
      const dur = 2.2;
      const len = (ctx.sampleRate * dur) | 0;
      const imp = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = imp.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
        }
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = imp;
      this.reverbIn = ctx.createGain();
      this.reverbIn.gain.value = 1.0;
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      this.reverbIn.connect(this.reverb);
      this.reverb.connect(wet);
      wet.connect(this.master);
    }

    /* Route a node to the reverb bus (in addition to its dry connection). */
    _reverb(node, amount) {
      if (!this.reverbIn) return;
      const g = this.ctx.createGain();
      g.gain.value = amount == null ? 1 : amount;
      node.connect(g);
      g.connect(this.reverbIn);
    }

    /* An oscillator with a gain envelope; optionally sent to reverb. */
    _tone(type, freq, t0, dur, peak, dest, wet) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(dest || this.master);
      if (wet) this._reverb(g, wet);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      return { osc: osc, gain: g };
    }

    /* A soft bell (inharmonic partials) — used for chimes + accents. */
    _bell(freq, t0, dur, peak, dest) {
      const partials = [1, 2.01, 3.01, 4.7];
      const gains = [1, 0.5, 0.28, 0.14];
      partials.forEach((m, i) => {
        const o = this._tone('sine', freq * m, t0, dur * (1 - i * 0.15), peak * gains[i], dest, 0.5);
        return o;
      });
    }

    /* ---------------- Individual SFX ---------------- */

    whoosh(dur) {
      if (!this._ready()) return;
      dur = dur || 0.9;
      const t = this.now();
      const src = this._noise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.6);
      bp.frequency.exponentialRampToValueAtTime(400, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      this._reverb(g, 0.35);
      src.start(t); src.stop(t + dur + 0.05);
    }

    sparkle() {
      if (!this._ready()) return;
      const t = this.now();
      const base = util.rand(1700, 2500);
      for (let i = 0; i < 3; i++) {
        const o = this._tone('sine', base * (1 + i * 0.5), t + i * 0.03, 0.3, 0.12, null, 0.6);
        o.osc.frequency.exponentialRampToValueAtTime(base * (1 + i * 0.5) * 1.7, t + i * 0.03 + 0.22);
      }
    }

    chime() {
      if (!this._ready()) return;
      const t = this.now();
      // gentle bell arpeggio (major triad + octave)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => this._bell(f, t + i * 0.07, 1.7, 0.13));
    }

    pop() {
      if (!this._ready()) return;
      const t = this.now();
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(760, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g); g.connect(this.master);
      this._reverb(g, 0.3);
      osc.start(t); osc.stop(t + 0.3);
      this._tone('triangle', 1500, t + 0.02, 0.2, 0.08, null, 0.5);
    }

    glitter() {
      if (!this._ready()) return;
      const t = this.now();
      for (let i = 0; i < 12; i++) {
        const ft = t + Math.random() * 0.5;
        const f = util.rand(1900, 4400);
        this._tone('sine', f, ft, util.rand(0.08, 0.2), 0.05, null, 0.6);
      }
    }

    sweep(dur) {
      if (!this._ready()) return;
      dur = dur || 3.0;
      const t = this.now();
      // ascending saw + noise riser building tension into the explosion
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(1700, t + dur);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(400, t);
      lp.frequency.exponentialRampToValueAtTime(6500, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.13, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.26, t + dur);
      osc.connect(lp); lp.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + dur + 0.1);

      const src = this._noise();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(500, t);
      hp.frequency.exponentialRampToValueAtTime(9000, t + dur);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(0.18, t + dur);
      src.connect(hp); hp.connect(ng); ng.connect(this.master);
      src.start(t); src.stop(t + dur + 0.1);

      // subtle timpani-like heartbeat as tension peaks
      for (let i = 0; i < 3; i++) {
        const bt = t + dur * (0.55 + i * 0.15);
        this._tone('sine', 70, bt, 0.25, 0.25, null, 0.2)
          .osc.frequency.exponentialRampToValueAtTime(45, bt + 0.2);
      }
    }

    /* Redesigned magical explosion — a bright shimmering burst rather than
       a plain boom: sub impact + glassy shatter + a swelling add9 bell
       bloom + a cascade of descending glitter, all with a reverb tail. */
    explosion() {
      if (!this._ready()) return;
      const t = this.now();

      // 1. Deep, short sub impact
      const sub = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(110, t);
      sub.frequency.exponentialRampToValueAtTime(32, t + 0.5);
      sg.gain.setValueAtTime(0.55, t);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      sub.connect(sg); sg.connect(this.master);
      sub.start(t); sub.stop(t + 0.7);

      // 2. Glassy shatter: bright noise burst sweeping upward then away
      const src = this._noise();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(1200, t);
      hp.frequency.exponentialRampToValueAtTime(9000, t + 0.35);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.35, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      src.connect(hp); hp.connect(ng); ng.connect(this.master);
      this._reverb(ng, 0.5);
      src.start(t); src.stop(t + 0.6);

      // 3. Swelling magical bell bloom (C add9: C E G D) — resolves bright
      const bloom = [523.25, 659.25, 783.99, 587.33, 1046.5];
      bloom.forEach((f, i) => {
        const g = this.ctx.createGain();
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.12, t + 0.08 + i * 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        o.connect(g); g.connect(this.master);
        this._reverb(g, 0.7);
        o.start(t); o.stop(t + 1.9);
      });

      // 4. Cascade of descending glitter pings
      for (let i = 0; i < 16; i++) {
        const ft = t + 0.05 + i * 0.03;
        const f = 3600 * Math.pow(0.94, i) + util.rand(-100, 100);
        this._tone('sine', f, ft, 0.22, 0.05, null, 0.7);
      }
    }

    /* Falling whoosh as a letter drops toward the moon. */
    dropWhoosh(dur) {
      if (!this._ready()) return;
      dur = dur || 1.1;
      const t = this.now();
      const src = this._noise();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(1500, t);
      bp.frequency.exponentialRampToValueAtTime(280, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.24, t + dur * 0.75);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      this._reverb(g, 0.25);
      src.start(t); src.stop(t + dur + 0.05);
      const o = this._tone('sawtooth', 380, t, dur, 0.05, null, 0.2);
      o.osc.frequency.exponentialRampToValueAtTime(80, t + dur);
    }

    /* Heavy landing boom + dusty impact when a letter hits the moon. */
    boom(power) {
      if (!this._ready()) return;
      power = power || 1;
      const t = this.now();
      // deep sub thud
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150 * (0.85 + 0.25 * power), t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
      g.gain.setValueAtTime(0.6 * power, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.8);
      // low body noise
      const src = this._noise();
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(900, t);
      lp.frequency.exponentialRampToValueAtTime(120, t + 0.4);
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.5 * power, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      src.connect(lp); lp.connect(ng); ng.connect(this.master);
      this._reverb(ng, 0.4);
      src.start(t); src.stop(t + 0.5);
      // dusty high tail
      const src2 = this._noise();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2800;
      const ng2 = this.ctx.createGain();
      ng2.gain.setValueAtTime(0.14 * power, t + 0.02);
      ng2.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      src2.connect(hp); hp.connect(ng2); ng2.connect(this.master);
      this._reverb(ng2, 0.5);
      src2.start(t); src2.stop(t + 0.6);
    }

    shimmer(dur) {
      if (!this._ready()) return;
      dur = dur || 2.4;
      const t = this.now();
      const notes = [1046.5, 1318.5, 1567.98, 2093];
      notes.forEach((f, i) => {
        const o = this._tone('sine', f, t + i * 0.08, dur - i * 0.08, 0.09, null, 0.7);
        o.osc.frequency.setValueAtTime(f, t + i * 0.08);
        o.osc.frequency.exponentialRampToValueAtTime(f * 0.75, t + dur);
      });
    }

    /* ================= BACKGROUND MUSIC ================= */

    startMusic() {
      if (!this._ready() || this._musicOn) return;
      this._musicOn = true;
      this.musicGain.gain.setValueAtTime(0.0001, this.now());
      this.musicGain.gain.linearRampToValueAtTime(0.55, this.now() + 3);
      this._pos = 0;
      this._nextNoteTime = this.now() + 0.15;
      this._scheduler = setInterval(() => this._schedule(), 25);
    }

    stopMusic(fade) {
      if (!this._musicOn) return;
      this.musicGain.gain.setTargetAtTime(0, this.now(), (fade || 1.5) / 3);
      setTimeout(() => {
        if (this._scheduler) { clearInterval(this._scheduler); this._scheduler = null; }
        this._musicOn = false;
      }, (fade || 1.5) * 1000 + 200);
    }

    setMusicIntensity(x) { this._intensity = util.clamp(x, 0, 1); }

    /* Lookahead scheduler: queues 8th notes ~0.2s ahead of the clock. */
    _schedule() {
      if (!this.ctx) return;
      const eighth = (60 / this.bpm) / 2;
      while (this._nextNoteTime < this.now() + 0.2) {
        this._scheduleStep(this._pos, this._nextNoteTime);
        this._nextNoteTime += eighth;
        this._pos++;
      }
    }

    _scheduleStep(pos, t) {
      const bar = Math.floor(pos / 8);
      const step = pos % 8;
      const chord = PROG[bar % PROG.length];
      const inten = this._intensity;
      const beat = (60 / this.bpm);

      // sustained square "chip" chord at the top of each bar
      if (step === 0) this._playPad(chord, t, beat * 4 * 0.96, inten);
      // triangle bass on beats 1 and 3 (NES-style)
      if (step === 0 || step === 4) this._playBass(chord.bass, t, beat * 1.7);

      // square-wave lead arpeggio (grows with intensity)
      const f = chord.notes[ARP_SEQ[step]] * 2;   // an octave up
      this._playArp(f, t, 0.03 + 0.06 * inten);

      // 8-bit percussion: kick on the beat, noise hat on the offbeats
      if (step % 4 === 0 && inten > 0.34) this._playKick(t, 0.6 + 0.4 * inten);
      if (step % 2 === 1 && inten > 0.4) this._playHat(t, 0.5 * inten);
    }

    _playPad(chord, t, dur, inten) {
      // quiet sustained square chord (root + fifth) — the chip harmony bed
      const voices = [chord.notes[0], chord.notes[2]];
      voices.forEach((f) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.value = f;
        const v = 0.02 + 0.012 * inten;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(v, t + 0.02);
        g.gain.setValueAtTime(v, t + dur * 0.85);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.musicGain);
        this._reverb(g, 0.1);
        o.start(t); o.stop(t + dur + 0.05);
      });
    }

    _playBass(freq, t, dur) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.05);
    }

    _playArp(freq, t, peak) {
      if (peak < 0.005) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.006);
      g.gain.setValueAtTime(peak * 0.6, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); g.connect(this.musicGain);
      this._reverb(g, 0.12);
      o.start(t); o.stop(t + 0.2);
    }

    _playKick(t, amount) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.1);
      g.gain.setValueAtTime(0.16 * amount, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + 0.2);
    }

    _playHat(t, vol) {
      const src = this._noise();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 6500;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.06 * vol, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      src.connect(hp); hp.connect(g); g.connect(this.musicGain);
      src.start(t); src.stop(t + 0.06);
    }

    _ready() { return this.enabled && this.ctx && this._noiseBuffer; }
  }

  TTK.AudioEngine = AudioEngine;

})(window.TTK);
