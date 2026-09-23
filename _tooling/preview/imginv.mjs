#!/usr/bin/env node
// imginv.mjs <distDir> — content images (inside .prose, excluding the hero) per page, with the
// intrinsic size read from the JPEG/PNG header, so "main section image" candidates can be found.
import fs from 'node:fs';
import path from 'node:path';
const DIST = process.argv[2];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
const dims = new Map();
function size(file) {
  if (dims.has(file)) return dims.get(file);
  let r = null;
  try {
    const b = fs.readFileSync(file);
    if (b[0] === 0x89 && b[1] === 0x50) r = [b.readUInt32BE(16), b.readUInt32BE(20)];
    else if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) { r = [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; break; } i += 2 + b.readUInt16BE(i + 2); }
    }
  } catch {}
  dims.set(file, r); return r;
}
const rows = [];
for (const f of walk(DIST)) {
  const h = fs.readFileSync(f, 'utf8');
  const i = h.indexOf('<div class="prose">');
  if (i < 0) continue;
  const prose = h.slice(i, h.indexOf('<aside', i) > 0 ? h.indexOf('<aside', i) : undefined);
  const imgs = [...prose.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map((m) => {
    const abs = path.resolve(path.dirname(f), m[1]);
    const d = size(abs);
    return { src: path.basename(m[1]), w: d ? d[0] : 0, h: d ? d[1] : 0 };
  });
  if (imgs.length) rows.push({ page: path.relative(DIST, f).split(path.sep).join('/'), imgs });
}
const big = rows.map((r) => ({ ...r, big: r.imgs.filter((x) => x.w >= 900 && x.w / Math.max(1, x.h) >= 1.2) })).filter((r) => r.big.length);
console.log('pages with any content image:', rows.length, '| pages with a large landscape (>=900w, >=1.2:1) content image:', big.length);
for (const r of big.slice(0, 40)) console.log(' ', r.page.padEnd(70), r.big.map((x) => `${x.src} ${x.w}x${x.h}`).join(' | '));
const hist = {};
for (const r of rows) for (const x of r.imgs) { const k = x.w >= 900 ? '>=900' : x.w >= 500 ? '500-899' : x.w > 0 ? '<500' : 'unknown'; hist[k] = (hist[k] || 0) + 1; }
console.log('content image widths:', JSON.stringify(hist));
