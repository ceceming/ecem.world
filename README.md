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
  rise:   { amplitude: 0.100, period:  8.8, phase: 0.0 },  // up and down
  sway:   { amplitude: 0.045, period: 19.6, phase: 1.7 },  // side to side
  turn:   { amplitude: 12.0,  period: 14.1, phase: 0.0 },  // left and right
  tilt:   { amplitude: 4.5,   period: 16.3, phase: 2.2 },  // lean
  nod:    { amplitude: 3.2,   period: 10.2, phase: 0.9 },  // toward and away
  breath: { amplitude: 0.010, period:  7.4, phase: 0.4 },  // barely-there scale
};
```

Six sine waves, each on its own period, added together. Amplitudes are
fractions of the glyph's height; the three rotations are degrees; periods are
seconds. **Longer period = slower and calmer. Larger amplitude = travels
further.**

There is no cycle and no sequence — no hop, no landing, nothing that starts
or finishes. Because every channel is a plain sine, position, velocity and
acceleration are continuous everywhere, so there is no frame at which
anything snaps or accelerates. In practice the glyph moves about 30px up and
down and 9px side to side, turning through 24 degrees, at a sixth of a pixel
per frame.

**To make it more or less noticeable, change the amplitudes, not the
periods.** A sine's peak speed is `amplitude x 2*PI / period`, and below
roughly 5px/s the eye stops registering movement at all — which is what
happened at the first attempt. Raising amplitude buys visible travel while
keeping the motion unhurried; shortening the period buys the same speed by
making it hurry.

The periods share no useful common multiple, so the combined motion takes
weeks to come back around. They are also chosen so no two sit near a ratio
the eye reads as "these move together" — 1:1, 5:4, 4:3, 3:2, 5:3, 2:1 — with
every pair at least 3.4% clear. If you retune a period, check it has not
landed on one of those against another channel, or those two will lock and
the drift will start to look like a loop.

Respects `prefers-reduced-motion` (holds still) and pauses when the tab is in
the background — and because elapsed time is accumulated rather than read off
the clock, returning to a backgrounded tab resumes exactly where it left off.

## Changing how big the glyph looks

One line, at the top of `index.html`:

```css
--stage: min(42vmin, 205px);
```

That is the only size knob. The glyph is currently deliberately small —
about 130px tall on a laptop. Raise the `205px` for a bigger glyph, lower it
for a smaller one; the `42vmin` caps it on short or narrow screens so it
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
