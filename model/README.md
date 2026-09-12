# The model

`model.glb` is here and live on the page — a chrome "e" monogram, 3,042
triangles with a baked base-colour map and a metallic/roughness map.

## It has been optimised — don't overwrite it with a raw export

The file Meshy produced was **11.8 MB**, almost all of it texture: a
2048×2048 base colour map and a 4096×4096 metallic/roughness map. The object
renders about 110 pixels tall, so that was roughly twenty times more texture
than the page can show, and every visitor would have paid for it.

What is committed is **516 KB** and pixel-for-pixel indistinguishable from the
original at display size — under 0.01% of pixels differ by more than 8/255.

## Redoing it after a new export

If you re-export from Meshy, run the new file through this before committing.
It needs Node; it does not run on an iPad, so ask me and I'll do it.

```sh
npm install @gltf-transform/cli

# 1. Cap every texture at 512px (plenty for a ~110px render, even on retina).
gltf-transform resize new-export.glb step1.glb --width 512 --height 512

# 2. Base colour is a picture -> JPEG. Note --formats png: without it the
#    command only touches textures that are already JPEG and silently does
#    nothing.
gltf-transform jpeg step1.glb step2.glb --formats png \
  --slots "baseColorTexture" --quality 90

# 3. Metallic/roughness is data, not a picture. Keep it lossless.
gltf-transform prune step2.glb model.glb
```

Geometry is deliberately left uncompressed. At 117 KB it is not worth adding
a Draco or Meshopt decoder to the page for.

There is a smaller variant possible — the metallic/roughness map is nearly
constant (metallic ≈ 0.93, roughness ≈ 0.26), so replacing it with plain
material factors gives **182 KB**. It was not used, because it visibly alters
the material rather than just compressing it. Worth revisiting only if the
page ever needs to be leaner.

## Replacing the model

Drop a new file in this folder. The page tries, in order:

`model.glb` → `Model.glb` → `model.gltf` → `Model.gltf` → `model.obj` → `Model.obj`

Both capitalisations work, so an export with a capital M needs no renaming.
If none is found, a placeholder shape drifts instead and the site still works.

For an OBJ, upload the `.obj`, the `.mtl` and the texture together; the page
reads the `mtllib` line inside the `.obj`, so the material and texture files
keep their original export names.

## If it comes in sideways

Height and width are fitted automatically, so scale never needs fixing here —
how large it looks on the page is the `--stage` line at the top of
`../index.html`. Rotation sometimes does need a nudge, in `../assets/scene.js`:

```js
export const MODEL_ORIENTATION = { x: 0, y: 0, z: 0 };
```

Degrees. The current model needs none of these.
