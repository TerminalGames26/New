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
    lineupStart: 15.4,   // zoom out, reveal all three symbols in a row
    lineupSettle: 16.7,  // symbols + labels fully in place
    lineupHold: 17.7,    // begin closing the text in
    swirlStart: 18.3,    // symbols swirl inward -> spiral
    explode: 22.0,
    outroStart: 22.4,
    outroReform: 22.55,
    outroLogoIn: 22.7,
    outroTextIn: 24.1,
    holdUntil: 27.4,
    fadeOut: 27.5,
    end: 29.5
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

      this._initCaptions();
      this._bindEvents();
      this.resize();
    }

    /* Split every caption into per-letter spans so the letters can fly out
       of the symbol and gently float. Structure per glyph:
         <span class="char"><span class="glyph">A</span></span>
       - .char  handles the continuous floating bob (CSS animation)
       - .glyph handles the entrance (fly-out from the symbol, CSS transition)
       Mode 'symbol' makes letters emerge from the left (where the icon is);
       mode 'up' makes them rise from below (outro). */
    _splitText(el, mode) {
      const lines = el.querySelectorAll('.line, .join, .gg');
      lines.forEach((line) => {
        const text = line.textContent;
        line.textContent = '';
        let idx = 0;
        for (const ch of text) {
          const char = document.createElement('span');
          char.className = 'char';
          const glyph = document.createElement('span');
          glyph.className = 'glyph';
          if (ch === ' ') {
            char.classList.add('space');
            glyph.innerHTML = '&nbsp;';
          } else {
            glyph.textContent = ch;
          }
          // Entrance offset: emerge from the symbol (left) or from below.
          const dx = mode === 'up' ? util.rand(-14, 14) : -(70 + idx * 13);
          const dy = mode === 'up' ? 28 : (idx % 2 ? 12 : -9);
          glyph.style.setProperty('--dx', dx.toFixed(1) + 'px');
          glyph.style.setProperty('--dy', dy.toFixed(1) + 'px');
          glyph.style.setProperty('--d', (idx * 0.03).toFixed(3) + 's');
          // Idle float
          char.style.setProperty('--fy', (-(4 + (idx % 3) * 2)).toFixed(0) + 'px');
          char.style.setProperty('--fd', (idx * 0.13).toFixed(2) + 's');
          char.appendChild(glyph);
          line.appendChild(char);
          idx++;
        }
      });
    }

    _initCaptions() {
      this._splitText(this.texts.creator, 'symbol');
      this._splitText(this.texts.developer, 'symbol');
      this._splitText(this.texts.community, 'symbol');
      this._splitText(this.outroText, 'up');
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
      this.sceneIcons = null;
      this.spiralIcons = null;
      this.lineupLabels = null;

      // Ambient floating particle field (density ramps with the action;
      // the intro is intentionally calmer so the logo reads clearly).
      let ambientAmt = 1.0;
      if (time < T.transition) ambientAmt = 0.5;
      else if (time > T.swirlStart && time < T.outroStart) ambientAmt = 1.6;
      this.particles.emitAmbient(this.W * 1.15 / this.cam.zoom,
        this.H * 1.15 / this.cam.zoom, ambientAmt);

      if (time < T.transition) this._intro(time, dt, md);
      else if (time < T.creatorPop) this._transition(time, md);
      else if (time < T.lineupStart) this._iconScenes(time, md);
      else if (time < T.swirlStart) this._lineup(time, dt, md);
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
      this.bloomStrength = util.lerp(0.22, 0.68, seg(time, 0, 2.4, util.easeOutCubic));

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

    /* ---- ICON SCENES: creator / developer / community ----
       Every symbol computes its own state each frame (so two can overlap
       and cross-fade), and every motion uses long, soft easing — no
       overshoot, no snap. When a symbol settles its caption's letters fly
       out of it and gently float. */
    _iconScenes(time, md) {
      const size = md * 0.12;
      const leftX = -this.W * 0.18 / this.cam.zoom;
      this.cam.tZoom = 1.04;
      this.bloomStrength = 0.55;
      this.sceneIcons = [];

      const defs = [
        { name: 'star', pop: T.creatorPop, slide: T.creatorSlide, out: T.devStart, text: this.texts.creator, textAt: T.creatorText, color: P.gold },
        { name: 'verified', pop: T.devPop, slide: T.devSlide, out: T.commStart, text: this.texts.developer, textAt: T.devText, color: P.blue },
        { name: 'group', pop: T.commPop, slide: T.commSlide, out: T.lineupStart, text: this.texts.community, textAt: T.commText, color: P.softPink }
      ];

      for (const d of defs) {
        // Outside this symbol's visible window? make sure its text is hidden.
        if (time < d.pop - 0.05 || time > d.out + 0.7) {
          if (d.text) d.text.classList.remove('show');
          continue;
        }
        // Soft pop-in (no overshoot), leisurely slide-left, soft fade-out.
        const popP = seg(time, d.pop, 0.8, softBezier);
        const slideP = seg(time, d.slide, 1.3, util.easeInOutCubic);
        const outP = seg(time, d.out, 0.65, util.easeInOutCubic);
        const alpha = util.clamp(popP, 0, 1) * (1 - outP);
        if (alpha > 0.002) {
          const x = util.lerp(0, leftX, slideP);
          const y = util.lerp(-size * 0.12, 0, popP);
          const scale = util.lerp(0.5, 1, popP) * (1 - 0.1 * outP);
          this.sceneIcons.push({ name: d.name, x: x, y: y, size: size * scale, alpha: alpha, rot: 0 });
        }

        // Cues
        if (this.cue(d.name + 'Pop', d.pop)) { this.audio.pop(); this.particles.popBurst(0, 0, d.color); }
        if (this.cue(d.name + 'Slide', d.slide)) this.audio.sparkle();

        // Caption: reveal only once the symbol has settled on the left, so
        // the letters stream OUT of it rather than landing on top of it.
        if (d.text) {
          const textAt = d.slide + 1.0;
          if (time >= textAt && time < d.out) d.text.classList.add('show');
          else d.text.classList.remove('show');
          if (this.cue(d.name + 'Text', textAt)) {
            this.audio.sparkle(); this.audio.glitter();
            const ix = util.lerp(0, leftX, seg(textAt, d.slide, 1.3, util.easeInOutCubic));
            this._emitFromIcon(ix, 0);   // sparkles stream out toward the text
          }
        }
      }
    }

    /* A stream of sparkles bursting out of the symbol toward the caption. */
    _emitFromIcon(x, y) {
      for (let i = 0; i < 16; i++) {
        this.particles.spawn({
          type: util.pick(['spark', 'glitter', 'glow']),
          color: util.pick([P.white, P.softPink, P.gold]),
          x: x, y: y,
          vx: util.rand(60, 320), vy: util.rand(-90, 90),
          size: util.rand(5, 12), sizeEnd: 0,
          life: util.rand(0.5, 1.0), drag: 0.85,
          vr: util.rand(-5, 5), trail: true, fadeOut: 0.6
        });
      }
    }

    /* World x positions for the three symbols laid out in a row. */
    _rowSlots() {
      const rg = this.W * 0.3;
      return [
        { name: 'star', x: -rg, label: 'Creators' },
        { name: 'verified', x: 0, label: 'Developers' },
        { name: 'group', x: rg, label: 'Community' }
      ];
    }

    /* ---- LINEUP: zoom out, reveal all three symbols in a row with their
       labels, hold, then "close in" the text before the swirl. ---- */
    _lineup(time, dt, md) {
      const size = md * 0.12;
      const leftX = -this.W * 0.18 / this.cam.zoom;
      this.cam.tZoom = 0.78;              // pull the camera back
      this.cam.ty = 0;
      this.bloomStrength = 0.42;
      this.sceneIcons = [];
      this.lineupLabels = [];
      this.texts.community.classList.remove('show');

      const slots = this._rowSlots();
      // The group symbol GLIDES in from its community position to centre
      // (gather), then all three fan out to the row — no hard cut.
      const gatherP = seg(time, T.lineupStart, 0.5, util.easeInOutCubic);
      const fanP = seg(time, T.lineupStart + 0.5, 1.1, softBezier);
      // Text "closes in" (fades + slides toward centre) after the hold.
      const closeP = seg(time, T.lineupHold, T.swirlStart - T.lineupHold, util.easeInOutCubic);

      slots.forEach((s) => {
        const originX = s.name === 'group' ? leftX : 0;      // group carries over from the left
        const gatheredX = util.lerp(originX, 0, gatherP);
        const x = util.lerp(gatheredX, s.x, fanP);
        const alpha = s.name === 'group' ? 1 : util.clamp(gatherP * 1.5, 0, 1);
        const scale = s.name === 'group' ? 1 : util.lerp(0.4, 1, gatherP);
        this.sceneIcons.push({ name: s.name, x: x, y: 0, size: size * scale, alpha: alpha, rot: 0 });

        // Label beneath each symbol; fades in with the fan-out, then closes in.
        const lblAlpha = util.clamp(fanP * 1.6 - 0.3, 0, 1) * (1 - closeP);
        const lx = util.lerp(x, x * 0.22, closeP);
        this.lineupLabels.push({ x: lx, y: size * 1.7, text: s.label, alpha: lblAlpha, size: md * 0.042 });
      });

      // Cues
      if (this.cue('lineupWhoosh', T.lineupStart)) this.audio.whoosh(1.0);
      if (this.cue('lineupSpread', T.lineupStart + 0.5)) { this.audio.sparkle(); this.particles.popBurst(0, 0, P.white); }
      if (this.cue('lineupChime', T.lineupSettle)) this.audio.sparkle();
      if (this.cue('lineupClose', T.lineupHold)) this.audio.whoosh(0.6);
    }

    /* ---- SPIRAL: symbols swirl inward, orbit, tighten, explode ---- */
    _spiral(time, dt, md) {
      const size = md * 0.12;
      this.texts.community.classList.remove('show');

      // Camera zooms back in through the build-up (from the pulled-back
      // lineup framing) as everything swirls into the centre.
      const buildP = seg(time, T.swirlStart, T.explode - T.swirlStart, util.easeInCubic);
      this.cam.tZoom = util.lerp(0.78, 1.4, seg(time, T.swirlStart, T.explode - T.swirlStart, util.easeInOutCubic));
      this.bloomStrength = util.lerp(0.42, 1.0, buildP);

      // Kick off the sweep + seed the orbiting particle field once.
      if (this.cue('spiralSweep', T.swirlStart)) this.audio.sweep(T.explode - T.swirlStart);
      if (this.cue('spiralSeed', T.swirlStart + 0.05)) this.particles.seedSpiral(0, 0, 120);

      // The three symbols keep spinning inward the whole way, shrinking as
      // they orbit toward the centre — they stay fully visible right up to
      // the explosion (they don't fade out early).
      if (time < T.explode) {
        const slots = this._rowSlots();
        const p = seg(time, T.swirlStart, T.explode - T.swirlStart, util.easeInCubic);
        this.spiralIcons = slots.map((s) => {
          const r0 = Math.abs(s.x);
          const a0 = s.x < 0 ? Math.PI : 0;         // start angle from its slot
          const ang = a0 + p * TAU * 3;             // keep spinning inward
          const rad = r0 * (1 - p);
          return {
            name: s.name,
            x: Math.cos(ang) * rad,
            y: Math.sin(ang) * rad,
            size: size * (1 - 0.72 * p),            // shrink, but never vanish
            alpha: 1,                                // stay visible until the explosion
            rot: a0 + p * TAU * 2.5
          };
        });
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

      // Scene icons (a list, so symbols can cross-fade).
      if (this.sceneIcons) {
        for (const d of this.sceneIcons) {
          if (d.alpha <= 0.002) continue;
          ctx.save();
          ctx.translate(d.x, d.y);
          this.icons.draw(d.name, ctx, d.size, d.alpha, d.rot);
          ctx.restore();
        }
      }

      // Lineup labels (drawn in world space so they zoom with the symbols).
      if (this.lineupLabels) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const l of this.lineupLabels) {
          if (l.alpha <= 0.01) continue;
          ctx.save();
          ctx.globalAlpha = util.clamp(l.alpha, 0, 1);
          ctx.font = '800 ' + l.size + 'px "Segoe UI","Poppins","Trebuchet MS",sans-serif';
          ctx.shadowColor = 'rgba(120,20,70,0.55)';
          ctx.shadowBlur = l.size * 0.5;
          ctx.fillStyle = '#ffffff';
          ctx.fillText(l.text, l.x, l.y);
          ctx.restore();
        }
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
      ctx.globalAlpha = util.clamp(this.bloomStrength * 0.62, 0, 1);
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
