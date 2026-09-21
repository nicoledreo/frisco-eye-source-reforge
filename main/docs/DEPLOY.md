# Deploying this build

Static files. Any host that serves a directory will serve this: Netlify, Cloudflare
Pages, S3 + CloudFront, Nginx, Apache, GitHub Pages.

```
dist/    <- upload this directory as the site root
```

No build step, no Node runtime, no database, no environment variables.

---

## 1. Before anything else — wire the appointment form

**The form does not submit.** The source site ran Gravity Forms on WordPress; that
runtime is removed, and nothing replaced it because a static build has no backend.

Every page carries this form in the footer:

```html
<form class="footer-form" method="post" action="/appointment-request" data-sr-endpoint="unwired">
```

`data-sr-endpoint="unwired"` marks all 287 of them. Point `action` at a real handler
before launch — a form service (Formspree, Basin, Netlify Forms), a serverless
function, or the practice's own endpoint — and add the spam control and the
confirmation page that go with it.

Until that is done the practice's only working contact routes on this build are the
phone link (`tel:+12148722400`) and the email link, both of which work today.

> Patient enquiries can carry health information. Whatever endpoint you choose must be
> one the practice is willing to receive PHI on, and the source site's own notice —
> "Do not send personal health information by email" — still applies.

---

## 2. URL shape — decide before you point DNS

This build serves `/eye-care-services/eye-exams.html`. The live site serves
`/eye-care-services/eye-exams/`. `sr-seo` records this as
`url-shape-changed — 286 of 287 URLs changed shape`.

That is harmless while this build stands **beside** the original. It is a
ranking-losing event if it **replaces** the original at the same domain without
redirects. Two ways to handle it:

**(a) Serve extensionless** — preferred. Most hosts can do this with no file changes:

| Host | Setting |
|---|---|
| Netlify / Cloudflare Pages | "Pretty URLs" / clean URLs — on by default |
| Nginx | `try_files $uri $uri.html $uri/ =404;` |
| Apache | `Options +MultiViews` or a `RewriteRule` |
| S3 + CloudFront | A CloudFront Function appending `.html` to extensionless paths |

**(b) Emit a redirect map** — re-run the SEO stage with `--migrating` to generate one,
then load it into the host.

Canonicals in the build already point at the live `https://www.friscoeyesource.com/...`
URLs, so whichever route you take, the canonical target stays stable.

---

## 3. Known-dead links on the live site

The crawl found **17 URLs that 404 on friscoeyesource.com today**, including
`/privacy-policy`, `/our-eye-doctors`, `/sitemap` and several service pages. They are
listed in `audit/failures.json`, each marked `accepted` with its reason.

This build does not reproduce those dead links: any link pointing at one was dropped
rather than shipped pointing at a 404. **The pages themselves still do not exist.**
If the practice wants them, the content has to be written — it was never captured
because it was never served.

One same-origin image (`/clipart/people/clipart-048.jpg`) and five CDN images also
404 or return 403 at origin. Re-supply them from the client media library to restore
those slots.

---

## 4. Performance notes before launch

`audit/image-optimisation.json` records 197 images in the build, **190 still in legacy
formats** (JPEG/PNG/GIF) and 6 over 300 KB. No WebP conversion was performed because
`cwebp` is not on this machine's PATH — that is a report, not a failure. With `cwebp`
installed:

```
node <skill>/scripts/sr-images.mjs --project . --apply
```

It converts and rewrites every reference. Expect a substantial payload reduction;
the build is otherwise already lazy-loading every below-the-fold image and shipping
~2 KB of JavaScript.

Fonts are self-hosted as TTF (that is what the source served). Subsetting them to
WOFF2 is the other easy win.

---

## 5. What to check after the first deploy

- [ ] The appointment form submits and reaches a real inbox
- [ ] Extensionless URLs resolve, or redirects are live
- [ ] `sitemap.xml` and `robots.txt` reachable at the domain root
- [ ] Analytics **re-added deliberately**, under the practice's own account — the
      source's Google Tag Manager (`GTM-P6GSK34`) and GA4 (`G-X3KB7BC4JD`) were
      stripped on purpose, because a copied container reports this site's visitors
      into the original owner's property
- [ ] Google Business Profile and schema still point at the right address
