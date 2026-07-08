import * as THREE from 'three';
import { fbmSample } from './ribbonNoise.js';

// Metres per texture tile along a ribbon's length/width — shared by every ribbon
// (route + paths) so the rocky texture reads at a consistent stone scale regardless
// of a given ribbon's width. See RockTrackTexture.js for the texture this tiles.
export const ROCK_TEXTURE_TILE_METRES = 1.5;

// Shared by every ribbon builder below and by main.js's bike spawn point / MiniMap /
// Scenery, so none of them ever drift apart on the e/n -> x/z conversion. Lives here
// (rather than RouteOverlay.js) so RouteOverlay.js can import the ribbon builder below
// without creating a circular import with PathsOverlay.js.
export function routePointToWorld({ e, n }) {
  return { x: e, z: -n };
}

// Longest allowed gap (metres) between consecutive ribbon points before
// densifyPolyline (below) inserts more. Route/path source points can be tens of
// metres apart, but each is rendered as a single flat quad with linearly-interpolated
// UVs — if a quad's length spans many ROCK_TEXTURE_TILE_METRES repeats, the texture
// changes faster than screen pixels can resolve, so the GPU's mipmapping collapses it
// to a flat average color instead of visible stone detail. Keeping segments shorter
// than the tile size avoids that.
const MAX_RIBBON_SEGMENT_METRES = 2;

// Linearly subdivides `points` (in {e,n} space) so no two consecutive points are more
// than `maxSegmentMetres` apart, preserving the first and last point exactly. Used to
// pre-densify sparse path/route data before handing it to buildRibbonArrays — see
// MAX_RIBBON_SEGMENT_METRES above for why.
export function densifyPolyline(points, maxSegmentMetres = MAX_RIBBON_SEGMENT_METRES) {
  if (points.length < 2) return points;

  const result = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.e - a.e, b.n - a.n) / maxSegmentMetres));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      result.push({ e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t });
    }
  }
  return result;
}

// Appends one path's ribbon (a quad-strip following the terrain, textured with a
// tiling rock texture) into the shared {positions, colors, uvs, indices} arrays.
// Per-vertex perpendicular is the averaged normal of the incoming/outgoing segment
// directions — simple, no miter-length clamping (acceptable v1 scope limit at this
// path density, same spirit as fetchLandcover.js's documented multipolygon-skip limit).
//
// With style.rockiness unset, each sample gets exactly its 2 rail vertices (left/right
// edge), same as a plain flat ribbon. With style.rockiness set (see RouteOverlay.js's
// ROUTE_STYLE), each sample instead gets `segments + 1` cross-section vertices, and the
// interior ones are lifted by coherent noise — see buildRockinessOffset below — so the
// ribbon reads as embedded rock relief rather than a flat plank. segments=1 (the
// default) makes the loop below degenerate to exactly the old 2-vertex-per-sample
// behaviour and triangulation, which is what keeps every ribbon that doesn't opt into
// rockiness (i.e. every PathsOverlay.js category) byte-identical to before this existed.
function buildRockinessOffset(rockiness, x, z, edgeFalloff) {
  const coarse = (fbmSample(x, z, rockiness.seed, rockiness.wavelengthCoarse) + 1) / 2;
  const fine = (fbmSample(x, z, rockiness.seed + 1, rockiness.wavelengthFine) + 1) / 2;
  // Remapped to [0,1] (not max(0, noise)-clamped) before scaling, so the relief is
  // additive-only — the ribbon surface can never dip below the flat heightOffset
  // baseline, which would otherwise risk it clipping into the terrain mesh underneath
  // at a shallow offset, or undercutting the route-above-paths draw-order invariant.
  return (coarse * rockiness.amplitudeCoarse + fine * rockiness.amplitudeFine) * edgeFalloff;
}

export function buildRibbonArrays(points, terrain, style, arrays) {
  const world = points.map((p) => routePointToWorld(p));
  if (world.length < 2) return;

  const color = new THREE.Color(style.color);
  const halfWidth = style.width / 2;
  const baseIndex = arrays.positions.length / 3;
  const rockiness = style.rockiness ?? null;
  const segments = rockiness ? rockiness.segments : 1;
  const columns = segments + 1;

  let arcLength = 0;
  for (let i = 0; i < world.length; i += 1) {
    const prev = world[Math.max(i - 1, 0)];
    const next = world[Math.min(i + 1, world.length - 1)];
    const dirX = next.x - prev.x;
    const dirZ = next.z - prev.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const perpX = -dirZ / len;
    const perpZ = dirX / len;

    const { x, z } = world[i];
    const baseY = terrain.getHeightAt(x, z) + style.heightOffset;

    if (i > 0) {
      const prevWorld = world[i - 1];
      arcLength += Math.hypot(x - prevWorld.x, z - prevWorld.z);
    }
    const v = arcLength / ROCK_TEXTURE_TILE_METRES;

    for (let c = 0; c < columns; c += 1) {
      const frac = c / segments;
      const offset = halfWidth - frac * style.width; // +halfWidth (left rail) .. -halfWidth (right rail)
      const vx = x + perpX * offset;
      const vz = z + perpZ * offset;

      let y = baseY;
      if (rockiness) {
        const edgeFalloff = Math.sin(Math.PI * frac); // 0 at both rails, 1 at mid-width
        y = baseY + buildRockinessOffset(rockiness, vx, vz, edgeFalloff);
      }

      arrays.positions.push(vx, y, vz);
      arrays.colors.push(color.r, color.g, color.b);
      arrays.uvs.push(offset / ROCK_TEXTURE_TILE_METRES, v);
    }
  }

  for (let i = 0; i < world.length - 1; i += 1) {
    for (let c = 0; c < columns - 1; c += 1) {
      const p00 = baseIndex + i * columns + c;
      const p01 = p00 + 1;
      const p10 = baseIndex + (i + 1) * columns + c;
      const p11 = p10 + 1;
      arrays.indices.push(p00, p01, p11, p00, p11, p10);
    }
  }
}

// Shared BufferGeometry assembly for a ribbon's {positions, colors, uvs, indices}
// arrays, used by both RouteOverlay.js and PathsOverlay.js so the attribute setup
// (and computeVertexNormals call) only lives in one place.
export function finalizeRibbonGeometry(arrays) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arrays.positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(arrays.colors), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(arrays.uvs), 2));
  geometry.setIndex(arrays.indices);
  geometry.computeVertexNormals();
  return geometry;
}
