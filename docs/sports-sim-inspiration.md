# Sports & simulation game design inspiration

Prompted by a chat design discussion asking what aspects of sports and simulation
games players enjoy, and what this game could take from them. This doc records that
web research (downhill MTB games, sim racing) as concrete mechanics rather than genre
vibes, checks each one against the existing backlog so new work builds on what's
already tracked or implemented instead of duplicating it, and files issues only for
the genuine gaps. Tracked in
[issue #172](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/172).

This complements `docs/competitive-positioning.md`, which already surveys the genre
landscape (Descenders, Lonely Mountains: Downhill, Riders Republic, Trials, Shred) and
states a differentiation thesis — that survey isn't repeated here. This doc goes one
level down: specific mechanics from that landscape (plus sim racing, outside that
doc's scope), checked line-by-line against what `src/` actually does today.

## Mechanics surveyed, checked against what already exists

| Mechanic | Source game(s) | Why players enjoy it | Status in this repo |
| --- | --- | --- | --- |
| Ghost replay racing your own past run | Trackmania, Descenders | Turns a fixed route into "beat your own line" without needing other players online; replays double as a way to learn faster lines | Tracked, not yet built: [#65](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/65) |
| Continuous flow score + trick/combo scoring | Shred 2, Tony Hawk's Pro Skater | Rewards carrying speed and stringing tricks together, not just reaching the bottom | **Already implemented** — `src/scoring/ScoreTracker.js`'s speed/slope/terrain flow score, air-time and tight-turn payouts, combo multiplier with hard-landing penalty |
| Session start/end + leaderboard | Strava segments, Trackmania | Gives a run a clear result to chase (yours or someone else's) beyond a single running total | Partially implemented (`ScoreTracker.js` tracks one global `bestScore` in `localStorage`); full run/session concept + leaderboard tracked at [#64](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/64) |
| Mid-run checkpoints / split times | Trackmania, Lonely Mountains: Downhill | Feedback *during* a run, not just a final number, is what makes "I can save time in that corner" legible | **Gap — new issue** (below) |
| Stamina/boost resource management | Lonely Mountains: Downhill | Speed isn't free; spending a limited resource on a hard section is a real decision, not just holding a throttle | **Already implemented** — `BikeController.js`'s stamina-gated boost (#61, #139) |
| Risk/reward line choice & shortcuts through rougher terrain | Lonely Mountains: Downhill | The fastest line isn't the safest one; players choose how much risk to take, not just how fast to go | Partially covered — [#137](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/137)'s off-trail score falloff is a scoring lever on this, but there's no actual alternate-line/shortcut content yet. **Gap — new issue** (below) |
| Charge-and-release jump timing | Shred 2, Tony Hawk's Pro Skater | Turns jumping into a timing skill (how long to charge) instead of a fixed-height button press | Tracked, not yet built: [#129](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/129) |
| Flow/pump — carrying momentum through terrain shape instead of braking | Descenders | Rewards reading the terrain (compress into troughs, release off crests) as a skill distinct from just steering/braking | **Gap — new issue** (below) |
| Dynamic/varied traction (surface affects grip) | Sim racing (variable grip, tyre wear, wet/dry) | Keeps a fixed track feeling different run to run, and makes surface choice matter, not just aesthetics | Landcover classes already exist as visual tint (`HeightmapTerrain.js`) and a scoring multiplier (`ScoreTracker.js`'s `TERRAIN_BONUS`), but bike grip itself is one constant (`GRIP_MU` in `BikeController.js`) regardless of surface. [#67](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/67) (grip contact materials) and [#144](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/144) (changeable weather) are the closest existing issues. **Gap — new issue** (below) bridges them |
| Progression/unlocks gating new capability or content | iRacing licence tiers, Lonely Mountains route select | Gives players a reason to keep playing beyond one route, and a felt sense of getting better | Tracked at [#60](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/60) (bike-capability unlocks); that issue already flags "should this extend across multiple routes" as an open question once [#52](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/52)/[#134](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/134) (additional real routes) land — no new issue needed, just noting the connection here |

## New follow-up work

Four gaps came out of the table above with nothing tracking them yet.

### A. Mid-run checkpoints and split times

Segment the existing `routeData.points` into a handful of checkpoints and show a
live split (ahead/behind personal best) as the player crosses each one, not just a
final time. This is the piece of the Trackmania/Strava-segment loop that `#64`
doesn't call out explicitly: a run needs *intermediate* feedback, not only a start and
an end. Depends on `#64` landing a run/session concept first (a checkpoint needs a run
clock to split against). Filed as
[#173](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/173).

### B. Flow/pump momentum mechanic

Reward compressing into dips and releasing off crests with a small speed gain (or at
least no braking penalty), the way Descenders' "pumping" rewards reading terrain shape
as a skill distinct from steering or the existing boost/stamina resource. This is a
`BikeController.js` physics-feel change, not a new resource or input. Filed as
[#174](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/174).

### C. Landcover-driven traction variation

`TERRAIN_BONUS` in `ScoreTracker.js` already treats rock/heather as scoring higher
than grass/track, but `GRIP_MU` in `BikeController.js` is one constant regardless of
what's underneath the tyres — the landcover data driving that scoring bonus doesn't
touch actual grip/handling at all yet. Vary grip per landcover class (loose rock and
wet heather looser than the bridleway track surface), which gives the existing
risk/reward scoring signal a physical consequence, and gives `#144`'s future
weather work an existing hook (wet weather could scale these same per-class grip
values down further) instead of a separate system. Filed as
[#175](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/175).

### D. Alternate line choice / shortcuts within the route corridor

Give the route corridor at least one real alternate line — a rougher, higher-risk
shortcut off the main bridleway line that's faster if ridden clean — instead of a
single fixed path with only a scoring penalty (`#137`) for leaving it. This is a
content/route-data change (`RouteOverlay.js`/route JSON), not just a scoring
tweak, and is what actually makes `#137`'s "should off-trail cost score" question
concrete rather than abstract. Filed as
[#176](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/176).

## Deliberately out of scope

- **Procedurally generated tracks** (Descenders' core loop) — contradicts this game's
  real-place premise; already ruled out in `docs/procedural-generation.md`.
- **Full live weather/grip simulation** (sim racing's tyre wear, track evolution over
  a session) — disproportionate for a solo-dev single-route game; `#144` is already
  the right-sized version of this, and (C) above gives it a grip hook to extend rather
  than building a second, heavier system.
- **Structured always-on online competitive ladder** (iRacing's licence/safety-rating
  system) — no backend or multiplayer infrastructure exists or is planned beyond
  `#63`'s open question; out of scope for a client-only game.
- **Deep vehicle setup/tuning** (sim racing's car setups) — `#59` (bike selection)
  already covers this genre's expectation at a weight that fits the project; per-run
  suspension/gearing tuning would be disproportionate.

## Roadmap

| New issue | Depends on / relates to |
| --- | --- |
| [#173](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/173) checkpoints/splits | `#64` (needs a run/session concept first) |
| [#174](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/174) flow/pump momentum | `BikeController.js` physics only, no dependency |
| [#175](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/175) landcover traction | `#67` (grip contact materials), `#144` (weather) |
| [#176](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/176) alternate line/shortcut | `#137` (off-trail scoring) |
