# ecem.world

Portfolio site. Right now it is a coming-soon page: a 3D object hopping on a
black field with "coming soon" underneath.

**Start here:** [`DOMAIN-SETUP.md`](DOMAIN-SETUP.md) — publishing this on
GitHub Pages and pointing the GoDaddy domain at it.

**Adding your model:** [`model/README.md`](model/README.md) — drop the Meshy
export into `/model` and it appears on the page. Until then a placeholder
shape hops in its place, so the site is never broken.

## What is here

| | |
|---|---|
| `index.html` | The coming-soon page: black, Helvetica, object centred |
| `model.html` | The same object on a fully transparent background, on its own |
| `assets/scene.js` | The 3D scene and the whole animation |
| `model/` | Where your Meshy export goes |
| `qr/index.html` | A printable QR code page → [ecem.world/qr/](https://ecem.world/qr/) |
| `assets/qr/` | The QR code as SVG and PNG, in three styles |
| `vendor/three/` | three.js r160, committed here on purpose (see below) |
| `CNAME` | Tells GitHub Pages the site lives at `ecem.world` |

Everything is static files. There is no build step, nothing to install, and
no npm. Editing a file on github.com and committing is a deploy.

## The animation

Defined once, at the top of `assets/scene.js`:

```js
const CHOREO = {
  smallHopsPerCycle: 5,
  smallHop: { duration: 0.62, height: 0.30, ... },
  dance:    { duration: 1.90, yaw: 24, wiggles: 2, ... },
  bigHop:   { duration: 1.25, height: 1.15, ... },
};
```

Five small hops, a little right-and-left dance, one big hop, repeat — a
6.6 second loop. Raise `height` for bouncier, raise `yaw` for a wilder dance,
lower `duration` for faster. Every hop gets anticipation, stretch in the air
and a squash on landing, which is what makes it read as alive rather than as
a bouncing ball.

Respects `prefers-reduced-motion` (holds still) and pauses when the tab is in
the background.

## Changing how big the object looks

One line, at the top of `index.html`:

```css
--stage: min(60vmin, 340px);
```

That is the only size knob. The object is currently deliberately small. Raise
the `340px` for a bigger object, lower it for a smaller one; the `60vmin`
caps it on short or narrow screens so it never overruns a phone. The spacing
of "coming soon" underneath and the optical centring are both derived from
this value, so they follow along on their own.

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

## If the object does not appear

The words always render, even when the 3D does not. A missing object means
WebGL is unavailable — very old browsers, or Safari with hardware
acceleration off. Open the browser console to see what `assets/scene.js`
logged; it reports which model file it found, or that it fell back to the
placeholder.
