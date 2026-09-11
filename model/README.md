# Put your Meshy model here

The page looks for these files, in this order, and uses the first one it
finds. If none are here it falls back to a placeholder shape, so the site
never breaks while you are still deciding.

1. `model.glb`
2. `model.gltf`
3. `model.obj`

## The easy way — GLB

In Meshy, download the model as **GLB**. That is a single file with the
textures baked inside, which matters a lot when you are uploading from an
iPad.

Upload it into this folder and rename it to **`model.glb`**. Done.

## The OBJ way

Meshy's OBJ download is a zip containing three or four files, roughly:

```
0198fa3c_texture.obj
0198fa3c_texture.mtl
0198fa3c_texture_diffuse.png
```

Upload **all of them** into this folder, then rename only the `.obj` to
**`model.obj`**. Leave the `.mtl` and the texture names exactly as they are —
the `.obj` names its own material file internally, and the page follows that,
so the original names keep working.

## Uploading from an iPad

On github.com, open this folder → **Add file** → **Upload files** → drag the
files in → **Commit changes**. To rename after uploading, tap the file, then
the pencil icon, and edit the name in the box at the top.

If Safari will not let you into a zip, the Files app can unzip it first: long
press the zip → Uncompress.

## If it comes in sideways, or too big, or too small

Height is normalised automatically, so scale is never something you need to
fix here — how large the object looks on the page is the `--stage` line at the
top of `../index.html`. Rotation sometimes does need fixing. Open `../assets/scene.js` and edit:

```js
export const MODEL_ORIENTATION = { x: 0, y: 0, z: 0 };
```

Those are degrees. A model that is lying on its back usually wants
`{ x: -90, y: 0, z: 0 }`. Turning it to face you is the `y` value.
