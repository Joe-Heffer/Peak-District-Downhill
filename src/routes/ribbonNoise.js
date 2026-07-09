// Deterministic, dependency-free coherent 2D noise for the route ribbon's "rockiness"
// relief (see RouteOverlay.js's ROUTE_STYLE.rockiness). No noise/simplex package exists
// in this project's dependencies — this is a small integer-hash value-noise
// implementation, smoothstep-interpolated so nearby samples give nearby values (unlike
// raw per-cell hashing, which would look like sandpaper rather than embedded rock lumps).

// Integer hash -> [0, 1). Same (ix, iz, seed) always produces the same value across
// reloads/tests/browsers, so the trail's bumps are stable rather than randomized per load.
function hash2D(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

// Bilinear-interpolated value noise over an integer lattice of hash2D corners, sampled
// continuously at (x, z). Range is approximately [-1, 1].
export function valueNoise2D(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);

  const h00 = hash2D(x0, z0, seed);
  const h10 = hash2D(x0 + 1, z0, seed);
  const h01 = hash2D(x0, z0 + 1, seed);
  const h11 = hash2D(x0 + 1, z0 + 1, seed);

  const top = h00 + (h10 - h00) * tx;
  const bottom = h01 + (h11 - h01) * tx;
  return (top + (bottom - top) * tz) * 2 - 1;
}

// Samples valueNoise2D at world (x, z) scaled so `wavelength` metres spans one lattice
// cell — the unit ribbonGeometry.js's buildRibbonArrays composes per rockiness octave.
export function fbmSample(x, z, seed, wavelength) {
  return valueNoise2D(x / wavelength, z / wavelength, seed);
}
