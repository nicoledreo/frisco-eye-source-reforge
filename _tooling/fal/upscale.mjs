#!/usr/bin/env node
// upscale.mjs <outDir> <imagePath:scale> [...] — faithful upscale of REAL photos with fal's
// Real-ESRGAN (fal-ai/esrgan, RealESRGAN_x4plus, face enhancement OFF so no person's face is
// re-synthesised). Writes <outDir>/<basename>.png. The key is read from .mcp.json, never printed.
//
// Why ESRGAN and not a generative upscaler: several of these are photographs of the practice's
// own premises. A generative model invents detail; this one only sharpens what is there.
// Used 2026-09-23 for the six content photos that rendered past 1.2x at 1440 (see
// DESIGN-SYSTEM.md §5a). Post-process with ./imgproc.mjs (crop + JPEG), then drop the result
// into main/src/assets-extra/ under the ORIGINAL file name so the build ships it in place.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.env.FES_ROOT || path.join(os.homedir(), 'clone-site-output', 'friscoeyesource-reforge');
const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8')).mcpServers.fal.env.FAL_KEY;
if (!KEY) { console.error('no FAL_KEY in .mcp.json'); process.exit(2); }
const [, , OUT, ...JOBS] = process.argv;
if (!OUT || !JOBS.length) { console.error('usage: upscale.mjs <outDir> <imagePath:scale> ...'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

async function up(spec) {
  const i = spec.lastIndexOf(':');
  const file = spec.slice(0, i), scale = Number(spec.slice(i + 1));
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  const dataUri = `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
  const r = await fetch('https://fal.run/fal-ai/esrgan', {
    method: 'POST',
    headers: { Authorization: 'Key ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: dataUri, scale, model: 'RealESRGAN_x4plus', face: false, output_format: 'png' }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(path.basename(file) + ' HTTP ' + r.status + ': ' + txt.slice(0, 300));
  const im = JSON.parse(txt).image;
  if (!im || !im.url) throw new Error(path.basename(file) + ' returned no image');
  const dest = path.join(OUT, path.basename(file).replace(/\.[a-z]+$/i, '') + '.png');
  fs.writeFileSync(dest, Buffer.from(await (await fetch(im.url)).arrayBuffer()));
  return `${path.basename(file)} x${scale} -> ${im.width}x${im.height} ${dest}`;
}
for (const r of await Promise.allSettled(JOBS.map(up))) console.log(r.status === 'fulfilled' ? r.value : 'FAIL ' + r.reason.message);
