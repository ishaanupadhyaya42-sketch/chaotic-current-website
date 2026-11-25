// Onshape GLB -> web-ready GLB: drop tiny parts, weld + simplify each part, creased normals,
// one primitive per colour, quantized + meshopt-compressed.
// Each vertex also carries _EXPLODE (xyz offset of its part in the exploded view, w = start delay)
// and the scene node carries label anchors (extras.labels) found by part name.
// usage: node convert.mjs in.glb out.glb --min 0.008 --err 0.004 [--budget 300000]
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { mat3, mat4, vec3 } from 'gl-matrix';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? parseFloat(args[i + 1]) : d; };
const [IN, OUT] = args;
let MIN = opt('min', 0.008), ERR = opt('err', 0.004), RATIO = opt('ratio', 0.08);
const BUDGET = opt('budget', 0);

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder });
const src = await io.read(IN);

// ---------- 1. collect parts (node + mesh), grouped by material colour ----------
const colKey = (m) => {
  if (!m) return '0.50,0.50,0.50';
  const c = m.getBaseColorFactor();
  return c.slice(0, 3).map(x => (Math.round(x * 20) / 20).toFixed(2)).join(','); // merge near-identical colours
};
const parts = [];
for (const scene of src.getRoot().listScenes()) scene.traverse(node => {
  const mesh = node.getMesh(); if (!mesh) return;
  const M = node.getWorldMatrix();
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9], w = [0, 0, 0];
  for (const p of mesh.listPrimitives()) {
    const a = p.getAttribute('POSITION'); const lo = a.getMin([]), hi = a.getMax([]);
    for (let c = 0; c < 8; c++) { vec3.transformMat4(w, [c & 1 ? hi[0] : lo[0], c & 2 ? hi[1] : lo[1], c & 4 ? hi[2] : lo[2]], M); for (let k = 0; k < 3; k++) { if (w[k] < min[k]) min[k] = w[k]; if (w[k] > max[k]) max[k] = w[k]; } }
  }
  let nm = '', pn = node; while (pn && !nm) { nm = (pn.getName() || '').replace(/^occurrence of /, ''); pn = pn.getParentNode(); }
  parts.push({ name: nm, mesh, M: Array.from(M), diag: vec3.distance(min, max), ctr: [(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2] });
});

{ const med = [0,1,2].map(k => { const a = parts.map(p => p.ctr[k]).sort((x,y)=>x-y); return a[a.length>>1]; });
  const before = parts.length; for (let i = parts.length - 1; i >= 0; i--) if (vec3.distance(parts[i].ctr, med) > 0.45) parts.splice(i, 1);
  console.log('outliers dropped', before - parts.length); }
