/* =====================================================================
   TTK Intro — script.js  (main orchestrator)
   ---------------------------------------------------------------------
   A cinematic night-sky intro:

     Sky      -> smooth fade into a dark starry sky with a big 3D moon
     Drop     -> the three glossy dark-metal letters drop in one at a time
                 at a steady pace and slam into the moon, each landing with
                 a boom, a squash-and-settle, a moon-dust plume and a small
                 camera shake
     Logo     -> TTK sits assembled on the moon with a metal shine sweep
     Outro    -> "Join TTK Today  /  .gg/ttk" fades in

   Rendering: a static-ish interpolated camera, a subtle additive bloom
   post-pass, a twinkling starfield and the moon-dust particle system, all
   from a single requestAnimationFrame loop targeting 60 FPS.
   ===================================================================== */

(function (TTK) {
  'use strict';

  const util = TTK.util;
  const TAU = Math.PI * 2;

  /* -------------------------------------------------------------------
     Timeline (seconds).
     ------------------------------------------------------------------- */
  const T = {
    fallDur: 1.25,                       // how long each letter falls (steady)
    dropStart: [1.9, 3.85, 5.8],         // when each letter begins to drop
    get dropLand() { return this.dropStart.map((d) => d + this.fallDur); },
    shine: 7.2,
    textIn: 7.9,
    replayAt: 11.5
  };

  function seg(time, delay, dur, ease) {
    const t = util.clamp((time - delay) / dur, 0, 1);
    return ease ? ease(t) : t;
  }

  class App {
    constructor() {
      this.canvas = document.getElementById('stage');
      this.ctx = this.canvas.getContext('2d');
      this.bg = document.getElementById('bg');

      this.bloom = document.createElement('canvas');
      this.bloomCtx = this.bloom.getContext('2d');

      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = 0; this.H = 0;

      // Subsystems
      this.audio = new TTK.AudioEngine();
      this.particles = new TTK.ParticleSystem(1200);
      this.logo = new TTK.Logo();
      this.moon = TTK.Moon;
      this.moon.load();               // start loading the moon photo now

      this.cam = { zoom: 1.05, x: 0, y: 0, tZoom: 1.0, tx: 0, ty: 0, shake: 0 };

      this.time = 0;
      this.started = false;
      this.finished = false;
      this.bloomStrength = 0.35;
      this._cues = {};
      this._last = 0;

      this.shocks = [];      // expanding collision shockwaves on the moon

      this.outroText = document.getElementById('outro-text');
      this.startOverlay = document.getElementById('start-overlay');
      this.replayBtn = document.getElementById('replay');
      this.muteBtn = document.getElementById('mute');

      this._splitText(this.outroText);
      this._bindEvents();
      this.resize();
      this.logo.resetHidden();
    }

    /* Split the outro caption into per-letter spans that rise + float in. */
    _splitText(el) {
      const lines = el.querySelectorAll('.join, .gg');
      lines.forEach((line) => {
        const text = line.textContent;
        line.textContent = '';
        let idx = 0;
        for (const ch of text) {
          const char = document.createElement('span');
          char.className = 'char';
          const glyph = document.createElement('span');
          glyph.className = 'glyph';
          if (ch === ' ') { char.classList.add('space'); glyph.innerHTML = '&nbsp;'; }
          else glyph.textContent = ch;
          glyph.style.setProperty('--dx', util.rand(-10, 10).toFixed(1) + 'px');
          glyph.style.setProperty('--dy', '24px');
          glyph.style.setProperty('--d', (idx * 0.03).toFixed(3) + 's');
          char.style.setProperty('--fy', (-(4 + (idx % 3) * 2)).toFixed(0) + 'px');
          char.style.setProperty('--fd', (idx * 0.13).toFixed(2) + 's');
          char.appendChild(glyph);
          line.appendChild(char);
          idx++;
        }
      });
    }

    _bindEvents() {
      window.addEventListener('resize', () => this.resize());
      document.getElementById('start-btn').addEventListener('click', () => this.start());
      this.replayBtn.addEventListener('click', () => this.restart());
      this.muteBtn.addEventListener('click', () => {
        this._muted = !this._muted;
        this.audio.setMuted(this._muted);
        this.muteBtn.textContent = this._muted ? '🔇' : '🔊';
        this.muteBtn.classList.toggle('muted', this._muted);
      });
    }

    resize() {
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.canvas.width = Math.floor(this.W * this.dpr);
      this.canvas.height = Math.floor(this.H * this.dpr);
      this.canvas.style.width = this.W + 'px';
      this.canvas.style.height = this.H + 'px';
      this.bloom.width = Math.max(2, Math.floor(this.canvas.width * 0.5));
      this.bloom.height = Math.max(2, Math.floor(this.canvas.height * 0.5));
      this.minDim = Math.min(this.W, this.H);
    }

    cue(id, at) {
      if (this._cues[id]) return false;
      if (this.time >= at) { this._cues[id] = true; return true; }
      return false;
    }

    start() {
      if (this.started) return;
      this.started = true;
      this.audio.init();
      this.audio.startMusic();
      this.startOverlay.classList.add('hidden');
      this.time = 0;
      this._cues = {};
      this.logo.resetHidden();
      this._last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    restart() {
      this.time = 0;
      this._cues = {};
      this.finished = false;
      this.particles.clear();
      this.shocks = [];
      this.logo.resetHidden();
      this.cam.zoom = 1.05; this.cam.x = 0; this.cam.y = 0;
      this.outroText.classList.remove('show');
      this.replayBtn.classList.remove('show');
      this.audio.startMusic();
      this._last = performance.now();
    }

    loop(now) {
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.05) dt = 0.05;
      this.time += dt;

      this.updateScene(dt);
      this.updateCamera(dt);
      this.particles.update(dt);
      this.render();

      requestAnimationFrame((t) => this.loop(t));
    }

    updateCamera(dt) {
      this.cam.zoom = util.expApproach(this.cam.zoom, this.cam.tZoom, 2.4, dt);
      this.cam.x = util.expApproach(this.cam.x, this.cam.tx, 4.0, dt);
      this.cam.y = util.expApproach(this.cam.y, this.cam.ty, 4.0, dt);
      this.cam.shake = util.expApproach(this.cam.shake, 0, 7, dt);
    }

    /* =================================================================
       Scene director
       ================================================================= */
    updateScene(dt) {
      const time = this.time;
      const md = this.minDim;

      // ---- geometry ----
      const h = md * 0.14;
      this.logoH = h;
      const surfaceScreenY = this.moon.surfaceY();
      this.logoCy = (surfaceScreenY - this.H / 2) - h * 0.45;   // base rests on surface
      this.sceneAlpha = seg(time, 0, 1.8, util.easeOutCubic);

      // Gentle camera settle (slow push-in) + drift toward the moon.
      this.cam.tZoom = util.lerp(1.05, 1.0, seg(time, 0, 6, util.easeOutCubic));

      // ---- letter drops ----
      const oy0 = -(this.H * 0.5 + h + 40) - this.logoCy;   // start above the screen
      for (let i = 0; i < 3; i++) {
        const s = this.logo.state[i];
        const ds = T.dropStart[i], land = ds + T.fallDur;
        if (time < ds) { s.alpha = 0; s.oy = oy0; continue; }

        const p = seg(time, ds, T.fallDur, util.easeInCubic);   // accelerating fall
        s.oy = util.lerp(oy0, 0, p);
        s.alpha = util.clamp((time - ds) / 0.25, 0, 1);

        if (time < land) {
          // stretch slightly while accelerating downward
          const st = util.clamp((p - 0.2) / 0.8, 0, 1);
          s.scaleX = 1 - 0.05 * st;
          s.scaleY = 1 + 0.10 * st;
        } else {
          // squash + elastic recover on impact
          const sp = util.clamp((time - land) / 0.5, 0, 1);
          const b = Math.exp(-7 * sp) * Math.cos(sp * 16);
          s.scaleX = 1 + 0.24 * b;
          s.scaleY = 1 - 0.28 * b;
        }

        // ---- landing impact (once) ----
        if (this.cue('drop' + i, ds)) this.audio.dropWhoosh(T.fallDur);
        if (this.cue('land' + i, land)) {
          const lx = this.logo.letters[i].baseX * h;
          const ly = this.logoCy + h * 0.45;      // base of the letter = surface
          this.particles.moonDust(lx, ly, 1.4);
          this.shocks.push({ x: lx, y: ly, t: 0 });   // collision power expands
          this.audio.boom(1.1);
          this.audio.sparkle();
          this.cam.shake = 1.0;
        }
      }

      // ---- shine + outro text ----
      if (this.cue('shine', T.shine)) this.audio.shimmer(1.8);
      if (this.cue('text', T.textIn)) { this.audio.chime(); this.audio.sparkle(); }
      if (time >= T.textIn) this.outroText.classList.add('show');

      // metal shine sweep flag (used in render)
      this.shineP = seg(time, T.shine, 0.9, util.easeInOutCubic);

      this.bloomStrength = util.lerp(0.12, 0.2, this.sceneAlpha);

      // Music intensity: quiet + moody, small lift once the logo is up.
      let mi = 0.28;
      if (time > T.dropStart[0]) mi = 0.34;
      if (time > T.textIn) mi = 0.42;
      this.audio.setMusicIntensity(mi);

      // Advance / retire collision shockwaves.
      for (let i = this.shocks.length - 1; i >= 0; i--) {
        this.shocks[i].t += dt;
        if (this.shocks[i].t > 1.0) this.shocks.splice(i, 1);
      }

      if (this.cue('replay', T.replayAt)) { this.finished = true; this.replayBtn.classList.add('show'); }
    }

    /* =================================================================
       Rendering
       ================================================================= */
    render() {
      const ctx = this.ctx;
      const cw = this.canvas.width, chh = this.canvas.height;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, chh);

      const shakeX = (Math.random() - 0.5) * this.cam.shake * 7;
      const shakeY = (Math.random() - 0.5) * this.cam.shake * 7;

      // --- backdrop: the lunar-surface photo (screen space, gentle shake) ---
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.save();
      ctx.translate(shakeX, shakeY);
      ctx.globalAlpha = util.clamp(this.sceneAlpha, 0, 1);
      this.moon.draw(ctx, this.W, this.H);
      ctx.globalAlpha = 1;
      ctx.restore();

      // --- world (camera space): shockwaves, letters, dust ---
      ctx.save();
      ctx.translate(this.W / 2 + shakeX, this.H / 2 + shakeY);
      ctx.scale(this.cam.zoom, this.cam.zoom);
      ctx.translate(-this.cam.x, -this.cam.y);

      this._drawShocks(ctx);

      if (this.logoH) {
        this.logo.draw(ctx, { cx: 0, cy: this.logoCy, height: this.logoH, alpha: this.sceneAlpha });
        this._drawShine(ctx);
      }

      this.particles.render(ctx);

      ctx.restore();

      this._bloomPass();
    }

    /* Expanding collision shockwaves — flattened rings that ripple out
       across the moon surface from each impact point. */
    _drawShocks(ctx) {
      if (!this.shocks.length) return;
      const h = this.logoH;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of this.shocks) {
        const a = util.clamp(s.t / 0.95, 0, 1);
        if (a >= 1) continue;
        const fade = 1 - a;
        const r = util.lerp(h * 0.2, h * 3.4, util.easeOutCubic(a));
        // outer ring
        ctx.lineWidth = h * 0.07 * fade + 1;
        ctx.strokeStyle = 'rgba(224,228,238,' + (0.55 * fade) + ')';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, r, r * 0.34, 0, 0, TAU);
        ctx.stroke();
        // inner ring
        const r2 = r * 0.58;
        ctx.lineWidth = h * 0.05 * fade + 1;
        ctx.strokeStyle = 'rgba(200,208,224,' + (0.4 * fade) + ')';
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, r2, r2 * 0.34, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* A bright metal shine that sweeps across the finished logo once. */
    _drawShine(ctx) {
      if (this.shineP <= 0 || this.shineP >= 1) return;
      const h = this.logoH;
      const x0 = -h * 2.4, x1 = h * 2.4;
      const x = util.lerp(x0, x1, this.shineP);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x - h * 0.5, 0, x + h * 0.5, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - h * 0.5, this.logoCy - h * 0.7, h, h * 1.4);
      ctx.restore();
    }

    _bloomPass() {
      if (this.bloomStrength <= 0.01) return;
      const bctx = this.bloomCtx;
      const bw = this.bloom.width, bh = this.bloom.height;
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, bw, bh);
      bctx.filter = 'blur(6px)';
      bctx.drawImage(this.canvas, 0, 0, bw, bh);
      bctx.filter = 'none';

      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = util.clamp(this.bloomStrength * 0.6, 0, 1);
      ctx.drawImage(this.bloom, 0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  window.addEventListener('DOMContentLoaded', () => { TTK.app = new App(); });

})(window.TTK);
