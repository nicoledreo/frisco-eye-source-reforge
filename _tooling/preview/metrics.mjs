#!/usr/bin/env node
// metrics.mjs <url> <width> <out.json> [mobile]
// Loads the page in headless Chrome and dumps OBJECTIVE layout facts:
// horizontal overflow, large vertical voids, key element rects, and
// duplicate-text occurrences. No judgement — just numbers.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9240);
const [, , URL_, W, OUT, MOBILE = '0'] = process.argv;
const width = Number(W);
const mobile = MOBILE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); }
    catch {}
    await sleep(250);
  }
  throw new Error('devtools did not come up on ' + port);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) { for (const [k, fn] of this.handlers) if (k === m.method) fn(m.params); }
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-chrome-'));
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

// Expand the viewport to the full document before measuring. At a 900px-tall
// viewport every lazy-loaded image below the fold still reports naturalWidth 0,
// so an image-scale audit would silently skip most of the page and rank
// confidently off 3 of 14 images. Measure the whole document instead.
{
  const m0 = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
  const fullH = Math.ceil((m0.cssContentSize || m0.contentSize).height);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height: fullH, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: fullH,
  }, sessionId);
  await sleep(2500);
  // Decode-wait: naturalWidth is only populated once the bytes are in.
  await cdp.send('Runtime.evaluate', {
    expression: `Promise.all([...document.images].map(i => i.complete ? 1 : new Promise(r => { i.addEventListener('load', r, {once:true}); i.addEventListener('error', r, {once:true}); })))`,
    awaitPromise: true,
  }, sessionId).catch(() => {});
  await sleep(800);
}

