(function(){
  document.documentElement.style.scrollBehavior='auto';
  document.querySelectorAll('.reveal').forEach(function(e){e.classList.add('in');});
  var el=document.querySelector('.figgrid');
  if(!el) return {found:false};
  window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 100);
  return {found:true, h:Math.round(el.getBoundingClientRect().height)};
})()
