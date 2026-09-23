#!/usr/bin/env node
// formparity.mjs <raw.html> <built.html> — every field of the source Gravity Form must exist in the
// rebuilt form: same label, same number of choices / options / sub-fields, same section titles.
import fs from 'node:fs';
const [, , RAW, BUILT] = process.argv;
const raw = fs.readFileSync(RAW, 'utf8');
const built = fs.readFileSync(BUILT, 'utf8');
const ENT = { amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ', apos: "'", rsquo: '’', ndash: '–' };
const dec = (s) => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, d, x, n) => d ? String.fromCodePoint(+d) : x ? String.fromCodePoint(parseInt(x, 16)) : (ENT[n.toLowerCase()] ?? m));
const txt = (h) => dec(String(h).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const main = (raw.match(/<main[^>]*>([\s\S]*?)<\/main>/i) || [, raw])[1];
const form = (main.match(/<form\b[^>]*id=['"]gform_\d+['"][\s\S]*?<\/form>/i) || [''])[0];
const bform = (built.match(/<form class="appt-form gf-form"[\s\S]*?<\/form>/) || [''])[0];
if (!form || !bform) { console.log('FAIL: form missing', !!form, !!bform); process.exit(1); }
const starts = [...form.matchAll(/<(li|div|fieldset)\b[^>]*\bid=['"]field_\d+_\d+['"][^>]*class=['"]([^'"]*)['"][^>]*>/gi)];
// the built form, split into its top-level blocks in order
const blocks = [...bform.matchAll(/<(fieldset|div|h[1-6]|p)\b[^>]*class="([^"]*)"[^>]*>/g)].map((m) => ({ tag: m[1], cls: m[2], idx: m.index }));
let fails = 0, checked = 0;
/* Source fields are paired with built fields ONE-TO-ONE, in document order: three
   fields are labelled "Address", and matching "any field with that label" let a
   damaged one hide behind an intact twin (caught by mutation test). */
const used = new Set();
for (let i = 0; i < starts.length; i++) {
  const seg = form.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : form.length);
  const type = (/gfield--type-([a-z_]+)/.exec(starts[i][2]) || [, '?'])[1];
  if (type === 'honeypot' || type === 'html') continue;
  checked++;
  if (type === 'section') {
    const t = txt((/<(h[1-6])\b[^>]*gsection_title[^>]*>([\s\S]*?)<\/\1>/i.exec(seg) || [, , ''])[2]);
    const lvl = (/<(h[1-6])\b[^>]*gsection_title/i.exec(seg) || [, '?'])[1];
    const ok = new RegExp('<' + lvl + ' class="form-section">' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</' + lvl + '>').test(dec(bform));
    if (!ok) { fails++; console.log(`FAIL section "${t}" (${lvl}) not found`); }
    continue;
  }
  const label = txt(((/<(label|legend)\b[^>]*gfield_label[^>]*>([\s\S]*?)<\/\1>/i.exec(seg) || [, , ''])[2]).replace(/<span[^>]*gfield_required[^>]*>[\s\S]*?<\/span>/gi, ''));
  const choices = (seg.match(/<input\b[^>]*type=['"](radio|checkbox)['"]/gi) || []).length;
  const options = (seg.match(/<option\b/gi) || []).length;
  const ctrls = (seg.match(/<(select|textarea)\b|<input\b(?![^>]*type=['"](hidden|submit|button|radio|checkbox)['"])/gi) || []).length;
  // find the built block whose label/legend text equals the source label
  const re = /<(fieldset|div)\b[^>]*class="field[^"]*"[^>]*>([\s\S]*?)<\/\1>(?=\s*(?:<fieldset|<div class="field|<h[1-6] class="form-section|<div class="sr-only|<p class="field|$))/g;
  const cand = [...bform.matchAll(re)].find((m) => {
    if (used.has(m.index)) return false;
    const lab = txt(((/<(legend|label)\b[^>]*>([\s\S]*?)<\/\1>/.exec(m[2]) || [, , ''])[2]).replace(/\*/g, '')).trim();
    return lab === label;
  });
  if (!cand) { fails++; console.log(`FAIL ${type} "${label}": no (unused) built field with that label`); continue; }
  used.add(cand.index);
  const x0 = cand[0];
  const ok = (x0.match(/<input\b[^>]*type="(radio|checkbox)"/g) || []).length === choices
    && (x0.match(/<option\b/g) || []).length === options
    && (x0.match(/<(select|textarea)\b|<input\b(?![^>]*type="(radio|checkbox)")/g) || []).length === ctrls;
  if (!ok) {
    const x = x0;
    fails++;
    console.log(`FAIL ${type} "${label}": source choices/options/controls ${choices}/${options}/${ctrls}, built ${(x.match(/<input\b[^>]*type="(radio|checkbox)"/g) || []).length}/${(x.match(/<option\b/g) || []).length}/${(x.match(/<(select|textarea)\b|<input\b(?![^>]*type="(radio|checkbox)")/g) || []).length}`);
  }
}
const submit = dec((/<input\b[^>]*type=['"]submit['"][^>]*value=['"]([^'"]*)['"]/i.exec(form) || [, ''])[1]);
if (!new RegExp('<button class="btn btn-primary" type="submit">' + submit + '</button>').test(bform)) { fails++; console.log('FAIL submit label', submit); }
console.log(`${fails ? 'FAIL' : 'PASS'}  ${checked} source fields checked, ${fails} mismatch(es)`);
process.exitCode = fails ? 1 : 0;
