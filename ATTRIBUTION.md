# Data attribution

The Cut Gate terrain and route data (`public/data/terrain/cutgate.json`,
`public/data/routes/cutgate.json`) are derived from open UK geodata:

## Terrain

Contains public sector information licensed under the Open Government Licence v3.0.
© Environment Agency copyright and/or database right. Derived from the LIDAR Composite
Digital Terrain Model (DTM), via [environment.data.gov.uk](https://environment.data.gov.uk/survey).

## Route

© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0.

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

The ground texture and all sound effects/music are still generated procedurally
in-browser (see `src/terrain/HeightmapTerrain.js`, `src/audio/AudioManager.js`) as
placeholders — no external asset files are committed for those yet.

Recommended CC0 (public domain) sources for real replacements, to credit here once
something is added:

- **Ground texture** (PBR): [Poly Haven textures](https://polyhaven.com/textures) — drop
  at `public/assets/textures/ground.jpg`.
- **Sound effects**: [Freesound.org](https://freesound.org) (filter to CC0 license) or
  [Mixkit](https://mixkit.co/free-sound-effects/) — drop at
  `public/assets/audio/{wind,tire-roll,jump,crash}.mp3`.
- **Background music**: [OpenGameArt.org](https://opengameart.org) (search "CC0 music") —
  drop at `public/assets/audio/music.mp3`.

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
