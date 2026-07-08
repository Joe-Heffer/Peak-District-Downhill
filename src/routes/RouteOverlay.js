import * as THREE from 'three';
import { routePointToWorld, buildRibbonArrays, finalizeRibbonGeometry, densifyPolyline } from './ribbonGeometry.js';

export { routePointToWorld };

// Slightly wider than PathsOverlay.js's PATH_STYLES.bridleway (1.8m) since this is the
// hero route the camera follows. Vertex color multiplies the shared rocky texture, so
// (as with HeightmapTerrain.js's neutral-white `grass` tint) it's kept light and warm
// rather than a saturated painted-line green — a strong/cool tint would crush the
// texture's own stone/gravel contrast down to a flat color and read as paint rather
// than a well-trodden, lighter-worn strip of the same rocky ground. heightOffset sits
// above every PATH_STYLES offset so the ridden route always renders visibly on top at
// any junction/crossing with the surrounding network.
//
// rockiness gives the ridden route (and only the ridden route — PathsOverlay.js's
// styles don't set this) real cross-section relief instead of a flat 2-vertex-wide
// plank; see buildRibbonArrays in ribbonGeometry.js for how it's consumed. Two noise
// octaves: a coarser "rock lump" scale and a finer "gravel" scale. wavelengthCoarse is
// deliberately not a simple multiple of ROCK_TEXTURE_TILE_METRES (1.5m) or this style's
// own width (2.2m), avoiding a moiré beat between the geometric bump period and the
// texture's own repeat. segments=4 gives 5 cross-section columns, ~0.55m apart.
const ROUTE_STYLE = {
  width: 2.2,
  color: 0xc9bb98,
  heightOffset: 0.16,
  rockiness: {
    segments: 4,
    amplitudeCoarse: 0.05,
    amplitudeFine: 0.02,
    wavelengthCoarse: 0.8,
    wavelengthFine: 0.22,
    seed: 4242,
  },
};

// Along-length sample spacing for the route ribbon only. The shared densifyPolyline
// default (ribbonGeometry.js's MAX_RIBBON_SEGMENT_METRES, 2m) is tuned for UV/mip
// reasons on a flat ribbon — far coarser than ROUTE_STYLE.rockiness's 0.22-0.8m noise
// wavelengths, which would otherwise be undersampled along the route's length and read
// as uncorrelated jitter row-to-row instead of a coherent rocky ripple running down the
// trail. ~2 samples per coarse wavelength. Only applied to this route-local
// densifyPolyline call, so PathsOverlay.js's ribbons (which don't opt into rockiness)
// keep the cheaper shared default.
const ROUTE_ROCKINESS_SEGMENT_METRES = 0.35;

export async function loadRouteData(url = `${import.meta.env.BASE_URL}data/routes/cutgate.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load route data (${response.status})`);
  }
  return response.json();
}

// Heading (world-Y-axis yaw, same convention as BikeController's forward =
// (sin(yaw), 0, cos(yaw))) from the route's first point toward its second, so the bike
// can spawn already facing down the track instead of always at a fixed yaw of 0. Falls
// back to 0 (unrotated) for a degenerate route — fewer than two points, or the first two
// points coinciding — rather than feeding atan2 a zero vector.
export function computeSpawnYaw(routeData) {
  const points = routeData.points;
  if (!points || points.length < 2) return 0;

  const a = routePointToWorld(points[0]);
  const b = routePointToWorld(points[1]);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (dx === 0 && dz === 0) return 0;

  return Math.atan2(dx, dz);
}

// Renders the ridden Cut Gate route as a ground-level rocky ribbon (same texture/
// material as the surrounding paths network) — the surface the player actually rides
// along, not a decorative overhead marker. Not tied to any gameplay/checkpoint logic.
export function buildRouteOverlay(routeData, terrain, material) {
  // Only x/z (from the e/n control points) matter for the curve's shape here — the
  // ribbon's y comes from re-sampling terrain height at each densified point below, not
  // from these control points, so y is left at 0.
  const points = routeData.points.map(({ e, n }) => {
    const { x, z } = routePointToWorld({ e, n });
    return new THREE.Vector3(x, 0, z);
  });

  const curve = new THREE.CatmullRomCurve3(points);

  // Densify so the ribbon follows the curve's smoothed shape, not the raw control
  // polygon's straight segments between them.
  const curvePoints = curve.getPoints(points.length * 4);
  const ribbonPoints = curvePoints.map((p) => ({ e: p.x, n: -p.z }));

  const arrays = { positions: [], colors: [], uvs: [], indices: [] };
  buildRibbonArrays(densifyPolyline(ribbonPoints, ROUTE_ROCKINESS_SEGMENT_METRES), terrain, ROUTE_STYLE, arrays);

  const geometry = finalizeRibbonGeometry(arrays);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'route-cutgate';
  return mesh;
}
