#!/usr/bin/env node
// chromediff.mjs <a.html> <b.html> — compare the <header> and <footer> link sets of two pages.
import fs from 'node:fs';
const [, , A, B] = process.argv;
const grab = (f, tag) => {
  const h = fs.readFileSync(f, 'utf8');
  const m = h.match(new RegExp('<' + tag + '[\\s>][\\s\\S]*?</' + tag + '>', 'i'));
  return m ? m[0] : '';
};
const hrefs = (s) => [...s.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
for (const tag of ['header', 'footer']) {
  const ga = grab(A, tag), gb = grab(B, tag);
  const a = hrefs(ga), b = hrefs(gb);
  const sa = new Set(a), sb = new Set(b);
  console.log(`${tag}: A ${ga.length}B ${a.length} links (${sa.size} unique) | B ${gb.length}B ${b.length} links (${sb.size} unique)`);
  console.log('  only in A:', JSON.stringify([...sa].filter((x) => !sb.has(x))));
  console.log('  only in B:', JSON.stringify([...sb].filter((x) => !sa.has(x))));
  const ta = ga.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const tb = gb.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log('  visible text identical:', ta === tb, ta === tb ? '' : `(A ${ta.length} chars, B ${tb.length} chars)`);
}
