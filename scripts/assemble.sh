#!/bin/sh
# Assembles the config UI: the renderer from a checkout of
# markdown-pages.js plus the content of site/. Used by the Pages workflow
# and by scripts/preview.sh, so the preview matches the published site.
#
#   scripts/assemble.sh <markdown-pages.js checkout> <output directory> [<openlitfass checkout>]
#
# With an openlitfass checkout, its source presets
# (backend/internal/config/presets/*.json) are copied to assets/presets/
# together with an index, so the source page can offer them without a
# request to another origin.
set -eu

renderer=${1:?usage: assemble.sh <renderer checkout> <output dir>}
out=${2:?usage: assemble.sh <renderer checkout> <output dir>}
root=$(cd "$(dirname "$0")/.." && pwd)

if [ ! -f "$renderer/markdown-pages.js" ]; then
  echo "assemble.sh: $renderer/markdown-pages.js not found" >&2
  exit 1
fi

# Empty the directory instead of replacing it, so a running preview server
# that has it mounted keeps seeing the new files.
mkdir -p "$out"
find "$out" -mindepth 1 -delete
# Only the renderer, the libraries it loads from assets/vendor/ (each with
# its licence) and its own licence; its sample pages, styles and README
# would otherwise show up next to ours.
cp "$renderer/markdown-pages.js" "$out/"
cp "$renderer/LICENSE" "$out/LICENSE-markdown-pages.txt"
mkdir -p "$out/assets"
cp -r "$renderer/assets/vendor" "$out/assets/"
cp -r "$root/site/." "$out/"

core=${3:-}
if [ -n "$core" ]; then
  presets="$core/backend/internal/config/presets"
  if [ ! -d "$presets" ]; then
    echo "assemble.sh: $presets not found" >&2
    exit 1
  fi
  mkdir -p "$out/assets/presets"
  names=""
  for file in "$presets"/*.json; do
    cp "$file" "$out/assets/presets/"
    names="$names${names:+,}\"$(basename "$file" .json)\""
  done
  printf '[%s]\n' "$names" > "$out/assets/presets/index.json"
else
  echo "assemble.sh: no openlitfass checkout given, the source page offers no presets" >&2
fi
echo "assembled $(find "$out" -type f | wc -l | tr -d ' ') files in $out"
