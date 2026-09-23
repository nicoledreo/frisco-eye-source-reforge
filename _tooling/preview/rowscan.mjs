#!/usr/bin/env node
// rowscan.mjs <srcUrl> — print per-row mean colour and intra-row spread for the
// first and last 40 rows, so a crop threshold is chosen from data, not by eye.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9630);
const SRC = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wd(p, t = 30000) { const t0 = Date.now(); while (Date.now() - t0 < t) { try { const r = await fetch('http://127.0.0.1:' + p + '/json/version'); if (r.ok) return await r.json(); } catch {} await sleep(250); } throw new Error('x'); }
class CDP { constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && this.p.has(m.id)) { const { resolve, reject } = this.p.get(m.id); this.p.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); } }); }
  send(me, pa = {}, s) { const id = ++this.id; return new Promise((res, rej) => { this.p.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify(s ? { id, method: me, params: pa, sessionId: s } : { id, method: me, params: pa })); setTimeout(() => { if (this.p.has(id)) { this.p.delete(id); rej(new Error('t')); } }, 120000); }); } }

const pf = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + pf, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const info = await wd(PORT);
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
const cdp = new CDP(ws);
const origin = new URL(SRC).origin;
const t = await cdp.send('Target.createTarget', { url: origin + '/' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
await cdp.send('Runtime.enable', {}, sessionId);
await sleep(2000);

const res = await cdp.send('Runtime.evaluate', {
  expression: `(async()=>{
    const img=new Image(); img.src=${JSON.stringify(SRC)}; await img.decode();
    const W=img.naturalWidth,H=img.naturalHeight;
    const c=document.createElement('canvas');c.width=W;c.height=H;
    const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
    const d=x.getImageData(0,0,W,H).data;
    const stat=(y)=>{let r=0,g=0,b=0,n=0;for(let i=0;i<W;i+=3){const o=(y*W+i)*4;r+=d[o];g+=d[o+1];b+=d[o+2];n++;}
      r/=n;g/=n;b/=n;let dev=0;
      for(let i=0;i<W;i+=3){const o=(y*W+i)*4;dev=Math.max(dev,Math.abs(d[o]-r)+Math.abs(d[o+1]-g)+Math.abs(d[o+2]-b));}
      return [Math.round(r),Math.round(g),Math.round(b),Math.round(dev)];};
    const top=[],bot=[];
    for(let y=0;y<46;y++)top.push(stat(y));
    for(let y=0;y<46;y++)bot.push(stat(H-1-y));
    return JSON.stringify({W,H,top,bot});
  })()`, awaitPromise: true, returnByValue: true }, sessionId);
if (res.exceptionDetails) { console.error(JSON.stringify(res.exceptionDetails).slice(0, 500)); process.exit(2); }
const o = JSON.parse(res.result.value);
console.log(`${o.W}x${o.H}`);
console.log('\n y   TOP  rgb            spread |  y   BOTTOM rgb          spread');
for (let i = 0; i < 46; i++) {
  const t2 = o.top[i], b2 = o.bot[i];
  console.log(
    String(i).padStart(3) + '  ' + `${t2[0]},${t2[1]},${t2[2]}`.padEnd(14) + String(t2[3]).padStart(5) +
    '   | ' + String(i).padStart(3) + '  ' + `${b2[0]},${b2[1]},${b2[2]}`.padEnd(14) + String(b2[3]).padStart(5)
  );
}
ws.close(); try { ch.kill(); } catch {}
