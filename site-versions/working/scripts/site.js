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

/* ── reviews rail: dot pagination ─────────────────────────────────────────
   The rail is a horizontal scroll-snap strip. Its native scrollbar read as a
   stray grey line under the cards, so it is hidden in CSS and replaced by
   dots. One dot per reachable scroll STOP, not per card: at 1440 four cards
   fit, so seven card-dots left dots 5-7 unable to ever become current
   (measured 2026-09-23). Stops are rebuilt on resize. If this script does not
   run the rail still scrolls normally — the dots are an enhancement, not the
   mechanism. */
(function () {
  var rail = document.querySelector('.sec-reviews .reviews');
  if (!rail) return;
  var cards = Array.prototype.slice.call(rail.querySelectorAll('.review'));
  if (cards.length < 2) return;

  var dots = document.createElement('div');
  dots.className = 'reviews-dots';
  dots.setAttribute('role', 'group');
  dots.setAttribute('aria-label', 'Patient reviews');
  rail.parentNode.insertBefore(dots, rail.nextSibling);

  var stops = [], buttons = [], tick = null;
  function sync() {
    // nearest stop to the current scroll position wins
    var best = 0, bestD = Infinity;
    for (var i = 0; i < stops.length; i++) {
      var d = Math.abs(stops[i] - rail.scrollLeft);
      if (d < bestD) { bestD = d; best = i; }
    }
    for (var j = 0; j < buttons.length; j++) {
      buttons[j].setAttribute('aria-current', j === best ? 'true' : 'false');
    }
  }
  function build() {
    var max = rail.scrollWidth - rail.clientWidth;
    stops = [];
    cards.forEach(function (card) {
      var x = Math.min(card.offsetLeft - rail.offsetLeft, max);
      if (!stops.length || x - stops[stops.length - 1] > 2) stops.push(x);
    });
    dots.innerHTML = '';
    buttons = stops.map(function (x, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Reviews, page ' + (i + 1) + ' of ' + stops.length);
      b.addEventListener('click', function () {
        rail.scrollTo({ left: x, behavior: 'smooth' });
      });
      dots.appendChild(b);
      return b;
    });
    dots.hidden = stops.length < 2;
    sync();
  }
  rail.addEventListener('scroll', function () {
    if (tick) return;
    tick = requestAnimationFrame(function () { tick = null; sync(); });
  }, { passive: true });
  var rt = null;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 150); });
  build();
})();

/* ── reviews rail: pointer drag ───────────────────────────────────────────
   The rail already scrolls with a trackpad or a touch swipe. This adds
   click-and-drag with a mouse, which desktop users expect from a carousel and
   which the scrollbar removal took away. Pointer Events cover mouse, touch and
   pen in one path. A drag that moves more than a few pixels suppresses the
   click so dragging across a card does not follow its link. */
(function () {
  var rail = document.querySelector('.sec-reviews .reviews');
  if (!rail || !window.PointerEvent) return;

  var down = false, startX = 0, startScroll = 0, moved = 0, pid = null;

  rail.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    down = true; moved = 0; pid = e.pointerId;
    startX = e.clientX;
    startScroll = rail.scrollLeft;
    rail.classList.add('is-dragging');
  });

  rail.addEventListener('pointermove', function (e) {
    if (!down || e.pointerId !== pid) return;
    var dx = e.clientX - startX;
    if (Math.abs(dx) > 3 && rail.setPointerCapture) {
      try { rail.setPointerCapture(pid); } catch (err) {}
    }
    moved = Math.max(moved, Math.abs(dx));
    rail.scrollLeft = startScroll - dx;
  });

  function release(e) {
    if (!down || (e && e.pointerId !== pid)) return;
    down = false;
    rail.classList.remove('is-dragging');
    if (rail.releasePointerCapture && pid !== null) {
      try { rail.releasePointerCapture(pid); } catch (err) {}
    }
    pid = null;
    // snap to the nearest card once the finger is off
    var cards = rail.querySelectorAll('.review');
    if (!cards.length) return;
    var best = cards[0], bestD = Infinity;
    for (var i = 0; i < cards.length; i++) {
      var d = Math.abs((cards[i].offsetLeft - rail.offsetLeft) - rail.scrollLeft);
      if (d < bestD) { bestD = d; best = cards[i]; }
    }
    rail.scrollTo({ left: best.offsetLeft - rail.offsetLeft, behavior: 'smooth' });
  }

  rail.addEventListener('pointerup', release);
  rail.addEventListener('pointercancel', release);
  rail.addEventListener('pointerleave', release);

  // a real drag must not also fire the card's link
  rail.addEventListener('click', function (e) {
    if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; }
  }, true);

  rail.addEventListener('dragstart', function (e) { e.preventDefault(); });
})();

/* ── menus: keyboard ────────────────────────────────────────────────────────
   A mega panel stayed open over the page while a keyboard user tabbed on past it;
   it now closes when focus moves to anything outside it. (A mouse click outside
   is already handled above.) Escape also closes the phone menu. */
(function () {
  var items = document.querySelectorAll('.has-mega');
  Array.prototype.forEach.call(items, function (li) {
    li.addEventListener('focusout', function (e) {
      if (!e.relatedTarget || li.contains(e.relatedTarget)) return;
      var b = li.querySelector('.mega-trigger');
      var p = b && document.getElementById(b.getAttribute('aria-controls'));
      if (b && p) { b.setAttribute('aria-expanded', 'false'); p.hidden = true; }
    });
  });
  var t = document.querySelector('.nav-toggle'), n = document.getElementById('primary-nav');
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !t || !n || !n.classList.contains('open')) return;
    n.classList.remove('open');
    t.setAttribute('aria-expanded', 'false');
    t.focus();
  });
  /* A tap outside the open phone menu closes it; only the toggle or Escape did,
     so it stayed open over the page. Taps inside the menu or on the toggle pass. */
  document.addEventListener('click', function (e) {
    if (!t || !n || !n.classList.contains('open')) return;
    if (n.contains(e.target) || t.contains(e.target)) return;
    n.classList.remove('open');
    t.setAttribute('aria-expanded', 'false');
  });
})();

/* ── forms without a backend ────────────────────────────────────────────────
   This is a static site: every form posts to an endpoint that does not exist yet
   (data-sr-endpoint="unwired"), so a filled-in, valid submission ended on a 404
   page. Until a form service is chosen, a submit keeps the visitor on the page,
   keeps everything they typed, and says plainly what to do instead. The browser's
   own required-field checks still run first. */
(function () {
  var forms = document.querySelectorAll('form[data-sr-endpoint="unwired"]');
  Array.prototype.forEach.call(forms, function (f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = f.querySelector('.form-status');
      if (!note) {
        note = document.createElement('p');
        note.className = 'form-status';
        note.setAttribute('role', 'status');
        note.setAttribute('tabindex', '-1');
        f.appendChild(note);
      }
      note.textContent = 'Online requests are not connected yet, so this form was not sent. Please call us at 214-872-2400 and we will take care of you.';
      note.focus();
    });
  });
})();
