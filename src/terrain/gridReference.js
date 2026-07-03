// British National Grid (EPSG:27700) easting/northing -> two-letter-prefixed OS grid
// reference (e.g. "SK 197 954"). Standard, dependency-free algorithm: the country is
// divided into 500km squares (rows/cols of 100km squares), each 100km square gets a
// letter pair from a 5x5 alphabet grid that skips 'I'.
const GRID_SQUARE_SIZE = 100000;

export function eastingNorthingToGridRef(easting, northing, digits = 6) {
  const e100k = Math.floor(easting / GRID_SQUARE_SIZE);
  const n100k = Math.floor(northing / GRID_SQUARE_SIZE);
  if (e100k < 0 || e100k > 6 || n100k < 0 || n100k > 12) {
    throw new Error(`Easting/northing (${easting}, ${northing}) is outside the GB national grid`);
  }

  let firstLetterIndex = 19 - n100k - ((19 - n100k) % 5) + Math.floor((e100k + 10) / 5);
  let secondLetterIndex = ((19 - n100k) * 5) % 25 + (e100k % 5);
  // The grid alphabet skips 'I', so any index past 'H' (7) shifts up by one.
  if (firstLetterIndex > 7) firstLetterIndex += 1;
  if (secondLetterIndex > 7) secondLetterIndex += 1;
  const letters =
    String.fromCharCode(65 + firstLetterIndex) + String.fromCharCode(65 + secondLetterIndex);

  const figures = digits / 2;
  const scale = Math.pow(10, 5 - figures);
  const eastingWithinSquare = Math.floor((easting % GRID_SQUARE_SIZE) / scale)
    .toString()
    .padStart(figures, '0');
  const northingWithinSquare = Math.floor((northing % GRID_SQUARE_SIZE) / scale)
    .toString()
    .padStart(figures, '0');

  return `${letters} ${eastingWithinSquare} ${northingWithinSquare}`;
}

// Converts a bike/route world position back to a real BNG easting/northing using the
// terrain's local origin, then formats it as an OS grid reference. Mirrors the inverse
// of the e/i -> x and n/j -> -z axis mapping used throughout tools/terrain and
// src/terrain/HeightmapTerrain.js: easting = origin.easting + x, northing =
// origin.northing - z.
export function worldToGridRef(x, z, origin, digits = 6) {
  return eastingNorthingToGridRef(origin.easting + x, origin.northing - z, digits);
}
