/* Chaotic Current — page script. The 3D scene bundle (three.js) is fetched separately, right after first paint. */
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

/* nav: mark the section on screen */
(() => {
  const links = [...document.querySelectorAll('.nav__links a[href^="#"]:not(.btn)')];
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((a) => a.removeAttribute('aria-current'));
      const a = map.get(en.target.id); if (a) a.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
})();

/* first-screen entrance: once, on load */
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.querySelectorAll('[data-enter]').forEach((el) => el.classList.add('is-in'));
}));

/* the robot scene */
(() => {
  const root = document.querySelector('[data-scene]');
  if (!root) return;
  const go = () => import(new URL('scene3d.js', SCRIPT_URL).href)
    .then((m) => m.mountScene(root))
    .catch(() => root.classList.add('is-failed'));
  // the robots sit at the bottom of the page: fetch three.js and the models only as the reader nears them
  const io = new IntersectionObserver((en) => { if (en.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '150% 0px' });
  io.observe(root);
})();

/* footer year */
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
