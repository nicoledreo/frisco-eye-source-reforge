#!/usr/bin/env node
// slices.mjs — load a page once, capture readable top-to-bottom slices.
//   node slices.mjs <url> <width> <outPrefix> [sliceHeight] [mobile]
// Clip-based, so each slice is native resolution rather than a downscaled full page.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9223);

const [, , URL_, W, PREFIX, SLICE_H = '1150', MOBILE = '0'] = process.argv;
const width = Number(W);
const sliceH = Number(SLICE_H);
const mobile = MOBILE === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); }
    catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('devtools did not come up on port ' + port);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) { for (const [k, fn] of this.handlers) if (k === m.method) fn(m.params, m.sessionId); }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 120000);
    });
  }
  once(method) { return new Promise((res) => { this.handlers.set(method, (p) => { this.handlers.delete(method); res(p); }); }); }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-chrome-'));
const child = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu',
  '--force-color-profile=srgb', '--font-render-hinting=none', 'about:blank',
], { stdio: 'ignore' });

const info = await waitForDevtools(PORT);
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const cdp = new CDP(ws);

const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width, height: 900, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: 900,
}, sessionId);
const loaded = cdp.once('Page.loadEventFired');
await cdp.send('Page.navigate', { url: URL_ }, sessionId);
await Promise.race([loaded, sleep(45000)]);
await sleep(3000);

const m = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
const docH = Math.ceil((m.cssContentSize || m.contentSize).height);

// Expand the viewport to the full document so nothing lazy-loads mid-capture,
// then clip each slice out of the same fully-rendered page.
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width, height: docH, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: docH,
}, sessionId);
await sleep(1200);

fs.mkdirSync(path.dirname(PREFIX), { recursive: true });
const n = Math.ceil(docH / sliceH);
const out = [];
for (let i = 0; i < n; i++) {
  const y = i * sliceH;
  const h = Math.min(sliceH, docH - y);
  const s = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y, width, height: h, scale: 1 },
  }, sessionId);
  const file = `${PREFIX}-${String(i).padStart(2, '0')}.png`;
  fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
  out.push({ slice: i, y, h, file, bytes: fs.statSync(file).size });
}

ws.close();
try { child.kill(); } catch {}
process.stdout.write(JSON.stringify({ url: URL_, width, docH, slices: out }, null, 2) + '\n');
