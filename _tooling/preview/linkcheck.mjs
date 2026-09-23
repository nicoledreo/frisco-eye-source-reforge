#!/usr/bin/env node
// linkcheck.mjs <distDir> — every local href/src/srcset/url() in every built page and stylesheet
// must resolve to a file inside dist. Prints broken refs grouped by target.
import fs from 'node:fs';
import path from 'node:path';
const DIST = path.resolve(process.argv[2]);
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(DIST);
const html = files.filter((f) => f.endsWith('.html'));
const css = files.filter((f) => f.endsWith('.css'));
const broken = new Map(); let checked = 0; const external = new Map();
const isExternal = (r) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(r);
function check(from, ref) {
  ref = ref.trim().replace(/&amp;/g, '&');
  if (!ref) return;
  if (isExternal(ref)) { const k = ref.replace(/^(https?:)?\/\//, '').split(/[/?#]/)[0] || ref.split(':')[0]; external.set(k, (external.get(k) || 0) + 1); return; }
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  if (!clean) return;
  checked++;
  const target = clean.startsWith('/') ? path.join(DIST, clean) : path.resolve(path.dirname(from), clean);
  if (!target.startsWith(DIST) || !fs.existsSync(target)) {
    const k = path.relative(DIST, target).split(path.sep).join('/');
    if (!broken.has(k)) broken.set(k, new Set());
    broken.get(k).add(path.relative(DIST, from).split(path.sep).join('/'));
  }
}
for (const f of html) {
  const h = fs.readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of h.matchAll(/\b(?:href|src|poster|data-src)="([^"]*)"/g)) check(f, m[1]);
  for (const m of h.matchAll(/\bsrcset="([^"]*)"/g)) for (const part of m[1].split(',')) check(f, part.trim().split(/\s+/)[0]);
  for (const m of h.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) check(f, m[2]);
}
for (const f of css) {
  const s = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of s.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) if (!m[2].startsWith('data:')) check(f, m[2]);
}
console.log(`pages ${html.length}, stylesheets ${css.length}, local refs checked ${checked}, broken targets ${broken.size}`);
for (const [k, v] of [...broken].slice(0, 40)) console.log(`  MISSING ${k}  <- ${[...v].slice(0, 4).join(', ')}${v.size > 4 ? ` (+${v.size - 4} more)` : ''}`);
console.log('external hosts referenced:', JSON.stringify(Object.fromEntries([...external].sort((a, b) => b[1] - a[1]).slice(0, 15))));
