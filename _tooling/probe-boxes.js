(function(){
  var out={url:location.href, panels:[], brokenImgs:[]};
  document.querySelectorAll('.prose > section.panel').forEach(function(p,i){
    var r=p.getBoundingClientRect();
    var txt=(p.innerText||'').trim();
    out.panels.push({i:i, h:Math.round(r.height), textLen:txt.length,
      imgs:p.querySelectorAll('img').length, first:txt.slice(0,45)});
  });
  document.querySelectorAll('img').forEach(function(im){
    if(!im.complete || im.naturalWidth===0){
      out.brokenImgs.push({src:im.getAttribute('src'), alt:im.alt});
    }
  });
  var shop=[].slice.call(document.querySelectorAll('.prose section')).filter(function(s){
    return /Designer Optical Shop/i.test(s.textContent);})[0];
  if(shop){
    out.shopChildren=[].slice.call(shop.children).map(function(c){
      var r=c.getBoundingClientRect();
      return c.tagName+' '+Math.round(r.width)+'x'+Math.round(r.height);});
  }
  return out;
})()
