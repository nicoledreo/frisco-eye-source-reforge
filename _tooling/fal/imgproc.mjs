#!/usr/bin/env node
// imgproc.mjs <srcUrl> <outFile.jpg> <cropL> <cropT> <cropR> <cropB> <maxW> [quality]
// Trim N source pixels off each edge, scale down to at most maxW wide, encode JPEG — through
// headless Chrome's canvas (this machine has no ImageMagick/sharp). The source must be served
// over http (e.g. _tooling/preview/serve.mjs) so the canvas is not tainted.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9291);
const [, , SRC, OUT, L = '0', T = '0', R = '0', B = '0', MAXW = '2400', Q = '0.86'] = process.argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForDevtools(port, t = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); } catch {} await sleep(250); }
  throw new Error('devtools not up');
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } }); }
  send(method, params = {}, sid) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error('timeout ' + method)); } }, 180000); }); }
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'imgproc-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
try {
  const info = await waitForDevtools(PORT);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  const t = await cdp.send('Target.createTarget', { url: new URL(SRC).origin + '/' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await sleep(1500);
  const EXPR = `(async () => {
    const img = new Image(); img.src = ${JSON.stringify(SRC)}; await img.decode();
    const [l, t, r, b] = [${+L}, ${+T}, ${+R}, ${+B}];
    const sw = img.naturalWidth - l - r, sh = img.naturalHeight - t - b;
    const s = Math.min(1, ${+MAXW} / sw);
    const w = Math.round(sw * s), h = Math.round(sh * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, l, t, sw, sh, 0, 0, w, h);
    return JSON.stringify({ natW: img.naturalWidth, natH: img.naturalHeight, w, h, data: c.toDataURL('image/jpeg', ${+Q}).split(',')[1] });
  })()`;
  const res = await cdp.send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true }, sessionId);
  if (res.exceptionDetails) { console.error('ERROR', JSON.stringify(res.exceptionDetails).slice(0, 500)); process.exitCode = 2; }
  else {
    const o = JSON.parse(res.result.value);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(o.data, 'base64'));
    console.log(`${path.basename(OUT)}  ${o.natW}x${o.natH} crop[${L},${T},${R},${B}] -> ${o.w}x${o.h}  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
  }
  ws.close();
} finally {
  try { child.kill(); } catch {}
  setTimeout(() => process.exit(process.exitCode || 0), 400);
}
