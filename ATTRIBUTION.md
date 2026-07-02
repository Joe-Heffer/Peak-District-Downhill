# Data attribution

The Cut Gate terrain and route data (`public/data/terrain/cutgate.json`,
`public/data/routes/cutgate.json`) are derived from open UK geodata:

## Terrain

Contains public sector information licensed under the Open Government Licence v3.0.
© Environment Agency copyright and/or database right. Derived from the LIDAR Composite
Digital Terrain Model (DTM), via [environment.data.gov.uk](https://environment.data.gov.uk/survey).

## Route

© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0.

---

Until `npm run terrain:build` has been run with real source data (see
[`tools/terrain/README.md`](tools/terrain/README.md)), the committed data files are a
synthetic placeholder, not derived from either of the above sources — this is reflected
in their `source`/`license` fields and in the in-game credits overlay.
