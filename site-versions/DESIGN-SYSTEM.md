# Frisco Eye Source — design system

Settled on the homepage in sessions 5–6. **This is the contract to apply to the other
286 pages.** Everything here is implemented in `working/styles/direction.css`, which is
purely additive over the untouched V1 sheets.

---

## 1. Palette

From the client's "Inspired by Eye Source Interior" board. Defined once as raw channels
in `direction.css`; `tokens.css` derives every semantic token from them and `site.css` is
100% `var()`-driven, so the channels are the only place colour is decided.

| Token | Hex | Role |
|---|---|---|
| `--ch-teal` | `#294D55` | brand / dark bands / hero scrim / footer |
| `--ch-teal-2` | `#3E5D60` | focus ring, glass tint |
| `--ch-bluegray` | `#7B9194` | backdrop orbs only |
| `--ch-warmwhite` | `#F4F1E9` | light band, card ground, type on teal |
| `--ch-ivory` | `#E8E3D8` | alternate light band |
| `--ch-greige` | `#AAA99F` | neutral accents |
| `--ch-charcoal` | `#343638` | body text |
| `--ch-oak` | `#B9A58D` | beige band (used at 0.20 for the form) |
| `--ch-champagne` | `#D3B58F` | the warm accent — rules, underlines, buttons |

### Measured contrast — use these, not guesses

| Pair | Ratio | |
|---|---|---|
| charcoal on ivory | 9.48 | pass |
| charcoal on warm white | 10.75 | pass |
| teal headings on ivory | 7.18 | pass |
| warm white on teal | 8.14 | pass |
| champagne on teal | 4.71 | pass |
| charcoal on champagne | 6.23 | pass |

**Never use for text on teal:** blue-gray (2.76), greige (3.89), light oak (3.86).
**Champagne cannot carry small text on teal** — it needs the backdrop below 0.07
luminance. Use warm white and keep champagne as the underline/rule.

---

## 2. Section rhythm

Every section is a full-bleed band. Backgrounds alternate, with photographs used as
punctuation rather than decoration:

```
hero IMAGE → ivory (icon strip) → banner IMAGE → warm white (intro)
→ beige (form) → doctor IMAGE → ivory (reviews) → warm white (optical)
→ exams IMAGE → ivory (sharp vision) → warm white (now featuring)
→ white (emergency) → ivory (blog) → warm white (contact)
→ teal (visit) → champagne (CTA) → teal (footer)
```

Rule: never put two identical backgrounds next to each other, and never let a light strip
fall between two dark bands — that reads as a rendering fault, not a gap.

Colour is assigned **by class** (`.sec-*`), never by `:nth-of-type`. The old nth-of-type
sequence broke the moment the panel count changed.

## 3. The band primitive

Full-bleed background, centred content, no wrapper markup:

```css
padding-block: var(--band-pad);
padding-inline: max(var(--band-gutter), calc((100% - var(--band-max)) / 2));
```

`--band-max` is 1180px. The optical shop overrides it to 1560px to span the desktop.
**Do not** let `.page` padding, `.prose` row-gap or `.site-footer` margin-top reappear —
those three V1 rules leaked 302px of page canvas between bands and are reset to 0.

## 4. Typography

**One section-title size across the whole site:**

```css
.prose > section.panel > h2,
.prose > section.panel > h3,
.prose > section.panel > h4 { font-size: clamp(1.9rem, 3vw, 2.7rem); }
```

Before this, titles ran at 43.2px, 30.4px and 16.32px — the last being the same visual
rank as body copy, which is why "What's New?" did not read as a section at all.

**Alignment:** section titles and sub-heads are **centred**, with three deliberate
exceptions — the hero, "Meet Our Frisco Eye Doctor", and the emergency band, which stay
left-justified.

