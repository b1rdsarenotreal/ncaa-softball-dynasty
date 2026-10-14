#!/bin/sh
# Syntax-check every module the way a browser parses it (as an ES module).
set -e
d=$(mktemp -d)
for f in "$(dirname "$0")"/../js/*.js; do cp "$f" "$d/m.mjs"; node --check "$d/m.mjs" || { echo "Syntax error in $f"; exit 1; }; done
rm -rf "$d"; echo "all modules parse"
