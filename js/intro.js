/* ---------- intro: lightning storm around an already-visible logo (landing page only) ---------- */
const cv = document.getElementById('bolts'), x = cv.getContext('2d');
const flash = document.getElementById('introFlash'), logoEl = document.getElementById('introLogo');
const introEl = document.getElementById('intro');
let W, H, DPR;
function size() { DPR = Math.min(devicePixelRatio || 1, 2); W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
size(); addEventListener('resize', size);

const BOLT_COLORS = ['124,58,237', '168,85,247', '129,140,248']; // purple, light purple, indigo accent

function jag(x1, y1, x2, y2, d) {
  if (d < 7 * DPR) return [[x1, y1], [x2, y2]];
  const mx = (x1 + x2) / 2 + (Math.random() - .5) * d, my = (y1 + y2) / 2 + (Math.random() - .5) * d;
  return jag(x1, y1, mx, my, d / 2).slice(0, -1).concat(jag(mx, my, x2, y2, d / 2));
}
function stroke(pts, w, col, blur) {
  x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
  x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.lineJoin = 'round';
  x.shadowColor = '#b98cff'; x.shadowBlur = blur; x.stroke();
}
let bolts = [], sparks = [];
const cx = () => W / 2, cy = () => H / 2;
function addBolt(toCenter, big) {
  const side = Math.floor(Math.random() * 4);
  let sx, sy;
  if (side === 0) { sx = Math.random() * W; sy = -30 * DPR; }
  else if (side === 1) { sx = Math.random() * W; sy = H + 30 * DPR; }
  else if (side === 2) { sx = -30 * DPR; sy = Math.random() * H; }
  else { sx = W + 30 * DPR; sy = Math.random() * H; }
  const r = Math.min(150 * DPR, W * 0.2);
  const a = Math.atan2(cy() - sy, cx() - sx);
  const ex = toCenter ? cx() - Math.cos(a) * r : sx + (Math.random() - .5) * W * 0.5;
  const ey = toCenter ? cy() - Math.sin(a) * r : sy + (Math.random() - .5) * H * 0.5;
  const pts = jag(sx, sy, ex, ey, Math.hypot(ex - sx, ey - sy) * 0.34);
  const branches = [];
  const branchCount = big ? 5 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
  for (let b = 0; b < branchCount; b++) {
    const i = 2 + Math.floor(Math.random() * (pts.length - 4));
    const [bx, by] = pts[i]; const ba = a + (Math.random() - .5) * 2.6; const bl = (50 + Math.random() * (big ? 140 : 90)) * DPR;
    branches.push(jag(bx, by, bx + Math.cos(ba) * bl, by + Math.sin(ba) * bl, bl * .5));
  }
  const col = BOLT_COLORS[Math.floor(Math.random() * BOLT_COLORS.length)];
  bolts.push({ pts, branches, life: 0, max: (big ? 13 : 9) + Math.random() * 7, col });
  for (let s = 0; s < (big ? 22 : 10); s++) sparks.push({ x: ex, y: ey, vx: (Math.random() - .5) * 7 * DPR, vy: (Math.random() - .5) * 7 * DPR, life: 0, max: 20 + Math.random() * 24 });
}
function popFlash(a) { flash.style.transition = 'none'; flash.style.opacity = a; requestAnimationFrame(() => { flash.style.transition = 'opacity .5s ease'; flash.style.opacity = 0; }); }

/* jolt: kicks the logo into a 3D tilt/shake, then eases back — the "chaotic current" pulse */
function jolt(strength = 1) {
  const rx = (Math.random() - .5) * 16 * strength;
  const ry = (Math.random() - .5) * 22 * strength;
  const rz = (Math.random() - .5) * 7 * strength;
  const tx = (Math.random() - .5) * 14 * strength;
  const ty = (Math.random() - .5) * 10 * strength;
  const sc = .94 + Math.random() * .09 * strength;
  logoEl.animate([
    { transform: `translate(${tx}px,${ty}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${sc})`, offset: 0 },
    { transform: `translate(${-tx * .3}px,${-ty * .3}px) rotateX(${-rx * .3}deg) rotateY(${-ry * .3}deg) rotateZ(${-rz * .3}deg) scale(.94)`, offset: .6 },
    { transform: 'translate(0,0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(.94)', offset: 1 }
  ], { duration: 320 + Math.random() * 220, easing: 'cubic-bezier(.2,.85,.25,1)' });
}
function shakeScreen(strength = 1) {
  const tx = (Math.random() - .5) * 8 * strength, ty = (Math.random() - .5) * 6 * strength;
  introEl.animate([
    { transform: `translate(${tx}px,${ty}px)` },
    { transform: 'translate(0,0)' }
  ], { duration: 180, easing: 'cubic-bezier(.2,.9,.3,1)' });
}

function frame() {
  x.clearRect(0, 0, W, H);
  bolts = bolts.filter(b => b.life < b.max);
  bolts.forEach(b => {
    b.life++; const f = 1 - b.life / b.max;
    stroke(b.pts, 5 * DPR, `rgba(${b.col},${.32 * f})`, 26);
    stroke(b.pts, 1.8 * DPR, `rgba(240,236,255,${.95 * f})`, 12);
    b.branches.forEach(br => stroke(br, 1.2 * DPR, `rgba(200,180,255,${.65 * f})`, 8));
  });
  sparks = sparks.filter(s => s.life < s.max);
  sparks.forEach(s => {
    s.life++; s.x += s.vx; s.y += s.vy; s.vy += .06 * DPR; const f = 1 - s.life / s.max;
    x.beginPath(); x.arc(s.x, s.y, 1.4 * DPR, 0, 7); x.fillStyle = `rgba(220,205,255,${f})`; x.shadowColor = '#b98cff'; x.shadowBlur = 8; x.fill();
  });
  requestAnimationFrame(frame);
}
frame();

/* choreography: a quick lightning storm crashes around a logo that's already glowing,
   climaxing in one big surge, then settling into the reveal — 1.8s total */
const seq = [
  [0, () => { addBolt(true); jolt(.6); }],
  [140, () => { addBolt(true); jolt(.7); }],
  [280, () => { addBolt(true); addBolt(true); shakeScreen(.7); }],
  [430, () => { // the surge — biggest strike, hardest jolt, brightest flash
    addBolt(true, true); addBolt(true, true); addBolt(true, true);
    popFlash(.9); jolt(2.2); shakeScreen(2);
    logoEl.animate([
      { filter: 'drop-shadow(0 0 46px rgba(233,226,255,.95)) brightness(2.4)', offset: 0 },
      { filter: 'drop-shadow(0 0 30px rgba(168,85,247,.85)) brightness(1.3)', offset: .5 },
      { filter: 'drop-shadow(0 0 16px rgba(124,58,237,.4)) brightness(1)', offset: 1 }
    ], { duration: 550, easing: 'cubic-bezier(.2,.9,.2,1)' });
  }],
  [780, () => { addBolt(true); jolt(.9); shakeScreen(.6); }],
  [1050, () => { addBolt(true, true); jolt(1.2); popFlash(.35); }],
  [1350, () => { addBolt(true); jolt(.5); }],
];
seq.forEach(([t, fn]) => setTimeout(fn, t));
setTimeout(finishIntro, 1800);

let ended = false;
function finishIntro() {
  if (ended) return; ended = true;
  document.getElementById('intro').classList.add('done');
  document.body.style.overflow = 'auto';
  setTimeout(() => document.querySelectorAll('header.hero .reveal').forEach(el => el.classList.add('in')), 120);
}
document.body.style.overflow = 'hidden';
addEventListener('keydown', e => { if (e.key === 'Escape') finishIntro(); });
