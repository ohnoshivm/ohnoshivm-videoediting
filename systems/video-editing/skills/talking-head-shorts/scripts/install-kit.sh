#!/usr/bin/env bash
# install-kit.sh <remotionProjectDir>
# Copies the canonical kit into a Remotion project, installs the two allowed
# @remotion/* deps at the project's exact remotion version, and prints the
# Root.tsx registration snippet. Idempotent; never deletes other files.
set -euo pipefail

PROJECT="${1:-$(pwd)}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT="$(cd "$HERE/../kit" && pwd)"

if [ ! -d "$PROJECT" ]; then
  echo "install-kit: project dir not found: $PROJECT" >&2
  exit 1
fi
if [ ! -f "$PROJECT/package.json" ]; then
  echo "install-kit: $PROJECT has no package.json — not a Remotion project" >&2
  exit 1
fi
if [ ! -d "$KIT/src/shorts" ]; then
  echo "install-kit: kit source missing at $KIT/src/shorts" >&2
  exit 1
fi

cd "$PROJECT"

REMOTION_VERSION="$(node -e "
  try { console.log(require('remotion/package.json').version); }
  catch { try { console.log(require('./package.json').dependencies.remotion); } catch { process.exit(1); } }
")"
if [ -z "${REMOTION_VERSION:-}" ]; then
  echo "install-kit: cannot determine the project's remotion version (run npm install first)" >&2
  exit 1
fi
REMOTION_VERSION="${REMOTION_VERSION#^}"
echo "install-kit → $PROJECT (remotion $REMOTION_VERSION)"

mkdir -p "$PROJECT/src/shorts" "$PROJECT/scripts"

if command -v rsync >/dev/null 2>&1; then
  rsync -a "$KIT/src/shorts/" "$PROJECT/src/shorts/"
  rsync -a "$KIT/scripts/" "$PROJECT/scripts/"
else
  cp -R "$KIT/src/shorts/." "$PROJECT/src/shorts/"
  cp -R "$KIT/scripts/." "$PROJECT/scripts/"
fi
chmod +x "$PROJECT"/scripts/*.sh "$PROJECT"/scripts/*.mjs 2>/dev/null || true

SRC_COUNT="$(find "$PROJECT/src/shorts" -type f | wc -l | tr -d ' ')"
SCRIPT_COUNT="$(find "$PROJECT/scripts" -type f | wc -l | tr -d ' ')"
echo "  src/shorts  $SRC_COUNT files"
echo "  scripts     $SCRIPT_COUNT files"

# --- dependencies: only the two approved packages, pinned to remotion's version
version_of() {
  node -e "
    try { console.log(require('$1/package.json').version); }
    catch { process.exit(1); }
  " 2>/dev/null || true
}

MISSING=()
for dep in "@remotion/google-fonts" "@remotion/install-whisper-cpp"; do
  HAVE="$(version_of "$dep")"
  if [ "$HAVE" != "$REMOTION_VERSION" ]; then
    MISSING+=("$dep@$REMOTION_VERSION")
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "  installing: ${MISSING[*]}"
  npm install --save-exact --no-audit --no-fund "${MISSING[@]}"
else
  echo "  deps        @remotion/google-fonts, @remotion/install-whisper-cpp @ $REMOTION_VERSION"
fi

cat <<'EOF'

Register the composition in src/Root.tsx (add the import and the element;
leave every existing composition untouched):

  import {ShortsEditComposition} from './shorts/Composition';

  // inside <RemotionRoot />
  <ShortsEditComposition />

Render an edit:

  npx remotion still  ShortsEdit out/f0120.png --props=public/shorts/<slug>/edit.json --frame=120
  npx remotion render ShortsEdit out/<slug>.mp4 --props=public/shorts/<slug>/edit.json
  bash scripts/shorts-finish.sh out/<slug>.mp4 out/<slug>-final.mp4

Validate before rendering:

  node scripts/shorts-validate.mjs public/shorts/<slug>/edit.json

The composition's defaultProps point at public/shorts/poppi-test/edit.json's
data (src/shorts/defaultEdit.ts). Always pass --props for real work.
EOF
