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
      this._glow(ctx, size * 1.8, alpha, '#ffdf6b');   // warm golden glow
      ctx.rotate(rot || 0);

      const build = (c) => this._starPath(c, size);
      this._extrude(ctx, build, size * 0.32, 12, '#a06a05', '#ffcf3d');

      // glossy gold front face
      build(ctx);
      const body = ctx.createRadialGradient(-size * 0.2, -size * 0.3, 0, 0, 0, size);
      body.addColorStop(0, '#fffdf0');
      body.addColorStop(0.4, '#ffe987');
      body.addColorStop(0.75, '#ffcf3d');
      body.addColorStop(1, '#f5a800');
      ctx.fillStyle = body;
      ctx.fill();

      // rim + specular
      ctx.lineWidth = size * 0.03;
      ctx.strokeStyle = util.rgba('#fff7cf', 0.85 * alpha);
      ctx.stroke();
      ctx.fillStyle = util.rgba('#ffffff', 0.9 * alpha);
      ctx.beginPath();
      ctx.ellipse(-size * 0.22, -size * 0.3, size * 0.22, size * 0.12, -0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    /* --------------------------------------------------------------
       VERIFIED — blue rounded-square badge, tilted, with a white check.
       -------------------------------------------------------------- */
    _roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    },

    verified(ctx, size, alpha) {
      alpha = alpha == null ? 1 : alpha;
      ctx.save();
      ctx.globalAlpha = util.clamp(alpha, 0, 1);
      this._glow(ctx, size * 1.7, alpha, '#7db0ff');   // cool blue glow

      // Tilt the whole badge slightly, like the reference.
      ctx.rotate(-0.13);

      const s = size * 0.92;                 // half-extent of the square
      const r = s * 0.42;                    // corner radius (rounded square)
      const build = (c) => this._roundRect(c, -s, -s, s * 2, s * 2, r);

      // 3D extrusion in blue.
      this._extrude(ctx, build, size * 0.3, 12, '#0a3ca8', '#2f7bff');

      // Blue glossy front face.
      build(ctx);
      const body = ctx.createLinearGradient(0, -s, 0, s);
      body.addColorStop(0, '#4d93ff');
      body.addColorStop(0.5, '#1f74ff');
      body.addColorStop(1, '#0a58f0');
      ctx.fillStyle = body;
      ctx.fill();

      // Soft top sheen.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sheen = ctx.createLinearGradient(0, -s, 0, 0);
      sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
      sheen.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sheen;
      build(ctx);
      ctx.fill();
      ctx.restore();

      // White check mark (bold, rounded) with a subtle inner shadow.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.19;
      ctx.strokeStyle = 'rgba(8,50,150,0.35)';
      ctx.beginPath();
      ctx.moveTo(-size * 0.36, size * 0.04);
      ctx.lineTo(-size * 0.08, size * 0.34);
      ctx.lineTo(size * 0.42, -size * 0.30);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-size * 0.38, size * 0.0);
      ctx.lineTo(-size * 0.10, size * 0.30);
      ctx.lineTo(size * 0.40, -size * 0.34);
      ctx.stroke();

      // corner specular highlight
      ctx.fillStyle = util.rgba('#ffffff', 0.4 * alpha);
      ctx.beginPath();
      ctx.ellipse(-s * 0.42, -s * 0.5, s * 0.5, s * 0.18, -0.5, 0, TAU);
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

      // Each of the three people is its own fully-3D object: extruded body
      // + glossy front face + rim, drawn back-to-front (painter's order) so
      // the whole group reads as three solid 3D figures, not flat cut-outs.
      const persons = [
        { cx: -size * 0.6, cy: -size * 0.02, sc: s * 0.82, top: '#ffe4f4', bot: '#ffb2e0' },
        { cx: size * 0.6, cy: -size * 0.02, sc: s * 0.82, top: '#ffe4f4', bot: '#ffb2e0' },
        { cx: 0, cy: size * 0.14, sc: s, top: '#ffffff', bot: '#ffd2ec' }
      ];

      for (const pr of persons) {
        const build = (c) => this._personPath(c, pr.cx, pr.cy, pr.sc);
        // 3D extrusion for this figure
        this._extrude(ctx, build, size * 0.26, 10, '#b53a7e', '#ff9ed6');
        // glossy front face
        build(ctx);
        const g = ctx.createLinearGradient(0, pr.cy - pr.sc, 0, pr.cy + pr.sc);
        g.addColorStop(0, pr.top);
        g.addColorStop(1, pr.bot);
        ctx.fillStyle = g;
        ctx.fill();
        // rim light
        ctx.lineWidth = size * 0.02;
        ctx.strokeStyle = util.rgba('#ffffff', 0.5 * alpha);
        ctx.stroke();
      }

      // specular highlight on the front figure's head
      ctx.fillStyle = util.rgba('#ffffff', 0.7 * alpha);
      ctx.beginPath();
      ctx.ellipse(-size * 0.14, -size * 0.44, size * 0.16, size * 0.09, -0.5, 0, TAU);
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
