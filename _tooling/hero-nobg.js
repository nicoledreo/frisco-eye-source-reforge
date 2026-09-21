(function(){
  var st=document.createElement('style');
  /* hide the TEXT only, keep the panel so we measure the real backdrop */
  st.textContent='.hero-copy > *{visibility:hidden!important}*{transition:none!important}';
  document.head.appendChild(st);
  var c=document.querySelector('.hero-copy').getBoundingClientRect();
  return {x:Math.round(c.x)+14,y:Math.round(c.y)+14,w:Math.round(c.width)-28,h:Math.round(c.height)-28};
})()
