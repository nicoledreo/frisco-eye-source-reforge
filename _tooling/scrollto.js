(function(){
  document.documentElement.style.scrollBehavior='auto';
  var g=document.querySelector('.figgrid');
  if(!g) return {found:false};
  var y=g.getBoundingClientRect().top + window.pageYOffset - 90;
  window.scrollTo(0,y);
  return {found:true, scrolledTo:Math.round(window.pageYOffset),
    cols:getComputedStyle(g).gridTemplateColumns};
})()
