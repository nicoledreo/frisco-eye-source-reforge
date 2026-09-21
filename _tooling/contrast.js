(function(){
  // sample the scrim alpha behind the lede by reading computed colours
  var l=document.querySelector('.hero-lede'), h=document.querySelector('.hero-inner h1');
  var r=l?l.getBoundingClientRect():null;
  return {
    ledeColor:l?getComputedStyle(l).color:null,
    h1Color:h?getComputedStyle(h).color:null,
    ledeRight:r?Math.round(r.right):null,
    heroRight:Math.round(document.querySelector('.hero-inner').getBoundingClientRect().right),
    ledeMaxW:l?getComputedStyle(l).maxWidth:null
  };
})()