// ---------- exploded view: each part moves out from the footprint centre and up by its height ----------
{ const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of parts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.ctr[k]); hi[k] = Math.max(hi[k], p.ctr[k]); }
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, H = Math.max(1e-3, hi[2] - lo[2]);
  for (const p of parts) {
    const t = (p.ctr[2] - lo[2]) / H;
    p.exp = [(p.ctr[0] - cx) * 0.85, (p.ctr[1] - cy) * 0.85, t * H * 0.95 + 0.012, 0.32 * (1 - t)];
  }
}
// ---------- 2. per (mesh, colour): weld + simplify + creased normals (cached across instances) ----------
const cache = new Map();
function weldMerge(prims) {
  const map = new Map(); const pos = []; const idx = []; const v = [0, 0, 0];
  for (const p of prims) {
    const a = p.getAttribute('POSITION'); const ind = p.getIndices();
    const local = new Uint32Array(a.getCount());
    for (let i = 0; i < a.getCount(); i++) {
      a.getElement(i, v);
      const key = Math.round(v[0] * 2e4) + ',' + Math.round(v[1] * 2e4) + ',' + Math.round(v[2] * 2e4);
      let id = map.get(key); if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(v[0], v[1], v[2]); }
      local[i] = id;
    }
    const n = ind ? ind.getCount() : a.getCount();
    for (let i = 0; i < n; i += 3) {
      const A = local[ind ? ind.getScalar(i) : i], B = local[ind ? ind.getScalar(i + 1) : i + 1], C = local[ind ? ind.getScalar(i + 2) : i + 2];
      if (A !== B && B !== C && A !== C) idx.push(A, B, C);
    }
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}
function creased(pos, idx, angleDeg = 35) {
  const cosT = Math.cos(angleDeg * Math.PI / 180), nf = idx.length / 3;
  const fn = new Float32Array(nf * 3), fu = new Float32Array(nf * 3);
  const vf = Array.from({ length: pos.length / 3 }, () => []);
  for (let f = 0; f < nf; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]], e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const n = vec3.cross([], e1, e2); fn.set(n, f * 3); const l = vec3.length(n) || 1; fu.set([n[0] / l, n[1] / l, n[2] / l], f * 3);
    vf[idx[f * 3]].push(f); vf[idx[f * 3 + 1]].push(f); vf[idx[f * 3 + 2]].push(f);
  }
  const outP = [], outN = [], outI = new Uint32Array(idx.length); const keyMap = new Map();
  for (let f = 0; f < nf; f++) for (let c = 0; c < 3; c++) {
    const vi = idx[f * 3 + c]; let nx = 0, ny = 0, nz = 0;
    for (const g of vf[vi]) {
      if (fu[f * 3] * fu[g * 3] + fu[f * 3 + 1] * fu[g * 3 + 1] + fu[f * 3 + 2] * fu[g * 3 + 2] >= cosT) { nx += fn[g * 3]; ny += fn[g * 3 + 1]; nz += fn[g * 3 + 2]; }
    }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const key = vi + ':' + Math.round(nx * 64) + ',' + Math.round(ny * 64) + ',' + Math.round(nz * 64);
    let id = keyMap.get(key); if (id === undefined) { id = outP.length / 3; keyMap.set(key, id); outP.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]); outN.push(nx, ny, nz); }
    outI[f * 3 + c] = id;
  }
  return { pos: new Float32Array(outP), nrm: new Float32Array(outN), idx: outI };
}
function prepare(mesh, key, prims, err) {
  const ck = mesh.getName() + '|' + key + '|' + err; if (cache.has(ck)) return cache.get(ck);
  const { pos, idx } = weldMerge(prims);
  let sidx = idx;
  if (idx.length > 36) {
    const target = Math.max(36, Math.floor(idx.length * RATIO / 3) * 3);
    let [res] = MeshoptSimplifier.simplify(idx, pos, 3, target, err, process.env.ABS ? ['ErrorAbsolute'] : []);
    if (!process.env.NOFB && res.length > idx.length * RATIO * 2.5 && idx.length > 3000) {
      // stubborn (disconnected CAD faces): fall back to sloppy clustering for this part
      const [sl] = MeshoptSimplifier.simplify(idx, pos, 3, target, Math.min(err * 8, 0.04), []);
      if (sl.length >= 3) res = sl;
    }
    if (res.length >= 3) sidx = res;
  }
  const out = creased(pos, sidx); cache.set(ck, out); return out;
}

