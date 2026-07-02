#!/usr/bin/env node
// Classifies the terrain grid's landcover (grass / wood / rock / heather / track) by
// fetching OpenStreetMap natural/landuse polygons for the same BNG_BBOX via the public
// Overpass API, then baking a landcover[i][j] grid that lines up cell-for-cell with the
// heights[i][j] grid in public/data/terrain/cutgate.json, consumed at runtime by
// src/terrain/HeightmapTerrain.js to tint the terrain mesh.
//
// Must be run after buildTerrain.js and fetchRoute.js — it reads their outputs (grid
// dimensions and the baked route polyline) rather than recomputing them, so the
// landcover grid is guaranteed to stay pixel-aligned even if BNG_BBOX or the sizing
// formula ever changes.
//
// v1 scope: only simple closed OSM ways are classified as landcover polygons —
// multipolygon relations (e.g. some large woods mapped as outer/inner ring relations)
// are not handled and are silently skipped. This is a deliberate, documented scope
// limit (see tools/terrain/README.md), not a half-finished feature — consistent with
// this pipeline already targeting a single known location rather than generalizing.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  BNG_BBOX,
  LOCAL_ORIGIN,
  OVERPASS_ENDPOINT,
  OVERPASS_USER_AGENT,
  TERRAIN_OUT,
  ROUTE_OUT,
  LANDCOVER_OUT,
  ATTRIBUTION,
} from './config.js';
import { wgs84ToLocalBng, bngToWgs84 } from './projection.js';

export const LANDCOVER_CLASSES = ['grass', 'wood', 'rock', 'heather', 'track'];

const LANDCOVER_TAG_RULES = [
  { test: (tags) => tags.natural === 'wood' || tags.landuse === 'forest', cls: 'wood' },
  { test: (tags) => tags.natural === 'bare_rock' || tags.natural === 'scree', cls: 'rock' },
  { test: (tags) => tags.natural === 'heath', cls: 'heather' },
];

