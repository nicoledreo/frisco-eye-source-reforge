(function(){
  document.documentElement.style.scrollBehavior='auto';
  var st=document.createElement('style');
  st.textContent='*,*::before,*::after{transition:none!important;animation:none!important}.reveal{opacity:1!important;transform:none!important}';
  document.head.appendChild(st);
  var el=document.querySelector('.postlist');
  if(!el) return {found:false};
  window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 140);
  return {found:true};
})()
