#!/usr/bin/env node
// verify5.mjs <url> <width> [mobile] — assert each session-5 fix took, from the
// LIVE computed styles and geometry. Prints PASS/FAIL per item; exits 1 on any FAIL.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.SR_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = Number(process.env.SR_PORT || 9270);
const [, , URL_, W, MOBILE = '0'] = process.argv;
const width = Number(W);
const mobile = MOBILE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(port, t = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < t) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-chrome-'));
const child = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1', '--disable-gpu', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const info = await waitForDevtools(PORT);
const ws = new WebSocket(info.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const cdp = new CDP(ws);
const t = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: 900 }, sessionId);
const loaded = cdp.once('Page.loadEventFired');
await cdp.send('Page.navigate', { url: URL_ }, sessionId);
await Promise.race([loaded, sleep(45000)]);
await sleep(2500);
{
  const m0 = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
  const fullH = Math.ceil((m0.cssContentSize || m0.contentSize).height);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: fullH, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: fullH }, sessionId);
  await sleep(2000);
  await cdp.send('Runtime.evaluate', { expression: `Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.addEventListener('load',r,{once:true});i.addEventListener('error',r,{once:true})})))`, awaitPromise: true }, sessionId).catch(() => {});
  await sleep(600);
}

const EXPR = `(() => {
  const cs = (sel, prop) => { const el = document.querySelector(sel); if (!el) return '(no element ' + sel + ')'; return getComputedStyle(el)[prop]; };
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
  const out = {};

  out.pagePadTop = cs('.page', 'paddingTop');
  out.pagePadBottom = cs('.page', 'paddingBottom');
  out.proseRowGap = cs('.prose', 'rowGap');
  out.footerMarginTop = cs('.site-footer', 'marginTop');
  out.footerBgImage = cs('.site-footer', 'backgroundImage');
  out.footerBackdrop = cs('.site-footer', 'backdropFilter');
  out.footerGridPadTop = cs('.site-footer .footer-grid', 'paddingTop');

  // geometry of the two seams that were 80px / 62px
  const cta = rect('.cta-band'), visit = rect('.visit-band'), footer = rect('.site-footer');
  out.seam_cta_to_visit = cta && visit ? visit.top - cta.bottom : null;
  out.seam_visit_to_footer = visit && footer ? footer.top - visit.bottom : null;

  // bento heading size
  out.bentoHeadFontSize = cs('.bento-head', 'fontSize');
  out.bentoHeadMarginTop = cs('.bento-head', 'marginTop');

  // form borders (unfocused)
  out.mainInputBorder = cs('.appt-form input[type="text"]', 'borderTopColor');
  out.footerInputBorder = cs('.footer-form input', 'borderTopColor');

  // appointment form columns
  out.apptCols = cs('.appt-form', 'gridTemplateColumns');

  // focus indicator: focus a plain footer link and read its outline
  const link = document.querySelector('.site-footer a[href]');
  let focusOutline = '(no footer link)';
  if (link) { link.focus(); const s = getComputedStyle(link); focusOutline = s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.outlineColor; }
  out.footerLinkFocusOutline = focusOutline;

  // hero scrim on mobile
  const scrim = document.querySelector('.hero-media');
  out.heroScrimAfter = scrim ? getComputedStyle(scrim, '::after').backgroundImage.slice(0, 150) : '(none)';

  // image scale
  out.images = [...document.images].filter(i => i.naturalWidth).map(i => ({
    src: i.currentSrc.split('/').pop(), renderW: Math.round(i.getBoundingClientRect().width),
    natW: i.naturalWidth, scale: +(i.getBoundingClientRect().width / i.naturalWidth).toFixed(2),
  })).sort((a, b) => b.scale - a.scale).slice(0, 4);

  // mega panel: opened in place so its real computed styles can be read
  const mega = document.querySelector('.mega[data-cols="4"]');
  if (mega) {
    mega.removeAttribute('hidden');
    const ms = getComputedStyle(mega);
    out.megaBg = ms.backgroundColor;
    out.megaBackdrop = ms.backdropFilter;
    const mh3 = mega.querySelector('h3');
    out.megaH3 = mh3 ? getComputedStyle(mh3).color : '(none)';
    out.megaCols = getComputedStyle(mega.querySelector('.mega-cols')).columnCount;
    mega.setAttribute('hidden', '');
  } else { out.megaBg = '(no mega)'; out.megaBackdrop = '(no mega)'; out.megaH3 = '(no mega)'; }

  out.eyebrowBg = cs('.hero-copy .eyebrow', 'backgroundColor');
  out.qaItems = document.querySelectorAll('.qa-strip .qa-item').length;
  out.qaIcons = document.querySelectorAll('.qa-strip .qa-ico svg').length;
  out.brandBanner = !!document.querySelector('.brand-banner img');
  const introP = document.querySelector('.prose > section.panel:nth-of-type(1) > p');
  out.introAlign = introP ? getComputedStyle(introP).textAlign : '(none)';

  out.maxImgScale = Math.max(0, ...[...document.images].filter(i => i.naturalWidth)
    .map(i => i.getBoundingClientRect().width / i.naturalWidth));

  out.docH = document.documentElement.scrollHeight;
  out.scrollW = document.documentElement.scrollWidth;
  out.clientW = document.documentElement.clientWidth;
  return JSON.stringify(out);
})()`;

const res = await cdp.send('Runtime.evaluate', { expression: EXPR, returnByValue: true }, sessionId);
if (res.exceptionDetails) { console.error('EVAL ERROR', JSON.stringify(res.exceptionDetails).slice(0, 1500)); process.exit(2); }
const o = JSON.parse(res.result.value);

