#!/usr/bin/env node
// heroes.mjs <outDir> [key ...] — regenerate the inner-page hero art with fal's REST API.
//
// These are the EXACT prompts, model and seeds behind the three heroes that shipped on
// 2026-09-23 (main/src/assets-extra/hero-{insurance,whats-new,contact}.jpg). Each raw
// 3136x1344 render was then cropped to 3:1 and scaled to 2000x667 with ./cropjpeg.mjs
// at the row noted in `cropRow`:
//   node _tooling/fal/cropjpeg.mjs <served-url-of-raw.jpg> <out.jpg> <cropRow>
// (cropjpeg needs the raw file served over http — _tooling/preview/serve.mjs will do.)
//
// Same prompt + seed on the same model version should reproduce the image; that is
// fal's stated behaviour, not something verified here. The raw renders that actually
// shipped are kept in ./masters/ — re-crop from those rather than regenerating.
//
// The key is read from the project's .mcp.json (gitignored) and is never printed.
// Why these compositions: the hero scrim is a left-to-right teal ramp holding >=0.86
// alpha across the copy column, so the art must leave its LEFT half empty. The first
// round of prompts put the subject centre-left; asking for "a long bare tabletop with
// the cluster at the far right end" is what moved it right.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.env.FES_ROOT || path.join(os.homedir(), 'clone-site-output', 'friscoeyesource-reforge');
const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8')).mcpServers.fal.env.FAL_KEY;
if (!KEY) { console.error('no FAL_KEY in .mcp.json'); process.exit(2); }
const [, , OUT, ...ONLY] = process.argv;
if (!OUT) { console.error('usage: heroes.mjs <outDir> [insurance|whats-new|contact-us ...]'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const MODEL = 'fal-ai/flux-pro/v1.1-ultra';

const STYLE = 'Wide cinematic banner composition. The LEFT HALF of the frame is completely empty: a smooth, softly lit warm cream plaster wall with gentle diffused morning window light and faint soft leaf shadows, no objects at all in the left half. All subject matter sits in the RIGHT THIRD of the frame. Warm neutral palette of cream, ivory, sand and light oak, with one muted deep teal accent. High-end minimal editorial product photography, shallow depth of field, natural light, calm and airy, magazine quality. No people, no faces, no hands, no text, no letters, no logos, no writing on any surface.';

const JOBS = [
  { key: 'insurance', file: 'hero-insurance.jpg', seed: 71, cropRow: 137,
    prompt: 'A long, bare, light oak tabletop runs across the entire width of the frame in front of a plain warm cream plaster wall. The left sixty percent of the tabletop and wall is completely bare and empty. At the far right end of the table only, a small tidy cluster: a short stack of blank cream paper forms, a deep teal linen folder beneath them, a pair of tortoiseshell eyeglasses folded on top, a slim brass pen, and a sprig of eucalyptus in a ribbed white ceramic vase. ' + STYLE },
  { key: 'whats-new', file: 'hero-whats-new.jpg', seed: 5, cropRow: 157,
    prompt: 'A long table draped in smooth natural linen runs across the entire width of the frame in front of a plain warm cream plaster wall. The left sixty percent of the table and wall is completely bare and empty. At the far right end of the table only, a small tidy cluster: an open blank notebook with a pair of clear-lens eyeglasses resting on it, a small ceramic bowl of fresh blueberries, a glass of water, and an olive branch in a matte deep teal ceramic vase. ' + STYLE },
  { key: 'contact-us', file: 'hero-contact.jpg', seed: 23, cropRow: 118,
    prompt: 'On the right: the corner of a modern light oak reception counter with a small polished brass desk bell, a neat stack of blank cream appointment cards, a pen, and fresh green eucalyptus in a ribbed white vase; behind it, softly out of focus, a minimal wall shelf displaying a few eyeglass frames and a deep teal ceramic accent. ' + STYLE },
];

async function gen(job) {
  const r = await fetch('https://fal.run/' + MODEL, {
    method: 'POST',
    headers: { Authorization: 'Key ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: job.prompt, aspect_ratio: '21:9', output_format: 'jpeg', num_images: 1, seed: job.seed, safety_tolerance: '2', enable_safety_checker: true }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(job.key + ' HTTP ' + r.status + ': ' + txt.slice(0, 300));
  const im = (JSON.parse(txt).images || [])[0];
  if (!im) throw new Error(job.key + ' returned no image');
  const file = path.join(OUT, `${job.key}-raw-s${job.seed}.jpg`);
  fs.writeFileSync(file, Buffer.from(await (await fetch(im.url)).arrayBuffer()));
  return `${job.key}: ${file} ${im.width}x${im.height} -> crop at row ${job.cropRow}, ship as ${job.file}`;
}

const jobs = ONLY.length ? JOBS.filter((j) => ONLY.includes(j.key)) : JOBS;
for (const r of await Promise.allSettled(jobs.map(gen))) console.log(r.status === 'fulfilled' ? r.value : 'FAIL ' + r.reason.message);
