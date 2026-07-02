# Data attribution

The Cut Gate terrain, route and landcover data (`public/data/terrain/cutgate.json`,
`public/data/routes/cutgate.json`, `public/data/terrain/cutgate-landcover.json`) are
derived from open UK geodata:

## Terrain

Contains public sector information licensed under the Open Government Licence v3.0.
© Environment Agency copyright and/or database right. Derived from the LIDAR Composite
Digital Terrain Model (DTM), via [environment.data.gov.uk](https://environment.data.gov.uk/survey).

## Route & landcover

© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0. The
route is the Cut Gate bridleway way(s); landcover (woodland/rock/heather/track tinting)
is classified from `natural`/`landuse` tags on nearby OSM ways.

---

Until `npm run terrain:build` has been run with real source data (see
[`tools/terrain/README.md`](tools/terrain/README.md)), the committed data files are a
synthetic placeholder, not derived from either of the above sources — this is reflected
in their `source`/`license` fields and in the in-game credits overlay.

## Visual & audio assets

- **Bike model** (`public/assets/models/bike.glb`): "Bike" by Poly by Google, licensed
  [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/), via
  [Poly Pizza](https://poly.pizza/m/edNZoeH3lVP). Unlike the other assets below this is
  CC-BY, not CC0 — attribution is required, hence this entry.
- **Ground texture** (`public/assets/textures/ground.jpg`): by Amal Kumar, via
  [Poly Haven](https://polyhaven.com/textures), [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Sound effects & music** (`public/assets/audio/{wind,tire-roll,jump,crash,music}.mp3`):
  [Freesound.org](https://freesound.org), [CC0](https://creativecommons.org/publicdomain/zero/1.0/).

None of the above require attribution except the bike model, but all are listed here for
completeness.

Each of `BikeController.loadModel()`, `HeightmapTerrain.js`'s `loadRealGroundTexture()`
and `AudioManager.init()` already try to load a real file from these paths first,
falling back to the procedural placeholder only if none exists — so dropping a real
file in place is enough, no code changes needed.

A paid option also exists for sound effects/music: the
[ElevenLabs Sound Effects and Music APIs](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
can generate bespoke audio from a text description. Not integrated — it needs an API
key and costs money per generation — but if adopted later it should follow the same
pattern as `tools/terrain/`: a rerunnable dev-only script (e.g. `tools/audio/`) that
calls the API and commits the resulting file, rather than calling it at runtime.
