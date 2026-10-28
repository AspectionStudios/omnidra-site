// Omnidra hero: loads hero.wasm (Zig, wasm32-freestanding) and blits its RGBA
// buffer to the canvas. Any failure leaves the CSS fallback in place.
(function () {
  var root = document.documentElement;
  var canvas = document.getElementById('field');
  var hero = document.querySelector('.hero');
  function fail() { root.classList.add('no-wasm'); }
  if (!canvas || !hero || typeof WebAssembly !== 'object' || !canvas.getContext) { fail(); return; }
  var ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) { fail(); return; }

  var motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var ex, img = null, bw = 0, bh = 0, scale = 1, visible = true, raf = 0, last = 0, running = false;
  var MAX_PX = 400000;

  function size() {
    var r = hero.getBoundingClientRect();
    var cw = Math.max(1, Math.round(r.width)), ch = Math.max(1, Math.round(r.height));
    // render a little under CSS resolution: soft glow, fewer pixels to move
    scale = Math.min(0.85, Math.sqrt(MAX_PX / (cw * ch)));
    bw = Math.max(16, Math.floor(cw * scale)); bh = Math.max(16, Math.floor(ch * scale));
    var n = Math.round(Math.min(2200, Math.max(500, (cw * ch) / 420)));
    if (!ex.init(bw, bh, n, (Math.random() * 4294967295) >>> 0)) return false;
    canvas.width = bw; canvas.height = bh;
    img = new ImageData(new Uint8ClampedArray(ex.memory.buffer, ex.pixels_ptr(), bw * bh * 4), bw, bh);
    return true;
  }
  function draw(sub) { ex.step(sub); ctx.putImageData(img, 0, 0); }
  function still() { draw(360); }
  function frame(now) {
    raf = 0;
    if (!running) return;
    var dt = last ? now - last : 16.7; last = now;
    var sub = Math.max(1, Math.min(3, Math.round(dt / 16.7)));
    draw(sub);
    raf = requestAnimationFrame(frame);
  }
  function update() {
    var want = visible && !document.hidden && !motion.matches;
    if (want && !running) { running = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); }
    else if (!want && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  }

  function start(instance) {
    ex = instance.exports;
    if (!size()) { fail(); return; }
    draw(motion.matches ? 360 : 90); // pre-warm so the first visible frame already has trails
    root.classList.add('wasm-on');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; update(); }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener('visibilitychange', update);
    var onMotion = function () { if (motion.matches) still(); update(); };
    if (motion.addEventListener) motion.addEventListener('change', onMotion); else if (motion.addListener) motion.addListener(onMotion);
    var rt = 0, lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      // ignore mobile URL-bar height jitter; re-size on real width changes
      if (Math.abs(window.innerWidth - lastW) < 2 && running) return;
      clearTimeout(rt);
      rt = setTimeout(function () { lastW = window.innerWidth; if (size()) { draw(90); } }, 180);
    });
    if (window.matchMedia && window.matchMedia('(pointer:fine)').matches) {
      hero.addEventListener('pointermove', function (e) {
        var r = canvas.getBoundingClientRect();
        ex.set_pointer((e.clientX - r.left) * scale, (e.clientY - r.top) * scale, 1);
      }, { passive: true });
      hero.addEventListener('pointerleave', function () { ex.set_pointer(0, 0, 0); }, { passive: true });
    }
    update();
  }

  try {
    var req = fetch('hero.wasm', { credentials: 'same-origin' });
    var go = WebAssembly.instantiateStreaming
      ? WebAssembly.instantiateStreaming(req, {}).catch(function () {
          return fetch('hero.wasm').then(function (r) { return r.arrayBuffer(); }).then(function (b) { return WebAssembly.instantiate(b, {}); });
        })
      : req.then(function (r) { return r.arrayBuffer(); }).then(function (b) { return WebAssembly.instantiate(b, {}); });
    go.then(function (res) { try { start(res.instance); } catch (e) { fail(); } }, fail);
  } catch (e) { fail(); }
})();


// Cross-site crossfade (Omnidra -> Aspection Studios) + arrival from aspectionstudios.com. rAF-throttled.
(function () {
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // arrival: ?from=aspection -> open on the frame Aspection's Omnidra section ended on, settle, then clean the URL
  if (/[?&]from=aspection(&|$)/.test(location.search)) {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
  }
  if (root.classList.contains('arrive')) {
    setTimeout(function () { root.classList.add('arrive-go'); }, 420);
    setTimeout(function () { root.classList.remove('arrive', 'arrive-go'); }, 1700);
  }
  var sec = document.querySelector('.xf-studio');
  if (!sec) return;
  var stage = sec.querySelector('.xf-stage');
  var raf = 0, near = false, last = '';
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function seg(p, a, b) { return ease(clamp((p - a) / (b - a))); }
  function apply(p) {
    var out = seg(p, 0.04, 0.46), bg = seg(p, 0.1, 0.66), inn = seg(p, 0.36, 0.84), nav = seg(p, 0.55, 0.92);
    if (mq.matches) { out = bg = inn = nav = p >= 0.3 ? 1 : 0; }
    var v = [out, bg, inn, nav].map(function (x) { return x.toFixed(3); });
    var key = v.join();
    if (key === last) return;
    last = key;
    sec.style.setProperty('--out', v[0]); sec.style.setProperty('--bg', v[1]);
    sec.style.setProperty('--in', v[2]); sec.style.setProperty('--nav', v[3]);
    if (inn > 0.6) sec.setAttribute('data-end', ''); else sec.removeAttribute('data-end');
  }
  function tick() {
    raf = 0;
    var r = sec.getBoundingClientRect(), d = sec.offsetHeight - stage.offsetHeight;
    apply(d > 0 ? clamp(-r.top / d) : 1);
  }
  function req() { if (!raf) raf = requestAnimationFrame(tick); }
  sec.classList.toggle('xf-rm', mq.matches);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      near = e[0].isIntersecting;
      if (near) { sec.classList.add('xf-near'); req(); }
    }, { rootMargin: '100% 0px 100% 0px' }).observe(sec);
  } else { near = true; sec.classList.add('xf-near'); }
  window.addEventListener('scroll', function () { if (near) req(); }, { passive: true });
  window.addEventListener('resize', req);
  var onMq = function () { sec.classList.toggle('xf-rm', mq.matches); last = ''; req(); };
  if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  tick();
})();
