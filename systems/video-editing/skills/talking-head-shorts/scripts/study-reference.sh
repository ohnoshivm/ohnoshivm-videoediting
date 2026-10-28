#!/usr/bin/env bash
# study-reference.sh <video> <outdir> [--strip <startFrame>]
#
# Reverse-engineers a reference short with ffmpeg only:
#   probe.txt      ffprobe streams + format
#   cuts.txt       scene-cut times (scdet threshold=10)
#   sheet_NN.png   contact sheets: fps=2, 144x256 tiles, 10x4 = 4 s each
#                  (tile i on sheet k = ((k-1)*40 + i) * 0.5 s)
#   spectrogram.png
#   loudness.txt   ebur128 integrated / LRA / true peak
#   pauses.txt     silencedetect count / total / longest
#   summary.md     everything above + shot lengths
set -euo pipefail

FFMPEG="${FFMPEG:-ffmpeg}"
FFPROBE="${FFPROBE:-ffprobe}"

VIDEO=""
OUTDIR=""
STRIP=""

while [ $# -gt 0 ]; do
  case "$1" in
    --strip)
      STRIP="${2:-}"
      if [ -z "$STRIP" ]; then
        echo "study-reference: --strip needs a start frame" >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      echo "usage: study-reference.sh <video> <outdir> [--strip <startFrame>]" >&2
      exit 0
      ;;
    *)
      if [ -z "$VIDEO" ]; then VIDEO="$1"; elif [ -z "$OUTDIR" ]; then OUTDIR="$1"; fi
      shift
      ;;
  esac
done

if [ -z "$VIDEO" ] || [ -z "$OUTDIR" ]; then
  echo "usage: study-reference.sh <video> <outdir> [--strip <startFrame>]" >&2
  exit 1
fi
if [ ! -f "$VIDEO" ]; then
  echo "study-reference: video not found: $VIDEO" >&2
  exit 1
fi
if ! command -v "$FFMPEG" >/dev/null 2>&1 || ! command -v "$FFPROBE" >/dev/null 2>&1; then
  echo "study-reference: ffmpeg/ffprobe not found" >&2
  exit 1
fi

mkdir -p "$OUTDIR"

# ------------------------------------------------------------------- probe
"$FFPROBE" -hide_banner -v error -show_streams -show_format "$VIDEO" > "$OUTDIR/probe.txt"

DURATION="$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$VIDEO")"
HAS_AUDIO="$("$FFPROBE" -v error -select_streams a -show_entries stream=index -of csv=p=0 "$VIDEO" | head -1)"
WIDTH="$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "$VIDEO")"
HEIGHT="$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$VIDEO")"
FPS="$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=avg_frame_rate -of csv=p=0 "$VIDEO")"
CODEC="$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$VIDEO")"

# -------------------------------------------------------------------- cuts
"$FFMPEG" -hide_banner -nostats -i "$VIDEO" \
  -vf "scdet=threshold=10:sc_pass=1,metadata=print:file=-" \
  -f null - 2>/dev/null > "$OUTDIR/cuts_raw.txt" || true
grep 'lavfi.scd.time' "$OUTDIR/cuts_raw.txt" 2>/dev/null | sed 's/.*=//' | sort -n > "$OUTDIR/cuts.txt" || true
rm -f "$OUTDIR/cuts_raw.txt"

# ----------------------------------------------------------- contact sheets
rm -f "$OUTDIR"/sheet_*.png
"$FFMPEG" -y -v error -i "$VIDEO" \
  -vf "fps=2,scale=144:256,tile=10x4:padding=2:margin=0:color=red" \
  -vsync 0 "$OUTDIR/sheet_%02d.png"

# ------------------------------------------------------------- spectrogram
if [ -n "$HAS_AUDIO" ]; then
  "$FFMPEG" -y -v error -i "$VIDEO" \
    -lavfi "showspectrumpic=s=1600x300:legend=1:scale=log:fscale=log:stop=12000" \
    "$OUTDIR/spectrogram.png"

  # ------------------------------------------------------------- loudness
  "$FFMPEG" -hide_banner -nostats -i "$VIDEO" -af "ebur128=peak=true" -f null - 2>&1 \
    | awk '/Summary:/{f=1} f' > "$OUTDIR/loudness.txt"

  # --------------------------------------------------------------- pauses
  "$FFMPEG" -hide_banner -nostats -i "$VIDEO" \
    -af "silencedetect=noise=-40dB:d=0.08" -f null - 2>&1 \
    | grep -E "silence_(start|end)" > "$OUTDIR/pauses.txt" || true
else
  : > "$OUTDIR/loudness.txt"
  : > "$OUTDIR/pauses.txt"
  echo "study-reference: no audio stream — skipping spectrogram/loudness/pauses" >&2
fi

# -------------------------------------------------------------- strip (opt)
if [ -n "$STRIP" ]; then
  END=$((STRIP + 19))
  "$FFMPEG" -y -v error -i "$VIDEO" \
    -vf "fps=30,select='between(n,${STRIP},${END})',scale=144:256,tile=10x2:padding=2:margin=0:color=red" \
    -vsync 0 -frames:v 1 "$OUTDIR/strip_${STRIP}.png"
fi

