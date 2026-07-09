#!/usr/bin/env node
// Bakes real OSM water features near the Cut Gate route — Howden and Derwent
// Reservoirs, and the rivers/streams feeding them (see issue #49) — into
// public/data/terrain/cutgate-water.json. Fetched the same way fetchLandcover.js/
// fetchBuildings.js already source OSM polygons: a public Overpass query over
// BNG_BBOX, reprojected into the local coordinate space established by LOCAL_ORIGIN in
// config.js.
//
// Two feature shapes come out of one query: closed-way polygons (natural=water,
// landuse=reservoir — lakes/reservoirs, rendered as a flat plane by
// src/scenery/Water.js) and open-way lines (waterway=river/stream, rendered as a
// terrain-following ribbon, same technique as fetchPaths.js/PathsOverlay.js).
//
// No ordering dependency on buildTerrain.js/fetchRoute.js — like fetchPaths.js, this is
// a freeform vector overlay, not a per-cell grid.
//
// v1 scope: only simple closed OSM ways are baked as water polygons — multipolygon
// relations (some larger reservoirs can be mapped this way) are not handled and are
// silently skipped, same documented v1 limitation as fetchLandcover.js/fetchBuildings.js.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { BNG_BBOX, LOCAL_ORIGIN, OVERPASS_ENDPOINT, OVERPASS_USER_AGENT, WATER_OUT, ATTRIBUTION } from './config.js';
import { wgs84ToLocalBng, wgs84BboxOf } from './projection.js';
import { clipPolylineToBbox } from './pathClassification.js';
import { classifyWaterPolygon, classifyWaterway } from './waterClassification.js';
import { ensureCcw } from './buildingClassification.js';

async function fetchWaterElements(bbox) {
  const bboxClause = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const query =
    `[out:json][timeout:90];` +
    `(` +
    `way["natural"="water"]${bboxClause};` +
    `way["landuse"="reservoir"]${bboxClause};` +
    `way["waterway"="river"]${bboxClause};` +
    `way["waterway"="stream"]${bboxClause};` +
    `);` +
    `out geom;`;

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

// Splits the fetched ways into { polygons: [{cls, points}], lines: [{cls, points}] }.
// A way tagged both a polygon class and a waterway class (doesn't happen in practice,
// but the tag vocabularies are independent) is classified as a polygon only, since a
// closed way is the stronger structural signal.
export function buildWaterFeatures(ways, bngBbox) {
  const localBbox = { minE: 0, maxE: bngBbox.maxE - bngBbox.minE, minN: 0, maxN: bngBbox.maxN - bngBbox.minN };

  const polygons = [];
  const lines = [];
  for (const way of ways) {
    const tags = way.tags ?? {};
    const isClosed = way.nodes.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1];
    const points = way.geometry.map(({ lat, lon }) => wgs84ToLocalBng(lat, lon));

    const polygonCls = isClosed ? classifyWaterPolygon(tags) : null;
    if (polygonCls) {
      polygons.push({ cls: polygonCls, points: ensureCcw(points) });
      continue;
    }

    const lineCls = classifyWaterway(tags);
    if (!lineCls) continue;
    for (const segment of clipPolylineToBbox(points, localBbox)) {
      lines.push({ cls: lineCls, points: segment });
    }
  }
  return { polygons, lines };
}

async function main() {
  const bbox = wgs84BboxOf(BNG_BBOX);
  const ways = await fetchWaterElements(bbox);
  const { polygons, lines } = buildWaterFeatures(ways, BNG_BBOX);

  const waterData = {
    crs: 'EPSG:27700',
    origin: LOCAL_ORIGIN,
    source: 'OpenStreetMap natural=water/landuse=reservoir polygons and waterway=river/stream ways within BNG_BBOX.',
    license: ATTRIBUTION.route,
    polygons,
    lines,
  };

  mkdirSync(dirname(fileURLToPath(WATER_OUT)), { recursive: true });
  writeFileSync(WATER_OUT, JSON.stringify(waterData));

  console.log(`Wrote ${fileURLToPath(WATER_OUT)} (${polygons.length} polygons, ${lines.length} lines).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
