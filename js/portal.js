/* Portal hero: a hexagon gate shows the next place; stepping through grows the hexagon over the screen.
   Plain DOM + CSS clip-path, so it costs almost nothing on phones. */
(() => {
  const root = document.querySelector('[data-portal]');
  if (!root) return;
  const slides = [...root.querySelectorAll('.portal__data li')].map((li) => ({
    src: li.dataset.src, srcset: li.dataset.srcset, title: li.dataset.title, text: li.dataset.text, alt: li.dataset.alt,
  }));
  if (slides.length < 2) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = root.querySelector('.portal__stage');
  const bg = root.querySelector('.portal__bg img');
  const gate = root.querySelector('.portal__gate');
  const gateImg = gate.querySelector('img');
  const n = root.querySelector('.portal__n'), title = root.querySelector('.portal__t'), text = root.querySelector('.portal__d');
  const count = root.querySelector('.portal__count'), bar = root.querySelector('.portal__bar i');
  const pauseBtn = root.querySelector('.portal__pause'), prevBtn = root.querySelector('.portal__prev'), nextBtn = root.querySelector('.portal__next');
  const DWELL = 6500;
  let i = 0, busy = false, playing = !reduce, timer = 0, visible = true;

  const pad = (k) => String(k + 1).padStart(2, '0');
  const setImg = (img, s) => { img.srcset = s.srcset; img.src = s.src; img.alt = s.alt; };
  // warm the cache so the next step-through never waits on the network
  const warm = (s) => { const im = new Image(); im.sizes = '100vw'; im.srcset = s.srcset; im.src = s.src; };

  function hex(cx, cy, r) {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (60 * k - 90);
      pts.push(`${(cx + r * Math.cos(a)).toFixed(1)}px ${(cy + r * Math.sin(a)).toFixed(1)}px`);
    }
    return `polygon(${pts.join(',')})`;
  }

  function label(k) {
    const s = slides[k];
    n.textContent = pad(k); count.textContent = `${pad(k)} / ${String(slides.length).padStart(2, '0')}`;
    root.classList.remove('is-swapping'); void title.offsetWidth; root.classList.add('is-swapping');
    title.textContent = s.title; text.textContent = s.text;
    const nx = slides[(k + 1) % slides.length];
    gate.setAttribute('aria-label', `Step through to the next place: ${nx.title}`);
    gate.querySelector('.portal__cta span').textContent = nx.title;
  }

  function go(to) {
    if (busy || to === i) return;
    busy = true; clearTimeout(timer);
    const s = slides[to];
    if (reduce) {
      setImg(bg, s); i = to; label(i); setImg(gateImg, slides[(i + 1) % slides.length]); busy = false; schedule(); return;
    }
    // grow layer: the next place, clipped to the gate's hexagon, then opened to cover the stage
    const sr = stage.getBoundingClientRect(), gr = gate.querySelector('.portal__win').getBoundingClientRect();
    const cx = gr.left + gr.width / 2 - sr.left, cy = gr.top + gr.height / 2 - sr.top, r0 = gr.height / 2;
    const R = Math.hypot(Math.max(cx, sr.width - cx), Math.max(cy, sr.height - cy)) * 1.25;
    const layer = document.createElement('figure'); layer.className = 'portal__grow';
    const im = document.createElement('img'); im.sizes = '100vw'; setImg(im, s); im.decoding = 'async';
    layer.appendChild(im);
    layer.style.clipPath = hex(cx, cy, r0);
    layer.style.setProperty('--ox', `${cx}px`); layer.style.setProperty('--oy', `${cy}px`);
    stage.appendChild(layer);
    root.classList.add('is-going');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      layer.classList.add('is-open');
      layer.style.clipPath = hex(cx, cy, R);
    }));
    const done = () => {
      setImg(bg, s); i = to; label(i);
      setImg(gateImg, slides[(i + 1) % slides.length]); warm(slides[(i + 2) % slides.length]);
      requestAnimationFrame(() => { layer.remove(); root.classList.remove('is-going'); busy = false; schedule(); });
    };
    layer.addEventListener('transitionend', (e) => { if (e.propertyName === 'clip-path') done(); }, { once: false });
    setTimeout(() => { if (busy && layer.isConnected) done(); }, 1600); // safety if transitionend never fires
  }

  function schedule() {
    clearTimeout(timer);
    if (bar) { bar.style.transition = 'none'; bar.style.transform = 'scaleX(0)'; }
    if (!playing || !visible) return;
    requestAnimationFrame(() => { if (bar) { bar.style.transition = `transform ${DWELL}ms linear`; bar.style.transform = 'scaleX(1)'; } });
    timer = setTimeout(() => go((i + 1) % slides.length), DWELL);
  }

  gate.addEventListener('click', () => go((i + 1) % slides.length));
  nextBtn && nextBtn.addEventListener('click', () => go((i + 1) % slides.length));
  prevBtn && prevBtn.addEventListener('click', () => go((i - 1 + slides.length) % slides.length));
  pauseBtn && pauseBtn.addEventListener('click', () => {
    playing = !playing; pauseBtn.setAttribute('aria-pressed', String(!playing));
    pauseBtn.setAttribute('aria-label', playing ? 'Pause slideshow' : 'Play slideshow');
    root.classList.toggle('is-paused', !playing); schedule();
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') go((i + 1) % slides.length);
    if (e.key === 'ArrowLeft') go((i - 1 + slides.length) % slides.length);
  });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; schedule(); }, { threshold: 0.3 }).observe(root);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; schedule(); });

  if (pauseBtn) { pauseBtn.setAttribute('aria-pressed', String(!playing)); root.classList.toggle('is-paused', !playing); }
  label(0); setImg(gateImg, slides[1]); warm(slides[2 % slides.length]);
  schedule();
})();
