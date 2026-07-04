# Publishing to itch.io

The game is playtestable on itch.io at
**[joe-heffer.itch.io/gravity-and-grit](https://joe-heffer.itch.io/gravity-and-grit)**,
in parallel with the [GitHub Pages build](https://joe-heffer.github.io/Peak-District-Downhill/).
This is a separate build target because itch.io's embedded HTML5 games are served from a
per-upload path that isn't known ahead of time, unlike the fixed `/Peak-District-Downhill/`
subpath GitHub Pages uses — see `vite.config.js`'s `mode === 'itch'` branch, which builds
with a relative (`./`) base instead. The app already resolves every runtime asset/data fetch
through `import.meta.env.BASE_URL` (see `CLAUDE.md`), so a relative base is enough to make it
work from any path.

## Build and package

```bash
npm run build:itch     # production build with a relative base, output to dist-itch/
npm run package:itch   # build:itch, then zip dist-itch/ into peak-district-downhill-itch.zip
```

`npm run package:itch` requires the `zip` command-line tool (already present on most dev
machines and CI runners; install via your package manager if missing).

## Automated deploy (CI)

`.github/workflows/itch-deploy.yml` builds with `npm run build:itch` and pushes `dist-itch/`
straight to the `gravity-and-grit` project on itch.io using
[butler](https://itch.io/docs/butler/) (installed via the officially-documented
[`remarkablegames/setup-butler`](https://github.com/marketplace/actions/setup-butler)
action, then run directly as `butler push`)
on every push to `main`, or on demand via `workflow_dispatch`. It pushes to the `html5`
channel; butler creates that channel automatically on its first push if it doesn't exist yet,
including the *first upload ever* for the project. What it does **not** do is set the embed
viewport, "Fullscreen button", or "Mobile friendly" options — after the first CI push, go to
the [itch.io dashboard](https://joe-heffer.itch.io/gravity-and-grit) → **Edit game** →
**Uploads**, confirm the `html5` channel's upload has **"This file will be played in the
browser"** ticked (butler-created HTML5 channels normally get this automatically, but verify),
and set the viewport/fullscreen/mobile options described in the manual steps below. That's a
one-time step; subsequent CI pushes just update the same channel's content.

This workflow needs a `BUTLER_API_KEY` repository secret:

1. Generate an API key at
   [itch.io/user/settings/api-keys](https://itch.io/user/settings/api-keys) — simplest, no local
   butler install needed. Alternatively, [install butler
   locally](https://itch.io/docs/butler/installing.html) (it's a standalone binary, not an npm
   package) and run `butler login`, then read the key from your local credentials file
   (`~/.config/itch/butler_creds` on Linux) or from the same API keys page (look for the key with
   source `wharf`).
2. In the GitHub repo, go to **Settings → Secrets and variables → Actions** and add a
   repository secret named `BUTLER_API_KEY` with that value.

Without the secret set, the workflow's publish step will fail — the build/package steps
still run, so CI failures there are unrelated to itch.io credentials.

## Uploading (manual, one-off or per-release)

1. Run `npm run package:itch`.
2. On the [itch.io project page](https://joe-heffer.itch.io/gravity-and-grit) dashboard, go to
   **Edit game** → **Uploads**.
3. Upload `peak-district-downhill-itch.zip` and tick **"This file will be played in the
   browser"**.
4. Set the embed viewport — this game targets a fullscreen/responsive canvas, so use a large
   viewport (e.g. 1280×720) and enable **"Fullscreen button"** and **"Mobile friendly"**.
5. Save, then load the project page and play through end-to-end: terrain should load, the bike
   should be controllable, and the browser console should show no 404s (check the network tab
   for `data/...` and `assets/...` requests).

## Page styling and images

The itch.io **Edit game** → **Theme** tab has fields for the page's BG/BG2/Text/Link
colours, a font picker, and Banner/Background/Embed background image uploads (plus a
separate Cover image field back on the main **Edit game** tab). See
[`style-guide.md`](style-guide.md#itchio-page-setup) for the recommended colour values
and the concept-art crops to upload for each field — they're saved under
[`images/itch-io/`](images/itch-io/).

## Project page description (draft)

> **Gravity & Grit: Peak District Downhill**
>
> A free browser-based 3D downhill mountain-biking game. Ride real Peak District bridleways —
> the game currently models Cut Gate, a classic Peak District descent — using real elevation
> and trail data (Environment Agency LIDAR, OpenStreetMap). Built with Three.js and cannon-es.
>
> Controls: arrow keys/WASD to steer, boost and brake, space/up to jump. Touch controls are
> available on mobile.
>
> **This is an early playtesting build** — the game is still in active development ahead of a
> 1.0 release. We'd love feedback on:
> - **Framerate/performance** on your device
> - **Controls** — do steering, boosting, braking and jumping feel responsive and fair?
> - **Route feel** — does the descent feel like a real trail? Too easy, too hard, too long/short?
> - **Bugs** — anything that crashes, clips through terrain, or otherwise looks/feels broken
>
> Leave a comment on this page or open an issue on
> [GitHub](https://github.com/Joe-Heffer/Peak-District-Downhill/issues) — every report helps
> before 1.0.

## Devlog post (draft)

**Title:** Playtesting build is up — we want your feedback

> Gravity & Grit is now playable here on itch.io for public playtesting ahead of our 1.0
> release. The game recreates Cut Gate, a real Peak District bridleway descent, from actual
> LIDAR elevation and OpenStreetMap trail data.
>
> We're specifically looking for feedback on:
> - **Framerate** — does it run smoothly on your machine/browser?
> - **Controls** — steering, boosting, braking, and jumping should feel tight and readable
> - **Route feel** — does the trail feel authentic, and is the difficulty right?
> - **Bugs** — terrain clipping, physics glitches, audio issues, anything else broken
>
> Comment below or file an issue on
> [GitHub](https://github.com/Joe-Heffer/Peak-District-Downhill/issues) — thanks for playing!
