(function(){
  var out = {url: location.href, viewport:{w:innerWidth}};
  var trig = document.querySelector('.mega-trigger');
  var panel = trig && document.getElementById(trig.getAttribute('aria-controls'));
  out.megaFound = !!trig;
  if (trig && panel) {
    out.beforeHidden = panel.hidden;
    out.beforeExpanded = trig.getAttribute('aria-expanded');
    trig.click();
    out.afterHidden = panel.hidden;
    out.afterExpanded = trig.getAttribute('aria-expanded');
    var r = panel.getBoundingClientRect();
    out.panelBox = Math.round(r.width) + 'x' + Math.round(r.height);
    out.panelLinks = panel.querySelectorAll('a').length;
  }
  var tog = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');
  out.toggleVisible = tog ? getComputedStyle(tog).display !== 'none' : false;
  if (tog && nav && out.toggleVisible) {
    out.navBefore = getComputedStyle(nav).display;
    tog.click();
    out.navAfter = getComputedStyle(nav).display;
    out.navExpanded = tog.getAttribute('aria-expanded');
  }
  out.jsErrors = window.__errs || [];
  return out;
})()
