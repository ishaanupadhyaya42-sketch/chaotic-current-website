# Site tools

Nothing in this folder is served. It rebuilds the 3D viewer bundle and the robot models.

```
cd tools
npm install
```

## 3D viewer

Source: `viewer/viewer.js`. Build to `../js/viewer3d.js` with `npm run build:viewer`.
Each `[data-viewer]` element on a page sets `data-model` (desktop file), `data-lite` (phones and
low-memory devices), `data-yaw` (starting angle) and `data-front` (yaw, in radians, that faces the robot's front).

## Converting an Onshape export

Onshape GLB exports are hundreds of MB. `models/convert.mjs` drops fasteners under ~1 cm, welds and
simplifies each part to a fixed error in metres, merges parts by colour and writes a meshopt-compressed GLB.

```
ABS=1 NOFB=1 node --max-old-space-size=20000 models/convert.mjs Robot.glb ../assets/models/robot.glb      --min 0.009 --err 0.0006 --ratio 0.001
ABS=1 NOFB=1 node --max-old-space-size=20000 models/convert.mjs Robot.glb ../assets/models/robot-lite.glb --min 0.011 --err 0.0016 --ratio 0.001
node models/recolor.mjs ../assets/models/robot.glb ../assets/models/robot-lite.glb   # CAD magenta -> team violet
```

Aim for about 2.5 MB desktop and 1.2 MB lite.

## Poster images

Each viewer shows `assets/models/<name>-poster.webp` until the model loads. To redo one, serve the
site root with a server that saves `POST /save?name=...` to disk, open
`/tools/viewer/poster.html?m=<name>&yaw=<angle>`, then convert the PNG to WebP at 1200 and 600 px wide.
