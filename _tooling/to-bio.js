(function(){
  document.documentElement.style.scrollBehavior='auto';
  document.querySelectorAll('.reveal').forEach(function(e){e.classList.add('in');});
  var el=document.querySelector('.bio');
  if(!el) return {found:false};
  window.scrollTo(0, el.getBoundingClientRect().top + window.pageYOffset - 110);
  var r=document.querySelector('.reviews');
  return {found:true, bioCols:getComputedStyle(el).gridTemplateColumns,
    reviewsScrollW:r?r.scrollWidth:0, reviewsClientW:r?r.clientWidth:0,
    cardHeights:[].slice.call(document.querySelectorAll('.review')).map(function(c){return Math.round(c.getBoundingClientRect().height)})};
})()
