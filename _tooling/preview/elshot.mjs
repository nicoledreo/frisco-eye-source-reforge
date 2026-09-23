#!/usr/bin/env node
// elshot.mjs <url> <width> <mobile 0|1> <cssSelector> <out.png> [waitMs=6000]
// Screenshot ONE element the way a visitor sees it: a normal-height viewport, the element
// scrolled into view, then a wait so lazy iframes (maps, video) load at their real size.
// slices.mjs stretches the viewport to the full page height, which is right for layout but
// makes lazy embeds lay out mid-flight — use this to judge an embed's rendering.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9360);
const [, , URL_, W, MOBILE = '0', SEL, OUT, WAIT = '6000'] = process.argv;
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
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'elshot-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
try {
  const info = await waitForDevtools(PORT);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await cdp.send('Page.enable', {}, s); await cdp.send('Runtime.enable', {}, s);
  const mobile = MOBILE === '1';
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: Number(W), height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile }, s);
  await cdp.send('Page.navigate', { url: URL_ }, s);
  await sleep(2500);
  await cdp.send('Runtime.evaluate', { expression: `document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in')); document.querySelector(${JSON.stringify(SEL)}).scrollIntoView({block:'center'})` }, s);
  await sleep(Number(WAIT));
  const r = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify((()=>{const b=document.querySelector(${JSON.stringify(SEL)}).getBoundingClientRect();return {x:b.left+scrollX,y:b.top+scrollY,w:b.width,h:b.height}})())`, returnByValue: true }, s);
  const b = JSON.parse(r.result.value);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 } }, s);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`${OUT}  ${Math.round(b.w)}x${Math.round(b.h)}`);
  ws.close();
} finally { try { child.kill(); } catch {} setTimeout(() => process.exit(process.exitCode || 0), 400); }
