# TTK Intro 🌙

A cinematic **night-sky / moon** intro built with nothing but **HTML, CSS,
Canvas, JavaScript and the Web Audio API**. No libraries. No GSAP. No
Three.js. No frameworks. No npm. No build tools. The only asset is the
`moon.png` backdrop photo; the letters and every sound are generated
procedurally in code. Just open the file and it plays.

> A photographic **lunar surface** (`moon.png`) stretches to the horizon
> under a starry sky. The three **TTK** letters — brushed silver
> metal with a glowing white edge — drop in one at a time and slam into the
> moon, each landing with a **boom**, a **moon-dust plume** and an
> **expanding collision shockwave**. It settles into the finished logo with
> a metal shine, then **“Join TTK Today — .gg/ttk”** fades in.

---

## ▶️ Running it

1. Open **`index.html`** in any modern browser (Chrome, Edge, Firefox,
   Safari). No server, install or build step is required.
2. Click **“Tap to Enter”**. The single click only unlocks the Web Audio
   API (browsers block audio until a user gesture) and starts everything in
   sync.
3. A **Replay** button appears at the end; a mute toggle sits top-right.

Opening `index.html` directly from disk (`file://`) works — the scripts are
plain classic scripts (no ES modules) so there are no CORS issues.

---

## 🎬 The sequence

| Phase | What happens |
| ----- | ------------ |
| **Sky** | A smooth fade reveals the dark starry sky and the realistic cratered moon surface receding to the horizon. |
| **Drops** | The three glossy silver-metal letters drop from above, one at a time at a steady pace, stretching as they accelerate. |
| **Impact** | Each letter slams into the moon: a landing **boom**, a **moon-dust plume**, an **expanding shockwave ring** across the surface, a squash-and-settle bounce and a small camera shake. |
| **Logo** | TTK stands assembled on the moon; a bright metal shine sweeps across it. |
| **Outro** | *“Join TTK Today / .gg/ttk”* fades in. |

---

## 🗂 Project structure

```
TTK_Intro/
├── index.html      Page structure, canvas + overlays, script load order
├── style.css       Night-sky background, outro text, start/replay/mute UI
├── particles.js    Shared math/easing utils + particle engine (moon dust)
├── icons.js        Moon backdrop (loads + cover-fits moon.png)
├── moon.png        Photographic lunar-surface backdrop
├── logo.js         Programmatic silver-metal 3D bubble letters (glowing edge)
├── audio.js        Fully procedural sound + night-sky background music
├── script.js       Main orchestrator: timeline, drops, shockwaves, render
└── README.md       This file
```

Load order matters: `particles.js` loads first because it establishes the
global `TTK` namespace and the shared math/easing helpers (`TTK.util`).

---

## 🔧 How it works

### The moon (`icons.js`)
The backdrop is the supplied photographic lunar-surface image (`moon.png`),
loaded once and drawn **cover-fit** (fills the viewport, centred, no
distortion) behind the scene. The photo already contains the sky, stars,
horizon and distant Earth, so the letters simply drop and land on the
foreground surface. `horizonY()` / `surfaceY()` expose the screen fractions
the scene director uses to place the landing height.

### The letters (`logo.js`)
Not text. Each letter is thick round-capped stroke segments rendered in
layered passes — outer white glow, contact shadow, a dark 3D **extruded
bevel**, a **glowing white edge**, the **brushed-silver face** and top
specular — then baked to a bitmap and dropped / squashed / faded as one unit.

### Motion & polish (`script.js`)
- One `requestAnimationFrame` loop with a delta-time clamp (no jank).
- Letters fall on accelerating easing, then **squash-and-settle** on impact.
- **Collision shockwaves** expand as flattened rings across the surface.
- Object-pooled **moon-dust** particles, an interpolated camera with impact
  shake, a twinkling starfield and a subtle additive bloom pass.

### Audio (`audio.js`)
Everything is synthesised live and sent through a procedural reverb: a
falling **whoosh** per drop, a deep **landing boom**, sparkles and a final
shimmer, plus a slow, moody **background music** bed (a night-sky chord
progression with pad, sub bass and sparse bell accents) whose intensity is
driven by the timeline.

---

## 🎨 Customising

- **Timing:** the `T` object at the top of `script.js` holds the drop times
  and pacing (`fallDur`, `dropStart`).
- **Moon:** tune crater counts, sun angle and camera in `icons.js`
  (`_generate` and `render`).
- **Letters:** colours/gloss live in `logo.js` (`_drawLetter`).
- **Music:** progression, tempo and mood live in `audio.js` (`PROG`, `bpm`).

*All artwork and sound are original and generated in code.*
