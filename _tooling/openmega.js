(function(){
  document.documentElement.style.scrollBehavior='auto';
  var t=document.querySelectorAll('.mega-trigger')[1];
  if(!t) return {ok:false};
  t.click();
  var p=document.getElementById(t.getAttribute('aria-controls'));
  var r=p.getBoundingClientRect();
  var heads=[].slice.call(p.querySelectorAll('h3'));
  var overlap=false;
  for(var i=0;i<heads.length;i++)for(var j=i+1;j<heads.length;j++){
    var a=heads[i].getBoundingClientRect(),b=heads[j].getBoundingClientRect();
    if(a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom) overlap=true;
  }
  return {ok:true,panel:Math.round(r.width)+'x'+Math.round(r.height),headings:heads.length,headingOverlap:overlap};
})()
