# TTK Intro ✨

A soft, glossy, magical **60 FPS intro animation** built with nothing but
**HTML, CSS, Canvas, SVG-style path drawing, JavaScript and the Web Audio
API**. No libraries. No GSAP. No Three.js. No frameworks. No npm. No build
tools. Just open the file and it plays.

> Aesthetic: rounded glossy **bubble letters**, pastel pinks, white shine,
> bloom, sparkles, floating glitter and soft magical lighting. The `TTK`
> logo is drawn entirely in code — the first **T** leans slightly to the
> right — and every sound is synthesised procedurally at runtime.

---

## ▶️ Running it

1. Open **`index.html`** in any modern browser (Chrome, Edge, Firefox,
   Safari). No server, install or build step is required.
2. Click **“Tap to Enter”**. The single click is only there to unlock the
   Web Audio API (browsers block audio until a user gesture) and to start
   everything perfectly in sync.
3. Enjoy the show. A **Replay ✨** button appears at the end, and a mute
   toggle sits in the top-right corner.

Opening `index.html` directly from disk (`file://`) works — the scripts are
plain classic scripts (no ES modules) specifically so there are no CORS
issues.

---

## 🎬 The sequence

| Phase | What happens |
| ----- | ------------ |
| **Intro** | Floating sparkles + glowing particles. The three glossy `TTK` letters slide in from three directions with tiny particle trails. The camera slowly zooms, bloom rises, and the logo settles with a small pulse. |
| **Transition** | The logo dissolves into glitter, particles wipe the screen, and a soft pink gradient background fades in. |
| **Creators** | A large glowing white ⭐ pops into the middle, slides left, and *“Some Amazing Creators”* fades in beside it. |
| **Developers** | The star gives way to a white verified-style check badge — *“Popular Developers.”* |
| **Community** | The badge gives way to a white group icon — *“Amazing Community Members.”* |
| **Spiral** | All icons fly into the centre and orbit. The orbit speeds up, the spiral tightens, the camera zooms and particle count climbs into an elegant magical explosion of sparkles, glitter, stars, tiny glowing hearts and dust. |
| **Outro** | The explosion reforms into the big glossy pastel-pink `TTK` logo with soft bloom and floating sparkles. Bottom text fades in: *“Join TTK Community Today — .gg/ttk,”* holds, then fades out. |

---

## 🗂 Project structure

```
TTK_Intro/
├── index.html      Page structure, canvas + overlays, script load order
├── style.css       Backgrounds, captions, start/replay/mute UI
├── particles.js    Shared math/easing utils + high-performance particle engine
├── icons.js        Glossy star / verified badge / group icons (canvas)
├── logo.js         Programmatic glossy rounded bubble-letter TTK logo
├── audio.js        Fully procedural Web Audio API sound design
├── script.js       Main orchestrator: timeline, camera, bloom, render loop
└── README.md       This file
```

Load order matters: `particles.js` loads first because it establishes the
global `TTK` namespace and the shared math/easing helpers (`TTK.util`) that
every other module uses.

---

## 🔧 How it works

### Rendering & performance
- A **single `requestAnimationFrame` loop** with a delta-time clamp so a
  dropped/backgrounded frame never causes a jump or “snap”.
- **Object-pooled particles** — no per-frame allocation, so no GC hitches.
- Particle visuals are **pre-baked into offscreen sprite canvases** and
  blitted with `drawImage()` under an additive (`lighter`) blend, which is
  fast and gives the soft magical glow.
- A **half-resolution bloom post-pass** (downsample → blur → additive
  composite) provides the dreamy glow without tanking the framerate.
- A **smoothly interpolated camera** (framerate-independent exponential
  smoothing) handles all zooms and the tasteful explosion nudge.

### Motion / easing
Everything uses smooth interpolation. Implemented easing includes
`easeOutExpo`, `easeInOutCubic`, `easeOutCubic`, `easeOutBack`,
`easeOutElastic` and a full **cubic-bezier(0.22, 1, 0.36, 1)** evaluator
(Newton-Raphson solved) for that “expensive” feel. Motion blur is
simulated via velocity-based particle streaks plus the bloom pass.

### The logo
Not text. Each letter is defined as thick round-capped stroke segments in a
normalised unit box and rendered in layered passes — outer glow, dark depth
base, gradient body, inner specular streak, top rim highlight and bottom
reflection — to fake convincing 3D gloss. The same geometry is sampled into
points to dissolve the logo into glitter and to reform it in the outro.

### Audio
Every sound is generated at runtime with oscillators, filtered noise and
gain envelopes — **no audio files**: soft whoosh, sparkle, magic chime,
soft pop, glitter, ascending sweep, magical explosion and a final shimmer,
plus a quiet evolving ambient pad bed. Cues are fired from the timeline so
sound and visuals stay in sync.

---

## 🎨 Customising

- **Timing:** every scene boundary is a value in the `T` object at the top
  of `script.js`. Change one number to re-time a beat.
- **Colours:** the pastel palette lives in `TTK.PALETTE` (`particles.js`)
  and as CSS variables in `:root` (`style.css`).
- **Logo shape / letters:** edit `GEOMETRY` and the `letters` layout in
  `logo.js`.
- **Particle counts / density:** tune the emitter calls in `script.js` and
  the pool size passed to `new TTK.ParticleSystem(...)`.

---

## 📦 Requirements

A modern browser with Canvas 2D, `CanvasRenderingContext2D.filter` (for
bloom) and the Web Audio API — i.e. any current version of Chrome, Edge,
Firefox or Safari. No network connection is needed after loading.

*All artwork, characters and sounds are original and generated in code.*
