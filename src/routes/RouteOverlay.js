import * as THREE from 'three';

// Slightly raised to ensure the line doesn't z-fight with uneven terrain
const ROUTE_HEIGHT_OFFSET = 0.25; 

export async function loadRouteData(url = `${import.meta.env.BASE_URL}data/routes/cutgate.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load route data (${response.status})`);
  }
  return response.json();
}

// Purely decorative — renders the route as a subtle dashed trail on the
// terrain. Not tied to any gameplay/checkpoint logic.
export function buildRouteOverlay(routeData, terrain) {
  const points = routeData.points.map(({ e, n }) => {
    const x = e;
    const z = -n;
    const y = terrain.getHeightAt(x, z) + ROUTE_HEIGHT_OFFSET;
    return new THREE.Vector3(x, y, z);
  });

  const curve = new THREE.CatmullRomCurve3(points);
  
  // Extract points along the curve to form our line
  const curvePoints = curve.getPoints(points.length * 4);
  const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
  
  // Use a subtle dashed material instead of a solid tube
  const material = new THREE.LineDashedMaterial({
    color: 0xffcc00,
    linewidth: 1, // Note: Most WebGL implementations enforce a max linewidth of 1
    dashSize: 2.5,
    gapSize: 5.0,
    transparent: true,
    opacity: 0.6
  });

  const line = new THREE.Line(geometry, material);
  
  // computeLineDistances is strictly required for LineDashedMaterial to render gaps!
  line.computeLineDistances();

  return line;
}
