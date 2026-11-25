// Shift the CAD magenta (#991EAB-ish) to the team violet used in the logo and renders.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const srgb = (c) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const target = [0x7a, 0x2c, 0xd6].map(v => lin(v / 255));
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); let n = 0;
  for (const m of doc.getRoot().listMaterials()) {
    const [r, g, b] = m.getBaseColorFactor().slice(0, 3).map(srgb);
    if (r > 0.45 && b > 0.45 && g < 0.35 && Math.abs(r - b) < 0.3) {
      const k = (r + b) / 2 / 0.64; // keep relative lightness between purple parts
      m.setBaseColorFactor([target[0] * k, target[1] * k, target[2] * k, 1]); n++;
    }
  }
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(f, doc); console.log(f, 'recoloured', n);
}
