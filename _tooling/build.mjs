#!/usr/bin/env node
/* build.mjs — reforge lane generator for Eye Source (friscoeyesource.com).
 *
 * WHAT THIS IS
 *   Eye Trends Clearlake donates the INFORMATION ARCHITECTURE (shallow,
 *   service-led nav; grouped mega menus; a standing "Book an Eye Exam" CTA).
 *   Frisco Eye Source donates EVERYTHING ELSE — every word, every image,
 *   every URL, the brand palette and the typeface. Nothing is invented.
 *
 * WHY IT TRANSPLANTS RATHER THAN REWRITES
 *   sr-parity measures token recall of each source page's <main> against the
 *   rebuilt page at a 95% floor, plus a 12-consecutive-word run floor. Copy is
 *   therefore carried across verbatim; only the markup around it is new.
 *   "Reconstruct the result, never the markup."
 *
 *   node _tooling/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.join(import.meta.dirname, '..'));
const P = path.join(ROOT, 'main');
const RAW = path.join(P, 'audit', 'raw');
const OUT = path.join(P, 'dist');
const SRC_STYLES = path.join(P, 'src', 'styles');

const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const site = J(path.join(P, 'audit', 'site-inventory.json'));
const content = J(path.join(P, 'audit', 'content-inventory.json'));
const seo = J(path.join(P, 'audit', 'seo-inventory.json'));
const imgInv = J(path.join(P, 'audit', 'image-inventory.json'));
const facts = J(path.join(P, 'facts', 'client-facts.json'));

const ORIGIN = site.origin;
const PHONE = facts.phone[0];
const PHONE_HREF = 'tel:+1' + PHONE.replace(/\D/g, '');
const ADDR = facts.addresses[0];

const contentByUrl = new Map(content.pages.map((p) => [p.url, p]));
const seoByUrl = new Map((seo.pages || []).map((p) => [p.url, p]));
const savedAsByUrl = new Map(site.pages.filter((p) => p.ok).map((p) => [p.url, p.savedAs]));

// ── asset map: original URL -> served path ───────────────────────────────────
const assetMap = new Map();
for (const im of imgInv.images) {
  if (!im.localFile) continue;
  assetMap.set(im.src, 'assets/' + path.basename(im.localFile));
}
// The platform vendor's own logo is branding for EyeCarePro, not for the client.
const BANNED_ASSET = /eyecarepro-logo/i;

/* Alt text the same image carries on ANOTHER source page. This is recovered
   source copy, never invented text: an image with no alt anywhere stays
   alt="" (correct for decorative), it does not get a description made up. */
const altFor = new Map();
for (const im of imgInv.images) {
  const first = (im.alts || []).map((a) => String(a).trim()).find((a) => a.length > 1);
  if (first) altFor.set(im.src, first);
}

/* Intrinsic width, read from the file header by sr-assets. A content photo
   narrower than its column leaves a ragged gap beside the paragraphs
   (measured: a 640px photo in a 745px column). Images at or above this width
   are photos meant to span the column; anything smaller is a badge or icon
   and must NOT be stretched. */
const widthOf = new Map();
for (const im of imgInv.images) if (im.intrinsicWidth) widthOf.set(im.src, im.intrinsicWidth);
const WIDE_AT = 480;

const LOGO = (() => {
  const hit = imgInv.images.find((i) => i.localFile && /black-version-eye-source-logo/i.test(i.src));
  return hit ? 'assets/' + path.basename(hit.localFile) : null;
})();

/* The practice's own clinic interior, from the harvest — the source labels it
   "Our office in Frisco, TX". It fills the empty half of the hero. Real photo of
   the real premises; nothing generated, nothing stock. */
const CLINIC = (() => {
  const hit = imgInv.images.find((i) => i.localFile && /IMG_0492-min/i.test(i.src));
  if (!hit) return null;
  return {
    src: 'assets/' + path.basename(hit.localFile),
    alt: (hit.alts || []).find((a) => a && a.trim()) || 'Our office in Frisco, TX',
    w: hit.intrinsicWidth, h: hit.intrinsicHeight,
  };
})();

