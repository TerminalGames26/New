/* =====================================================================
   TTK Intro — logo.js
   ---------------------------------------------------------------------
   Programmatically drawn glossy rounded "bubble" letters spelling TTK.

   The letters are NOT text. Each letter is described as a set of thick
   round-capped stroke segments in a normalised unit box (height = 1).
   Rendering them as layered strokes lets us fake a convincing 3D glossy
   look cheaply and reliably:

     1. outer glow          (soft pink bloom around the letter)
     2. dark base           (offset downward — gives depth / thickness)
     3. gradient body       (light pink top -> deep pink bottom)
     4. inner specular      (bright streak along the upper edge)
     5. top rim highlight   (thin white line — the glossy shine)
     6. bottom reflection   (subtle light bounce underneath)
     7. floating sparkle glints

   The class also exposes per-letter transforms (offset / scale / alpha /
   tilt) so the scene manager can slide the letters in, pulse them, and
   dissolve them, plus getPoints() to sample the letter outline for the
   dissolve + reform particle effects.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const util = TTK.util;
  const P = TTK.PALETTE;
  const TAU = Math.PI * 2;

  /* Letter geometry in a unit box: x in [-0.5,0.5], y in [-0.5,0.5].
     Each letter is a list of polyline segments (arrays of [x,y]). */
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

  /* Small colour-mix helper for the 3D extrusion shading. */
  function mix(a, b, t) {
    const A = util.hexRgb(a), B = util.hexRgb(b);
    return 'rgb(' + ((A.r + (B.r - A.r) * t) | 0) + ',' +
      ((A.g + (B.g - A.g) * t) | 0) + ',' + ((A.b + (B.b - A.b) * t) | 0) + ')';
  }

  class Logo {
    constructor() {
      // Layout: three letters T T K, spaced along x (wider spacing so the
      // glossy bubbles breathe and never look cramped/overlapping).
      // Base positions are relative to the logo centre (unit = letter height).
      this.letters = [
        { type: 'T', baseX: -1.18, tilt: 0.15 }, // first T leans slightly right
        { type: 'T', baseX: 0.0, tilt: 0.0 },
        { type: 'K', baseX: 1.16, tilt: 0.0 }
      ];
      // Per-letter animation state (offset in px, scale, alpha, extra tilt).
      this.state = this.letters.map(() => ({
        ox: 0, oy: 0, scale: 1, alpha: 1, tilt: 0
      }));
    }

    /* Reset every letter to a hidden, offscreen state. */
    resetHidden() {
      for (const s of this.state) { s.ox = 0; s.oy = 0; s.scale = 1; s.alpha = 0; s.tilt = 0; }
    }

    /* World position of a letter's centre given logo centre + height. */
    letterCenter(i, cx, cy, h) {
      const L = this.letters[i], s = this.state[i];
      return { x: cx + L.baseX * h + s.ox, y: cy + s.oy };
    }

    /* Draw a single glossy 3D bubble letter centred at (0,0).
       The bubble body is built from thick round-capped strokes; real
       depth comes from an extrusion pass (many offset copies shaded from
       dark-back to lighter-side) with the bright gradient front face and
       specular highlights layered on top. */
    _drawLetter(ctx, type, h, alpha) {
      const segs = GEOMETRY[type];
      const W = h * 0.27;            // stroke thickness (bubble width)
      const grad = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
      grad.addColorStop(0, '#fff2fa');
      grad.addColorStop(0.32, '#ffe0f2');
      grad.addColorStop(0.6, P.pink);
      grad.addColorStop(0.82, P.hotPink);
      grad.addColorStop(1, '#ff4fa8');

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

      // 1. Outer glow / bloom
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = util.rgba(P.hotPink, 0.9);
      ctx.shadowBlur = W * 1.3;
      stroke(0, 0, util.rgba(P.pink, 0.5), W * 1.05);
      ctx.restore();

      // 2. Contact shadow (grounds the letter)
      ctx.save();
      ctx.shadowColor = 'rgba(120,20,70,0.45)';
      ctx.shadowBlur = W * 0.9;
      ctx.shadowOffsetY = W * 0.5;
      stroke(0, W * 0.15, 'rgba(120,20,70,0.5)', W);
      ctx.restore();

      // 3. 3D extrusion (back -> front) — a short DIAGONAL bevel toward the
      // lower-right. A shallow down-right offset reads as a chunky 3D edge
      // instead of a long "drip" line hanging below the letters.
      const depth = W * 0.32, steps = 10;
      const ex = 0.62, ey = 0.78; // extrusion direction (unnormalised)
      const en = Math.hypot(ex, ey);
      for (let i = steps; i >= 1; i--) {
        const f = i / steps;
        const mag = depth * f;
        const col = mix('#7a2352', '#d24f92', 1 - f);
        stroke((ex / en) * mag, (ey / en) * mag, col, W);
      }

      // 4. Gradient front face
      stroke(0, 0, grad, W);

      // 5. Inner specular streak (upper-left)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      stroke(-W * 0.08, -W * 0.18, util.rgba('#ffffff', 0.45), W * 0.4);
      ctx.restore();

      // 6. Top rim highlight (the glossy shine line)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      stroke(-W * 0.02, -W * 0.3, util.rgba('#ffffff', 0.9), W * 0.11);
      ctx.restore();

      ctx.restore();
    }

    /* Draw the whole logo.
       opts: { cx, cy, height, alpha, sparkle (bool) }  */
    draw(ctx, opts) {
      const cx = opts.cx, cy = opts.cy, h = opts.height;
      const gAlpha = opts.alpha == null ? 1 : opts.alpha;

      for (let i = 0; i < this.letters.length; i++) {
        const L = this.letters[i], s = this.state[i];
        const a = gAlpha * s.alpha;
        if (a <= 0.002) continue;
        ctx.save();
        ctx.translate(cx + L.baseX * h + s.ox, cy + s.oy);
        ctx.rotate(L.tilt + s.tilt);
        ctx.scale(s.scale, s.scale);
        this._drawLetter(ctx, L.type, h, a);
        ctx.restore();
      }

      // Floating sparkle glints sitting on the glossy surface.
      if (opts.sparkle && gAlpha > 0.3) {
        const t = (performance.now() / 1000);
        for (let i = 0; i < this.letters.length; i++) {
          const L = this.letters[i], s = this.state[i];
          if (gAlpha * s.alpha < 0.3) continue;
          const bx = cx + L.baseX * h + s.ox;
          const gx = bx + Math.sin(t * 1.3 + i * 2) * h * 0.22;
          const gy = cy + Math.cos(t * 1.1 + i) * h * 0.28 - h * 0.1;
          const sp = TTK.SpriteFactory.get('spark', P.white);
          const d = (10 + 6 * Math.sin(t * 3 + i)) ;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = (0.5 + 0.5 * Math.sin(t * 3 + i * 1.7)) * gAlpha;
          ctx.drawImage(sp, gx - d, gy - d, d * 2, d * 2);
          ctx.restore();
        }
      }
    }

    /* Sample points along the letter outlines in WORLD space.
       Used to dissolve the logo into glitter and to reform it in the outro.
       density = approx points per letter. */
    getPoints(cx, cy, h, density) {
      density = density || 60;
      const pts = [];
      for (let i = 0; i < this.letters.length; i++) {
        const L = this.letters[i], s = this.state[i];
        const segs = GEOMETRY[L.type];
        // total length for even distribution
        let total = 0;
        const lens = [];
        for (const seg of segs) {
          for (let j = 0; j < seg.length - 1; j++) {
            const dx = (seg[j + 1][0] - seg[j][0]) * h;
            const dy = (seg[j + 1][1] - seg[j][1]) * h;
            const len = Math.hypot(dx, dy);
            lens.push(len); total += len;
          }
        }
        const n = Math.max(8, Math.round(density));
        const cosT = Math.cos(L.tilt + s.tilt), sinT = Math.sin(L.tilt + s.tilt);
        const bx = cx + L.baseX * h + s.ox, by = cy + s.oy;
        let li = 0;
        for (const seg of segs) {
          for (let j = 0; j < seg.length - 1; j++) {
            const count = Math.max(2, Math.round(n * (lens[li] / total)));
            li++;
            for (let k = 0; k < count; k++) {
              const t = k / count;
              // local (pre-rotation) coordinate + random thickness offset
              let lx = util.lerp(seg[j][0], seg[j + 1][0], t) * h;
              let ly = util.lerp(seg[j][1], seg[j + 1][1], t) * h;
              lx += util.rand(-h * 0.12, h * 0.12);
              ly += util.rand(-h * 0.12, h * 0.12);
              // apply letter rotation + world translation
              pts.push({
                x: bx + lx * cosT - ly * sinT,
                y: by + lx * sinT + ly * cosT
              });
            }
          }
        }
      }
      return pts;
    }
  }

  TTK.Logo = Logo;

})(window.TTK);
