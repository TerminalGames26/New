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
      this.floor = TTK.Floor;

      this.cam = { zoom: 1.05, x: 0, y: 0, tZoom: 1.0, tx: 0, ty: 0, shake: 0 };

      this.time = 0;
      this.started = false;
      this.finished = false;
      this.bloomStrength = 0.35;
      this._cues = {};
      this._last = 0;

      this.craters = [];     // persistent cracked craters on the floor
      this.pebbles = [];     // flying debris rocks

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
      this.craters = [];
      this.pebbles = [];
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
      const h = md * 0.2;                                       // bigger letters
      this.logoH = h;
      this.floorScreenY = this.H * 0.64;                        // glossy floor line
      this.logoCy = (this.floorScreenY - this.H / 2) - h * 0.45; // base rests on floor
      this.sceneAlpha = seg(time, 0, 1.5, util.easeOutCubic);

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
          const lxWorld = this.logo.letters[i].baseX * h;
          const lyWorld = this.logoCy + h * 0.45;             // base = floor (world)
          const lxScreen = this.W / 2 + lxWorld * this.cam.zoom;
          const lyScreen = this.floorScreenY;
          this.particles.moonDust(lxWorld, lyWorld, 1.2);     // soft dust cloud
          this._spawnCrater(lxScreen, lyScreen, h * this.cam.zoom);
          this._spawnPebbles(lxScreen, lyScreen, h * this.cam.zoom);
          this.audio.boom(1.2);
          this.cam.shake = 1.1;
        }
      }

      // ---- shine + outro text ----
      if (this.cue('shine', T.shine)) this.audio.shimmer(1.8);
      if (this.cue('text', T.textIn)) { this.audio.chime(); this.audio.sparkle(); }
      if (time >= T.textIn) this.outroText.classList.add('show');

      // metal shine sweep flag (used in render)
      this.shineP = seg(time, T.shine, 0.9, util.easeInOutCubic);

      this.bloomStrength = util.lerp(0.08, 0.14, this.sceneAlpha);

      // Music intensity: quiet + moody, small lift once the logo is up.
      let mi = 0.28;
      if (time > T.dropStart[0]) mi = 0.34;
      if (time > T.textIn) mi = 0.42;
      this.audio.setMusicIntensity(mi);

      // grow-in for craters
      for (const c of this.craters) if (c.t < 1) c.t = Math.min(1, c.t + dt / 0.4);
      // pebble physics (bounce on the floor, settle)
      this._updatePebbles(dt);

      if (this.cue('replay', T.replayAt)) { this.finished = true; this.replayBtn.classList.add('show'); }
    }

    /* Punch a cracked crater into the floor at (screen) x,y. */
    _spawnCrater(x, y, ref) {
      const r = ref * 0.62;
      const cracks = [];
      const n = 6 + (Math.random() * 4 | 0);
      for (let i = 0; i < n; i++) {
        let a = (i / n) * TAU + util.rand(-0.3, 0.3);
        const steps = util.randInt(3, 6);
        const len = r * util.rand(1.0, 2.0);
        const pts = [{ x: 0, y: 0 }];
        let px = 0, py = 0;
        for (let s = 0; s < steps; s++) {
          a += util.rand(-0.35, 0.35);
          const step = len / steps;
          px += Math.cos(a) * step;
          py += Math.sin(a) * step * 0.34;   // flatten (floor perspective)
          pts.push({ x: px, y: py });
        }
        cracks.push(pts);
      }
      this.craters.push({ x: x, y: y, r: r, cracks: cracks, t: 0 });
    }

    /* Throw a burst of chunky, irregular pebbles out of the impact. */
    _spawnPebbles(x, y, ref) {
      const n = 22 + (Math.random() * 8 | 0);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + util.rand(-1.2, 1.2);
        const sp = util.rand(140, 640);
        const big = Math.random() < 0.25;                 // a few larger chunks
        const size = ref * (big ? util.rand(0.05, 0.09) : util.rand(0.018, 0.045));
        // irregular rock outline (per-vertex radii)
        const vn = 5 + (Math.random() * 3 | 0);
        const verts = [];
        for (let k = 0; k < vn; k++) verts.push(0.7 + Math.random() * 0.5);
        this.pebbles.push({
          x: x + util.rand(-6, 6), y: y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - util.rand(60, 220),
          rot: util.rand(0, TAU), vr: util.rand(-14, 14),
          size: size, shade: util.rand(0.12, 0.34), verts: verts,
          floor: y, bounces: 0, life: util.rand(1.6, 3.0), rest: false
        });
      }
    }

    _updatePebbles(dt) {
      const G = 1500;
      for (let i = this.pebbles.length - 1; i >= 0; i--) {
        const p = this.pebbles[i];
        if (!p.rest) {
          p.vy += G * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y >= p.floor && p.vy > 0) {
            p.y = p.floor;
            p.bounces++;
            if (p.bounces > 2 || Math.abs(p.vy) < 60) { p.vy = 0; p.vx *= 0.4; p.vr *= 0.3; p.rest = true; }
            else { p.vy *= -0.42; p.vx *= 0.6; p.vr *= 0.5; }
          }
        }
        p.life -= dt;
        if (p.life <= 0) this.pebbles.splice(i, 1);
      }
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

      // --- glossy floor + crater marks (screen space, gentle shake) ---
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.save();
      ctx.translate(shakeX, shakeY);
      ctx.globalAlpha = util.clamp(this.sceneAlpha, 0, 1);
      this.floor.draw(ctx, this.W, this.H, this.floorScreenY);
      ctx.globalAlpha = 1;
      this._drawCraters(ctx);
      ctx.restore();

      // --- world (camera space): reflection, shockwaves, letters, dust ---
      ctx.save();
      ctx.translate(this.W / 2 + shakeX, this.H / 2 + shakeY);
      ctx.scale(this.cam.zoom, this.cam.zoom);
      ctx.translate(-this.cam.x, -this.cam.y);

      this._drawReflection(ctx);

      if (this.logoH) {
        this.logo.draw(ctx, { cx: 0, cy: this.logoCy, height: this.logoH, alpha: this.sceneAlpha });
        this._drawShine(ctx);
      }

      this.particles.render(ctx);
      ctx.restore();

      // --- pebbles / debris (screen space, over the floor + letters) ---
      ctx.save();
      ctx.translate(shakeX, shakeY);
      this._drawPebbles(ctx);
      ctx.restore();

      this._bloomPass();
    }

    /* Faded, mirrored reflection of the letters on the glossy floor. */
    _drawReflection(ctx) {
      if (this.sceneAlpha < 0.05 || !this.logoH) return;
      const floorWY = this.floorScreenY - this.H / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-this.W, floorWY, this.W * 2, this.H);
      ctx.clip();
      ctx.translate(0, 2 * floorWY);
      ctx.scale(1, -1);
      this.logo.draw(ctx, { cx: 0, cy: this.logoCy, height: this.logoH, alpha: 0.24 * this.sceneAlpha });
      ctx.restore();
      // fade the reflection into the floor
      ctx.save();
      const g = ctx.createLinearGradient(0, floorWY, 0, floorWY + this.H * 0.45);
      g.addColorStop(0, 'rgba(6,7,9,0)');
      g.addColorStop(1, 'rgba(6,7,9,0.92)');
      ctx.fillStyle = g;
      ctx.fillRect(-this.W, floorWY, this.W * 2, this.H * 0.45);
      ctx.restore();
    }

    /* Persistent cracked craters punched into the floor. */
    _drawCraters(ctx) {
      for (const c of this.craters) {
        const gp = c.t;
        const r = c.r * gp;
        ctx.save();
        // dark impact bowl (flattened)
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        g.addColorStop(0, 'rgba(0,0,0,0.9)');
        g.addColorStop(0.7, 'rgba(0,0,0,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, r, r * 0.34, 0, 0, TAU);
        ctx.fill();
        // cracks radiating out (dark) with a faint glossy highlight
        ctx.lineCap = 'round';
        for (const line of c.cracks) {
          ctx.strokeStyle = 'rgba(0,0,0,' + (0.85 * gp) + ')';
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          for (let i = 0; i < line.length; i++) {
            const x = c.x + line[i].x * gp, y = c.y + line[i].y * gp;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.strokeStyle = 'rgba(150,160,180,' + (0.14 * gp) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        // glossy raised rim
        ctx.strokeStyle = 'rgba(150,162,185,' + (0.22 * gp) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, r * 0.98, r * 0.34 * 0.98, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* Chunky, irregular dark rocks with a lit top edge + soft floor shadow. */
    _drawPebbles(ctx) {
      for (const p of this.pebbles) {
        const a = util.clamp(p.life, 0, 1);
        const g = (p.shade * 255) | 0;
        const vn = p.verts.length;
        // soft contact shadow when near the floor
        if (p.y >= p.floor - p.size * 2) {
          ctx.fillStyle = 'rgba(0,0,0,' + (0.4 * a) + ')';
          ctx.beginPath();
          ctx.ellipse(p.x, p.floor + 1, p.size * 1.7, p.size * 0.5, 0, 0, TAU);
          ctx.fill();
        }
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // irregular rock body
        ctx.fillStyle = 'rgb(' + g + ',' + (g + 2) + ',' + (g + 6) + ')';
        ctx.beginPath();
        for (let k = 0; k < vn; k++) {
          const ang = (k / vn) * TAU;
          const rr = p.size * p.verts[k];
          const vx = Math.cos(ang) * rr, vy = Math.sin(ang) * rr;
          k === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        // lit top-left facet
        ctx.fillStyle = 'rgba(175,182,196,0.55)';
        ctx.beginPath();
        ctx.ellipse(-p.size * 0.25, -p.size * 0.3, p.size * 0.45, p.size * 0.28, -0.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
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
