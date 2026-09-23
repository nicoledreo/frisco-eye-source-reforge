#!/usr/bin/env node
// align.mjs <url> <width> — report the left/right edges of the rows that are
// supposed to line up, so alignment is checked by number not by eye.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9710);
const [, , URL_, W] = process.argv; const width = Number(W);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wd(p, t = 30000) { const t0 = Date.now(); while (Date.now() - t0 < t) { try { const r = await fetch('http://127.0.0.1:' + p + '/json/version'); if (r.ok) return await r.json(); } catch {} await sleep(250); } throw new Error('x'); }
class C { constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); this.h = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
    if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    else if (m.method) { for (const [k, f] of this.h) if (k === m.method) f(m.params); } }); }
  send(me, pa = {}, s) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify(s ? { id, method: me, params: pa, sessionId: s } : { id, method: me, params: pa })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error('t')); } }, 120000); }); }
  once(m) { return new Promise((r) => { this.h.set(m, (p) => { this.h.delete(m); r(p); }); }); } }
const pf = fs.mkdtempSync(path.join(os.tmpdir(), 'al-'));
const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + pf, '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const info = await wd(PORT); const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
const cdp = new C(ws); const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId); await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: 900 }, sessionId);
const l = cdp.once('Page.loadEventFired');
await cdp.send('Page.navigate', { url: URL_ }, sessionId);
await Promise.race([l, sleep(40000)]); await sleep(2500);
{ const m0 = await cdp.send('Page.getLayoutMetrics', {}, sessionId); const fh = Math.ceil((m0.cssContentSize || m0.contentSize).height);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: fh, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: fh }, sessionId); await sleep(1800); }
const r = await cdp.send('Runtime.evaluate', { expression: `(()=>{
  const E=(sel)=>{const e=document.querySelector(sel);if(!e)return null;const b=e.getBoundingClientRect();return {l:Math.round(b.left),r:Math.round(b.right),w:Math.round(b.width)};};
  const o={vw:document.documentElement.clientWidth};
  o.heroCopy=E('.hero-copy');
  o.heroInner=E('.hero-inner');
  o.reviewsRail=E('.sec-reviews .reviews');
  const cards=[...document.querySelectorAll('.sec-reviews .review')];
  o.firstCard=cards[0]?{l:Math.round(cards[0].getBoundingClientRect().left),w:Math.round(cards[0].getBoundingClientRect().width)}:null;
  o.cardCount=cards.length;
  // how many cards fit fully inside the rail's visible box
  if(cards.length){const rr=document.querySelector('.sec-reviews .reviews').getBoundingClientRect();
    let full=0;for(const c of cards){const b=c.getBoundingClientRect();if(b.left>=rr.left-1&&b.right<=rr.right+1)full++;}
    o.fullyVisibleCards=full;}
  o.opticalGrid=E('.sec-optical .figgrid');
  const figs=[...document.querySelectorAll('.sec-optical .figgrid figure')];
  o.opticalFirst=figs[0]?E('.sec-optical .figgrid figure'):null;
  o.opticalLastRight=figs.length?Math.round(figs[figs.length-1].getBoundingClientRect().right):null;

  // Optos: the BOX can be 100vw while an ancestor with overflow!=visible clips
  // what is actually painted. Walk up and report every clipping ancestor.
  const oi=document.querySelector('.sec-featuring .bento-media img');
  if(oi){
    o.optosBox=E('.sec-featuring .bento-media img');
    const chain=[];
    let n=oi.parentElement;
    while(n && n!==document.documentElement){
      const cs=getComputedStyle(n);
      const clips=cs.overflow!=='visible'||cs.overflowX!=='visible';
      const b=n.getBoundingClientRect();
      chain.push({tag:n.tagName.toLowerCase()+(n.className&&typeof n.className==='string'?'.'+n.className.trim().split(/\\s+/).slice(0,2).join('.'):''),
        overflow:cs.overflow+'/'+cs.overflowX, clips, l:Math.round(b.left), r:Math.round(b.right)});
      n=n.parentElement;
    }
    o.optosAncestors=chain;
    o.optosClippedBy=chain.filter(c=>c.clips).map(c=>c.tag+' @'+c.l+'-'+c.r);
  }
  return JSON.stringify(o,null,1);})()`, returnByValue: true }, sessionId);
console.log(r.result.value);
ws.close(); try { ch.kill(); } catch {}