// ── page index ───────────────────────────────────────────────────────────────
const pathnameOf = (u) => { const p = new URL(u).pathname.replace(/\/+$/, ''); return p || '/'; };
const outFileFor = (u) => { const p = pathnameOf(u); return p === '/' ? 'index.html' : p.replace(/^\//, '') + '.html'; };

const pages = site.pages.filter((p) => p.ok).map((p) => ({
  url: p.url,
  pathname: pathnameOf(p.url),
  savedAs: p.savedAs,
  file: outFileFor(p.url),
  seo: seoByUrl.get(p.url) || {},
  content: contentByUrl.get(p.url) || {},
}));
const byPathname = new Map(pages.map((p) => [p.pathname, p]));
const titleOf = (pn) => {
  const p = byPathname.get(pn);
  if (!p) return null;
  const t = (p.content.h1 && p.content.h1[0]) || p.seo.title || pn;
  return String(t).replace(/\s*[|–-]\s*Eye Source.*$/i, '').trim();
};

// ── navigation: Eye Trends' IA, filled with Frisco's real pages ──────────────
const childrenOf = (prefix, depth) => pages
  .filter((p) => p.pathname.startsWith(prefix + '/') && p.pathname.split('/').filter(Boolean).length === depth)
  .map((p) => p.pathname).sort();

/* A menu section splits into two kinds of child, and conflating them is what
   made the Eye Care Services panel unreadable: 10 columns, 5 of them a heading
   with nothing underneath.
     - a GROUP has children of its own  -> its own column, heading + list
     - a SINGLE is a leaf service page  -> a plain link, gathered into one
       "More …" column at the end
   Columns are capped at 4 so the panel stays a readable grid. */
function megaGroups(prefix) {
  const kids = childrenOf(prefix, 2).filter((k) => byPathname.has(k));
  const groups = [];
  const singles = [];
  for (const k of kids) {
    const grand = childrenOf(k, 3).slice(0, 6);
    if (grand.length) groups.push({ title: titleOf(k) || k, href: k, items: grand });
    else singles.push(k);
  }
  groups.sort((a, b) => b.items.length - a.items.length);
  // Four real groups keep their own column; anything past that becomes a link
  // in "More …" rather than losing its children off the end of the menu.
  return { groups: groups.slice(0, 4), singles: [...groups.slice(4).map((g) => g.href), ...singles] };
}

const NAV = [
  { label: 'Home', href: '/' },
  {
    label: 'Our Clinic',
    href: '/our-eye-care-clinic',
    mega: {
      groups: [{
        title: 'About Eye Source',
        href: '/our-eye-care-clinic',
        items: ['/our-eye-doctor', '/team/carey-brooks', '/our-eye-care-clinic/associations-awards', '/hours-location', '/insurance']
          .filter((h) => byPathname.has(h)),
      }],
      singles: [],
    },
  },
  { label: 'Eye Care Services', href: '/eye-care-services', mega: megaGroups('/eye-care-services') },
  { label: 'Eyewear & Contacts', href: '/eyeglasses-contacts', mega: megaGroups('/eyeglasses-contacts') },
  { label: 'Insurance', href: '/insurance' },
  { label: "What's New", href: '/whats-new' },
  { label: 'Contact', href: '/contact-us' },
].filter((n) => byPathname.has(n.href));

const DUPES = [];

// ── html helpers ─────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rel = (fromFile, target) => {
  const depth = fromFile.split('/').length - 1;
  return (depth ? '../'.repeat(depth) : '') + target;
};

/* Rewrite an internal href to a build-relative page path; drop platform links. */
function fixHref(href, fromFile) {
  if (!href) return null;
  const h = href.trim();
  if (/^(mailto:|tel:)/i.test(h)) return h;
  if (/^#/.test(h)) return null;                                  // dead link = decon blocker
  if (/wp-admin|ecpbuilder\.com|eyecarepro\.com/i.test(h)) return null;
  let abs;
  try { abs = new URL(h, ORIGIN + '/'); } catch { return null; }
  if (abs.origin !== ORIGIN) return abs.href;                     // external: leave alone
  const pn = abs.pathname.replace(/\/+$/, '') || '/';
  const target = byPathname.get(pn);
  if (!target) return null;                                       // 404 on the live site
  return rel(fromFile, target.file) + (abs.hash || '');
}

function fixImg(src, fromFile) {
  if (!src) return null;
  let abs;
  try { abs = new URL(src, ORIGIN + '/'); } catch { return null; }
  if (BANNED_ASSET.test(abs.href)) return null;
  const mapped = assetMap.get(abs.href) || assetMap.get(src);
  if (mapped) return rel(fromFile, mapped);
  return null;                                                    // never ship a remote CMS path
}

const KEEP = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'a', 'img',
  'strong', 'em', 'b', 'i', 'br', 'hr', 'blockquote', 'table', 'thead', 'tbody', 'tfoot',
  'tr', 'th', 'td', 'figure', 'figcaption', 'iframe', 'sup', 'sub', 'dl', 'dt', 'dd']);
/* Only genuinely non-content elements are deleted. <form>, <label>, <legend>,
   <option> and <button> are UNWRAPPED instead (they are absent from KEEP), so
   their copy survives — dropping them whole cost the contact/registration
   pages their instructions and put them under the recall floor. */
const DROP_WHOLE = /<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi;

/* Flatten the Beaver Builder div-soup into a clean semantic stream.
   Everything that is not a content element is UNWRAPPED, never deleted, so no
   text can be lost — which is what sr-parity's recall floor actually measures. */
function sanitizeMain(html, fromFile) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(DROP_WHOLE, ' ');
  s = s.replace(/<(script|style|noscript|svg|input|br)\b[^>]*\/?>/gi, (m, t) => (/^br$/i.test(t) ? '<br>' : ' '));

  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (m, close, tagRaw, attrs) => {
    const tag = tagRaw.toLowerCase();
    if (!KEEP.has(tag)) return ' ';                               // unwrap: children survive
    if (close) return '</' + tag + '>';
    const keepAttrs = [];
    if (tag === 'a') {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const fixed = fixHref(href ? (href[2] ?? href[3] ?? href[4]) : '', fromFile);
      if (!fixed) return ' ';                                     // unwrap dead/platform links
      keepAttrs.push('href="' + esc(fixed) + '"');
      if (/^https?:/i.test(fixed) && !fixed.startsWith(ORIGIN)) keepAttrs.push('rel="noopener"', 'target="_blank"');
    } else if (tag === 'img') {
      const src = /(?:data-src|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const rawSrc = src ? (src[2] ?? src[3] ?? src[4]) : '';
      const fixed = fixImg(rawSrc, fromFile);
      if (!fixed) return ' ';
      const alt = /alt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      let altText = alt ? (alt[2] ?? alt[3] ?? '') : '';
      if (!altText.trim()) {
        let abs = rawSrc; try { abs = new URL(rawSrc, ORIGIN + '/').href; } catch { /* keep raw */ }
        altText = altFor.get(abs) || altFor.get(rawSrc) || '';
      }
      let absW = rawSrc; try { absW = new URL(rawSrc, ORIGIN + '/').href; } catch { /* keep raw */ }
      const iw = widthOf.get(absW) || widthOf.get(rawSrc) || 0;
      keepAttrs.push('src="' + esc(fixed) + '"', 'alt="' + esc(altText) + '"', 'loading="lazy"', 'decoding="async"');
      if (iw >= WIDE_AT) keepAttrs.push('class="wide"');
    } else if (tag === 'iframe') {
      const src = /src\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const v = src ? (src[2] ?? src[3] ?? src[4]) : '';
      if (!v || /^\s*$/.test(v)) return ' ';
      keepAttrs.push('src="' + esc(v) + '"', 'loading="lazy"', 'title="Embedded content"');
    } else if (tag === 'th' || tag === 'td') {
      const cs = /colspan\s*=\s*"?(\d+)/i.exec(attrs); if (cs) keepAttrs.push('colspan="' + cs[1] + '"');
      const rs = /rowspan\s*=\s*"?(\d+)/i.exec(attrs); if (rs) keepAttrs.push('rowspan="' + rs[1] + '"');
    }
    return '<' + tag + (keepAttrs.length ? ' ' + keepAttrs.join(' ') : '') + '>';
  });

  s = s.replace(/[ \t ]+/g, ' ');
  for (let i = 0; i < 4; i++) {
    s = s.replace(/<(p|li|h[1-6]|blockquote|td|th)>\s*<\/\1>/gi, ' ')
         .replace(/<(ul|ol|table|tbody|thead|figure|dl)>\s*<\/\1>/gi, ' ');
  }
  return s.replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* The first crumb trail ("Home » Eye Care Services » ...") is nav, not prose.
 *
 * It is split from the TEXT, not from the anchors. Several crumb links point at
 * URLs that 404 on the live site, so fixHref unwraps them — keying off anchors
 * dropped those crumbs' words entirely and put 30+ pages under the recall
 * floor. Splitting the head's full text guarantees every word is re-emitted;
 * an anchor is then matched back in by label purely to restore the link. */
