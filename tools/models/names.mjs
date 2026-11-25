import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(process.argv[2]); const m = new Map();
for (const s of doc.getRoot().listScenes()) s.traverse(n => { if (!n.getMesh()) return; let p = n, name = ''; while (p && !name) { name = (p.getName() || '').replace(/^occurrence of /, ''); p = p.getParentNode?.() ; } m.set(name, (m.get(name) || 0) + 1); });
console.log([...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => v + ' ' + k).join('\n'));
