#!/usr/bin/env bash
# shorts-sfx.sh <projectDir>
# Synthesises the kit's five SFX into <project>/public/shorts/sfx/.
# 48 kHz mono, peak <= -3 dBFS, idempotent (safe to re-run).
set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
FFMPEG="${FFMPEG:-ffmpeg}"
OUT="$PROJECT_DIR/public/shorts/sfx"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "shorts-sfx: project dir not found: $PROJECT_DIR" >&2
  exit 1
fi
if ! command -v "$FFMPEG" >/dev/null 2>&1; then
  echo "shorts-sfx: ffmpeg not found (set FFMPEG=/path/to/ffmpeg)" >&2
  exit 1
fi

mkdir -p "$OUT"

LIMIT="alimiter=limit=0.7079:level=false"
PCM=(-ac 1 -ar 48000 -c:a pcm_s16le)

echo "shorts-sfx → $OUT"

# whoosh: ~0.35 s of noise behind a brightening band-pass, faded in and out.
"$FFMPEG" -y -v error -f lavfi -i "anoisesrc=d=0.35:c=pink:r=48000:a=0.9" \
  -af "bandpass=f=1700:width_type=q:w=1.1,volume='if(isnan(t),0.1,0.1+3.0*t)':eval=frame,volume=9,treble=g=4:f=3000,afade=t=in:st=0:d=0.09,afade=t=out:st=0.23:d=0.12,$LIMIT" \
  "${PCM[@]}" "$OUT/whoosh.wav"

# pop: ~60 ms descending tone with a fast decay.
"$FFMPEG" -y -v error -f lavfi -i "aevalsrc=0.85*exp(-38*t)*sin(2*PI*(900*t-6000*t*t)):d=0.06:s=48000" \
  -af "afade=t=out:st=0.045:d=0.015,$LIMIT" \
  "${PCM[@]}" "$OUT/pop.wav"

# click: ~15 ms high-passed noise burst.
"$FFMPEG" -y -v error -f lavfi -i "anoisesrc=d=0.015:c=white:r=48000:a=0.9" \
  -af "highpass=f=2500,afade=t=out:st=0.004:d=0.011,$LIMIT" \
  "${PCM[@]}" "$OUT/click.wav"

# tick: ~10 ms 2 kHz blip.
"$FFMPEG" -y -v error -f lavfi -i "aevalsrc=0.8*exp(-320*t)*sin(2*PI*2000*t):d=0.012:s=48000" \
  -af "afade=t=out:st=0.007:d=0.005,$LIMIT" \
  "${PCM[@]}" "$OUT/tick.wav"

# ding: ~0.6 s 1320 Hz bell with a soft 2640 Hz overtone, exponential decay.
"$FFMPEG" -y -v error -f lavfi -i "aevalsrc=0.5*exp(-5.5*t)*(sin(2*PI*1320*t)+0.3*sin(2*PI*2640*t)):d=0.6:s=48000" \
  -af "afade=t=out:st=0.5:d=0.1,$LIMIT" \
  "${PCM[@]}" "$OUT/ding.wav"

fail=0
for f in whoosh pop click tick ding; do
  if [ ! -s "$OUT/$f.wav" ]; then
    echo "shorts-sfx: failed to write $OUT/$f.wav" >&2
    fail=1
    continue
  fi
  dur=$("$FFMPEG" -hide_banner -i "$OUT/$f.wav" 2>&1 | grep -o 'time=[0-9:.]*' | head -1 | cut -d= -f2 || true)
  peak=$("$FFMPEG" -hide_banner -nostats -i "$OUT/$f.wav" -af "astats=metadata=1:reset=0" -f null - 2>&1 \
    | grep -m1 "Peak level dB" | awk '{print $NF}' || true)
  printf '  %-9s %-11s peak %s dBFS\n' "$f.wav" "${dur:-?}" "${peak:-?}"
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "shorts-sfx: done (5 files)"
