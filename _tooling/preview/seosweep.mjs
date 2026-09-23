#!/usr/bin/env node
// seosweep.mjs <beforeDist> <afterDist> [--skip index.html] — SEO parity across EVERY page.
// Per page, compares multisets of: heading outline (level + text), anchors (text -> href),
// content-image alts (inside <main>, hero excluded), and visible <main> words. Prints each
// page that differs and exactly what differs, then a summary. seoguard.mjs does this for one
// page; this does all of them, so a template change cannot quietly move copy on page 214.
import fs from 'node:fs';
import path from 'node:path';
const [, , A, B, ...rest] = process.argv;
const SKIP = new Set(rest.filter((x, i) => rest[i - 1] === '--skip'));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
const ENT = { amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', raquo: '»', times: '×' };
const dec = (s) => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, d, x, n) => d ? String.fromCodePoint(+d) : x ? String.fromCodePoint(parseInt(x, 16)) : (ENT[n.toLowerCase()] ?? m));
const norm = (s) => dec(s.replace(/<[^>]+>/g, ' ')).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const mainOf = (h) => {
  const m = h.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  let s = m ? m[1] : h;
  s = s.replace(/<div hidden class="src-echo"[\s\S]*?<\/div>/g, ' ');           // parity echo, not rendered
  s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  return s;
};
const bag = (arr) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return m; };
const diff = (a, b) => {
  const A = bag(a), B = bag(b), lost = [], added = [];
  for (const [k, n] of A) { const d = n - (B.get(k) || 0); for (let i = 0; i < d; i++) lost.push(k); }
  for (const [k, n] of B) { const d = n - (A.get(k) || 0); for (let i = 0; i < d; i++) added.push(k); }
  return { lost, added };
};
function facts(h) {
  const whole = h;
  const main = mainOf(h);
  const headings = [...whole.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => 'h' + m[1] + ': ' + norm(m[2]));
  const anchors = [...main.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => norm(m[2]) + ' -> ' + dec(m[1]));
  const noHero = main.replace(/<figure class="hero-media">[\s\S]*?<\/figure>/i, ' ');
  const alts = [...noHero.matchAll(/<img\b[^>]*\balt="([^"]*)"/gi)].map((m) => dec(m[1]));
  const words = norm(noHero.replace(/<(select)[\s\S]*?<\/\1>/gi, (m) => ' ' + m + ' ')).toLowerCase().split(/[^a-z0-9’'&]+/).filter((w) => w.length > 1);
  return { headings, anchors, alts, words };
}
const pages = walk(B).map((f) => path.relative(B, f).split(path.sep).join('/')).filter((p) => !SKIP.has(p));
let changed = 0; const tally = { headings: 0, anchors: 0, alts: 0, words: 0 };
for (const p of pages.sort()) {
  const fa = path.join(A, p);
  if (!fs.existsSync(fa)) { console.log(`NEW PAGE ${p}`); changed++; continue; }
  const a = facts(fs.readFileSync(fa, 'utf8')), b = facts(fs.readFileSync(path.join(B, p), 'utf8'));
  const out = [];
  for (const k of ['headings', 'anchors', 'alts']) {
    const d = diff(a[k], b[k]);
    if (d.lost.length || d.added.length) { tally[k]++; out.push(`  ${k}: -${JSON.stringify(d.lost.slice(0, 6))} +${JSON.stringify(d.added.slice(0, 6))}`); }
  }
  const w = diff(a.words, b.words);
  if (w.lost.length || w.added.length) { tally.words++; out.push(`  words: -${w.lost.length} ${JSON.stringify(w.lost.slice(0, 12))} +${w.added.length} ${JSON.stringify(w.added.slice(0, 12))}`); }
  if (out.length) { changed++; console.log(p); console.log(out.join('\n')); }
}
for (const p of walk(A).map((f) => path.relative(A, f).split(path.sep).join('/'))) if (!fs.existsSync(path.join(B, p)) && !SKIP.has(p)) { console.log(`REMOVED PAGE ${p}`); changed++; }
console.log(`\npages compared ${pages.length}; pages with any difference ${changed}; by kind ${JSON.stringify(tally)}`);
