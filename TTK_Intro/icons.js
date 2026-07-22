/* =====================================================================
   TTK Intro — icons.js
   ---------------------------------------------------------------------
   A realistic lunar surface, generated and rendered procedurally.

   Approach (no image assets — pure maths):
     1. Build a tiling HEIGHTFIELD from fractal value-noise, then carve
        hundreds of craters of varying size (each a depressed bowl with a
        raised rim) plus dark "maria".
     2. Bake real diffuse lighting into a grayscale surface map using the
        heightfield normals and a low sun angle (long shadows).
     3. Render it in perspective with a voxel-terrain raycaster so the
        surface recedes to a curved horizon under the black sky, with
        aerial haze fading distant terrain (hides tiling + adds realism).

   The whole surface is baked once into an offscreen bitmap (regenerated
   only on resize), so the per-frame cost is a single drawImage.
   ===================================================================== */

window.TTK = window.TTK || {};

(function (TTK) {
  'use strict';

  const util = TTK.util;

  const N = 512;                 // heightfield resolution (power of two -> fast wrap)
  const MASK = N - 1;

  /* ---- deterministic value noise ---- */
  function hash(ix, iy) {
    let h = (ix * 374761393 + iy * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    const u = smooth(fx), v = smooth(fy);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  function fbm(x, y) {
    let s = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 5; o++) { s += amp * vnoise(x * f, y * f); f *= 2; amp *= 0.5; }
    return s;
  }

  let _seed = 987654321;
  function rnd() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }

  const Moon = {
    horizonFrac: 0.4,
    _H: null, _shade: null,       // heightfield + baked grayscale (Uint8 rgb packed)
    _bitmap: null, _horizonY: 0, _surfaceY: 0,

    /* ---- build the heightfield + baked shaded surface (once) ---- */
    _generate() {
      const H = new Float32Array(N * N);

      // rolling base terrain + finer detail
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          let e = fbm(i * 0.022, j * 0.022) * 0.7
            + fbm(i * 0.08, j * 0.08) * 0.22
            + fbm(i * 0.25, j * 0.25) * 0.08;
          H[j * N + i] = e;
        }
      }

      // craters: a few huge, many tiny
      _seed = 987654321;
      const carve = (count, rmin, rmax, depth) => {
        for (let k = 0; k < count; k++) {
          const cx = rnd() * N, cy = rnd() * N;
          const r = rmin + rnd() * (rmax - rmin);
          const dep = depth * (0.7 + rnd() * 0.6);
          const R2 = (r * 1.4) | 0;
          for (let dy = -R2; dy <= R2; dy++) {
            for (let dx = -R2; dx <= R2; dx++) {
              const d = Math.hypot(dx, dy) / r;
              if (d > 1.4) continue;
              const ix = (Math.floor(cx + dx)) & MASK;
              const iy = (Math.floor(cy + dy)) & MASK;
              const rim = Math.exp(-((d - 1.0) / 0.16) * ((d - 1.0) / 0.16)) * dep * 0.5;
              const bowl = d < 1 ? -dep * (1 - d * d) : 0;
              H[iy * N + ix] += bowl + rim;
            }
          }
        }
      };
      carve(5, N * 0.11, N * 0.2, 0.55);
      carve(16, N * 0.05, N * 0.1, 0.42);
      carve(55, N * 0.02, N * 0.05, 0.3);
      carve(230, N * 0.006, N * 0.02, 0.22);

      // normalise 0..1
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < N * N; i++) { if (H[i] < mn) mn = H[i]; if (H[i] > mx) mx = H[i]; }
      const inv = 1 / (mx - mn);
      for (let i = 0; i < N * N; i++) H[i] = (H[i] - mn) * inv;

      // albedo (maria darker, speckle)
      const alb = new Float32Array(N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          let base = 0.62;
          const m = fbm(i * 0.006 + 40, j * 0.006 + 40);
          if (m < 0.44) base = util.lerp(0.4, 0.62, m / 0.44);   // maria
          base += (hash(i * 7, j * 13) - 0.5) * 0.06;             // speckle
          alb[j * N + i] = util.clamp(base, 0.2, 0.85);
        }
      }

      // bake diffuse shading (sun low from the left)
      const shade = new Uint8ClampedArray(N * N);
      const relief = 42;                 // vertical exaggeration for normals
      let lx = -0.72, ly = -0.45, lz = 0.53;
      const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const hL = H[j * N + ((i - 1) & MASK)], hR = H[j * N + ((i + 1) & MASK)];
          const hU = H[((j - 1) & MASK) * N + i], hD = H[((j + 1) & MASK) * N + i];
          let nx = (hL - hR) * relief, ny = (hU - hD) * relief, nz = 1;
          const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          let diff = nx * lx + ny * ly + nz * lz;
          if (diff < 0) diff = 0;
          const s = 0.1 + 1.05 * diff;                   // ambient + diffuse
          shade[j * N + i] = alb[j * N + i] * s * 255;
        }
      }

      this._H = H; this._shade = shade;
    },

    /* ---- perspective ground-plane render (floor casting) into a bitmap ----
       For every screen pixel below the horizon we project back onto the
       flat lunar plane, bilinear-sample the baked shaded surface and apply
       aerial haze. Smooth (filtered) and fast — no voxel blocks. */
    render(w, h) {
      if (!this._shade) this._generate();
      const scale = 0.8;
      const rw = Math.max(2, Math.round(w * scale));
      const rh = Math.max(2, Math.round(h * scale));
      const horizon = Math.round(rh * this.horizonFrac);
      const cv = document.createElement('canvas');
      cv.width = rw; cv.height = rh;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(rw, rh);
      const data = img.data;
      const shade = this._shade;

      const focal = rh * 0.9;
      const camH = 1.75;         // camera height above the plane
      const camZ = 0.5;          // forward offset into the texture
      const TS = 15;             // texels per world unit (crater scale)
      const hz = [20, 25, 40];   // haze colour toward the horizon
      const cx = rw / 2;

      for (let y = horizon; y < rh; y++) {
        const p = y - horizon + 0.0001;
        const worldZ = camH * focal / p;
        const rowScaleX = worldZ / focal;
        const fog = util.clamp((worldZ - 2.2) / 55, 0, 1);
        const fogp = fog * fog;
        const vtex = (worldZ + camZ) * TS + N * 0.13;
        const vy0 = Math.floor(vtex), fyv = vtex - vy0;
        const r0 = (vy0 & MASK) * N, r1 = ((vy0 + 1) & MASK) * N;
        let row = y * rw;
        for (let x = 0; x < rw; x++) {
          const worldX = (x - cx) * rowScaleX;
          const utex = worldX * TS + N * 0.5;   // shift wrap seam off-centre
          const ux0 = Math.floor(utex), fxu = utex - ux0;
          const c0 = ux0 & MASK, c1 = (ux0 + 1) & MASK;
          const a = shade[r0 + c0], b = shade[r0 + c1];
          const c = shade[r1 + c0], d = shade[r1 + c1];
          const g = (a * (1 - fxu) + b * fxu) * (1 - fyv) + (c * (1 - fxu) + d * fxu) * fyv;
          const o = (row + x) * 4;
          data[o] = g + (hz[0] - g) * fogp;
          data[o + 1] = g + (hz[1] - g) * fogp;
          data[o + 2] = g + (hz[2] - g) * fogp;
          data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);

      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.drawImage(cv, 0, 0, w, h);

      this._bitmap = out;
      this._horizonY = horizon / scale;
      this._surfaceY = h * 0.74;      // where the letters land (near foreground)
    },

    draw(ctx) { if (this._bitmap) ctx.drawImage(this._bitmap, 0, 0); },
    horizonY() { return this._horizonY; },
    surfaceY() { return this._surfaceY; }
  };

  TTK.Moon = Moon;

})(window.TTK);
