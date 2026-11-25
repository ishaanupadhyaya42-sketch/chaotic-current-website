// Scroll-driven robot scene. Bundled to js/scene3d.js (npm run build:scene).
//
// One full-screen WebGL canvas sits in a sticky stage. Each `.step` in the scene carries the pose
// for that point of the scroll (data-model, data-explode, data-yaw, data-pitch, data-zoom,
// data-side, data-labels). Scrolling interpolates between steps; dragging adds a turn on top.
// Exploded views run in the vertex shader from the per-vertex _EXPLODE attribute, so a whole robot
// stays at one draw call per colour and phones keep up.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Box3, Vector3, Sphere, PMREMGenerator,
  DirectionalLight, Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture, ACESFilmicToneMapping,
  SRGBColorSpace, MathUtils,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const conn = navigator.connection || {};
const lowEnd = matchMedia('(max-width: 820px)').matches || (navigator.deviceMemory || 8) <= 4 ||
  (navigator.hardwareConcurrency || 8) <= 4 || conn.saveData;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
const MAX_DELAY = 0.32; // matches the converter's start-delay range

function blobShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(150,90,255,.55)'); r.addColorStop(.45, 'rgba(110,50,220,.22)'); r.addColorStop(1, 'rgba(80,30,180,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

function explodeMaterial(mat, uniform, inv) {
  // offsets are in metres; quantized meshes carry a node scale, so divide it back out
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uExplode = uniform; sh.uniforms.uInvScale = inv;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 _explode;
        uniform float uExplode;
        uniform float uInvScale;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ep = clamp((uExplode - _explode.w) / (1.0 - ${MAX_DELAY.toFixed(2)}), 0.0, 1.0);
        ep = ep * ep * (3.0 - 2.0 * ep);
        transformed += _explode.xyz * ep * uInvScale;`);
  };
  mat.customProgramCacheKey = () => 'explode';
}
// the same easing on the CPU, for label anchors
function partProgress(u, delay) { return smooth((u - delay) / (1 - MAX_DELAY)); }

export function mountScene(root) {
  const stage = root.querySelector('.scene__stage');
  const steps = [...root.querySelectorAll('.step')];
  const tagLayer = root.querySelector('.scene__tags');
  const nameEl = root.querySelector('.scene__name');
  const hudN = root.querySelector('[data-hud-n]'), hudT = root.querySelector('[data-hud-t]'), bar = root.querySelector('.scene__bar i');
  const status = root.querySelector('[data-status]');

  const K = steps.map((el) => ({
    model: el.dataset.model === 'patriot' ? 1 : 0,
    explode: +(el.dataset.explode || 0), yaw: +(el.dataset.yaw || 0.6), pitch: +(el.dataset.pitch || 0.3),
    zoom: +(el.dataset.zoom || 1), side: el.dataset.side === 'left' ? -1 : el.dataset.side === 'right' ? 1 : 0,
    labels: el.dataset.labels === 'on' ? 1 : 0, hud: el.dataset.hud || '',
  }));

  let renderer;
  try { renderer = new WebGLRenderer({ antialias: (devicePixelRatio || 1) < 2, alpha: true }); }
  catch (e) { root.classList.add('is-failed'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowEnd ? 1.5 : 2));
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement; canvas.className = 'scene__canvas'; canvas.setAttribute('aria-hidden', 'true');
  stage.prepend(canvas);

  const scene = new Scene();
  const pm = new PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  const key = new DirectionalLight(0xffffff, 1.3); key.position.set(2, 4, 3); scene.add(key);
  const rim = new DirectionalLight(0x9a5cff, 3.2); rim.position.set(-2.5, 1.6, -3); scene.add(rim);
  const rim2 = new DirectionalLight(0xb48cff, 1.6); rim2.position.set(3, 0.8, -2); scene.add(rim2);
  const camera = new PerspectiveCamera(30, 1, 0.01, 60);

  // robots: [stinger, patriot]
  const robots = [0, 1].map(() => ({ group: new Group(), ready: false, u: { value: 0 }, inv: { value: 1 }, labels: [], radius: 0.3, half: 0.2, inner: null, shadow: null }));
  robots.forEach((r) => { r.group.visible = false; scene.add(r.group); });
  const shadowTex = blobShadow();

  function load(i, url) {
    return new Promise((res) => {
      const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
      loader.load(url, (gltf) => {
        const r = robots[i], model = gltf.scene;
        model.rotation.x = -Math.PI / 2; // Onshape exports Z-up
        model.updateMatrixWorld(true);
        const box = new Box3().setFromObject(model), c = box.getCenter(new Vector3()), s = box.getSize(new Vector3());
        model.position.sub(c);
        model.updateMatrixWorld(true);
        const ws = new Vector3();
        model.traverse((o) => {
          if (o.isMesh) { o.frustumCulled = false; o.getWorldScale(ws); r.inv.value = 1 / ws.x; explodeMaterial(o.material, r.u, r.inv); }
          if (o.userData && o.userData.labels) r.labels = o.userData.labels;
        });
        r.inner = model; r.group.add(model);
        r.radius = box.getBoundingSphere(new Sphere()).radius; r.half = s.y / 2;
        const sh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
        sh.rotation.x = -Math.PI / 2; sh.position.y = -s.y / 2 - 0.002; sh.scale.setScalar(Math.max(s.x, s.z) * 1.8);
        r.group.add(sh); r.shadow = sh;
        r.tags = r.labels.map((l) => {
          const el = document.createElement('div'); el.className = 'tag';
          el.innerHTML = '<i></i><span></span>'; el.querySelector('span').textContent = l.t;
          tagLayer.appendChild(el); return el;
        });
        r.ready = true; res();
      }, undefined, () => { root.classList.add('is-failed'); res(); });
    });
  }

  const srcs = root.dataset;
  if (status) status.textContent = 'Loading 3D';
  load(0, lowEnd ? srcs.stingerLite : srcs.stinger).then(() => {
    root.classList.add('is-ready'); if (status) status.textContent = '';
    kick();
    // second robot once the first is on screen and the browser is idle
    const later = window.requestIdleCallback || ((f) => setTimeout(f, 600));
    later(() => load(1, lowEnd ? srcs.patriotLite : srcs.patriot).then(kick));
  });

  // ---------- state ----------
  const cur = { explode: 0, yaw: K[0].yaw, pitch: K[0].pitch, zoom: K[0].zoom, side: K[0].side, labels: 0, model: 0 };
  let userYaw = 0, userVel = 0, visible = true, raf = 0, last = performance.now(), lastHud = -1, lastName = -1;

  function progress() {
    const r = root.getBoundingClientRect(), span = r.height - innerHeight;
    return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
  }
  function target() {
    const s = progress() * (K.length - 1), i = Math.min(K.length - 2, Math.floor(s)), t = s - i;
    const e = smooth((t - 0.18) / 0.64), a = K[i], b = K[i + 1] || a;
    return {
      s, explode: lerp(a.explode, b.explode, e), yaw: lerp(a.yaw, b.yaw, e), pitch: lerp(a.pitch, b.pitch, e),
      zoom: lerp(a.zoom, b.zoom, e), side: lerp(a.side, b.side, e), labels: lerp(a.labels, b.labels, e), model: lerp(a.model, b.model, e),
    };
  }

  function size() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { size(); kick(); }).observe(stage);
  size();

  const v = new Vector3(), wp = new Vector3();
  function frame(now) {
    raf = 0; if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const T = target();
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 4.2);
    for (const f of ['explode', 'yaw', 'pitch', 'zoom', 'side', 'labels', 'model']) cur[f] += (T[f] - cur[f]) * k;
    if (!dragging) { userYaw += userVel; userVel *= 0.93; }

    // robot swap: the first drops away, the second rises in
    const out = 1 - smooth(cur.model * 2), inn = smooth(cur.model * 2 - 1);
    const active = cur.model < 0.5 ? 0 : 1;
    robots.forEach((r, i) => {
      const sc = i === 0 ? out : inn;
      r.group.visible = r.ready && sc > 0.002;
      r.group.scale.setScalar(Math.max(sc, 0.0001));
      r.group.position.y = (1 - sc) * (i === 0 ? -0.25 : 0.25) * r.radius;
      r.group.rotation.y = cur.yaw + userYaw + (1 - sc) * (i === 0 ? 0.35 : -0.35);
      r.u.value = cur.explode;
      if (r.shadow) r.shadow.material.opacity = 0.9;
    });

    // camera: further back as the robot comes apart; framed off to one side on wide screens
    const R = robots[active].ready ? robots[active].radius : 0.3;
    const wide = camera.aspect >= 1.05;
    const fit = wide ? 1 : Math.pow(1.05 / camera.aspect, 0.5) * 1.22;
    const dist = R * 4.4 * cur.zoom * (1 + 0.68 * cur.explode) * fit;
    const cp = Math.cos(cur.pitch);
    camera.position.set(0, Math.sin(cur.pitch) * dist, cp * dist);
    camera.lookAt(0, cur.explode * R * 0.4, 0);
    const w = stage.clientWidth, h = stage.clientHeight;
    if (wide) camera.setViewOffset(w, h, -cur.side * w * 0.2, h * 0.09, w, h);
    else camera.setViewOffset(w, h, 0, h * 0.19, w, h);
    camera.updateMatrixWorld();

    renderer.render(scene, camera);

    // part labels for the robot on screen
    robots.forEach((r, i) => {
      if (!r.tags) return;
      const show = i === active && r.group.visible ? cur.labels * smooth((cur.explode - 0.55) * 3) : 0;
      r.labels.forEach((l, j) => {
        const el = r.tags[j];
        if (show < 0.02) { if (el.style.opacity !== '0') el.style.opacity = '0'; return; }
        // nearest instance of this part to the camera
        let best = null, bd = 1e9;
        for (const p of l.pts) {
          const ep = partProgress(cur.explode, p[6]);
          wp.set(p[0] + p[3] * ep, p[1] + p[4] * ep, p[2] + p[5] * ep);
          r.inner.localToWorld(wp);
          const d = wp.distanceToSquared(camera.position);
          if (d < bd) { bd = d; best = wp.clone(); }
        }
        v.copy(best).project(camera);
        if (v.z > 1) { el.style.opacity = '0'; return; }
        const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
        el.style.opacity = show.toFixed(3);
        el.classList.toggle('tag--l', x > w * 0.66);
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      });
    });

    // HUD + big name
    const n = Math.round(T.s);
    if (n !== lastHud) {
      lastHud = n;
      if (hudN) hudN.textContent = String(n + 1).padStart(2, '0') + ' / ' + String(K.length).padStart(2, '0');
      if (hudT) hudT.textContent = K[n].hud;
    }
    if (bar) bar.style.transform = `scaleX(${(T.s / (K.length - 1)).toFixed(4)})`;
    if (nameEl && active !== lastName) { lastName = active; nameEl.dataset.active = active ? 'patriot' : 'stinger'; }

    const settling = ['explode', 'yaw', 'pitch', 'zoom', 'side', 'labels', 'model'].some((f) => Math.abs(T[f] - cur[f]) > 1e-4);
    if (settling || dragging || Math.abs(userVel) > 1e-4) kick();
  }
  function kick() { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  // drag to turn: horizontal only, so vertical swipes keep scrolling the page
  let dragging = false, lx = 0, pid = null;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; pid = e.pointerId; lx = e.clientX; userVel = 0; canvas.setPointerCapture(pid); root.classList.add('is-dragging'); kick(); });
  canvas.addEventListener('pointermove', (e) => { if (!dragging || e.pointerId !== pid) return; const dx = e.clientX - lx; lx = e.clientX; userVel = dx * 0.009; userYaw += userVel; kick(); });
  const end = (e) => { if (e.pointerId !== pid) return; dragging = false; root.classList.remove('is-dragging'); kick(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  root.addEventListener('keydown', (e) => {
    if (e.target !== stage) return;
    if (e.key === 'ArrowLeft') { userYaw -= 0.2; kick(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { userYaw += 0.2; kick(); e.preventDefault(); }
  });

  addEventListener('scroll', kick, { passive: true });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }).observe(root);
  document.addEventListener('visibilitychange', () => { if (document.hidden) visible = false; else { visible = true; kick(); } });
  kick();
}
