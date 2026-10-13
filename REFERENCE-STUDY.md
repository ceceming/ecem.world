# Reference study — four portfolios

Four sites Ecem pointed to as examples she likes. Studied 13 October 2026 in
headless Chromium at **1440×900** (desktop) and **390×844** (phone), with
measurements read from the rendered DOM, not estimated from screenshots.

What she asked to look for: *dimensions, templates, layouts, the way they
introduce media, designer intro bio descriptions.*

**Two capture limits, so nothing below is misread:**

- This Chromium build cannot decode H.264, so self-hosted MP4s render as black
  boxes ("Video is not available…"). Video *settings* (autoplay, loop, size,
  ratio) were read from the elements; the footage itself was not seen.
- Vimeo embeds (Nik) sit behind poster images; their playback was not seen.

Screenshots are not committed — these are other people's work in a public
repo. They are regenerable with the scripts described at the end.

---

## At a glance

| | Emi Takahashi | Nik Arthur | Amy Fang | Jessica Katona |
|---|---|---|---|---|
| Discipline | Visual artist, glyph & graphic designer | Experimental animator, filmmaker | Artist/designer, fashion & print | Creative director, designer |
| Platform | Cargo 3 | Cargo 3 | Custom (Next.js + Tailwind, headless CMS) | Squarespace (Fluid Engine) |
| Ground | White | Black | White | White |
| Type | One serif, one size (12.3px) + her own glyph font | One mono, one size (10.4px) | One grotesk, two sizes (16/18px) | Serif bio 34.7px + Helvetica Neue 12–16px |
| Pages | One long page (+ thumbnail index) | Index + project pages + about | One screen + project overlays | One page + Info |
| Bio placement | Pinned right third, always visible | Pinned box, always visible; fuller version on About | Centre column, always visible | First thing on the page, large |
| Media | Slideshows, 4:5 and 1:1, two-up | Video thumbnails in a mixed-ratio grid | Single images in two endless columns | Staggered stills and looping video |
| Work count | 8 projects on home | ~25 | 10 | ~15 |

The common thread across all four: **the bio is never hidden behind a
click on desktop.** Three of the four keep it permanently on screen; the
fourth (Jessica) opens with it, set larger than anything else on the site.

---

## 1. Emi Takahashi — emitakahashi.ca

**The shape.** A fixed-height frame. The left two-thirds (0–960px) scroll as
the page; the right third (960–1440px, **480px wide**) is a pinned panel
titled *Information* that scrolls independently (1,431px of content in a 900px
window). So the CV is always beside the work, never a separate page.

**The work column.** Each project is a row:

- Media: **two slideshows side by side**, each ~470px wide, 6px gutter, 6px
  page margin. Images are served at 500px wide and are almost all **4:5
  (500×625)** or **1:1 (500×500)**.
- Under the media, a three-part caption band: **Title + year** (col 1,
  ~232px) · **Categories**, one per line, prefixed `⋯` (col 2, ~221px) ·
  **Description** (col 3, 471px — the width of one slideshow).
- Each band's labels — *TITLE, CATEGORIES, DESCRIPTION* — are set in her own
  glyph typeface, so they read as ornament, not as words. The real text is
  plain.
- A hairline rule closes each project.

**How media is introduced.** Slideshows are not autoplaying. Navigation is
**cursor zones** — click the left or right half of the image — with a 0.1s
**fade**. Two of them use a **scrub** transition (images change as the cursor
moves across, 0.5–1s). One MP4 sits among the stills, `autoplay loop muted`,
preloaded as metadata only. There is a **Thumbnail View** toggle
(`/index-view`) that swaps the list for a 4-across grid of first frames —
same page, same pinned panel.

