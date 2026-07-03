# Gravity & Grit — colour scheme & style guide

A practical reference for keeping the game, its store pages, and any marketing in one
consistent visual identity. This grounds the mood described in
[`concept-art-prompts.md`](concept-art-prompts.md) into concrete hex values and rules,
and reconciles it with the colours already shipping in `src/style.css` and
`public/manifest.webmanifest`.

Concept art referenced throughout this doc lives in [`images/concept-art/`](images/concept-art/);
itch.io-ready crops live in [`images/itch-io/`](images/itch-io/) — see
[Asset inventory](#asset-inventory) at the bottom.

## Colour palette

Sampled from the concept art (gritstone rock, heather moorland, the logo lockup) and
reconciled with the colours already in the codebase, so the palette below is what's
actually in use, not an aspirational alternative.

| Swatch | Name | Hex | Used for |
| --- | --- | --- | --- |
| 🟪 | Heather Charcoal | `#2A2433` | Dark backgrounds — already the `theme_color`/`og`-adjacent purple-charcoal in `index.html` and `manifest.webmanifest` (`#3d2f56` is the lighter sibling below) |
| 🟪 | Heather Purple | `#3D2F56` | Existing `theme-color` meta / manifest `theme_color`. Secondary panel backgrounds, "Grit" accent letterforms |
| 🟧 | Bracken Orange | `#C6702F` | Primary accent — logo "Gravity" letterforms, links, CTAs |
| 🟫 | Gritstone Grey | `#8A8478` | Rock texture, neutral UI chrome, secondary text on dark |
| ⬛ | Ink / Outline | `#241F26` | Logo bevels/outlines, darkest UI chrome |
| 🟩 | Moss Green | `#5E7A3F` | Muted foliage accent, dark-mode success/positive state |
| 🟩 | Bracken Green (bright) | `#6CC24A` | Existing `#stamina-bar-fill` colour — keep as the one bright HUD green |
| 🟦 | Slate Blue (sky) | `#4C5A72` | Concept-art stormy sky; use for moody backgrounds, loading screens |
| 🟨 | Horizon Gold | `#E0A458` | Warm rim-light accent, hover/highlight states |
| ⬜ | Parchment | `#EDE6DC` | Body text on dark backgrounds, waymarker-post white |

In-game HUD colours (`src/style.css`) are intentionally brighter/more saturated than the
moody marketing palette above, because they need to read at a glance over a moving 3D
scene: brake amber `rgba(200,150,20)`, pedal green `rgba(40,160,70)`, jump red
`rgba(180,40,40)`, warning `#ffd166`, error `#ff6b6b`. Don't flatten these into the
marketing palette — they're a separate functional palette and already tuned for
legibility. The in-game sky (`#87ceeb`, a bright cartoon blue) is also a deliberately
different, more legible register than the concept art's stormy slate-blue-to-gold sky —
treat that as a placeholder worth revisiting once real terrain art lands, not a bug.

## Typography

- **Logo/display**: a bold, chunky, slightly weathered display face — see
  `logo-lockup-stone-carved.png` and `logo-mark-transparent.png`. Don't substitute a
  clean geometric sans for the logo itself; the weathering/bevel is part of the brand.
- **Subtitle/UI headings**: a narrower condensed sans-serif (stencil/waymarker feel) —
  see "PEAK DISTRICT DOWNHILL" in the lockups.
- **Body/UI text**: the game itself uses `system-ui, sans-serif` (`src/style.css`) — keep
  UI text plain and legible; save the weathered/condensed treatment for logo and
  headings only.

## Logo usage

- `logo-mark-transparent.png` is the primary standalone mark (real alpha transparency —
  it was regenerated from the source Gemini output, which only *looked* transparent via
  a painted-on checkerboard rather than an actual alpha channel). Use this version for
  any compositing work; don't reuse the original checkerboard PNG.
- `logo-lockup-stone-carved.png` (full lockup with "PEAK DISTRICT DOWNHILL" subtitle, on
  a stone texture) is the marketing lockup — used as the itch.io banner as-is.
- `logo-lockup-woodcut-badge.jpeg` is an alternate illustrated/woodcut treatment, kept as
  a reference option — not currently used as the primary mark, since its style (loose
  engraving) reads differently to the cel-shaded art direction used everywhere else.
- Maintain clear space around the mark roughly equal to the height of the "G" in
  "GRAVITY"; don't crop the baseline scuff/dirt texture.

## Imagery style

See the art direction paragraph in
[`concept-art-prompts.md`](concept-art-prompts.md#art-direction-paragraph-reuse-this-in-every-prompt)
for the full brief. In short: stylised cel-shaded 3D-illustration, Tony Hawk's Pro
Skater/SSX energy meets British countryside travel poster, low raking late-afternoon
light, real Yorkshire/Derbyshire gritstone moorland detail (dry-stone walls, heather,
bracken, weathered millstone grit). Gritty and weather-beaten, not cute or soft.

## itch.io page setup

The itch.io edit-game page (Style tab) exposes BG/BG2/Text/Link colours, a font picker,
and Banner/Background/Embed BG image uploads. Recommended values, matching the palette
above:

| Field | Value | Notes |
| --- | --- | --- |
| BG | `#2A2433` | Heather Charcoal |
| BG2 | `#3D2F56` | Heather Purple — one step lighter, for content panels |
| Text | `#EDE6DC` | Parchment — readable on the dark BG/BG2 above |
| Link | `#C6702F` | Bracken Orange |
| Font | Lato, size Large | Confirmed available in itch's picker; try Oswald or Montserrat first if offered — either reads closer to the logo's condensed-stencil subtitle style |
| Banner | [`images/itch-io/banner-960x360.png`](images/itch-io/banner-960x360.png) | Cropped from `logo-lockup-stone-carved.png`; itch's max display width is 960px, height <400px |
| Background | [`images/itch-io/page-background-1920x1080.png`](images/itch-io/page-background-1920x1080.png) | Cropped/upscaled from `style-anchor-stanage-descent.png` — note it includes a "STANAGE EDGE 1.5 MILES" waymarker; the game currently only models Cut Gate, so treat this purely as generic gritstone-moorland atmosphere, not a claim about in-game locations. Regenerate without the sign if that reads as misleading |
| Embed background image | [`images/itch-io/embed-background-640x360.png`](images/itch-io/embed-background-640x360.png) | Cropped from `key-art-sessioning-the-tor.png` at very close to itch's native 640×360, so minimal quality loss |
| Cover image | [`images/itch-io/cover-630x500.png`](images/itch-io/cover-630x500.png) | `style-anchor-bike-jump.png` centre-cropped to 630×500 with the transparent logo composited on top |

These four itch crops were produced with a quick ImageMagick centre-crop/composite pass
from the source concept art — good enough to preview the page layout today, but
consider regenerating tighter, purpose-built versions at native resolution (rather than
cropped/upscaled derivatives) before a real 1.0 launch push.

Dimensions above come from itch.io's own image-size guidance (cover 630×500, embed
background 640×360, banner ≤960px wide/<400px tall, background sized to taste around a
960px-wide inner column).

## Web/social preview

`public/assets/og-image.png` (1200×630, used by the Open Graph/Twitter meta tags in
`index.html`) has been regenerated from `style-anchor-bike-jump.png` with the
transparent logo composited top-left, matching the existing `og:image:alt` copy ("a
mountain biker jumps off a gritstone ledge over Peak District moorland at sunset")
almost exactly. No further action needed unless the art direction changes.

## Asset inventory

`docs/images/concept-art/` — source concept art (see
[`concept-art-prompts.md`](concept-art-prompts.md) for the prompts that generated
these):

| File | Description |
| --- | --- |
| `logo-lockup-stone-carved.png` | Primary lockup, "GRAVITY & GRIT / PEAK DISTRICT DOWNHILL" carved into gritstone (prompt 1b) |
| `logo-lockup-woodcut-badge.jpeg` | Alternate illustrated woodcut-badge logo treatment |
| `logo-mark-transparent.png` | Standalone wordmark, real alpha transparency, for compositing |
| `style-anchor-bike-jump.png` | Style anchor: lone bike mid-jump off a gritstone boulder (prompt 0) |
| `style-anchor-stanage-descent.png` | Rider descending past a "Stanage Edge" waymarker with spectators on the tor |
| `key-art-sessioning-the-tor.png` | Wide key art: riders working a gritstone tor, logo + "Sessioning the Tor" caption |
| `ui-character-customization.png` | UI concept: jersey/shorts/helmet/bike-component picker plus achievement badge mockups |

`docs/images/itch-io/` — crops derived from the above, sized for itch.io's page-editor
upload fields (see table above).
