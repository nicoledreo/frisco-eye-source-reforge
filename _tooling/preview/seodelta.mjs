#!/usr/bin/env node
// seodelta.mjs <baseline.html> <candidate.html> — forensic view of the SEO deltas:
// occurrence counts for named needles, and a sentence-level diff of visible <main>+<footer> text.
import fs from 'node:fs';
const [, , A, B] = process.argv;
const a = fs.readFileSync(A, 'utf8'), b = fs.readFileSync(B, 'utf8');
const count = (h, s) => h.split(s).length - 1;
const NEEDLES = ['Eye Exams for the Whole Family', '> Family Eye Exams <', 'Family Eye Exams', 'Regardless of your age', '8049 Preston Road', 'Wayback Burgers', '>Address<', 'address', 'Red Cross', '214-872-2401'];
console.log('needle'.padEnd(34), 'base', 'cand');
for (const n of NEEDLES) console.log(JSON.stringify(n).padEnd(34), String(count(a, n)).padStart(4), String(count(b, n)).padStart(4));

const body = (h) => h.replace(/<head[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<(br|\/p|\/h[1-6]|\/li|\/a|\/button|\/div|\/section|\/figcaption|\/dt|\/dd|\/span)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/&ndash;/g, '–');
const units = (h) => body(h).split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 1);
const ua = units(a), ub = units(b);
const bag = (arr) => { const m = new Map(); for (const s of arr) m.set(s, (m.get(s) || 0) + 1); return m; };
const ma = bag(ua), mb = bag(ub);
const words = (s) => s.split(/\s+/).filter(Boolean).length;
let lostW = 0, gainW = 0;
console.log('\n-- text units in BASELINE missing (or fewer) in CANDIDATE --');
for (const [s, n] of ma) { const d = n - (mb.get(s) || 0); if (d > 0) { lostW += d * words(s); console.log(`  -${d}x [${words(s)}w] ${s.slice(0, 170)}`); } }
console.log('\n-- text units in CANDIDATE not in BASELINE --');
for (const [s, n] of mb) { const d = n - (ma.get(s) || 0); if (d > 0) { gainW += d * words(s); console.log(`  +${d}x [${words(s)}w] ${s.slice(0, 170)}`); } }
console.log(`\nwords lost ${lostW}, gained ${gainW}, net ${gainW - lostW}`);
