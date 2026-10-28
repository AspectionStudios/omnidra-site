#!/usr/bin/env bash
# Build Omnidra's site: Zig -> wasm32-freestanding, then assemble dist/.
#   ./build.sh                       -> dist/ for https://omnidraglobal.com
#   BASE_URL=https://x.y ./build.sh out_dir   -> same site, absolute URLs on another host
set -euo pipefail
cd "$(dirname "$0")"
ZIG="${ZIG:-/home/user/tab/work/zig/zig}"
BASE_URL="${BASE_URL:-https://omnidraglobal.com}"
OUT="${1:-dist}"
mkdir -p build "$OUT"
timeout -k 5 120 "$ZIG" build-exe src/hero.zig -target wasm32-freestanding -fno-entry -rdynamic \
  -O ReleaseSmall -fstrip -femit-bin=build/hero.wasm
rm -f build/hero.wasm.o
WASM_BYTES=$(stat -c %s build/hero.wasm)
WASM_KB=$(awk "BEGIN{printf \"%.1f\", ${WASM_BYTES}/1024}")
cp build/hero.wasm "$OUT/hero.wasm"
cp web/styles.css web/script.js web/favicon.svg "$OUT/"
for f in web/og.jpg web/favicon-32.png web/apple-touch-icon.png; do [ -f "$f" ] && cp "$f" "$OUT/"; done
sed -e "s#__BASE_URL__#${BASE_URL}#g" -e "s#__WASM_KB__#${WASM_KB}#g" web/index.html > "$OUT/index.html"
for f in robots.txt sitemap.xml; do sed -e "s#__BASE_URL__#${BASE_URL}#g" "web/$f" > "$OUT/$f"; done
echo "omnidraglobal.com" > "$OUT/CNAME"
echo "built $OUT (hero.wasm ${WASM_BYTES} B, base ${BASE_URL})"
