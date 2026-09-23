# Site versions — Frisco Eye Source

Self-contained homepage versions. Each folder renders on its own: no build step,
no dependency on `main/dist`, nothing to install.

```
site-versions/
  baseline/   frozen — the shipped homepage. DO NOT EDIT.
  working/    the version we iterate on. Edit this.
  _archive/   rejected experiments, kept for reference
  frisco-eye-source-preview.html   one-file snapshot of working/
```

These were called `v1/` and `v2/` until the names stopped matching reality — the
folder named `v2` ended up holding V1's design, which is exactly the kind of thing
that gets a frozen baseline overwritten by accident. Named for their role now.

## Where to make changes

| Intent | File |
|---|---|
| Design / visual changes (whole site) | `working/styles/direction.css`, then copy it to `main/src/styles/direction.css` and rebuild |
| Homepage structure / content | `working/index.html`, then rebuild |
| Site-wide script | `_tooling/build.mjs` (the inline `site.js` template) — keep `working/scripts/site.js` identical |
| Compare against the original | serve `baseline/` |

`direction.css` carries the whole V2 design system and is purely additive over the
untouched V1 `site.css`; `modern.css` is the earlier V2 layer beneath it. The
contract they implement is `DESIGN-SYSTEM.md`.

## Previewing

```
node _tooling/preview/serve.mjs site-versions/working  8101    # http://127.0.0.1:8101/
node _tooling/preview/serve.mjs site-versions/baseline 8100    # http://127.0.0.1:8100/
node _tooling/preview/serve.mjs main/dist              8102    # the built site
```

Run both to compare side by side. A server is more faithful than opening
`index.html` off disk — `file://` changes how fonts and relative requests resolve.

## Why these are copies, not the real `dist`

`main/dist/` is **generated**. `_tooling/build.mjs` (the `// ── run` section) runs

```js
fs.rmSync(OUT, { recursive: true, force: true });
```

— it deletes the entire `dist` directory and regenerates it from source on every
build. Anything edited there is destroyed on the next build. These folders sit
outside that blast radius.

### Since 2026-09-23 the homepage DOES flow into the build

`working/` used to be a fork whose changes never reached `main/dist`. The owner
chose to ship the designed homepage as-is, so `build.mjs` now copies
`working/index.html` verbatim to `dist/index.html` (see `DESIGNED_HOME` in the
build). Every other page still comes from `render()`.

Three guards run on every build and print under `PROBLEMS` if they fail — each
was proven by planting the fault it catches:

1. every local `src`/`href` in the homepage must exist in `dist`;
2. the homepage `<header>` and `<footer>` must match what `render()` generates
   (links and text), so a nav change cannot silently skip the homepage;
3. `dist/scripts/site.js` must be byte-identical to `working/scripts/site.js`.

`direction.css` still lives in two places — `working/styles/` and
`main/src/styles/`. Edit the working copy, `cp` it across, rebuild.

`<body class="home">` marks the designed homepage. Rules that must differ between
the homepage and the other 286 pages key off `body.home` / `body:not(.home)`.

## Provenance (historical — as of session 3)

`baseline/` is byte-identical to `main/dist/` as built — verified by md5 on
`index.html`, `site.css`, `tokens.css` and `site.js`. `working/` differs from it by
exactly one added `<link>` and one added file:

```
diff -r baseline working
  16a17
  > <link rel="stylesheet" href="styles/modern.css">
  Only in working/styles: modern.css
```

Text content is identical across both — 1,868 words, verified by stripped-tag diff.

## Inherited from the original build

- **One `<iframe>`** — the Google Maps embed carrying EyeSource's public browser
  key. The published `gh-pages` preview swaps it for a static location card; these
  folders keep the source-faithful markup. In the one-file snapshot its URL is
  rewritten from protocol-relative `//` to `https://`, or it breaks under `file://`.
- **No `@layer`.** Stacking is 7 raw `z-index` values: blobs `-1`, hero media `0`,
  scrim `1`, hero copy `2`, sticky header `50`, skip-link `100`.
- **`motion.css` is 19 KB here** vs. 60 KB in `main/src` — the build strips its
  provenance comments on the way out.

## `_archive/`

`lenscrafters-skin.css` — a full replacement skin modelled on lenscrafters.com
(pill buttons, flat white with neutral bands, tightened type). Rejected: stripping
V1's depth read as plain rather than sleek. Kept because parts of it may still be
worth grafting. It is not linked from anything.
