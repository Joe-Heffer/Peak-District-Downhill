# 3D asset generation: Nano Banana → Meshy AI

Prompted by a question about whether generating concept art with Google Gemini
**Nano Banana** (Gemini 2.5 Flash Image) and converting it to meshes with
**Meshy AI**'s image-to-3D is a good way to produce 3D game assets for this project.
Short answer: **yes for a specific subset of assets, no for others** — this doc says
which, why, and gives ready-to-paste prompts for the "yes" list.

## Is this the best way? Where it fits and where it doesn't

This pipeline is a genuinely good fit for **one-off hero props and characters that
don't need to match a procedural system**: something modelled once, placed a handful
of times, with no runtime generation logic depending on its internals. It is a **poor
fit for anything this codebase already generates procedurally**, because an
AI-generated mesh can't plug into that machinery without breaking the reason the
procedural approach was chosen in the first place:

| Already procedural/instanced | Why Meshy doesn't help |
| --- | --- |
| Terrain (`src/terrain/HeightmapTerrain.js`) | Baked from real LIDAR elevation data (`tools/terrain/`) — this is real Cut Gate topography, not a shape to art-direct. |
| Trees (`src/scenery/Scenery.js`, `cutgate-trees.json`) | Positions/heights are real LIDAR canopy detections (2,727 of them); `docs/vegetation-rendering.md` deliberately plans a lightweight trunk + cross-quad billboard canopy so thousands of instances stay cheap on mobile. A Meshy mesh (real-ish topology + baked PBR textures) is the wrong shape and poly/texture budget for something instanced thousands of times. |
| Scatter rocks (`buildRockMatrices`) | Same instancing-budget problem, plus they're meant to be cheap, uniform, seed-reproducible (`Scenery.test.js` expects deterministic output) — an imported mesh doesn't change that, it just adds an unnecessary asset-loading dependency to something an `IcosahedronGeometry` already does fine. |
| Ground texture/detail (`RockTrackTexture.js`) | `docs/procedural-generation.md` already recommends coherent noise here, in-engine — a generated image would be a static file where the codebase wants a rule. |

Good candidates are the opposite shape: **static, non-instanced, one or a few
placements, currently a rough primitive placeholder or missing entirely.** The
codebase already has the exact drop-in pattern this pipeline needs —
`src/bike/BikeController.js` loads `public/assets/models/bike.glb` via `GLTFLoader`
and falls back to a procedural placeholder (`createPlaceholderBikeModel()`) if the
file is missing or fails to load. That fallback pattern is worth keeping for every
new model this pipeline produces, exactly as `bike.glb` already does.

## Practical caveats before committing to this workflow

- **Style drift.** Meshy's image-to-3D bakes PBR textures from the source image's
  shading — that pulls toward "photoreal-ish game asset" and away from this game's
  flat cel-shaded `MeshStandardMaterial` look (see `docs/style-guide.md`'s art
  direction paragraph: "chunky simplified forms rather than photoreal detail"). Expect
  to strip/flatten the generated texture to a few flat colours (or re-bake a simple
  vertex-colour material) rather than ship Meshy's default output as-is — this matches
  how `bike.glb` and `Scenery.js` already use flat-coloured materials, not textures.
- **Poly count and texture size.** This is a real-time mobile-capable browser game
  (touch controls, `shadowMap.enabled = false`, far plane pushed to 10000 already
  straining the budget). Meshy's raw output is typically tens of thousands of
  triangles with a 2K+ texture — always decimate/retopo and shrink textures (Blender's
  decimate modifier, or `gltf-transform`/`gltfpack` for an automated CLI pass) before
  committing a model. No such tooling is in `package.json` yet — add it only if this
  pipeline gets adopted for real, not speculatively.
- **Units.** `bike.glb`'s comment in `BikeController.js` notes it ships in
  millimetres, requiring a `MODEL_SCALE = 0.001` fudge at load time. Export new
  models in metres directly so future loaders don't need the same workaround.
- **Rigging.** The in-game rider (`createRiderModel()`) isn't a bone-skinned
  character — it's a rigid torso+head group rotated as a whole by
  `updateRiderPose()`. A Meshy-generated rider mesh can drop in the same way (one
  rigid mesh swapped in for the torso+head primitives) **without** needing Meshy's
  auto-rig feature at all, which sidesteps a whole class of "does the auto-rig
  actually match our pose-blend pivot" risk. There's currently no `MODEL_URL`-style
  loader for the rider the way there is for the bike — wiring that up is a small,
  separate follow-up (not part of this doc), not a blocker for generating the concept
  art now.
