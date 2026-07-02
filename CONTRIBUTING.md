# Contributing

Thanks for your interest in improving Peak District Downhill!

## Getting set up

```bash
npm install
npm run dev
```

This starts the Vite dev server at the URL printed in your terminal.

## Making changes

1. Create a branch off `main`.
2. Make your changes. Keep modules small and focused, following the existing
   structure under `src/` (`scene/`, `physics/`, `bike/`, `input/`, `terrain/`, `routes/`).
3. Confirm the app still builds: `npm run build`.
4. Open a pull request against `main`.

CI (`.github/workflows/ci.yml`) runs `npm ci && npm run build` on every push and pull
request to `main`. Your PR must build successfully before it can be merged.

## Updating Cut Gate terrain/route data

`public/data/**/*.json` are generated artifacts checked into git (like a lockfile) — you
normally don't need to touch them unless updating the route or resampling resolution.
See [`tools/terrain/README.md`](tools/terrain/README.md) for the manual data download
step and how to rerun the pipeline (`npm run terrain:build`).

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and
[release-please](https://github.com/googleapis/release-please) for versioning and
changelog generation. Prefix every commit subject with one of:

- `feat:` — a new feature (triggers a minor version bump)
- `fix:` — a bug fix (triggers a patch version bump)
- `docs:` — documentation only changes
- `chore:` — tooling, dependencies, config
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `perf:` — a performance improvement
- `test:` — adding or correcting tests

Add `!` after the type (e.g. `feat!:`) or a `BREAKING CHANGE:` footer for breaking
changes (triggers a major version bump).

Examples:

```
feat: add double jump
fix: prevent bike falling through ground on spawn
docs: document touch controls in README
```

## Releases

Releases are automated by [release-please](https://github.com/googleapis/release-please).
When commits with `feat`/`fix` land on `main`, release-please opens or updates a
release pull request that bumps `package.json`/`package-lock.json` and updates
`CHANGELOG.md`. Merging that pull request creates a GitHub Release and tag.

Don't hand-edit `CHANGELOG.md` or bump the version in `package.json` manually — let
release-please manage both from your Conventional Commit messages.
