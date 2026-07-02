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
  main.js                  # entry point and render/physics loop
  scene/setupScene.js      # Three.js scene, camera, renderer, lighting
  physics/setupWorld.js    # cannon-es physics world
  bike/BikeController.js   # bike movement, physics sync, camera follow
  input/InputController.js # keyboard and touch input handling
  style.css
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the development
workflow and commit message conventions.

## License

Released under the [MIT License](LICENSE).
