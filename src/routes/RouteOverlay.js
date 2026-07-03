import * as THREE from 'three';

// Floated well above the terrain so the route reads as an overhead trail marker
// rather than a painted line on the ground — also keeps it clear of z-fighting.
const ROUTE_HEIGHT_OFFSET = 1.5;

export async function loadRouteData(url = `${import.meta.env.BASE_URL}data/routes/cutgate.json`) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load route data (${response.status})`);
  }
  return response.json();
}

// Shared by buildRouteOverlay below and main.js's bike spawn point so the two never
// drift apart on the e/n -> x/z conversion.
export function routePointToWorld({ e, n }) {
  return { x: e, z: -n };
}

// Purely decorative — renders the route as a subtle dashed trail on the
// terrain. Not tied to any gameplay/checkpoint logic.
export function buildRouteOverlay(routeData, terrain) {
  const points = routeData.points.map(({ e, n }) => {
    const { x, z } = routePointToWorld({ e, n });
    const y = terrain.getHeightAt(x, z) + ROUTE_HEIGHT_OFFSET;
    return new THREE.Vector3(x, y, z);
  });

  const curve = new THREE.CatmullRomCurve3(points);
  
  // Extract points along the curve to form our line
  const curvePoints = curve.getPoints(points.length * 4);
  const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
  
  // Green dashed line, echoing the public bridleway symbol on OS Explorer maps.
  const material = new THREE.LineDashedMaterial({
    color: 0x1a8f3c,
    linewidth: 1, // Note: Most WebGL implementations enforce a max linewidth of 1
    dashSize: 3.0,
    gapSize: 3.0,
    transparent: true,
    opacity: 0.85
  });

  const line = new THREE.Line(geometry, material);
  
  // computeLineDistances is strictly required for LineDashedMaterial to render gaps!
  line.computeLineDistances();

  return line;
}
