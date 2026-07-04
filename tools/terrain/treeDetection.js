// Pure, side-effect-free canopy-apex detection over a normalized DSM (nDSM = DSM - DTM)
// grid — no fs/network, kept importable/testable in isolation (same spirit as
// pathClassification.js). Used by buildTrees.js to turn a canopy height model into
// individual tree candidates: positions + heights, for issue #50.

// Minimum nDSM height (metres) above ground to count as tree canopy rather than a hedge,
// shrub, or LIDAR noise.
export const DEFAULT_MIN_CANOPY_HEIGHT = 2;

// Minimum distance (metres) enforced between two accepted tree apexes. Real tree crowns
// rarely overlap much closer than this, and enforcing it is what stops a broad, evenly
// tall canopy blob from producing one apex per raw grid cell (an unnaturally uniform,
// grid-like result — see issue #50's open questions).
export const DEFAULT_MIN_SEPARATION = 3;

// Rough canopy-radius heuristic (metres) from apex height, clamped so it never exceeds
// half the minimum separation (which would make neighbouring canopies overlap) or drop
// below a plausible minimum for a real tree.
export function estimateCanopyRadius(height, { minSeparation = DEFAULT_MIN_SEPARATION } = {}) {
  return Math.min(minSeparation / 2, Math.max(1, height * 0.25));
}

// grid: { cols, rows, cellSize, get(i, j) => nDSM height in metres, or null for no-data }.
// Finds candidate canopy cells above minCanopyHeight, then greedily keeps the tallest
// candidate first and discards any other candidate within minSeparation of an already-kept
// apex (non-maximum suppression) — equivalent to windowed local-maxima detection but
// simpler, and it naturally yields one apex per canopy blob regardless of how flat its top
// is. Returns [{ e, n, height, radius }] in the grid's own local metres (e = i * cellSize,
// n = j * cellSize).
export function detectTreeApexes(
  grid,
  { minCanopyHeight = DEFAULT_MIN_CANOPY_HEIGHT, minSeparation = DEFAULT_MIN_SEPARATION } = {},
) {
  const { cols, rows, cellSize, get } = grid;

  const candidates = [];
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const height = get(i, j);
      if (height === null || height === undefined || height < minCanopyHeight) continue;
      candidates.push({ i, j, height });
    }
  }

  candidates.sort((a, b) => b.height - a.height);

  const minSeparationSq = minSeparation * minSeparation;
  const accepted = [];
  for (const candidate of candidates) {
    const tooClose = accepted.some((other) => {
      const dx = (other.i - candidate.i) * cellSize;
      const dn = (other.j - candidate.j) * cellSize;
      return dx * dx + dn * dn < minSeparationSq;
    });
    if (!tooClose) accepted.push(candidate);
  }

  return accepted.map(({ i, j, height }) => ({
    e: i * cellSize,
    n: j * cellSize,
    height,
    radius: estimateCanopyRadius(height, { minSeparation }),
  }));
}
