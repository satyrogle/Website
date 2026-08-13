# Draco decoder

Copied verbatim from `node_modules/three/examples/jsm/libs/draco/gltf/`. Not
authored here, not edited here.

`public/models/planet.glb` is Draco-compressed by
`tools/blender/build-planet.py`, so `PlanetModel` loads it through a
`DRACOLoader` pointed at this directory. Without these files the hero never
loads.

Two files: `draco_wasm_wrapper.js` + `draco_decoder.wasm`, the path every
real visitor takes. ~75 kB gzipped, fetched once, cached.

`draco_decoder.js` — the 512 kB pure-JS decoder `DRACOLoader` falls back to
when `WebAssembly` is absent — is deliberately **not** here. No browser that
runs WebGL2 lacks WebAssembly, so it was half a megabyte of deploy that
nobody ever fetched.

Because it is gone, `PlanetModel` refuses up front when `WebAssembly` is
missing, and the boot sequence drops that visitor into the readable
editorial site exactly as it does for a machine with no WebGL2. Do not
remove that guard while this directory has no JS decoder in it: a static
host answers a missing asset with `index.html` and a **200**, not a 404, so
the loader evaluates markup as JavaScript and the page dies in a half-state
instead of falling back cleanly.

**On upgrading three:** re-copy these from the new version. They are a
matched pair with the `DRACOLoader` in the bundle, and a decoder left behind
at an old version is the kind of break that shows up as a blank hero on
someone else's machine and nowhere in CI.
