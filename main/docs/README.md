# Eye Source — glassmorphism rebuild

A platform-free static rebuild of **friscoeyesource.com** (EyeSource PLLC, Carey Brooks OD,
Frisco TX), redesigned on a glassmorphism system and re-architected on the information
architecture of **eyetrendsclearlake.com**.

Built with `site-reforge` v1.12.1 on Node 24.19.0. No runtime dependency, no framework,
no build step required to serve it.

---

## What came from where

| | Source | What it contributed |
|---|---|---|
| **Content, copy, images, URLs, brand palette, typeface** | `friscoeyesource.com` (287 pages) | Everything the visitor reads or sees. Carried across verbatim — `sr-parity` measures **100.0% mean token recall** with 0 content-loss findings. |
| **Information architecture** | `eyetrendsclearlake.com` (43 pages) | The shape only: a shallow, service-led nav with grouped mega-menus and a standing "Book an Eye Exam" CTA. **No Eye Trends text, image, or identity is present in this build.** |
| **Visual design** | New | The glassmorphism layer — translucent panels, layered gradient canvas, depth and motion. |

Every identity fact on the site (name, address, phone, hours, schema) belongs to
EyeSource PLLC and is recorded with its evidence in `facts/client-facts.json`.

---

## Layout

```
dist/                 the deliverable — 287 pages, serve this
  index.html          one file per source URL, at the source's own path
  assets/             208 images, local, content-hashed names
  fonts/              6 Raleway faces, self-hosted (the source used Google Fonts)
  styles/             fonts.css · tokens.css · motion.css · site.css
  scripts/site.js     nav + reveal. ~2 KB, no framework, no tracker
  robots.txt · sitemap.xml · llms.txt
src/styles/           the authored source of the stylesheets
  tokens.css          measured design tokens + the glass layer
  motion.css          keyframes VERBATIM from the live capture (the record of origin)
  site.css            the authored sheet — zero colour literals, all var()
audit/                every stage's evidence. gate.json is the verdict
facts/client-facts.json   declared facts, each with the file it was read from
_tooling/             the generator, the CDP bridge, and the payloads (see below)
```

`_tooling/` lives one level up, beside this project, and is the reproducible route
from the harvest to `dist/`:

```
node _tooling/build.mjs        # regenerate all 287 pages
node _tooling/ledger.mjs       # re-apply the change-control decisions
node _tooling/sr-bridge.mjs    # the zero-dependency Chrome/CDP bridge
```

---

## Viewing it

```
node <skill>/scripts/sr-serve.mjs --root dist --port 8099
```

Every reference in the build is relative (`sr-rebase` rewrote 509 of them), so the
folder also works from a subdirectory or straight off the filesystem.

---

## State of the gate

`sr-gate.mjs` is the only authority on readiness, and it reports **NOT READY**.
Six of its 29 checks cannot pass, and none of them is a defect in this rebuild —
five are defects in the live source site and one is the redesign itself.
`docs/CHANGE-LOG.md` lists each one with its evidence.

Everything the rebuild is actually answerable for is green: parity, content recall,
SEO survival, forms and contact details, fabrication, decontamination, responsive
sweep, tokens, motion and documentation.
