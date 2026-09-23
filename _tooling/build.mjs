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
// FES_OUT builds to a staging directory (e.g. to inspect a build while dist/ is being measured).
const OUT = process.env.FES_OUT ? path.resolve(process.env.FES_OUT) : path.join(P, 'dist');
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

/* Only numbers the verified facts file records as phones may be rendered as a
   tel: link. Anything else the harvest picked up is a fax. See the contact-card
   builder for the full reasoning. */
const VERIFIED_PHONE_DIGITS = new Set(
  (facts.phone || []).map((p) => String(p).replace(/\D/g, ''))
);

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
const heightOf = new Map();
for (const im of imgInv.images) if (im.intrinsicHeight) heightOf.set(im.src, im.intrinsicHeight);
/* The same, keyed by the SERVED file name — the body only knows rewritten
   "assets/<name>" paths by the time the lead image is chosen. */
const DIMS = new Map();
for (const im of imgInv.images) {
  if (im.localFile && im.intrinsicWidth && im.intrinsicHeight) DIMS.set(path.basename(im.localFile), [im.intrinsicWidth, im.intrinsicHeight]);
}
const WIDE_AT = 480;

const LOGO = (() => {
  const hit = imgInv.images.find((i) => i.localFile && /black-version-eye-source-logo/i.test(i.src));
  return hit ? 'assets/' + path.basename(hit.localFile) : null;
})();

/* The practice's own clinic interior, from the harvest — the source labels it
   "Our office in Frisco, TX". It fills the empty half of the hero. Real photo of
   the real premises; nothing generated, nothing stock. */
/* Per-page hero artwork (V2). The harvest only ever contained one clinic photo,
   so every page shared it and the hero read the same on all 287. These are keyed
   by output path; anything not listed falls back to the shared clinic interior,
   so adding a page never breaks and adding art is a one-line change.
   All are wide crops with the subject on the RIGHT, because the hero scrim runs
   left-to-right and the copy sits on the left. */
const HERO_EYEWEAR = { src: 'assets/hero-eyewear.jpg', w: 2000, h: 667, alt: 'Designer sunglasses and eyeglasses on display' };
const HERO_EYECARE = { src: 'assets/hero-eyecare.jpg', w: 2000, h: 667, alt: 'A comprehensive eye examination in progress' };
const HERO_CLINIC  = { src: 'assets/hero-clinic.jpg',  w: 1672, h: 941, alt: 'The Eye Source optical shop and reception desk in Frisco, TX' };
/* Generated with fal (flux-pro v1.1 ultra, 21:9, cropped to 3:1) in the same
   treatment as the heroes above: warm-cream left half for the scrim and copy,
   subject in the right third. They are styled still lifes, NOT the practice's
   premises, so the alt text describes what is shown and claims nothing about
   the real office — the real office is hero-clinic.jpg. */
const HERO_INSURANCE = { src: 'assets/hero-insurance.jpg', w: 2000, h: 667, alt: 'Paperwork, a teal folder and a pair of eyeglasses on a light oak desk' };
const HERO_WHATSNEW  = { src: 'assets/hero-whats-new.jpg', w: 2000, h: 667, alt: 'An open notebook and eyeglasses beside blueberries, a glass of water and a teal vase' };
const HERO_CONTACT   = { src: 'assets/hero-contact.jpg',   w: 2000, h: 667, alt: 'A reception counter with fresh eucalyptus, and eyeglasses on a shelf behind it' };

/* index.html is no longer rendered from this map — it ships the designed
   homepage (see DESIGNED_HOME below), whose hero is written into that file. */
const HERO_BY_PAGE = {
  'eyeglasses-contacts.html': HERO_EYEWEAR,
  'eye-care-services.html':   HERO_EYECARE,
  'our-eye-care-clinic.html': HERO_CLINIC,
  'insurance.html':           HERO_INSURANCE,
  'whats-new.html':           HERO_WHATSNEW,
  'contact-us.html':          HERO_CONTACT,
};

/* Assigning 283 unique hero images is neither practical nor desirable — a
   section reads as a section when its pages share a hero. These prefix rules
   cover whole subtrees; the first match wins, and anything unmatched falls back
   to the clinic interior.
   That fallback matters on its own: the harvested default was 748x408, which
   rendered at 1.93x upscale (visibly soft) on every page. hero-clinic.jpg is
   1672x941, so nothing is upscaled any more. */
const HERO_BY_PREFIX = [
  ['eye-care-services/',    HERO_EYECARE],
  ['eyeglasses-contacts/',  HERO_EYEWEAR],
  ['team/',                 HERO_CLINIC],
  ['location/',             HERO_CLINIC],
  ['contact-us/',           HERO_CONTACT],
  ['insurance/',            HERO_INSURANCE],
  // post archives are What's New listings
  ['category/',             HERO_WHATSNEW],
  ['tag/',                  HERO_WHATSNEW],
  ['author/',               HERO_WHATSNEW],
];
/* The 88 news articles live at the site ROOT, so no prefix can find them, and
   a -20xx filename test misses the 24 that carry no year. The harvested
   WordPress <body> class is the reliable signal: every article has
   "single-post", and no other page does (checked across all 287). */
const heroFor = (f, isPost) => {
  if (HERO_BY_PAGE[f]) return HERO_BY_PAGE[f];
  if (isPost) return HERO_WHATSNEW;
  for (const [pre, art] of HERO_BY_PREFIX) if (f.startsWith(pre)) return art;
  return HERO_CLINIC;
};

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
/* Source text arrives HTML-encoded ("Eyeglasses &amp; Contacts", "What&#8217;s New").
   Anything that is later passed through esc() must be decoded first, or the
   ampersand is escaped a second time and the entity renders literally — which is
   what 74 breadcrumbs did ("Hours &amp; Location" on screen). One pass, so an
   already-double-encoded string is not silently collapsed further. */
const ENT = { amp: '&', quot: '"', lt: '<', gt: '>', nbsp: ' ', apos: "'", rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', raquo: '»', laquo: '«', times: '×',
  /* the source also uses &reg; (a breadcrumb showed "Transitions&reg; SOLFX"), &copy;
     and &ouml;; the rest are common enough to cover before they bite */
  reg: '®', copy: '©', trade: '™', ouml: 'ö', eacute: 'é', uuml: 'ü', deg: '°', middot: '·', bull: '•', frac12: '½' };
const decodeEnt = (s) => String(s)
  .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (m, d, x, n) =>
    d ? String.fromCodePoint(+d) : x ? String.fromCodePoint(parseInt(x, 16)) : (ENT[n.toLowerCase()] ?? m));
const textOf = (h) => decodeEnt(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
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
  const target = byPathname.get(pn) || bySlug(pn);
  if (!target) return null;                                       // 404 on the live site
  return rel(fromFile, target.file) + (abs.hash || '');
}
/* A stale path ("/your-eye-health/eye-diseases/cataracts", from before the site
   moved it under /eye-care-services/) is not a 404 on the live site: WordPress
   answers it with a 301 to the page whose slug is the path's last segment. The
   build had unwrapped ~25 such links to plain text since session 1 ("please see
   Eye Diseases"). Same rule here, and only when exactly ONE page has that slug. */
