/* Chaotic Current — shared page script (small; the 3D code loads only when a robot is near the screen) */
document.documentElement.classList.add('js');
const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;

/* menu */
(() => {
  const btn = document.querySelector('.nav__toggle'), list = document.getElementById('nav-links');
  if (!btn || !list) return;
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open)); btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    list.classList.toggle('is-open', open); document.body.classList.toggle('menu-open', open);
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  list.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  matchMedia('(min-width: 860px)').addEventListener('change', () => set(false));
})();

/* hero entrance: once, on load */
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.querySelectorAll('[data-enter], [data-enter-pic]').forEach((el) => el.classList.add('is-in'));
}));

/* 3D viewers: fetch the three.js bundle the first time a viewer comes within ~one screen */
(() => {
  const viewers = document.querySelectorAll('[data-viewer]');
  if (!viewers.length) return;
  let mod;
  const load = () => (mod ||= import(new URL('viewer3d.js', SCRIPT_URL).href));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      load().then((m) => m.mount(en.target)).catch(() => en.target.classList.add('is-failed'));
    });
  }, { rootMargin: '600px 0px' });
  viewers.forEach((v) => io.observe(v));
})();

/* footer year */
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
