#!/usr/bin/env bash
# Lighter copies of every video for phones: next to media/…/name.mp4 goes
# media/…/name-phone.mp4 — at most 1280 px on the long side, about 2 Mbit/s,
# no sound (feed videos play muted), index at the front. The site asks for the
# phone copy on small screens and falls back to the original if there is none.
# Originals are never touched. Runs again safely: existing copies are skipped.
set -euo pipefail
changed=0
while IFS= read -r -d '' f; do
  case "$f" in *-phone.mp4) continue ;; esac
  out="${f%.*}-phone.mp4"
  [ -e "$out" ] && continue
  tmp="$(mktemp --suffix=.mp4)"
  ffmpeg -nostdin -v error -y -i "$f" -an \
    -vf "scale=w='min(iw,1280)':h='min(ih,1280)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
    -c:v libx264 -preset slow -crf 26 -maxrate 2500k -bufsize 5000k -pix_fmt yuv420p \
    -movflags +faststart "$tmp"
  # Already small? Then the original is the phone copy too.
  if [ "$(stat -c%s "$tmp")" -ge "$(stat -c%s "$f")" ]; then cp "$f" "$tmp"; fi
  mv "$tmp" "$out"
  echo "phone copy: $out ($(stat -c%s "$f") -> $(stat -c%s "$out") bytes)"
  changed=1
done < <(find media -type f \( -iname '*.mp4' -o -iname '*.m4v' -o -iname '*.mov' \) -print0)
echo "changed=$changed" >> "${GITHUB_OUTPUT:-/dev/null}"
