// Omnidra hero field — a tiny flow-field renderer for wasm32-freestanding.
// No std, no allocator, no imports. JS calls init() once per size, then step()
// each frame and copies the RGBA buffer at pixels_ptr() onto a canvas.
//
// What it computes: ~1–2k particles advected through a divergence-free
// (curl-of-a-potential) velocity field that slowly drifts over time, leaving
// fading trails. The trail buffer is tone-mapped through a small palette LUT
// into transparent RGBA so the page's own background shows through.

const MAX_PX: usize = 420_000; // render-buffer pixel ceiling (~ 860x490)
const MAX_P: usize = 2400; // particle ceiling

var accum: [MAX_PX]f32 = undefined; // trail intensity
var pixels: [MAX_PX]u32 = undefined; // RGBA8 out (little-endian 0xAABBGGRR)
var lut: [256]u32 = undefined;

var px: [MAX_P]f32 = undefined;
var py: [MAX_P]f32 = undefined;
var life: [MAX_P]f32 = undefined;
var span: [MAX_P]f32 = undefined;
var bright: [MAX_P]f32 = undefined;

var W: u32 = 0;
var H: u32 = 0;
var N: u32 = 0;
var S: f32 = 1; // field scale in px (tracks the shorter side)
var t: f32 = 0; // simulated seconds
var rng: u32 = 0x9E3779B9;

var ptr_x: f32 = -1e6;
var ptr_y: f32 = -1e6;
var ptr_on: f32 = 0; // eased 0..1

const PI: f32 = 3.14159265;
const TWO_PI: f32 = 6.28318531;
const DT: f32 = 1.0 / 60.0;

fn rnd() f32 {
    // xorshift32 -> [0,1)
    rng ^= rng << 13;
    rng ^= rng >> 17;
    rng ^= rng << 5;
    return @as(f32, @floatFromInt(rng >> 8)) * (1.0 / 16777216.0);
}

// Fast sine: range-reduce to [-pi, pi], parabola + one refinement (~0.1% err).
fn fsin(x0: f32) f32 {
    const x = x0 - TWO_PI * @floor(x0 / TWO_PI + 0.5);
    const y = (4.0 / PI) * x - (4.0 / (PI * PI)) * x * @abs(x);
    return 0.225 * (y * @abs(y) - y) + y;
}

fn fcos(x: f32) f32 {
    return fsin(x + PI * 0.5);
}

fn spawn(i: usize) void {
    px[i] = rnd() * @as(f32, @floatFromInt(W));
    py[i] = rnd() * @as(f32, @floatFromInt(H));
    span[i] = 2.5 + rnd() * 5.0;
    life[i] = span[i] * (0.15 + 0.85 * rnd());
    // most particles faint, a few bright "carriers"
    const r = rnd();
    bright[i] = 0.18 + 0.55 * r * r * r;
}

fn buildLut() void {
    var i: u32 = 0;
    while (i < 256) : (i += 1) {
        const v: f32 = @as(f32, @floatFromInt(i)) / 255.0;
        // deep blue -> cyan -> near white; alpha follows a soft curve
        const r = 30.0 + 225.0 * v * v * v;
        const g = 90.0 + 160.0 * v * v;
        const b = 190.0 + 65.0 * v;
        const a = 255.0 * (1.0 - (1.0 - v) * (1.0 - v));
        const ri: u32 = @intFromFloat(@min(r, 255.0));
        const gi: u32 = @intFromFloat(@min(g, 255.0));
        const bi: u32 = @intFromFloat(@min(b, 255.0));
        const ai: u32 = @intFromFloat(@min(a, 255.0));
        lut[i] = (ai << 24) | (bi << 16) | (gi << 8) | ri;
    }
}

/// Size the buffers. Returns 0 if the request exceeds the static ceilings.
export fn init(w: u32, h: u32, n: u32, seed: u32) u32 {
    if (w == 0 or h == 0 or @as(usize, w) * @as(usize, h) > MAX_PX) return 0;
    W = w;
    H = h;
    N = if (n > MAX_P) @intCast(MAX_P) else n;
    S = @as(f32, @floatFromInt(@min(w, h)));
    rng = seed | 1;
    t = rnd() * 400.0;
    buildLut();
    const total: usize = @as(usize, w) * @as(usize, h);
    var k: usize = 0;
    while (k < total) : (k += 1) {
        accum[k] = 0;
        pixels[k] = 0;
    }
    var i: usize = 0;
    while (i < N) : (i += 1) spawn(i);
    return 1;
}

