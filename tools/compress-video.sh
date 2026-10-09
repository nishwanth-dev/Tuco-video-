#!/usr/bin/env bash
# Shrinks videos for the web: max 720p wide, H.264, fast start, plus a poster image.
# Usage: tools/compress-video.sh input.mp4 [more.mp4 ...]   (needs ffmpeg: brew install ffmpeg)
set -euo pipefail
command -v ffmpeg >/dev/null || { echo "ffmpeg not found. Install it with: brew install ffmpeg"; exit 1; }
for f in "$@"; do
  base="${f%.*}"
  # scale keeps the shape; the longest side is capped at 1280 so vertical and wide videos both stay at 720p quality
  ffmpeg -y -loglevel error -i "$f" \
    -vf "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'" \
    -c:v libx264 -preset slow -crf 27 -pix_fmt yuv420p -movflags +faststart \
    -c:a aac -b:a 96k -ac 2 "${base}-web.mp4"
  ffmpeg -y -loglevel error -ss 0.5 -i "${base}-web.mp4" -frames:v 1 -q:v 4 "${base}-poster.jpg"
  before=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f"); after=$(stat -f%z "${base}-web.mp4" 2>/dev/null || stat -c%s "${base}-web.mp4")
  echo "$f: $((before/1024)) KB -> $((after/1024)) KB  (${base}-web.mp4, ${base}-poster.jpg)"
done
