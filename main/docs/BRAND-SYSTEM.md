# Brand system — measured palette, glass layer, type and motion

Every value here was **measured**, not chosen. `sr-capture` harvested computed style
from the live site in headless Chrome at 390 / 768 / 1024 / 1440 px; `sr-tokens`
reduced that to `src/styles/tokens.css`. The design baseline records
`evidence: computed (browser capture)` over 1,479 measured elements at desktop and
490 at mobile.

**Change values in `tokens.css`, never at a call site.** `site.css` contains zero
colour literals — 0 hex, 0 `rgb()`, 0 `hsl()` — and reads 87 tokens through `var()`.
That is enforced: `sr-gate` C13 fails an authored sheet whose colour literals
outnumber its token references.

---

## 1. Measured palette

| Token | Value | Role |
|---|---|---|
| `--c-1` | `#000000` | ink |
| `--c-2` | `#ffffff` | paper |
| `--c-4` | `#f4edf4` | lilac — the page canvas |
| `--c-6` | `#464451` | slate — body text |
| `--c-7` | `#ffd700` | gold — the single accent |
| `--c-8` | `#757575` | muted grey |
| `--c-9` | `#ff0000` | error |

The five brand channels are decomposed into RGB triplets (`--ch-ink`, `--ch-paper`,
`--ch-lilac`, `--ch-slate`, `--ch-gold`, plus `--ch-deep` for the dark surface) so
translucency can be composed from them without introducing a new colour.

## 2. The canvas — why v1's glass was invisible

**Glass is not a panel style. It is a relationship between a panel and what sits
behind it.** The first build put 86%-opaque panes on a near-white canvas (`#f4edf4`
with 0.16–0.20 alpha washes), so `backdrop-filter` had nothing to refract and every
pane rendered as a flat white card. The fix was mostly on the canvas.

The canvas is now five large, genuinely saturated radial orbs, `background-attachment:
fixed` so content floats over them, plus a 3.5%-opacity SVG grain that stops the big
gradients banding:

| Token | Hue | Position |
|---|---|---|
| `--orb-1` | violet 0.42 | top-left |
| `--orb-2` | gold 0.40 | top-right |
| `--orb-3` | orchid 0.30 | mid-right |
| `--orb-4` | amber 0.26 | lower-left |
| `--orb-5` | violet 0.30 | bottom |

`--ch-violet`, `--ch-orchid` and `--ch-amber` are **derived**, not invented: the
measured slate (`#464451`) is a desaturated violet-grey, pushed to full saturation for
the backdrop only. No new brand hue appears in any logo, button or text colour.

## 3. The glass layer

Two tiers, and the split is the rule:

| Tier | Token | Opacity | Use |
|---|---|---|---|
| **Pane** | `--glass-pane` | 0.74 | anything carrying body text |
| **Pane (strong)** | `--glass-pane-strong` | 0.86 | dense text, mega-menu, cards, reviews |
| **Veil** | `--glass-veil` | 0.46 | decorative chrome only — the header bar |
| **Deep** | `--glass-deep` / `-strong` | 0.74 / 0.92 | inverted surfaces (topbar, footer) |

**Text never sits on a veil.** Swapping those two tiers is the specific mistake that
makes a glass interface unreadable.

Three things make a surface read as glass rather than as a translucent rectangle:

1. **Blur + saturation** — `--glass-blur` 22px (soft 14, deep 34) at `saturate(180%)`,
   so colour from the orbs bleeds through and intensifies.
2. **A specular sheen** — `--glass-sheen`, a 135° highlight gradient painted over the
   pane colour. This is what reads as glass even in a still screenshot.
3. **A lit edge** — `--glass-inset`, a 1px inner highlight along the top.

**Depth is layered, never a single blur.** `--glass-shadow` stacks a 1px contact
shadow, a 6/16px mid shadow and a 20/44px ambient one; `--glass-shadow-lift` deepens
all three on hover. Primary CTAs additionally carry `--glow-accent`, a gold glow.

**Contrast was measured, not assumed.** Sampling real rendered pixels from the built
pages (`_tooling/contrast-check.mjs`, which reads the PNG and computes WCAG ratios):

| Element | Ratio | |
|---|---|---|
| Review body text | 6.04 | PASS AA |
| Review attribution | 10.96 | PASS AA |
| Aside heading | 17.06 | PASS AA |
| Fact label / value | 16.71 / 16.34 | PASS AA |
| Nav link | 16.88 | PASS AA |

**Fallback is mandatory, not optional.** A browser without `backdrop-filter` gets an
opaque pane via `@supports not (...)`, because the alternative is body text over a
saturated gradient with nothing between.

## 4. Type

`Raleway` — the source's own typeface, harvested from the live site and now
**self-hosted** from `fonts/` in 6 faces (300/400/700 × normal/italic). The source
loaded it from Google Fonts; a self-hosted copy removes a third-party request and a
render-blocking dependency.

The measured scale runs `--fs-1` 9.756px to `--fs-25` 36px. Headings use `clamp()`
between measured steps so they scale without new values:

```css
h1 { font-size: clamp(var(--fs-24), 4.6vw, var(--fs-25)); }
```

Body is `--fs-11` (16.8px), dropping to `--fs-10` (15.4px) under 640px. Line height
1.68; headings 1.15 with `-0.022em` tracking (`-0.03em` on the h1).

## 5. Space, geometry, motion

Spacing is the measured `--sp-1` (2px) … `--sp-25` (240px) scale. Radii are
`--r-sm` 12 / `--r-md` 18 / `--r-lg` 28 / `--r-xl` 36 / `--r-pill`. Shell is 1200px
with a 22px gutter. Every CTA shares the pill radius and every input echoes it at
`--r-md`, so the controls read as one family.

Motion: `--ease` `cubic-bezier(.22,.61,.36,1)` and `--ease-out`
`cubic-bezier(.16,1,.3,1)` for lifts, durations 140 / 260 / 520ms.
`motion.css` carries **90 keyframes verbatim** from the live capture — they are copied,
never retyped, because a retyped keyframe is a different animation.

**`prefers-reduced-motion` is honoured, and the source did not honour it.**
`audit/motion-inventory.json` records the gap explicitly: *"SOURCE HAS NO
prefers-reduced-motion BLOCK"*. Copying a site's motion does not mean copying its
accessibility gap.

## 6. Dark scheme

An addition — the source ships none. It lives entirely in the token layer, under
`@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`,
so it costs no per-component work. Declared as an `ADD` row in the change-control
ledger.

## 7. Touch targets

At ≤1100px every discrete link surface is a real 44×44 box. Links **inside a sentence**
get vertical padding instead, which grows the hit rectangle without disturbing the
line box — WCAG 2.2 SC 2.5.8 exempts inline targets for exactly that reason, and
enlarging them anyway is a genuine improvement. The first pass introduced 63
under-sized targets; the sweep now reports **0 blocker and 0 major introduced** across
all four breakpoints.
