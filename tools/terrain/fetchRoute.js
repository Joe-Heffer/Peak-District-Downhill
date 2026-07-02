#!/usr/bin/env node
// Fetches the Cut Gate bridleway geometry from OpenStreetMap via the public Overpass
// API, stitches its way segments into one ordered polyline, reprojects it from WGS84
// into local British National Grid metres (matching the terrain's LOCAL_ORIGIN), and
// writes the baked route consumed at runtime by src/routes/RouteOverlay.js.
//
// Requires OSM_WAY_IDS in tools/terrain/config.js to be filled in first (look up the
// Cut Gate way id(s) by hand on https://www.openstreetmap.org).

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import proj4 from 'proj4';
import {
  LOCAL_ORIGIN,
  OSM_WAY_IDS,
  OVERPASS_ENDPOINT,
  OVERPASS_USER_AGENT,
  ROUTE_OUT,
  ATTRIBUTION,
} from './config.js';

// Standard OSGB36 National Grid definition (7-parameter Helmert approximation — accurate
// to a few metres, not OSTN15 grid-accurate, which is fine for a game but not
// survey-grade).
proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 ' +
    '+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
);

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
          'endpoint nodes. Check OSM_WAY_IDS in tools/terrain/config.js.',
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

function toLocalBng(lat, lon) {
  const [easting, northing] = proj4('WGS84', 'EPSG:27700').forward([lon, lat]);
  return { e: easting - LOCAL_ORIGIN.easting, n: northing - LOCAL_ORIGIN.northing };
}

async function main() {
  if (OSM_WAY_IDS.length === 0) {
    throw new Error('OSM_WAY_IDS is empty — fill in the Cut Gate way id(s) in tools/terrain/config.js first.');
  }

  const ways = await fetchWays(OSM_WAY_IDS);
  const chain = stitchWays(ways);
  let points = chain.map(({ lat, lon }) => toLocalBng(lat, lon));

  // Order so the first point is the north/high end (Margery Hill, top of the descent)
  // and the last is the south/low end (Upper Derwent Visitor Centre) — matches the
  // spawn-point convention main.js relies on.
  if (points[0].n < points[points.length - 1].n) {
    points = points.reverse();
  }

  const routeData = {
    crs: 'EPSG:27700',
    origin: LOCAL_ORIGIN,
    source: `OpenStreetMap way(s) ${OSM_WAY_IDS.join(', ')}`,
    license: ATTRIBUTION.route,
    points,
  };

  mkdirSync(dirname(fileURLToPath(ROUTE_OUT)), { recursive: true });
  writeFileSync(ROUTE_OUT, JSON.stringify(routeData));
  console.log(`Wrote ${fileURLToPath(ROUTE_OUT)} (${points.length} points).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
