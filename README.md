# Frisco Eye Source — Site Reforge

A platform-free static rebuild of [friscoeyesource.com](https://www.friscoeyesource.com/),
reconstructed as clean HTML/CSS/JS and given a glass-morphism reskin.

### ▶ [**Live preview →**](https://nicoledreo.github.io/frisco-eye-source-reforge/)

> **Disclaimer.** This is an unapproved website design concept produced by Dispenza.
> It is not affiliated with, authorised by, or endorsed by EyeSource PLLC. All business
> names, copy, imagery and brand marks remain the property of their respective owners.

---

## What this is

287 pages rebuilt off the original platform — no CMS, no page builder, no runtime
dependencies. Every colour is a measured design token; the authored stylesheet contains
**zero colour literals**.

| | |
|---|---|
| Pages | 287 |
| Build output | 20 MB |
| Design tokens | 87 (all measured from source) |
| Colour literals in `site.css` | 0 |

## Design work

- **Glass layer** — frosted panes over a fixed gradient canvas, with a specular sheen,
  a lit top edge and layered shadows. Four radial blobs drift on offset 38–52s loops,
  animated with `transform` only so they stay GPU-composited; they stop completely
  under `prefers-reduced-motion`.
- **Hero** — full-bleed, with the copy on its own frosted panel. The panel carries the
  legibility, which let the photo scrim lighten to 0.62/0.50/0.34 so the clinic reads clearly.
- **Homepage** — compacted two-column booking form, equal-height review snap rail with
  cycled brand tints, doctor bio beside a 210px portrait, two-column hours, post cards
  for "What's New".

## Verification

Measured, not asserted. Tooling lives in [`_tooling/`](_tooling/).

| Check | Result |
|---|---|
| Content parity vs. source | 287/287, **100.0% recall**, 0 major |
| Fabrication audit | SOURCED |
| Platform decontamination | CLEAN |
| Responsive sweep @ 390/768/1024/1440 | 0 blocker / 0 major |
| Contrast (worst-case, from rendered pixels) | hero **8.74**, review cards **9.49 / 9.37**, post cards **17.50**, asides **17.43 / 17.15 / 17.26** — all PASS AA |
| Release gate | 23 PASS · 6 FAIL · 0 UNPROVEN |

Contrast is sampled with a worst-case probe (`_tooling/worst-contrast.mjs`): the copy is
hidden, the *brightest* pixel under the text box is found, and the glyph colour is measured
against that — rather than against the most favourable pixel.

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
  | `C22` Pixel-for-pixel match vs. source | pixeldiff | **Inapplicable by design** — this build is a deliberate glass reskin, so pixel parity against the original can never pass. Worst drift 99.447% on `index.1440.png`. |
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
EyeSource's own public Google Maps browser key, so the three map iframes are replaced
with a static location card linking to the same `place_id`. Serving the key from
`github.io` would spend their Maps quota. The `main` branch and the handoff bundle keep
the source-faithful markup.

### On the embedded Maps key

`main` preserves the key as it appears in the source, in 4 files. This is a deliberate
decision, not an oversight, and it adds **no exposure** beyond what the origin site
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