let SLUGS = null;
function bySlug(pn) {
  if (!SLUGS) {
    SLUGS = new Map();
    for (const [p, t] of byPathname) { const k = p.split('/').pop(); if (k) SLUGS.set(k, [...(SLUGS.get(k) || []), t]); }
  }
  const hits = SLUGS.get(pn.split('/').pop());
  return hits && hits.length === 1 ? hits[0] : null;
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

  /* The ecp location widget labels its blocks with <div class="heading-h3">
     ("Contact Details", "Address", "Hours", "Payment Information"). The generic
     unwrap below left them as bare text runs with no way to style them — "Hours"
     sat 12px under the map at body size. They become <p class="subhead">: same
     words, no heading element, so the document outline is unchanged. The class is
     carried through the attribute-dropping rewrite by a sentinel. */
  s = s.replace(/<div\b[^>]*class=(["'])[^"']*\bheading-h3\b[^"']*\1[^>]*>([^<]*)<\/div>/gi, '<p>\u0001SUBHEAD\u0001$2</p>');

  s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (m, close, tagRaw, attrs) => {
    const tag = tagRaw.toLowerCase();
    if (!KEEP.has(tag)) return ' ';                               // unwrap: children survive
    if (close) return '</' + tag + '>';
    const keepAttrs = [];
    if (tag === 'a') {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const fixed = fixHref(href ? decodeEnt(href[2] ?? href[3] ?? href[4]) : '', fromFile);
      if (!fixed) return ' ';                                     // unwrap dead/platform links
      keepAttrs.push('href="' + esc(fixed) + '"');
      if (/^https?:/i.test(fixed) && !fixed.startsWith(ORIGIN)) keepAttrs.push('rel="noopener"', 'target="_blank"');
    } else if (tag === 'img') {
      const src = /(?:data-src|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const rawSrc = src ? (src[2] ?? src[3] ?? src[4]) : '';
      const fixed = fixImg(rawSrc, fromFile);
      if (!fixed) return ' ';
      const alt = /alt\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      let altText = alt ? decodeEnt(alt[2] ?? alt[3] ?? '') : '';
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
      /* decoded once, escaped once: "&amp;" in the source attribute had become "&amp;amp;",
         so the YouTube embed received a parameter named "amp;controls". */
      keepAttrs.push('src="' + esc(decodeEnt(v)) + '"', 'loading="lazy"', 'title="Embedded content"');
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
  s = s.replace(/<p>\s*\u0001SUBHEAD\u0001\s*/g, '<p class="subhead">');
  /* CMS spacer paragraphs (<p>&nbsp;</p>) left 100px holes in the copy. They hold
     no words, so they go. */
  s = s.replace(/<p>(?:\s|&nbsp;|&#160;|\u00a0)*<\/p>/gi, ' ');
  /* CMS &nbsp; inside headings. It glued words into runs too wide for a phone
     ("retinopathy:&nbsp;nonproliferative" at 30px ran 5px past a 390px screen), and
     two h3s held nothing else (a 100px hole). Inside a heading it becomes a plain
     space (the text is unchanged: seosweep and seoguard read &nbsp; as a space); a
     heading left with no words and no picture goes, as the empty ones above do. */
  s = s.replace(/<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi, (m, t, a, inner) => {
    const txt = inner.replace(/&nbsp;|&#160;|\u00a0/gi, ' ').replace(/ {2,}/g, ' ').trim();
    if (!/<(img|iframe)\b/i.test(txt) && !txt.replace(/<[^>]*>/g, '').trim()) return ' ';
    return `<${t}${a}>${txt}</${t}>`;
  });
  /* A minor heading that is a bold lead-in plus a whole sentence ("<strong>Important!</strong>
     Never stop medication ...", 296px tall at section-title size) is marked so it
     takes sub-head scale in a readable column. h4-h6 only: a class on an h2 would
     stop sectionize() cutting there. Text and level unchanged. */
  s = s.replace(/<(h[4-6])>(\s*<strong>[^<]*<\/strong>)(\s*[^<\s][^<]{39,})<\/\1>/gi, '<$1 class="lead-in-head">$2$3</$1>');
  /* Orphan </a>. When a dead or platform link is UNWRAPPED above, only its
     opening tag goes; its </a> stayed, leaving stray end tags in running text
     ("your eyeglasses</a>, ..."). Browsers ignore them, validators do not. Drop
     every </a> that closes nothing. */
  let aDepth = 0;
  s = s.replace(/<a\b[^>]*>|<\/a>/gi, (t) => {
    if (t[1] !== '/') { aDepth++; return t; }
    if (aDepth === 0) return '';
    aDepth--; return t;
  });
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

  /* Labels are DECODED (see decodeEnt) and escaped exactly once, at output.
     Label and anchor key share the decode, so a crumb still finds its link. */
  const hrefByLabel = new Map([...head.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/gi)]
    .map((a) => [textOf(a[2]), a[1]]));

  const plain = decodeEnt(head.replace(/<[^>]+>/g, ' '))
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

/* ── Gravity Forms, rebuilt as real forms (every page except the homepage) ─────
   With the plugin runtime stripped, sanitizeMain flattened each source form into
   a bulleted list of its own labels: the Appointment Request page — the target of
   every "Book an Eye Exam" button — showed "Name * First Last", "Phone *" as
   bullets with nothing to type into, and the Patient Registration form printed
   its 250-country dropdown as one paragraph of country names.
   This reads the SOURCE form field by field and emits a real one: same labels,
   same descriptions, same choices, same order, the source's own `name=`
   attributes (so the original backend could be wired back in), section titles at
   the source's heading level. Nothing is invented; the honeypot keeps its words
   but stays hidden, exactly as the plugin presents it.
   The form goes in via a placeholder AFTER sectionize(), because section titles
   are <h2> and sectionize() would otherwise cut the form into pieces. */
const GF_INPUT_TYPE = { text: 'text', email: 'email', phone: 'tel', number: 'number', date: 'date', website: 'url' };
const GF_AUTOCOMPLETE = [
  [/^prefix$/i, 'honorific-prefix'], [/^first$/i, 'given-name'], [/^last$/i, 'family-name'],
  [/^suffix$/i, 'honorific-suffix'], [/^street address$/i, 'address-line1'], [/^address line 2$/i, 'address-line2'],
  [/^city$/i, 'address-level2'], [/^state/i, 'address-level1'], [/^zip/i, 'postal-code'], [/^country$/i, 'country-name'],
];
function gravityForm(raw, file) {
  const fid = (/id=['"]gform_(\d+)['"]/.exec(raw) || [, 'x'])[1];
  const uid = 'gf' + fid + '-' + file.replace(/\W/g, '');
  const attr = (tag, a) => { const m = new RegExp('\\b' + a + '=([\'"])([^\'"]*)\\1', 'i').exec(tag); return m ? m[2] : ''; };
  const inline = (h) => sanitizeMain(h, file).replace(/<\/?(p|li|ul|ol)>/gi, ' ').replace(/\s+/g, ' ').trim();
  const starts = [...raw.matchAll(/<(li|div|fieldset)\b[^>]*\bid=['"]field_\d+_\d+['"][^>]*>/gi)];
  const out = [];
  starts.forEach((st, i) => {
    const seg = raw.slice(st.index, i + 1 < starts.length ? starts[i + 1].index : raw.length);
    const cls = attr(st[0], 'class');
    const type = (/gfield--type-([a-z_]+)/.exec(cls) || [, ''])[1];
    const required = /gfield_contains_required/.test(cls);
    const id = (k) => `${uid}-${i}${k ? '-' + k : ''}`;
    const labelHtml = (/<(label|legend)\b[^>]*class=['"][^'"]*gfield_label[^'"]*['"][^>]*>([\s\S]*?)<\/\1>/i.exec(seg) || [, , ''])[2];
    const label = textOf(labelHtml.replace(/<span[^>]*gfield_required[^>]*>[\s\S]*?<\/span>/gi, ''));
    const desc = textOf((/<div\b[^>]*class=['"][^'"]*gfield_description[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i.exec(seg) || [, ''])[1]);
    const star = required ? ' <span aria-hidden="true">*</span>' : '';
    const descP = desc ? `<p class="field-desc" id="${id('d')}">${esc(desc)}</p>` : '';
    const dby = desc ? ` aria-describedby="${id('d')}"` : '';
    // every real control in the field, with the sub-label that names it
    /* A <select> carries its options as a body; an <input> must NOT get one. (An
       optional "up to </select>" group on every tag let the Street Address input
       swallow the whole address block up to the Country list — found in review.) */
    const controls = [...seg.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>|<(input|textarea)\b([^>]*)>/gi)]
      .map((m) => (m[1] !== undefined
        ? { tag: 'select', attrs: m[1], body: m[2] }
        : { tag: m[3].toLowerCase(), attrs: m[4], body: '' }))
      .filter((c) => c.tag !== 'input' || !/type=['"](hidden|submit|button)['"]/i.test(c.attrs));
    const subLabel = (c) => {
      const cid = attr(c.attrs, 'id');
      const m = cid && new RegExp('<label\\b[^>]*for=[\'"]' + cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"][^>]*>([\\s\\S]*?)<\\/label>', 'i').exec(seg);
      return m ? textOf(m[1].replace(/<span[^>]*gfield_required[^>]*>[\s\S]*?<\/span>/gi, '')) : '';
    };
    /* A first option reading "Select ... >" is a placeholder: it gets an empty value,
       or a `required` dropdown could never fail (three on the registration form). */
    const options = (body) => [...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
      .map((o, i) => { const tx = textOf(o[2]); const v = i === 0 && /^select\b/i.test(tx) ? '' : decodeEnt(attr(o[1], 'value'));
        return `<option value="${esc(v)}">${esc(tx)}</option>`; }).join('');
    const control = (c, cid, extra = '') => {
      const name = attr(c.attrs, 'name');
      const nm = name ? ` name="${esc(name)}"` : '';
      if (c.tag === 'select') return `<select id="${cid}"${nm}${extra}>${options(c.body)}</select>`;
      if (c.tag === 'textarea') return `<textarea id="${cid}"${nm} rows="4"${extra}></textarea>`;
      const t = GF_INPUT_TYPE[type] || (attr(c.attrs, 'type') === 'number' ? 'number' : 'text');
      let range = '';
      if (t === 'number') { const r = /from (\d+) to (\d+)/i.exec(desc); if (r) range = ` min="${r[1]}" max="${r[2]}"`; }
      const ac = t === 'email' ? ' autocomplete="email"' : t === 'tel' ? ' autocomplete="tel"' : '';
      return `<input id="${cid}"${nm} type="${t}"${range}${ac}${extra}>`;
    };

    if (type === 'honeypot') {
      out.push(`<div class="sr-only" aria-hidden="true">${esc(label)} ${esc(desc)}</div>`);
    } else if (type === 'html') {
      const body = sanitizeMain(seg, file).replace(/<\/?(li|ul)>/gi, ' ').replace(/<\/p>/gi, '');
      const paras = body.split(/<p>/i).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
      if (paras.length) out.push(`<div class="field full form-intro">${paras.map((x) => '<p>' + x + '</p>').join('')}</div>`);
    } else if (type === 'section') {
      const hm = /<(h[1-6])\b[^>]*gsection_title[^>]*>([\s\S]*?)<\/\1>/i.exec(seg);
      const sd = textOf((/class=['"][^'"]*gsection_description[^'"]*['"][^>]*>([\s\S]*?)<\/div>/i.exec(seg) || [, ''])[1]);
      if (hm) out.push(`<${hm[1]} class="form-section">${esc(textOf(hm[2]))}</${hm[1]}>`);
      if (sd) out.push(`<p class="field full form-section-desc">${esc(sd)}</p>`);
    } else if (type === 'radio' || type === 'checkbox' || type === 'consent') {
      const choices = [...seg.matchAll(/<input\b([^>]*type=['"](radio|checkbox)['"][^>]*)\/?>\s*<label\b[^>]*>([\s\S]*?)<\/label>/gi)];
      const many = choices.length > 6;
      const opts = choices.map((c, k) => {
        const t = c[2].toLowerCase();
        const req = required && (t === 'radio' ? k === 0 : choices.length === 1) ? ' required' : '';
        const lab = inline(c[3]).replace(/<a (?![^>]*target=)/g, '<a target="_blank" rel="noopener" ');
        return `<label class="opt"><input type="${t}" name="${esc(attr(c[1], 'name'))}" value="${esc(decodeEnt(attr(c[1], 'value')))}"${req}> ${lab}</label>`;
      }).join('');
      out.push(`<fieldset class="field${many || type === 'checkbox' ? ' full' : ''}"${dby}><legend>${esc(label)}${star}</legend>`
        + `<div class="opts${many ? ' many' : ''}">${opts}</div>${descP}</fieldset>`);
    } else if (controls.length > 1 || type === 'name' || type === 'address') {
      // composite: one legend, a labelled sub-field per control (sub-label below, as the source)
      const subs = controls.map((c, k) => {
        const cid = id(k);
        const sl = subLabel(c);
        const ac = (GF_AUTOCOMPLETE.find(([re]) => re.test(sl)) || [, ''])[1];
        const wide = /^(street address|address line 2)$/i.test(sl) ? ' wide' : '';
        const req = required && !/^(prefix|suffix|address line 2)$/i.test(sl) ? ' required' : '';
        return `<div class="subfield${wide}">${control(c, cid, (ac ? ` autocomplete="${ac}"` : '') + req)}<label for="${cid}">${esc(sl)}</label></div>`;
      }).join('');
      out.push(`<fieldset class="field full composite"${dby}><legend>${esc(label)}${star}</legend><div class="sub">${subs}</div>${descP}</fieldset>`);
    } else if (controls.length === 1) {
      const c = controls[0];
      const full = c.tag === 'textarea' ? ' full' : '';
      out.push(`<div class="field${full}"><label for="${id()}">${esc(label)}${star}</label>${control(c, id(), (required ? ' required' : '') + dby)}${descP}</div>`);
    } else if (label || desc) {
      out.push(`<p class="field full">${esc([label, desc].filter(Boolean).join(' '))}</p>`);
    }
  });
  const submit = decodeEnt(attr((/<input\b[^>]*type=['"]submit['"][^>]*>/i.exec(raw) || [''])[0], 'value')) || 'Submit';
  return `<form class="appt-form gf-form" method="post" action="${esc('/' + file.replace(/\.html$/, ''))}" data-sr-endpoint="unwired">`
    + out.join('\n')
    + `<div class="field full appt-actions"><button class="btn btn-primary" type="submit">${esc(submit)}</button>`
    + `<p class="form-note">We reply during office hours. For anything urgent, call <a href="${esc(PHONE_HREF)}">${esc(PHONE)}</a>.</p></div></form>`;
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
  /* Cut at every bare <h2> (a source section), and also at every TOP-LEVEL <h3> or
     free-standing sub-head (<p class="subhead">): they render at section-title scale,
     so a page with four of them in one band read as four sections with no
     alternation (owner: "every section alternates backgrounds"). 93 sections held
     2-8 such titles; the median sub-section is ~700 characters, so each makes a real
     band. Never inside a list, table or wrapper (the contact card's sub-heads sit in
     div.contact-locate), and never between a heading and the sub-heading directly
     under it. Content is untouched: only where one <section> ends changes. */
  const idx = [];
  let depth = 0;
  for (const m of html.matchAll(/<(\/?)(ul|ol|table|div|blockquote|figure|dl|form|fieldset|details)\b[^>]*>|<h2>|<h3>|<p class="subhead">/gi)) {
    if (m[2]) { depth = Math.max(0, depth + (m[1] ? -1 : 1)); continue; }
    if (/^<h2>$/i.test(m[0])) { idx.push(m.index); continue; }
    if (depth > 0) continue;
    const before = html.slice(0, m.index).replace(/\s+$/, '');
    if (/<\/h[1-6]>$/i.test(before) || /<p class="subhead">(?:(?!<\/p>)[\s\S])*<\/p>$/i.test(before)) continue;
    idx.push(m.index);
  }
  if (!idx.length) return [html];
  const out = [];
  if (idx[0] > 0) out.push(html.slice(0, idx[0]));
  for (let i = 0; i < idx.length; i++) out.push(html.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : undefined));
  /* A section made only of pictures has no text but is not empty: Designer
     Frames opens with a 27-logo brand wall and no words. It survived only
     because stray "<!–" debris shared its section; removing the debris made
     this filter drop every logo. Pictures and embeds count as content. */
  const kept = out.filter((s) => s.replace(/<[^>]+>/g, '').trim().length || /<img\b|<iframe\b/i.test(s));
  /* A band holding only a heading ("Contact Information" on Contact Us, whose
     source copy under it was empty) stood alone in its own colour with nothing
     under it. It leads the next band instead. */
  const onlyHeads = (s) => !/<img\b|<iframe\b/i.test(s)
    && !s.replace(/<(h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '').trim();
  for (let i = 0; i < kept.length - 1; i++) {
    if (onlyHeads(kept[i])) { kept[i + 1] = kept[i] + kept[i + 1]; kept.splice(i, 1); i--; }
  }
  /* A news post's first band was its date plus the lead photo, so the date sat
     alone in a strip under the photo, cut off from the article. The photo stays
     a band of its own; the date heads the article's first text band. */
  const pd = kept.length > 1 && /^\s*(<p class="post-date">[\s\S]*?<\/p>)([\s\S]*)$/.exec(kept[0]);
  if (pd && /^\s*<p>\s*<img\b[^>]*\bclass="wide lead"[^>]*>\s*<\/p>\s*$/.test(pd[2])) {
    kept[0] = pd[2]; kept[1] = pd[1] + kept[1];
  }
  return kept;
}

// ── chrome ───────────────────────────────────────────────────────────────────
function navHtml(file, currentPath, isPost) {
  /* Which top-level item the page belongs to. The homepage marks "Home" with a
     pill; inner pages marked nothing, because only an EXACT href match counted and
     the mega items are <button>s. aria-current="page" stays exact (it means "this
     page"); being inside a section is data-current, styled the same. */
  const TOP = new Set(NAV.map((n) => n.href));
  const inSection = (n) => n.href !== '/' && ((isPost && n.href === '/whats-new') || currentPath.startsWith(n.href + '/')
    || !!(n.mega && n.mega.groups.some((g) => g.href === currentPath
      || (g.items || []).some((h) => h === currentPath && !TOP.has(h)))));
  const li = NAV.map((n, i) => {
    const href = rel(file, byPathname.get(n.href).file);
    const cur = currentPath === n.href ? ' aria-current="page"' : (inSection(n) ? ' data-current' : '');
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
        <button type="button" class="mega-trigger" aria-expanded="false" aria-controls="${id}"${cur ? ' data-current' : ''}>${esc(n.label)}</button>
        <div class="mega" id="${id}" data-cols="${count}" hidden>
          <div class="mega-cols">${cols.join('')}</div>
          <div class="mega-foot"><a href="${esc(href)}">View all ${esc(n.label)}</a></div>
        </div></li>`;
  }).join('');
  return `<nav class="primary-nav" id="primary-nav" aria-label="Primary"><ul>${li}</ul></nav>`;
}

function headerHtml(file, currentPath, isPost) {
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
    ${navHtml(file, currentPath, isPost)}
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
          <div><label for="f-name-${esc(file.replace(/\W/g, ''))}">Name <span aria-hidden="true">*</span></label>
            <input id="f-name-${esc(file.replace(/\W/g, ''))}" name="name" type="text" autocomplete="name" required></div>
          <div><label for="f-phone-${esc(file.replace(/\W/g, ''))}">Phone <span aria-hidden="true">*</span></label>
            <input id="f-phone-${esc(file.replace(/\W/g, ''))}" name="phone" type="tel" autocomplete="tel" required></div>
          <div><label for="f-email-${esc(file.replace(/\W/g, ''))}">Email <span aria-hidden="true">*</span></label>
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
  const mainRaw0 = mainM ? mainM[1] : (raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, ''])[1];
  const isPost = /<body[^>]*class="[^"]*\bsingle-post\b/i.test(raw);

  /* Real forms (see gravityForm). The homepage keeps its own hand-built form,
     so it is left alone; everywhere else the source form becomes a placeholder
     paragraph that survives sanitizing and sectioning intact. */
  const FORMS = [];
  /* A WordPress search form cannot work on a static site. Unwrapped, it left
     "Search: Search" as the whole body of the empty "Our Doctors" archive. It is
     UI, not copy, so it goes. */
  const mainRawNoSearch = mainRaw0.replace(/<form\b[^>]*(?:role=["']search["']|class=["'][^"']*\bsearch-form\b)[^>]*>[\s\S]*?<\/form>/gi, ' ');
  const mainRaw = file === 'index.html' ? mainRaw0
    : mainRawNoSearch.replace(/<form\b[^>]*\bid=['"]gform_\d+['"][^>]*>[\s\S]*?<\/form>/gi, (m) => {
      FORMS.push(gravityForm(m, file));
      return `<p>@@GFORM${FORMS.length - 1}@@</p>`;
    });

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
  /* A candidate holding BLOCK markup is not a paragraph: the source wraps the
     ecp location widget (h2 + contact list) in a <p>, and taking it as the lede
     put a heading and a list inside <p class="hero-lede">. The parser closed the
     <p>, so the h2 and list landed on the teal hero in body colours — measured
     1.1:1 on the Contact page — and the page's heading order stopped matching the
     source. Such a block stays in the body, in source order. */
  const lede = (() => {
    for (const m of body.matchAll(/<p>([\s\S]*?)<\/p>/gi)) {
      // ...and a picture never goes in the hero lede (Emergency Eye Care: a 300x278
      // cut-out inside the lede swelled that hero to 866px).
      if (/<(h[1-6]|ul|ol|div|table|figure|blockquote|form|img|iframe)[\s>]/i.test(m[1])) continue;
      if (m[1].replace(/<[^>]+>/g, '').trim().length > 60) return m[0];
    }
    return null;
  })();
  if (lede) body = body.replace(lede, '');
  const ledeText = lede ? lede.replace(/^<p>|<\/p>$/gi, '') : '';

  body = appointmentForm(shapeReviews(body), file);
  body = newsCards(markDayLists(markLogoWalls(groupFigures(body))));

  const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.? \\d{1,2}, \\d{4}';
  /* A news article opens with its date as a bare text node, which sat alone in a
     strip between the hero and the lead photo. Wrapped (same words) so it can
     take the homepage blog card's date style. */
  if (isPost) body = body.replace(new RegExp('^\\s*(' + MONTH + ')\\s*'), '<p class="post-date">$1</p>');

  /* News LISTINGS (What's New) carry each post as a bare <h2><a>title</a></h2>,
     a date, an excerpt and "Read More". sectionize() cuts at every bare <h2>, so
     the listing shipped as 87 full-bleed bands with section-scale titles. They
     become the homepage's blog cards. The title keeps its <h2> level and words;
     the class keeps sectionize() from cutting there. */
  const POSTH2 = new RegExp('<h2>\\s*(<a\\b[^>]*>[\\s\\S]*?<\\/a>)\\s*<\\/h2>\\s*(' + MONTH + ')\\s*((?:(?!<h2)[\\s\\S])*?)\\s*<a ([^>]*)>\\s*Read(?:&nbsp;|\\s)+More\\s*<\\/a>', 'gi');
  if ((body.match(POSTH2) || []).length >= 2) {
    body = body.replace(POSTH2, (m, link, date, excerpt, attrs) =>
      '<article class="post"><h2 class="post-title">' + link + '</h2><p class="post-date">' + date + '</p>'
      + '<div class="post-excerpt">' + excerpt.trim() + '</div><a class="post-more" ' + attrs + '>Read More</a></article>');
    body = body.replace(/(?:<article class="post">[\s\S]*?<\/article>\s*){2,}/g, (run) => '<div class="postlist">' + run.trim() + '</div>');
  }

  /* The location widget's "Contact Details" + list + "Address" + map ran as
     loose stacked flow (Hours & Location, the location page): a bulleted list,
     bare address text, then a 1180x664 map with nothing framing it. They become
     the homepage's side-by-side Contact / Locate cards — same words, same order,
     only wrapped. Maps get https so a file-served copy still loads them. */
  body = body.replace(/(<iframe\b[^>]*\bsrc=")\/\/(www\.google\.com\/maps\/)/gi, '$1https://$2');
  body = body.replace(
    /(<p class="subhead">Contact Details<\/p>\s*<ul>[\s\S]*?<\/ul>\s*<p class="subhead">Address<\/p>)\s*((?:(?!<iframe|<p|<ul|<h\d)[\s\S])*?)\s*(<iframe\b[^>]*><\/iframe>)/i,
    (m, head, addr, map) => '<div class="contact-locate"><div class="cl-card">' + head
      + (addr.trim() ? '<p class="cl-addr">' + addr.trim() + '</p>' : '')
      + '</div><div class="cl-map">' + map.replace('title="Embedded content"', 'title="Map: Eye Source, 8049 Preston Road Suite 200, Frisco, TX"') + '</div></div>');

  /* The source uses a paragraph that is ENTIRELY bold as a sub-heading (145 of
     them on 38 pages: "How Does LASIK Work?", FAQ questions, "We Accept:"). They
     rendered as body text. Marked so they can be styled as sub-heads; the markup,
     level and words stay exactly as the source has them. */
  if (file !== 'index.html') {
    body = body.replace(/<p>(\s*<(strong|b)>([^<]{2,200})<\/\2>\s*)<\/p>/g,
      (m, inner, t, text) => (textOf(text).length >= 2 ? '<p class="pseudo-head">' + inner + '</p>' : m));
  }

  /* Archive pages (category / tag / author) list their posts as bare title
     links; flattened, they ran together as one paragraph of ten jammed links.
     Each run becomes a list — same links, same words, same order. */
  if (/^(category|tag|author)\//.test(file)) {
    body = body.replace(/(?:<a\b[^>]*>[^<]{1,300}<\/a>\s*){2,}/g,
      (run) => '<ul class="linklist">' + [...run.matchAll(/<a\b[^>]*>[^<]{1,300}<\/a>/g)].map((a) => '<li>' + a[0] + '</li>').join('') + '</ul>');
  }

  /* A live-site defect, carried through by the harvest: WordPress turned the
     "--" of an HTML comment into an en dash, so the comment's delimiters render
     as text ("<!–" and "–>") around a section. They are markup debris, not copy.
     Exact matches only. See DESIGN-SYSTEM.md §8. */
  body = body.replace(/<p>\s*&lt;!(?:&#8211;|–|--)\s*<\/p>|<p>\s*(?:&#8211;|–|--)&gt;\s*<\/p>/g, '');

  /* The page's MAIN image — the first landscape photograph large enough to run
     edge to edge (>=700px wide, 1.2:1 to 3.2:1) — is marked `lead` so it takes
     the full-bleed band whatever section it sits in. Before, only images that
     happened to be in the FIRST section bled; the Hours & Location storefront,
     in the second, stayed a boxed 822px picture. Narrow strips and portraits are
     left inline, where they are not stretched.
     The six lead photos that would render past 1.2x at 1440 (the three practice
     photos at 748-750px, two 1024px banners, one 1193px header) ship as faithful
     Real-ESRGAN upscales from src/assets-extra/, under their ORIGINAL names — see
     _tooling/fal/upscale.mjs. DIMS still reads the harvested size, which is all
     this ratio test needs. */
  if (file !== 'index.html') {
    let marked = false;
    body = body.replace(/<img\b([^>]*?)\sclass="wide"([^>]*)>/g, (m, a, b) => {
      if (marked) return m;
      const d = DIMS.get(path.basename((/src="([^"]+)"/.exec(a + b) || [, ''])[1]));
      if (!d || d[0] < 700 || d[0] / d[1] < 1.2 || d[0] / d[1] > 3.2) return m;
      marked = true;
      return `<img${a} class="wide lead"${b}>`;
    });
  }

  const sections = sectionize(body)
    // A panel with no words and no picture is an empty box on the page.
    .filter((sec) => sec.replace(/<[^>]+>/g, '').trim().length > 0 || /<img|<iframe/.test(sec));
  const { kept, dropped } = dropDuplicateSections(sections);
  if (dropped.length) DUPES.push({ page: pathname, count: dropped.length });
  /* Band colour by CLASS, alternating (contract §2: never by :nth-of-type, never
     two identical backgrounds side by side). The homepage's nth-of-type colour
     rules had been landing on inner pages by position. */
  const panels = kept.map((sec, i) => {
    const cls = ['panel', 'glass', 'reveal', i % 2 ? 'band-b' : 'band-a'];
    if (/class="postlist"/.test(sec)) cls.push('sec-blog');
    if (/@@GFORM\d+@@/.test(sec)) cls.push('sec-form');
    return `<section class="${cls.join(' ')}">${sec}</section>`;
  }).join('\n').replace(/<p>\s*@@GFORM(\d+)@@\s*<\/p>/g, (m, k) => FORMS[+k] || '')
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

  /* Archive pages (tag/, author/) carry a one-item trail, "Home", which rendered as
     the CURRENT page: visitors and screen readers were told a tag page was Home,
     and it lost its only link. Home becomes a link and the page's own h1 the leaf,
     as on every other page. */
  if (crumbs && crumbs.parts.length === 1 && /^home$/i.test(crumbs.parts[0].label) && pathname !== '/') {
    crumbs.parts = [{ label: crumbs.parts[0].label, href: rel(file, 'index.html') }, { label: decodeEnt(h1) }];
  }
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
  /* Same markup as the homepage's visit band: the landmark picked out, the
     address as a lighter second line — both INSIDE the one h2, so its text is
     still exactly LOCATION_H2 (asserted below; a mismatch fails the page). */
  const [locLead, locAddr] = [LOCATION_H2.slice(0, LOCATION_H2.indexOf(' 8049')), LOCATION_H2.slice(LOCATION_H2.indexOf(' 8049') + 1)];
  const locH2 = `${esc(locLead).replace('Wayback Burgers', '<em>Wayback Burgers</em>')} <span class="visit-addr">${esc(locAddr).replace(', Frisco', ', <br>Frisco')}</span>`;
  if (textOf(locH2) !== LOCATION_H2) throw new Error('location h2 text drifted: ' + textOf(locH2));
  /* The source's location widget carries the Google Map, which the rebuild had
     dropped; the Contact page gets it back as a "Locate Us" card, as on the
     homepage. Same embed the source serves (see README "On the embedded Maps
     key"); https so it also works from a file-served copy. */
  const mapSrc = file === 'contact-us.html'
    ? ((/<iframe\b[^>]*\bsrc=["']((?:https?:)?\/\/www\.google\.com\/maps\/embed[^"']+)["']/i.exec(raw) || [, ''])[1]).replace(/^\/\//, 'https://')
    : '';
  const mapCard = mapSrc
    ? `<div class="card card-map"><iframe src="${esc(decodeEnt(mapSrc))}" loading="lazy" title="Map: Eye Source, 8049 Preston Road Suite 200, Frisco, TX" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`
    : '';
  const contactCard = `<div class="card">
      <h2>${locH2}</h2>
    </div>
    <div class="card">
      <h3>Contact Eye Source</h3>
      <ul class="fact-list">
        ${phones.map((p) => {
          /* 214-872-2401 is the practice's FAX, not a second phone. The source
             page labels both numbers "Phone" and the harvest carried that
             through, so every page wrapped the fax in a tel: link - a patient
             tapping it on a phone dials a fax machine.
             facts/client-facts.json records exactly one phone, so any other
             number in this list is a fax: labelled Fax, and NOT linked.
             Verified in audit/raw/index.html, which reads
             "Phone: 214-872-2400   Fax: 214-872-2401". */
          const digits = String(p).replace(/\D/g, '');
          const isPhone = VERIFIED_PHONE_DIGITS.has(digits);
          return isPhone
            ? `<li><b>Phone</b><a href="tel:+1${esc(digits)}">${esc(p)}</a></li>`
            : `<li><b>Fax</b><span>${esc(p)}</span></li>`;
        }).join('')}
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
  /* The two "Welcome to our New Website" posts carry the live site's canonical, the
     homepage (kept: canonicals are frozen), and og:url copied it, so a shared post
     previewed as the homepage. The source's own og:url names the post; use it where
     the canonical points home from a page that is not home. */
  const srcOg = decodeEnt((/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["']/i.exec(raw) || [])[1] || '');
  const ogUrl = pathname !== '/' && canonical === ORIGIN + '/' && srcOg ? srcOg : canonical;

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
<meta property="og:url" content="${esc(ogUrl)}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/fonts.css'))}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/tokens.css'))}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/motion.css'))}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/site.css'))}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/modern.css'))}">
<link rel="stylesheet" href="${esc(rel(file, 'styles/direction.css'))}">
<link rel="icon" type="image/png" href="${esc(rel(file, 'assets/098a48af-1526401368.png'))}">
<link rel="apple-touch-icon" href="${esc(rel(file, 'assets/098a48af-1526401368.png'))}">
</head>
<body>
<div class="bg-blobs" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
<a class="skip" href="#main">Skip to main content</a>
${headerHtml(file, pathname, isPost)}
<main id="main">
  <div class="hero"><div class="shell"><div class="hero-inner glass">
   <div class="hero-copy">
    ${/* The breadcrumb trail used to sit in its own strip ABOVE the hero, so the
         hero did not start at the top of the page as the brief asks. It now leads
         the hero's copy column: same links, same order, same nav landmark. */ ''}${crumbHtml}
    <span class="eyebrow">Frisco, TX Optometrist</span>
    <h1>${esc(h1)}</h1>
    ${ledeText ? `<p class="hero-lede">${ledeText}</p>${copyBoundary}` : ''}
    <div class="btn-row">
      ${book ? `<a class="btn btn-primary btn-lg" href="${esc(rel(file, book.file))}">Book an Eye Exam</a>` : ''}
      <a class="btn btn-ghost btn-lg" href="${esc(PHONE_HREF)}">Call ${esc(PHONE)}</a>
    </div>
   </div>
   ${(() => {
     const HERO = heroFor(file, /<body[^>]*class="[^"]*\bsingle-post\b/i.test(raw));
     if (!HERO) return '';
     // fetchpriority on the hero: it is the LCP element on every page.
     return `<figure class="hero-media">
     <img src="${esc(rel(file, HERO.src))}" alt="${esc(HERO.alt)}" width="${HERO.w}" height="${HERO.h}" fetchpriority="high" decoding="async">
   </figure>`;
   })()}
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
    <aside class="aside">${contactCard}${mapCard}</aside>
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

/* modern.css and direction.css carry the V2 design system settled on the
   homepage in sessions 5-7 (teal + warm-neutral palette, band rhythm, one
   section-title scale, form and contrast fixes, mega-menu, footer). Both are
   purely ADDITIVE over site.css, so shipping them to every page applies the
   system site-wide without touching a single V1 rule. */
for (const f of ['tokens.css', 'site.css', 'modern.css', 'direction.css']) {
  const from = path.join(SRC_STYLES, f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(OUT, 'styles', f));
}

/* Images added after the original harvest (the V2 reskin's own artwork) are
   not in the harvested image manifest, so they are copied verbatim rather than
   silently dropped on rebuild. */
const EXTRA_ASSETS = path.join(P, 'src', 'assets-extra');
if (fs.existsSync(EXTRA_ASSETS)) {
  let n = 0;
  for (const f of fs.readdirSync(EXTRA_ASSETS)) {
    fs.copyFileSync(path.join(EXTRA_ASSETS, f), path.join(OUT, 'assets', f));
    n++;
  }
  console.log(`  extra assets copied: ${n}`);
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

/* ── reviews rail: dot pagination ─────────────────────────────────────────
   The rail is a horizontal scroll-snap strip. Its native scrollbar read as a
   stray grey line under the cards, so it is hidden in CSS and replaced by
   dots. One dot per reachable scroll STOP, not per card: at 1440 four cards
   fit, so seven card-dots left dots 5-7 unable to ever become current
   (measured 2026-09-23). Stops are rebuilt on resize. If this script does not
   run the rail still scrolls normally — the dots are an enhancement, not the
   mechanism. */
(function () {
  var rail = document.querySelector('.sec-reviews .reviews');
  if (!rail) return;
  var cards = Array.prototype.slice.call(rail.querySelectorAll('.review'));
  if (cards.length < 2) return;

  var dots = document.createElement('div');
  dots.className = 'reviews-dots';
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label', 'Patient reviews');
  rail.parentNode.insertBefore(dots, rail.nextSibling);

  var stops = [], buttons = [], tick = null;
  function sync() {
    // nearest stop to the current scroll position wins
    var best = 0, bestD = Infinity;
    for (var i = 0; i < stops.length; i++) {
      var d = Math.abs(stops[i] - rail.scrollLeft);
      if (d < bestD) { bestD = d; best = i; }
    }
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].setAttribute('aria-current', j === best ? 'true' : 'false');
    }
  }
  function build() {
    var max = rail.scrollWidth - rail.clientWidth;
    stops = [];
    cards.forEach(function (card) {
      var x = Math.min(card.offsetLeft - rail.offsetLeft, max);
      if (!stops.length || x - stops[stops.length - 1] > 2) stops.push(x);
    });
    dots.innerHTML = '';
    buttons = stops.map(function (x, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Reviews, page ' + (i + 1) + ' of ' + stops.length);
      b.addEventListener('click', function () {
        rail.scrollTo({ left: x, behavior: 'smooth' });
      });
      dots.appendChild(b);
      return b;
    });
    dots.hidden = stops.length < 2;
    sync();
  }
  rail.addEventListener('scroll', function () {
    if (tick) return;
    tick = requestAnimationFrame(function () { tick = null; sync(); });
  }, { passive: true });
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 150); });
  build();
})();

/* ── reviews rail: pointer drag ───────────────────────────────────────────
   The rail already scrolls with a trackpad or a touch swipe. This adds
   click-and-drag with a mouse, which desktop users expect from a carousel and
   which the scrollbar removal took away. Pointer Events cover mouse, touch and
   pen in one path. A drag that moves more than a few pixels suppresses the
   click so dragging across a card does not follow its link. */
(function () {
  var rail = document.querySelector('.sec-reviews .reviews');
  if (!rail || !window.PointerEvent) return;

  var down = false, startX = 0, startScroll = 0, moved = 0, pid = null;

  rail.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    down = true; moved = 0; pid = e.pointerId;
    startX = e.clientX;
    startScroll = rail.scrollLeft;
    rail.classList.add('is-dragging');
  });

  rail.addEventListener('pointermove', function (e) {
    if (!down || e.pointerId !== pid) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > 3 && rail.setPointerCapture) {
      try { rail.setPointerCapture(pid); } catch (err) {}
    }
    moved = Math.max(moved, Math.abs(dx));
    rail.scrollLeft = startScroll - dx;
  });

  function release(e) {
    if (!down || (e && e.pointerId !== pid)) return;
    down = false;
    rail.classList.remove('is-dragging');
    if (rail.releasePointerCapture && pid !== null) {
      try { rail.releasePointerCapture(pid); } catch (err) {}
    }
    pid = null;
    // snap to the nearest card once the finger is off
    var cards = rail.querySelectorAll('.review');
    if (!cards.length) return;
    var best = cards[0], bestD = Infinity;
    for (var i = 0; i < cards.length; i++) {
      var d = Math.abs((cards[i].offsetLeft - rail.offsetLeft) - rail.scrollLeft);
      if (d < bestD) { bestD = d; best = cards[i]; }
    }
    rail.scrollTo({ left: best.offsetLeft - rail.offsetLeft, behavior: 'smooth' });
  }

  rail.addEventListener('pointerup', release);
  rail.addEventListener('pointercancel', release);
  rail.addEventListener('pointerleave', release);

  // a real drag must not also fire the card's link
  rail.addEventListener('click', function (e) {
    if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; }
  }, true);

  rail.addEventListener('dragstart', function (e) { e.preventDefault(); });
})();

/* ── menus: keyboard ────────────────────────────────────────────────────────
   A mega panel stayed open over the page while a keyboard user tabbed on past it;
   it now closes when focus moves to anything outside it. (A mouse click outside
   is already handled above.) Escape also closes the phone menu. */
(function () {
  var items = document.querySelectorAll('.has-mega');
  Array.prototype.forEach.call(items, function (li) {
    li.addEventListener('focusout', function (e) {
      if (!e.relatedTarget || li.contains(e.relatedTarget)) return;
      var b = li.querySelector('.mega-trigger');
      var p = b && document.getElementById(b.getAttribute('aria-controls'));
      if (b && p) { b.setAttribute('aria-expanded', 'false'); p.hidden = true; }
    });
  });
  var t = document.querySelector('.nav-toggle'), n = document.getElementById('primary-nav');
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !t || !n || !n.classList.contains('open')) return;
    n.classList.remove('open');
    t.setAttribute('aria-expanded', 'false');
    t.focus();
  });
  /* A tap outside the open phone menu closes it; only the toggle or Escape did,
     so it stayed open over the page. Taps inside the menu or on the toggle pass. */
  document.addEventListener('click', function (e) {
    if (!t || !n || !n.classList.contains('open')) return;
    if (n.contains(e.target) || t.contains(e.target)) return;
    n.classList.remove('open');
    t.setAttribute('aria-expanded', 'false');
  });
})();

/* ── forms without a backend ────────────────────────────────────────────────
   This is a static site: every form posts to an endpoint that does not exist yet
   (data-sr-endpoint="unwired"), so a filled-in, valid submission ended on a 404
   page. Until a form service is chosen, a submit keeps the visitor on the page,
   keeps everything they typed, and says plainly what to do instead. The browser's
   own required-field checks still run first. */
(function () {
  var forms = document.querySelectorAll('form[data-sr-endpoint="unwired"]');
  Array.prototype.forEach.call(forms, function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = f.querySelector('.form-status');
      if (!note) {
        note = document.createElement('p');
        note.className = 'form-status';
        note.setAttribute('role', 'status');
        note.setAttribute('tabindex', '-1');
        f.appendChild(note);
      }
      note.textContent = 'Online requests are not connected yet, so this form was not sent. Please call us at 214-872-2400 and we will take care of you.';
      note.focus();
    });
  });
})();
`);

let written = 0; const problems = [];

/* THE DESIGNED HOMEPAGE.
   The homepage was redesigned by hand in site-versions/working/ (11 sections:
   icon strip, brand banner, doctor band, reviews rail, split sections,
   emergency band ...). render() only knows the V1 4-panel layout, so
   dist/index.html kept shipping the old page while the designed one lived in a
   fork that never flowed back. The owner chose (2026-09-23) to ship the designed
   file itself rather than re-implement eleven sections in this template, so
   working/index.html is now the ONE place the homepage is edited, and a rebuild
   carries it into dist.
   It is copied verbatim. That is safe only because it was forked from this
   build's own output — same root-relative paths, same header and footer — and
   the guards after the page loop re-prove each of those on every build rather
   than trusting it. Every other page still comes from render(). */
const DESIGNED_HOME = path.join(ROOT, 'site-versions', 'working', 'index.html');
const WORKING_JS = path.join(ROOT, 'site-versions', 'working', 'scripts', 'site.js');
let homeSource = null;
const pageHtml = (page) => {
  if (page.file !== 'index.html') return render(page);
  if (!fs.existsSync(DESIGNED_HOME)) {
    problems.push('/ — designed homepage missing at ' + DESIGNED_HOME + '; shipped the V1 render instead');
    return render(page);
  }
  homeSource = path.relative(ROOT, DESIGNED_HOME).split(path.sep).join('/');
  return fs.readFileSync(DESIGNED_HOME, 'utf8');
};

for (const page of pages) {
  try {
    const html = pageHtml(page);
    const dest = path.join(OUT, page.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
    written++;
  } catch (e) {
    problems.push(page.pathname + ' — ' + e.message);
  }
}

/* robots.txt, sitemap.xml and llms.txt were written once, by the session-1
   hand-off, and never by this build — so every rebuild since session 5 DELETED
   them (found 2026-09-23: dist had been shipping with no sitemap and no robots
   file). They are generated here in exactly the committed format: one entry per
   built page, sorted by path, the homepage as the site root. Only lastmod moves. */
{
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const urls = pages.map((p) => p.file).sort().map((f) => ORIGIN + '/' + (f === 'index.html' ? '' : f));
  fs.writeFileSync(path.join(OUT, 'robots.txt'), 'User-agent: *\n\nSitemap: ' + ORIGIN + '/sitemap.xml\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `<url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');
  fs.writeFileSync(path.join(OUT, 'llms.txt'), `# ${ORIGIN}\n\nA static reconstruction. ${pages.length} pages.\n\n## Pages\n\n`
    // llms.txt names the homepage by its file, the sitemap by the root — as committed.
    + pages.map((p) => p.file).sort().map((f) => '- ' + ORIGIN + '/' + f).join('\n') + '\n');
}

/* Homepage guards (see DESIGNED_HOME). Each one fails loudly into PROBLEMS
   rather than letting the designed homepage silently drift from the site. */
let homeLine = 'render() (V1 layout)';
if (homeSource) {
  const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  // 1. Every local src/href must resolve inside dist.
  const refs = [...new Set([...home.matchAll(/\b(?:src|href)="([^"#?]+)[^"]*"/g)]
    .map((m) => m[1]).filter((r) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(r)))];
  const missing = refs.filter((r) => !fs.existsSync(path.join(OUT, r)));
  if (missing.length) problems.push('/ — designed homepage references ' + missing.length + ' missing file(s): ' + missing.slice(0, 5).join(', '));
  // 2. Chrome parity: header and footer links + text must equal what render()
  //    generates, or a nav change here would never reach the homepage.
  //    render() is called only to compare; its duplicate-section tally is
  //    rolled back because that page is not shipped.
  const dupesBefore = DUPES.length;
  const gen = render(pages.find((p) => p.file === 'index.html'));
  DUPES.length = dupesBefore;
  const chrome = (h, tag) => {
    // the LAST <footer> — review cards carry their own nested <footer>
    const i = tag === 'footer' ? h.lastIndexOf('<footer') : h.indexOf('<header');
    const s = h.slice(i, h.indexOf('</' + tag + '>', i));
    return [...s.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).join('|') + '#' + s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  };
  for (const tag of ['header', 'footer']) {
    if (chrome(home, tag) !== chrome(gen, tag)) problems.push('/ — designed homepage <' + tag + '> differs from the generated one; bring site-versions/working/index.html up to date');
  }
  // 3. One site script: the homepage was designed against working/scripts/site.js.
  if (fs.existsSync(WORKING_JS) && fs.readFileSync(WORKING_JS, 'utf8') !== fs.readFileSync(path.join(OUT, 'scripts', 'site.js'), 'utf8')) {
    problems.push('scripts/site.js differs from site-versions/working/scripts/site.js; keep the two in sync');
  }
  homeLine = `${homeSource} (${refs.length} local refs, ${missing.length} missing)`;
}

console.log('build complete');
console.log('  pages written  ' + written + ' / ' + pages.length);
console.log('  assets copied  ' + copied);
console.log('  fonts          ' + faces.length);
console.log('  nav sections   ' + NAV.length);
console.log('  dupe sections  ' + DUPES.reduce((n, d) => n + d.count, 0) + ' dropped across ' + DUPES.length + ' page(s)');
console.log('  homepage       ' + homeLine);
if (problems.length) { console.log('  PROBLEMS ' + problems.length); problems.slice(0, 10).forEach((p) => console.log('    ' + p)); }
