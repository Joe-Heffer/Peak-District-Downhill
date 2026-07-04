# Gravity & Grit: Peak District Downhill

[![CI](https://github.com/Joe-Heffer/Peak-District-Downhill/actions/workflows/ci.yml/badge.svg)](https://github.com/Joe-Heffer/Peak-District-Downhill/actions/workflows/ci.yml)
[![Deploy](https://github.com/Joe-Heffer/Peak-District-Downhill/actions/workflows/deploy.yml/badge.svg)](https://github.com/Joe-Heffer/Peak-District-Downhill/actions/workflows/deploy.yml)
[![Release](https://img.shields.io/github/v/release/Joe-Heffer/Peak-District-Downhill)](https://github.com/Joe-Heffer/Peak-District-Downhill/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A browser-based 3D mountain biking game set in the Peak District, built with
[Three.js](https://threejs.org/) and [cannon-es](https://github.com/pmndrs/cannon-es).
Ride as **Gravity** and **Grit** down real Peak District bridleways — see
[issue #28](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/28) for the
naming decision, [`docs/concept-art-prompts.md`](docs/concept-art-prompts.md) for
the concept art direction, and [`docs/style-guide.md`](docs/style-guide.md) for the
resulting colour palette and branding rules.

Play it live at **[joe-heffer.github.io/Peak-District-Downhill](https://joe-heffer.github.io/Peak-District-Downhill/)**,
or on **[itch.io](https://joe-heffer.itch.io/gravity-and-grit)** — the game is in active
playtesting ahead of a 1.0 release, so feedback on framerate, controls, route feel, and bugs
is very welcome (comment on the itch.io page or [open an
issue](https://github.com/Joe-Heffer/Peak-District-Downhill/issues)).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer left | `←` / `A` | Left zone |
| Steer right | `→` / `D` | Right zone |
| Boost | `W` / `↑` | Boost button |
| Brake | `↓` / `S` | Brake button |
| Jump | `Space` | Jump button |

Gravity and the terrain carry the bike along on their own — boost is a short,
strong burst of extra speed to fire on demand, most useful just before a jump to
clear a bigger gap. It draws down a stamina bar (shown top-left); once it's
empty, boosting does nothing until stamina recovers by coasting or braking.

Other controls: the speaker icon (top-right) mutes/unmutes the music, and
`` ` `` (backquote) toggles the dev-tools panel (stats, log console, and admin
commands).

## Getting started

Requires [Node.js](https://nodejs.org/) 20+.

```bash
npm install       # install dependencies
npm run dev       # start the dev server
npm run build     # build for production (outputs to dist/)
npm run preview   # preview the production build locally
```

See [`docs/itch-io.md`](docs/itch-io.md) for building and publishing the itch.io release
(`npm run build:itch` / `npm run package:itch`).

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

## Generative AI usage

This project's code was largely written with the help of generative AI — see
[`AI_USAGE.md`](AI_USAGE.md) for details.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the development
workflow and commit message conventions.

## License

Released under the [MIT License](LICENSE).
