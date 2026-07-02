# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Peak District Downhill is a browser-based 3D mountain biking game rendered with
[Three.js](https://threejs.org/) and simulated with [cannon-es](https://github.com/pmndrs/cannon-es),
built and served with [Vite](https://vitejs.dev/). Plain JavaScript (ES modules) —
no TypeScript, no UI framework, no test runner, no linter currently configured.

## Commands

```bash
npm install       # install dependencies
npm run dev       # start the Vite dev server (--host)
npm run build     # production build, outputs to dist/
npm run preview   # preview the production build (--host)
```

There is no test or lint command yet. `npm run build` is the only automated
correctness check (run by CI on every push/PR to `main`).

## Structure

- `index.html` — page shell, loads `src/main.js` as a module script.
- `src/main.js` — wires up the scene, physics world, bike, and input, then runs the
  render/physics tick loop.
- `src/scene/setupScene.js` — Three.js scene, camera, renderer, lighting, ground plane.
- `src/physics/setupWorld.js` — cannon-es world and ground body.
- `src/bike/BikeController.js` — bike mesh/body, steering, jump, camera follow.
- `src/input/InputController.js` — keyboard and on-screen touch control state.
- `vite.config.js` — sets `base` to `/Peak-District-Downhill/` under GitHub Actions
  (GitHub Pages subpath), `/` otherwise.

## CI/CD

- `.github/workflows/ci.yml` — installs and builds on push/PR to `main`.
- `.github/workflows/deploy.yml` — builds and deploys `dist/` to GitHub Pages on push
  to `main`.
- `.github/workflows/release-please.yml` — maintains a release PR and cuts GitHub
  Releases from Conventional Commits on `main` (config: `release-please-config.json`,
  `.release-please-manifest.json`).

## Commit conventions

Commits on `main` must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `chore:`, `docs:`, etc.) — release-please parses them to determine
version bumps and changelog entries. See `CONTRIBUTING.md` for details.
