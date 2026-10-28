// Generates wood-grain.png: a seamless, tileable overlay of brown at varying alpha, so grain
// darkens whatever colour sits beneath it. Every term is periodic in both axes, so tiles join.
// Usage: node gen-wood-grain.js   (needs ffmpeg to write the PNG)
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path');
const W = 512, H = 1024;
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const terms = [];
for (let i = 0; i < 90; i++) {            // long thin vertical streaks: high x-frequency, very low y-frequency
  const kx = 3 + Math.floor(Math.pow(rnd(), 1.6) * 150), ky = Math.floor(rnd() * 3);
  terms.push({ kx, ky, ph: rnd() * 6.2832, a: 1 / Math.pow(kx, 0.55) });
}
for (let i = 0; i < 14; i++)              // broad soft bands
  terms.push({ kx: 1 + Math.floor(rnd() * 5), ky: Math.floor(rnd() * 2), ph: rnd() * 6.2832, a: 0.5 });
const field = new Float32Array(W * H); let mn = 1e9, mx = -1e9;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let v = 0;
  for (const t of terms) v += t.a * Math.cos(6.2832 * (t.kx * x / W + t.ky * y / H) + t.ph);
  field[y * W + x] = v; if (v < mn) mn = v; if (v > mx) mx = v;
}
const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const n = (field[i] - mn) / (mx - mn);                 // 0..1
  const dark = Math.pow(n, 2.2);                          // mostly faint, occasional darker streak
  const pore = rnd() < 0.002 ? 0.5 * rnd() : 0;           // rare pores
  const a = Math.min(1, 0.02 + 0.2 * dark + pore * 0.2);
  out[i * 4] = 92; out[i * 4 + 1] = 40; out[i * 4 + 2] = 14; out[i * 4 + 3] = Math.round(a * 255);
}
const raw = path.join(__dirname, 'wood-grain.rgba'); fs.writeFileSync(raw, out);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', raw,
  '-compression_level', '9', path.join(__dirname, 'wood-grain.png')]);
fs.unlinkSync(raw);
console.log('wrote wood-grain.png', fs.statSync(path.join(__dirname, 'wood-grain.png')).size, 'bytes');
