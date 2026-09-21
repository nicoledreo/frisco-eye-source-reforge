// Sample real rendered pixels and compute WCAG contrast for text on glass.
import { readPNG } from 'file:///C:/Users/nicol/.claude/skills/site-reforge/scripts/lib/png.mjs';
const img = readPNG(process.argv[2]);
const px = (x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i+1], img.data[i+2]]; };
const lum = ([r,g,b]) => { const f = c => { c/=255; return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const ratio = (a,b) => { const L1=Math.max(lum(a),lum(b)), L2=Math.min(lum(a),lum(b)); return (L1+0.05)/(L2+0.05); };

// Sample regions given as x,y,label — pick the LIGHTEST pixel in a small patch
// (the card surface) and the DARKEST (the glyph) to get the real pair.
const spots = JSON.parse(process.argv[3]);
for (const s of spots) {
  let light=[0,0,0], dark=[255,255,255], lmax=-1, dmin=2;
  for (let y=s.y; y<s.y+s.h; y++) for (let x=s.x; x<s.x+s.w; x++) {
    const p = px(x,y), L = lum(p);
    if (L>lmax){lmax=L;light=p;} if (L<dmin){dmin=L;dark=p;}
  }
  const r = ratio(light,dark);
  console.log(s.label.padEnd(28), 'surface rgb('+light.join(',')+')  text rgb('+dark.join(',')+')  ratio ' + r.toFixed(2) + '  ' + (r>=4.5?'PASS AA':(r>=3?'AA large only':'FAIL')));
}
