/* =====================================================================
   TTK Intro — icons.js
   ---------------------------------------------------------------------
   Programmatically drawn glossy white icons used by the creator /
   developer / community scenes:

     - Star            (Some Amazing Creators)
     - Verified badge  (Popular Developers)  — original scalloped seal
     - Group / people  (Amazing Community Members)

   Each icon is drawn on the 2D canvas with soft glow, a subtle white
   gradient body and a specular highlight so it reads as glossy and
   "expensive". All icons are drawn centred on (0,0) at a given size so
   the caller only has to translate + scale.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const util = TTK.util;
  const P = TTK.PALETTE;
  const TAU = Math.PI * 2;

  const Icons = {
    /* Shared soft outer glow behind an icon. */
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

    /* Glossy white fill + specular highlight applied to the current path.
       Call after defining a path (path is consumed by fill). */
    _glossFill(ctx, size) {
      const g = ctx.createLinearGradient(0, -size, 0, size);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.5, '#fdf4fb');
      g.addColorStop(1, '#ffe3f3');
      ctx.fillStyle = g;
      ctx.fill();
    },

    /* --------------------------------------------------------------
       STAR — five point glossy star.
       -------------------------------------------------------------- */
    star(ctx, size, alpha, rot) {
      alpha = alpha == null ? 1 : alpha;
      ctx.save();
      ctx.globalAlpha = util.clamp(alpha, 0, 1);
      this._glow(ctx, size * 1.7, alpha, P.softPink);
      ctx.rotate(rot || 0);

      const outer = size, inner = size * 0.44;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? outer : inner;
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();

      // soft drop shadow for depth
      ctx.save();
      ctx.shadowColor = util.rgba(P.deepPink, 0.5 * alpha);
      ctx.shadowBlur = size * 0.5;
      ctx.shadowOffsetY = size * 0.08;
      const body = ctx.createRadialGradient(-size * 0.2, -size * 0.3, 0, 0, 0, outer);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.55, '#fff0f9');
      body.addColorStop(1, '#ffd0ec');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();

      // rim light
      ctx.lineWidth = size * 0.03;
      ctx.strokeStyle = util.rgba('#ffffff', 0.8 * alpha);
      ctx.stroke();

      // specular highlight
      ctx.fillStyle = util.rgba('#ffffff', 0.85 * alpha);
      ctx.beginPath();
      ctx.ellipse(-size * 0.22, -size * 0.3, size * 0.22, size * 0.12, -0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    /* --------------------------------------------------------------
       VERIFIED — scalloped seal badge with a check mark
       (original design inspired by the "verified" motif, not a copy).
       -------------------------------------------------------------- */
    verified(ctx, size, alpha) {
      alpha = alpha == null ? 1 : alpha;
      ctx.save();
      ctx.globalAlpha = util.clamp(alpha, 0, 1);
      this._glow(ctx, size * 1.7, alpha, P.softPink);

      // Scalloped (bumpy) seal outline.
      const bumps = 12;
      const rOut = size, rIn = size * 0.86;
      ctx.beginPath();
      const steps = bumps * 2;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * TAU - Math.PI / 2;
        const rad = i % 2 === 0 ? rOut : rIn;
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();

      ctx.save();
      ctx.shadowColor = util.rgba(P.deepPink, 0.5 * alpha);
      ctx.shadowBlur = size * 0.5;
      ctx.shadowOffsetY = size * 0.08;
      const body = ctx.createRadialGradient(-size * 0.25, -size * 0.3, 0, 0, 0, size);
      body.addColorStop(0, '#ffffff');
      body.addColorStop(0.6, '#fff2fa');
      body.addColorStop(1, '#ffd2ec');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();

      ctx.lineWidth = size * 0.03;
      ctx.strokeStyle = util.rgba('#ffffff', 0.75 * alpha);
      ctx.stroke();

      // Inner tinted disc so the check pops.
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.62, 0, TAU);
      const disc = ctx.createLinearGradient(0, -size * 0.6, 0, size * 0.6);
      disc.addColorStop(0, '#ffd9f0');
      disc.addColorStop(1, '#ff9ed6');
      ctx.fillStyle = disc;
      ctx.fill();

      // Check mark (rounded).
      ctx.lineWidth = size * 0.16;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-size * 0.34, size * 0.02);
      ctx.lineTo(-size * 0.08, size * 0.3);
      ctx.lineTo(size * 0.4, -size * 0.32);
      ctx.stroke();

      // specular highlight sweep
      ctx.fillStyle = util.rgba('#ffffff', 0.5 * alpha);
      ctx.beginPath();
      ctx.ellipse(-size * 0.28, -size * 0.34, size * 0.34, size * 0.16, -0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    /* --------------------------------------------------------------
       GROUP — three glossy person silhouettes.
       -------------------------------------------------------------- */
    _person(ctx, cx, cy, s) {
      // head
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.55, s * 0.42, 0, TAU);
      // body (rounded shoulders)
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
      ctx.save();
      ctx.shadowColor = util.rgba(P.deepPink, 0.45 * alpha);
      ctx.shadowBlur = size * 0.4;
      ctx.shadowOffsetY = size * 0.08;

      // back two people (slightly smaller / tinted)
      const back = ctx.createLinearGradient(0, -size, 0, size);
      back.addColorStop(0, '#ffe9f6');
      back.addColorStop(1, '#ffbfe4');
      ctx.fillStyle = back;
      this._person(ctx, -size * 0.62, -size * 0.05, s * 0.8);
      ctx.fill();
      this._person(ctx, size * 0.62, -size * 0.05, s * 0.8);
      ctx.fill();

      // front centre person (bright glossy)
      const front = ctx.createLinearGradient(0, -size, 0, size);
      front.addColorStop(0, '#ffffff');
      front.addColorStop(0.6, '#fff2fa');
      front.addColorStop(1, '#ffd2ec');
      ctx.fillStyle = front;
      this._person(ctx, 0, size * 0.12, s);
      ctx.fill();
      ctx.restore();

      // rim + specular on the front figure
      ctx.lineWidth = size * 0.025;
      ctx.strokeStyle = util.rgba('#ffffff', 0.7 * alpha);
      this._person(ctx, 0, size * 0.12, s);
      ctx.stroke();

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
