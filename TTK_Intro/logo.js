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
        { type: 'T', baseX: -1.24, tilt: 0 },
        { type: 'T', baseX: 0.0, tilt: 0 },
        { type: 'K', baseX: 1.2, tilt: 0 }
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

      // Smooth metal front face — a clean top-lit gradient (no hard bands
      // or highlight lines), so the letter reads as one solid 3D shape.
      const grad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
      grad.addColorStop(0.00, '#dfe2e6');
      grad.addColorStop(0.40, '#a5a9af');
      grad.addColorStop(0.72, '#6b6f76');
      grad.addColorStop(1.00, '#34373d');

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

      // Soft drop shadow so the flat letter still grounds on the floor.
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = W * 0.5;
      ctx.shadowOffsetY = W * 0.22;
      stroke(0, W * 0.1, 'rgba(0,0,0,0.4)', W);
      ctx.restore();

      // Flat 2D metal face (a single smooth gradient — no 3D extrusion)
      stroke(0, 0, grad, W);

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
