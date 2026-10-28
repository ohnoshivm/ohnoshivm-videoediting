#!/usr/bin/env bash
# shorts-finish.sh <in.mp4> <out.mp4>
# Two-pass loudnorm to I=-14 LUFS / TP=-1 dBTP / LRA=7, video stream copied,
# audio AAC 192k. Prints the measured result with ebur128.
set -euo pipefail

IN="${1:-}"
OUT="${2:-}"
FFMPEG="${FFMPEG:-ffmpeg}"

if [ -z "$IN" ] || [ -z "$OUT" ]; then
  echo "usage: shorts-finish.sh <in.mp4> <out.mp4>" >&2
  exit 1
fi
if [ ! -f "$IN" ]; then
  echo "shorts-finish: input not found: $IN" >&2
  exit 1
fi
if ! command -v "$FFMPEG" >/dev/null 2>&1; then
  echo "shorts-finish: ffmpeg not found" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "shorts-finish: node not found (needed to parse the loudnorm JSON)" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT

echo "shorts-finish: measuring $IN"
if ! "$FFMPEG" -hide_banner -nostats -i "$IN" \
  -af "loudnorm=I=-14:TP=-1:LRA=7:print_format=json" \
  -f null - 2>"$LOG"; then
  echo "shorts-finish: loudness measurement failed" >&2
  tail -n 20 "$LOG" >&2
  exit 1
fi

VALS="$(node -e '
const fs = require("fs");
const s = fs.readFileSync(process.argv[1], "utf8");
const i = s.lastIndexOf("{");
const j = s.indexOf("}", i);
if (i < 0 || j < 0) { console.error("no loudnorm JSON in ffmpeg output"); process.exit(1); }
const o = JSON.parse(s.slice(i, j + 1));
if (o.input_i === undefined) { console.error("loudnorm JSON missing input_i"); process.exit(1); }
console.log([o.input_i, o.input_lra, o.input_tp, o.input_thresh, o.target_offset].join(" "));
' "$LOG")" || { echo "shorts-finish: could not parse loudness measurement" >&2; exit 1; }

read -r M_I M_LRA M_TP M_THRESH M_OFFSET <<<"$VALS"
echo "  measured  I=${M_I} LUFS  LRA=${M_LRA} LU  TP=${M_TP} dBTP  thresh=${M_THRESH} dB  offset=${M_OFFSET}"

echo "shorts-finish: writing $OUT (video copy, two-pass loudnorm)"
"$FFMPEG" -y -v error -i "$IN" \
  -c:v copy \
  -af "loudnorm=I=-14:TP=-1:LRA=7:measured_I=${M_I}:measured_LRA=${M_LRA}:measured_TP=${M_TP}:measured_thresh=${M_THRESH}:offset=${M_OFFSET}:linear=true:print_format=summary" \
  -c:a aac -b:a 192k -ar 48000 -ac 2 \
  -movflags +faststart \
  "$OUT"

echo "shorts-finish: final measurement"
"$FFMPEG" -hide_banner -nostats -i "$OUT" -af "ebur128=peak=true" -f null - 2>&1 \
  | awk '/Summary:/{f=1} f' | grep -E "I:|LRA:|Peak:" | sed 's/^/  /'
