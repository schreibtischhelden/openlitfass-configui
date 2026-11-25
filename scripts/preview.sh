#!/bin/sh
# Local preview at http://localhost:8001: clones markdown-pages.js into
# .renderer/ (once; delete the folder to update it), assembles the site into
# .preview/ (with the source presets of ../openlitfass, if present) and
# serves it with a static web server in Docker.
#
#   scripts/preview.sh            assemble and serve
#   scripts/preview.sh assemble   assemble only (after editing site/)
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

if [ ! -d .renderer ]; then
  git clone -q --depth 1 https://github.com/schreibtischhelden/markdown-pages.js .renderer
fi
# The presets come from the core next to this repository, if it is there.
core=""
if [ -d ../openlitfass/backend/internal/config/presets ]; then core=../openlitfass; fi
scripts/assemble.sh .renderer .preview $core

if [ "${1:-}" = assemble ]; then
  exit 0
fi

# pwd -W gives a Windows path in Git Bash; MSYS_NO_PATHCONV keeps it intact.
dir=$(pwd -W 2>/dev/null || pwd)/.preview
MSYS_NO_PATHCONV=1 docker run --rm --name ol-configui -p 8001:80 \
  -v "$dir:/usr/share/nginx/html:ro" nginx:1.29-alpine