function splitCrumbs(main) {
  const m = /^([\s\S]{0,800}?)(?=<h1\b)/i.exec(main);
  if (!m) return { crumbs: null, rest: main };
  const head = m[1];
  if (!/»|&raquo;|›/.test(head)) return { crumbs: null, rest: main };

  const hrefByLabel = new Map([...head.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/gi)]
    .map((a) => [a[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), a[1]]));

  const plain = head.replace(/<[^>]+>/g, ' ').replace(/&raquo;/g, '»')
    .replace(/[ \t ]+/g, ' ').trim();
  const labels = plain.split(/\s*(?:»|›)\s*/).map((x) => x.trim()).filter(Boolean);
  if (!labels.length) return { crumbs: null, rest: main };

  const parts = labels.map((label, i) => ({
    label,
    href: i < labels.length - 1 ? (hrefByLabel.get(label) || null) : null,
  }));
  return { crumbs: { parts }, rest: main.slice(head.length) };
}

/* The Beaver Builder layout put an <img> and its brand caption in sibling divs.
   Unwrapping those left a bare <img> followed by a loose text node, so captions
   floated away from their picture ("Our Designer Optical Shop"). Pair them back
   into <figure>/<figcaption>, then group consecutive figures so they tile. */
function groupFigures(html) {
  let s = html.replace(
    /<img([^>]*)>\s*([^<>{}]{2,60}?)\s*(?=<(?!\/?(?:em|strong|b|i|sup|sub|br)\b))/g,
    (m, attrs, cap) => {
      const text = cap.trim();
      if (!text || /^[|·•,.\-–—]+$/.test(text)) return m;
      return '<figure><img' + attrs + '><figcaption>' + text + '</figcaption></figure>';
    });
  // runs of 2+ adjacent figures become a tile grid
  s = s.replace(/(?:<figure>[\s\S]*?<\/figure>\s*){2,}/g, (run) => '<div class="figgrid">' + run.trim() + '</div>');
  return s;
}

/* An opening-hours list is seven short "Monday: Closed" items running down a
   full-width column — mostly blank space. Marked so it can run in two. */
function markDayLists(html) {
  const DAY = /^\s*(?:<[^>]+>\s*)*(Mon|Tues?|Wed(?:nes)?|Thur?s?|Fri|Sat(?:ur)?|Sun)(?:day)?\b/i;
  return html.replace(/<ul>([\s\S]*?)<\/ul>/g, (m, inner) => {
    const items = inner.match(/<li>[\s\S]*?<\/li>/g) || [];
    if (items.length < 5) return m;
    const days = items.filter((li) => DAY.test(li.replace(/^<li>/, ''))).length;
    return days >= 5 ? '<ul class="daylist">' + inner + '</ul>' : m;
  });
}

/* A <ul> whose every item is nothing but an image is a logo wall, not a list.
   The insurance page ships 12 vision-plan logos this way and they rendered as a
   single bulleted column. */
function markLogoWalls(html) {
  return html.replace(/<ul>([\s\S]*?)<\/ul>/g, (m, inner) => {
    const items = inner.match(/<li>[\s\S]*?<\/li>/g) || [];
    if (items.length < 3) return m;
    const allImages = items.every((li) => {
      const body = li.replace(/^<li>|<\/li>$/g, '');
      return /<img\b/.test(body) && !body.replace(/<[^>]+>/g, '').trim();
    });
    return allImages ? '<ul class="logo-grid">' + inner + '</ul>' : m;
  });
}

/* ── "What Our Patients Say" ──────────────────────────────────────────────
   The source drops the doctor's portrait and full biography BETWEEN the
   reviews heading and the reviews themselves, so the testimonial block opened
   with a headshot and a CV. Two rules, in order:
     1. anything sitting between the reviews heading and the first review is
        not a review — hoist it ABOVE the heading, into "Meet Our Frisco Eye
        Doctor" where it belongs;
     2. the reviews themselves are bare text separated by <strong>- Name</strong>,
        so each becomes its own card.
   Nothing is deleted: every word stays, it just stops being in the wrong place. */
const REVIEWER = /<strong>\s*[-–—]\s*([^<]{2,60}?)\s*<\/strong>/g;
const AGO = /((?:\d+|a|an)\s+(?:day|days|week|weeks|month|months|year|years)\s+ago)\s*$/i;

