# Peak District Downhill

[![CI](https://github.com/Joe-Heffer/Peak-District-Downhill/actions/workflows/ci.yml/badge.svg)](https://github.com/Joe-Heffer/Peak-District-Downhill/actions/workflows/ci.yml)
[![Deploy](https://github.com/Joe-Heffer/Peak-District-Downhill/actions/workflows/deploy.yml/badge.svg)](https://github.com/Joe-Heffer/Peak-District-Downhill/actions/workflows/deploy.yml)
[![Release](https://img.shields.io/github/v/release/Joe-Heffer/Peak-District-Downhill)](https://github.com/Joe-Heffer/Peak-District-Downhill/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A browser-based 3D mountain biking game set in the Peak District, built with
[Three.js](https://threejs.org/) and [cannon-es](https://github.com/pmndrs/cannon-es).

Play it live at **[joe-heffer.github.io/Peak-District-Downhill](https://joe-heffer.github.io/Peak-District-Downhill/)**.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer left | `←` / `A` | Left zone |
| Steer right | `→` / `D` | Right zone |
| Jump | `Space` / `↑` | Jump button |

## Getting started

Requires [Node.js](https://nodejs.org/) 20+.

```bash
npm install       # install dependencies
npm run dev       # start the dev server
npm run build     # build for production (outputs to dist/)
npm run preview   # preview the production build locally
```

## Project structure

```
src/
  main.js                  # entry point, async init, and render/physics loop
  scene/setupScene.js      # Three.js scene, camera, renderer, lighting
  physics/setupWorld.js    # cannon-es physics world + terrain heightfield
  bike/BikeController.js   # bike movement, terrain-aware grounding, camera follow
  input/InputController.js # keyboard and touch input handling
  terrain/                 # loads baked heightmap data, builds the terrain mesh
  routes/                  # loads baked route data, renders the decorative trail line
  style.css
public/data/
  terrain/cutgate.json     # baked heightmap for the Cut Gate descent (generated)
  routes/cutgate.json      # baked route polyline for the Cut Gate descent (generated)
tools/terrain/              # dev-only scripts that (re)generate the files above from
                             # real open geodata — see tools/terrain/README.md
```

## Data & attribution

The terrain and route are modelled on Cut Gate, a real Peak District bridleway descent,
using open UK geodata (Environment Agency LIDAR, OpenStreetMap). See
[`ATTRIBUTION.md`](ATTRIBUTION.md) for licensing details and
[`tools/terrain/README.md`](tools/terrain/README.md) for how to (re)generate the data.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the development
workflow and commit message conventions.

## License

Released under the [MIT License](LICENSE).
