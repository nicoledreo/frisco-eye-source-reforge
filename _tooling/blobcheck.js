(function(){
  return new Promise(function(res){
    var els=[].slice.call(document.querySelectorAll('.bg-blobs span'));
    if(!els.length) return res({found:0});
    var t0=els.map(function(e){return getComputedStyle(e).transform;});
    var anims=document.getAnimations?document.getAnimations().length:-1;
    setTimeout(function(){
      var t1=els.map(function(e){return getComputedStyle(e).transform;});
      var moved=t0.filter(function(v,i){return v!==t1[i];}).length;
      res({found:els.length, running:anims, moved:moved,
        layer:getComputedStyle(document.querySelector('.bg-blobs')).zIndex,
        sample0:t0[0], sample1:t1[0]});
    },1200);
  });
})()
