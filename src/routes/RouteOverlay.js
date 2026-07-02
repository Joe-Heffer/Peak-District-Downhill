import * as THREE from 'three';

const ROUTE_HEIGHT_OFFSET = 0.15;
const ROUTE_RADIUS = 0.4;

export async function loadRouteData(url = `${import.meta.env.BASE_URL}data/routes/cutgate.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load route data (${response.status})`);
  }
  return response.json();
}

// Purely decorative — renders the real (or placeholder) route as a visible trail on the
// terrain. Not tied to any gameplay/checkpoint logic.
export function buildRouteOverlay(routeData, terrain) {
  const points = routeData.points.map(({ e, n }) => {
    const x = e;
    const z = -n;
    const y = terrain.getHeightAt(x, z) + ROUTE_HEIGHT_OFFSET;
    return new THREE.Vector3(x, y, z);
  });

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, points.length * 4, ROUTE_RADIUS, 6, false);
  const material = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  return new THREE.Mesh(geometry, material);
}
