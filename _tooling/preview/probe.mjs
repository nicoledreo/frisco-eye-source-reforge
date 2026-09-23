#!/usr/bin/env node
// probe.mjs <url> <width> <mobile 0|1> <jsFile|-e expr> — load a page in headless Chrome at the
// given width (viewport expanded to full document height so lazy content is laid out), then
// evaluate a JS expression in the page and print its JSON result.
// Use a distinct SR_PORT per concurrent run (default 9350) or the Chromes collide.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9350);
const [, , URL_, W, MOBILE = '0', A4, A5] = process.argv;
const EXPR = A4 === '-e' ? A5 : fs.readFileSync(A4, 'utf8');
const width = Number(W), mobile = MOBILE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, t = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error('devtools not up on ' + port);
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
    return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error('timeout ' + method)); } }, 90000); });
  }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
try {
  const info = await waitForDevtools(PORT);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await cdp.send('Page.enable', {}, s);
  await cdp.send('Runtime.enable', {}, s);
  const H = mobile ? 844 : 900;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: H, deviceScaleFactor: 1, mobile }, s);
  await cdp.send('Page.navigate', { url: URL_ }, s);
  await sleep(2500);
  // expand to full height so lazy images load and reveal-on-scroll content is laid out
  const docH = (await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true }, s)).result.value;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(docH, 16000), deviceScaleFactor: 1, mobile }, s);
  await cdp.send('Runtime.evaluate', { expression: "document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))" }, s);
  await sleep(1800);
  const r = await cdp.send('Runtime.evaluate', { expression: `(async()=>{ const __r = await (async()=>{ return (${EXPR}); })(); return JSON.stringify(__r); })()`, awaitPromise: true, returnByValue: true }, s);
  if (r.exceptionDetails) { console.error('EVAL ERROR', JSON.stringify(r.exceptionDetails).slice(0, 700)); process.exitCode = 2; }
  else console.log(r.result.value);
  ws.close();
} finally {
  try { child.kill(); } catch {}
  setTimeout(() => process.exit(process.exitCode || 0), 400);
}
