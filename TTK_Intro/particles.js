/* =====================================================================
   TTK Intro — particles.js
   ---------------------------------------------------------------------
   High-performance particle engine + shared math utilities.
   This file loads first, so it also establishes the global `TTK`
   namespace and the shared easing / math helpers used by every module.

   Design notes:
   - Particles are pooled (no per-frame allocation / GC churn).
   - All visuals are pre-baked into offscreen sprite canvases and drawn
     with drawImage() under an additive ('lighter') composite, which is
     both fast and gives the soft magical glow the brief asks for.
   - Particles support three motion modes: free, orbit and homing, which
     covers ambient drift, the spiral sequence and the outro reform.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const TAU = Math.PI * 2;

  /* -------------------------------------------------------------------
     Shared math + easing utilities (TTK.util)
     ------------------------------------------------------------------- */
  const util = {
    TAU: TAU,

    clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
    lerp(a, b, t) { return a + (b - a) * t; },
    rand(a, b) { return a + Math.random() * (b - a); },
    randInt(a, b) { return (a + Math.random() * (b - a + 1)) | 0; },
    pick(arr) { return arr[(Math.random() * arr.length) | 0]; },

    // Smoothstep 0..1
    smoothstep(t) { t = util.clamp(t, 0, 1); return t * t * (3 - 2 * t); },

    // Framerate-independent exponential smoothing ("critically damped").
    // `rate` is roughly how fast we converge (higher = snappier).
    expApproach(current, target, rate, dt) {
      return target + (current - target) * Math.exp(-rate * dt);
    },

    // ---- Easing functions requested by the brief ----
    easeOutExpo(t) {
      return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
    },
    easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
    easeInCubic(t) { return t * t * t; },
    easeOutBack(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    // Gentle overshoot used for the "small pulse" settle.
    easeOutElastic(t) {
      if (t === 0 || t === 1) return t;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },

    // Cubic-bezier(x1,y1,x2,y2) evaluator — used for the signature
    // cubic-bezier(0.22, 1, 0.36, 1) "expensive" easing.
    cubicBezier(x1, y1, x2, y2) {
      const A = (a, b) => 1 - 3 * b + 3 * a;
      const B = (a, b) => 3 * b - 6 * a;
      const C = (a) => 3 * a;
      const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
      const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
      const solveX = (x) => {
        let t = x;
        for (let i = 0; i < 8; i++) {
          const xt = calc(t, x1, x2) - x;
          const d = slope(t, x1, x2);
          if (Math.abs(d) < 1e-6) break;
          t -= xt / d;
        }
        return util.clamp(t, 0, 1);
      };
      return function (x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        return calc(solveX(x), y1, y2);
      };
    },

    // Convert hex to an {r,g,b} object.
    hexRgb(hex) {
      hex = hex.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const n = parseInt(hex, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    },
    rgba(hex, a) {
      const c = util.hexRgb(hex);
      return `rgba(${c.r},${c.g},${c.b},${a})`;
    }
  };
  TTK.util = util;

  /* Shared pastel palette (kept in one place, referenced everywhere). */
  const PALETTE = {
    pink: '#ffb7e0',
    hotPink: '#ff8fd0',
    deepPink: '#ff5fb0',
    softPink: '#ffd9ef',
    white: '#ffffff',
    gold: '#fff2b0',
    heart: '#ff7ec2',
    lilac: '#f2c7ff',
    blue: '#2b7bff',
    // moon / metal greys
    dustLight: '#e6e9ee',
    dustMid: '#c2c7d0',
    dustDark: '#9298a2',
    star: '#ffffff'
  };
  TTK.PALETTE = PALETTE;

  /* -------------------------------------------------------------------
     SpriteFactory — pre-bakes glowing shapes into offscreen canvases.
     Baking once and blitting with drawImage keeps us comfortably at
     60 FPS even with several hundred live particles.
     ------------------------------------------------------------------- */
  const SpriteFactory = {
    _cache: {},
    SIZE: 128,

    _canvas() {
      const c = document.createElement('canvas');
      c.width = c.height = this.SIZE;
      return c;
    },

    get(kind, hex) {
      const key = kind + '|' + hex;
      if (this._cache[key]) return this._cache[key];
      const c = this._canvas();
      const ctx = c.getContext('2d');
      this['_' + kind](ctx, hex, this.SIZE);
      this._cache[key] = c;
      return c;
    },

    // Soft round glow blob.
    _glow(ctx, hex, S) {
      const r = S / 2;
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0.0, util.rgba(hex, 1));
      g.addColorStop(0.25, util.rgba(hex, 0.85));
      g.addColorStop(0.55, util.rgba(hex, 0.35));
      g.addColorStop(1.0, util.rgba(hex, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    },

    // Tiny soft dust mote (tighter falloff than glow).
    _dust(ctx, hex, S) {
      const r = S / 2;
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0.0, util.rgba(hex, 1));
      g.addColorStop(0.4, util.rgba(hex, 0.5));
      g.addColorStop(1.0, util.rgba(hex, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(r, r, r * 0.6, 0, TAU);
      ctx.fill();
    },

    // Four-point sparkle glint with a bright core.
    _spark(ctx, hex, S) {
      const c = S / 2;
      ctx.translate(c, c);
      // Core glow
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.5);
      core.addColorStop(0, util.rgba('#ffffff', 1));
      core.addColorStop(0.5, util.rgba(hex, 0.8));
      core.addColorStop(1, util.rgba(hex, 0));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(0, 0, c * 0.5, 0, TAU);
      ctx.fill();
      // Four tapered spikes
      const spike = (len, wid) => {
        const grad = ctx.createLinearGradient(0, 0, 0, -len);
        grad.addColorStop(0, util.rgba('#ffffff', 0.95));
        grad.addColorStop(0.4, util.rgba(hex, 0.6));
        grad.addColorStop(1, util.rgba(hex, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(wid, -len * 0.35);
        ctx.lineTo(0, -len);
        ctx.lineTo(-wid, -len * 0.35);
        ctx.closePath();
        ctx.fill();
      };
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        spike(c * 0.95, c * 0.14);
      }
    },

    // Five-point glossy star.
    _star(ctx, hex, S) {
      const c = S / 2;
      const outer = c * 0.9, inner = c * 0.4;
      ctx.translate(c, c);
      // outer glow
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c);
      g.addColorStop(0, util.rgba(hex, 0.5));
      g.addColorStop(1, util.rgba(hex, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-c, -c, S, S);
      // star body
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const body = ctx.createRadialGradient(-c * 0.2, -c * 0.3, 0, 0, 0, outer);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.6, hex);
      body.addColorStop(1, util.rgba(hex, 0.85));
      ctx.fillStyle = body;
      ctx.fill();
      // specular highlight
      ctx.fillStyle = util.rgba('#ffffff', 0.8);
      ctx.beginPath();
      ctx.ellipse(-c * 0.18, -c * 0.28, c * 0.16, c * 0.09, -0.5, 0, TAU);
      ctx.fill();
    },

    // Cute glowing heart.
    _heart(ctx, hex, S) {
      const c = S / 2;
      ctx.translate(c, c + c * 0.12);
      const s = c * 0.72;
      // glow
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c);
      g.addColorStop(0, util.rgba(hex, 0.55));
      g.addColorStop(1, util.rgba(hex, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-c, -c, S, S);
      // heart path
      ctx.beginPath();
      ctx.moveTo(0, s * 0.75);
      ctx.bezierCurveTo(s * 1.1, -s * 0.2, s * 0.55, -s * 1.05, 0, -s * 0.45);
      ctx.bezierCurveTo(-s * 0.55, -s * 1.05, -s * 1.1, -s * 0.2, 0, s * 0.75);
      ctx.closePath();
      const body = ctx.createLinearGradient(0, -s, 0, s);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.35, hex);
      body.addColorStop(1, util.rgba(hex, 0.9));
      ctx.fillStyle = body;
      ctx.fill();
      // shine
      ctx.fillStyle = util.rgba('#ffffff', 0.75);
      ctx.beginPath();
      ctx.ellipse(-s * 0.35, -s * 0.35, s * 0.2, s * 0.12, -0.6, 0, TAU);
      ctx.fill();
    },

    // Small faceted glitter diamond.
    _glitter(ctx, hex, S) {
      const c = S / 2;
      ctx.translate(c, c);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, c * 0.7);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, hex);
      g.addColorStop(1, util.rgba(hex, 0));
      ctx.fillStyle = g;
      const r = c * 0.55;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.55, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.55, 0);
      ctx.closePath();
      ctx.fill();
    }
  };
  TTK.SpriteFactory = SpriteFactory;

  /* -------------------------------------------------------------------
     Particle — a single pooled particle.
     ------------------------------------------------------------------- */
  class Particle {
    constructor() { this.active = false; }

    reset(o) {
      this.active = true;
      this.type = o.type || 'glow';          // sprite kind
      this.color = o.color || PALETTE.pink;
      this.x = o.x || 0; this.y = o.y || 0;
      this.px = this.x; this.py = this.y;
      this.vx = o.vx || 0; this.vy = o.vy || 0;
      this.grav = o.grav || 0;
      this.drag = o.drag == null ? 1 : o.drag;   // per-second velocity retention
      this.size = o.size || 8;
      this.sizeEnd = o.sizeEnd == null ? this.size : o.sizeEnd;
      this.rot = o.rot || 0;
      this.vr = o.vr || 0;
      this.life = o.life || 1;
      this.maxLife = this.life;
      this.alpha = o.alpha == null ? 1 : o.alpha;
      this.fadeIn = o.fadeIn == null ? 0.12 : o.fadeIn;
      this.fadeOut = o.fadeOut == null ? 0.4 : o.fadeOut;
      this.twinkle = o.twinkle || 0;         // twinkle amount 0..1
      this.phase = Math.random() * TAU;
      this.trail = o.trail || false;
      this.additive = o.additive == null ? true : o.additive; // 'lighter' vs normal blend
      this.mode = o.mode || 'free';          // free | orbit | homing

      // orbit params
      this.cx = o.cx || 0; this.cy = o.cy || 0;
      this.angle = o.angle || 0;
      this.angVel = o.angVel || 0;
      this.radius = o.radius || 0;
      this.radVel = o.radVel || 0;

      // homing params
      this.tx = o.tx || 0; this.ty = o.ty || 0;
      this.homeRate = o.homeRate || 6;

      this._a = this.alpha; // current computed alpha (for render)
      this._s = this.size;  // current computed size
      return this;
    }

    update(dt, sys) {
      this.px = this.x; this.py = this.y;
      this.life -= dt;
      if (this.life <= 0) { this.active = false; return; }

      const t = 1 - this.life / this.maxLife; // 0..1 progress

      if (this.mode === 'orbit') {
        // Orbit center can be driven by the system (e.g. spiral collapse).
        this.cx = sys.orbitX; this.cy = sys.orbitY;
        this.angle += this.angVel * dt;
        this.radius += this.radVel * dt;
        if (this.radius < 0) this.radius = 0;
        this.x = this.cx + Math.cos(this.angle) * this.radius;
        this.y = this.cy + Math.sin(this.angle) * this.radius;
      } else if (this.mode === 'homing') {
        // Smooth exponential approach to a target point.
        const k = Math.exp(-this.homeRate * dt);
        this.x = this.tx + (this.x - this.tx) * k;
        this.y = this.ty + (this.y - this.ty) * k;
      } else {
        this.vy += this.grav * dt;
        const d = Math.pow(this.drag, dt);
        this.vx *= d; this.vy *= d;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      }

      this.rot += this.vr * dt;

      // Alpha envelope (fade in / fade out) with optional twinkle.
      let env = 1;
      if (t < this.fadeIn) env = t / this.fadeIn;
      else if (t > 1 - this.fadeOut) env = (1 - t) / this.fadeOut;
      env = util.clamp(env, 0, 1);
      let a = this.alpha * env;
      if (this.twinkle) {
        a *= 1 - this.twinkle * (0.5 + 0.5 * Math.sin(this.phase + t * 40));
      }
      this._a = a;
      this._s = util.lerp(this.size, this.sizeEnd, util.smoothstep(t));
    }
  }

  /* -------------------------------------------------------------------
     ParticleSystem — owns the pool and all emitters.
     ------------------------------------------------------------------- */
  class ParticleSystem {
    constructor(max) {
      this.max = max || 900;
      this.pool = [];
      this.live = [];
      for (let i = 0; i < this.max; i++) this.pool.push(new Particle());
      // Orbit attractor used by the spiral sequence.
      this.orbitX = 0; this.orbitY = 0;
    }

    get count() { return this.live.length; }

    _obtain() {
      const p = this.pool.pop();
      if (!p) return null;
      this.live.push(p);
      return p;
    }

    spawn(o) {
      const p = this._obtain();
      if (!p) return null;
      return p.reset(o);
    }

    clear() {
      while (this.live.length) {
        const p = this.live.pop();
        p.active = false;
        this.pool.push(p);
      }
    }

    update(dt) {
      const live = this.live;
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i];
        p.update(dt, this);
        if (!p.active) {
          // swap-remove for O(1) recycling
          const last = live.pop();
          if (i < live.length) live[i] = last;
          this.pool.push(p);
        }
      }
    }

    render(ctx) {
      const S = SpriteFactory.SIZE;
      let cur = 'lighter';
      ctx.globalCompositeOperation = cur;
      const live = this.live;
      for (let i = 0; i < live.length; i++) {
        const p = live[i];
        if (p._a <= 0.002) continue;
        const comp = p.additive ? 'lighter' : 'source-over';
        if (comp !== cur) { ctx.globalCompositeOperation = comp; cur = comp; }
        // Motion-blur streak for fast trailing particles.
        if (p.trail) {
          const dx = p.x - p.px, dy = p.y - p.py;
          if (dx * dx + dy * dy > 4) {
            ctx.strokeStyle = util.rgba(p.color, p._a * 0.5);
            ctx.lineWidth = p._s * 0.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.px, p.py);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
        }
        const sprite = SpriteFactory.get(p.type, p.color);
        const d = p._s * 2;
        ctx.globalAlpha = util.clamp(p._a, 0, 1);
        if (p.rot) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.drawImage(sprite, -d / 2, -d / 2, d, d);
          ctx.restore();
        } else {
          ctx.drawImage(sprite, p.x - d / 2, p.y - d / 2, d, d);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------------- Emitters ---------------- */

    // Gentle ambient field: floating sparkles + drifting dust + glitter.
    emitAmbient(w, h, amount) {
      amount = amount || 1;
      if (Math.random() < 0.55 * amount) {
        this.spawn({
          type: 'spark',
          color: util.pick([PALETTE.white, PALETTE.softPink, PALETTE.gold]),
          x: util.rand(-w / 2, w / 2), y: util.rand(-h / 2, h / 2),
          vx: util.rand(-8, 8), vy: util.rand(-18, -4),
          size: util.rand(4, 11), sizeEnd: util.rand(2, 5),
          life: util.rand(2.2, 4.5), twinkle: util.rand(0.4, 0.9),
          vr: util.rand(-1, 1), rot: util.rand(0, TAU)
        });
      }
      if (Math.random() < 0.5 * amount) {
        this.spawn({
          type: 'dust',
          color: util.pick([PALETTE.softPink, PALETTE.white, PALETTE.lilac]),
          x: util.rand(-w / 2, w / 2), y: util.rand(-h / 2, h / 2),
          vx: util.rand(-12, 12), vy: util.rand(-22, -6),
          size: util.rand(3, 8), life: util.rand(3, 6),
          twinkle: util.rand(0.2, 0.6), drag: 0.9
        });
      }
      if (Math.random() < 0.25 * amount) {
        this.spawn({
          type: 'glitter',
          color: util.pick([PALETTE.pink, PALETTE.white, PALETTE.gold]),
          x: util.rand(-w / 2, w / 2), y: util.rand(-h / 2, h / 2),
          vx: util.rand(-10, 10), vy: util.rand(-16, 4),
          size: util.rand(4, 9), life: util.rand(2.5, 4.5),
          vr: util.rand(-3, 3), rot: util.rand(0, TAU),
          twinkle: util.rand(0.5, 1)
        });
      }
    }

    // Small trailing sparkles behind a moving object (logo slide-in).
    emitTrail(x, y, hue) {
      this.spawn({
        type: 'glow',
        color: hue || PALETTE.pink,
        x: x + util.rand(-6, 6), y: y + util.rand(-6, 6),
        vx: util.rand(-30, 30), vy: util.rand(-30, 30),
        size: util.rand(6, 14), sizeEnd: 0,
        life: util.rand(0.4, 0.8), drag: 0.85, fadeOut: 0.7
      });
      if (Math.random() < 0.5) {
        this.spawn({
          type: 'spark', color: PALETTE.white,
          x: x, y: y, vx: util.rand(-20, 20), vy: util.rand(-20, 20),
          size: util.rand(4, 9), sizeEnd: 1, life: util.rand(0.4, 0.7),
          vr: util.rand(-4, 4), twinkle: 0.4
        });
      }
    }

    // A soft "pop" burst when an icon appears.
    popBurst(x, y, color) {
      for (let i = 0; i < 18; i++) {
        const a = util.rand(0, TAU), sp = util.rand(60, 260);
        this.spawn({
          type: util.pick(['spark', 'glitter', 'glow']),
          color: util.pick([color || PALETTE.white, PALETTE.softPink, PALETTE.gold]),
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          size: util.rand(5, 13), sizeEnd: 0, life: util.rand(0.5, 1.1),
          drag: 0.82, vr: util.rand(-6, 6), fadeOut: 0.6
        });
      }
    }

    // Dissolve a set of world points into drifting glitter.
    dissolve(points, color) {
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const a = util.rand(0, TAU), sp = util.rand(30, 160);
        this.spawn({
          type: util.pick(['glitter', 'spark', 'glow', 'dust']),
          color: util.pick([color || PALETTE.pink, PALETTE.white, PALETTE.softPink, PALETTE.gold]),
          x: p.x, y: p.y,
          vx: Math.cos(a) * sp + util.rand(-20, 20),
          vy: Math.sin(a) * sp - util.rand(20, 90),
          grav: util.rand(20, 70),
          size: util.rand(4, 11), sizeEnd: util.rand(0, 3),
          life: util.rand(0.9, 1.8), drag: 0.9,
          vr: util.rand(-6, 6), twinkle: util.rand(0, 0.6), trail: true
        });
      }
    }

    // Horizontal glitter wipe across the screen.
    wipe(w, h, dir) {
      const startX = dir >= 0 ? -w / 2 : w / 2;
      for (let i = 0; i < 60; i++) {
        this.spawn({
          type: util.pick(['glitter', 'spark', 'glow']),
          color: util.pick([PALETTE.white, PALETTE.softPink, PALETTE.pink, PALETTE.gold]),
          x: startX + util.rand(-40, 40), y: util.rand(-h / 2, h / 2),
          vx: dir * util.rand(500, 1000), vy: util.rand(-40, 40),
          size: util.rand(5, 14), sizeEnd: 0, life: util.rand(0.6, 1.2),
          drag: 0.96, vr: util.rand(-6, 6), trail: true, fadeOut: 0.6
        });
      }
    }

    // Seed the spiral: particles orbiting the attractor.
    seedSpiral(cx, cy, count) {
      this.orbitX = cx; this.orbitY = cy;
      for (let i = 0; i < count; i++) {
        this.spawn({
          type: util.pick(['spark', 'glitter', 'glow', 'star', 'heart']),
          color: util.pick([PALETTE.white, PALETTE.pink, PALETTE.softPink, PALETTE.gold, PALETTE.heart]),
          mode: 'orbit',
          angle: util.rand(0, TAU),
          angVel: util.rand(1.4, 2.6) * (Math.random() < 0.5 ? 1 : 1),
          radius: util.rand(120, 340),
          radVel: 0,
          size: util.rand(4, 12), sizeEnd: util.rand(2, 6),
          life: util.rand(3.5, 6), twinkle: util.rand(0.3, 0.8),
          vr: util.rand(-4, 4), trail: true, fadeOut: 0.5
        });
      }
    }

    // The grand magical explosion: sparkles, glitter, stars, hearts, dust.
    explode(x, y, count) {
      count = count || 260;
      for (let i = 0; i < count; i++) {
        const a = util.rand(0, TAU);
        const sp = util.rand(120, 620) * (0.6 + Math.random() * 0.8);
        const r = Math.random();
        let type, color;
        if (r < 0.34) { type = 'spark'; color = util.pick([PALETTE.white, PALETTE.gold]); }
        else if (r < 0.58) { type = 'glitter'; color = util.pick([PALETTE.pink, PALETTE.white, PALETTE.softPink]); }
        else if (r < 0.74) { type = 'star'; color = util.pick([PALETTE.white, PALETTE.gold]); }
        else if (r < 0.86) { type = 'heart'; color = PALETTE.heart; }
        else { type = 'dust'; color = util.pick([PALETTE.softPink, PALETTE.lilac, PALETTE.white]); }
        this.spawn({
          type: type, color: color,
          x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          grav: util.rand(20, 90), drag: 0.9,
          size: util.rand(5, 16), sizeEnd: util.rand(0, 4),
          life: util.rand(1.1, 2.6), vr: util.rand(-8, 8),
          twinkle: util.rand(0, 0.6), trail: true, fadeOut: 0.55
        });
      }
    }

    // A soft, realistic dust cloud kicked up when a letter hits the floor.
    // Muted greys, soft + slow, so it reads as settling dust — not a flash.
    moonDust(x, y, power) {
      power = power || 1;
      const greys = ['#4a4c52', '#5c5f66', '#6d7077', '#7e828a'];
      // Billowing cloud that rises a little then settles
      const n = Math.floor(34 * power);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + util.rand(-1.25, 1.25);
        const sp = util.rand(40, 260) * power;
        this.spawn({
          type: 'dust',
          color: util.pick(greys),
          x: x + util.rand(-18, 18), y: y + util.rand(-4, 4),
          vx: Math.cos(a) * sp * 0.85, vy: Math.sin(a) * sp * 0.7,
          grav: util.rand(30, 120), drag: 0.8,
          size: util.rand(16, 42), sizeEnd: util.rand(20, 54),   // expands as it dissipates
          life: util.rand(0.9, 1.9), alpha: util.rand(0.35, 0.6),
          vr: util.rand(-1, 1), fadeIn: 0.1, fadeOut: 0.7, additive: false
        });
      }
      // Low ground-hugging dust spreading sideways
      const m = Math.floor(16 * power);
      for (let i = 0; i < m; i++) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        this.spawn({
          type: 'dust',
          color: util.pick(greys),
          x: x, y: y, vx: dir * util.rand(120, 380) * power, vy: util.rand(-30, 10),
          grav: 60, drag: 0.86, size: util.rand(18, 40), sizeEnd: util.rand(24, 50),
          life: util.rand(0.7, 1.4), alpha: util.rand(0.3, 0.5), fadeOut: 0.7, additive: false
        });
      }
    }

    // Emit particles that home toward a set of target points (outro reform).
    reform(points, from, color) {
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const a = util.rand(0, TAU), r = util.rand(160, 520);
        this.spawn({
          type: util.pick(['glow', 'spark', 'glitter']),
          color: util.pick([color || PALETTE.pink, PALETTE.white, PALETTE.softPink]),
          mode: 'homing',
          x: (from ? from.x : 0) + Math.cos(a) * r,
          y: (from ? from.y : 0) + Math.sin(a) * r,
          tx: p.x, ty: p.y,
          homeRate: util.rand(3.5, 6.5),
          size: util.rand(6, 13), sizeEnd: util.rand(1, 4),
          life: util.rand(1.2, 2.0), vr: util.rand(-4, 4),
          twinkle: util.rand(0.2, 0.6), trail: true, fadeOut: 0.6
        });
      }
    }
  }

  TTK.Particle = Particle;
  TTK.ParticleSystem = ParticleSystem;

})(window.TTK);
