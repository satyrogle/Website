# Draco decoder

Copied verbatim from `node_modules/three/examples/jsm/libs/draco/gltf/`. Not
authored here, not edited here.

`public/models/planet.glb` is Draco-compressed by
`tools/blender/build-planet.py`, so `PlanetModel` loads it through a
`DRACOLoader` pointed at this directory. Without these files the hero never
loads.

Three files, and each earns its place:

- `draco_wasm_wrapper.js` + `draco_decoder.wasm` — the path every real
  visitor takes. ~75 kB gzipped, fetched once, cached.
- `draco_decoder.js` — the fallback `DRACOLoader` requests only when
  `WebAssembly` is absent. No browser that runs WebGL2 is missing it, so
  this is never downloaded in practice; it is here so that an exotic client
  degrades to a slow hero rather than to no hero. Delete it if the deploy
  needs the 512 kB back.

**On upgrading three:** re-copy these from the new version. They are a
matched pair with the `DRACOLoader` in the bundle, and a decoder left behind
at an old version is the kind of break that shows up as a blank hero on
someone else's machine and nowhere in CI.
