# Virtual Nostalgia — exhibition (static build)

A self-contained, **no-build-step** static web app (plain HTML + ES modules + Three.js r170, vendored). It is a 3D virtual archive: a scanned childhood house, a carousel of 7 catalogue objects, and an interactive page-turning 3D catalogue. ~28 MB, loaded only when the page is opened.

## What to do with it
1. Copy this whole folder into the website repo as a static folder, e.g. `public/exhibition/` (Vite/Next/Astro/CRA) or `/exhibition/` (plain GitHub Pages). Keep the internal structure exactly as is: everything uses **relative paths**, so it works under any sub-path (`/exhibition/`, `/portfolio/archive/` …).
2. Make the "Try" button open it:
   - **Simplest (recommended):** a normal link to the folder: `<a href="/exhibition/" target="_blank" rel="noopener">Try the virtual archive</a>` (use your site's base path if it is not at the domain root, e.g. `/REPO_NAME/exhibition/` on a GitHub Pages project site). The folder's `index.html` is the whole experience, full screen, with its own loader.
   - **Embedded in a page** (only after the click, so nothing downloads on page load):
     ```html
     <button id="try">Try</button><div id="stage-host"></div>
     <script>
       document.getElementById('try').onclick = () => {
         const f = document.createElement('iframe');
         f.src = '/exhibition/'; f.allow = 'fullscreen'; f.loading = 'eager';
         f.style.cssText = 'width:100%;height:80vh;border:0;border-radius:12px';
         document.getElementById('stage-host').replaceChildren(f);
       };
     </script>
     ```
3. Do **not** bundle or transpile it. Treat it as a static asset folder (in a bundler project: the `public/` folder, so files are copied as-is).

## Hosting requirements
- Must be served over **http(s)** (ES modules and `fetch` do not work from `file://`). GitHub Pages, Netlify, Vercel, Cloudflare Pages all work.
- Correct MIME types for `.js` (`text/javascript`), `.webp`, `.glb` (default on the hosts above). No server code, no env vars.
- Single largest file ≈ 8.4 MB (`models/house_clean.glb`) — fine for GitHub (limit 100 MB per file), no Git LFS needed. Total ≈ 28 MB. If the repo has size rules, this folder can also live on a CDN/another Pages repo and be linked.
- The loader shows real byte progress; first visit downloads everything, later visits are cached by the browser. If you update the files later and the old version keeps showing, hard-refresh or add a version query to the link (`/exhibition/?v=2`).
- CSP, if you use one: `script-src 'self'` (plus `'unsafe-inline'` or a hash for the small inline importmap in `index.html`), `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `connect-src 'self' blob:`. The page loads textures through blob: URLs.

## Browser / device support
Needs WebGL2 (every current Chrome, Edge, Safari, Firefox; phones too). Controls: drag to look / turn pages / rotate objects; click the held catalogue to read it; scroll or ± to zoom (reading); arrow keys; Esc to put things down; **P** switches paper colour, **T** the paper-texture overlay. Touch works (drag, tap). The experience is built for landscape, but works in portrait.

## URL options (all optional)
- `?paper=green|cream` start paper colour (also switchable in the UI).
- `?grain=0.8` paper-texture opacity (0 = off) and `?grainsize=0.5` grain size (smaller = finer). The ⚙ button next to "Texture" shows live sliders and writes the values into the address bar.
- `?debug` exposes `window.__ex` for development. Not needed in production.

## File map
- `index.html` — page shell, UI, CSS, paper-texture layers. `intro.js` — loader story. `exhibition.js` — scene, rooms, carousel, interactions. `catalogue.js` — the 3D page-turning book.
- `vendor/` — Three.js r170 + the 3 addons used (MIT licence, three.js authors).
- `models/*.glb` — web-optimised house/WC scans and the 7 objects; `manifest.json` = byte sizes for the loader's progress bar. **If you replace a model, regenerate the manifest** (sizes) or progress will be approximate (it still works).
- `textures/` — catalogue pages in two paper colours (`paper-green/`, `paper-cream/`), the paper grain tile, the title-head logo, a window photo.
- `CREDITS.md` — third-party assets (ambientCG Paper001, CC0).

## Things the site owner should know
- The house is a 3D scan of a real family home and uses personal photographs; the 7 objects were AI-generated 3D models (Meshy) from the owner's catalogue artwork. Confirm Meshy's plan terms allow public/portfolio display if relevant.
- Scan quality has known rough patches; windows and several pieces of furniture were repaired (see credits). A source log of every design decision lives in the owner's working folder (`DECISIONS.md`), not in this build.