const EXPR = `(() => {
  const docW = document.documentElement.clientWidth;
  const out = { docW, docH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth };

  const vis = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length; };
  const desc = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\\s+/).slice(0,3).join('.');
    return s;
  };

  // 1. Horizontal overflow: any visible element whose box sticks out past the viewport.
  out.overflow = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const over = Math.round(r.right - docW);
    if (over > 1) out.overflow.push({ sel: desc(el), over, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent||'').trim().slice(0,60) });
  }
  out.overflow.sort((a,b) => b.over - a.over);
  out.overflow = out.overflow.slice(0, 40);

  // 2. Clipped children: a child wider/righter than its overflow-hidden parent.
  out.clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflowX !== 'hidden' && s.overflowX !== 'clip' && s.overflow !== 'hidden') continue;
    const pr = el.getBoundingClientRect();
    for (const c of el.children) {
      if (!vis(c)) continue;
      const cr = c.getBoundingClientRect();
      const over = Math.round(cr.right - pr.right);
      if (over > 2) out.clipped.push({ parent: desc(el), child: desc(c), over, text: (c.textContent||'').trim().slice(0,60) });
    }
  }
  out.clipped = out.clipped.slice(0, 30);

  // 3. Wide text columns sitting in much wider containers (dead space to the right).
  out.deadRight = [];
  for (const el of document.querySelectorAll('p, h1, h2, h3, h4, ul, ol')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const par = el.parentElement; if (!par) continue;
    const prr = par.getBoundingClientRect();
    const slack = Math.round(prr.right - r.right);
    if (slack > 180 && r.width > 200) out.deadRight.push({ sel: desc(el), slack, w: Math.round(r.width), parentW: Math.round(prr.width), text: (el.textContent||'').trim().slice(0,50) });
  }
  out.deadRight.sort((a,b) => b.slack - a.slack);
  out.deadRight = out.deadRight.slice(0, 25);

  // 4. Large vertical voids between consecutive siblings in the main flow.
  out.voids = [];
  const walk = (root) => {
    const kids = [...root.children].filter(vis);
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i-1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
      const gap = Math.round(b.top - a.bottom);
      if (gap > 90) out.voids.push({ after: desc(kids[i-1]), before: desc(kids[i]), gap, y: Math.round(a.bottom + window.scrollY) });
    }
    for (const k of kids) if (k.children.length) walk(k);
  };
  walk(document.body);
  out.voids.sort((a,b) => b.gap - a.gap);
  out.voids = out.voids.slice(0, 25);

  // 5. Grid/flex columns that end far above their tallest sibling (ragged column bottoms).
  out.ragged = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    if (!/grid|flex/.test(s.display)) continue;
    const kids = [...el.children].filter(vis);
    if (kids.length < 2) continue;
    const rects = kids.map(k => k.getBoundingClientRect());
    const tops = new Set(rects.map(r => Math.round(r.top)));
    if (tops.size > 1) continue; // not a single row
    const bots = rects.map(r => r.bottom);
    const spread = Math.round(Math.max(...bots) - Math.min(...bots));
    if (spread > 80) out.ragged.push({ sel: desc(el), spread, cols: kids.length, bottoms: bots.map(b => Math.round(b)) });
  }
  out.ragged.sort((a,b) => b.spread - a.spread);
  out.ragged = out.ragged.slice(0, 20);

  // 6. Images: rendered size vs intrinsic (upscaling = blur).
  out.images = [];
  for (const img of document.querySelectorAll('img')) {
    if (!vis(img)) continue;
    const r = img.getBoundingClientRect();
    const nat = img.naturalWidth || 0;
    if (!nat) continue;
    out.images.push({ src: img.currentSrc.split('/').pop(), renderW: Math.round(r.width), natW: nat, natH: img.naturalHeight, scale: +(r.width / nat).toFixed(2) });
  }
  out.images.sort((a,b) => b.scale - a.scale);

  // 7. Small tap targets (mobile ergonomics).
  out.smallTargets = [];
  for (const el of document.querySelectorAll('a, button, input, select, textarea')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.height < 32) out.smallTargets.push({ sel: desc(el), h: Math.round(r.height), w: Math.round(r.width), text: (el.textContent||'').trim().slice(0,32) });
  }
  out.smallTargets = out.smallTargets.slice(0, 30);

  // 8. Repeated text blocks (content duplication).
  const norm = (s) => s.replace(/\\s+/g, ' ').trim().toLowerCase();
  const seen = new Map();
  for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,p,li,td,th')) {
    if (!vis(el)) continue;
    const txt = norm(el.textContent || '');
    if (txt.length < 12) continue;
    if (!seen.has(txt)) seen.set(txt, []);
    seen.get(txt).push(desc(el));
  }
  out.dupText = [...seen.entries()].filter(([, v]) => v.length > 1)
    .map(([txt, v]) => ({ n: v.length, txt: txt.slice(0, 70), where: v.slice(0, 5) }))
    .sort((a, b) => b.n - a.n).slice(0, 30);

  // 9. Section inventory in document order, with heights.
  out.sections = [];
  for (const el of document.querySelectorAll('body > *, main > *, .prose > section, .prose > div')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 20) continue;
    const h = el.querySelector('h1,h2,h3');
    out.sections.push({ sel: desc(el), y: Math.round(r.top + window.scrollY), h: Math.round(r.height), heading: h ? h.textContent.trim().slice(0,50) : '' });
  }
  return JSON.stringify(out);
})()`;

const res = await cdp.send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: false }, sessionId);
if (res.exceptionDetails) { console.error('EVAL ERROR', JSON.stringify(res.exceptionDetails).slice(0, 2000)); }
const data = JSON.parse(res.result.value);
data.meta = { url: URL_, width, mobile };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2));

ws.close();
try { child.kill(); } catch {}
console.log(`wrote ${OUT}`);
console.log(`docW=${data.docW} scrollW=${data.scrollW} docH=${data.docH}`);
console.log(`overflow=${data.overflow.length} clipped=${data.clipped.length} deadRight=${data.deadRight.length} voids=${data.voids.length} ragged=${data.ragged.length} dupText=${data.dupText.length} smallTargets=${data.smallTargets.length}`);
