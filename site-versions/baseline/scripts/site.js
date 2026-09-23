/* Eye Source — nav + reveal. No framework, no tracker. */
(function () {
  var t = document.querySelector('.nav-toggle'), n = document.getElementById('primary-nav');
  if (t && n) t.addEventListener('click', function () {
    var open = n.classList.toggle('open');
    t.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  var triggers = document.querySelectorAll('.mega-trigger');
  Array.prototype.forEach.call(triggers, function (b) {
    var panel = document.getElementById(b.getAttribute('aria-controls'));
    if (!panel) return;
    function set(open) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); panel.hidden = !open; }
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = b.getAttribute('aria-expanded') !== 'true';
      Array.prototype.forEach.call(triggers, function (o) {
        if (o !== b) { o.setAttribute('aria-expanded', 'false');
          var p = document.getElementById(o.getAttribute('aria-controls')); if (p) p.hidden = true; }
      });
      set(open);
    });
    b.parentNode.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); b.focus(); } });
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.has-mega')) return;
    Array.prototype.forEach.call(triggers, function (o) {
      o.setAttribute('aria-expanded', 'false');
      var p = document.getElementById(o.getAttribute('aria-controls')); if (p) p.hidden = true;
    });
  });
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(els, function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  Array.prototype.forEach.call(els, function (el) { io.observe(el); });
})();
