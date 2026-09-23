#!/usr/bin/env node
// posttype.mjs <rawDir> — classify harvested WordPress pages by <body class>.
import fs from 'node:fs';
import path from 'node:path';
const RAW = process.argv[2];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
const byType = {};
for (const f of walk(RAW)) {
  const raw = fs.readFileSync(f, 'utf8');
  const bc = (raw.match(/<body[^>]*class="([^"]*)"/i) || [, ''])[1];
  let t;
  if (/\bsingle-post\b/.test(bc)) t = 'single-post';
  else if (/\bsingle\b/.test(bc)) t = 'single:' + ((bc.match(/\bsingle-(?!format)([a-z0-9_]+)/) || [, '?'])[1]);
  else if (/\bpage\b/.test(bc)) t = 'page';
  else if (/\b(archive|category|tag|author|blog)\b/.test(bc)) t = 'archive';
  else if (/error404/.test(bc)) t = '404';
  else t = 'other[' + bc.slice(0, 60) + ']';
  (byType[t] = byType[t] || []).push(path.relative(RAW, f).split(path.sep).join('/'));
}
for (const [k, v] of Object.entries(byType)) console.log(String(v.length).padStart(4), k, v.length < 14 ? JSON.stringify(v) : 'e.g. ' + JSON.stringify(v.slice(0, 3)));
const posts = byType['single-post'] || [];
const dated = (p) => /-20\d\d(-\d+)?\.html$/.test(p);
console.log('undated posts:', JSON.stringify(posts.filter((p) => !dated(p))));
console.log('dated non-posts:', JSON.stringify(Object.entries(byType).filter(([k]) => k !== 'single-post').flatMap(([, v]) => v).filter(dated)));
