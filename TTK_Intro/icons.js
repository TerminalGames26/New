/* =====================================================================
   TTK Intro — icons.js
   ---------------------------------------------------------------------
   Programmatically drawn glossy, 3D-ish white icons used by the creator /
   developer / community scenes:

     - Star            (Some Amazing Creators)
     - Verified badge  (Popular Developers)  — original scalloped seal
     - Group / people  (Amazing Community Members)

   Each icon is built from a reusable "path builder" so it can be:
     1. extruded  (many offset copies shaded dark->light for real depth)
     2. front-filled with a glossy white gradient
     3. finished with a rim light + specular highlight

   All icons are drawn centred on (0,0) at a given size, so the caller
   only has to translate + scale.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const util = TTK.util;
  const P = TTK.PALETTE;
  const TAU = Math.PI * 2;

  function mix(a, b, t) {
    const A = util.hexRgb(a), B = util.hexRgb(b);
    return 'rgb(' + ((A.r + (B.r - A.r) * t) | 0) + ',' +
      ((A.g + (B.g - A.g) * t) | 0) + ',' + ((A.b + (B.b - A.b) * t) | 0) + ')';
  }

  const Icons = {
    /* Soft outer glow behind an icon. */
    _glow(ctx, r, alpha, color) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, util.rgba(color || '#ffffff', 0.55 * alpha));
      g.addColorStop(0.5, util.rgba(color || '#ffffff', 0.22 * alpha));
      g.addColorStop(1, util.rgba(color || '#ffffff', 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    /* Extrude a path: fill many offset copies from back (dark) to front,
       giving the icon a solid 3D thickness. `build(ctx)` must define the
       path (without filling). */
    _extrude(ctx, build, depth, steps, colDark, colLight) {
      const ex = 0.22, ey = 1.0, en = Math.hypot(ex, ey);
      for (let i = steps; i >= 1; i--) {
        const f = i / steps;
        ctx.save();
        ctx.translate((ex / en) * depth * f, (ey / en) * depth * f);
        build(ctx);
        ctx.fillStyle = mix(colDark, colLight, 1 - f);
        ctx.fill();
        ctx.restore();
      }
    },

    /* --------------------------------------------------------------
       STAR — five point glossy 3D star.
       -------------------------------------------------------------- */
    _starPath(ctx, size) {
      const outer = size, inner = size * 0.44;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
    },

    star(ctx, size, alpha, rot) {
      alpha = alpha == null ? 1 : alpha;
      ctx.save();
      ctx.globalAlpha = util.clamp(alpha, 0, 1);
      this._glow(ctx, size * 1.7, alpha, P.softPink);
      ctx.rotate(rot || 0);

      const build = (c) => this._starPath(c, size);
      this._extrude(ctx, build, size * 0.32, 12, '#c23f86', '#ffb3df');

      // front face
      build(ctx);
      const body = ctx.createRadialGradient(-size * 0.2, -size * 0.3, 0, 0, 0, size);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.55, '#fff0f9');
      body.addColorStop(1, '#ffd0ec');
      ctx.fillStyle = body;
      ctx.fill();

      // rim + specular
      ctx.lineWidth = size * 0.03;
      ctx.strokeStyle = util.rgba('#ffffff', 0.8 * alpha);
      ctx.stroke();
      ctx.fillStyle = util.rgba('#ffffff', 0.85 * alpha);
      ctx.beginPath();
      ctx.ellipse(-size * 0.22, -size * 0.3, size * 0.22, size * 0.12, -0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    /* --------------------------------------------------------------
       VERIFIED — scalloped seal badge with a check mark.
       -------------------------------------------------------------- */
    _sealPath(ctx, size) {
      const bumps = 12, rOut = size, rIn = size * 0.86, steps = bumps * 2;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * TAU - Math.PI / 2;
        const rad = i % 2 === 0 ? rOut : rIn;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
    },

    verified(ctx, size, alpha) {
      alpha = alpha == null ? 1 : alpha;
      ctx.save();
      ctx.globalAlpha = util.clamp(alpha, 0, 1);
      this._glow(ctx, size * 1.7, alpha, P.softPink);

      const build = (c) => this._sealPath(c, size);
      this._extrude(ctx, build, size * 0.34, 12, '#b53a7e', '#ff9ed6');

      // front seal face
      build(ctx);
      const body = ctx.createRadialGradient(-size * 0.25, -size * 0.3, 0, 0, 0, size);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.6, '#fff2fa');
      body.addColorStop(1, '#ffd2ec');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.lineWidth = size * 0.03;
      ctx.strokeStyle = util.rgba('#ffffff', 0.75 * alpha);
      ctx.stroke();

      // inner tinted disc (saturated so the white check pops)
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.62, 0, TAU);
      const disc = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
      disc.addColorStop(0, '#ff9ed6');
      disc.addColorStop(1, '#ff62b6');
      ctx.fillStyle = disc;
      ctx.fill();

      // check mark (with a subtle drop for depth)
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = util.rgba('#c23f86', 0.5);
      ctx.beginPath();
      ctx.moveTo(-size * 0.32, size * 0.06);
      ctx.lineTo(-size * 0.06, size * 0.34);
      ctx.lineTo(size * 0.42, -size * 0.28);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-size * 0.34, size * 0.02);
      ctx.lineTo(-size * 0.08, size * 0.3);
      ctx.lineTo(size * 0.4, -size * 0.32);
      ctx.stroke();

      // specular sweep
      ctx.fillStyle = util.rgba('#ffffff', 0.5 * alpha);
      ctx.beginPath();
      ctx.ellipse(-size * 0.28, -size * 0.34, size * 0.34, size * 0.16, -0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    /* --------------------------------------------------------------
       GROUP — three glossy 3D person silhouettes.
       -------------------------------------------------------------- */
    _personPath(ctx, cx, cy, s) {
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.55, s * 0.42, 0, TAU);
      ctx.moveTo(cx - s * 0.7, cy + s * 0.85);
      ctx.arc(cx, cy + s * 0.4, s * 0.7, Math.PI, 0, false);
      ctx.closePath();
    },

    group(ctx, size, alpha) {
      alpha = alpha == null ? 1 : alpha;
      ctx.save();
      ctx.globalAlpha = util.clamp(alpha, 0, 1);
      this._glow(ctx, size * 1.8, alpha, P.softPink);

      const s = size * 0.62;

      // Extrude all three silhouettes together for a unified 3D body.
      const buildAll = (c) => {
        this._personPath(c, -size * 0.62, -size * 0.05, s * 0.8);
        this._personPath(c, size * 0.62, -size * 0.05, s * 0.8);
        this._personPath(c, 0, size * 0.12, s);
      };
      this._extrude(ctx, buildAll, size * 0.3, 10, '#b53a7e', '#ff9ed6');

      // back two people (front faces)
      const back = ctx.createLinearGradient(0, -size, 0, size);
      back.addColorStop(0, '#ffe9f6');
      back.addColorStop(1, '#ffbfe4');
      ctx.fillStyle = back;
      this._personPath(ctx, -size * 0.62, -size * 0.05, s * 0.8); ctx.fill();
      this._personPath(ctx, size * 0.62, -size * 0.05, s * 0.8); ctx.fill();

      // front centre person (bright glossy)
      const front = ctx.createLinearGradient(0, -size, 0, size);
      front.addColorStop(0, '#ffffff');
      front.addColorStop(0.6, '#fff2fa');
      front.addColorStop(1, '#ffd2ec');
      ctx.fillStyle = front;
      this._personPath(ctx, 0, size * 0.12, s); ctx.fill();

      // rim + specular on the front figure
      ctx.lineWidth = size * 0.025;
      ctx.strokeStyle = util.rgba('#ffffff', 0.7 * alpha);
      this._personPath(ctx, 0, size * 0.12, s); ctx.stroke();
      ctx.fillStyle = util.rgba('#ffffff', 0.7 * alpha);
      ctx.beginPath();
      ctx.ellipse(-size * 0.14, -size * 0.42, size * 0.16, size * 0.09, -0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    /* Dispatch by name — used by the scene manager. */
    draw(name, ctx, size, alpha, rot) {
      if (name === 'star') this.star(ctx, size, alpha, rot);
      else if (name === 'verified') this.verified(ctx, size, alpha);
      else if (name === 'group') this.group(ctx, size, alpha);
    }
  };

  TTK.Icons = Icons;

})(window.TTK);
