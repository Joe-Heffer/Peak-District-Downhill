# Route challenge: decisions, skills, and scoring

Prompted by a design discussion about what makes a run down the route interesting
rather than "point downhill and hold boost" — what decisions the player actually
gets to make while following it, what skills those decisions demand, and how the
existing scoring model should reward getting them right. Tracked in
[issue #171](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/171).

## What already exists

Per `CLAUDE.md`, `src/routes/RouteOverlay.js` renders the route as a decorative
ground-level ribbon with "no gameplay coupling" — `main.js` only reads
`routeData.points[0]` to place the spawn. Everything else the player experiences is
already fairly rich, just not *tied to the route specifically*:

- **Real friction-circle physics** (`src/bike/BikeController.js`, issue #66) — grip is
  shared between cornering and drive/brake force via each wheel's `frictionSlip`, so
  carrying too much speed into a corner can genuinely wash the tyres out. Steering
  angle is itself speed-capped (`turnCap`) to approximate real available grip.
- **Stamina-gated boost** (issues #61, #139) — a scarce resource (`MAX_STAMINA`,
  drain/regen rates) spent deliberately rather than held down, mainly useful right
  before a jump since carrying more speed at takeoff is the only way to stretch a
  jump arc.
- **THPS-style flow scoring** (`src/scoring/ScoreTracker.js`, issue #136) — continuous
  speed × descending-slope × terrain-type score, lump-sum payouts for jumps
  (`AIR_SCORE_RATE`) and tight turns (`TURN_SCORE_RATE`), a combo multiplier
  (`MAX_COMBO`, `COMBO_TIMEOUT`) chaining payouts together, and a crash penalty
  (`CRASH_PENALTY_PER_COMBO`) that forfeits the combo on a hard landing.
- **No auto-upright recovery** — a genuine tip-over crash requires `respawn()`, so
  over-committing has a real cost beyond a score penalty.

## The gap

None of the above currently cares whether the player is anywhere near the route.
Flow score rewards speed and descent angle on *any* terrain cell, so the
highest-scoring play today is arguably to leave the route for the steepest/rockiest
line available and never come back. The route ribbon is visual flavour, not a
mechanic — issue #137 ("reduce score away from trail?") already asks this exact
question as an open stub.

## Decisions the player makes, and the skill each one demands

| Decision | What's already in code to support it | Skill demanded |
| --- | --- | --- |
| Line choice through a corner (apex vs. wide safe line) | Friction-circle grip model, speed-capped steering | Reading terrain ahead, risk assessment |
| How much speed to carry into a corner/jump | Same friction circle — over-commit and the tyres wash out | Braking points, throttle/grip management |
| When to spend boost (climb vs. pre-jump sprint) | Stamina drain/regen (`STAMINA_DRAIN_RATE`, `STAMINA_REGEN_RATE*`) | Resource management, anticipation |
| Jump commitment (pop it clean vs. case the landing) | Hard-landing detection (`HARD_LANDING_VELOCITY`), combo-forfeit penalty | Timing, load management before the lip |
| Keeping a trick combo alive vs. riding conservatively | `COMBO_TIMEOUT` (4s window) | Sustained flow over single-trick optimisation |
| Staying on the route vs. cutting across open terrain for a better score cell | **Nothing yet** — this is the gap | — |

The last row is the one this doc (and #137) is actually about: right now "follow the
route" and "get a high score" are unrelated goals, when for this game's premise —
riding a *real, specific* bridleway — they should be the same goal.

## Design options for coupling route-following to challenge

Roughly cheapest → biggest, not mutually exclusive:

1. **Route-adherence score multiplier** — feed distance-to-route-centerline into
   `ScoreTracker.update()` as a multiplier alongside the existing `terrainFactor`,
   same shape as `TERRAIN_BONUS`. Cheapest option, reuses the existing architecture,
   directly answers #137. Needs a `distanceToRoute(x, z)` query similar in spirit to
   `terrain.getLandcoverAt`, built from the same points `RouteOverlay.js` already
   turns into a `CatmullRomCurve3`.
2. **Checkpoint / split-time gates** — already partly scoped under #64 (sessions,
   completion time), but worth calling out explicitly here: gates along the route
   giving live split times (ahead/behind personal best) turn "did I ride the route
   well" into a legible, comparable number independent of the trick-score model.
   This is a concrete slice of #64 rather than a new issue.
3. **Risk/reward alternate lines baked into the route data** — a couple of
   deliberate forks near known terrain features (rock-garden shortcut vs. a slower
   bypass), each with its own scoring profile. Unlike 1-2, this needs route *content*
   changes, not just code — filed as new issue
   [#170](https://github.com/Joe-Heffer/Peak-District-Downhill/issues/170) since
   nothing in the existing backlog covers it.
4. **Read-ahead / memorisation framing** (limited visibility on blind crests,
   rewarding repeat runs) — not a new issue on its own; it's the same
   "mastery-through-repetition" thesis `docs/competitive-positioning.md` already
   assigns to #65 (ghost replay), and would ride on top of whichever camera/fog work
   #156 does, so it's noted here rather than duplicated.

## Mapping to the existing backlog

| Concern | Existing issue(s) | Status |
| --- | --- | --- |
| Should score fall off away from the trail, and how | #137 | Open — fleshed out with the concrete design above |
| Sessions, completion time, leaderboards | #64 | Open — checkpoint/split-time (option 2) is a slice of this |
| Mastery-through-repetition, comparing runs | #65 | Open |
| Jump timing as a deliberate skill (charge-and-release) | #129 | Open — sharpens the "jump commitment" row above |
| Speed-management depth (gearing) | #62 | Open — a second lever on the "how much speed to carry" decision |
| Internal feel / aesthetics cross-check | #161 (MDA framework) | Open — complementary lens, not duplicated |
| Risk/reward alternate route lines | #170 (new) | Open |

## Recommendation

Land option 1 (route-adherence multiplier) first — it's a small, self-contained
change to `ScoreTracker.js` that directly resolves #137's open question and makes
every subsequent option (checkpoints, forks) land on top of a route that already
matters to the score. Sequence #64's checkpoint/split-time slice next since it shares
session-state groundwork with #65. Treat #170 (alternate lines) as route-content work
to pick up once a second real route (#52/#134) is also on the table, so line-design
effort isn't spent twice.

## Out of scope

- **Hard corridor enforcement** (invisible walls, forced slowdown off-route) —
  contradicts the open-terrain sandbox feel this game already has; the multiplier
  approach (option 1) achieves the same incentive without removing player freedom.
- **Trick-depth expansion for its own sake** — already flagged as an open question
  against `ScoreTracker.js`'s combo model in #161; this doc's decisions/skills table
  is about route-following specifically, not a general trick-system rewrite.
