# ecem.world — project log

A record of what has been built, and why it was built that way. `README.md`
says how the code works; this says what we decided and what it cost, so a
decision does not get relitigated or quietly undone.

**Last updated:** 13 October 2026
**Live:** <https://ecem.world> · 42 commits · 17 Pages deployments

---

## Where things stand

The site is a **coming-soon page**, not yet a portfolio. Everything below is
live and merged to `main`.

| Page | What it is |
|---|---|
| [`/`](https://ecem.world) | The chrome "e" monogram drifting on black, "coming soon", a contact line, and a Substack popup |
| [`/cv/`](https://ecem.world/cv/) | The CV as two paper pages on a dark field, with live links and a download |
| [`/qr/`](https://ecem.world/qr/) | A printable QR code page, for the business card |
| `/model.html` | The monogram alone on a transparent background, for reuse |

**The next phase — the actual portfolio — has not started.** Reference study
is the current open item; see [What's next](#whats-next).

---

## What is built

### The domain and hosting

GitHub Pages serving `main` at the apex domain. GoDaddy holds the DNS: four
A records to GitHub's `185.199.108–111.153`, plus `www` as a CNAME to
`ceceming.github.io`. The `CNAME` file in the repo is what ties them.

Two things cost real time and are worth remembering:

- **A private repo cannot use Pages on a free plan.** The repo had to be made
  public before anything would serve.
- **The domain was already pointing at an older project.** `ceceming/interactive-media-501-winter2024`
  held its own `CNAME` file claiming `ecem.world`, which silently won. Found
  by listing the repos and checking which had Pages enabled.

Full steps in [`DOMAIN-SETUP.md`](DOMAIN-SETUP.md).

### The 3D monogram

A chrome "e" from Meshy, rendered with three.js.

**The raw export was 11.8 MB; it ships at 516 KB.** Geometry was never the
problem — 3,042 triangles, 117 KB of it. It was a 2048² base colour map and a
4096² metallic-roughness map on an object that renders about 110 px tall.
Resized and recompressed with `@gltf-transform/cli`; verified indistinguishable
(under 0.01% of pixels differ by more than 8/255).

**three.js is committed into `vendor/`, not loaded from a CDN.** Not a
preference — the container's egress proxy blocks every CDN, so vendoring was
the only way to build it. It turned out to be the better answer anyway: no
third-party request when someone opens the page, and nothing to rot.

### The animation

Six sine waves on incommensurate periods, summed. No keyframes, no cycle, no
beginning or end.

```js
const DRIFT = { rise, sway, turn, tilt, nod, breath };  // assets/scene.js
const TEMPO = 1.6;
```

This replaced the original brief — *"hop hop hop, then a little dance, then a
big hop"* — because she disliked it on seeing it. The lesson that stuck:

- **"Too still" is an amplitude problem.** More travel.
- **"Too slow motion" is a tempo problem**, and amplitude cannot fix it. A
  larger but equally unhurried movement still reads as footage played slowly.
  `TEMPO` scales every period at once, so the ratios survive.

The periods are chosen so no two sit near a ratio the eye reads as "these move
together" (1:1, 5:4, 4:3, 3:2, 5:3, 2:1), every pair at least 3.4% clear. Two
earlier attempts landed on 3:2 and then exactly 5:4, and the drift visibly
locked into a loop both times. **Check this if you ever retune a period by
hand.**

Respects `prefers-reduced-motion`, pauses in a background tab, and accumulates
elapsed time so returning to that tab resumes rather than jumping.

### Size

One knob, `--stage: min(42vmin, 205px)` in `index.html`. The gap below it is
derived from it, so spacing follows along. The glyph is deliberately small.

### The contact line and the newsletter

`in the meantime, contact me at hello@ecem.world · newsletter · cv`, pinned to
the bottom of the window rather than placed in the flow, so adding it did not
shift the glyph off the centre it was framed on.

The Substack embed is a native `<dialog>`: it opens itself once after 6s,
and once dismissed it stays dismissed for that browser (`localStorage`). The
footer link reopens it on demand, so nothing is lost by closing it. A popup
that returns every visit is the thing that makes people leave.

### The QR code

Six files in `assets/qr/` — SVG and PNG, three styles — plus a printable page
at `/qr/`. Generated at **error-correction level Q**, which costs nothing: L,
M and Q all fit this URL in a 25×25 grid, so the lowest level buys no space.

**The white-on-black inverted version does not scan.** Verified three separate
times with OpenCV. It is kept because it is wanted for dark print, but the
rounded white card is the one to actually use.

### The CV

Two pages, US Letter, black and one grey and hairlines, no colour. Source of
truth is **`assets/cv-source.html`**; `tools/build-cv.sh` generates the PDF,
the two page images, and the link map. Never edit the generated files.

Why it was rebuilt from scratch: the original Word document was lost when a
container reset wiped the uploads directory, so every text change was blocked
on re-uploading a file. Asking for a visual redesign removed that dependency —
if the layout is being replaced anyway, there is nothing to preserve.

Decisions inside it worth keeping:

- **The name is tracked to 0.12em, no further.** Past a threshold a PDF emits a
  real space between every glyph and the name parses as `E C E M  O Z T U R K`.
  Measured on this file: pypdf breaks between 0.135em and 0.14em, PyMuPDF
  between 0.145em and 0.15em. Two parsers, two cliffs — so ATS systems will
  disagree too, and it sits well below both rather than at the edge of one.
  The section labels are tracked far wider on purpose; nothing reads those
  mechanically.
- **Bullet markers are `inline-block`, never `position: absolute`.** An
  absolute marker sits outside the text flow, and the PDF collected every dash
  after all the prose — copying the CV detached the bullets from their lines.
- **Flowed pagination, not fixed-height page boxes.** A fixed box with
  `overflow: hidden` swallows an overflowing line silently; flowed content
  produces a visible third page, which the build then rejects.
- **The home address and personal phone number are gone** and the build fails
  if they reappear in the text layer.

Content decisions, all hers, recorded so they are not reverted by accident:

- Title is **Art Director** (not creative director — too senior).
- AI line is expert prompting, Claude Code, Meshy and Firefly. **Not** ComfyUI
  or Vizcom, which she does not use.
- Rhinoceros 3D for modelling; Blender for rendering and animation only.
- Asana, not Jira.
- Experience leads with **Freelance**, then **Vretta**. Vretta sits high
  deliberately: it is the only Canadian employer on the CV, which is what the
  Toronto market scans for. The cost — a delivery title above her strongest
  creative one — was raised and accepted.
- **Cut:** Superheart (two months, one vague bullet, no gap to fill, and it
  pulled the positioning toward game UX) and the Boğaziçi summer physics term.
- Education shows date ranges, which is what let **Pratt 2018–2019** sit
  legibly between NABA and the certifications.

### Live links on the CV page

The viewer shows flat images, so the PDF's hyperlinks did not survive onto the
web. The build now reads the real link rectangles **back out of the PDF it just
produced** into `assets/cv-links.json`, and the page lays transparent hotspots
from that. Derived, not hand-measured — so they move when the layout moves.

The email **copies** rather than opening a mail app, and says so before the
press. Two things touch forced:

- A permanent "tap to copy" caption was built and removed. The page image
  scales down with the window but a legible bubble does not, so at phone width
  it was wider than the contact line and sat across her name. It rides the
  press instead — up on finger-down, copied on lift.
- `:hover` rules live inside `@media (hover: hover)`. Unscoped, a tapped
  element keeps `:hover` on a touch screen until something else is tapped, and
  the bubble parks over her name anyway.

---

## Conventions this project has settled into

- **Static files only.** No framework, no npm at runtime, no build step —
  except the CV, which is generated and documented as such.
- **Branch `claude/portfolio-coming-soon-page-hr00ig`, then merge to `main`.**
  Pages deploys from `main`.
- **Touch is a separate design, not a narrower one.** Branch on
  `(hover: none)`, never on viewport width — an iPad in landscape is wide and
  still has no pointer. This has caught real bugs three times: the unreachable
  dialog close button, "tap anywhere" being a 11%-of-screen target on an iPad,
  and the sticky-hover caption above.
- **Verify in a real browser, not by reasoning.** Headless Chromium at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, driven by the global
  Playwright at `/opt/node-tools/node_modules/playwright`.
- **The container's egress proxy blocks most external hosts** — every CDN,
  meshy.ai, substack.com, drive.google.com, and `ecem.world` itself. Deploys
  are therefore verified through the GitHub API rather than by loading the
  live page. Say so rather than implying the live page was seen.

---

## What's next

### The portfolio proper

Nothing of it exists yet. The coming-soon page is the whole site.

### Reference sites — study pending, currently blocked

Four sites she pointed to, off the top of her head, as examples she likes:

| Site | Studied? |
|---|---|
| <https://emitakahashi.ca/> | ✗ not reachable |
| <https://imnik.com/> | ✗ not reachable |
| <https://www.amyfang.work/> | ✗ not reachable |
| <https://www.jessicakatona.com/> | ✗ not reachable |

**All four are denied by this environment's network policy** (the egress proxy
answers 403 to CONNECT), and this session has no browser tool to go round it.
They have deliberately **not** been described from guesswork.

To unblock, either:

1. Add the four domains under **Allowed domains** in the environment's network
   settings (cloud environment menu in the title bar → Edit), leaving *Allow
   package managers* ticked; or
2. Send screenshots — full-page home, one project page, and the about page for
   each.

What to look for once they are reachable, in her words: *dimensions,
templates, layouts, the way they introduce media, designer intro bio
descriptions.*

### Open questions, not yet asked

- Is the drifting monogram a landing-page object, or does it become a
  persistent element of the portfolio?
- Does "coming soon" become a home page, or does the portfolio replace it?
- How much work is there to show, and in what media — stills, video, VR
  capture, 3D?
- One page or many? (The reference study should answer this.)