**Type.** One serif (*Marist*), **12.3px / 14.2px**, 85% black, everywhere —
title, body, CV. Hierarchy comes from position and italic, never size. Her
own font (*Galaxy Flower*) appears as small inline glyphs inside the bio —
one after each of *glyph design*, *typography* and *image-making*, and after
*visual worlds* — so the bio demonstrates the practice while describing it.
(The glyphs don't survive as text; the quote below omits them.)

**Phone.** One column, everything at 15.7px. The panel becomes an *Info* link
in a three-item bar (`Emi Takahashi · Grid · Info`). Slideshows go full width.

**The bio — verbatim, glyphs omitted:**

> Emi Takahashi 高橋恵美 is a visual artist & graphic designer based in
> Tiohtià:ke/Mooniyang/Montréal. Her practice seamlessly blends glyph design,
> typography, and image-making to build visual worlds rooted in craft,
> material exploration, and collaboration.

Then, in the same panel, a CV as label/value pairs: *Latest Trails* (current
work, four lines), *Select Clients* (one comma-separated line), *Collaborators*
(linked names), *Education, Group Exhibitions/Shows, Talks & Workshops, Press
& Features, Awards & Grants*, and *Last Updated 26.08.13*.

**Project descriptions** are the strongest writing of the four — they tell the
*process*, then credit people:

> At a local marsh, we observed that when tiny duckweed plants are moved
> around, they naturally drift back to re-cover the water's surface. This
> natural process of the duckweed self-collecting is like an animation
> happening right in front of your eyes. For A24, we animated the duckweed to
> reveal the logo, like a fleeting moment of magic.
>
> Created with Nik Arthur · Creative Director: Liam Hamill

---

## 2. Nik Arthur — imnik.com

**The shape.** Black ground, white type, everything inside **rounded boxes
with 1px white borders** (radius 31px). Two pinned boxes on the left
(x 18–428, **410px wide**), one scrolling box on the right (x 448–1420,
**972px wide**, content 925px).

- **Top-left box, pinned:** the full project index as a table —
  `Client · Project · Year`, underlined headers, a hairline under every row.
  ~25 rows; the table scrolls inside the box (342px window).
- **Bottom-left box, pinned:** the one-line bio, then *About*, *Resources*,
  then *IG, ARE.NA, SUBSTACK*.
- **Right box:** the work. *Personal Projects* (one 16:9 hero carousel with
  arrows, festival laurels on the poster), then *Commission Projects*.

**How media is introduced.** A packed grid where each tile keeps the
**native ratio of the film**: 16:9 hero tiles at full 925px; pairs at
480+431; triples at 350+197+351 (**16:9, 1:1, 16:9** in one row); a row of
five **9:16 verticals** (~168px wide) for the social work; 1:1 music-video
tiles. Each tile has a centred caption `Client - Title` and a small outlined
**tag pill** (`COMMERCIAL`, `LOGO/TITLE`, `MUSIC VIDEO`, `CREATIVE DIRECTION`)
that doubles as a filter link. Some tiles are Vimeo embeds set to
`muted autoplay`; most are poster stills linking to the project page.

**The project page.** Same frame. A header row `Title · Type · Year`, the
film full-width, then a two-column text block: description left, **credits**
right (*Created by, Script by, Producer, Executive Producer*, co-directors).
*Witness* adds a numbered list of the film's six creatures, each with a
one-paragraph description, a *Behind The Scenes* section, and *Official
Selections*. Footer: `Index · ©2026 All Rights Reserved`.

**Type.** One mono (*Monument Grotesk Mono*), **10.4px**, everywhere. Section
labels bold, tag pills bold uppercase 10px. That's the whole system.

**Phone.** The boxes disappear. A header (`Nik Arthur · About, Resources`), a
*shorter* bio, then the work grid in one column. **The index table is
dropped entirely on phone.**

**The bio — three versions, each sized to its place:**

- Desktop sidebar: *"Nik Arthur is an experimental animator and filmmaker
  engaging with organic matter and physical materials."*
- Phone header: *"Nik Arthur (he/him) is a Canadian experimental animator and
  filmmaker, often working with organic matter."*
- About page: *"Nik Arthur (he/him) is an experimental animator and filmmaker
  living in Tiohtià:ke/Montréal, Canada. Nik develops novel approaches that
  engage with nature's intrinsic patterns, playing with new methods of
  storytelling."*

The About page is a grid of labels — *Bio, Contact, CV (Clients, Festivals),
Niku* — with a portrait at ~384×320 and representation listed first: *"For
commission inquiries, please contact Ben at bw@ploegarts.com"*.

(Emi and Nik are collaborators — each credits the other — and both sites are
Cargo, which is why their structures rhyme.)

---

## 3. Amy Fang — amyfang.work

**The shape.** The page does not scroll. A fixed frame of **three equal
columns, 473px each**, separated by full-height hairlines, 10px outer margin.

- **Left and right columns** each scroll independently, and are **endless**:
  the five projects in each are repeated ten times (50 links, 5 unique), and
  the column starts mid-stack, so you can scroll either way forever. **The
  left column drifts upward on its own** (~60px/s) with no input; the right
  stays still until touched.
- **Centre column** is static: the bio at the top, and
  `EMAIL / INSTAGRAM / STUDIO PRACTICE` pinned at the bottom.

**How media is introduced.** One image per project, full column width
(**448px**), at the image's own ratio — mostly **4:5** (448×560), some near
square. Under it: `TITLE` uppercase left and `YEAR` right on one line at
18px, a one-sentence description at 16px, then a hairline. Clicking opens a
**white overlay panel** (~1080px wide, page dims behind) with the image large,
← → arrows for more images, and `CLOSE ×` top right — the home page stays
underneath.

**Type.** One typeface (*NewEdge*), two sizes: **18px** uppercase for titles,
**16px** sentence case for everything else. Black on white, no grey.

**Phone.** One column. Bio first, then the links, then each project as image +
`TITLE / YEAR` + a **`+`** that expands the description (accordion). Titles
stay 18px; the drift is gone.

**The bio — verbatim:**

> AMY FANG is an artist/designer whose practice focuses on the language of
> fashion across printed matter, exhibition graphics, and sculpture. Her work
> moves between independent and collaborative contexts — with commercial
> clients ranging from institutions and brands such as the Hammer Museum,
> Swiss Institute, Calvin Klein, and Hermès.
>
> Currently, she is a designer at T: The New York Times Style Magazine, and a
> thesis instructor in Parsons' undergraduate program.

The page's meta description is a different, looser register — *"…Currently
listening to No Party for Cao Dong on repeat."* — so the voice for search
results and the voice on the page are deliberately not the same.

**Project descriptions** are one sentence each, factual, and name the client:
*"Hand-lettered invitations for the 2025 Hermès Met Gala celebration (The
Artists Dinner)."*

