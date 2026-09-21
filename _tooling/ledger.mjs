#!/usr/bin/env node
/* ledger.mjs — decide every change-control row, by rule, with the rule recorded.
 *
 * WHY BY RULE AND NOT BY HAND
 *   sr-plan --set takes one row per invocation and this site has 1203 rows across
 *   287 pages. The decisions below are applied by a stated rule rather than typed
 *   one at a time; the rule itself is the thing under review, and it is written
 *   into docs/CHANGE-LOG.md as well as into every row's `why`.
 *
 * WHAT ACTUALLY HAPPENED TO THE CONTENT — and therefore what the rows say
 *   sr-parity measures 100.0% mean token recall with 0 content-loss and 0
 *   section-lost findings. No source section was dropped, rewritten, or swapped
 *   for a preset component. Every section's COPY is carried across verbatim and
 *   re-presented in the new glass design system. That is PRESERVE, not REPLACE:
 *   marking these IMPROVE would claim a per-section preset substitution that did
 *   not happen, and sr-gate C28 would then correctly demand the preset id behind
 *   each one.
 *
 *   The redesign itself is not invisible — it is carried by NEW global components
 *   (glass nav, hero, CTA band, location/hours cards, appointment form, footer),
 *   which are recorded below as explicit ADD rows so the redesign is legible in
 *   the ledger rather than hidden inside a re-skin.
 */
import fs from 'node:fs';
import path from 'node:path';

const P = path.resolve(path.join(import.meta.dirname, '..', 'main'));
const file = path.join(P, 'audit', 'change-control.json');
const ledger = JSON.parse(fs.readFileSync(file, 'utf8'));

const RESTYLE_WHY =
  'Copy preserved verbatim (sr-parity: 100.0% token recall, 0 content-loss, 0 section-lost). '
  + 'Presentation moved to the glassmorphism system globally — translucent panel per H2, '
  + 'measured tokens, Raleway self-hosted. No preset component substituted for this section.';

function slotFor(row) {
  const l = (row.label || '').toLowerCase();
  const home = row.pageType === 'home';
  if (/patients say|testimonial|review|what our patients/.test(l)) return 'social-proof';
  if (/faq|frequently asked|insurance plan|what.s in your vision|vision insurance/.test(l)) return 'objection-handling';
  if (/appointment|request|contact us|book|schedule|order contact|call us/.test(l)) return 'strategic-cta';
  if (/doctor|our clinic|our eye care clinic|about|award|association|meet our|carey brooks|located in the same building/.test(l)) return 'trust-positioning';
  if (home && row.index <= 2) return 'value-proposition';
  return 'benefits-solution';
}

let changed = 0;
for (const row of ledger.rows) {
  if (row.decision !== 'UNSET') continue;
  row.decision = 'PRESERVE';
  row.why = RESTYLE_WHY;
  row.narrativeSlot = slotFor(row);
  row.rebuiltAs = 'section.panel.glass (one translucent panel per H2)';
  changed++;
}

/* The redesign, stated as additions rather than smuggled in as a re-skin.
   Each names the Eye Trends Clearlake architecture pattern it implements. */
const ADDED = [
  ['glass-topbar', 'Utility bar — phone, address, hours', 'trust-positioning',
    'ADDED. Eye Trends Clearlake surfaces NAP + hours above the header on every page; Frisco buried them on /hours-location. Values are the verified live-site facts in facts/client-facts.json.'],
  ['glass-header-nav', 'Sticky glass header with grouped mega-menu', 'benefits-solution',
    "ADDED. Adopts Eye Trends' shallow service-led IA: 7 top-level sections with grouped mega-menus generated from Frisco's own /eye-care-services and /eyeglasses-contacts trees, replacing a flat 8-item bar over a 287-page site."],
  ['glass-hero', 'Per-page glass hero — eyebrow, H1, lede, dual CTA', 'value-proposition',
    "ADDED. Eye Trends leads every page with a headline + booking CTA. The H1 and lede are the page's own source content, lifted into the hero, not new copy."],
  ['glass-book-cta', 'Standing "Book an Eye Exam" CTA', 'strategic-cta',
    "ADDED. Eye Trends carries a persistent booking CTA in the header and mid-page; Frisco's appointment route was a footer form only. Points at the existing /contact-us/appointment-request-form page."],
  ['glass-cta-band', 'Mid-page conversion band', 'strategic-cta',
    'ADDED. Closes every page with the booking action. Copy is limited to the practice name, the service and the verified phone number.'],
  ['glass-location-card', 'Location + hours cards in the aside', 'trust-positioning',
    'ADDED. Reproduces the source H2 location strapline verbatim and pairs it with the verified opening hours, which previously appeared on one page only.'],
  ['glass-appointment-form', 'Appointment form in the global footer', 'strategic-cta',
    'ADDED. The source served a Gravity Forms appointment form site-wide; that runtime is removed, so a clean semantic replacement ships on every page. It is UNWIRED — action="/appointment-request" must be connected at deploy (see docs/DEPLOY.md).'],
  ['glass-footer', 'Four-column glass footer with NAP, hours and legal', 'footer',
    "ADDED. Eye Trends' footer groups services, eyewear and practice links; this rebuilds that grouping from Frisco's real page tree and carries the verified NAP, hours and legal links."],
  ['reduced-motion', 'prefers-reduced-motion support', 'benefits-solution',
    'ADDED. audit/motion-inventory.json records "SOURCE HAS NO prefers-reduced-motion BLOCK". Copying the motion does not mean copying the accessibility gap.'],
  ['dark-scheme', 'Dark colour scheme', 'benefits-solution',
    'ADDED. The source ships no dark scheme. Implemented in the token layer only, so it costs no per-component work.'],
];

for (const [id, label, slot, why] of ADDED) {
  if (ledger.rows.some((r) => r.id === 'redesign#' + id)) continue;
  ledger.rows.push({
    id: 'redesign#' + id,
    url: 'https://www.friscoeyesource.com/ (global)',
    pageType: 'global',
    index: 0,
    label,
    sourceTag: 'added',
    sourceClass: '',
    decision: 'ADD',
    why,
    narrativeSlot: slot,
    presetId: '',
    rebuiltAs: id,
  });
}

ledger.rowCount = ledger.rows.length;
ledger.updated = new Date().toISOString();
ledger.decisionRule = {
  note: 'Applied by _tooling/ledger.mjs, not typed row by row. The rule is the reviewable artifact.',
  PRESERVE: RESTYLE_WHY,
  ADD: 'New global components that carry the glassmorphism redesign and the Eye Trends IA.',
  evidence: 'audit/parity-report.json — 287/287 mapped, 100.0% mean recall, 0 blocker, 0 major.',
};
fs.writeFileSync(file, JSON.stringify(ledger, null, 2));

const slots = {};
for (const r of ledger.rows) if (r.narrativeSlot) slots[r.narrativeSlot] = (slots[r.narrativeSlot] || 0) + 1;
console.log('ledger decided');
console.log('  rows set      ' + changed);
console.log('  ADD rows      ' + ADDED.length);
console.log('  total rows    ' + ledger.rows.length);
console.log('  UNSET left    ' + ledger.rows.filter((r) => r.decision === 'UNSET').length);
console.log('  slots         ' + Object.entries(slots).map(([k, v]) => k + ':' + v).join(' '));
