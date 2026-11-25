# Site tools

Nothing in this folder is served. It rebuilds the 3D viewer bundle and the robot models.

```
cd tools
npm install
```

## 3D scene

Source: `viewer/scene.js`. Build to `../js/scene3d.js` with `npm run build:scene`.

The robot section of `index.html` (`[data-scene]`) is one sticky full-screen canvas. Each `.step`
inside it sets the pose for that point of the scroll:
`data-model` (stinger or patriot), `data-explode` (0 to 1), `data-yaw`, `data-pitch`, `data-zoom`,
`data-side` (where the robot sits on wide screens) and `data-labels="on"` for part labels.
Edit those attributes to change the camera moves; no rebuild needed.

## Converting an Onshape export

Onshape GLB exports are hundreds of MB. `models/convert.mjs` drops fasteners under ~1 cm, welds and
simplifies each part to a fixed error in metres, merges parts by colour and writes a meshopt-compressed GLB.
Every vertex carries its part's exploded-view offset (`_EXPLODE`), and part labels are found by name
(the `LABELS` list in the script).

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
