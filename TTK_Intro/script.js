/* =====================================================================
   TTK Intro — script.js  (main orchestrator)
   ---------------------------------------------------------------------
   Ties every module together and drives the whole cinematic timeline:

     Intro      -> logo slides in, camera zoom, bloom, settle pulse
     Transition -> logo dissolves to glitter, wipe, pink gradient bg
     Creator    -> glowing star + "Some Amazing Creators"
     Developer  -> verified badge + "Popular Developers"
     Community  -> group icon + "Amazing Community Members"
     Spiral     -> icons collapse, orbit, tighten, magical explosion
     Outro      -> explosion reforms into the big glossy TTK logo

   Rendering features: a smoothly interpolated camera, an additive bloom
   post-pass, soft light rays and an ambient floating particle field —
   all running from a single requestAnimationFrame loop targeting 60 FPS.
   ===================================================================== */

(function (TTK) {
  'use strict';

  const util = TTK.util;
  const P = TTK.PALETTE;
  const TAU = Math.PI * 2;

  /* Signature "expensive" easing curve requested by the brief. */
  const softBezier = util.cubicBezier(0.22, 1, 0.36, 1);

  /* -------------------------------------------------------------------
     Timeline (seconds). Every scene boundary lives here so the whole
     show can be re-timed from one place.
     ------------------------------------------------------------------- */
  const T = {
    introWhoosh: 0.05,
    logoSettle: 2.2,
    introChime: 2.25,
    pulseAt: 2.35,
    transition: 3.7,
    creatorPop: 5.4,
    creatorSlide: 6.15,
    creatorText: 6.4,
    devStart: 8.6,
    devPop: 8.95,
    devSlide: 9.6,
    devText: 9.85,
    commStart: 12.0,
    commPop: 12.35,
    commSlide: 13.0,
    commText: 13.25,
    spiralStart: 15.4,
    spiralCollapse: 16.0,
    explode: 19.8,
    outroStart: 20.2,
    outroReform: 20.35,
    outroLogoIn: 20.5,
    outroTextIn: 21.9,
    holdUntil: 25.3,
    fadeOut: 25.4,
    end: 27.4
  };

  /* Staggered eased progress helper: 0 before `delay`, eased 0..1 across
     `dur`, clamped to 1 after. */
  function seg(time, delay, dur, ease) {
    const t = util.clamp((time - delay) / dur, 0, 1);
    return ease ? ease(t) : t;
  }

  class App {
    constructor() {
      this.canvas = document.getElementById('stage');
      this.ctx = this.canvas.getContext('2d');
      this.bg = document.getElementById('bg');

      // Offscreen bloom buffer (half resolution for performance).
      this.bloom = document.createElement('canvas');
      this.bloomCtx = this.bloom.getContext('2d');

      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = 0; this.H = 0;

      // Subsystems
      this.audio = new TTK.AudioEngine();
      this.particles = new TTK.ParticleSystem(1000);
      this.logo = new TTK.Logo();
      this.icons = TTK.Icons;

      // Smoothly interpolated camera.
      this.cam = { zoom: 0.8, x: 0, y: 0, tZoom: 1, tx: 0, ty: 0, shake: 0 };

      // Timeline state
      this.time = 0;
      this.started = false;
      this.finished = false;
      this.bloomStrength = 0.3;
      this._cues = {};
      this._last = 0;

      // Current icon render descriptor (filled each frame during scenes).
      this.iconDraw = null;
      this.spiralIcons = null;

      // DOM references
      this.texts = {
        creator: document.getElementById('text-creator'),
        developer: document.getElementById('text-developer'),
        community: document.getElementById('text-community')
      };
      this.outroText = document.getElementById('outro-text');
      this.startOverlay = document.getElementById('start-overlay');
      this.replayBtn = document.getElementById('replay');
      this.muteBtn = document.getElementById('mute');

      this._bindEvents();
      this.resize();
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
      // Bloom buffer at half res.
      this.bloom.width = Math.max(2, Math.floor(this.canvas.width * 0.5));
      this.bloom.height = Math.max(2, Math.floor(this.canvas.height * 0.5));
      this.minDim = Math.min(this.W, this.H);
    }

    /* One-shot cue: returns true exactly once, when `time` passes `at`. */
    cue(id, at) {
      if (this._cues[id]) return false;
      if (this.time >= at) { this._cues[id] = true; return true; }
      return false;
    }

    start() {
      if (this.started) return;
      this.started = true;
      this.audio.init();
      this.audio.startPad();
      this.startOverlay.classList.add('hidden');
      this.time = 0;
      this._cues = {};
      this._last = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }

    restart() {
      this.time = 0;
      this._cues = {};
      this.finished = false;
      this.particles.clear();
      this.logo.resetHidden();
      this.cam.zoom = 0.8; this.cam.x = 0; this.cam.y = 0;
      this.bg.classList.remove('show');
      this.outroText.classList.remove('show');
      for (const k in this.texts) this.texts[k].classList.remove('show');
      this.replayBtn.classList.remove('show');
      this.audio.startPad();
      this._last = performance.now();
    }

    /* ---------------- Main loop ---------------- */
    loop(now) {
      let dt = (now - this._last) / 1000;
      this._last = now;
      if (dt > 0.05) dt = 0.05;      // clamp large gaps (tab switch) — no jank
      this.time += dt;

      this.updateScene(dt);
      this.updateCamera(dt);
      this.particles.update(dt);
      this.render();

      requestAnimationFrame((t) => this.loop(t));
    }

    /* Smooth, framerate-independent camera interpolation. */
    updateCamera(dt) {
      this.cam.zoom = util.expApproach(this.cam.zoom, this.cam.tZoom, 3.2, dt);
      this.cam.x = util.expApproach(this.cam.x, this.cam.tx, 4.0, dt);
      this.cam.y = util.expApproach(this.cam.y, this.cam.ty, 4.0, dt);
      this.cam.shake = util.expApproach(this.cam.shake, 0, 6, dt);
    }

    /* =================================================================
       Scene director — computes the state of everything for `this.time`.
       ================================================================= */
    updateScene(dt) {
      const time = this.time;
      const md = this.minDim;
      this.iconDraw = null;
      this.spiralIcons = null;

      // Ambient floating particle field (density ramps with the action).
      const ambientAmt = time > T.spiralStart && time < T.outroStart ? 1.6 : 1.0;
      this.particles.emitAmbient(this.W * 1.15 / this.cam.zoom,
        this.H * 1.15 / this.cam.zoom, ambientAmt);

      if (time < T.transition) this._intro(time, dt, md);
      else if (time < T.creatorPop) this._transition(time, md);
      else if (time < T.spiralStart) this._iconScenes(time, md);
      else if (time < T.outroStart) this._spiral(time, dt, md);
      else this._outro(time, dt, md);
    }

    /* ---- INTRO: logo slides in, camera zoom, bloom, pulse ---- */
    _intro(time, dt, md) {
      const h = md * 0.16;
      this.logoH = h;
      this.cam.tZoom = 1.0;
      this.cam.ty = 0;

      // Camera slow push-in.
      if (time < 0.2) this.cam.zoom = 0.8;

      // Bloom rises as the logo assembles.
      this.bloomStrength = util.lerp(0.25, 0.85, seg(time, 0, 2.4, util.easeOutCubic));

      // Per-letter slide-in from three directions with a slight stagger.
      const dirs = [
        { sx: -this.W * 0.95, sy: this.H * 0.15, d: 0.0 },  // left T from left
        { sx: 0, sy: -this.H * 0.95, d: 0.12 },             // middle T from top
        { sx: this.W * 0.95, sy: this.H * 0.15, d: 0.24 }   // K from right
      ];
      // Settle pulse (decaying elastic bump) applied after arrival.
      const pp = util.clamp((time - T.pulseAt) / 0.9, 0, 1);
      const pulse = pp > 0 && pp < 1
        ? 0.13 * Math.exp(-5 * pp) * Math.sin(pp * 16) : 0;

      for (let i = 0; i < 3; i++) {
        const s = this.logo.state[i];
        const p = seg(time, dirs[i].d, 1.9, util.easeOutExpo);
        s.ox = util.lerp(dirs[i].sx, 0, p);
        s.oy = util.lerp(dirs[i].sy, 0, p);
        s.alpha = util.clamp((time - dirs[i].d) / 0.35, 0, 1);
        s.scale = 1 + pulse;
        s.tilt = util.lerp(0.5, 0, p) * (i === 0 ? 0 : 0); // no extra tilt drift

        // Tiny particle trails behind each letter while it is moving fast.
        if (p > 0.02 && p < 0.96 && s.alpha > 0.2) {
          const cx = 0 + this.logo.letters[i].baseX * h + s.ox;
          this.particles.emitTrail(cx, s.oy, i === 2 ? P.pink : P.softPink);
        }
      }

      // Audio cues
      if (this.cue('introWhoosh', T.introWhoosh)) this.audio.whoosh(1.1);
      if (this.cue('introChime', T.introChime)) { this.audio.chime(); this.audio.sparkle(); }
      if (this.cue('pulseGlitter', T.pulseAt + 0.02)) {
        this.particles.popBurst(0, -h * 0.1, P.white);
        this.audio.sparkle();
      }
    }

    /* ---- TRANSITION: dissolve to glitter, wipe, pink background ---- */
    _transition(time, md) {
      const h = this.logoH || md * 0.16;
      this.cam.tZoom = 1.06;

      // Logo fades as it dissolves.
      const fade = 1 - seg(time, T.transition, 0.5, util.easeInCubic);
      for (const s of this.logo.state) s.alpha = fade;

      this.bloomStrength = util.lerp(0.85, 0.5, seg(time, T.transition, 0.8));

      if (this.cue('dissolve', T.transition + 0.02)) {
        const pts = this.logo.getPoints(0, 0, h, 80);
        this.particles.dissolve(pts, P.pink);
        this.audio.whoosh(0.7);
        this.audio.glitter();
      }
      if (this.cue('bgShow', T.transition + 0.05)) this.bg.classList.add('show');
      if (this.cue('wipe1', T.transition + 0.35)) {
        this.particles.wipe(this.W / this.cam.zoom, this.H / this.cam.zoom, 1);
        this.audio.sparkle();
      }
      if (this.cue('wipe2', T.transition + 0.6)) {
        this.particles.wipe(this.W / this.cam.zoom, this.H / this.cam.zoom, -1);
      }
    }

    /* ---- ICON SCENES: creator / developer / community ---- */
    _iconScenes(time, md) {
      const size = md * 0.11;
      const leftX = -this.W * 0.2 / this.cam.zoom;
      this.cam.tZoom = 1.04;
      this.bloomStrength = 0.55;

      // Helper to compute a pop + slide-left descriptor for one icon.
      const iconLife = (popAt, slideAt, endAt, name, textEl, textAt, color) => {
        // pop-in scale (easeOutBack), then slide from centre to the left.
        const popP = seg(time, popAt, 0.55, util.easeOutBack);
        const slideP = seg(time, slideAt, 1.0, util.easeInOutCubic);
        const outP = seg(time, endAt, 0.4, util.easeInCubic);
        const alpha = util.clamp(popP, 0, 1) * (1 - outP);
        const x = util.lerp(0, leftX, slideP);
        const scale = util.lerp(0.2, 1, popP) * (1 - 0.15 * outP);
        this.iconDraw = { name: name, x: x, y: 0, size: size * scale, alpha: alpha, rot: 0 };

        // Cue: pop sound + burst
        if (this.cue(name + 'Pop', popAt)) { this.audio.pop(); this.particles.popBurst(0, 0, color); }
        if (this.cue(name + 'Slide', slideAt)) this.audio.sparkle();
        // Text fades in beside the icon (to the right).
        if (textEl) {
          if (this.time >= textAt && this.time < endAt) textEl.classList.add('show');
          else textEl.classList.remove('show');
          if (this.cue(name + 'Text', textAt)) { this.audio.sparkle(); this.audio.glitter(); }
        }
      };

      if (time < T.devStart) {
        iconLife(T.creatorPop, T.creatorSlide, T.devStart, 'star', this.texts.creator, T.creatorText, P.gold);
      } else if (time < T.commStart) {
        this.texts.creator.classList.remove('show');
        iconLife(T.devPop, T.devSlide, T.commStart, 'verified', this.texts.developer, T.devText, P.softPink);
      } else {
        this.texts.developer.classList.remove('show');
        iconLife(T.commPop, T.commSlide, T.spiralStart, 'group', this.texts.community, T.commText, P.softPink);
      }
    }

    /* ---- SPIRAL: icons collapse, orbit, tighten, explode ---- */
    _spiral(time, dt, md) {
      const size = md * 0.11;
      this.texts.community.classList.remove('show');

      // Camera zooms in through the build-up.
      const buildP = seg(time, T.spiralStart, T.explode - T.spiralStart, util.easeInCubic);
      this.cam.tZoom = util.lerp(1.04, 1.4, buildP);
      this.bloomStrength = util.lerp(0.55, 1.0, buildP);

      // Kick off the sweep + seed the orbiting particle field once.
      if (this.cue('spiralSweep', T.spiralStart)) this.audio.sweep(T.explode - T.spiralStart);
      if (this.cue('spiralSeed', T.spiralStart + 0.05)) this.particles.seedSpiral(0, 0, 120);

      // The three icons fly into the centre and shrink away.
      if (time < T.spiralCollapse + 0.4) {
        const starts = [
          { name: 'star', x: -this.W * 0.2 / this.cam.zoom, y: 0 },
          { name: 'verified', x: this.W * 0.18 / this.cam.zoom, y: -this.H * 0.12 },
          { name: 'group', x: this.W * 0.16 / this.cam.zoom, y: this.H * 0.14 }
        ];
        const cp = seg(time, T.spiralStart, 0.9, util.easeInOutCubic);
        this.spiralIcons = starts.map((s, i) => ({
          name: s.name,
          x: util.lerp(s.x, 0, cp),
          y: util.lerp(s.y, 0, cp),
          size: size * (1 - 0.85 * cp),
          alpha: 1 - seg(time, T.spiralCollapse, 0.4),
          rot: cp * TAU * 1.5
        }));
      }

      // Continuously feed the spiral and tighten it (radius shrinks,
      // angular velocity increases) as we approach the explosion.
      this.particles.orbitX = 0; this.particles.orbitY = 0;
      const tighten = buildP;
      const live = this.particles.live;
      for (let i = 0; i < live.length; i++) {
        const p = live[i];
        if (p.mode === 'orbit') {
          p.radVel = -util.lerp(20, 240, tighten);
          p.angVel = (p.angVel >= 0 ? 1 : 1) * util.lerp(1.6, 7.0, tighten) * Math.sign(p.angVel || 1);
        }
      }
      // Spawn extra spiral sparkles, ramping up the count near the end.
      const spawnRate = util.lerp(2, 14, tighten);
      this._spiralAccum = (this._spiralAccum || 0) + spawnRate * dt;
      while (this._spiralAccum >= 1) {
        this._spiralAccum -= 1;
        const a = util.rand(0, TAU);
        this.particles.spawn({
          type: util.pick(['spark', 'glitter', 'glow', 'star', 'heart']),
          color: util.pick([P.white, P.pink, P.softPink, P.gold, P.heart]),
          mode: 'orbit', angle: a,
          angVel: util.lerp(1.6, 7, tighten) * (Math.random() < 0.5 ? 1 : 1),
          radius: util.lerp(200, 340, Math.random()),
          radVel: -util.lerp(60, 260, tighten),
          size: util.rand(4, 12), sizeEnd: util.rand(1, 5),
          life: util.rand(1.2, 2.4), trail: true, twinkle: util.rand(0.3, 0.8),
          vr: util.rand(-4, 4), fadeOut: 0.5
        });
      }

      // THE EXPLOSION.
      if (this.cue('explode', T.explode)) {
        this.particles.clear();
        this.particles.explode(0, 0, 320);
        this.audio.explosion();
        this.cam.shake = 1;              // tiny, tasteful — no violent shake
        this.cam.tZoom = 1.15;           // gentle relief zoom-out after the pop
      }
    }

    /* ---- OUTRO: reform into big glossy logo + join text ---- */
    _outro(time, dt, md) {
      const h = md * 0.2;
      this.logoH = h;
      this.cam.tZoom = 1.0;
      this.cam.ty = 0;

      // Reform: particles home toward the logo silhouette once.
      if (this.cue('reform', T.outroReform)) {
        // Snap logo letters to place (hidden) so getPoints is correct.
        for (const s of this.logo.state) { s.ox = 0; s.oy = 0; s.scale = 1; s.tilt = 0; s.alpha = 0; }
        const pts = this.logo.getPoints(0, 0, h, 90);
        this.particles.reform(pts, { x: 0, y: 0 }, P.pink);
        this.audio.shimmer(2.4);
        this.audio.chime();
      }

      // Big glossy logo fades in and settles with a soft pulse.
      const inP = seg(time, T.outroLogoIn, 1.3, softBezier);
      const pp = util.clamp((time - (T.outroLogoIn + 1.0)) / 0.9, 0, 1);
      const pulse = pp > 0 && pp < 1 ? 0.08 * Math.exp(-5 * pp) * Math.sin(pp * 14) : 0;
      const outP = seg(time, T.fadeOut, T.end - T.fadeOut, util.easeInOutCubic);
      const logoAlpha = inP * (1 - outP);
      for (let i = 0; i < 3; i++) {
        const s = this.logo.state[i];
        s.ox = 0; s.oy = util.lerp(this.H * 0.06, 0, seg(time, T.outroLogoIn, 1.3, util.easeOutExpo));
        s.alpha = logoAlpha;
        s.scale = util.lerp(0.85, 1, inP) + pulse;
        s.tilt = 0;
      }
      this._outroLogoAlpha = logoAlpha;
      this.bloomStrength = util.lerp(1.0, 0.7, seg(time, T.outroStart, 1.5)) * (1 - 0.4 * outP);

      // Occasional celebratory glitter around the settled logo.
      if (time > T.outroLogoIn + 0.6 && time < T.fadeOut && Math.random() < 0.4) {
        this.particles.spawn({
          type: util.pick(['spark', 'glitter', 'star', 'heart']),
          color: util.pick([P.white, P.pink, P.softPink, P.gold, P.heart]),
          x: util.rand(-h * 1.8, h * 1.8), y: util.rand(-h * 0.8, h * 0.8),
          vx: util.rand(-10, 10), vy: util.rand(-40, -10),
          size: util.rand(5, 12), sizeEnd: util.rand(1, 4),
          life: util.rand(1.5, 3), twinkle: util.rand(0.4, 0.9), vr: util.rand(-3, 3)
        });
      }

      // Bottom text fade in / hold / out.
      if (this.cue('outroText', T.outroTextIn)) { this.audio.sparkle(); }
      if (time >= T.outroTextIn && time < T.fadeOut) this.outroText.classList.add('show');
      if (time >= T.fadeOut) this.outroText.classList.remove('show');

      // Final shimmer + background fade at the very end.
      if (this.cue('finalShimmer', T.fadeOut)) this.audio.shimmer(1.8);
      if (this.cue('bgFade', T.fadeOut + 0.1)) this.bg.classList.remove('show');
      if (this.cue('padStop', T.fadeOut)) this.audio.stopPad(2.0);

      // End: reveal the replay button.
      if (this.cue('end', T.end)) {
        this.finished = true;
        this.replayBtn.classList.add('show');
      }
    }

    /* =================================================================
       Rendering
       ================================================================= */
    render() {
      const ctx = this.ctx;
      const cw = this.canvas.width, chh = this.canvas.height;

      // Base transform (device pixels) + clear to transparent.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, chh);

      // Apply DPR + camera (world origin at screen centre).
      const shakeX = (Math.random() - 0.5) * this.cam.shake * 6;
      const shakeY = (Math.random() - 0.5) * this.cam.shake * 6;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.save();
      ctx.translate(this.W / 2 + shakeX, this.H / 2 + shakeY);
      ctx.scale(this.cam.zoom, this.cam.zoom);
      ctx.translate(-this.cam.x, -this.cam.y);

      // Soft central light rays (depth / atmosphere) behind everything.
      this._drawLightRays(ctx);

      // Particles (behind logo/icons for depth), then icons, then logo.
      this.particles.render(ctx);

      // Scene icons.
      if (this.iconDraw && this.iconDraw.alpha > 0.002) {
        const d = this.iconDraw;
        ctx.save();
        ctx.translate(d.x, d.y);
        this.icons.draw(d.name, ctx, d.size, d.alpha, d.rot);
        ctx.restore();
      }
      if (this.spiralIcons) {
        for (const d of this.spiralIcons) {
          if (d.alpha <= 0.002) continue;
          ctx.save();
          ctx.translate(d.x, d.y);
          ctx.rotate(d.rot);
          this.icons.draw(d.name, ctx, d.size, d.alpha);
          ctx.restore();
        }
      }

      // Logo (intro + outro).
      const showLogo = this.time < T.transition + 0.5 || this.time >= T.outroStart;
      if (showLogo && this.logoH) {
        this.logo.draw(ctx, {
          cx: 0, cy: 0, height: this.logoH,
          alpha: 1, sparkle: this.time >= T.outroStart
        });
      }

      ctx.restore();

      // Additive bloom post-pass.
      this._bloomPass();
    }

    /* Rotating soft light rays under 'lighter' — subtle depth glow. */
    _drawLightRays(ctx) {
      const s = this.bloomStrength;
      if (s < 0.35) return;
      const t = performance.now() / 1000;
      const R = this.minDim * 0.9;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(t * 0.05);
      const rays = 12;
      for (let i = 0; i < rays; i++) {
        ctx.rotate(TAU / rays);
        const g = ctx.createLinearGradient(0, 0, 0, -R);
        g.addColorStop(0, util.rgba(P.softPink, 0.05 * s));
        g.addColorStop(1, util.rgba(P.softPink, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(R * 0.08, -R);
        ctx.lineTo(-R * 0.08, -R);
        ctx.closePath();
        ctx.fill();
      }
      // central soft core glow
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.6);
      core.addColorStop(0, util.rgba(P.pink, 0.10 * s));
      core.addColorStop(1, util.rgba(P.pink, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    /* Downsample -> blur -> add back. Cheap, convincing bloom. */
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
      ctx.globalAlpha = util.clamp(this.bloomStrength * 0.85, 0, 1);
      ctx.drawImage(this.bloom, 0, 0, this.canvas.width, this.canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /* Boot once the DOM is ready. */
  window.addEventListener('DOMContentLoaded', () => {
    TTK.app = new App();
  });

})(window.TTK);
