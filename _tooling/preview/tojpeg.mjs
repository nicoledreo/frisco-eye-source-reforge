#!/usr/bin/env node
// tojpeg.mjs <srcUrl> <outFile> [maxWidth] [quality]
// Re-encode an image to JPEG through headless Chrome's canvas. No native deps.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9280);
const [, , SRC, OUT, MAXW = '2000', Q = '0.86'] = process.argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, t = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error('devtools not up');
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    });
  }
  send(method, params = {}, sid) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error('timeout ' + method)); } }, 180000); });
  }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jpeg-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const info = await waitForDevtools(PORT);
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const cdp = new CDP(ws);
// Navigate to the image's OWN origin first. On about:blank every http URL is
// cross-origin, and crossOrigin="anonymous" then requires an Access-Control-Allow-Origin
// header the preview server does not send — the load fails and decode() throws
// "The source image cannot be decoded". Same-origin means no taint and no CORS need.
const origin = new URL(SRC).origin;
const t = await cdp.send('Target.createTarget', { url: origin + '/' }, undefined);
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await sleep(2500);

const EXPR = `(async () => {
  const img = new Image();
  img.src = ${JSON.stringify(SRC)};
  await img.decode();
  const maxW = ${Number(MAXW)};
  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  // JPEG has no alpha: paint white first so any transparency does not go black.
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const d = c.toDataURL('image/jpeg', ${Number(Q)});
  return JSON.stringify({ w, h, natW: img.naturalWidth, natH: img.naturalHeight, data: d.split(',')[1] });
})()`;

const res = await cdp.send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true }, sessionId);
if (res.exceptionDetails) { console.error('ERROR', JSON.stringify(res.exceptionDetails).slice(0, 800)); process.exit(2); }
const o = JSON.parse(res.result.value);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(o.data, 'base64'));
const before = 0;
console.log(`${path.basename(OUT)}  ${o.natW}x${o.natH} -> ${o.w}x${o.h}  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
ws.close(); try { child.kill(); } catch {}
