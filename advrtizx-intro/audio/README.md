# DOMINANT - score (60.000 s, 30 fps, 112.5 BPM, D minor over an A pedal)

Rebuild everything (about 65 s on 4 cores; needs numpy scipy soundfile pyloudnorm numba matplotlib + ffmpeg):

    python3 advrtizx-intro/audio/score.py          # add --no-verify to skip report/plots

Outputs in `out/`: `score.wav` (48 kHz, 24-bit, stereo, exactly 2,880,000 samples), `stems/*.wav`
(impacts, drums, bass, music, fx, ambience, reverb - they sum to score.wav), `report.json`, `spectrogram.png`,
`waveform.png`, `events.json` (every placed event with sample position). Seeded and deterministic (dsp.SEED).
Note: advrtizx-intro/.gitignore excludes `out/`.

## Files
- `cues.py` - single source of truth: every frame, the harmony timeline, groove spans. `sample = round(frame*1600)`.
  Shift the whole score with `GLOBAL_SHIFT`, single cues/groups with `SHIFT = {"SELL": 2, "FLOOR_*": -1}`;
  derived events (whips, risers, layer starts) follow their anchors. `python3 cues.py` prints the cue list.
- `dsp.py` - filters (TPT SVF), band-limited wavetable oscillators, 4x oversampling for every nonlinearity,
  synthetic halls, compressor / soft clip / 4x true-peak limiter, BS.1770-4 meter.
- `synth.py` - instrument recipes. `score.py` - arrangement. `master.py` - buses, sidechain, reverbs, master chain.
  `verify.py` - measurement, report, images.

## Sound design
Idea: A is the dominant of D. The first impact plants A1 (55 Hz); an A pedal (drone + 16th bass) never resolves
for 46 s while Dm/A, Bb/A, Gm/A, A, A7, A7b9 rise above it. f1408 A7, f1440 D major (Picardy lift, open voicing
D1 D2 A2 D3 F#3 A3 D4 E4 F#5): a perfect cadence. Bell call A5->D6 is teased unresolved at f224 and f832, resolves f1536.
Hidden threads: floor slams climb the A7 arpeggio (A1..C#7), SOLD stamps climb it again, the ten city stabs climb
D harmonic minor A4->C#6, the UNISON collapses 64 scattered pings onto one sample.
- Impacts: tuned sub (pitch 2x->1x, saturated), concrete + steel modal body (1:2.76:5.40:8.93), 2-10 kHz crack, air blast,
  rumble, debris, groan; hall send. D impact tuned to D1.
- Braam: band-limited saw stack, +-4..12 cent detune over 4 octaves, staggered entries, fast filter envelope, growl, chiff.
- Drums: 150->45 Hz kick, membrane-mode taiko, multi-burst clap, snare, hats, steel anvils (construction as percussion).
- Pads, Shepard riser, noise risers, reverse-reverb swell, FM bell (1:3.5), SOLD stamp, wind and red-void drone.
- Mix: sidechain (look-ahead, from kick/impacts) on bass/music/ambience/reverb, bass mono < 120 Hz, 2-5 kHz tamed,
  glue comp 1.5:1, oversampled soft clip, 4x look-ahead limiter (-1.25 dBTP), loudness solved to -14.0 LUFS.
- Hard cuts: f72 (everything but lock + wind), f1376-1407 exact digital silence, reverbs convolved per segment so no tail crosses.
