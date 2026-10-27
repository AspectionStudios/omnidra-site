// node --test test/site.test.js — checks the built site folder (SITE_DIR, else ../site, else ../dist).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const SITE = process.env.SITE_DIR || (fs.existsSync(path.join(__dirname, '..', 'site')) ? path.join(__dirname, '..', 'site') : path.join(__dirname, '..', 'dist'));
const read = f => fs.readFileSync(path.join(SITE, f), 'utf8');
const html = read('index.html');

test('title, viewport, description, og/twitter tags', () => {
  assert.match(html, /<title>Omnidra — independent AI research lab<\/title>/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(html, /<meta name="description" content="[^"]{40,}">/);
  for (const p of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:width', 'og:image:height'])
    assert.ok(html.includes(`property="${p}"`), p);
  assert.match(html, /property="og:image" content="https:\/\/[^"]+\/og\.jpg"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
});

test('core content: hero, both research areas, why, contact, footer', () => {
  assert.match(html, /<h1>Omnidra<\/h1>/);
  assert.match(html, /Test-time training/);
  assert.match(html, /old and edge hardware/);
  assert.match(html, /without crushing them through heavy quantization/);
  assert.match(html, /AI that runs on the hardware people actually have\./);
  assert.match(html, /<a class="mail" href="mailto:ruinkeen@omnidraglobal\.com">ruinkeen@omnidraglobal\.com<\/a>/);
  assert.doesNotMatch(html, /coming soon|PLACEHOLDER/i);
  assert.match(html, /© 2026 Omnidra/);
  assert.match(html, /<main id="main">/);
  assert.match(html, /<nav[^>]*aria-label="Primary"/);
});

test('no unreleased project names, no leftover template tokens, no invented claims', () => {
  assert.doesNotMatch(html, /\bZIF\b/i);
  assert.doesNotMatch(html, /__[A-Z_]+__/);
  assert.doesNotMatch(html, /lorem|TODO|testimonial|funded|customers/i);
});

test('every local asset referenced exists; no remote assets', () => {
  // the canonical link is the page's own absolute address, not an asset
  const body = html.replace(/<link rel="canonical"[^>]*>/, '');
  assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+\/">/);
  const refs = [...body.matchAll(/(?:href|src)="([^"#]+)"/g)].map(m => m[1]);
  for (const r of refs) {
    if (/^mailto:/.test(r)) continue;
    if (/^https?:/.test(r)) { assert.fail('remote asset ' + r); }
    assert.ok(fs.existsSync(path.join(SITE, r)), 'missing ' + r);
  }
  for (const f of ['og.jpg', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'hero.wasm', 'script.js', 'styles.css'])
    assert.ok(fs.existsSync(path.join(SITE, f)), f);
});

test('og.jpg is 1200x630', () => {
  const b = fs.readFileSync(path.join(SITE, 'og.jpg'));
  let i = 2; let size = null;
  while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc2) { size = [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; break; } i += 2 + len; }
  assert.deepStrictEqual(size, [1200, 630]);
});

test('CNAME names omnidraglobal.com', () => {
  assert.strictEqual(read('CNAME').trim(), 'omnidraglobal.com');
});

test('hero.wasm instantiates with no imports and renders non-empty pixels', async () => {
  const bytes = fs.readFileSync(path.join(SITE, 'hero.wasm'));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const e = instance.exports;
  for (const k of ['memory', 'init', 'step', 'pixels_ptr', 'set_pointer']) assert.ok(k in e, k);
  assert.strictEqual(e.init(320, 200, 600, 7), 1);
  assert.strictEqual(e.init(5000, 5000, 600, 7), 0, 'oversize request refused');
  e.init(320, 200, 600, 7);
  e.step(120);
  const px = new Uint8Array(e.memory.buffer, e.pixels_ptr(), 320 * 200 * 4);
  let lit = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 40) lit++;
  assert.ok(lit > 500, 'lit pixels ' + lit);
  assert.ok(lit < 320 * 200 * 0.6, 'field stays subtle, lit ' + lit);
});

test('fallback + motion handling are wired in script.js / styles.css', () => {
  const js = read('script.js'), css = read('styles.css');
  assert.match(js, /no-wasm/); assert.match(js, /IntersectionObserver/); assert.match(js, /prefers-reduced-motion/);
  assert.match(js, /visibilitychange/);
  assert.match(css, /prefers-reduced-motion:reduce/); assert.match(css, /\.field-fallback/);
});

test('total payload under 300 KB', () => {
  let total = 0; for (const f of fs.readdirSync(SITE)) total += fs.statSync(path.join(SITE, f)).size;
  assert.ok(total < 300 * 1024, 'payload ' + total);
});