---

## 4. Jessica Katona — jessicakatona.com

**The shape.** A conventional single scrolling page with the most
"agency" feel of the four. Header: `Jessica Katona` left, `Info` right, 36px
margins. Then the bio as a hero, a `(↓) Select Work` anchor, the work, a
footer.

**How media is introduced.** Squarespace's 24-column grid (columns ~46px,
**11px gutters**, 25px outer). Each project is one block of **2–3 pieces set
deliberately off-grid** — different sizes, staggered tops, some bleeding to
the window edge — mixing stills with **`autoplay loop muted playsinline`
videos** (13 of 33 media are video, all 16:9). Ratios vary freely: 3:2, 4:3,
16:9, 4:5, near-square. No hover effects; **projects are not clickable** —
the home page is the whole portfolio.

Each project's caption is a quiet three-column line in **grey (#a9a9a9),
12.3px**:
`Mindbloom` · `Health & Wellness / Brand, Digital, Content` · `Creative
Director / Designed at Landscape` — name, sector + disciplines, role +
where it was made.

**Type.** The bio in a serif at **34.7px / 39.7px** (served from a font
service under an obfuscated name, so not identifiable from the page), everything
else in Helvetica Neue at 12–16px. Small parenthetical labels —
`(About)`, `(↓) Select Work`, `(Get in Touch)` — introduce each section, and
the bio's first line is indented to sit after `(About)`.

**Info page.** The same large serif, three paragraphs (first-line indents, no
gaps between them), a portrait at **219×272** pinned top right, and
`(Get in Touch) · email · LinkedIn` beneath.

**Phone.** Same order; bio drops to 26px. The staggered compositions are kept
rather than stacked, so pieces still overlap and bleed.

**The bio — verbatim (home page uses the first paragraph alone):**