// Half the width of the "track" buffer straddling the route polyline — cells within this
// distance of the ridden line read as track surface even where the route cuts through
// woods/moorland (track wins in classifyCell's priority order).
function trackBufferFor(cellSize) {
  return cellSize / 2;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Local WGS84 bbox of BNG_BBOX, expanded across all 4 corners (not just two opposite
// ones) since transverse-Mercator reprojection isn't axis-aligned.
function wgs84BboxOf(bngBbox) {
  const corners = [
    bngToWgs84(bngBbox.minE, bngBbox.minN),
    bngToWgs84(bngBbox.maxE, bngBbox.minN),
    bngToWgs84(bngBbox.maxE, bngBbox.maxN),
    bngToWgs84(bngBbox.minE, bngBbox.maxN),
  ];
  return {
    south: Math.min(...corners.map((c) => c.lat)),
    north: Math.max(...corners.map((c) => c.lat)),
    west: Math.min(...corners.map((c) => c.lon)),
    east: Math.max(...corners.map((c) => c.lon)),
  };
}

async function fetchLandcoverWays(bbox) {
  const bboxClause = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const query =
    `[out:json][timeout:90];` +
    `(` +
    `way["natural"="wood"]${bboxClause};` +
    `way["landuse"="forest"]${bboxClause};` +
    `way["natural"="heath"]${bboxClause};` +
    `way["natural"="bare_rock"]${bboxClause};` +
    `way["natural"="scree"]${bboxClause};` +
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

// Builds { cls, points: [{e,n}], bbox: {minE,maxE,minN,maxN} } polygons from simple
// closed ways only (first node id === last node id) — see the v1 scope note above.
function buildPolygons(ways) {
  const polygons = [];
  for (const way of ways) {
    if (way.nodes.length < 4 || way.nodes[0] !== way.nodes[way.nodes.length - 1]) {
      console.warn(`Skipping way ${way.id} — not a simple closed way (v1 scope limit).`);
      continue;
    }
    const rule = LANDCOVER_TAG_RULES.find((r) => r.test(way.tags ?? {}));
    if (!rule) continue;

    const points = way.geometry.map(({ lat, lon }) => wgs84ToLocalBng(lat, lon));
    const bbox = points.reduce(
      (acc, p) => ({
        minE: Math.min(acc.minE, p.e),
        maxE: Math.max(acc.maxE, p.e),
        minN: Math.min(acc.minN, p.n),
        maxN: Math.max(acc.maxN, p.n),
      }),
      { minE: Infinity, maxE: -Infinity, minN: Infinity, maxN: -Infinity },
    );
    polygons.push({ cls: rule.cls, points, bbox });
  }
  return polygons;
}

// Ray-casting (even-odd rule) point-in-polygon test over the local {e,n} plane.
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a, a += 1) {
    const pa = polygon[a];
    const pb = polygon[b];
    const crosses = pa.n > point.n !== pb.n > point.n;
    if (crosses) {
      const eAtN = pa.e + ((pb.e - pa.e) * (point.n - pa.n)) / (pb.n - pa.n);
      if (point.e < eAtN) inside = !inside;
    }
  }
  return inside;
}

function classifyByPolygon(point, polygons) {
  for (const polygon of polygons) {
    const { bbox } = polygon;
    if (point.e < bbox.minE || point.e > bbox.maxE || point.n < bbox.minN || point.n > bbox.maxN) {
      continue;
    }
    if (pointInPolygon(point, polygon.points)) return polygon.cls;
  }
  return null;
}

function distanceToSegment(point, a, b) {
  const abE = b.e - a.e;
  const abN = b.n - a.n;
  const lenSq = abE * abE + abN * abN;
  const t = lenSq === 0 ? 0 : clamp(((point.e - a.e) * abE + (point.n - a.n) * abN) / lenSq, 0, 1);
  const closestE = a.e + t * abE;
  const closestN = a.n + t * abN;
  return Math.hypot(point.e - closestE, point.n - closestN);
}

export function distanceToRoute(point, routePoints) {
  let min = Infinity;
  for (let s = 0; s < routePoints.length - 1; s += 1) {
    min = Math.min(min, distanceToSegment(point, routePoints[s], routePoints[s + 1]));
  }
  return min;
}

// Priority order: track > rock > wood > heather > grass. Track wins so the ridden line
// reads distinctly even where it cuts through woods/moorland; rock is checked before
// wood/heather since OSM wood/heath polygons sometimes loosely encompass small rocky
// outcrops, and the rarer/more distinctive rock class should win visually.
export function classifyCell(point, { routePoints, trackBuffer, rockPolygons, woodPolygons, heatherPolygons }) {
  if (distanceToRoute(point, routePoints) <= trackBuffer) return 'track';
  if (classifyByPolygon(point, rockPolygons)) return 'rock';
  if (classifyByPolygon(point, woodPolygons)) return 'wood';
  if (classifyByPolygon(point, heatherPolygons)) return 'heather';
  return 'grass';
}

function buildLandcoverGrid({ cols, rows, cellSize, routePoints, polygons }) {
  const trackBuffer = trackBufferFor(cellSize);
  const rockPolygons = polygons.filter((p) => p.cls === 'rock');
  const woodPolygons = polygons.filter((p) => p.cls === 'wood');
  const heatherPolygons = polygons.filter((p) => p.cls === 'heather');

  const histogram = Object.fromEntries(LANDCOVER_CLASSES.map((c) => [c, 0]));
  const landcover = [];
  for (let i = 0; i < cols; i += 1) {
    const row = [];
    for (let j = 0; j < rows; j += 1) {
      const point = { e: i * cellSize, n: j * cellSize };
      const cls = classifyCell(point, { routePoints, trackBuffer, rockPolygons, woodPolygons, heatherPolygons });
      histogram[cls] += 1;
      row.push(LANDCOVER_CLASSES.indexOf(cls));
    }
    landcover.push(row);
  }
  return { landcover, histogram };
}

async function main() {
  const terrainData = JSON.parse(readFileSync(fileURLToPath(TERRAIN_OUT), 'utf8'));
  const routeData = JSON.parse(readFileSync(fileURLToPath(ROUTE_OUT), 'utf8'));
  const { cellSize, cols, rows } = terrainData;

  const bbox = wgs84BboxOf(BNG_BBOX);
  const ways = await fetchLandcoverWays(bbox);
  const polygons = buildPolygons(ways);

  const { landcover, histogram } = buildLandcoverGrid({
    cols,
    rows,
    cellSize,
    routePoints: routeData.points,
    polygons,
  });

  const landcoverData = {
    crs: 'EPSG:27700',
    origin: LOCAL_ORIGIN,
    cellSize,
    cols,
    rows,
    classes: LANDCOVER_CLASSES,
    landcover,
    source:
      'OpenStreetMap landcover tags (natural=wood/bare_rock/scree/heath, landuse=forest) ' +
      'within BNG_BBOX, plus proximity to the Cut Gate route for track.',
    license: ATTRIBUTION.route,
  };

  mkdirSync(dirname(fileURLToPath(LANDCOVER_OUT)), { recursive: true });
  writeFileSync(LANDCOVER_OUT, JSON.stringify(landcoverData));

  console.log(`Wrote ${fileURLToPath(LANDCOVER_OUT)} (${cols}x${rows} cells).`);
  console.log('Landcover class histogram:', histogram);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
