# Omnidra site

Static landing page for omnidraglobal.com. Plain HTML/CSS/JS + one WebAssembly file built from Zig.

- src/hero.zig  — the hero field: particles advected through a divergence-free flow field, trails tone-mapped to RGBA (wasm32-freestanding, no std, no imports).
- web/          — index.html (with __BASE_URL__ / __WASM_KB__ tokens), styles.css, script.js, favicons, og.jpg.
- build.sh      — ./build.sh -> dist/ for https://omnidraglobal.com ; BASE_URL=https://other.host ./build.sh outdir for another host.
- dist/         — ready to deploy (includes CNAME = omnidraglobal.com for GitHub Pages).
- test/         — node --test test/site.test.js (SITE_DIR=dist to point at a folder).

Zig 0.15.2: zig build-exe src/hero.zig -target wasm32-freestanding -fno-entry -rdynamic -O ReleaseSmall -fstrip
Contact: ruinkeen@omnidraglobal.com (first) and ruinkeen@aspectionstudios.com — two mailto links in the contact section of web/index.html.
