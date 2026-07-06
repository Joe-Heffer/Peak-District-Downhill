// Course registry for the pre-run course-select overlay (see CourseSelect.js). Manually
// maintained until issue #47 generalizes tools/terrain/ into a multi-location pipeline that
// could generate this instead. Per-course data file URLs are derived from `id` at the call
// site (src/main.js) rather than stored here, matching how the existing terrain/route loaders
// already default to `${BASE_URL}data/.../cutgate*.json`.
export const COURSES = [
  {
    id: 'cutgate',
    name: 'Cut Gate',
    description: 'Margery Hill to Upper Derwent Visitor Centre',
    // British National Grid (EPSG:27700) bbox — mirrors tools/terrain/config.js's BNG_BBOX
    // for this course. Duplicated here (rather than imported) since tools/terrain/ is a
    // dev-only Node pipeline, not part of the browser bundle.
    bbox: { minE: 418200, minN: 395600, maxE: 419800, maxN: 399300 },
  },
];
