/* =====================================================================
   TTK Intro — icons.js
   ---------------------------------------------------------------------
   The moon backdrop. Uses the supplied photographic lunar-surface image
   (moon.png) drawn cover-fit behind the scene. The image already contains
   the starry sky, horizon and surface, so the letters simply drop and land
   on the foreground surface.

   Exposes horizonY() / surfaceY() as screen fractions the scene director
   uses to place the stars-free sky line and the letter landing height.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const Moon = {
    img: null,
    ready: false,
    _w: 0, _h: 0,

    /* Kick off loading immediately (well before the user taps to start). */
    load() {
      if (this.img) return;
      this.img = new Image();
      this.img.onload = () => { this.ready = true; };
      this.img.src = 'moon.png';
    },

    /* Draw the photo cover-fit (fills the viewport, centred, no distortion). */
    draw(ctx, w, h) {
      this._w = w; this._h = h;
      if (!this.ready) return;
      const iw = this.img.width, ih = this.img.height;
      const s = Math.max(w / iw, h / ih);
      const dw = iw * s, dh = ih * s;
      ctx.drawImage(this.img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    },

    /* Sky/surface reference lines (screen fractions tuned to the photo). */
    horizonY() { return (this._h || window.innerHeight) * 0.30; },
    surfaceY() { return (this._h || window.innerHeight) * 0.66; }
  };

  TTK.Moon = Moon;

})(window.TTK);
