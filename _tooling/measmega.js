(function(){
  var t=document.querySelectorAll('.mega-trigger')[1]; t.click();
  var p=document.getElementById(t.getAttribute('aria-controls'));
  var g=p.querySelector('.mega-cols');
  var cols=[].slice.call(p.querySelectorAll('.mega-col'));
  var widest=null,max=0;
  p.querySelectorAll('.mega-col a').forEach(function(a){
    var w=a.getBoundingClientRect().width; if(w>max){max=w;widest=a.textContent.trim();}
  });
  return {
    gridCols:getComputedStyle(g).gridTemplateColumns,
    panelW:Math.round(p.getBoundingClientRect().width),
    colWidths:cols.map(function(c){return Math.round(c.getBoundingClientRect().width)}),
    widestLink:widest, widestLinkW:Math.round(max)
  };
})()
