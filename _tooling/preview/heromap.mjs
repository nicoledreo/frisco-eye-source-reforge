#!/usr/bin/env node
// heromap.mjs <distDir> [--list <heroBasename>] — which hero image each built page uses.
import fs from 'node:fs';
import path from 'node:path';
const DIST = process.argv[2];
const LIST = process.argv[3] === '--list' ? process.argv[4] : null;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
const rows = walk(DIST).map((f) => {
  const h = fs.readFileSync(f, 'utf8');
  const m = h.match(/<figure class="hero-media">\s*<img src="([^"]+)"/);
  const bento = /class="[^"]*bento-banner/.test(h);
  return { file: path.relative(DIST, f).replace(/\\/g, '/'), hero: m ? path.basename(m[1]) : (bento ? '(designed homepage)' : '(none)') };
});
const count = {};
for (const r of rows) count[r.hero] = (count[r.hero] || 0) + 1;
console.log('pages', rows.length);
for (const [k, v] of Object.entries(count).sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k);
if (LIST) {
  const groups = {};
  for (const r of rows.filter((r) => r.hero === LIST)) {
    const seg = r.file.includes('/') ? r.file.split('/')[0] + '/' : (/-20\d\d(-\d+)?\.html$/.test(r.file) ? '<root, dated -20xx>' : '<root, undated>');
    (groups[seg] = groups[seg] || []).push(r.file);
  }
  for (const [k, v] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${k}  (${v.length})`);
    if (k.startsWith('<root')) console.log('  ' + v.join('\n  '));
  }
}