> `site.css:516` makes every `.prose h4` a flex container with a gold `::before` bar.
> `text-align: center` does nothing to it — centre the flex line with
> `justify-content: center` and drop the bar with `::before { content: none }`.
> Card labels inside `.cl-card` / `.post` keep the bar and stay left; that is what
> distinguishes a section title from a sub-label.

Body copy: centred and opened to 96ch on desktop where a section is a single column;
left-aligned below 720px, because centred body text on a phone is hard to read.

## 5. Copy over photographs

Two patterns, both verified by measuring the real backdrop with the copy hidden:

- **Doctor band** — the artwork is already a flat teal field on its left two-thirds, so
  warm-white type sits on it with no scrim at all.
- **Hero and exams bands** — the photograph is bright where the text sits, so a teal ramp
  carries it. Hold ≥0.86 alpha across the full text column, then fall away over the
  remaining 40% so it fades gradually instead of ending on an edge.

Measure, do not eyeball. The first teal hero passed by eye and measured 3.09:1.

**Mobile (≤640px):** the copy fills almost the whole hero, so the top-to-bottom ramp
holds **≥0.86 from the very top** (0.86 → 0.90 → 0.95). It used to start at 0.74, which
measured 3.26–4.07:1 on inner pages at 390px. On inner pages the gold `--hero-glow`
is also switched off under 860px: at phone width its 40rem ellipse lies over the copy
and lifted the backdrop to `rgb(111,124,118)`. Always measure hero contrast at **390,
768 and 1440** — session 5 measured only 1440 and missed every mobile failure.

## 5a. Inner-page hero

The owner's brief: every page gets a hero image at the very top, **"with the same
dimensions as the image of the dentist"**, copy on the left.

- **Homepage** (`body.home`) keeps the full-viewport hero — `min(100svh, 920px)`.
- **Every other page** (`body:not(.home)`) takes the doctor band's sizing:
  `min-height: clamp(360px, 36vw, 520px)` — 518px at 1440. It is a *minimum*: a long
  source lede still fits, because hero copy is frozen and must never be clipped.
- Hero art is **3:1** (2000×667), subject in the right third, left half quiet for the
  scrim. Under 860px the crop is biased to `76% center` so a phone shows the subject,
  not the empty wall (the doctor band does the same at 72%).
- Art is keyed by section in `_tooling/build.mjs` (`HERO_BY_PAGE`, `HERO_BY_PREFIX`,
  and news articles by their harvested `single-post` body class). The three fal
  heroes are reproducible with `_tooling/fal/heroes.mjs`; they are styled still lifes,
  not the practice's premises, and their alt text says what they show.

## 5b. Inner pages — rules settled by the 2026-09-23 audit

Six auditors measured 12 representative inner pages against the homepage; two
skeptics re-measured every finding (35 of 37 confirmed by both). The fixes live in
`direction.css` under "INNER PAGES — fixes from the 2026-09-23 audit" and in
`_tooling/build.mjs`. The rules they establish:

- **Band colour by class.** The build tags inner panels `band-a` / `band-b`
  (ivory / warm white, alternating); forms sit on the form beige. The homepage's
  `:nth-of-type` colours no longer reach inner pages.
- **One reading column.** Paragraphs, lists, tables share a centred 96ch column;
  paragraphs centred on desktop and left under 720px (§4), list text left inside
  the column. It never depends on which section a block happens to be in.
  *Readability note:* long medical articles read as centred paragraphs — a
  one-rule switch to left-aligned if the owner prefers.
- **One main image per page runs edge to edge.** The build marks the first
  landscape photo ≥700px wide (1.2–3.2:1) as `.lead`: a full-bleed band,
  `clamp(300px, 30vw, 460px)` tall, framed at 30% from the top so faces survive.
  Every other image shows at its own size — nothing is stretched. Six lead photos
  that would have rendered past 1.2× ship as faithful Real-ESRGAN upscales
  (`_tooling/fal/upscale.mjs`, face enhancement off), under their original names.
