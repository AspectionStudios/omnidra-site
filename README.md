# omnidra-site

Landing page for **Omnidra**, an independent AI research lab: https://omnidraglobal.com

The site is static: plain HTML/CSS/JS plus one WebAssembly file. The hero's flow field is computed live by a small Zig program (`src/src/hero.zig`) compiled to `wasm32-freestanding`.

- Repo root: the built site, served by GitHub Pages from `main` / root. `CNAME` = omnidraglobal.com.
- `src/`: the source. Run `./build.sh` there with Zig 0.15.2 to rebuild into `src/dist/`, then copy the output to the repo root. Tests: `node --test test/site.test.js`.

Contact: ruinkeen@omnidraglobal.com · ruinkeen@aspectionstudios.com · (873) 349-2216

© 2026 Omnidra