const checks = [];
const eq = (name, got, want) => checks.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
const test = (name, got, fn, want) => checks.push({ name, got: String(got), want, pass: fn(got) });

if (!mobile) {
  eq('.page padding-top = 0', o.pagePadTop, '0px');
  eq('.page padding-bottom = 0', o.pagePadBottom, '0px');
  eq('.prose row-gap = 0', o.proseRowGap, '0px');
  eq('.site-footer margin-top = 0', o.footerMarginTop, '0px');
  eq('.site-footer background-image cleared', o.footerBgImage, 'none');
  eq('.site-footer backdrop-filter cleared', o.footerBackdrop, 'none');
  // Originally asserted 0px, to kill a 140px inset (2.5x the page rhythm). The
  // footer now carries a deliberate ~38px inset above a hairline divider, so
  // the assertion encodes the INTENT - no oversized gap - not the literal zero.
  test('.footer-grid inset is not oversized (<60px)', o.footerGridPadTop, (g) => parseFloat(g) < 60, '<60px');
  eq('seam cta-band -> visit-band = 0px', o.seam_cta_to_visit, '0');
  eq('seam visit-band -> footer = 0px', o.seam_visit_to_footer, '0');
  test('.bento-head font-size ~30.4px (was 16.32px)', o.bentoHeadFontSize, (g) => parseFloat(g) > 25, '>25px');
  eq('.bento-head margin-top = 0', o.bentoHeadMarginTop, '0px');
  // Palette-agnostic: assert the ALPHA the accessibility fix relies on, not a
  // specific composited RGB. The channel tokens were retheme'd once already and
  // hardcoded RGB assertions went stale and reported false failures.
  test('main input border alpha >= 0.5', o.mainInputBorder, (g) => { const m = g.match(/rgba?\([^)]*?([\d.]+)\s*\)$/); return m ? parseFloat(m[1]) >= 0.5 : false; }, 'alpha >= 0.5');
  test('footer input border alpha >= 0.5', o.footerInputBorder, (g) => { const m = g.match(/rgba?\([^)]*?([\d.]+)\s*\)$/); return m ? parseFloat(m[1]) >= 0.5 : false; }, 'alpha >= 0.5');
  test('footer link has a focus outline', o.footerLinkFocusOutline, (g) => /solid/.test(g) && !/^none/.test(g), 'solid …');
  test('mega menu is opaque (no backdrop-filter)', o.megaBackdrop, (g) => g === 'none', 'none');
  test('mega menu has an opaque background colour', o.megaBg, (g) => !/rgba\([^)]*,\s*0?\.\d+\s*\)/.test(g), 'no alpha');
  test('mega section titles are teal', o.megaH3, (g) => /41,\s*77,\s*85/.test(g), 'rgb(41,77,85)');
  test('hero scrim is teal, not near-black', o.heroScrimAfter, (g) => /41,\s*77,\s*85/.test(g), 'teal channel');
  test('hero eyebrow pill removed', o.eyebrowBg, (g) => g === 'none' || /rgba\(0,\s*0,\s*0,\s*0\)/.test(g), 'none / transparent');
} else {
  test('appt-form is single column at 390', o.apptCols, (g) => g.split(/\s+/).filter(Boolean).length === 1, 'one column');
  // Chrome OMITS "180deg" from the computed value because it is the default
  // gradient direction, so matching on the angle gives a false failure. Match on
  // the stop sequence instead, which is unique to the mobile rule.
  // Encodes the INTENT, not the literal stops: a teal top-to-bottom ramp (no 100deg)
  // whose weakest stop holds the >=0.86 contrast floor. The stops were raised from
  // 0.74/0.88/0.95 on 2026-09-23 because the lede measured 4.46:1 at 390; asserting
  // the old literals would have failed the fix. (Same lesson as the footer inset.)
  test('mobile hero scrim is the top-to-bottom teal ramp', o.heroScrimAfter,
    (g) => !/100deg/.test(g) && /rgba\(41, 77, 85/.test(g)
      && [...g.matchAll(/rgba\(41, 77, 85, ([\d.]+)\)/g)].every((m) => Number(m[1]) >= 0.86),
    'teal ramp, no 100deg, every stop >= 0.86');
  test('footer link has a focus outline', o.footerLinkFocusOutline, (g) => /solid/.test(g) && !/^none/.test(g), 'solid …');
}
test('no image upscaled beyond 1.2x', o.maxImgScale.toFixed(2), (g) => Number(g) <= 1.2, '<=1.20');
test('quick-action strip has 4 items', o.qaItems, (g) => Number(g) === 4, '4');
test('each quick-action has an inline SVG icon', o.qaIcons, (g) => Number(g) === 4, '4');
test('brand banner present', o.brandBanner, (g) => g === true || g === 'true', 'true');
if (!mobile) test('intro copy is centred', o.introAlign, (g) => g === 'center', 'center');
test('no horizontal page scroll', o.scrollW + '/' + o.clientW, (g) => { const [a, b] = g.split('/').map(Number); return a <= b; }, 'scrollW <= clientW');

console.log(`\n===== VERIFY @ ${width}px${mobile ? ' (mobile)' : ''} — docH ${o.docH} =====`);
let fails = 0;
for (const c of checks) {
  if (!c.pass) fails++;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}\n        got: ${c.got}${c.pass ? '' : `\n        want: ${c.want}`}`);
}
console.log('\nIMAGES (top scales):');
for (const i of o.images) console.log(`   ${i.scale}x  ${i.renderW}px <- ${i.natW}px  ${i.src}`);
console.log(`\n${checks.length - fails}/${checks.length} passed`);

ws.close(); try { child.kill(); } catch {}
process.exit(fails ? 1 : 0);
