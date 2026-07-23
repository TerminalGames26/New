# TTK Intro 🌙

A cinematic intro built with nothing but **HTML, CSS, Canvas, JavaScript
and the Web Audio API**. No libraries. No GSAP. No Three.js. No frameworks.
No npm. No build tools. No image or audio assets — everything (the floor,
the letters, the debris and every sound) is generated in code. Just open
the file and it plays.

> A **glossy black floor** reflects the scene under a dark studio backdrop.
> The three **TTK** letters — polished chrome metal — drop in one at a time
> and slam into the floor, each landing with a **boom**, a **dust puff**, a
> burst of **flying pebbles** and a **cracked crater** punched into the
> surface. It settles into the finished logo with a metal shine, then
> **“Join TTK Today — .gg/ttk”** fades in over the reflection.

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
| **Floor** | A smooth fade reveals the glossy black floor with its reflective sheen and horizon edge. |
| **Drops** | The three chrome-metal letters drop from above, one at a time at a steady pace, stretching as they accelerate. |
| **Impact** | Each letter slams into the floor: a landing **boom**, a **dust puff**, a burst of **flying pebbles**, a **cracked crater** punched into the surface, an expanding shockwave ring, a squash-and-settle bounce and a camera shake. |
| **Logo** | TTK stands assembled on the floor (mirrored in the gloss); a metal shine sweeps across it. |
| **Outro** | *“Join TTK Today / .gg/ttk”* fades in. |

---

## 🗂 Project structure

```
TTK_Intro/
├── index.html      Page structure, canvas + overlays, script load order
├── style.css       Night-sky background, outro text, start/replay/mute UI
├── particles.js    Shared math/easing utils + particle engine (moon dust)
├── icons.js        The glossy black floor renderer
├── logo.js         Programmatic silver-metal 3D bubble letters (glowing edge)
├── audio.js        Fully procedural sound + night-sky background music
├── script.js       Main orchestrator: timeline, drops, shockwaves, render
└── README.md       This file
```

Load order matters: `particles.js` loads first because it establishes the
global `TTK` namespace and the shared math/easing helpers (`TTK.util`).

---

## 🔧 How it works

### The floor, craters & pebbles
- **Floor (`icons.js`):** a dark reflective gradient with a soft central
  sheen and a bright glossy horizon edge.
- **Reflection:** the letters are re-drawn mirrored below the horizon,
  faded and blended into the floor, for the glossy mirror look.
- **Craters:** each impact punches a persistent flattened crater with
  procedurally generated radial **cracks** into the floor.
- **Pebbles:** each impact throws a burst of little dark rocks that fly out,
  fall under gravity and **bounce** to rest on the floor (plus a light dust
  puff from the particle system).

### The letters (`logo.js`)
Not text. Each letter is thick round-capped stroke segments rendered in
layered passes — contact shadow, a dark 3D **extruded bevel**, a polished
**chrome face** and a crisp top-edge highlight — then baked to a bitmap and
dropped / squashed / faded as one unit.

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
