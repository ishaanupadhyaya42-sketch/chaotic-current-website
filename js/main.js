/* ---------- scroll reveal (staggered) ---------- */
const reveals = document.querySelectorAll('.reveal');
function staggerDelay(el) {
  const siblings = Array.from(el.parentElement.children).filter(c => c.classList.contains('reveal'));
  const idx = siblings.indexOf(el);
  return Math.min(idx * 70, 420);
}
function revealEl(el) {
  el.style.transitionDelay = staggerDelay(el) + 'ms';
  el.classList.add('in');
  const counter = el.hasAttribute('data-count') ? el : el.querySelector('[data-count]');
  if (counter) animateCount(counter);
}
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => {
    es.forEach(e => { if (e.isIntersecting) { revealEl(e.target); io.unobserve(e.target); } });
  }, { threshold: .12 });
  reveals.forEach(el => io.observe(el));
} else {
  reveals.forEach(revealEl);
}
/* safety: nothing stays invisible for more than 6s */
setTimeout(() => reveals.forEach(el => { if (!el.classList.contains('in')) revealEl(el); }), 6000);

/* ---------- animated count-up for numeric stats ---------- */
function animateCount(el) {
  const target = parseFloat(el.getAttribute('data-count'));
  const suffix = el.getAttribute('data-suffix') || '';
  const decimals = el.getAttribute('data-count').includes('.') ? 1 : 0;
  const duration = 1100;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target.toFixed(decimals) + suffix;
  }
  requestAnimationFrame(tick);
}

/* ---------- ambient background lightning (runs on every page, purple/white only) ---------- */
(function () {
  const ambCv = document.createElement('canvas');
  ambCv.id = 'ambientBolts';
  document.body.prepend(ambCv);
  const ctx = ambCv.getContext('2d');
  let AW, AH, ADPR;
  function ambSize() {
    ADPR = Math.min(devicePixelRatio || 1, 2);
    AW = ambCv.width = innerWidth * ADPR; AH = ambCv.height = innerHeight * ADPR;
    ambCv.style.width = innerWidth + 'px'; ambCv.style.height = innerHeight + 'px';
  }
  ambSize(); addEventListener('resize', ambSize);

  function ambJag(x1, y1, x2, y2, d) {
    if (d < 8 * ADPR) return [[x1, y1], [x2, y2]];
    const mx = (x1 + x2) / 2 + (Math.random() - .5) * d, my = (y1 + y2) / 2 + (Math.random() - .5) * d;
    return ambJag(x1, y1, mx, my, d / 2).slice(0, -1).concat(ambJag(mx, my, x2, y2, d / 2));
  }
  let ambBolts = [];
  function addAmbBolt() {
    // enters from a random screen edge and cuts across toward the opposite side
    const side = Math.floor(Math.random() * 4);
    let sx, sy, ex, ey;
    if (side === 0) { sx = Math.random() * AW; sy = -20 * ADPR; ex = Math.random() * AW; ey = AH * (.4 + Math.random() * .6); }
    else if (side === 1) { sx = Math.random() * AW; sy = AH + 20 * ADPR; ex = Math.random() * AW; ey = AH * (0 + Math.random() * .6); }
    else if (side === 2) { sx = -20 * ADPR; sy = Math.random() * AH; ex = AW * (.4 + Math.random() * .6); ey = Math.random() * AH; }
    else { sx = AW + 20 * ADPR; sy = Math.random() * AH; ex = AW * (0 + Math.random() * .6); ey = Math.random() * AH; }
    const pts = ambJag(sx, sy, ex, ey, Math.hypot(ex - sx, ey - sy) * .3);
    const branches = [];
    const branchCount = 1 + Math.floor(Math.random() * 3);
    for (let b = 0; b < branchCount; b++) {
      const i = 2 + Math.floor(Math.random() * Math.max(1, pts.length - 4));
      const [bx, by] = pts[i] || pts[0];
      const a = Math.atan2(ey - sy, ex - sx) + (Math.random() - .5) * 2;
      const bl = (40 + Math.random() * 90) * ADPR;
      branches.push(ambJag(bx, by, bx + Math.cos(a) * bl, by + Math.sin(a) * bl, bl * .5));
    }
    ambBolts.push({ pts, branches, start: performance.now(), max: 1000 + Math.random() * 500 });
  }
  function ambFrame() {
    ctx.clearRect(0, 0, AW, AH);
    const now = performance.now();
    ambBolts = ambBolts.filter(b => now - b.start < b.max);
    ambBolts.forEach(b => {
      const p = (now - b.start) / b.max;
      // hold near full brightness, then ease out slowly instead of a quick linear fade
      const f = p < .25 ? 1 : Math.pow(1 - (p - .25) / .75, 1.6);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(b.pts[0][0], b.pts[0][1]);
      for (let i = 1; i < b.pts.length; i++) ctx.lineTo(b.pts[i][0], b.pts[i][1]);
      ctx.strokeStyle = `rgba(168,85,247,${.32 * f})`; ctx.lineWidth = 3.4 * ADPR;
      ctx.shadowColor = '#b98cff'; ctx.shadowBlur = 20; ctx.stroke();
      ctx.strokeStyle = `rgba(240,236,255,${.75 * f})`; ctx.lineWidth = 1.3 * ADPR;
      ctx.shadowBlur = 9; ctx.stroke();
      b.branches.forEach(br => {
        ctx.beginPath(); ctx.moveTo(br[0][0], br[0][1]);
        for (let i = 1; i < br.length; i++) ctx.lineTo(br[i][0], br[i][1]);
        ctx.strokeStyle = `rgba(200,180,255,${.5 * f})`; ctx.lineWidth = 1 * ADPR;
        ctx.shadowBlur = 6; ctx.stroke();
      });
    });
    requestAnimationFrame(ambFrame);
  }
  ambFrame();
  function scheduleAmbBolt() {
    setTimeout(() => {
      if (!document.hidden) { addAmbBolt(); if (Math.random() < .35) setTimeout(addAmbBolt, 100); }
      scheduleAmbBolt();
    }, 3000 + Math.random() * 4000);
  }
  scheduleAmbBolt();
  // dodge any backlog: wipe pending bolts the instant the tab is hidden so nothing accumulates offscreen
  document.addEventListener('visibilitychange', () => { if (document.hidden) ambBolts = []; });
})();

/* ---------- continuous photo marquee ---------- */
(function () {
  const track = document.getElementById('marqueeTrack');
  if (!track) return;
  // duplicate the photo set once (into the same track) so the CSS animation
  // (translateX -50%, exactly one set width) loops seamlessly
  Array.from(track.children).forEach(img => {
    const clone = img.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    clone.removeAttribute('loading');
    track.appendChild(clone);
  });
})();

/* ---------- mobile nav toggle ---------- */
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));
}
