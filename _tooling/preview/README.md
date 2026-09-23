# Preview & visual-verification tooling

These four scripts are how you **look at** the site. Until session 5 they lived only in
per-session scratchpad directories under `%TEMP%\claude\...\<session-id>\scratchpad\`,
which are wiped between sessions — so sessions 3, 4 and 5 each lost time re-deriving the
same harness. They live here now.

No dependencies. Node 20+ (uses the built-in `fetch` and `WebSocket`). Chrome must be
installed; override its path with `SR_CHROME` if it is not at
`C:/Program Files/Google/Chrome/Application/chrome.exe`.

---

## 1. `serve.mjs` — static preview server

```
node _tooling/preview/serve.mjs site-versions/working  8101    # http://127.0.0.1:8101/
node _tooling/preview/serve.mjs site-versions/baseline 8100    # http://127.0.0.1:8100/
```

Run both to compare V2 against the frozen V1 side by side. A real server is more faithful
than `file://` — fonts and relative requests resolve the way they will in production.
On SIGINT it prints every path that 404'd, which is the fastest way to catch a missing asset.

## 2. `slices.mjs` — readable top-to-bottom screenshots

```
node _tooling/preview/slices.mjs <url> <width> <outPrefix> [sliceHeight=1150] [mobile=0]

node _tooling/preview/slices.mjs http://127.0.0.1:8101/ 1440 out/desk 1150 0
node _tooling/preview/slices.mjs http://127.0.0.1:8101/ 390  out/mob  1000 1
```

Loads the page once, expands the viewport to the **full document height** so nothing
lazy-loads mid-capture, then clips each slice out of the same fully-rendered page. Slices
are native resolution rather than a downscaled full-page shot, so text stays legible.
Writes `<outPrefix>-00.png`, `-01.png`, … and prints a JSON manifest with each slice's
`y` offset.

Use a distinct `SR_PORT` per concurrent run (default 9223) or the two Chromes collide.

## 3. `metrics.mjs` — objective layout facts

```
node _tooling/preview/metrics.mjs <url> <width> <out.json> [mobile=0]
```

Measures rather than eyeballs. Emits:

| key | what it catches |
|---|---|
| `overflow[]` | elements extending past the viewport right edge |
| `clipped[]` | children sticking out of an `overflow:hidden` parent |
| `deadRight[]` | text with >180px of unused slack inside its parent — the blank-space complaint, quantified |
| `voids[]` | vertical gaps >90px between consecutive siblings |
| `ragged[]` | single-row grid/flex whose columns end >80px apart |
| `images[]` | rendered width vs intrinsic width — `scale > 1` means upscaled and blurry |
| `smallTargets[]` | interactive elements under 32px tall |
| `dupText[]` | normalised text appearing more than once |
| `sections[]` | document-order inventory with y offset and height |

> **It expands the viewport to the full document before measuring, deliberately.**
> At a 900px-tall viewport every lazy image below the fold reports `naturalWidth: 0`, so an
> earlier version of this script measured **3 of 14 images** and ranked confidently off the
> subset. Same failure mode as session 3's spacing script, which returned `NaN` for `var()`
> values and therefore omitted the single largest source of blank space on the page.
> A tool that silently skips inputs will rank confidently and wrongly.

### Reading `overflow[]` on this site

`.reviews` (`site.css:471`) is an **intentional horizontal scroll-snap rail** — 8 cards,
`overflow-x:auto`, `scroll-snap-type: x mandatory`. So `overflow[]` is always full of
`article.review` entries reaching x≈2300. That is by design, not a layout break. The PNGs
make it look worse than it is because `slices.mjs` launches Chrome with `--hide-scrollbars`.

## 4. `standalone.mjs` — one-file portable snapshot

```
node _tooling/preview/standalone.mjs site-versions/working site-versions/frisco-eye-source-preview.html
```

Inlines every stylesheet, font, script and image into a single `.html` you can email or
open off disk. Drops the three italic `@font-face` faces (~410 KB) because nothing on the
page sets `font-style: italic`. Rewrites the Maps iframe's protocol-relative `//` URL to
`https://` so it survives `file://`.

