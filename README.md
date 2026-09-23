# Frisco Eye Source — Site Reforge

A platform-free static rebuild of [friscoeyesource.com](https://www.friscoeyesource.com/),
reconstructed as clean HTML/CSS/JS and redesigned in the practice's own teal and
warm-neutral palette.

### ▶ [**Live preview →**](https://nicoledreo.github.io/frisco-eye-source-reforge/)

> **Disclaimer.** This is an unapproved website design concept produced by Dispenza.
> It is not affiliated with, authorised by, or endorsed by EyeSource PLLC. All business
> names, copy, imagery and brand marks remain the property of their respective owners.

---

## What this is

287 pages rebuilt off the original platform — no CMS, no page builder, no runtime
dependencies. The copy, headings, links, image alt text, titles, meta descriptions,
canonicals and structured data are carried over from the source unchanged (SEO-frozen);
the design around them is new.

| | |
|---|---|
| Pages | 287 |
| Build output | 23 MB |
| Build | `node _tooling/build.mjs` → `main/dist/` |

## Design

The homepage was designed section by section with the practice's owner
(`site-versions/working/`), and its rules were then applied to every inner page. The
rules are written down in [`site-versions/DESIGN-SYSTEM.md`](site-versions/DESIGN-SYSTEM.md).

- **Palette** — the practice's teal with warm neutrals and a champagne accent, set as
  tokens; every text colour is checked against the pixels actually behind it.
- **Sections** — every titled section is its own full-width band, and neighbouring bands
  never share a background.
- **Photography** — each page's main photo runs edge to edge; other pictures show at
  their own size and are never stretched. Inner-page heroes are original art
  generated for this concept.
- **Real forms** — Appointment Request, Contact and Patient Registration are rebuilt
  field for field from the source forms (92/92 fields). They are not connected to a
  mail service yet; a submission shows a "please call" message instead of an error.
- **Phones** — designed at 360–390px, not just shrunk: tap targets of 44px, nothing
  scrolls sideways, photos shown whole.

## Verification

Measured, not asserted. Tooling lives in [`_tooling/preview/`](_tooling/preview/).

**Current build (2026-09-23)**

| Check | Result |
|---|---|
| Layout sweep, every page at 360 / 390 / 1440 | 861 page-widths · **0 issues** (sideways scroll, photos edge to edge, broken images, one h1) |
| Homepage regression suite | 25/25 at 1440 · 8/8 at 390 |
| SEO vs. source (homepage) | title, meta, canonical, JSON-LD **identical** |
| SEO sweep, all 287 pages vs. previous build | only the documented changes (restored source links, archive breadcrumbs, two empty headings) |
| Internal links | 26,264 checked · 0 broken (the checker's one flag is `url(#n)` inside an SVG data URI) |
| Form fields vs. source | 92/92 |
| Text contrast on the homepage (worst case per section, rendered pixels) | 4.54 – 9.18, all pass WCAG AA |

**Initial build (2026-09-21, not re-run since)**

| Check | Result |
|---|---|
| Content parity vs. source | 287/287, **100.0% recall**, 0 major |
| Fabrication audit | SOURCED |
| Platform decontamination | CLEAN |
| Release gate | 23 PASS · 6 FAIL · 0 UNPROVEN (see Known defects) |

## Layout

```
main/dist/      the built site (287 pages)  ← served by GitHub Pages
main/docs/      README, BRAND-SYSTEM, DEPLOY, CHANGE-LOG
main/audit/     parity, gate and sweep reports
main/facts/     first-party business facts, each field sourced to the live capture
_tooling/       build script, verification probes, capture harness
```

## Known defects

- `main/dist/assets/cd7e616a-clipart-010.jpg` and `ce6761f7-review-quote.png` are **not
  images** — they are soft-404 HTML pages returned by the source server during harvest.
  Neither renders on any page; the first is referenced only in `og:image`/`twitter:image`
  on one blog post. Left in `main` for fidelity.
- The release gate carries **6 documented failures**, unchanged from the initial build.
  Its overall verdict is therefore `NOT-READY`. Re-read 2026-09-22 — still 23 PASS / 6 FAIL
  / 0 UNPROVEN. What the six actually are, from `main/audit/gate.json`:

  | Check | Stage | Why it fails |
  |---|---|---|
  | `C22` Pixel-for-pixel match vs. source | pixeldiff | **Inapplicable by design** — this build is a deliberate redesign, so pixel parity against the original can never pass. Worst drift 99.447% on `index.1440.png`. |
  | `C03` Every crawled page fetched | crawl | 17 source pages failed to fetch during harvest — source-side. |
  | `C04` Content captured for every page | extract | 6 pages under 50 chars of body text, all `/slideshow/*` — genuinely near-empty at source. |
  | `C05` No unresolved JS-rendered shell | extract | 41 pages flagged as likely JS-rendered but captured statically. The one worth a second look. |
  | `C06` SEO inventory captured | extract | 1 source page had no `<title>`. |
  | `C07` Image inventory with real dimensions | assets | 1 same-origin image never downloaded. |

  Five of the six are either inapplicable to a reskin (`C22`) or record gaps in the
  **source** site rather than defects in this rebuild. Content parity is separately
  measured at 287/287, 100.0% recall, 0 major.

## Preview branch

The `gh-pages` branch differs from `main` in one respect: the source markup embeds
EyeSource's own public Google Maps browser key, so the four map embeds are replaced
with a static location card linking to the same `place_id`. Serving the key from
`github.io` would spend their Maps quota. The `main` branch and the handoff bundle keep
the source-faithful markup. `node _tooling/publish-preview.mjs main/dist <out>` makes the
preview copy, and fails if the key survives anywhere in it.

### On the embedded Maps key

`main` preserves the key as it appears in the source, in 5 files (the contact page gained
the source's map in 2026-09). This is a deliberate decision, not an oversight, and it
adds **no exposure** beyond what the origin site
already publishes — verified 2026-09-22 by comparing both strings:

| | |
|---|---|
| `friscoeyesource.com` homepage | key present, served publicly (HTTP 200) |
| this repo, `main` | **byte-identical** to the above |
| this repo, `gh-pages` | 0 occurrences |
| the live preview | 0 occurrences |

Google Maps *browser* keys are designed to be public and are restricted by HTTP referrer
rather than kept secret. Because the preview never loads a map, no request is ever billed
to their quota. Scrubbing `main` would rewrite public history and cost source fidelity
while the key stayed public on the origin site regardless, so it was left in place.