export fn pixels_ptr() [*]u32 {
    return &pixels;
}

var target_on: f32 = 0;

/// Pointer in buffer pixels; `on` eases a soft vortex in or out.
export fn set_pointer(x: f32, y: f32, on: u32) void {
    if (on != 0) {
        ptr_x = x;
        ptr_y = y;
    }
    target_on = if (on != 0) 1.0 else 0.0;
}

inline fn splat(x: f32, y: f32, amt: f32) void {
    if (x < 0 or y < 0) return;
    const fx = @floor(x);
    const fy = @floor(y);
    const ix: u32 = @intFromFloat(fx);
    const iy: u32 = @intFromFloat(fy);
    if (ix + 1 >= W or iy + 1 >= H) return;
    const ax = x - fx;
    const ay = y - fy;
    const o: usize = @as(usize, iy) * W + ix;
    accum[o] += amt * (1 - ax) * (1 - ay);
    accum[o + 1] += amt * ax * (1 - ay);
    accum[o + W] += amt * (1 - ax) * ay;
    accum[o + W + 1] += amt * ax * ay;
}

fn advance() void {
    t += DT;
    ptr_on += (target_on - ptr_on) * 0.04;

    // trail decay
    const total: usize = @as(usize, W) * @as(usize, H);
    var k: usize = 0;
    while (k < total) : (k += 1) accum[k] *= 0.935;

    const inv = 1.0 / S;
    const speed = S * 0.00115;
    const p1 = t * 0.050;
    const p2 = t * 0.037;
    const p3 = t * 0.031;
    const p4 = t * 0.061;
    const pu = ptr_x * inv;
    const pv = ptr_y * inv;
    const sig2: f32 = 0.045;

    var i: usize = 0;
    while (i < N) : (i += 1) {
        const u = px[i] * inv;
        const v = py[i] * inv;
        // potential psi = sin(a)sin(b) + .55 sin(c) + .28 sin(d) + .35 v ; vel = (dpsi/dv, -dpsi/du)
        const a = 1.30 * u + p1;
        const b = 1.10 * v - p2;
        const c = 2.70 * u + 1.90 * v + p3;
        const d = 4.30 * u - 3.10 * v - p4;
        const sa = fsin(a);
        const sb = fsin(b);
        const cc = fcos(c);
        const cd = fcos(d);
        var du = 1.30 * fcos(a) * sb + 0.55 * 2.70 * cc + 0.28 * 4.30 * cd;
        var dv = 1.10 * sa * fcos(b) + 0.55 * 1.90 * cc - 0.28 * 3.10 * cd + 0.35;
        if (ptr_on > 0.01) {
            // soft vortex around the pointer: psi += s / (1 + r^2/sig2)
            const ex = u - pu;
            const ey = v - pv;
            const q = (ex * ex + ey * ey) / sig2;
            const den = 1.0 + q;
            const g = -0.9 * ptr_on * 2.0 / (sig2 * den * den);
            du += g * ex;
            dv += g * ey;
        }
        px[i] += dv * speed;
        py[i] -= du * speed;

        life[i] -= DT;
        const fw = @as(f32, @floatFromInt(W));
        const fh = @as(f32, @floatFromInt(H));
        if (life[i] <= 0 or px[i] < -2 or py[i] < -2 or px[i] > fw + 2 or py[i] > fh + 2) {
            spawn(i);
            continue;
        }
        // fade in over the first 0.6 s and out over the last 0.8 s
        const age = span[i] - life[i];
        const fin = @min(age * 1.6, 1.0);
        const fout = @min(life[i] * 1.25, 1.0);
        splat(px[i], py[i], bright[i] * fin * fout);
    }
}

fn shade() void {
    const total: usize = @as(usize, W) * @as(usize, H);
    var k: usize = 0;
    while (k < total) : (k += 1) {
        const v = accum[k] * 185.0;
        const idx: u32 = if (v >= 255.0) 255 else @intFromFloat(v);
        pixels[k] = lut[idx];
    }
}

/// Advance `substeps` fixed 1/60 s steps, then tone-map once.
export fn step(substeps: u32) void {
    var s: u32 = 0;
    while (s < substeps) : (s += 1) advance();
    shade();
}