- **Breadcrumbs lead the hero copy**, so the hero is at the very top.
- **Forms are real forms.** `gravityForm()` rebuilds every source Gravity Form
  (labels, choices, options, sections at their source heading level, source
  `name=`s). Verify with `_tooling/preview/formparity.mjs` — 92/92 fields.
- **Contact band = the homepage visit band** (same h2 markup, same words);
  Contact page adds the Locate Us map; Hours & Location uses the Contact / Locate
  cards.
- **Logo walls**: centred last rows, logos at their own size, homepage card.
- **Footer (site-wide)**: on the band measure, one hairline, four columns, two
  link columns on phones.

Check every build with `_tooling/preview/seosweep.mjs <before> <after>` — heading
outline, links, alts and words on **all** pages, not just the homepage.

**Added by the final verification round (same day):**
- Hero contrast holds at **390, 768 and 1440** — tablets (641–1100px) use the phone's
  top-to-bottom scrim on inner pages. Measure text over any photo band with
  `_tooling/preview/sectioncontrast.mjs` (it samples glyph areas only; an element box
  includes a pill button's corners, where the page behind shows).
- Lead photos frame at 15% from the top and show **whole** on phones (natural height).
- Bold-paragraph pseudo-headings (`p.pseudo-head`, 143 on 38 pages) render as sub-heads;
  free-standing source sub-heads (`p.subhead`) at section-title scale.
- Short lists fit their text and centre in the column (no 600px holes).
- Keyboard focus: teal ring on light surfaces, warm white on dark ones.
- Every form posts to an **unwired** endpoint: `site.js` keeps the visitor on the page
  with a plain "call us" message instead of a 404. **Choosing a form service is the
  owner's call** — see the session-6 log.

**Added by the re-check of the final build (`direction.css` §22–25):**
- **A band per titled section.** `sectionize()` cuts at every `<h2>` and also at every
  top-level `<h3>` / `p.subhead` (never inside a list, table or wrapper, never between a
  heading and the sub-heading under it), so every section alternates `band-a` /
  `band-b`. A band holding only a heading leads the next one; a post's date heads its
  first text band, and its lead photo is a band of its own.
- **Pictures never past their own size** (figures, single-picture headings); only the
  `.lead` photo is full-bleed.
- **Section-level h4s are centred blocks**, not flex boxes (a mixed heading split in two).
- **A band's first heading adds no top margin** to the band's padding.
- **Rows with links**: a link in a flex row is blockified, so its 44px tap area comes
  from padding cancelled by an equal negative margin; the row keeps the text's height,
  and hairlines line up across columns (homepage visit band, inner contact band).
- **Underlines are `text-decoration`**, never a border that tap padding moves.
- **Breadcrumb separators** are drawn before the next item (they wrap with it).
- **Logo walls with no orphan row**: 4 logos go 2×2 below 900px; 21 go 7 per row.
- **The visit band's lead is centred** above its two lists (owner: every section head
  centred except Meet the Doctor and the hero).
- **Eye Exams on phones**: the photo is an unwashed band above copy on solid teal, as
  Emergency does.
- **Mega menu with five groups**: five columns in one row, 1000px, top-aligned.
- **Stale internal links resolve by slug** (the live site 301s them the same way), only
  when exactly one page has that slug.

## 6. Components

- **Quick actions** — full-bleed strip under the hero, 4 outlined tiles, 2px borders,
  inline SVG line icons stroked in `currentColor`.
- **Reviews** — teal cards, warm-white type, champagne quote mark. The native rail
  scrollbar is hidden and replaced by dot pagination built from the DOM in `site.js`;
  the rail still scrolls if the script does not run.
- **Blog cards** — white card, 1px teal hairline, uppercase teal date above a teal title,
  CTA pinned to the bottom with `margin-top: auto`.
