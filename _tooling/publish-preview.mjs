#!/usr/bin/env node
// publish-preview.mjs <distDir> <outDir> — the GitHub Pages copy of the built site.
//
// main/dist keeps the source-faithful markup, including EyeSource's own public Google
// Maps browser key in its map embeds (README, "On the embedded Maps key"). Serving that
// key from github.io would spend their Maps quota, so the preview differs in one respect:
// every Maps embed becomes a static location card linking to the same place_id. The
// asset that is really a soft-404 HTML page carrying the key is left out. The run FAILS
// if the key survives anywhere in the output.
import fs from 'node:fs';
import path from 'node:path';

const [, , DIST, OUT] = process.argv;
if (!DIST || !OUT) { console.error('usage: publish-preview.mjs <distDir> <outDir>'); process.exit(2); }
const KEY = /AIzaSy[0-9A-Za-z_-]{33}/;
const DROP = new Set(['assets/cd7e616a-clipart-010.jpg']);

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, { recursive: true });
for (const f of DROP) fs.rmSync(path.join(OUT, f), { force: true });
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

/* The card takes the embed's place in its frame. Warm white with teal type (8.14:1)
   reads on the light Locate Us cards and on the teal contact aside alike. */
const card = (placeId) => `<a class="map-card" href="https://www.google.com/maps/place/?q=place_id:${placeId}" target="_blank" rel="noopener noreferrer" aria-label="Eye Source, 8049 Preston Road Suite 200, Frisco, TX 75034: open in Google Maps" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;box-sizing:border-box;width:100%;height:100%;min-height:300px;padding:28px 20px;text-align:center;text-decoration:none;border-radius:inherit;background:var(--warm-white);border:1px solid rgb(var(--ch-teal) / 0.14);color:var(--teal)"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg><strong style="font-size:1.1rem">Eye Source</strong><span style="line-height:1.6">8049 Preston Road, Suite 200<br>Frisco, TX 75034</span><span style="display:inline-flex;align-items:center;min-height:44px;padding:0 22px;border-radius:999px;background:var(--teal);color:var(--warm-white);font-weight:600">View on Google Maps &rarr;</span></a>`;

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
let swapped = 0;
for (const f of walk(OUT).filter((x) => x.endsWith('.html'))) {
  const s = fs.readFileSync(f, 'utf8');
  if (!KEY.test(s)) continue;
  const t = s.replace(/<iframe\b[^>]*\bsrc="[^"]*google\.com\/maps\/embed[^"]*place_id:([A-Za-z0-9_-]+)[^"]*"[^>]*><\/iframe>/g, (m, id) => { swapped++; return card(id); });
  fs.writeFileSync(f, t);
}
const left = walk(OUT).filter((f) => KEY.test(fs.readFileSync(f).toString('latin1')));
console.log(`preview: ${swapped} map embed(s) swapped for a location card; files still carrying the key: ${left.length}`);
if (left.length) { console.error('FAIL: key still present in ' + left.map((f) => path.relative(OUT, f)).join(', ')); process.exit(1); }
