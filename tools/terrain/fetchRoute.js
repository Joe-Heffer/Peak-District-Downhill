#!/usr/bin/env node
// Fetches a location's bridleway geometry from OpenStreetMap via the public Overpass
// API, stitches its way segments into one ordered polyline, reprojects it from WGS84
// into local British National Grid metres (matching the location's own origin), and
// writes the baked route consumed at runtime by src/routes/RouteOverlay.js.
//
// Requires osmWayIds for the location in tools/terrain/config.js to be filled in first
// (look up the route's way id(s) by hand on https://www.openstreetmap.org).
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
import { wgs84ToLocalBng } from './projection.js';

async function fetchWays(wayIds) {
  const query = `[out:json][timeout:90];way(id:${wayIds.join(',')});out geom;`;
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

// Stitches way segments into one ordered chain of {id, lat, lon} nodes by matching
// shared endpoint node ids. Greedy — fine for the small number of segments one
// bridleway is typically split into.
function stitchWays(ways) {
  const segments = ways.map((way) => way.nodes.map((id, index) => ({ id, ...way.geometry[index] })));

  let chain = segments.shift();
  while (segments.length > 0) {
    const chainStart = chain[0].id;
    const chainEnd = chain[chain.length - 1].id;

    const matchIndex = segments.findIndex((segment) => {
      const start = segment[0].id;
      const end = segment[segment.length - 1].id;
      return start === chainEnd || end === chainEnd || start === chainStart || end === chainStart;
    });

    if (matchIndex === -1) {
      throw new Error(
        'Could not stitch all OSM way segments into a single chain — they may not share ' +
          'endpoint nodes. Check osmWayIds in tools/terrain/config.js.',
      );
    }

    const [segment] = segments.splice(matchIndex, 1);
    const start = segment[0].id;
    const end = segment[segment.length - 1].id;

    if (start === chainEnd) {
      chain = chain.concat(segment.slice(1));
    } else if (end === chainEnd) {
      chain = chain.concat([...segment].reverse().slice(1));
    } else if (end === chainStart) {
      chain = segment.slice(0, -1).concat(chain);
    } else {
      chain = [...segment].reverse().slice(0, -1).concat(chain);
    }
  }

  return chain;
}

async function fetchRouteFor(location) {
  const { osmWayIds } = location;
  const routeOut = outputPathsFor(location.slug).route;

  if (osmWayIds.length === 0) {
    throw new Error(
      `osmWayIds is empty for "${location.slug}" — fill in its way id(s) in tools/terrain/config.js first.`,
    );
  }

  const origin = localOriginOf(location);
  const ways = await fetchWays(osmWayIds);
  const chain = stitchWays(ways);
  let points = chain.map(({ lat, lon }) => wgs84ToLocalBng(lat, lon, origin));

  // Order so the first point is the north/high end (top of the descent) and the last is
  // the south/low end (bottom) — matches the spawn-point convention main.js relies on.
  if (points[0].n < points[points.length - 1].n) {
    points = points.reverse();
  }

  const routeData = {
    crs: 'EPSG:27700',
    origin,
    source: `OpenStreetMap way(s) ${osmWayIds.join(', ')}`,
    license: ATTRIBUTION.route,
    points,
  };

  mkdirSync(dirname(fileURLToPath(routeOut)), { recursive: true });
  writeFileSync(routeOut, JSON.stringify(routeData));
  console.log(`Wrote ${fileURLToPath(routeOut)} (${points.length} points).`);
}

async function main() {
  for (const slug of resolveLocationSlugs()) {
    await fetchRouteFor(getLocation(slug));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
