#!/usr/bin/env node
// Bakes real OSM building footprints near the Cut Gate route (dam buildings, barns, the
// Slippery Stones packhorse bridge, farm buildings near the route ends — see issue #49)
// into public/data/terrain/cutgate-buildings.json, fetched the same way
// tools/terrain/fetchLandcover.js already sources landcover polygons: a public Overpass
// query over BNG_BBOX, reprojected into the local coordinate space established by
// LOCAL_ORIGIN in config.js.
//
// No ordering dependency on buildTerrain.js/fetchRoute.js — like fetchPaths.js, this is
// a freeform vector overlay, not a per-cell grid, so there's no pixel-alignment
// requirement with the terrain heights grid.
//
// v1 scope: only simple closed OSM ways are baked as building footprints —
// multipolygon relations (some larger structures, e.g. dam buildings, can be mapped this
// way) are not handled and are silently skipped, same documented v1 limitation as
// fetchLandcover.js's buildPolygons().

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { BNG_BBOX, LOCAL_ORIGIN, OVERPASS_ENDPOINT, OVERPASS_USER_AGENT, BUILDINGS_OUT, ATTRIBUTION } from './config.js';
import { wgs84ToLocalBng, wgs84BboxOf } from './projection.js';
import { isBuildingWay, estimateBuildingHeight, ensureCcw } from './buildingClassification.js';

async function fetchBuildingWays(bbox) {
  const bboxClause = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const query = `[out:json][timeout:90];(way["building"]${bboxClause};);out geom;`;

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': OVERPASS_USER_AGENT,
    },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) {
    throw new Error(`Overpass request failed (${response.status})`);
  }
  const { elements } = await response.json();
  return elements.filter((element) => element.type === 'way');
}

// Builds { points: [{e,n}], height } entries from simple closed ways only (first node id
// === last node id) — see the v1 scope note above.
export function buildFootprints(ways) {
  const footprints = [];
  for (const way of ways) {
    if (way.nodes.length < 4 || way.nodes[0] !== way.nodes[way.nodes.length - 1]) {
      console.warn(`Skipping building way ${way.id} — not a simple closed way (v1 scope limit).`);
      continue;
    }
    const tags = way.tags ?? {};
    if (!isBuildingWay(tags)) continue;

    const points = ensureCcw(way.geometry.map(({ lat, lon }) => wgs84ToLocalBng(lat, lon)));
    footprints.push({ points, height: estimateBuildingHeight(tags) });
  }
  return footprints;
}

async function main() {
  const bbox = wgs84BboxOf(BNG_BBOX);
  const ways = await fetchBuildingWays(bbox);
  const buildings = buildFootprints(ways);

  const buildingsData = {
    crs: 'EPSG:27700',
    origin: LOCAL_ORIGIN,
    source: 'OpenStreetMap building=* ways within BNG_BBOX.',
    license: ATTRIBUTION.route,
    buildings,
  };

  mkdirSync(dirname(fileURLToPath(BUILDINGS_OUT)), { recursive: true });
  writeFileSync(BUILDINGS_OUT, JSON.stringify(buildingsData));

  console.log(`Wrote ${fileURLToPath(BUILDINGS_OUT)} (${buildings.length} buildings).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