- **Licensing.** Verify Meshy's output-ownership/commercial-use terms before shipping
  a generated mesh in a game distributed on itch.io/GitHub Pages (see
  `docs/itch-io.md`) — check at the time you actually generate, since AI-platform
  terms change.

## Recommended workflow

1. **Generate concept art in Nano Banana**, reusing the art direction paragraph from
   [`concept-art-prompts.md`](concept-art-prompts.md#art-direction-paragraph-reuse-this-in-every-prompt)
   for palette/mood consistency with existing concept art — but composed differently
   from those prompts: **plain neutral background, single unoccluded subject, no
   motion blur/dramatic environment**, since Meshy's depth estimation needs one clean
   silhouette, not an atmospheric scene.
2. Where possible, generate a **turnaround (front/side/back)** of the same subject in
   one conversation (Nano Banana holds character/style consistency across a chat well
   — see the existing doc's tip about feeding an image back in as a reference) and
   feed multiple views into Meshy's multi-image-to-3D mode for a more accurate mesh
   than single-image reconstruction.
3. **Meshy AI → Image-to-3D** (or Multi-Image-to-3D). Pick the lower/standard poly
   preset over the highest-fidelity one — easier to add detail later than remove it.
4. **Decimate + flatten textures** (Blender, or a scripted `gltf-transform` pass) down
   to a poly/texture budget appropriate for a mobile-capable instanced/one-off prop —
   no hard number is set in this codebase yet; size to roughly match `bike.glb`'s
   existing ~280 KB footprint as a sanity check, not a hard ceiling.
5. Export **GLB, in metres**, drop into `public/assets/models/`, wire a `MODEL_URL` +
   `GLTFLoader` load with a quiet-failure fallback to the existing procedural
   placeholder — the same resilience pattern `BikeController.js` already uses.
6. Confirm in-browser: load the model, sanity-check scale/orientation against the
   physics chassis/terrain as `BikeController.js`'s comments describe doing for
   `bike.glb`.

## Asset candidates

| Asset | Current state | Why it fits this pipeline |
| --- | --- | --- |
| Rider character (Gravity / Grit) | Procedural capsule + sphere placeholder (`createRiderModel()`) | One rigid mesh, no instancing, currently the roughest-looking placeholder in the game |
| Waymarker / bridleway signpost | Doesn't exist yet | Static, placed once or twice along the route, not part of any scatter system |
| Wooden stile / kissing gate | Doesn't exist yet | Same — one-off trailside prop |
| Dry-stone wall segment | Doesn't exist yet (walls are mentioned throughout art docs, not yet modelled) | Modular but hand-placed, not instanced at scatter-scale |
| Abandoned stone sheepfold | Referenced in `style-guide.md`'s storm-light mood art, not modelled | Landmark prop, single placement |
| Wooden footbridge / stream crossing | Doesn't exist yet | Single placement, functional trail landmark |
| Cattle grid | Doesn't exist yet | Single placement, small hard-surface prop |
| Hero gritstone tor/outcrop | Distinct from the generic `IcosahedronGeometry` scatter rocks — a one-off landmark boulder formation | Large, unique silhouette, worth real detail unlike the cheap scatter rocks |
| Start/finish gate or banner | Doesn't exist yet | Single placement, reads clearly as a landmark |

## Image generation prompts

Each prompt below opens with the same **art direction paragraph** used in
`concept-art-prompts.md` for visual consistency with existing concept art, then adds
a **3D-conversion framing** clause (plain background, clean single silhouette,
turnaround where useful) that the original 2D marketing-art prompts don't need.

> Reuse this exact paragraph at the start of every prompt below:
>
> "Stylized 3D-rendered illustration, somewhere between a modern arcade sports game
> (Tony Hawk's Pro Skater, SSX) and a British countryside travel poster: bold graphic
> shapes, clean cel-shaded lighting with soft ambient occlusion, chunky simplified
> forms rather than photoreal detail, subtle painterly texture in the skies and
> foliage. Colour palette: heather purple and burnt-heather magenta, gritstone grey
> and charcoal, bracken orange and moss green, overcast slate-blue sky breaking to
> warm gold at the horizon. Setting is real Yorkshire/Derbyshire gritstone moorland."

### 1. Rider — Gravity, 3D-conversion turnaround

```
[Art direction paragraph.] Full-body turnaround of "Gravity", a female downhill
mountain biker in her mid-20s: three views side by side on a single flat neutral
grey studio background — front, side (left profile), back — standing in a neutral
A-pose, full-face helmet on, riding gear: fitted enduro jersey in heather-purple and
charcoal with a gritstone-grey & bracken-orange stripe, padded shorts over leggings,
knee pads, flat-pedal shoes. No bike, no background scenery, no motion blur, no
cast shadow on the ground — flat, even studio lighting so silhouette and proportions
read clearly from every angle for 3D reconstruction.
```

### 2. Rider — Grit, 3D-conversion turnaround

```
[Art direction paragraph.] Full-body turnaround of "Grit", a male downhill mountain
biker in his late 20s, stocky build: three views side by side on a single flat
neutral grey studio background — front, side (left profile), back — standing in a
neutral A-pose, full-face helmet on, riding gear: looser-fit enduro jersey in
bracken-orange and charcoal with a gritstone-grey & heather-purple stripe, armoured
shorts, elbow pads, scuffed flat-pedal shoes. No bike, no background scenery, no
motion blur, no cast shadow on the ground — flat, even studio lighting so silhouette
and proportions read clearly from every angle for 3D reconstruction.
```

### 3. Waymarker / bridleway signpost

```
[Art direction paragraph.] A single weathered wooden bridleway waymarker post with a
carved horse-and-rider bridleway roundel and a small directional arm, standing alone
on a plain neutral grey studio background, no ground plane texture, no cast shadow,
front-three-quarter angle, even lighting, isolated on the background so the full
silhouette (post, roundel, arm) is unoccluded for 3D reconstruction.
```

### 4. Wooden stile through a dry-stone wall

```
[Art direction paragraph.] A simple wooden stile (a few horizontal plank steps over
a low section of dry-stone wall) shown as an isolated prop on a plain neutral grey
studio background, three-quarter angle, no surrounding landscape, even studio
lighting, full silhouette of both the stile timber and the short wall section it's
set into clearly visible and unoccluded.
```

### 5. Dry-stone wall segment (modular prop)

```
[Art direction paragraph.] A single straight modular section of dry-stone wall
(roughly 2 metres long), coursed gritstone blocks with a capstone row on top, shown
isolated on a plain neutral grey studio background, front-on and one three-quarter
angle side by side, even lighting, clean square-cut ends on both sides so the piece
reads as a repeatable tileable segment.
```

### 6. Abandoned stone sheepfold

```
[Art direction paragraph.] A small abandoned circular/oval dry-stone sheepfold
enclosure, weathered and partly collapsed on one side, heather growing in the
cracks, shown isolated on a plain neutral grey studio background, three-quarter
elevated angle so both the inner and outer wall faces are visible, even lighting,
no surrounding moorland.
```

### 7. Wooden footbridge / stream crossing

```
[Art direction paragraph.] A short rustic wooden footbridge with simple plank
decking and a single handrail on one side, weathered grey-brown timber, isolated on
a plain neutral grey studio background, three-quarter angle, even lighting, no
water or landscape beneath it — just the bridge structure fully visible and
unoccluded.
```

### 8. Cattle grid

```
[Art direction paragraph.] A simple metal cattle grid set into a short section of
flanking dry-stone wall on each side, weathered galvanised-steel bars, isolated on a
plain neutral grey studio background, front-three-quarter angle, even lighting, no
road surface texture beyond the grid's own frame.
```

### 9. Hero gritstone tor / outcrop (landmark boulder formation)

```
[Art direction paragraph.] A single dramatic stacked gritstone boulder formation (in
the style of a Peak District tor), wind-carved and weathered, heather growing in the
cracks, shown as an isolated landmark object on a plain neutral grey studio
background, three-quarter angle, even lighting, no sky or distant landscape — the
rock formation's full silhouette and surface detail clearly readable for 3D
reconstruction. This is a one-off hero rock for a landmark placement, distinct from
the small generic scatter rocks already in `Scenery.js`.
```

### 10. Start/finish gate

```
[Art direction paragraph.] A simple wooden trail gate/arch structure suitable for a
start or finish line, two upright posts and a crossbeam, weathered timber with a
small hand-painted trail-name sign hanging from the crossbeam (blank/placeholder
text), isolated on a plain neutral grey studio background, front-on view, even
lighting, no surrounding scenery.
```

## Out of scope (deliberately not proposed here)

- **Terrain, trees, scatter rocks, grass** — already real-data-driven or
  intentionally cheap/instanced; see the table above and `docs/vegetation-rendering.md`
  / `docs/procedural-generation.md` for why those stay procedural.
- **Replacing `bike.glb`** — it already works and its provenance/licensing isn't
  documented here; regenerate it through this pipeline only if there's a specific
  reason to (visual mismatch, licensing concern), not as a default part of adopting
  this workflow.
- **Automating the Meshy step** — Meshy has an API, but there's no evidence yet this
  project needs more than a handful of hero assets; a manual, reviewed pass on the
  ~10 candidates above is worth doing before investing in a scripted pipeline.