---

## The loop

```
1. node _tooling/preview/serve.mjs site-versions/working 8101     # once
2. edit site-versions/working/styles/direction.css
3. node _tooling/preview/slices.mjs  http://127.0.0.1:8101/ 1440 out/d 1150 0
   node _tooling/preview/metrics.mjs http://127.0.0.1:8101/ 1440 out/m.json 0
4. read the PNGs, diff the metrics
5. node _tooling/preview/standalone.mjs site-versions/working site-versions/frisco-eye-source-preview.html
```

Steps 3–4 are the part every prior session skipped, which is why four sessions in a row
ended with *"still unverified: how it looks."*

---

## 5. Added 2026-09-23 — the rest of the harness, made durable

These lived only in session scratchpads (sessions 5 and 6) and are copied here so
the next session does not re-derive them. All take `SR_PORT` where they launch Chrome.

| Script | Use |
|---|---|
| `verify5.mjs <url> <width> [mobile]` | the homepage regression suite — 25 desktop / 8 mobile assertions from live computed styles |
| `herocontrast.mjs <url> <width> [mobile]` | hides the hero copy, samples the real backdrop, reports worst-case WCAG ratio per text element. Run at **390, 768 and 1440** |
| `seoguard.mjs <a.html> <b.html>` | anchors / heading outline / meta / JSON-LD / alts, A vs B. **Read the diff lines, not the counts** |
| `seodelta.mjs <a.html> <b.html>` | the forensic follow-up: which text units moved or went missing, with word counts |
| `probe.mjs <url> <width> <mobile> -e "<expr>"` | evaluate any JS in the fully-laid-out page (viewport expanded, `.reveal` forced in) and print JSON |
| `align.mjs <url> <width>` | edge alignment of rows + the clipping-ancestor chain (the box is not what is painted) |
| `chromediff.mjs <a.html> <b.html>` | header/footer link + text parity between two pages |
| `heromap.mjs <distDir> [--list <hero.jpg>]` | which hero image every built page uses |
| `imginv.mjs <distDir>` | content images per page with intrinsic sizes — finds "main image" candidates |
| `posttype.mjs <main/audit/raw>` | classifies harvested pages by WordPress body class (`single-post` = news article) |
| `tojpeg.mjs <url> <out> [maxW] [q]` | PNG→JPEG via Chrome canvas (no ImageMagick/sharp on this machine) |
| `rowscan.mjs` | per-row colour of an image, for deciding a crop from data |

| `seosweep.mjs <beforeDist> <afterDist> [--skip index.html]` | SEO parity on **every** page: heading outline, links, alts, words. Run it on every build that touches templates |
| `formparity.mjs <raw.html> <built.html>` | every source Gravity Forms field exists in the rebuilt form (label, choices, options, sub-fields, sections). Mutation-tested |
| `linkcheck.mjs <distDir>` | every local href/src/url() in every page and stylesheet resolves (one known false positive: `url(%23n)` inside the grain SVG data URI) |

fal tooling lives in `_tooling/fal/`: `heroes.mjs` (the generated heroes' exact prompts and
seeds; raw renders in `masters/`), `cropjpeg.mjs` (3:1 crop), `upscale.mjs` (faithful
Real-ESRGAN upscale of REAL photos, face enhancement off), `imgproc.mjs` (trim edges, resize,
JPEG). fal is registered at user scope; without MCP, the REST API works directly
(`POST https://fal.run/<model>`, `Authorization: Key <FAL_KEY>`).

Build to a staging directory with `FES_OUT=<dir> node _tooling/build.mjs` — useful when
something is measuring `dist/` and must not see it deleted mid-run.

Traps that cost real time: a Git-Bash path (`/c/Users/...`) inside a node string
resolves to `C:\c\Users\...` — pass `C:/Users/...`; headless Chrome's child handle can
keep node alive on Windows after the work is done (`probe.mjs` and `fal/cropjpeg.mjs`
force `process.exit()` for that reason; wrap others in `timeout` if one hangs); and never run `build.mjs` while anything is measuring `dist/` — it deletes
the directory first.
