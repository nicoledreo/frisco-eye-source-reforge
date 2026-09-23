#!/usr/bin/env node
// cropjpeg.mjs <srcUrl> <outFile> <sy> [outW] [quality]
// Full-width 3:1 crop starting at source row <sy>, scaled to outW x outW/3, re-encoded to
// JPEG through headless Chrome's canvas (no native image deps on this machine).
// Derived from session 5's tojpeg.mjs; the only change is the crop window.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9281);
const [, , SRC, OUT, SY, OUTW = '2000', Q = '0.86'] = process.argv;
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
try {
  const info = await waitForDevtools(PORT);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  // Same-origin page first, so the canvas is not tainted (see tojpeg.mjs).
  const t = await cdp.send('Target.createTarget', { url: new URL(SRC).origin + '/' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  await sleep(2000);
  const EXPR = `(async () => {
    const img = new Image();
    img.src = ${JSON.stringify(SRC)};
    await img.decode();
    const sy = ${Number(SY)};
    const sw = img.naturalWidth, sh = Math.round(sw / 3);
    if (!(sy >= 0) || sy + sh > img.naturalHeight) throw new Error('crop window out of bounds: ' + sy + '+' + sh + ' > ' + img.naturalHeight);
    const w = ${Number(OUTW)}, h = Math.round(w / 3);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, sy, sw, sh, 0, 0, w, h);
    const d = c.toDataURL('image/jpeg', ${Number(Q)});
    return JSON.stringify({ w, h, natW: img.naturalWidth, natH: img.naturalHeight, sy, sh, data: d.split(',')[1] });
  })()`;
  const res = await cdp.send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true }, sessionId);
  if (res.exceptionDetails) { console.error('ERROR', JSON.stringify(res.exceptionDetails).slice(0, 600)); process.exitCode = 2; }
  else {
    const o = JSON.parse(res.result.value);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(o.data, 'base64'));
    console.log(`${path.basename(OUT)}  ${o.natW}x${o.natH} rows ${o.sy}..${o.sy + o.sh} -> ${o.w}x${o.h}  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
  }
  ws.close();
} finally {
  try { child.kill(); } catch {}
  // Headless Chrome's child handle can keep node's event loop alive on Windows after
  // the work is done (observed: first run printed its result and never exited).
  setTimeout(() => process.exit(process.exitCode || 0), 500);
}
