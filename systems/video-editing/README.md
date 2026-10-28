# 3RDWRONG video editing system

A practical, extensible system for turning founder footage into reviewed short videos with deliberate sound. This package documents the editing workflow and three sound skills. It is not a complete automated editor.

## Start here

1. [Install and verify](INSTALL.md): pinned upstream sources, commands and environment checks.
2. [Editing and sound workflow](SOUND-WORKFLOW.md): how the four skills fit together and what each one does.
3. [Source and licence register](PROVENANCE.md): origins, limits and asset rights.
4. [Roadmap](ROADMAP.md): how to scale the system without losing source, review or licence boundaries.
5. [Verification status](STATUS.md): what was tested on the first machine and what remains open.

## The stack

| Component | Role | Human decision |
| --- | --- | --- |
| `talking-head-shorts` | Story, 30-second default, hook, cuts, brand, captions and review | Select truthful excerpts; check captions and the finished edit |
| `openverse-sfx` | Search candidate sounds and keep source/licence records | Approve a specific asset after checking its source and rights |
| `real-sfx` | Turn a cue sheet or observed motion into effects in a separate layer | Choose the right moments and sounds; listen to the full mix |
| `earshot` | Local measurements, model-based analysis and procedural SFX | Assess taste and meaning; check voice and sound by ear |
| FFmpeg | Trim/reframe footage, handle audio and encode | Approve cut points and protect meaning |
| Remotion | Code-driven graphics, captions, overlays and compositing | Design the visuals and inspect the render |

Use an NLE if a project benefits from it. Remotion does not choose or cut the founder's raw footage by itself. Do not claim that these tools can reliably understand speech, verify rights or replace listening.

## Boundaries

Keep raw footage, client material, credentials, installed packages, model weights, audio libraries, local configs, caches and rendered videos out of a public repository. Use only cleared assets with their licence/attribution recorded. Do not fetch models or sound libraries without the permissions that apply to the project. Do not publish, distribute client material, spend, or upload private media to a cloud model without the relevant approval. Never manufacture spoken claims or disguise synthetic voices as the founder.

The `skills/` directory contains the studio talking-head skill and kit, two adapted upstream sound skills and a lightweight Real SFX wrapper. The talking-head skill and kit are included after the founder confirmed ownership and approved public redistribution on 28 October 2026. The wrapper points to Clipwing's separately installed runtime. Review the source register before redistributing; Yashi owns repository location and release verification.
