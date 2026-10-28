# Install and verify

These examples target macOS with Git, Python 3.12, FFmpeg, FFprobe and `uv`. They pin versions researched on 28 October 2026. Do not run into an existing folder. Repository: https://github.com/ohnoshivm/ohnoshivm-videoediting (public). This system lives under `systems/video-editing/`. The talking-head kit is withheld pending redistribution clearance.

## 1. Install the three studio sound skills (Codex or Claude Code)

Clone the repository once, inspect the files, then link the reviewed skills. These commands refuse existing targets; do not replace existing skills without reviewing the differences. Restart your agent session to discover newly installed skills.

```bash
git clone https://github.com/ohnoshivm/ohnoshivm-videoediting.git "$HOME/video-editing-system"
mkdir -p "$HOME/.agents/skills"
ln -s "$HOME/video-editing-system/systems/video-editing/skills/openverse-sfx" "$HOME/.agents/skills/openverse-sfx"
ln -s "$HOME/video-editing-system/systems/video-editing/skills/real-sfx" "$HOME/.agents/skills/real-sfx"
ln -s "$HOME/video-editing-system/systems/video-editing/skills/earshot" "$HOME/.agents/skills/earshot"
```

For Claude Code use `$HOME/.claude/skills` as the destination instead. For OpenBot import the three folders into its skill library and install them for the selected agent. These are skill instructions; Earshot and Real SFX also need the runtimes below. No talking-head kit is installed.

### Pinned upstream sources and runtime retrieval

These are the exact helper invocations used to retrieve the skill folders for inspection. The helper comes with Codex; `--dest` here keeps the upstream copies together rather than changing the video project. Their instructions and side effects still need review before use.

```bash
mkdir -p "$HOME/video-editing-sources/skills"
python3 "$HOME/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo Varnan-Tech/opendirectory --ref caac7cda5621e289591e4e74b400e66ac72ad25b \
  --path skills/openverse-sfx --dest "$HOME/video-editing-sources/skills" --method download
python3 "$HOME/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo Clipwing/skills --ref edbefcbc3474869e6cc1e8a7ca583b0efd0dab7e \
  --path skills/real-sfx --dest "$HOME/video-editing-sources/skills" --method download
python3 "$HOME/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo Leonxlnx/earshot --ref 591fa3e028032e6dce56620a20e932e35667e8d8 \
  --path skills/earshot --dest "$HOME/video-editing-sources/skills" --method download
```

`openverse-sfx` is a third-party Openverse-based skill; Openverse itself is a search service and API. Installation does not download individual Openverse sounds. The above commands install upstream copies; for the studio's extra approval, safety and workflow rules, use the versions in this package. In OpenBot, import each folder from `skills/` into the local skill library, then install it for the intended agent. The shared library and each agent's installed copy are separate; installing upstream files does not activate OpenBot skills automatically.

## 2. Earshot runtime

The `skills/earshot` file is instructions, not the CLI. Install the pinned runtime separately in a private tools directory:

```bash
git clone https://github.com/Leonxlnx/earshot.git "$HOME/video-editing-sources/earshot-runtime"
git -C "$HOME/video-editing-sources/earshot-runtime" checkout 591fa3e028032e6dce56620a20e932e35667e8d8
uv venv --python 3.12 "$HOME/video-editing-sources/earshot-runtime/.venv"
uv pip install --python "$HOME/video-editing-sources/earshot-runtime/.venv/bin/python" -e "$HOME/video-editing-sources/earshot-runtime"
EARSHOT_OFFLINE=1 "$HOME/video-editing-sources/earshot-runtime/.venv/bin/python" -m earshot doctor
```

On this machine the repository was cloned at that commit; dependency installation status is reported in STATUS.md. `doctor` with `EARSHOT_OFFLINE=1` will not fetch models. Earshot's model-backed functions need approximately 1.1 GB of CLAP and AST weights on first use. Review disk space and their Apache-2.0 and BSD-3-Clause licences and obtain any required approval before fetching. When approved, the upstream command is `python -m earshot doctor --fetch` using that environment. `EARSHOT_THREADS=2` or `3` limits CPU contention. Do not run `llm --yes-upload` on private material without explicit consent.

## 3. Real SFX runtime

```bash
export REAL_SFX_HOME="$HOME/video-editing-sources/skills/real-sfx"
python3 "$REAL_SFX_HOME/scripts/setup.py" check
ffmpeg -hide_banner -h filter=drawtext
ffmpeg -hide_banner -h filter=rubberband
```

Bring a legitimately licensed recording library and configure its location with the upstream setup guide. Its bundled `uisfx` pack has CC0 audio but is synthesized. An empty index is not a real recorded-sound library. Use a separate config outside a shareable skill folder (`REAL_SFX_CONFIG` is supported); inspect commands before they write indexes or render files. Some features need optional packages and filters.

## 4. First safe checks

```bash
python3 "$HOME/video-editing-sources/skills/openverse-sfx/scripts/sfx_search.py" --query "whoosh" --max-results 3 --max-ms 5000
EARSHOT_OFFLINE=1 "$HOME/video-editing-sources/earshot-runtime/.venv/bin/python" -m earshot doctor
python3 "$REAL_SFX_HOME/scripts/setup.py" check
```

A search returns candidate metadata, not cleared audio. If it times out or the doctor reports missing components, record that result; do not label a failed or unrun check as passed. Do not use the upstream arbitrary-URL fetcher unattended or let it overwrite an existing file. Download a specific sound only after its licence and any required approval are confirmed.
