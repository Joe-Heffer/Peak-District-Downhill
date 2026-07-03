import { routePointToWorld } from '../routes/RouteOverlay.js';

const MAX_WIDTH = 110;
const MAX_HEIGHT = 160;
const ROUTE_COLOR = 'rgba(255, 204, 0, 0.75)';
const MARKER_COLOR = '#ffffff';
const MARKER_TIP_LENGTH = 6;
const MARKER_BASE_LENGTH = 4;
const MARKER_BASE_WIDTH = 4;

// Same world bounds HeightmapTerrain.js builds the mesh within: x spans
// [0, (cols-1)*cellSize], z spans [-(rows-1)*cellSize, 0].
export function computeMapBounds(terrainData) {
  const { cols, rows, cellSize } = terrainData;
  return {
    minX: 0,
    maxX: (cols - 1) * cellSize,
    minZ: -(rows - 1) * cellSize,
    maxZ: 0,
  };
}

// Fits the bounds' aspect ratio within a maxWidth x maxHeight box rather than always
// filling a square canvas, which would visibly distort Cut Gate's tall north-south strip.
export function computeMapSize(bounds, maxWidth, maxHeight) {
  const aspect = (bounds.maxX - bounds.minX) / (bounds.maxZ - bounds.minZ);
  if (maxWidth / maxHeight > aspect) {
    return { width: maxHeight * aspect, height: maxHeight };
  }
  return { width: maxWidth, height: maxWidth / aspect };
}

// World (x, z) -> canvas pixel (x, y). No axis flip needed: canvas y already increases
// downward and world z already increases southward (route points are ordered
// north-to-south, see fetchRoute.js), so this projection is north-up for free.
export function worldToMapPoint(x, z, bounds, width, height) {
  return {
    x: ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * width,
    y: ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * height,
  };
}

export function createMiniMap(terrainData, routeData) {
  const canvas = document.getElementById('minimap');
  if (!canvas) return { update: () => {} };

  const bounds = computeMapBounds(terrainData);
  const { width, height } = computeMapSize(bounds, MAX_WIDTH, MAX_HEIGHT);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const routePoints = routeData.points.map(({ e, n }) => {
    const { x, z } = routePointToWorld({ e, n });
    return worldToMapPoint(x, z, bounds, width, height);
  });

  function drawRoute() {
    if (routePoints.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(routePoints[0].x, routePoints[0].y);
    for (const point of routePoints.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = ROUTE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Drawn as a triangle wedge pointing along the bike's forward vector rather than
  // ctx.rotate(), to keep the (dirX, dirZ) -> (canvasDx, canvasDy) mapping explicit —
  // it's the same no-flip direction as worldToMapPoint above.
  function drawBikeMarker(x, z, yaw) {
    const { x: bx, y: by } = worldToMapPoint(x, z, bounds, width, height);
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    const perpX = -dirZ;
    const perpZ = dirX;

    const tip = { x: bx + dirX * MARKER_TIP_LENGTH, y: by + dirZ * MARKER_TIP_LENGTH };
    const baseX = bx - dirX * MARKER_BASE_LENGTH;
    const baseY = by - dirZ * MARKER_BASE_LENGTH;
    const left = { x: baseX + perpX * MARKER_BASE_WIDTH, y: baseY + perpZ * MARKER_BASE_WIDTH };
    const right = { x: baseX - perpX * MARKER_BASE_WIDTH, y: baseY - perpZ * MARKER_BASE_WIDTH };

    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.fillStyle = MARKER_COLOR;
    ctx.fill();
  }

  return {
    update(x, z, yaw) {
      ctx.clearRect(0, 0, width, height);
      drawRoute();
      drawBikeMarker(x, z, yaw);
    },
  };
}
