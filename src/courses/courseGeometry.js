// Rough BNG (EPSG:27700) bbox for the whole Peak District National Park — not
// survey-accurate, just enough to place course markers at proportionally sensible relative
// positions on the course-select overview map. Expand if a future course falls outside it.
export const PEAK_DISTRICT_BBOX = { minE: 380000, minN: 355000, maxE: 460000, maxN: 410000 };

// Projects a course's real-world bbox center onto the overview map as percentage coordinates,
// so marker placement stays derived from route data instead of hardcoded per-course pixels.
export function projectToOverview(bbox, overviewBbox = PEAK_DISTRICT_BBOX) {
  const centerE = (bbox.minE + bbox.maxE) / 2;
  const centerN = (bbox.minN + bbox.maxN) / 2;
  return {
    xPercent: ((centerE - overviewBbox.minE) / (overviewBbox.maxE - overviewBbox.minE)) * 100,
    // North is up on the overview map: higher northing -> smaller yPercent.
    yPercent: (1 - (centerN - overviewBbox.minN) / (overviewBbox.maxN - overviewBbox.minN)) * 100,
  };
}