# ------------------------------------------------------------- statistics
SHOT_STATS="$(awk -v dur="$DURATION" '
  { cuts[NR] = $1 }
  END {
    n = 0; total = 0
    prev = 0
    for (i = 1; i <= NR; i++) {
      len = cuts[i] - prev
      if (len > 0) { lens[n++] = len; total += len }
      prev = cuts[i]
    }
    len = dur - prev
    if (len > 0) { lens[n++] = len; total += len }
    if (n == 0) { print "0 0 0"; exit }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) if (lens[j] < lens[i]) { t = lens[i]; lens[i] = lens[j]; lens[j] = t }
    median = (n % 2 == 1) ? lens[int(n / 2)] : (lens[n / 2 - 1] + lens[n / 2]) / 2
    printf "%d %.3f %.3f\n", n, total / n, median
  }
' "$OUTDIR/cuts.txt")"

read -r SHOT_COUNT SHOT_MEAN SHOT_MEDIAN <<<"$SHOT_STATS"
CUT_COUNT="$(wc -l < "$OUTDIR/cuts.txt" | tr -d ' ')"

PAUSE_SUMMARY="$(awk '
  /silence_start/ { for (i = 1; i <= NF; i++) if ($i == "silence_start:") start = $(i + 1); count++ }
  /silence_end/   {
    for (i = 1; i <= NF; i++) if ($i == "silence_end:") end = $(i + 1)
    d = end - start
    total += d
    if (d > longest) longest = d
    next
  }
  END {
    if (count == 0) { printf "0 0.000 0.000\n"; exit }
    printf "%d %.3f %.3f\n", count, total, longest
  }
' "$OUTDIR/pauses.txt")"

read -r PAUSE_COUNT PAUSE_TOTAL PAUSE_LONGEST <<<"$PAUSE_SUMMARY"

LOUD_I="$(grep -m1 'I:' "$OUTDIR/loudness.txt" | awk '{print $2}' || true)"
LOUD_LRA="$(grep -m1 'LRA:' "$OUTDIR/loudness.txt" | awk '{print $2}' || true)"
LOUD_PEAK="$(grep -m1 'Peak:' "$OUTDIR/loudness.txt" | awk '{print $2}' || true)"

# ---------------------------------------------------------------- summary
{
  echo "# Reference study — $(basename "$VIDEO")"
  echo
  echo "Probed with ffmpeg only. Times in seconds unless stated."
  echo
  echo "| property | value |"
  echo "|---|---|"
  echo "| duration | ${DURATION} s |"
  echo "| frame | ${WIDTH}x${HEIGHT} @ ${FPS} |"
  echo "| video codec | ${CODEC} |"
  echo "| audio | ${HAS_AUDIO:+yes} |"
  echo "| scene cuts | ${CUT_COUNT} |"
  echo "| shot length mean | ${SHOT_MEAN} s |"
  echo "| shot length median | ${SHOT_MEDIAN} s |"
  echo "| integrated loudness | ${LOUD_I:-n/a} LUFS |"
  echo "| loudness range | ${LOUD_LRA:-n/a} LU |"
  echo "| true peak | ${LOUD_PEAK:-n/a} dBTP |"
  echo "| silences ≥80 ms below −40 dBFS | ${PAUSE_COUNT} (total ${PAUSE_TOTAL} s, longest ${PAUSE_LONGEST} s) |"
  echo
  echo "## Scene cuts"
  echo
  if [ -s "$OUTDIR/cuts.txt" ]; then
    echo '```'
    cat "$OUTDIR/cuts.txt"
    echo '```'
  else
    echo "_No cuts detected at scdet threshold 10._"
  fi
  echo
  echo "## Contact sheets"
  echo
  echo "fps=2, tiles of 144x256, 10x4 per sheet, padding 2 px on red."
  echo "Tile index i on sheet k shows t = ((k−1)·40 + i)·0.5 s (0-based i)."
  echo
  for sheet in "$OUTDIR"/sheet_*.png; do
    [ -e "$sheet" ] || continue
    echo "- \`$(basename "$sheet")\`"
  done
  echo
  echo "## Audio"
  echo
  echo "- \`spectrogram.png\` — showspectrumpic 1600x300, log frequency and log scale, up to 12 kHz."
  echo "- \`loudness.txt\` — ebur128 summary (integrated, LRA, true peak)."
  echo "- \`pauses.txt\` — silencedetect at −40 dBFS / 80 ms."
  if [ -n "$STRIP" ]; then
    echo
    echo "## Frame strip"
    echo
    echo "- \`strip_${STRIP}.png\` — 20 frames from n=${STRIP} at 30 fps, 144x256 tiles, 10x2."
  fi
} > "$OUTDIR/summary.md"

echo "study-reference → $OUTDIR"
echo "  ${WIDTH}x${HEIGHT} @ ${FPS} · ${DURATION}s · ${CUT_COUNT} cuts / ${SHOT_COUNT} shots (mean ${SHOT_MEAN}s, median ${SHOT_MEDIAN}s)"
echo "  loudness ${LOUD_I:-n/a} LUFS · LRA ${LOUD_LRA:-n/a} LU · peak ${LOUD_PEAK:-n/a} dBTP"
echo "  silences ${PAUSE_COUNT} (longest ${PAUSE_LONGEST}s)"
