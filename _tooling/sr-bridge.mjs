#!/usr/bin/env node
// sr-bridge.mjs — a dependency-free CDP bridge for site-reforge's [browser] stages.
// Node 24 ships a global WebSocket, so driving Chrome needs no package at all.
//
//   node sr-bridge.mjs --jobs jobs.json
//
// jobs.json: [{ url, width, height, payload, out, awaitPromise, shot, full }]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.SR_CHROME
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9222);

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('devtools did not come up on port ' + port);
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method) {
        for (const [k, fn] of this.handlers) if (k === m.method) fn(m.params, m.sessionId);
      }
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
  once(method) { return new Promise((res) => { const fn = (p) => { this.handlers.delete(method); res(p); }; this.handlers.set(method, fn); }); }
}

async function main() {
  const jobs = JSON.parse(fs.readFileSync(arg('jobs'), 'utf8'));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-chrome-'));
  const child = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu',
    '--force-color-profile=srgb', '--font-render-hinting=none', 'about:blank',
  ], { stdio: 'ignore', detached: false });

  const info = await waitForDevtools(PORT);
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  const results = [];

  for (const job of jobs) {
    const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    try {
      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: job.width, height: job.height || 900, deviceScaleFactor: 1,
        mobile: !!job.mobile, screenWidth: job.width, screenHeight: job.height || 900,
      }, sessionId);
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url: job.url }, sessionId);
      await Promise.race([loaded, sleep(45000)]);
      await sleep(job.settle || 2500);

      if (job.payload) {
        const expr = fs.readFileSync(job.payload, 'utf8');
        const r = await cdp.send('Runtime.evaluate', {
          expression: expr, returnByValue: true, awaitPromise: !!job.awaitPromise, timeout: 90000,
        }, sessionId);
        if (r.exceptionDetails) throw new Error('payload threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        const val = r.result && r.result.value;
        if (val === undefined) throw new Error('payload returned undefined');
        fs.mkdirSync(path.dirname(job.out), { recursive: true });
        fs.writeFileSync(job.out, JSON.stringify(val));
        const vw = val && val.viewport && val.viewport.w;
        if (vw && Number(vw) !== Number(job.width)) throw new Error('viewport mismatch: asked ' + job.width + ', page reports ' + vw);
        results.push({ url: job.url, width: job.width, out: job.out, viewport: vw, ok: true });
      }

      if (job.shot) {
        const m = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
        const h = Math.ceil((m.cssContentSize || m.contentSize).height);
        const w = Math.ceil((m.cssContentSize || m.contentSize).width);
        const clip = job.full ? { x: 0, y: 0, width: job.width, height: h, scale: 1 } : undefined;
        if (job.full) {
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: job.width, height: h, deviceScaleFactor: 1, mobile: !!job.mobile,
            screenWidth: job.width, screenHeight: h,
          }, sessionId);
          await sleep(400);
        }
        const s = await cdp.send('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: !!job.full, ...(clip ? { clip } : {}),
        }, sessionId);
        fs.mkdirSync(path.dirname(job.shot), { recursive: true });
        fs.writeFileSync(job.shot, Buffer.from(s.data, 'base64'));
        results.push({ url: job.url, width: job.width, shot: job.shot, docHeight: h, docWidth: w, ok: true });
      }
    } catch (e) {
      results.push({ url: job.url, width: job.width, ok: false, error: e.message });
      process.stderr.write('FAIL ' + job.url + ' @' + job.width + ': ' + e.message + '\n');
    } finally {
      await cdp.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
    }
  }

  ws.close();
  try { child.kill(); } catch {}
  const outFile = arg('report');
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  const bad = results.filter((r) => !r.ok).length;
  process.stdout.write('bridge: ' + (results.length - bad) + ' ok, ' + bad + ' failed\n');
  for (const r of results) if (!r.ok) process.stdout.write('  FAIL ' + r.url + ' @' + r.width + ' — ' + r.error + '\n');
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { process.stderr.write('bridge fatal: ' + e.stack + '\n'); process.exit(2); });
