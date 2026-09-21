(function(){
  document.documentElement.style.scrollBehavior='auto';
  var st=document.createElement('style');
  st.textContent='*,*::before,*::after{transition:none!important;animation:none!important}.reveal{opacity:1!important;transform:none!important}';
  document.head.appendChild(st);
  var el=document.querySelector('.daylist');
  if(!el) return {found:false};
  window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 200);
  return {found:true, cols:getComputedStyle(el).gridTemplateColumns, items:el.querySelectorAll('li').length,
    h:Math.round(el.getBoundingClientRect().height)};
})()
