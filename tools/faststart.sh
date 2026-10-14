#!/usr/bin/env bash
# Videos start playing before they have fully downloaded only when their
# index ("moov") sits at the front of the file. Phones and many editors put
# it at the end, so the whole file has to arrive first. This moves it to the
# front: a copy, not a re-encode, so every frame stays exactly the same.
set -euo pipefail
changed=0
while IFS= read -r -d '' f; do
  # Byte offsets of the index and the picture data; index first is fine.
  moov=$(grep -obUa 'moov' "$f" | head -1 | cut -d: -f1 || true)
  mdat=$(grep -obUa 'mdat' "$f" | head -1 | cut -d: -f1 || true)
  if [ -n "$moov" ] && [ -n "$mdat" ] && [ "$moov" -lt "$mdat" ]; then continue; fi
  tmp="$(mktemp --suffix=.mp4)"
  ffmpeg -v error -y -i "$f" -map 0 -c copy -movflags +faststart "$tmp"
  mv "$tmp" "$f"
  echo "faststart: $f"
  changed=1
done < <(find media -type f \( -iname '*.mp4' -o -iname '*.m4v' -o -iname '*.mov' \) -print0)
echo "changed=$changed" >> "${GITHUB_OUTPUT:-/dev/null}"
