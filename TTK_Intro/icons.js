/* =====================================================================
   TTK Intro — icons.js
   ---------------------------------------------------------------------
   The glossy black floor the letters land on. A dark reflective plane in
   the lower part of the frame with a soft sheen and a bright glossy edge
   at the horizon line. Reflections, impact craters/cracks and pebbles are
   drawn by the scene director on top of this.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const Floor = {
    /* Draw the glossy black floor from `floorY` down to the bottom. */
    draw(ctx, w, h, floorY) {
      const fh = h - floorY;

      // Base floor gradient (near-black, slightly lifted near the horizon).
      const g = ctx.createLinearGradient(0, floorY, 0, h);
      g.addColorStop(0, '#16171c');
      g.addColorStop(0.22, '#0b0c10');
      g.addColorStop(1, '#040405');
      ctx.fillStyle = g;
      ctx.fillRect(0, floorY, w, fh);

      // Soft central sheen (the "glossy" reflection of the light).
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const sheen = ctx.createRadialGradient(w / 2, floorY + fh * 0.12, 0, w / 2, floorY + fh * 0.12, w * 0.55);
      sheen.addColorStop(0, 'rgba(120,140,175,0.12)');
      sheen.addColorStop(1, 'rgba(120,140,175,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, floorY, w, fh);
      ctx.restore();

      // Bright glossy edge along the horizon line.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const edge = ctx.createLinearGradient(0, floorY - 3, 0, floorY + 10);
      edge.addColorStop(0, 'rgba(190,200,220,0)');
      edge.addColorStop(0.4, 'rgba(190,200,220,0.35)');
      edge.addColorStop(1, 'rgba(190,200,220,0)');
      ctx.fillStyle = edge;
      ctx.fillRect(0, floorY - 3, w, 13);
      ctx.restore();
    }
  };

  TTK.Floor = Floor;

})(window.TTK);
