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
3. Add or update tests: unit tests are colocated as `*.test.js` next to the file you
   changed (`npm test` to run them, `npx vitest` to watch); for changes touching the
   whole page (input wiring, credits text, overall load), also consider the e2e suite
   under `e2e/` (`npm run build && npm run test:e2e`).
4. Confirm the app still builds: `npm run build`.
5. Open a pull request against `main`. If it resolves an open issue, link the two so
   merging the PR closes the issue automatically — include a closing keyword such as
   `Closes #123` in the PR description (see [GitHub's docs on linking a pull request to
   an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)).
   The PR template includes a spot for this.
6. **Merge with "Squash and merge"**, not "Create a merge commit". This repo's merge
   button should have "Allow merge commits" disabled (GitHub repo Settings → General →
   Pull Requests) — see the note under [Releases](#releases) for why.

CI (`.github/workflows/ci.yml`) runs three independent jobs on every push and pull
request to `main`: `npm run build`, `npm test` (Vitest unit tests), and `npm run
test:e2e` (Playwright e2e smoke test). Your PR must pass all three before it can be
merged.

## Updating Cut Gate terrain/route data

`public/data/**/*.json` are generated artifacts checked into git (like a lockfile) — you
normally don't need to touch them unless updating the route or resampling resolution.
See [`tools/terrain/README.md`](tools/terrain/README.md) for the manual data download
step and how to rerun the pipeline (`npm run terrain:build`).

Neither CI nor the Pages deploy workflow runs `terrain:build` — they only run `npm run
build` (the Vite bundle). The live site always reflects whatever is already committed
under `public/data/`, so if that's still the synthetic placeholder, the deployed game
will show it (and the in-game notice) until someone runs `terrain:build` with real
source data and commits the result.

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

**PRs into `main` must be squash-merged, not merged with a merge commit.** release-please
walks `main`'s commit history to build the changelog. A regular merge commit's message
body echoes the PR's conventional-commit title (e.g. `feat: ...`), so if the PR's own
commit(s) are *also* still reachable on `main` (which they are, with a real merge
commit), release-please parses both the merge commit and the original commit as
separate entries with the same description — producing duplicate changelog lines (see
[#18](https://github.com/Joe-Heffer/Peak-District-Downhill/pull/18)). Squash-merging
collapses each PR to a single commit, so this can't happen; it's also what the
[release-please docs recommend](https://github.com/googleapis/release-please#linear-git-commit-history-for-appropriately-updating-releases)
for a linear, bisectable history.
