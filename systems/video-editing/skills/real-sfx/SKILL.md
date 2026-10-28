---
name: real-sfx
description: Plan, place and measure sound effects for videos using Clipwing Real SFX and licensed recordings. Use for motion, talking-head and branded edits when SFX or a sound-design review is requested.
---

# Real SFX for the studio

Upstream: https://github.com/Clipwing/skills/tree/edbefcbc3474869e6cc1e8a7ca583b0efd0dab7e/skills/real-sfx. Clipwing documents its scripts as MIT; the bundled uisfx code is MIT and its audio is CC0. The UI pack is synthesized, even though this tool focuses on real recordings: never describe those cues as recordings.

## Before use

Set `REAL_SFX_HOME` to the upstream `skills/real-sfx` directory and read `$REAL_SFX_HOME/SKILL.md` and relevant `references/` before running it. Set the variable to the copy installed on your machine. Run `python3 "$REAL_SFX_HOME/scripts/setup.py" check`. This skill wrapper does not bundle or silently install its 997 upstream files. FFmpeg and ffprobe are required; some operations require FFmpeg filters `drawtext` and `rubberband` and optional dependencies. Check them explicitly. A missing filter, absent library or failed check is not success.

## Studio workflow

1. Use the edit's existing cue sheet if available. Otherwise inspect picture changes and create a reviewed cue sheet. Do not assume automatic event detection catches every movement.
2. Use founder-owned or specifically cleared sound; for missing sounds use `openverse-sfx` for research and per-item rights review. Existing synthesized studio sounds and the uisfx pack may be used as labeled synthetic effects when appropriate; do not misrepresent them as recordings.
3. Explicitly select sounds, verify source, license and attribution, use separate stems, retain dialogue and music, and avoid doubling a baked-in effect. Obtain approval before downloading any new third-party audio.
4. Run cue placement and `mix.py` on copies, using `--voice-safe` for speech; `--duck` when music is present, if compatible. Inspect generated cue times; source does not establish that the timeline or mix is correct by itself. Use Earshot where installed for model or measurement evidence.
5. Verify the finished file for duration, peak, loudness, voice audibility, cue alignment, mono issues and licenses. Keep a separate SFX stem. Model and numerical scores are fallible; request actual human listening of the entire mix and caption check. Do not claim the system can hear like a person.

Do not run `from_cues.py` on untrusted scripts or input projects: its script route can execute project code. Avoid automatic overwrites; use a new work folder. Do not upload media to any external service without explicit approval. Never publish or spend.
