// Expands each route sample into laterally-offset candidate points — one call per
// entry in `sides` (a list of +1/-1 multipliers; repeat a side to place more than one
// candidate on it, e.g. [-1, -1, 1, 1] for two candidates per side). A skip probability
// thins the result. `random()` is always called in the same order for a given seed
// (skip check, then — only if kept — the lateral distance draw) so output stays
// reproducible run to run.
export function jitterLateral(samples, random, { lateralMin, lateralMax, sides = [-1, 1], skipProbability = 0 }) {
  const points = [];

  for (const sample of samples) {
    for (const side of sides) {
      if (random() < skipProbability) continue;

      const lateral = lateralMin + random() * (lateralMax - lateralMin);
      points.push({
        x: sample.x + sample.lateralX * lateral * side,
        z: sample.z + sample.lateralZ * lateral * side,
      });
    }
  }

  return points;
}
