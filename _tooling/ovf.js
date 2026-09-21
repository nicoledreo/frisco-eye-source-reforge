(function(){
  var out=[];
  document.querySelectorAll('.mega-trigger').forEach(function(t){
    t.click();
    var p=document.getElementById(t.getAttribute('aria-controls'));
    p.querySelectorAll('.mega-col a, .mega-col h3').forEach(function(el){
      if(el.scrollWidth > el.clientWidth + 1){
        out.push({text:el.textContent.trim().slice(0,46), scroll:el.scrollWidth, client:el.clientWidth});
      }
    });
  });
  return {overflowing:out.length, items:out.slice(0,10)};
})()
