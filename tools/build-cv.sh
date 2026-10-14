#!/usr/bin/env bash
#
# Rebuild the CV from its source.
#
#   assets/cv-source.html  ──►  assets/ecem-ozturk-cv.pdf   (the download)
#                          ──►  assets/cv-page-1.webp       (what /cv/ shows)
#                          ──►  assets/cv-page-2.webp
#
# Usage:  tools/build-cv.sh
#
# The PDF is printed by headless Chromium, which honours the @page rules in the
# source. Nothing here is interactive and nothing touches the network.
#
# Three checks run after the print, and any of them failing stops the build
# before it overwrites the committed files:
#
#   1. The PDF is exactly two pages. A third page means the content outgrew the
#      layout — fix the source, don't ship it.
#   2. The PDF text layer contains no home address and no personal phone
#      number. These were in the original document and must never come back.
#   3. The page images were produced and are non-trivial in size.

set -euo pipefail

cd "$(dirname "$0")/.."

SRC="assets/cv-source.html"
OUT_PDF="assets/ecem-ozturk-cv.pdf"
PAGE_W_PX=1500          # rendered width of the page images

CHROME="${CHROME:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
PY="${PY:-python3.13}"

[[ -f "$SRC" ]]     || { echo "missing $SRC" >&2; exit 1; }
[[ -x "$CHROME" ]]  || { echo "no chromium at $CHROME (set CHROME=...)" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "→ printing $SRC"
"$CHROME" \
  --headless \
  --disable-gpu \
  --no-sandbox \
  --no-pdf-header-footer \
  --run-all-compositor-stages-before-draw \
  --virtual-time-budget=10000 \
  --print-to-pdf="$work/cv.pdf" \
  "file://$PWD/$SRC" 2>/dev/null

[[ -s "$work/cv.pdf" ]] || { echo "chromium produced no PDF" >&2; exit 1; }

echo "→ checking the result, and setting document metadata"
"$PY" - "$work/cv.pdf" <<'PYCHECK'
import sys
import pypdf

path = sys.argv[1]
pdf = pypdf.PdfReader(path)
pages = len(pdf.pages)
print(f"  pages: {pages}")
if pages != 2:
    sys.exit(f"  FAIL: expected 2 pages, got {pages} — the layout overflowed")

text = "\n".join(p.extract_text() for p in pdf.pages)

# Redactions that must hold. These strings were in the original document and
# are deliberately absent from everything published.
leaks = [s for s in ("480 Front", "647-822-3781", "6478223781", "M5V") if s in text]
if leaks:
    sys.exit(f"  FAIL: redacted details are back in the PDF: {leaks}")
print("  redactions: clean")

# Things that must be PRESENT, so a silently-empty render cannot pass. The
# first group is content; the second is the text layer behaving itself.
for needed in ("Art Director", "hello@ecem.world", "ecem.world",
               "Toros & Partners", "2019 – 2022", "2023 – 2025", "Asana",
               "Rhinoceros 3D", "Claude Code", "Meshy"):
    if needed not in text:
        sys.exit(f"  FAIL: expected text missing from the PDF: {needed!r}")
print("  content: present")

# Letter-spacing past ~0.148em makes a PDF emit a space between every glyph.
# The name and the role titles must survive copy-paste and machine parsing;
# if tracking creeps up in the source, this is what catches it.
if "ECEM OZTURK" not in text:
    sys.exit("  FAIL: the name does not extract as 'ECEM OZTURK' — h1 tracking "
             "is above 0.145em, so it reads as 'E C E M  O Z T U R K'")
for role in ("Project Coordinator", "Associate Product Designer",
             "Interior Design Intern", "Game Design Intern"):
    if role not in text:
        sys.exit(f"  FAIL: role title does not extract cleanly: {role!r}")

# A bullet and its dash must sit on the same extracted line. They did not when
# the markers were position:absolute — every dash was collected after the
# prose, so copying the CV detached the bullets from their lines.
if "– Rendered interiors" not in text:
    sys.exit("  FAIL: bullet markers are out of flow in the text layer — "
             "check that li::before is inline-block, not position:absolute")
print("  text layer: name, roles and bullets all extract cleanly")

# Real metadata, so a parser that reads the document properties gets an
# untracked name rather than the tracked masthead. Nothing hidden is added to
# the page itself.
writer = pypdf.PdfWriter(clone_from=path)
writer.add_metadata({
    "/Title": "Ecem Ozturk — Designer & Art Director — CV",
    "/Author": "Ecem Ozturk",
    "/Subject": "Curriculum vitae",
    "/Keywords": ("art direction, brand identity, visual identity, editorial design, "
                  "typography, UI/UX, 3D, VR, creative direction"),
    "/Creator": "ecem.world",
})
with open(path, "wb") as fh:
    writer.write(fh)
print("  metadata: set")
PYCHECK

echo "→ writing the link map"
# The viewer at /cv/ shows flat images, so the PDF's hyperlinks are just
# pixels there. Rather than hand-placing hotspots over the picture — which
# would silently drift the next time the layout moves a line — the real link
# rectangles are read back out of the PDF that was just built and written as
# percentages of the page. The page reads this and lays its overlays on top.
"$PY" - "$work/cv.pdf" <<'PYLINKS'
import json
import sys

import pymupdf

doc = pymupdf.open(sys.argv[1])
links = []
for number, page in enumerate(doc, start=1):
    width, height = page.rect.width, page.rect.height
    for link in page.get_links():
        uri = link.get("uri")
        if not uri:
            continue
        rect = link["from"]
        label = page.get_textbox(rect).strip()
        links.append({
            "page": number,
            "kind": "copy" if uri.startswith("mailto:") else "link",
            # What the overlay acts on: the bare address for a copy, the URL
            # otherwise.
            "value": uri[len("mailto:"):] if uri.startswith("mailto:") else uri,
            "label": label,
            "left": round(100 * rect.x0 / width, 4),
            "top": round(100 * rect.y0 / height, 4),
            "width": round(100 * (rect.x1 - rect.x0) / width, 4),
            "height": round(100 * (rect.y1 - rect.y0) / height, 4),
        })

if not links:
    sys.exit("  FAIL: the PDF has no hyperlinks — the contact line lost its links")
if not any(l["kind"] == "copy" for l in links):
    sys.exit("  FAIL: no mailto link found, so the copy-email overlay has nothing to sit on")

with open("assets/cv-links.json", "w") as fh:
    json.dump(links, fh, indent=1, ensure_ascii=False)
    fh.write("\n")

for l in links:
    print(f"  p{l['page']}  {l['kind']:4}  {l['label']!r} -> {l['value']}")
PYLINKS

echo "→ rendering page images"
"$PY" - "$work/cv.pdf" "$PAGE_W_PX" <<'PYRENDER'
import sys
import fitz

path, width = sys.argv[1], int(sys.argv[2])
doc = fitz.open(path)

for i, page in enumerate(doc, start=1):
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    out = f"assets/cv-page-{i}.webp"
    pix.pil_save(out, format="WEBP", quality=88, method=6)
    print(f"  {out}  {pix.width}x{pix.height}")
PYRENDER

for i in 1 2; do
  f="assets/cv-page-$i.webp"
  [[ -s "$f" ]] || { echo "  FAIL: $f was not written" >&2; exit 1; }
  size=$(stat -c%s "$f")
  (( size > 20000 )) || { echo "  FAIL: $f is only ${size}B — render looks blank" >&2; exit 1; }
done

cp "$work/cv.pdf" "$OUT_PDF"
echo "→ wrote $OUT_PDF ($(stat -c%s "$OUT_PDF") bytes)"
echo "done."
