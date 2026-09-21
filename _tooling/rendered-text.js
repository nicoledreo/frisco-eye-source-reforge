(function(){
  var m = document.querySelector('main') || document.body;
  var t = (m.innerText || '').replace(/\s+/g,' ').trim();
  return { url: location.href, viewport:{w:innerWidth,h:innerHeight},
           renderedMainChars: t.length,
           scripts: document.scripts.length,
           spaMount: !!document.querySelector('#root,#app,#__next,#__nuxt'),
           sample: t.slice(0,160) };
})()
