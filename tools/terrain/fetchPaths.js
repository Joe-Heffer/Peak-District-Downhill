#!/usr/bin/env node
// Fetches a location's surrounding road/bridleway/footpath network from OpenStreetMap
// within its BNG_BBOX (same area as fetchLandcover.js), excluding the location's own
// route way(s) (already rendered separately by fetchRoute.js/RouteOverlay.js),
// classifies each way into road/bridleway/footpath (see pathClassification.js), clips it
// to the bbox, and writes public/data/routes/<slug>-paths.json for
// src/routes/PathsOverlay.js to render as terrain-following ribbon meshes.
//
// Unlike fetchLandcover.js, this has no ordering dependency on buildTerrain.js's output
// — paths are a freeform vector overlay, not a per-cell grid, so there's no pixel-
// alignment requirement. Kept last in the pipeline purely for README consistency.
//
// Fetches every configured location by default (see resolveLocationSlugs in config.js) —
// pass --location=<slug> to fetch just one.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  getLocation,
  localOriginOf,
  outputPathsFor,
  resolveLocationSlugs,
  OVERPASS_ENDPOINT,
  OVERPASS_USER_AGENT,
  ATTRIBUTION,
} from './config.js';
import { wgs84ToLocalBng, wgs84BboxOf } from './projection.js';
import { categorizeHighway, excludeKnownRouteWays, clipPolylineToBbox, PATH_CATEGORIES } from './pathClassification.js';

const HIGHWAY_VALUES = [
  'unclassified',
  'residential',
  'tertiary',
  'secondary',
  'primary',
  'service',
  'living_street',
  'track',
  'bridleway',
  'footway',
  'path',
  'steps',
];

async function fetchHighwayWays(bbox) {
  const bboxClause = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const query = `[out:json][timeout:90];(way["highway"~"^(${HIGHWAY_VALUES.join('|')})$"]${bboxClause};);out geom;`;

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

// Builds { category, wayId, points: [{e,n}] } entries from the fetched ways, excluding
// the location's own route way(s), dropping unclassified/out-of-scope highway tags, and
// clipping each way's geometry to the local bbox (splitting into multiple entries if a
// way crosses the boundary more than once).
export function buildPathEntries(ways, { excludedWayIds, bngBbox, origin }) {
  const localBbox = {
    minE: 0,
    maxE: bngBbox.maxE - bngBbox.minE,
    minN: 0,
    maxN: bngBbox.maxN - bngBbox.minN,
  };

  const entries = [];
  for (const way of excludeKnownRouteWays(ways, excludedWayIds)) {
    const category = categorizeHighway(way.tags ?? {});
    if (!category) continue;

    const points = way.geometry.map(({ lat, lon }) => wgs84ToLocalBng(lat, lon, origin));
    for (const segment of clipPolylineToBbox(points, localBbox)) {
      entries.push({ category, wayId: way.id, points: segment });
    }
  }
  return entries;
}

async function fetchPathsFor(location) {
  const origin = localOriginOf(location);
  const pathsOut = outputPathsFor(location.slug).paths;

  const bbox = wgs84BboxOf(location.bbox);
  const ways = await fetchHighwayWays(bbox);
  const paths = buildPathEntries(ways, { excludedWayIds: location.osmWayIds, bngBbox: location.bbox, origin });

  const histogram = Object.fromEntries(PATH_CATEGORIES.map((c) => [c, 0]));
  for (const path of paths) histogram[path.category] += 1;

  const pathsData = {
    crs: 'EPSG:27700',
    origin,
    categories: PATH_CATEGORIES,
    source:
      `OpenStreetMap highway=${HIGHWAY_VALUES.join('/')} ways within BNG_BBOX, excluding ` +
      `the ${location.name} route itself (way id(s) ${location.osmWayIds.join(', ')}).`,
    license: ATTRIBUTION.route,
    paths,
  };

  mkdirSync(dirname(fileURLToPath(pathsOut)), { recursive: true });
  writeFileSync(pathsOut, JSON.stringify(pathsData));

  console.log(`Wrote ${fileURLToPath(pathsOut)} (${paths.length} path segments).`);
  console.log('Path category histogram:', histogram);
}

async function main() {
  for (const slug of resolveLocationSlugs()) {
    await fetchPathsFor(getLocation(slug));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