> Jessica is an independent creative director and designer based in Seattle.
> She brings clarity and purpose to visual identities, design systems, and
> digital experiences — across wellness, technology, sustainability, and
> culture.
>
> Her approach is strategically grounded, craft-driven, and built to scale —
> for early-stage companies defining their voice and global brands refining
> it.
>
> Most recently, Jessica was a Creative Director at Landscape, where she led
> projects for Google, Seed, Checkr, Claxton Projects, Antora, Mindbloom,
> Atoms, Shaped, Modal, and Good Bacteria. Before that, she held roles at
> Digital Kitchen and Studio Matthews.

---

## What the bios have in common

All four follow the same skeleton, in this order:

1. **Name + noun phrase for what they are** — *"visual artist & graphic
   designer"*, *"experimental animator and filmmaker"*, *"artist/designer"*,
   *"independent creative director and designer"*.
2. **Where** — three of four name a city in the first sentence; Emi and Nik
   use the Indigenous place name first (*Tiohtià:ke*).
3. **What the practice is *about*** — material, not deliverables: *"rooted in
   craft, material exploration"*, *"organic matter and physical materials"*,
   *"the language of fashion"*. Jessica is the exception — hers names
   deliverables and sectors, which suits a commercial creative director.
4. **Proof by names** — clients or employers, as a list. Amy and Jessica put
   them in the bio; Emi and Nik move them into a separate CV list.
5. **Currently** — Amy (*"Currently, she is…"*) and Emi (*Latest Trails*) both
   carry a present-tense line, which makes the site feel alive.

Other patterns:

- **Third person, every time.** None uses "I" in the bio. (Emi and Nik use
  "I" and "we" in project descriptions — the bio is formal, the work is
  personal.)
- **Short.** The always-visible bio is 1–2 sentences, 18–50 words. Longer
  versions live on an About/Info page.
- **No adjectives about themselves.** Nobody says "passionate", "award-winning"
  or "creative". The awards are in the CV, stated as facts.

## What the layouts have in common

- **One typeface family, one or two sizes** on three of four sites. Hierarchy
  through position, case, rules and grey — not size.
- **Hairline rules** do the structuring on all four.
- **The work is on the home page.** None opens with a splash screen or a
  "view work" gate. Even Jessica's hero bio is followed by the work in the
  same scroll.
- **Media keeps its own ratio** — nobody crops everything to one shape. Emi
  normalises to 4:5 and 1:1; the other three let each piece be its own size.
- **Moving image is muted, looping, autoplaying and controls-free** wherever
  it appears inline. Sound and controls live on the project page or in the
  embed.
- **Project captions are a fixed set of fields** — title, year, discipline/
  category, role or client — laid out the same way every time.

## For ecem.world — observations, not decisions

These are for the conversation that decides the portfolio, not a design.

- The **pinned bio** (Emi, Nik, Amy) is the pattern three of four share, and
  it would let the drifting monogram and the bio share a fixed panel while the
  work scrolls beside it.
- Nik's **index table** (`Client · Project · Year`) is the most efficient way
  to show a lot of commercial work at once, and suits an art-director CV with
  named clients.
- Emi's and Nik's **mixed-ratio media** suits work that spans stills, video,
  VR capture and 3D — the open question in the project log about what media
  there is.
- Jessica's **caption line** (*name · sector/disciplines · role/where made*)
  is a clean answer to the "freelance vs. at an agency" credit problem —
  *Designed at Landscape* credits the studio without making it the headline.
- None of the four is a framework-heavy build that the static-files-only
  convention here couldn't reproduce. Amy's endless columns and Emi's
  pinned panel are both a few dozen lines of CSS and JS.

---

### How this was captured

Playwright driving `/opt/pw-browsers/chromium-1194`, three passes per site:
a survey (computed fonts, every text node with position, every media element
with rendered and natural size, all links), a deep pass that walks shadow DOM
(Cargo hides media inside `<media-item>` shadow roots) after a slow scroll to
trigger lazy loading, and a behaviour pass (scroll positions over time, wheel
input, slideshow attributes). Pages captured: each home at both widths; Emi's
thumbnail view; Nik's About and two project pages; two of Amy's project
overlays; Jessica's Info page.
