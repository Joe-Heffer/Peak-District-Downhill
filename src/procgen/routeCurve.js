import * as THREE from 'three';
import { routePointToWorld } from '../routes/RouteOverlay.js';

// Builds the route centreline in world space, grounded via terrain.getHeightAt — the
// shared starting point for every procgen stage that samples along the route (rock and
// grass scatter today, future scattered content later), and for any route-distance
// sanity check a caller wants to do independently (see Scenery.test.js).
export function buildRouteCurve(routeData, terrain) {
  const points = routeData.points.map((point) => {
    const { x, z } = routePointToWorld(point);
    return new THREE.Vector3(x, terrain.getHeightAt(x, z), z);
  });
  return new THREE.CatmullRomCurve3(points);
}
