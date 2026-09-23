#!/usr/bin/env node
// herocontrast.mjs <url> <width> [mobile]
// Hides the hero copy, screenshots the hero, then samples the exact rectangles
// the h1 / lede / eyebrow occupy and reports the WORST-case WCAG ratio of the
// real text colour against the real backdrop underneath it.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9300);
const [, , URL_, W, MOBILE = '0'] = process.argv;
const width = Number(W);
const mobile = MOBILE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, t = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); } catch {} await sleep(250); }
  throw new Error('devtools not up');
}
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.p = new Map(); this.h = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
      else if (m.method) { for (const [k, fn] of this.h) if (k === m.method) fn(m.params); }
    });
  }
  send(method, params = {}, sid) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error('timeout ' + method)); } }, 120000); });
  }
  once(m) { return new Promise((r) => { this.h.set(m, (p) => { this.h.delete(m); r(p); }); }); }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const info = await waitForDevtools(PORT);
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const cdp = new CDP(ws);
const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: 1000 }, sessionId);
const loaded = cdp.once('Page.loadEventFired');
await cdp.send('Page.navigate', { url: URL_ }, sessionId);
await Promise.race([loaded, sleep(45000)]);
await sleep(3000);

// 1. record the text rects + their computed colours
const rectsRes = await cdp.send('Runtime.evaluate', {
  expression: `(() => {
    const out = [];
    const grab = (sel, label) => {
      const el = document.querySelector(sel); if (!el) return;
      const r = el.getBoundingClientRect();
      out.push({ label, color: getComputedStyle(el).color, fontSize: parseFloat(getComputedStyle(el).fontSize), weight: getComputedStyle(el).fontWeight,
                 x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
    };
    grab('.hero-copy .eyebrow', 'eyebrow');
    grab('.hero-copy h1', 'h1');
    grab('.hero-copy .hero-lede', 'lede');
    grab('.hero-copy .hero-lede a', 'lede link');
    return JSON.stringify(out);
  })()`, returnByValue: true,
}, sessionId);
const rects = JSON.parse(rectsRes.result.value);

// 2. hide the copy so we can see the backdrop that sits under it
await cdp.send('Runtime.evaluate', {
  expression: `(() => { const s = document.createElement('style'); s.id='__hc'; s.textContent='.hero-copy{visibility:hidden !important}'; document.head.appendChild(s); return 1; })()`,
}, sessionId);
await sleep(900);

const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: 1000, scale: 1 } }, sessionId);
const shotPath = path.join(os.tmpdir(), 'hc-hero.png');
fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));

// 3. decode that PNG in the page and sample the rects
await cdp.send('Runtime.evaluate', { expression: `document.getElementById('__hc').remove()` }, sessionId);
const dataUri = 'data:image/png;base64,' + shot.data;
const sampleRes = await cdp.send('Runtime.evaluate', {
  expression: `(async () => {
    const img = new Image(); img.src = ${JSON.stringify(dataUri)}; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const rects = ${JSON.stringify(rects)};
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const out = [];
    for (const R of rects) {
      if (R.w <= 0 || R.h <= 0) continue;
      const d = ctx.getImageData(Math.max(0,R.x), Math.max(0,R.y), Math.min(R.w, c.width-R.x), Math.min(R.h, c.height-R.y)).data;
      let minL = 2, maxL = -1, minPx = null, maxPx = null;
      for (let i = 0; i < d.length; i += 4) {
        const l = L(d[i], d[i+1], d[i+2]);
        if (l < minL) { minL = l; minPx = [d[i], d[i+1], d[i+2]]; }
        if (l > maxL) { maxL = l; maxPx = [d[i], d[i+1], d[i+2]]; }
      }
      out.push({ ...R, minL, maxL, minPx, maxPx });
    }
    return JSON.stringify(out);
  })()`, awaitPromise: true, returnByValue: true,
}, sessionId);
if (sampleRes.exceptionDetails) { console.error('sample error', JSON.stringify(sampleRes.exceptionDetails).slice(0,600)); process.exit(2); }
const samples = JSON.parse(sampleRes.result.value);

const parseRGB = (s) => { const m = s.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (l1, l2) => { const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };

console.log(`\n===== HERO TEXT CONTRAST @ ${width}px${mobile ? ' (mobile)' : ''} =====`);
console.log('(text colour vs the WORST backdrop pixel inside its own box)\n');
let worst = 99, anyFail = false;
for (const s of samples) {
  const fg = parseRGB(s.color);
  const lfg = L(fg);
  const rMin = ratio(lfg, s.minL), rMax = ratio(lfg, s.maxL);
  const w = Math.min(rMin, rMax);
  worst = Math.min(worst, w);
  const large = s.fontSize >= 24 || (s.fontSize >= 18.66 && Number(s.weight) >= 700);
  const need = large ? 3.0 : 4.5;
  const pass = w >= need;
  if (!pass) anyFail = true;
  console.log(`${s.label.padEnd(11)} ${String(Math.round(s.fontSize)).padStart(3)}px ${large ? 'large' : 'body '}  need ${need}  worst ${w.toFixed(2)}  ${pass ? 'PASS' : 'FAIL'}`);
  console.log(`            text rgb(${fg.join(',')})   worst backdrop rgb(${(rMax < rMin ? s.maxPx : s.minPx).join(',')})`);
}
console.log(`\noverall worst: ${worst.toFixed(2)}  ->  ${anyFail ? 'FAIL' : 'PASS'}`);
ws.close(); try { child.kill(); } catch {}
process.exit(anyFail ? 1 : 0);
