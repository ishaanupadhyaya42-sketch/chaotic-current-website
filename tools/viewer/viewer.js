// Robot turntable viewer. Bundled to js/viewer3d.js (npm run build:viewer).
// Built for phones first: horizontal drag turns the robot, vertical drag still scrolls the page,
// nothing renders while the viewer is off screen or idle, and phones get the lighter model.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Box3, Vector3, PMREMGenerator,
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

const VIEWS = { front: [0, 0.22], side: [Math.PI / 2, 0.16], top: [0, 1.3] };

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(20,18,24,.42)'); r.addColorStop(1, 'rgba(20,18,24,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

export function mount(el) {
  const src = lowEnd && el.dataset.lite ? el.dataset.lite : el.dataset.model;
  const status = el.querySelector('[data-status]');
  const setStatus = (t) => { if (status) status.textContent = t; };

  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: (devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'default' });
  } catch (e) { el.classList.add('is-failed'); setStatus('3D view unavailable on this device'); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowEnd ? 1.5 : 2));
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  const canvas = renderer.domElement; canvas.className = 'viewer__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  el.querySelector('.viewer__stage').appendChild(canvas);

  const scene = new Scene();
  const pm = new PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  const key = new DirectionalLight(0xffffff, 1.1); key.position.set(2, 4, 3); scene.add(key);

  const camera = new PerspectiveCamera(28, 1, 0.01, 50);
  const pivot = new Group(); scene.add(pivot);

  // orbit state: yaw (turntable), pitch (tilt), with inertia
  let yaw = parseFloat(el.dataset.yaw || '0.6'), pitch = 0.32, vYaw = 0, tYaw = null, tPitch = null, dist = 1, visible = false, raf = 0;
  let spinning = !reduceMotion && el.dataset.spin !== 'off', loaded = false, interacted = false;

  function size() {
    const w = el.clientWidth, h = el.querySelector('.viewer__stage').clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    request();
  }
  function place() {
    const cp = Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * cp * dist, Math.sin(pitch) * dist, Math.cos(yaw) * cp * dist);
    camera.lookAt(0, 0, 0);
  }
  function frame() {
    raf = 0; if (!visible || !loaded) return;
    let moving = false;
    if (tYaw !== null) {
      yaw = MathUtils.damp(yaw, tYaw, 7, 1 / 60); pitch = MathUtils.damp(pitch, tPitch, 7, 1 / 60);
      if (Math.abs(yaw - tYaw) < 1e-3 && Math.abs(pitch - tPitch) < 1e-3) { tYaw = tPitch = null; } else moving = true;
    } else if (Math.abs(vYaw) > 1e-4) { yaw += vYaw; vYaw *= 0.92; moving = true; }
    else if (spinning && !dragging) { yaw += 0.0035; moving = true; }
    place(); renderer.render(scene, camera);
    if (moving || dragging) request();
  }
  function request() { if (!raf && visible) raf = requestAnimationFrame(frame); }

  // drag: horizontal turns, vertical tilts (mouse) — touch keeps vertical for page scroll via CSS touch-action: pan-y
  let dragging = false, lx = 0, ly = 0, pid = null;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true; pid = e.pointerId; lx = e.clientX; ly = e.clientY; vYaw = 0; tYaw = tPitch = null;
    canvas.setPointerCapture(pid); el.classList.add('is-dragging'); stopSpin(); request();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== pid) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    vYaw = -dx * 0.008; yaw += vYaw;
    if (e.pointerType === 'mouse') pitch = MathUtils.clamp(pitch + dy * 0.006, -0.15, 1.35);
    request();
  });
  const end = (e) => { if (e.pointerId !== pid) return; dragging = false; el.classList.remove('is-dragging'); request(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  // controls
  const spinBtn = el.querySelector('[data-act="spin"]');
  function syncSpin() { if (spinBtn) { spinBtn.setAttribute('aria-pressed', String(spinning)); spinBtn.textContent = spinning ? 'Pause spin' : 'Spin'; } }
  function stopSpin() { if (!interacted) { interacted = true; } spinning = false; syncSpin(); }
  syncSpin();
  el.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
    const [y0, p] = VIEWS[b.dataset.view]; const y = y0 + parseFloat(el.dataset.front || '0');
    // take the short way round
    const base = Math.round((yaw - y) / (Math.PI * 2)) * Math.PI * 2;
    tYaw = y + base; tPitch = p; vYaw = 0; stopSpin(); request();
  }));
  if (spinBtn) spinBtn.addEventListener('click', () => { spinning = !spinning; syncSpin(); request(); });
  el.addEventListener('keydown', (e) => {
    if (e.target.closest('button')) return;
    if (e.key === 'ArrowLeft') { yaw -= 0.15; stopSpin(); request(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { yaw += 0.15; stopSpin(); request(); e.preventDefault(); }
  });

  // only render while on screen
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) request(); }, { threshold: 0.01 }).observe(el);
  new ResizeObserver(size).observe(el);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden && el.getBoundingClientRect().bottom > 0; request(); });

  // load
  setStatus('Loading 3D model');
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(src, (gltf) => {
    const model = gltf.scene;
    model.rotation.x = -Math.PI / 2; // Onshape exports Z-up
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model), c = box.getCenter(new Vector3()), s = box.getSize(new Vector3());
    model.position.sub(c);
    pivot.add(model);
    const r = Math.max(s.x, s.z) * 0.95;
    const sh = new Mesh(new PlaneGeometry(r * 1.9, r * 1.9), new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = -s.y / 2 - 0.001; pivot.add(sh);
    dist = s.length() * (parseFloat(el.dataset.zoom) || 2.05);
    loaded = true; size(); place(); renderer.render(scene, camera);
    el.classList.add('is-ready'); setStatus('');
    request();
  }, (p) => {
    if (p.total) setStatus(`Loading 3D model, ${Math.round((p.loaded / p.total) * 100)}%`);
  }, () => { el.classList.add('is-failed'); setStatus('The 3D model did not load. Showing the render instead.'); });
}

export function mountAll(root = document) { root.querySelectorAll('[data-viewer]').forEach(mount); }
