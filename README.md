# ecem.world

Portfolio site: a pinned panel (the drifting chrome "e", the bio, an index of
the work, the contact menu) beside a feed of projects, standalone images and
writing. The old coming-soon page is kept at `coming-soon.html`.

## Changing CSS or JavaScript: bump the version

`index.html` and `studio/index.html` load their stylesheet and script as
`site.css?v=20261014a`. GitHub Pages tells browsers to keep files for 10
minutes, and phones often keep them longer, so a new page could arrive with
an old stylesheet and script — new buttons, old behaviour. **Whenever
`assets/site.*` or `studio/studio.*` changes, change the `?v=` value** (any
new value works; the date plus a letter is the convention).

## Content, and the studio

Nothing about the work is hard-coded. The site is drawn from three files:

| File | What it holds | Who writes it |
|---|---|---|
| `content/posts.json` | Every project, image and writing entry, **in site order** | The studio |
| `content/site.json` | Name, bio, "currently", email, Substack settings | The studio |
| `content/substack.json` | The luckbug Substack posts | `.github/workflows/substack.yml`, hourly |
| `media/<post id>/` | Images, GIFs, videos and video posters | The studio |

**[`/studio/`](https://ecem.world/studio/)** is where content is seen, ordered
and filled in. It is a static page that talks to the GitHub API with a
fine-grained token kept in the browser — no server, no database, no account
anywhere else. It needs a token with **Contents: Read and write** on this repo
(and **Actions: Read and write** for its "Check Substack now" button); the
sign-in screen says how to make one. Every **Publish** is one commit; Pages
puts it live about a minute later.

- **Tools** (fourth kind): a vibe-coded design tool, shown like a project with
  *Try it ↗* / *Source ↗* links, an optional *Try it here* that runs the tool
  inside its page (loaded only on click), and a *How it was made* section.
  The Textures Studio is copied into `tools/textures/` from the private repo
  `ceceming/my-own-texture-studio` (its `docs/index.html`, one self-contained
  file) — re-copy it when that tool changes.
- **Three kinds of entry.** *Project* (any number of images, GIFs, MP4s or
  Vimeo/YouTube links; the first three show in the feed, all of them in the
  opened project), *Image* (one standalone piece, small or large), and
  *Writing* (written here, or a Substack post placed in the feed).
- **Client is private.** A project's Client field is kept in the studio for
  your records and never shown on the site.
- **Three statuses.** *Live* is on the site. *Draft* and *Archived* stay in
  `posts.json` but are never shown. The repo is public, so drafts are
  readable on GitHub by anyone who looks — accepted.
- **Uploads are processed in the browser.** Photos are resized to 2400px on
  the long edge and saved as WebP. Video is stored as is (keep it under
  25 MB; GitHub refuses 100 MB); a poster frame is grabbed automatically.
- **Preview** opens the real site fed the studio's unpublished copy, drafts
  included and badged. It updates as you type.
- **Unpublished text survives a closed tab** (kept in the browser);
  unpublished *files* do not, and the studio says so.
- `/studio/?branch=name` works on another branch, to try things safely.

**Substack** is pulled hourly by the workflow (`tools/sync-substack.mjs`, no
dependencies). Posts are merged, never removed, so older posts stay after
they fall off the RSS feed. On the studio's Substack tab each post can be
hidden, opened in full here instead of on Substack, or added to the main feed.

**What we decided and why** lives in a separate, private repo,
`ceceming/ecem-world-notes` (`PROJECT-LOG.md` and `REFERENCE-STUDY.md`).
Read it before changing anything that looks arbitrary; most of it is not.
This repo is public, so working notes, drafts and anything under NDA go
there, never here.

**Start here:** [`DOMAIN-SETUP.md`](DOMAIN-SETUP.md) — publishing this on
GitHub Pages and pointing the GoDaddy domain at it.

**The model:** [`model/README.md`](model/README.md) — the chrome "e" is in
place and live. Read this before replacing it: the raw Meshy export was
11.8 MB and was optimised down to 516 KB.

## What is here

| | |
|---|---|
| `index.html` | The portfolio — `assets/site.css`, `assets/site.js` |
| `coming-soon.html` | The previous coming-soon page, kept |
| `studio/` | The private editor for `content/` (see above) |
| `model.html` | The same glyph on a fully transparent background, on its own |
| `assets/scene.js` | The 3D scene and the whole animation |
| `model/` | `model.glb` — the chrome "e", optimised for the web |
| `qr/index.html` | A printable QR code page → [ecem.world/qr/](https://ecem.world/qr/) |
| `assets/qr/` | The QR code as SVG and PNG, in three styles |
| `cv/index.html` | The CV viewer → [ecem.world/cv/](https://ecem.world/cv/) |
| `assets/cv-source.html` | **The CV itself.** Edit this, never the PDF |
| `assets/ecem-ozturk-cv.pdf` | Built from the above — the file people download |
| `assets/cv-page-*.webp` | Built from the above — what the viewer shows |
| `assets/cv-links.json` | Built from the above — where the viewer puts live links |
| `tools/build-cv.sh` | Rebuilds those three from the source |
| `vendor/three/` | three.js r160, committed here on purpose (see below) |
| `CNAME` | Tells GitHub Pages the site lives at `ecem.world` |

The site is static files: editing one on github.com and committing is a
deploy. The one exception is the CV — three of the files above are generated,
and changing the CV means editing its source and re-running the build. See
[The CV](#the-cv).

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
down and 10px side to side, turning through 24 degrees, and rises and falls
once every 5.5 seconds — a quarter of a pixel per frame, against roughly
10px per frame for a bouncing-ball animation.

Two different complaints, two different knobs:

- **Reads as a still image** → raise the **amplitudes**. Below roughly 5px/s
  on screen the eye stops registering movement at all, and more travel is
  what fixes that.
- **Reads as slow motion** → raise **`TEMPO`**, just below the block. It
  multiplies the speed of every channel at once. Amplitude cannot fix this:
  a bigger but equally unhurried movement still looks like footage played
  slowly.

`TEMPO` is also the safe way to change the pace. Because it scales every
period by the same factor, the ratios between them are untouched, so no
amount of tempo change can push two channels into a lock. Editing the six
periods by hand can.

The periods share no useful common multiple, so the combined motion takes
weeks to come back around. They are also chosen so no two sit near a ratio
the eye reads as "these move together" — 1:1, 5:4, 4:3, 3:2, 5:3, 2:1 — with
every pair at least 3.4% clear. If you retune an individual period, check it
has not landed on one of those against another channel, or those two will
lock and the drift will start to look like a loop.

Respects `prefers-reduced-motion` (holds still) and pauses when the tab is in
the background — and because elapsed time is accumulated rather than read off
the clock, returning to a backgrounded tab resumes exactly where it left off.

## The CV

`assets/cv-source.html` is the document. The PDF people download and the two
images the viewer shows are both generated from it:

```sh
tools/build-cv.sh
```

Editing the PDF directly, or editing the images, gets overwritten the next
time anyone runs that. Edit the HTML.

### What the build checks

It refuses to overwrite the committed files unless all of this holds:

- **Exactly two pages.** The layout is tuned to fill two and no more. A third
  page means something was added without making room — fix the source rather
  than shipping it. (This is also why the source uses flowed pagination
  instead of fixed-height page boxes: a fixed box with `overflow: hidden`
  would have swallowed the extra line silently.)
- **No home address and no personal phone number** anywhere in the PDF's text
  layer. Both were in the original Word document and are deliberately gone;
  the CV gives "Toronto, ON" and an email. This check is the thing that stops
  them coming back.
- **The text layer reads correctly.** Name, role titles, employers, dates and
  bullets all have to extract as running text — see below.
- The page images actually rendered and are not blank.
- The PDF still **has** hyperlinks, including the mailto — the viewer's live
  links are built from them, so losing them would quietly break the page.

It also sets the PDF's document metadata (title, author, keywords), so a
parser reading the document properties gets a clean name.

### Live links on the site

The viewer shows flat images, so the PDF's hyperlinks do not survive onto
the page — someone reading the CV at ecem.world/cv/ without downloading it
would have nothing to click. The build reads the real link rectangles back
out of the PDF it just produced and writes them to `assets/cv-links.json` as
percentages of the page; the viewer fetches that and lays transparent
hotspots over the image.

Doing it this way rather than measuring the picture by hand is the point:
the hotspots move when the layout moves. If the fetch fails the page is just
what it was before, an image and a download button.

`ecem.world` and `LinkedIn` open in a new tab, captioned with where they
actually go. **The email copies instead of opening a mail app**, which is
not guessable, so it says "click to copy" on hover and confirms with
"copied hello@ecem.world".

Touch has no hover, so the caption rides the press — it appears on
finger-down and the copy happens on lift. A permanent caption was tried and
removed: the page image scales down with the window but a legible bubble
does not, so at phone width it sat across her name. For the same reason the
`:hover` rules are inside `@media (hover: hover)` — an unscoped `:hover`
sticks after a tap on a touch screen and would park the bubble there anyway.

If the clipboard is unavailable (an insecure context, an old browser) the
button falls back to `mailto:` rather than doing nothing.

### Typography

No colour anywhere: black, one grey for secondary text, and hairlines. One
typeface, two weights. Hierarchy comes from size, case, tracking and space.

The Helvetica stack matches the rest of the site. Arial and Liberation Sans
are metric-compatible with Helvetica, so **the line breaks hold whichever of
the three a machine has** — the layout is the same if you open the source on
a Mac and re-print it there in real Helvetica.

### Why the name is tracked less than it looks like it should be

Past a certain letter-spacing, a PDF emits a real space between every glyph,
and the name stops copying — and stops parsing — as a name. Measured on this
file against two extractors: pypdf breaks between 0.135em and 0.14em, PyMuPDF
between 0.145em and 0.15em.

Two parsers, two different cliffs. That is the useful part: applicant
tracking systems will disagree too, so the name sits at **0.12em** for
headroom rather than at the edge of whichever one got tested.

The section labels are tracked far wider on purpose — they are the main
device in a layout with no colour and only one weight, and nothing needs to
read them mechanically. Everything a parser actually harvests is untracked.
The build asserts all of this, so tracking cannot creep back up unnoticed.

Bullet markers are `inline-block` with a negative margin, never
`position: absolute`. Absolutely-positioned markers sit outside the text
flow: the PDF collected every dash after all the prose, so copying the CV
detached the bullets from their lines.

### Rebuilding it elsewhere

The build needs headless Chromium, plus `pypdf` and `PyMuPDF`. Point it at a
different browser or interpreter with:

```sh
CHROME=/path/to/chrome PY=python3 tools/build-cv.sh
```

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
