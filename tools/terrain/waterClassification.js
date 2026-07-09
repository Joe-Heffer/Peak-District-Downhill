// Pure, side-effect-free helpers for classifying OSM water tags — shared by
// fetchWater.js (real data) and generatePlaceholder.js (synthetic data). No network
// calls, no fs — same spirit as pathClassification.js/buildingClassification.js.

// Closed-way polygon features (lakes, reservoirs) — rendered as a flat tinted plane by
// src/scenery/Water.js. Ordered rules, first match wins, mirrors fetchLandcover.js's
// LANDCOVER_TAG_RULES pattern.
const WATER_POLYGON_RULES = [
  { test: (tags) => tags.landuse === 'reservoir', cls: 'reservoir' },
  { test: (tags) => tags.natural === 'water', cls: 'lake' },
];

export function classifyWaterPolygon(tags = {}) {
  const rule = WATER_POLYGON_RULES.find((r) => r.test(tags));
  return rule ? rule.cls : null;
}

// Linear waterway features (rivers, streams) — rendered as a terrain-following ribbon,
// same technique as PathsOverlay.js's highway ribbons.
export function classifyWaterway(tags = {}) {
  if (tags.waterway === 'river') return 'river';
  if (tags.waterway === 'stream') return 'stream';
  return null;
}

// Ribbon width (metres) per waterway class — rivers read as substantially wider than
// streams. Consumed by src/scenery/Water.js.
export const WATERWAY_WIDTHS = { river: 6, stream: 1.5 };