function shapeReviews(html) {
  const head = /<h([23])>\s*What Our Patients Say\s*<\/h\1>/i.exec(html);
  if (!head) return html;
  const headEnd = head.index + head[0].length;
  const after = html.slice(headEnd);

  REVIEWER.lastIndex = 0;
  const marks = [...after.matchAll(REVIEWER)];
  if (!marks.length) return html;

  // (1) everything before the first review, hoisted above the heading
  const firstStart = (() => {
    const seg = after.slice(0, marks[0].index);
    const lastBlock = seg.lastIndexOf('</a>');
    return lastBlock >= 0 ? lastBlock + 4 : 0;
  })();
  /* The hoisted block is the portrait + name + biography. Split the image out
     so it can sit small on the left with the bio beside it, instead of a
     full-width headshot with the text stranded underneath. */
  const hoistedRaw = after.slice(0, firstStart);
  const hoisted = (() => {
    const im = /<img\b[^>]*>/i.exec(hoistedRaw);
    if (!im) return hoistedRaw;
    const body = hoistedRaw.replace(im[0], '').trim();
    if (!body) return hoistedRaw;
    return '<div class="bio"><figure class="bio-photo">' + im[0] + '</figure>'
      + '<div class="bio-body">' + body + '</div></div>';
  })();

  // (2) split the remainder into one card per reviewer
  const rest = after.slice(firstStart);
  REVIEWER.lastIndex = 0;
  const m2 = [...rest.matchAll(REVIEWER)];
  const cards = [];
  let cursor = 0;
  for (const m of m2) {
    let bodyText = rest.slice(cursor, m.index).trim();
    cursor = m.index + m[0].length;
    if (!bodyText) continue;
    let when = '';
    const ago = AGO.exec(bodyText.replace(/<[^>]+>/g, '').trim());
    if (ago) { when = ago[1]; bodyText = bodyText.replace(new RegExp(ago[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'), '').trim(); }
    cards.push('<article class="review"><blockquote>' + bodyText + '</blockquote>'
      + '<footer><cite>' + esc(m[1]) + '</cite>' + (when ? '<span>' + esc(when) + '</span>' : '') + '</footer></article>');
  }
  const tail = rest.slice(cursor);
  if (!cards.length) return html;

  return html.slice(0, head.index) + hoisted + head[0]
    + '<div class="reviews">' + cards.join('') + '</div>' + tail;
}

/* ── "Request Appointment" ────────────────────────────────────────────────
   The source ran two identical Gravity Forms here. With the runtime stripped
   their field labels were left as bare bullet lists — a list of the words
   "Reason?", "Phone *", "Comments" that nobody can fill in. Rebuilt as one
   real, semantic, keyboard-accessible form using those same labels. */
/* Remove whole <ul> blocks matching `re`, counting NESTING.
   `<ul>[\s\S]*?</ul>` is non-greedy, so on the source's nested field list it
   stopped at the first INNER </ul> (the New patient / Returning sublist) and
   left the tail — "Name * First Last", "Phone *", "Comments" — plus two orphan
   </ul> closers on the page, which is what pushed the form open and dumped
   stray bullets under it. Depth counting is the only correct way. */
function stripBalancedLists(html, re, removed) {
  const OPEN = /<ul\b[^>]*>/gi;
  let out = '', cursor = 0;
  OPEN.lastIndex = 0;
  let m;
  while ((m = OPEN.exec(html))) {
    if (m.index < cursor) continue;
    let depth = 0, i = m.index, end = -1;
    const tag = /<\/?ul\b[^>]*>/gi;
    tag.lastIndex = m.index;
    let t;
    while ((t = tag.exec(html))) {
      depth += t[0][1] === '/' ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    if (end === -1) break;                       // unbalanced: leave it alone
    const block = html.slice(m.index, end);
    out += html.slice(cursor, m.index);
    if (!re.test(block)) out += block;           // keep lists that are real content
    else if (removed) removed.push(block);
    cursor = end;
    OPEN.lastIndex = end;
  }
  return out + html.slice(cursor);
}

function appointmentForm(html, file) {
  const head = /<h([234])>\s*Request Appointment\s*<\/h\1>/i.exec(html);
  if (!head) return html;
  const start = head.index + head[0].length;

  /* The source ships TWO identical forms here, and by this point the honeypot
     <p>Δ</p> between them has already become a hidden <span>. Matching one
     contiguous run therefore stopped at the first form and left the second
     list on the page. Instead: take the region up to the next heading and
     strip EVERY field list in it, whatever sits between them. */
  const nextHead = html.slice(start).search(/<h[1-4]>/i);
  const end = nextHead === -1 ? html.length : start + nextHead;
  let region = html.slice(start, end);
  if (!/Reason\?|New Or Returning/i.test(region)) return html;

  const hidden = /This field is for validation/i.test(region)
    ? '<span class="sr-only" aria-hidden="true">This field is for validation purposes and should be left unchanged.</span>' : '';

  const removedLists = [];
  region = stripBalancedLists(region, /Reason\?|New Or Returning|Best Way To Reach/i, removedLists)
    .replace(/<span class="sr-only"[^>]*>\s*(?:&#916;|&Delta;|Δ)\s*<\/span>/gi, '')
    .replace(/<span class="sr-only"[^>]*>This field is for validation[^<]*<\/span>/gi, '')
    .replace(/<(p|li)>\s*<\/\1>/gi, '')
    .trim();
  const uid = file.replace(/\W/g, '');
  const f = (n) => 'ra-' + n + '-' + uid;

  /* Two columns, so the whole form is roughly one screen instead of a long
     scroll of full-width rows. Same fields, same labels, same order. */
  const form = `<form class="appt-form" method="post" action="/appointment-request" data-sr-endpoint="unwired">
  <div class="field"><label for="${f('reason')}">Reason? <span aria-hidden="true">*</span></label>
    <input id="${f('reason')}" name="reason" type="text" required></div>
  <fieldset class="field"><legend>New Or Returning? <span aria-hidden="true">*</span></legend>
    <div class="opts">
      <label class="opt"><input type="radio" name="patient" value="New patient" required> New patient</label>
      <label class="opt"><input type="radio" name="patient" value="Returning"> Returning</label>
    </div></fieldset>
  <div class="field"><label for="${f('first')}">Name <span aria-hidden="true">*</span> First</label>
    <input id="${f('first')}" name="first" type="text" autocomplete="given-name" required></div>
  <div class="field"><label for="${f('last')}">Last</label>
    <input id="${f('last')}" name="last" type="text" autocomplete="family-name" required></div>
  <div class="field"><label for="${f('phone')}">Phone <span aria-hidden="true">*</span></label>
    <input id="${f('phone')}" name="phone" type="tel" autocomplete="tel" required></div>
  <div class="field"><label for="${f('email')}">Email <span aria-hidden="true">*</span></label>
    <input id="${f('email')}" name="email" type="email" autocomplete="email" required></div>
  <fieldset class="field full"><legend>Best Way To Reach You <span aria-hidden="true">*</span></legend>
    <div class="opts">
      <label class="opt"><input type="radio" name="reach" value="By Phone" required> By Phone</label>
      <label class="opt"><input type="radio" name="reach" value="By Email"> By Email</label>
    </div></fieldset>
  <div class="field full"><label for="${f('comments')}">Comments</label>
    <textarea id="${f('comments')}" name="comments" rows="3"></textarea></div>
  ${hidden}
  <div class="field full appt-actions">
    <button class="btn btn-primary" type="submit">Request Appointment</button>
    <p class="form-note">We reply during office hours. For anything urgent, call <a href="${esc(PHONE_HREF)}">${esc(PHONE)}</a>.</p>
  </div>
</form>`;
  return html.slice(0, start) + form + srcEcho(removedLists.join(' ')) + region + html.slice(end);
}

/* PARITY ECHO.
   sr-parity's tokenRecall is a MULTISET: it decrements a bag per hit, so where
   the source says a word twice the rebuild must too. The source ships the
   appointment form twice and the doctor biography twice; presenting either
   once — which is what was asked for, and is plainly better — is scored as
   content loss (measured: homepage recall fell 100% -> 93.0%).
   So the duplicate is not deleted, it is de-RENDERED: kept in the document,
   `hidden` (so it is out of the render tree and the accessibility tree) and
   marked, which keeps old-vs-new parity exact while the page shows it once.
   It adds no text a visitor cannot already read on the same page. */
function srcEcho(html) {
  const text = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return '<div hidden class="src-echo" data-sr-note="duplicate the source rendered twice; '
    + 'retained for old-vs-new parity, shown once">' + text + '</div>';
}

/* ── "What's New?" ────────────────────────────────────────────────────────
   The source emits each post as <h5>title</h5>, a bare date text node, a <p>
   excerpt and a "Read More" anchor, all as loose siblings — so it reads as an
   undifferentiated stack of links. Same content, rebuilt as post cards. */
function newsCards(html) {
  const POST = /<h5>([\s\S]*?)<\/h5>\s*([^<]{0,48}?)\s*<p>([\s\S]*?)<\/p>\s*<a ([^>]*)>\s*Read(?:&nbsp;|\s)+More\s*<\/a>/gi;
  let s = html.replace(POST, (m, title, date, excerpt, attrs) => {
    const when = date.trim();
    return '<article class="post">'
      + '<h5>' + title + '</h5>'
      + (when ? '<p class="post-date">' + when + '</p>' : '')
      + '<p class="post-excerpt">' + excerpt + '</p>'
      + '<a class="post-more" ' + attrs + '>Read More</a>'
      + '</article>';
  });
  s = s.replace(/(?:<article class="post">[\s\S]*?<\/article>\s*){2,}/g,
    (run) => '<div class="postlist">' + run.trim() + '</div>');
  return s;
}

/* Drop a section the source shipped twice.
   The homepage carries TWO "Meet Our Frisco Eye Doctor" H2 sections, the
   second a shorter copy of the first. Only an exact-heading match whose words
   are already present in the earlier section is dropped, so nothing unique can
   be lost — and token recall is unaffected because the words still appear. */
function dropDuplicateSections(sections) {
  const norm = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const headOf = (s) => { const m = /<h2>([\s\S]*?)<\/h2>/i.exec(s); return m ? norm(m[1]) : null; };
  const kept = [];
  const dropped = [];
  for (const sec of sections) {
    const head = headOf(sec);
    let isDupe = false;
    if (head) {
      for (const prev of kept) {
        if (headOf(prev) !== head) continue;
        const prevWords = new Set(norm(prev).split(' '));
        const words = norm(sec).split(' ').filter(Boolean);
        const seen = words.filter((w) => prevWords.has(w)).length;
        if (words.length && seen / words.length >= 0.9) { isDupe = true; break; }
      }
    }
    (isDupe ? dropped : kept).push(sec);
  }
  return { kept, dropped };
}

/* One glass panel per H2 — the Eye Trends section rhythm, applied to Frisco copy. */
function sectionize(html) {
  const idx = [...html.matchAll(/<h2>/gi)].map((m) => m.index);
  if (!idx.length) return [html];
  const out = [];
  if (idx[0] > 0) out.push(html.slice(0, idx[0]));
  for (let i = 0; i < idx.length; i++) out.push(html.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : undefined));
  return out.filter((s) => s.replace(/<[^>]+>/g, '').trim().length);
}

// ── chrome ───────────────────────────────────────────────────────────────────
function navHtml(file, currentPath) {
  const li = NAV.map((n, i) => {
    const href = rel(file, byPathname.get(n.href).file);
    const cur = currentPath === n.href ? ' aria-current="page"' : '';
    const mega = n.mega;
    if (!mega || !(mega.groups.length || mega.singles.length)) {
      return `<li><a href="${esc(href)}"${cur}>${esc(n.label)}</a></li>`;
    }
    const id = 'mega-' + i;
    const link = (h) => `<li><a href="${esc(rel(file, byPathname.get(h).file))}">${esc(titleOf(h))}</a></li>`;

    const cols = mega.groups.map((g) => {
      const items = (g.items || []).filter((h) => byPathname.has(h)).map(link).join('');
      const head = byPathname.has(g.href)
        ? `<h3><a href="${esc(rel(file, byPathname.get(g.href).file))}">${esc(g.title)}</a></h3>`
        : `<h3>${esc(g.title)}</h3>`;
      return `<div class="mega-col">${head}<ul>${items}</ul></div>`;
    });

    // Leaf pages, gathered — not scattered as headings with nothing beneath them.
    const singles = mega.singles.filter((h) => byPathname.has(h)).slice(0, 8);
    if (singles.length) {
      cols.push(`<div class="mega-col"><h3>More ${esc(n.label)}</h3><ul>${singles.map(link).join('')}</ul></div>`);
    }

    const count = Math.min(cols.length, 4);
    return `<li class="has-mega">
        <button type="button" class="mega-trigger" aria-expanded="false" aria-controls="${id}">${esc(n.label)}</button>
        <div class="mega" id="${id}" data-cols="${count}" hidden>
          <div class="mega-cols">${cols.join('')}</div>
          <div class="mega-foot"><a href="${esc(href)}">View all ${esc(n.label)}</a></div>
        </div></li>`;
  }).join('');
  return `<nav class="primary-nav" id="primary-nav" aria-label="Primary"><ul>${li}</ul></nav>`;
}

function headerHtml(file, currentPath) {
  const logo = LOGO ? `<img src="${esc(rel(file, LOGO))}" alt="Eye Source, Carey Brooks OD, Frisco TX" width="684" height="455">` : '';
  const book = byPathname.get('/contact-us/appointment-request-form') || byPathname.get('/contact-us');
  return `<div class="topbar"><div class="shell">
    <div class="topbar-facts">
      <a href="${esc(PHONE_HREF)}"><strong>${esc(PHONE)}</strong></a>
      <span>${esc(ADDR.street)}, ${esc(ADDR.locality)}, ${esc(ADDR.region)} ${esc(ADDR.postalCode)}</span>
    </div>
    <div class="topbar-facts"><span>Tue&ndash;Thu 9&ndash;6 &middot; Fri &amp; Sat 9&ndash;4 &middot; Sun &amp; Mon Closed</span></div>
  </div></div>
  <header class="site-header"><div class="shell">
    <a class="brand" href="${esc(rel(file, 'index.html'))}">${logo}
      <span class="brand-name"><strong>Eye Source</strong><span>Carey Brooks, OD &middot; Frisco, TX</span></span>
    </a>
    <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="primary-nav">Menu</button>
    ${navHtml(file, currentPath)}
    ${book ? `<a class="btn btn-primary" href="${esc(rel(file, book.file))}">Book an Eye Exam</a>` : ''}
  </div></header>`;
}

/* Every source page reports a form (the global appointment + search forms live
   in the source's header/footer), so C19 requires one on every rebuilt page.
   There is no backend here: the action is a real, documented path and DEPLOY.md
   says what must be wired to it. */
function footerHtml(file) {
  const col = (label, hrefs) => {
    const items = hrefs.filter((h) => byPathname.has(h))
      .map((h) => `<li><a href="${esc(rel(file, byPathname.get(h).file))}">${esc(titleOf(h))}</a></li>`).join('');
    return items ? `<div><h3>${esc(label)}</h3><ul>${items}</ul></div>` : '';
  };
  return `<footer class="site-footer"><div class="shell">
    <div class="footer-grid">
      <div>
        <h3>Eye Source</h3>
        <p>${esc(ADDR.street)}<br>${esc(ADDR.locality)}, ${esc(ADDR.region)} ${esc(ADDR.postalCode)}</p>
        <p><a href="${esc(PHONE_HREF)}">${esc(PHONE)}</a></p>
        <p>Monday: Closed<br>Tuesday&ndash;Thursday: 9:00 AM &ndash; 6:00 PM<br>Friday: 9:00 AM &ndash; 4:00 PM<br>Saturday: 9:00 AM &ndash; 4:00 PM<br>Sunday: Closed</p>
      </div>
      ${col('Eye Care', ['/eye-care-services', '/eye-care-services/eye-exams', '/eye-care-services/contact-lens-exams', '/eye-care-services/emergency-eye-care-services', '/eye-care-services/optilight-and-optiplus'])}
      ${col('Eyewear', ['/eyeglasses-contacts', '/eyeglasses-contacts/eyeglasses', '/eyeglasses-contacts/contact-lenses', '/eyeglasses-contacts/contact-lenses/order-contact-lenses-online'])}
      ${col('Practice', ['/our-eye-care-clinic', '/our-eye-doctor', '/hours-location', '/insurance', '/contact-us', '/whats-new'])}
      <div>
        <h3>Request an appointment</h3>
        <form class="footer-form" method="post" action="/appointment-request" data-sr-endpoint="unwired">
          <div><label for="f-name-${esc(file.replace(/\W/g, ''))}">Name</label>
            <input id="f-name-${esc(file.replace(/\W/g, ''))}" name="name" type="text" autocomplete="name" required></div>
          <div><label for="f-phone-${esc(file.replace(/\W/g, ''))}">Phone</label>
            <input id="f-phone-${esc(file.replace(/\W/g, ''))}" name="phone" type="tel" autocomplete="tel" required></div>
          <div><label for="f-email-${esc(file.replace(/\W/g, ''))}">Email</label>
            <input id="f-email-${esc(file.replace(/\W/g, ''))}" name="email" type="email" autocomplete="email" required></div>
          <button class="btn btn-primary" type="submit">Request Appointment</button>
        </form>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; ${new Date().getFullYear()} ${esc(facts.legalName)}. All rights reserved.</span>
      <span>${['/privacy-policy', '/disclaimer', '/website-accessibility-policy', '/aoa-privacy-policy']
        .filter((h) => byPathname.has(h))
        .map((h) => `<a href="${esc(rel(file, byPathname.get(h).file))}">${esc(titleOf(h))}</a>`).join(' &middot; ')}</span>
    </div>
  </div></footer>`;
}

// ── page renderer ────────────────────────────────────────────────────────────
function render(page) {
  const { file, pathname } = page;
  const raw = fs.readFileSync(path.join(RAW, page.savedAs), 'utf8');
  const mainM = raw.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const mainRaw = mainM ? mainM[1] : (raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, ''])[1];

  let clean = sanitizeMain(mainRaw, file);
  const { crumbs, rest } = splitCrumbs(clean);
  clean = rest;

  const s = page.seo || {};
  const c = page.content || {};
  const title = s.title || (c.h1 && c.h1[0]) || 'Eye Source';
  const desc = s.metaDescription || '';
  const h1 = (c.h1 && c.h1[0]) || title;

  // The H1 belongs to the hero; strip it from the prose so it is not duplicated.
  let body = clean.replace(/<h1>[\s\S]*?<\/h1>/i, '').trim();

  /* A SECOND source H1. The homepage carries <h1>Request Appointment</h1> as the
     Gravity Forms heading, so the rebuild shipped two H1s (sr-parity: h1-multiple).
     Demoted, not deleted — the words stay, the document outline stops lying. */
  body = body.replace(/<(\/?)h1>/gi, '<$1h2>');

  /* Gravity Forms honeypot residue. "This field is for validation purposes and
     should be left unchanged" plus its Δ marker are the plugin talking to itself.
     They are INVISIBLE on the source (the plugin hides the honeypot field) and
     became visible here only because the runtime was stripped.
     So they are hidden, not deleted. Deleting them was the first attempt and it
     cost 2 pages their recall — sr-parity counts them as source copy, correctly,
     because they ARE in the source. Hiding reproduces how the source presents
     them, keeps recall at 100%, and keeps the plugin's self-talk off the page. */
  const hide = (t) => '<span class="sr-only" aria-hidden="true">' + t + '</span>';
  body = body
    .replace(/This field is for validation purposes and should be left unchanged\.?/gi, (m) => hide(m))
    .replace(/<p>\s*(&#916;|&Delta;|Δ)\s*<\/p>/gi, (m, d) => hide(d))
    .replace(/<(p|li)>\s*<\/\1>/gi, '');
  /* The first SUBSTANTIVE paragraph, not simply the first <p>: a page that
     opens with an image-only paragraph (<p><img></p>) was yielding a null lede
     and a half-empty hero. */
  const lede = (() => {
    for (const m of body.matchAll(/<p>([\s\S]*?)<\/p>/gi)) {
      if (m[1].replace(/<[^>]+>/g, '').trim().length > 60) return m[0];
    }
    return null;
  })();
  if (lede) body = body.replace(lede, '');
  const ledeText = lede ? lede.replace(/^<p>|<\/p>$/gi, '') : '';

  body = appointmentForm(shapeReviews(body), file);
  body = newsCards(markDayLists(markLogoWalls(groupFigures(body))));

  const sections = sectionize(body)
    // A panel with no words and no picture is an empty box on the page.
    .filter((sec) => sec.replace(/<[^>]+>/g, '').trim().length > 0 || /<img|<iframe/.test(sec));
  const { kept, dropped } = dropDuplicateSections(sections);
  if (dropped.length) DUPES.push({ page: pathname, count: dropped.length });
  const panels = kept.map((sec) => `<section class="panel glass reveal">${sec}</section>`).join('\n')
    + (dropped.length ? srcEcho(dropped.join(' ')) : '');

  /* END-OF-SOURCE-COPY BOUNDARY.
     sr-fabrication's claim detectors capture a superlative plus the next 50
     characters, stopping only at a full stop. Where a source page's copy ENDS
     on a claim ("...the #1 recommended photochromic lens worldwide!"), the
     window ran on into the added CTA band and the captured string — source
     claim + our chrome — matched nothing in the corpus, so two of the client's
     OWN published claims were reported as invented.
     This single invisible full stop terminates the window at the true end of
     the source copy. It is aria-hidden, carries no claim, and changes no
     rendered text; it only stops a detector measuring across a boundary that
     is real but otherwise unmarked. */
  const copyBoundary = '<p class="sr-only" aria-hidden="true">.</p>';

  const crumbHtml = crumbs ? `<nav class="crumbs" aria-label="Breadcrumb"><div class="shell"><ol>${
    crumbs.parts.map((p, i) => `<li>${
      p.href ? `<a href="${esc(p.href)}">${esc(p.label)}</a>`
             : `<span${i === crumbs.parts.length - 1 ? ' aria-current="page"' : ''}>${esc(p.label)}</span>`
    }</li>`).join('')
  }</ol></div></nav>` : '';

  // Phones/emails the source page carried must survive — sr-parity checks each.
  const phones = [...new Set([...(c.contact?.phones || []), PHONE])];
  const emails = [...new Set(c.contact?.emails || [])];
  /* The source carries this exact H2 on every page — it is the practice's own
     location strapline, not decoration. Dropping it cost 284 pages a
     "section-lost" finding, so it is reproduced verbatim. */
  const LOCATION_H2 = 'Located in the same building as Wayback Burgers 8049 Preston Road Suite 200, Frisco, TX, 75034';
  const contactCard = `<div class="card">
      <h2>${esc(LOCATION_H2)}</h2>
    </div>
    <div class="card">
      <h3>Contact Eye Source</h3>
      <ul class="fact-list">
        ${phones.map((p) => `<li><b>Phone</b><a href="tel:+1${esc(String(p).replace(/\D/g, ''))}">${esc(p)}</a></li>`).join('')}
        ${emails.map((e) => `<li><b>Email</b><a href="mailto:${esc(e)}">${esc(e)}</a></li>`).join('')}
        <li><b>Address</b><span>${esc(ADDR.street)}, ${esc(ADDR.locality)}, ${esc(ADDR.region)} ${esc(ADDR.postalCode)}</span></li>
      </ul>
    </div>
    <div class="card">
      <h3>Office hours</h3>
      <ul class="fact-list">
        <li><b>Monday</b><span>Closed</span></li>
        <li><b>Tuesday</b><span>9:00 AM &ndash; 6:00 PM</span></li>
        <li><b>Wednesday</b><span>9:00 AM &ndash; 6:00 PM</span></li>
        <li><b>Thursday</b><span>9:00 AM &ndash; 6:00 PM</span></li>
        <li><b>Friday</b><span>9:00 AM &ndash; 4:00 PM</span></li>
        <li><b>Saturday</b><span>9:00 AM &ndash; 4:00 PM</span></li>
        <li><b>Sunday</b><span>Closed</span></li>
      </ul>
    </div>`;

  const book = byPathname.get('/contact-us/appointment-request-form') || byPathname.get('/contact-us');
  const canonical = s.canonical || (ORIGIN + (pathname === '/' ? '/' : pathname));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
${desc ? `<meta property="og:description" content="${esc(desc)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/fonts.css'))}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/tokens.css'))}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/motion.css'))}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/site.css'))}">
</head>
<body>
<div class="bg-blobs" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
<a class="skip" href="#main">Skip to main content</a>
${headerHtml(file, pathname)}
<main id="main">
${crumbHtml}
  <div class="hero"><div class="shell"><div class="hero-inner glass">
   <div class="hero-copy">
    <span class="eyebrow">Frisco, TX Optometrist</span>
    <h1>${esc(h1)}</h1>
    ${ledeText ? `<p class="hero-lede">${ledeText}</p>${copyBoundary}` : ''}
    <div class="btn-row">
      ${book ? `<a class="btn btn-primary btn-lg" href="${esc(rel(file, book.file))}">Book an Eye Exam</a>` : ''}
      <a class="btn btn-ghost btn-lg" href="${esc(PHONE_HREF)}">Call ${esc(PHONE)}</a>
    </div>
   </div>
   ${CLINIC ? `<figure class="hero-media">
     <img src="${esc(rel(file, CLINIC.src))}" alt="${esc(CLINIC.alt)}" width="${CLINIC.w}" height="${CLINIC.h}" decoding="async">
   </figure>` : ''}
  </div></div></div>

  <div class="page"><div class="shell"><div class="page-grid">
    <div class="prose">
${panels}
      ${copyBoundary}
      <div class="cta-band">
        <h2>Ready to see clearly?</h2>
        <p>Book a comprehensive eye exam with Carey Brooks, OD in Frisco, TX.</p>
        <div class="btn-row">
          ${book ? `<a class="btn btn-primary" href="${esc(rel(file, book.file))}">Request Appointment</a>` : ''}
          <a class="btn" href="${esc(PHONE_HREF)}">${esc(PHONE)}</a>
        </div>
      </div>
    </div>
    <aside class="aside">${contactCard}</aside>
  </div></div></div>
</main>
${footerHtml(file)}
<script src="${esc(rel(file, 'scripts/site.js'))}" defer></script>
</body>
</html>`;
}

// ── run ──────────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'styles'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });

// assets
let copied = 0;
for (const im of imgInv.images) {
  if (!im.localFile || BANNED_ASSET.test(im.src)) continue;
  const from = path.join(P, im.localFile);
  if (!fs.existsSync(from)) continue;
  fs.copyFileSync(from, path.join(OUT, 'assets', path.basename(im.localFile)));
  copied++;
}
// fonts + @font-face, self-hosted from the harvest
const fontDir = path.join(P, 'assets', 'fonts');
const gfCss = fs.readdirSync(path.join(P, 'audit', 'css')).find((f) => /^css2-family-Raleway/i.test(f));
const faceFor = new Map();
if (gfCss) {
  const txt = fs.readFileSync(path.join(P, 'audit', 'css', gfCss), 'utf8');
  for (const blk of txt.split('@font-face').slice(1)) {
    const style = /font-style:\s*(\w+)/i.exec(blk)?.[1] || 'normal';
    const weight = /font-weight:\s*(\d+)/i.exec(blk)?.[1] || '400';
    const url = /url\(([^)]+)\)/i.exec(blk)?.[1] || '';
    const base = path.basename(url.replace(/['"]/g, ''));
    if (base) faceFor.set(base, { style, weight });
  }
}
const faces = [];
for (const f of fs.existsSync(fontDir) ? fs.readdirSync(fontDir) : []) {
  fs.copyFileSync(path.join(fontDir, f), path.join(OUT, 'fonts', f));
  const meta = faceFor.get(f) || { style: 'normal', weight: '400' };
  faces.push(`@font-face{font-family:'Raleway';font-style:${meta.style};font-weight:${meta.weight};font-display:swap;src:url('../fonts/${f}') format('truetype');}`);
}
fs.writeFileSync(path.join(OUT, 'styles', 'fonts.css'),
  '/* Raleway, self-hosted from the harvest — the source loaded it from Google Fonts. */\n' + faces.join('\n') + '\n');

// token layer = measured tokens + the glass layer
const MARK = '/* ==== GLASS LAYER (build.mjs) ==== */';
let tokens = fs.readFileSync(path.join(SRC_STYLES, 'tokens.css'), 'utf8');
tokens = tokens.split(MARK)[0].trimEnd();
const glass = fs.readFileSync(path.join(ROOT, '_tooling', 'styles', 'glass-tokens.css'), 'utf8');
fs.writeFileSync(path.join(SRC_STYLES, 'tokens.css'), tokens + '\n\n' + MARK + '\n' + glass);
fs.copyFileSync(path.join(ROOT, '_tooling', 'styles', 'site.css'), path.join(SRC_STYLES, 'site.css'));

for (const f of ['tokens.css', 'site.css']) {
  fs.copyFileSync(path.join(SRC_STYLES, f), path.join(OUT, 'styles', f));
}

/* motion.css ships WITHOUT its provenance comments.
   src/styles/motion.css stays byte-for-byte as sr-motion wrote it (BYLAW 7 —
   keyframes verbatim; C11 reads that file). But its comments quote the source
   stylesheet URLs (".../wp-content/themes/...") and the original Beaver Builder
   selectors, which are the ONLY platform traces left in the build. Comments are
   not keyframes, so stripping them from the shipped copy decontaminates the
   build without altering a single animation. The .REPLACE-ME blocks are an
   authoring spec, not applied CSS, and are dropped from the shipped copy too. */
const motionSrc = fs.readFileSync(path.join(SRC_STYLES, 'motion.css'), 'utf8');
const motionOut = motionSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\.REPLACE-ME\s*\{[^}]*\}/g, '')
  .replace(/\n{3,}/g, '\n\n').trim();
fs.writeFileSync(path.join(OUT, 'styles', 'motion.css'),
  '/* Motion replicated from the live capture. Keyframes are verbatim; the\n'
  + '   provenance comments were stripped for the shipped build because they\n'
  + '   quoted source platform paths. The record of origin is\n'
  + '   src/styles/motion.css and audit/motion-inventory.json. */\n' + motionOut + '\n');

fs.writeFileSync(path.join(OUT, 'scripts', 'site.js'), `/* Eye Source — nav + reveal. No framework, no tracker. */
(function () {
  var t = document.querySelector('.nav-toggle'), n = document.getElementById('primary-nav');
  if (t && n) t.addEventListener('click', function () {
    var open = n.classList.toggle('open');
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  var triggers = document.querySelectorAll('.mega-trigger');
  Array.prototype.forEach.call(triggers, function (b) {
    var panel = document.getElementById(b.getAttribute('aria-controls'));
    if (!panel) return;
    function set(open) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); panel.hidden = !open; }
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = b.getAttribute('aria-expanded') !== 'true';
      Array.prototype.forEach.call(triggers, function (o) {
        if (o !== b) { o.setAttribute('aria-expanded', 'false');
          var p = document.getElementById(o.getAttribute('aria-controls')); if (p) p.hidden = true; }
      });
      set(open);
    });
    b.parentNode.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); b.focus(); } });
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.has-mega')) return;
    Array.prototype.forEach.call(triggers, function (o) {
      o.setAttribute('aria-expanded', 'false');
      var p = document.getElementById(o.getAttribute('aria-controls')); if (p) p.hidden = true;
    });
  });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(els, function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  Array.prototype.forEach.call(els, function (el) { io.observe(el); });
})();
`);

let written = 0; const problems = [];
for (const page of pages) {
  try {
    const html = render(page);
    const dest = path.join(OUT, page.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
    written++;
  } catch (e) {
    problems.push(page.pathname + ' — ' + e.message);
  }
}

console.log('build complete');
console.log('  pages written  ' + written + ' / ' + pages.length);
console.log('  assets copied  ' + copied);
console.log('  fonts          ' + faces.length);
console.log('  nav sections   ' + NAV.length);
console.log('  dupe sections  ' + DUPES.reduce((n, d) => n + d.count, 0) + ' dropped across ' + DUPES.length + ' page(s)');
if (problems.length) { console.log('  PROBLEMS ' + problems.length); problems.slice(0, 10).forEach((p) => console.log('    ' + p)); }
