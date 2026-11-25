import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(process.argv[2]);
const count = (n) => { let c = n.getMesh() ? 1 : 0; for (const k of n.listChildren()) c += count(k); return c; };
const show = (n, d) => { if (d > 3) return; const kids = n.listChildren(); if (kids.length || d < 2) console.log('  '.repeat(d) + (n.getName() || '(unnamed)') + '  meshes:' + count(n) + ' kids:' + kids.length); if (kids.length > 40 && d >= 1) return; kids.forEach(k => show(k, d + 1)); };
for (const s of doc.getRoot().listScenes()) s.listChildren().forEach(n => show(n, 0));
