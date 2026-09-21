import { readPNG } from 'file:///C:/Users/nicol/.claude/skills/site-reforge/scripts/lib/png.mjs';
const img = readPNG(process.argv[2]);
const box = JSON.parse(process.argv[3]);
const lum = ([r,g,b]) => { const f=c=>{c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const ratio=(a,b)=>{const L1=Math.max(lum(a),lum(b)),L2=Math.min(lum(a),lum(b));return (L1+0.05)/(L2+0.05);};
let worst=null, wl=-1;
for (let y=box.y; y<box.y+box.h; y++) for (let x=box.x; x<box.x+box.w; x++) {
  const i=(y*img.width+x)*4, p=[img.data[i],img.data[i+1],img.data[i+2]], L=lum(p);
  if (L>wl){wl=L;worst=p;}
}
const white=[255,255,255];
console.log('BRIGHTEST backdrop pixel behind the copy: rgb('+worst.join(',')+')');
console.log('WORST-CASE contrast for white text: ' + ratio(white,worst).toFixed(2) + '  ' + (ratio(white,worst)>=4.5?'PASS AA':(ratio(white,worst)>=3?'AA large text only':'FAIL')));
