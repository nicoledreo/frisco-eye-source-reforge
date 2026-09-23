/* Inline a version folder into ONE portable .html file.
 * Usage: node standalone.mjs <src-dir> <out-file> */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const dataUri = rel => {
  const f = path.join(SRC, rel);
  if (!fs.existsSync(f)) { console.log('  !! missing: ' + rel); return null; }
  const ext = path.extname(f).toLowerCase();
  return 'data:' + (MIME[ext] || 'application/octet-stream') + ';base64,' + fs.readFileSync(f).toString('base64');
};

let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

/* ---- stylesheets -> one <style>, fonts -> data URIs ------------------- */
const sheets = [...html.matchAll(/<link[^>]+href="(styles\/[^"]+\.css)"[^>]*>/g)];
let css = '';
let droppedItalics = 0;
for (const [, href] of sheets) {
  let txt = fs.readFileSync(path.join(SRC, href), 'utf8');
  // Nothing in this page sets font-style:italic and there are no <em>/<i>
  // tags, so the three italic faces are dead weight (~410 KB).
  txt = txt.replace(/@font-face\{[^}]*font-style:italic[^}]*\}/g, () => { droppedItalics++; return ''; });
  txt = txt.replace(/url\('\.\.\/([^']+)'\)/g, (m, rel) => {
    const d = dataUri(rel);
    return d ? "url('" + d + "')" : m;
  });
  css += '\n/* ===== ' + href + ' ===== */\n' + txt;
}
html = html.replace(/<link[^>]+href="styles\/[^"]+\.css"[^>]*>\s*/g, '');
html = html.replace(/<\/head>/, '<style>' + css + '\n</style>\n</head>');

/* ---- images -> data URIs --------------------------------------------- */
let imgs = 0;
html = html.replace(/(src|href)="(assets\/[^"]+)"/g, (m, attr, rel) => {
  const d = dataUri(rel);
  if (!d) return m;
  imgs++;
  return attr + '="' + d + '"';
});

/* ---- script -> inline ------------------------------------------------- */
html = html.replace(/<script[^>]+src="(scripts\/[^"]+)"[^>]*><\/script>/g, (m, rel) => {
  const f = path.join(SRC, rel);
  return fs.existsSync(f) ? '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>' : m;
});

/* ---- protocol-relative URLs -> https ----------------------------------
 * The Google Maps embed ships as src="//www.google.com/...". Over http that
 * resolves fine, which is why every headless capture of the served page showed
 * a working map. In THIS file - which is opened off disk - the page origin is
 * file://, so "//www.google.com" resolves to file://www.google.com and the
 * iframe renders as a broken-document icon.
 * The site-versions README has always claimed this rewrite happened; it did
 * not. The leftover-refs check below missed it too, because that regex only
 * matches asset file extensions and an embed URL has none. Both fixed.
 */
let protoRel = 0;
html = html.replace(/(src|href)="\/\/([^"]+)"/g, (m, attr, rest) => {
  protoRel++;
  return attr + '="https://' + rest + '"';
});

fs.writeFileSync(OUT, html);

const leftover = [...html.matchAll(/(?:src|href)="(?!data:|https?:|#|mailto:|tel:)([^"]+\.(?:css|js|png|jpe?g|svg|webp|ttf|woff2?))"/g)].map(m => m[1]);
const stillRelative = [...html.matchAll(/(?:src|href)="(\/\/[^"]+)"/g)].map(m => m[1]);
console.log('  images inlined     :', imgs);
console.log('  stylesheets inlined:', sheets.length);
console.log('  italic faces dropped:', droppedItalics);
console.log('  protocol-relative -> https:', protoRel);
console.log('  still protocol-relative:', stillRelative.length, stillRelative.length ? JSON.stringify(stillRelative) : '(none)');
console.log('  leftover external refs:', leftover.length, leftover.length ? JSON.stringify(leftover) : '(none)');
console.log('  OUT:', OUT);
console.log('  size:', (fs.statSync(OUT).size / 1048576).toFixed(2), 'MB');