function idx0(mesh,k){let n=0;for(const p of mesh.listPrimitives()) if(colKey(p.getMaterial())===k) n+=(p.getIndices()?.getCount()||0)/3; return n;}
function build(min, err) {
  cache.clear();
  const buckets = new Map(); let tris = 0, kept = 0;
  for (const part of parts) {
    if (part.diag < min) continue; kept++;
    const byCol = new Map();
    for (const p of part.mesh.listPrimitives()) { const k = colKey(p.getMaterial()); if (!byCol.has(k)) byCol.set(k, []); byCol.get(k).push(p); }
    const M = part.M, N = mat3.normalFromMat4([], M), flip = mat4.determinant(M) < 0;
    for (const [k, prims] of byCol) {
      const g = prepare(part.mesh, k, prims, err);
      if (!buckets.has(k)) buckets.set(k, { pos: [], nrm: [], exp: [], idx: [], base: 0 });
      const b = buckets.get(k), base = b.pos.length / 3, v = [0, 0, 0], n = [0, 0, 0];
      for (let i = 0; i < g.pos.length; i += 3) {
        vec3.transformMat4(v, [g.pos[i], g.pos[i + 1], g.pos[i + 2]], M); b.pos.push(v[0], v[1], v[2]);
        vec3.transformMat3(n, [g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]], N); vec3.normalize(n, n); b.nrm.push(n[0], n[1], n[2]); b.exp.push(...part.exp);
      }
      for (let i = 0; i < g.idx.length; i += 3) {
        if (flip) b.idx.push(base + g.idx[i], base + g.idx[i + 2], base + g.idx[i + 1]);
        else b.idx.push(base + g.idx[i], base + g.idx[i + 1], base + g.idx[i + 2]);
      }
      tris += g.idx.length / 3; if (process.env.TOP) { (globalThis.TOPS ||= []).push([part.mesh.getName() + ' ' + k, g.idx.length / 3, idx0(part.mesh, k), part.diag.toFixed(3)]); }
    }
  }
  return { buckets, tris, kept };
}

let r = build(MIN, ERR);
if (process.env.TOP) { const t=globalThis.TOPS.sort((a,b)=>b[1]-a[1]); console.log(t.slice(0,25).map(x=>x.join('  ')).join(String.fromCharCode(10))); }
console.log(`parts ${parts.length} kept ${r.kept}  tris ${r.tris}  min=${MIN} err=${ERR}`);
while (BUDGET && r.tris > BUDGET && RATIO > 0.005) {
  RATIO *= 0.7; MIN *= 1.1; r = build(MIN, ERR);
  console.log(`  -> tris ${r.tris} kept ${r.kept} min=${MIN.toFixed(4)} ratio=${RATIO.toFixed(4)}`);
}

// ---------- 3. write a clean document ----------
const doc = new Document(); const buf = doc.createBuffer();
const mesh = doc.createMesh('robot');
for (const [k, b] of r.buckets) {
  const rgb = k.split(',').map(Number);
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const lin = rgb.map(c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const mat = doc.createMaterial('c' + k).setBaseColorFactor([...lin, 1]).setRoughnessFactor(lum > 0.6 ? 0.45 : 0.62).setMetallicFactor(lum > 0.55 && Math.abs(rgb[0] - rgb[2]) < 0.05 ? 0.35 : 0.05).setDoubleSided(true);
  const prim = doc.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(b.pos)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(b.nrm)).setBuffer(buf))
    .setAttribute('_EXPLODE', doc.createAccessor().setType('VEC4').setArray(new Float32Array(b.exp)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(b.idx)).setBuffer(buf));
  mesh.addPrimitive(prim);
}
// label anchors: up to 6 instances per label, each [x,y,z, ox,oy,oz, delay] in model space
const LABELS = [
  ['Intake wheels', /WHEEL, FLEX/], ['Flywheels', /Rhino Wheel|Gecko Wheel/], ['Motors', /^5203 gearbox/],
  ['Mecanum drive', /^Roller$|^Wheel Core$|3615-4008-0096 rubber/], ['Control Hub', /Control Hub/], ['Odometry', /32mm Omni Wheel/],
  ['Webcam', /^Logitech_C920$/], ['Battery', /Slim Battery/],
];
const kept = parts.filter(p => p.diag >= MIN);
const labels = LABELS.map(([t, re]) => ({ t, pts: kept.filter(p => re.test(p.name)).slice(0, 6).map(p => [...p.ctr, ...p.exp].map(v => +v.toFixed(4))) })).filter(l => l.pts.length);
console.log('labels', labels.map(l => l.t + ':' + l.pts.length).join(', '));
doc.createScene().addChild(doc.createNode('robot').setMesh(mesh).setExtras({ labels }));
await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 8 }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(OUT, doc);
const { statSync } = await import('node:fs');
console.log(`wrote ${OUT}  ${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB  materials ${r.buckets.size}`);
