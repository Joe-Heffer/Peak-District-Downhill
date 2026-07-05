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
const ROUTE_STYLE = { width: 2.2, color: 0xc9bb98, heightOffset: 0.16 };

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
  buildRibbonArrays(densifyPolyline(ribbonPoints), terrain, ROUTE_STYLE, arrays);

  const geometry = finalizeRibbonGeometry(arrays);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'route-cutgate';
  return mesh;
}
