#!/usr/bin/env node
// sectioncontrast.mjs <url> <width> <mobile 0|1> <sectionSelector>
// herocontrast.mjs for ANY section: records every text element in the section, hides the
// section's text (color: transparent — layout and backgrounds untouched), screenshots the
// section, then reports each element's WORST-case WCAG ratio against the real pixels behind it.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9380);
const [, , URL_, W, MOBILE = '0', SEL] = process.argv;
const width = Number(W), mobile = MOBILE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForDevtools(port, t = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); } catch {} await sleep(250); }
  throw new Error('devtools not up');
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } }); }
  send(method, params = {}, sid) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error('timeout ' + method)); } }, 90000); }); }
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'seccontrast-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
let exitCode = 0;
try {
  const info = await waitForDevtools(PORT);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await cdp.send('Page.enable', {}, s); await cdp.send('Runtime.enable', {}, s);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile }, s);
  await cdp.send('Page.navigate', { url: URL_ }, s);
  await sleep(2500);
  const H = (await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true }, s)).result.value;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(H, 16000), deviceScaleFactor: 1, mobile }, s);
  await cdp.send('Runtime.evaluate', { expression: "document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))" }, s);
  await sleep(2000);
  const rects = JSON.parse((await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const sec = document.querySelector(${JSON.stringify(SEL)}); if (!sec) return '[]';
    const out = [];
    for (const el of sec.querySelectorAll('h1,h2,h3,h4,h5,p,a,li,span,b,strong,em,label,legend,cite,blockquote')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // Sample only where the glyphs are: the element box of a pill button includes its
      // rounded corners, where the page BEHIND the button shows (a false failure).
      const rg = document.createRange(); let u = null;
      for (const n of el.childNodes) { if (n.nodeType !== 3 || !n.textContent.trim()) continue; rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) { if (q.width < 1) continue; u = u ? { l: Math.min(u.l, q.left), t: Math.min(u.t, q.top), r: Math.max(u.r, q.right), b: Math.max(u.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom }; } }
      if (!u || u.r - u.l < 2 || u.b - u.t < 2) continue;
      out.push({ label: el.tagName.toLowerCase() + ':' + el.textContent.trim().slice(0, 28), color: cs.color, fontSize: parseFloat(cs.fontSize), weight: cs.fontWeight,
        x: Math.round(u.l), y: Math.round(u.t + scrollY), w: Math.round(u.r - u.l), h: Math.round(u.b - u.t) });
    }
    return JSON.stringify(out); })()` }, s)).result.value);
  if (!rects.length) { console.log('no text found in ' + SEL); exitCode = 2; }
  else {
    await cdp.send('Runtime.evaluate', { expression: `(() => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(SEL)} + ' *, ' + ${JSON.stringify(SEL)} + ' *::before, ' + ${JSON.stringify(SEL)} + ' *::marker { color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; border-bottom-color: transparent !important; }'; document.head.appendChild(st); return 1; })()` }, s);
    await sleep(800);
    const minY = Math.min(...rects.map((r) => r.y)), maxY = Math.max(...rects.map((r) => r.y + r.h));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: minY, width, height: Math.max(1, maxY - minY), scale: 1 } }, s);
    const res = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${shot.data}'; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const out = [];
      for (const R of ${JSON.stringify(rects)}) {
        const x = Math.max(0, R.x), y = Math.max(0, R.y - ${minY});
        const w = Math.min(R.w, c.width - x), h = Math.min(R.h, c.height - y); if (w < 1 || h < 1) continue;
        const d = ctx.getImageData(x, y, w, h).data; let minL = 2, maxL = -1;
        for (let i = 0; i < d.length; i += 4) { const l = L(d[i], d[i+1], d[i+2]); if (l < minL) minL = l; if (l > maxL) maxL = l; }
        out.push({ ...R, minL, maxL });
      }
      return JSON.stringify(out); })()` }, s);
    const samples = JSON.parse(res.result.value);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    let worst = 99, fails = 0;
    console.log(`== ${SEL} @ ${width}${mobile ? ' (mobile)' : ''}`);
    for (const x of samples) {
      const fg = x.color.match(/[\d.]+/g).map(Number);
      const a = fg.length > 3 ? fg[3] : 1;
      const lf = L(fg.slice(0, 3));
      const r = Math.min(ratio(lf, x.minL), ratio(lf, x.maxL));
      const large = x.fontSize >= 24 || (x.fontSize >= 18.66 && Number(x.weight) >= 700);
      const need = large ? 3 : 4.5;
      worst = Math.min(worst, r);
      if (r < need) fails++;
      console.log(`  ${r >= need ? 'PASS' : 'FAIL'} ${r.toFixed(2).padStart(5)} need ${need}  ${String(Math.round(x.fontSize)).padStart(2)}px${a < 1 ? ' (alpha ' + a + ', ratio uses opaque colour)' : ''}  ${x.label}`);
    }
    console.log(`  worst ${worst.toFixed(2)}  ${fails ? fails + ' FAIL' : 'all pass'}`);
    exitCode = fails ? 1 : 0;
  }
  ws.close();
} finally { try { child.kill(); } catch {} setTimeout(() => process.exit(exitCode), 400); }
