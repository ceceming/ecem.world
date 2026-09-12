# ecem.world

Portfolio site. Right now it is a coming-soon page: a 3D chrome "e" monogram
drifting on a black field with "coming soon" underneath.

**Start here:** [`DOMAIN-SETUP.md`](DOMAIN-SETUP.md) — publishing this on
GitHub Pages and pointing the GoDaddy domain at it.

**The model:** [`model/README.md`](model/README.md) — the chrome "e" is in
place and live. Read this before replacing it: the raw Meshy export was
11.8 MB and was optimised down to 516 KB.

## What is here

| | |
|---|---|
| `index.html` | The coming-soon page: black, Helvetica, glyph centred |
| `model.html` | The same glyph on a fully transparent background, on its own |
| `assets/scene.js` | The 3D scene and the whole animation |
| `model/` | `model.glb` — the chrome "e", optimised for the web |
| `qr/index.html` | A printable QR code page → [ecem.world/qr/](https://ecem.world/qr/) |
| `assets/qr/` | The QR code as SVG and PNG, in three styles |
| `vendor/three/` | three.js r160, committed here on purpose (see below) |
| `CNAME` | Tells GitHub Pages the site lives at `ecem.world` |

Everything is static files. There is no build step, nothing to install, and
no npm. Editing a file on github.com and committing is a deploy.

## The animation

Defined once, at the top of `assets/scene.js`:

```js
const DRIFT = {
  rise:   { amplitude: 0.042, period:  9.3, phase: 0.0 },  // up and down
  sway:   { amplitude: 0.020, period: 19.7, phase: 1.7 },  // side to side
  turn:   { amplitude: 7.5,   period: 13.1, phase: 0.0 },  // left and right
  tilt:   { amplitude: 2.4,   period: 17.3, phase: 2.2 },  // lean
  nod:    { amplitude: 1.8,   period: 11.6, phase: 0.9 },  // toward and away
  breath: { amplitude: 0.005, period:  8.1, phase: 0.4 },  // barely-there scale
};
```

Six sine waves, each on its own period, added together. Amplitudes are
fractions of the glyph's height; the three rotations are degrees; periods are
seconds. **Longer period = slower and calmer. Larger amplitude = travels
further.**

There is no cycle and no sequence — no hop, no landing, nothing that starts
or finishes. Because every channel is a plain sine, position, velocity and
acceleration are continuous everywhere, so there is no frame at which
anything snaps or accelerates. In practice the glyph moves about 14px up and
down and 3px side to side, at a quarter of a pixel per frame.

The periods share no useful common multiple, so the combined motion takes
weeks to come back around. There is no loop for the eye to catch.

Respects `prefers-reduced-motion` (holds still) and pauses when the tab is in
the background — and because elapsed time is accumulated rather than read off
the clock, returning to a backgrounded tab resumes exactly where it left off.

## Changing how big the glyph looks

One line, at the top of `index.html`:

```css
--stage: min(40vmin, 190px);
```

That is the only size knob. The glyph is currently deliberately small —
about 130px tall on a laptop. Raise the `190px` for a bigger glyph, lower it
for a smaller one; the `40vmin` caps it on short or narrow screens so it
never overruns a phone. The gap to "coming soon" underneath is derived from
this value, so it follows along on its own.

Model files themselves need no scaling — whatever you upload is measured and
fitted automatically.

## Why three.js is committed to the repo

`vendor/three/` holds a copy of three.js rather than loading it from a CDN.
The site then has no third-party dependency at runtime: nothing to go down,
nothing to change under you, and no request to anyone else's server when
someone opens your page. It is ~1.4 MB of files you never have to think about.

## Working on it locally

Open a terminal in this folder and run any static server — the page uses ES
modules, so opening `index.html` directly with `file://` will not work:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## If the glyph does not appear

The words always render, even when the 3D does not. A missing glyph means
WebGL is unavailable — very old browsers, or Safari with hardware
acceleration off. Open the browser console to see what `assets/scene.js`
logged; it reports which model file it found, or that it fell back to the
placeholder.