- **Forms** — constrained to 860px and centred; full-band width stranded the label/field
  pairs. Field borders need ≥3:1 against their own ground: charcoal @0.60 on light
  (3.20), white @0.55 on teal (4.05).

## 7. Non-negotiables

1. **`site.css` is V1 and is never edited.** Every change is additive in `direction.css`.
2. **Win on specificity, not source order.** Four separate bugs in this project came from
   a low-specificity override losing to a higher-specificity V1 rule. State both weights
   in a comment when overriding.
3. **Content and structure are SEO-optimised and frozen.** No copy rewritten, no heading
   level changed, no link or `alt` dropped. Verify with
   `_tooling/preview/seoguard.mjs site-versions/baseline/index.html main/dist/index.html`
   — anchors, heading outline, title/meta/canonical and JSON-LD must stay level.
   **Read the diff lines, not the counts.** Session 5 reported "108 = 108 anchors,
   37 = 37 headings" and called it level while the location `h2` had lost its address;
   equal counts hid a changed heading. `_tooling/preview/seodelta.mjs` shows exactly
   which text moved or went missing. Restyle a frozen heading with a `<span>` inside
   it — never by moving part of its text out (see `.visit-band h2 .visit-addr`).
4. **Look at it.** `_tooling/preview/` has the server, slicer, metrics and verifier.
   Four sessions in a row ended with "still unverified: how it looks."

## 8. Known client-site defects (present on the live site, fixed here)

- `214-872-2401` is a **fax**, labelled "Phone" and wrapped in a `tel:` link in V1.
- "Eye Exams for the Whole Family" ships **twice** on the source page. The designed
  homepage keeps one copy; together with the hero lede the source also repeats, that
  accounts for the homepage's lower word count against `baseline/` — no unique sentence
  and no link target is lost (checked with `seodelta.mjs`, 2026-09-23).
- The Maps embed is **protocol-relative** (`//www.google.com/…`), so it breaks in any
  file-served copy. `_tooling/preview/standalone.mjs` now rewrites it to `https://`,
  and the build writes inner-page map embeds as `https://`.
- Designer Frames carried an HTML comment whose `--` WordPress turned into en dashes,
  so `<!–` and `–>` rendered as text. The build drops exactly those two fragments.
- The client re-posted two articles ("Welcome to our New Website", "Pink, Stinging
  Eyes?"): separate pages, separate dates, same titles. Both are listed, as on the
  live site.

## 9. Build defects fixed 2026-09-23 (not client defects — ours)

- **Double-escaped entities** — source text and attributes were escaped again at
  output: 74 breadcrumbs showed `&amp;`, a YouTube embed lost its `controls=0`
  parameter, two alts were garbled. Decoded once, escaped once.
- **Picture-only sections were silently dropped** — `sectionize()` discarded any
  section with no text, so the 404 page, Eye Emergencies and Kids Optical had lost
  photos since the first build. Found only because removing the `<!–` debris made
  Designer Frames lose its whole 21-logo brand wall.
- **Orphan `</a>`** — unwrapping a dead link left its closing tag behind.
- **No sitemap, no robots file** — `robots.txt`, `sitemap.xml` and `llms.txt` came
  from the session-1 hand-off, not the build, so every rebuild since session 5 deleted
  them. The build now writes all three, byte-identical to the committed versions
  (sitemap `lastmod` aside).
- **CMS spacers** — `<p>&nbsp;</p>` paragraphs (100px holes) and headings holding only
  `&nbsp;` (two on *The Right Way to Clean Your Glasses*) are dropped; they hold no words.
- **Glued heading words** — a CMS `&nbsp;` inside a heading made "retinopathy:
  nonproliferative" one 360px run at section-title size, 5px past a 390px phone. Inside
  headings it is now a plain space (seosweep: no text change), and `direction.css` §22
  breaks any run still too wide for the column (`overflow-wrap`), so no word can push a
  page sideways. `geosweep.mjs` at **360**, 390 and 1440 is the check.
