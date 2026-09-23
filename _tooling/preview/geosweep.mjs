#!/usr/bin/env node
// geosweep.mjs <baseUrl> <distDir> [widths=1440,390] — geometry sweep of EVERY page in one Chrome.
// Per page and width: horizontal scroll, hero image painted edge to edge, lead image painted
// edge to edge, broken images (naturalWidth 0 after load), elements past the right edge
// (the reviews rail and the decorative blobs excepted), and exactly one <h1>.
// Prints only failures, then a summary. SR_PORT as usual.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9370);
const [, , BASE, DIST, WIDTHS = '1440,390'] = process.argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
const pages = walk(DIST).map((f) => path.relative(DIST, f).split(path.sep).join('/')).sort();
async function waitForDevtools(port, t = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) { try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); } catch {} await sleep(250); }
  throw new Error('devtools not up');
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); this.h = []; ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } else if (m.method) for (const fn of this.h) fn(m); }); }
  send(method, params = {}, sid) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify(sid ? { id, method, params, sessionId: sid } : { id, method, params })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error('timeout ' + method)); } }, 60000); }); }
}
const MEASURE = `(() => {
  const vw = innerWidth, out = [];
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) out.push('horizontal scroll ' + sw + '>' + vw);
  const edge = (el, name) => { if (!el) return; const r = el.getBoundingClientRect(); if (Math.round(r.left) > 0 || Math.round(r.right) < vw) out.push(name + ' not edge to edge ' + Math.round(r.left) + '..' + Math.round(r.right)); };
  edge(document.querySelector('.hero-media img'), 'hero');
  edge(document.querySelector('img.lead'), 'lead');
  const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src'));
  if (broken.length) out.push('broken img ' + broken.slice(0, 3).join(' '));
  const skip = (e) => e.closest('.reviews, .bg-blobs, .mega, [hidden], .sr-only, .src-echo');
  const over = [...document.querySelectorAll('main *, header *, footer *')].filter((e) => { if (skip(e)) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1; });
  const top = over.filter((e) => !over.includes(e.parentElement)).slice(0, 3).map((e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : '') + '@' + Math.round(e.getBoundingClientRect().right));
  if (top.length) out.push('past right edge: ' + top.join(', '));
  const h1 = document.querySelectorAll('h1').length; if (h1 !== 1) out.push('h1 count ' + h1);
  return JSON.stringify(out);
})()`;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'geosweep-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let fails = 0, checked = 0;
try {
  const info = await waitForDevtools(PORT);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await cdp.send('Page.enable', {}, s); await cdp.send('Runtime.enable', {}, s);
  for (const W of WIDTHS.split(',').map(Number)) {
    const mobile = W < 700;
    for (const p of pages) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: mobile ? 844 : 900, deviceScaleFactor: 1, mobile }, s);
      await cdp.send('Page.navigate', { url: BASE.replace(/\/$/, '') + '/' + p }, s);
      await sleep(700);
      // expand so lazy images load, then measure
      const H = (await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true }, s)).result.value;
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.min(H, 16000), deviceScaleFactor: 1, mobile }, s);
      await sleep(900);
      const r = await cdp.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true }, s);
      const issues = r.exceptionDetails ? ['EVAL ERROR'] : JSON.parse(r.result.value);
      checked++;
      if (issues.length) { fails++; console.log(`${W}  ${p}\n    ${issues.join('\n    ')}`); }
    }
  }
  ws.close();
} finally {
  console.log(`\n${checked} page-widths checked, ${fails} with issues`);
  try { child.kill(); } catch {}
  setTimeout(() => process.exit(fails ? 1 : 0), 400);
}
