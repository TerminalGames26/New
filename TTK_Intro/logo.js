/* =====================================================================
   TTK Intro — logo.js
   ---------------------------------------------------------------------
   Programmatically drawn 3D "glossy metal" letters spelling TTK.

   The letters are NOT text. Each is described as thick round-capped stroke
   segments in a normalised unit box and rendered in layered passes to fake
   a convincing polished-gunmetal 3D look:

     1. subtle outer rim glow (separates the dark metal from the dark sky)
     2. contact shadow        (grounds the letter where it lands)
     3. 3D extrusion          (diagonal lower-right bevel = real depth)
     4. metallic front face    (dark→bright→dark reflective gradient)
     5. inner specular         (bright streak along the top)
     6. top rim shine          (the glossy metal edge)

   Each letter is rendered ONCE into an offscreen bitmap and then that
   bitmap is dropped / squashed / faded as a single unit, which keeps the
   motion clean and cheap.

   Per-letter state (offset, scaleX/scaleY for the landing squash, alpha)
   is driven by the scene director in script.js.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const util = TTK.util;
  const TAU = Math.PI * 2;

  /* Letter geometry in a unit box: x,y in [-0.5, 0.5]. */
  const GEOMETRY = {
    T: [
      [[-0.42, -0.4], [0.42, -0.4]],   // top bar
      [[0.0, -0.4], [0.0, 0.45]]       // stem
    ],
    K: [
      [[-0.3, -0.4], [-0.3, 0.45]],    // vertical stem
      [[-0.3, 0.04], [0.36, -0.4]],    // upper diagonal
      [[-0.3, 0.04], [0.38, 0.45]]     // lower diagonal
    ]
  };

  function mix(a, b, t) {
    const A = util.hexRgb(a), B = util.hexRgb(b);
    return 'rgb(' + ((A.r + (B.r - A.r) * t) | 0) + ',' +
      ((A.g + (B.g - A.g) * t) | 0) + ',' + ((A.b + (B.b - A.b) * t) | 0) + ')';
  }

  class Logo {
    constructor() {
      this.letters = [
        { type: 'T', baseX: -1.16, tilt: 0 },
        { type: 'T', baseX: 0.0, tilt: 0 },
        { type: 'K', baseX: 1.14, tilt: 0 }
      ];
      this.state = this.letters.map(() => ({
        ox: 0, oy: 0, scale: 1, scaleX: 1, scaleY: 1, alpha: 1, tilt: 0
      }));
      this._cache = {};
      this._R = 400;
    }

    resetHidden() {
      for (const s of this.state) {
        s.ox = 0; s.oy = 0; s.scale = 1; s.scaleX = 1; s.scaleY = 1; s.alpha = 0; s.tilt = 0;
      }
    }

    letterCenter(i, cx, cy, h) {
      const s = this.state[i];
      return { x: cx + this.letters[i].baseX * h + s.ox, y: cy + s.oy };
    }

    _getBitmap(type) {
      if (this._cache[type]) return this._cache[type];
      const R = this._R;
      const half = Math.ceil(R * 1.35);
      const size = half * 2;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const c = cv.getContext('2d');
      c.translate(half, half);
      this._drawLetter(c, type, R, 1);
      const bmp = { canvas: cv, size: size, R: R };
      this._cache[type] = bmp;
      return bmp;
    }

    /* Draw a single glossy-metal 3D letter centred at (0,0). */
    _drawLetter(ctx, type, h, alpha) {
      const segs = GEOMETRY[type];
      const W = h * 0.27;

      // Brushed silver metal front face (matte, light-top gradient).
      const grad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
      grad.addColorStop(0.00, '#c8cbcf');
      grad.addColorStop(0.35, '#a3a6ac');
      grad.addColorStop(0.62, '#84878d');
      grad.addColorStop(1.00, '#5d6066');

      const stroke = (offx, offy, style, width) => {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        for (const seg of segs) {
          ctx.beginPath();
          for (let i = 0; i < seg.length; i++) {
            const x = seg[i][0] * h + offx;
            const y = seg[i][1] * h + offy;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      };

      ctx.save();
      ctx.globalAlpha = util.clamp(alpha, 0, 1);

      // 1. Soft outer white glow (the neon-edge halo around the letter)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = W * 1.3;
      stroke(0, 0, 'rgba(255,255,255,0.28)', W * 1.06);
      ctx.restore();

      // 2. Contact shadow (shows where it lands on the bright moon)
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = W * 0.8;
      ctx.shadowOffsetY = W * 0.45;
      stroke(0, W * 0.15, 'rgba(0,0,0,0.55)', W);
      ctx.restore();

      // 3. 3D extrusion — short diagonal lower-right bevel
      const depth = W * 0.34, steps = 10;
      const ex = 0.62, ey = 0.78, en = Math.hypot(ex, ey);
      for (let i = steps; i >= 1; i--) {
        const f = i / steps;
        const mag = depth * f;
        const col = mix('#2a2c31', '#585b62', 1 - f);
        stroke((ex / en) * mag, (ey / en) * mag, col, W);
      }

      // 3b. Glowing white edge — a bright rim slightly wider than the face
      // that reads as the lit outline around the letter (as in the ref).
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = 'rgba(255,255,255,0.95)';
      ctx.shadowBlur = W * 0.5;
      stroke(0, 0, '#ffffff', W * 1.14);
      ctx.restore();

      // 4. Metallic silver front face (covers the centre, leaving the rim)
      stroke(0, 0, grad, W);

      // Highlights fade out below the top so vertical strokes don't get a
      // full-length line.
      const hiGrad = ctx.createLinearGradient(0, -h * 0.5, 0, -h * 0.02);
      hiGrad.addColorStop(0, util.rgba('#ffffff', 0.32));
      hiGrad.addColorStop(1, util.rgba('#ffffff', 0));
      const rimGrad = ctx.createLinearGradient(0, -h * 0.5, 0, -h * 0.14);
      rimGrad.addColorStop(0, util.rgba('#ffffff', 1));
      rimGrad.addColorStop(1, util.rgba('#ffffff', 0));

      // 5. Inner specular streak (upper area only)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      stroke(-W * 0.08, -W * 0.18, hiGrad, W * 0.42);
      ctx.restore();

      // 6. Top rim shine (sharp metal highlight)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      stroke(-W * 0.02, -W * 0.3, rimGrad, W * 0.12);
      ctx.restore();

      ctx.restore();
    }

    /* Draw the whole logo.
       opts: { cx, cy, height, alpha }  */
    draw(ctx, opts) {
      const cx = opts.cx, cy = opts.cy, h = opts.height;
      const gAlpha = opts.alpha == null ? 1 : opts.alpha;

      for (let i = 0; i < this.letters.length; i++) {
        const L = this.letters[i], s = this.state[i];
        const a = gAlpha * s.alpha;
        if (a <= 0.002) continue;
        const bmp = this._getBitmap(L.type);
        const drawSize = bmp.size * (h / bmp.R);
        ctx.save();
        ctx.translate(cx + L.baseX * h + s.ox, cy + s.oy);
        ctx.rotate(L.tilt + s.tilt);
        // squash/stretch (landing impact) folded into the base scale
        ctx.scale(s.scale * s.scaleX, s.scale * s.scaleY);
        ctx.globalAlpha = util.clamp(a, 0, 1);
        ctx.drawImage(bmp.canvas, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
        ctx.restore();
      }
    }

    /* Sample points along the letter outlines in WORLD space (kept for
       optional effects). */
    getPoints(cx, cy, h, density) {
      density = density || 60;
      const pts = [];
      for (let i = 0; i < this.letters.length; i++) {
        const L = this.letters[i], s = this.state[i];
        const segs = GEOMETRY[L.type];
        let total = 0; const lens = [];
        for (const seg of segs) {
          for (let j = 0; j < seg.length - 1; j++) {
            const dx = (seg[j + 1][0] - seg[j][0]) * h;
            const dy = (seg[j + 1][1] - seg[j][1]) * h;
            const len = Math.hypot(dx, dy);
            lens.push(len); total += len;
          }
        }
        const n = Math.max(8, Math.round(density));
        const bx = cx + L.baseX * h + s.ox, by = cy + s.oy;
        let li = 0;
        for (const seg of segs) {
          for (let j = 0; j < seg.length - 1; j++) {
            const count = Math.max(2, Math.round(n * (lens[li] / total)));
            li++;
            for (let k = 0; k < count; k++) {
              const t = k / count;
              const lx = util.lerp(seg[j][0], seg[j + 1][0], t) * h + util.rand(-h * 0.12, h * 0.12);
              const ly = util.lerp(seg[j][1], seg[j + 1][1], t) * h + util.rand(-h * 0.12, h * 0.12);
              pts.push({ x: bx + lx, y: by + ly });
            }
          }
        }
      }
      return pts;
    }
  }

  TTK.Logo = Logo;

})(window.TTK);
