#!/usr/bin/env node
// seoguard.mjs <fileA> <fileB> — compare the SEO-relevant surface of two HTML files.
// Text, heading OUTLINE (level+text, in order), alt text, anchor text, meta, schema.
// Regex-based on purpose: no deps, and these files are one very long line.
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const [A, B] = [process.argv[2], process.argv[3]];

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "'")
  .replace(/&#8211;|&ndash;/g, '-').replace(/&#8212;|&mdash;/g, '-');

const strip = (h) => decode(
  h.replace(/<script[\s\S]*?<\/script>/gi, ' ')
   .replace(/<style[\s\S]*?<\/style>/gi, ' ')
   .replace(/<!--[\s\S]*?-->/g, ' ')
   .replace(/<[^>]+>/g, ' ')
).replace(/\s+/g, ' ').trim();

function headings(h) {
  const out = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(h))) out.push(`h${m[1]}: ${strip(m[2])}`);
  return out;
}

function alts(h) {
  const out = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(h))) {
    const tag = m[0];
    const alt = /alt\s*=\s*"([^"]*)"/i.exec(tag);
    const src = /src\s*=\s*"([^"]*)"/i.exec(tag);
    out.push(`${src ? src[1].split('/').pop() : '(no src)'} :: alt="${alt ? alt[1] : '(MISSING)'}"`);
  }
  return out;
}

function anchors(h) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(h))) {
    const href = /href\s*=\s*"([^"]*)"/i.exec(m[1]);
    const txt = strip(m[2]);
    if (!txt) continue;
    out.push(`${txt}  ->  ${href ? href[1] : '(no href)'}`);
  }
  return out;
}

function meta(h) {
  const out = [];
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(h);
  out.push(`title: ${t ? strip(t[1]) : '(none)'}`);
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(h))) {
    const tag = m[0];
    const name = /(?:name|property)\s*=\s*"([^"]*)"/i.exec(tag);
    const content = /content\s*=\s*"([^"]*)"/i.exec(tag);
    if (name && content) out.push(`meta[${name[1]}]: ${content[1]}`);
  }
  const c = /<link\b[^>]*rel\s*=\s*"canonical"[^>]*>/i.exec(h);
  if (c) out.push(`canonical: ${(/href\s*=\s*"([^"]*)"/i.exec(c[0]) || [])[1]}`);
  return out;
}

function schema(h) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(h))) {
    try {
      const j = JSON.parse(m[1].trim());
      out.push(JSON.stringify(j));
    } catch { out.push('(unparseable ld+json)'); }
  }
  return out;
}

function words(h) {
  return strip(h).split(/\s+/).filter(Boolean);
}

const a = read(A), b = read(B);

function diffList(label, la, lb) {
  const sa = new Map(), sb = new Map();
  for (const x of la) sa.set(x, (sa.get(x) || 0) + 1);
  for (const x of lb) sb.set(x, (sb.get(x) || 0) + 1);
  const onlyA = [], onlyB = [];
  for (const [k, n] of sa) { const m2 = sb.get(k) || 0; if (n > m2) onlyA.push(`${k}${n - m2 > 1 ? `  (x${n - m2})` : ''}`); }
  for (const [k, n] of sb) { const m2 = sa.get(k) || 0; if (n > m2) onlyB.push(`${k}${n - m2 > 1 ? `  (x${n - m2})` : ''}`); }
  const same = onlyA.length === 0 && onlyB.length === 0;
  const orderSame = la.length === lb.length && la.every((x, i) => x === lb[i]);
  console.log(`\n=== ${label} ===  A:${la.length}  B:${lb.length}  ${same ? (orderSame ? 'IDENTICAL' : 'SAME SET, ORDER CHANGED') : 'DIFFERS'}`);
  if (onlyA.length) { console.log(`  -- only in A (${A.split(/[\\/]/).pop()}) --`); for (const x of onlyA.slice(0, 25)) console.log('   - ' + x.slice(0, 160)); }
  if (onlyB.length) { console.log(`  ++ only in B (${B.split(/[\\/]/).pop()}) ++`); for (const x of onlyB.slice(0, 25)) console.log('   + ' + x.slice(0, 160)); }
  if (same && !orderSame) {
    for (let i = 0; i < Math.min(la.length, lb.length); i++) {
      if (la[i] !== lb[i]) { console.log(`   first order change at index ${i}:\n     A: ${la[i].slice(0,120)}\n     B: ${lb[i].slice(0,120)}`); break; }
    }
  }
}

const wa = words(a), wb = words(b);
console.log(`WORD COUNT   A=${wa.length}   B=${wb.length}   delta=${wb.length - wa.length}`);

// vocabulary loss: words present in A that appear nowhere in B
const setB = new Set(wb.map((w) => w.toLowerCase().replace(/[^a-z0-9@.-]/g, '')));
const lost = [...new Set(wa.map((w) => w.toLowerCase().replace(/[^a-z0-9@.-]/g, '')))].filter((w) => w.length > 2 && !setB.has(w));
console.log(`UNIQUE VOCABULARY PRESENT IN A BUT ABSENT FROM B: ${lost.length}`);
if (lost.length) console.log('  ' + lost.slice(0, 60).join(', '));

diffList('HEADING OUTLINE (level + text, document order)', headings(a), headings(b));
diffList('IMAGE ALT TEXT', alts(a), alts(b));
diffList('ANCHOR TEXT -> HREF', anchors(a), anchors(b));
diffList('TITLE / META / CANONICAL', meta(a), meta(b));
diffList('JSON-LD SCHEMA', schema(a), schema(b));
