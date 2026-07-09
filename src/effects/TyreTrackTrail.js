import * as THREE from 'three';

// A capped ring buffer of recorded rear-wheel contact points (issue #168) rendered as a
// ribbon strip, similar technique to src/routes/ribbonGeometry.js's buildRibbonArrays
// but rebuilt every frame from a growing/shrinking point list rather than a fixed route,
// and with per-point width/color/alpha (skid vs roll, age fade) instead of one shared
// style. TRACK_MAX_POINTS bounds geometry size regardless of ride length; TRACK_MAX_AGE
// additionally expires/fades points that are simply old, even on a short ride that never
// hits the point cap.
export const TRACK_MAX_POINTS = 400;
export const TRACK_MAX_AGE = 20; // seconds before a point is fully faded and dropped
export const TRACK_MIN_SEGMENT_DISTANCE = 0.4; // metres between recorded points
export const TRACK_REAR_OFFSET = 0.55; // metres behind the bike's centre — approx. rear-wheel contact
export const TRACK_HEIGHT_OFFSET = 0.05; // metres above terrain — under every route/paths ribbon offset
export const TRACK_NORMAL_WIDTH = 0.16; // metres — a single rolling tyre's imprint
export const TRACK_SKID_WIDTH = 0.34; // metres — wider, scrubbed-out skid mark
export const TRACK_NORMAL_COLOR = new THREE.Color(0x4a3a26); // light rolling track
export const TRACK_SKID_COLOR = new THREE.Color(0x1c1712); // heavy/dark skid mark
export const TRACK_NORMAL_MAX_ALPHA = 0.6;
export const TRACK_SKID_MAX_ALPHA = 0.85;

// Rear-wheel contact point, TRACK_REAR_OFFSET behind the bike's centre along its own
// direction of travel — matches BikeController's forward = (sin(yaw), _, cos(yaw))
// convention (see its syncAfterStep comment), so the stamped point tracks roughly where
// the rear tyre actually meets the ground, not the chassis centre.
export function computeRearContactPoint(x, z, yaw, rearOffset = TRACK_REAR_OFFSET) {
  return {
    x: x - Math.sin(yaw) * rearOffset,
    z: z - Math.cos(yaw) * rearOffset,
  };
}

// Builds a flat quad-strip's {positions, colors (rgba), indices} from a point list, one
// cross-section per point (2 rail vertices), perpendicular direction from the averaged
// incoming/outgoing segment — same simple no-miter-clamping approach as
// ribbonGeometry.js's buildRibbonArrays. Colors carry per-point alpha (itemSize 4) so
// three.js's USE_COLOR_ALPHA vertex-color path drives the age-based fade without a
// custom shader.
function buildArrays(points) {
  const positions = [];
  const colors = [];
  const indices = [];

  points.forEach((point, i) => {
    const prev = points[Math.max(i - 1, 0)];
    const next = points[Math.min(i + 1, points.length - 1)];
    const dirX = next.x - prev.x;
    const dirZ = next.z - prev.z;
    const len = Math.hypot(dirX, dirZ) || 1;
    const perpX = -dirZ / len;
    const perpZ = dirX / len;
    const halfWidth = point.width / 2;

    positions.push(
      point.x + perpX * halfWidth,
      point.y,
      point.z + perpZ * halfWidth,
      point.x - perpX * halfWidth,
      point.y,
      point.z - perpZ * halfWidth,
    );
    colors.push(
      point.color.r,
      point.color.g,
      point.color.b,
      point.alpha,
      point.color.r,
      point.color.g,
      point.color.b,
      point.alpha,
    );
  });

  for (let i = 0; i < points.length - 1; i += 1) {
    const p00 = i * 2;
    const p01 = p00 + 1;
    const p10 = p00 + 2;
    const p11 = p00 + 3;
    indices.push(p00, p01, p11, p00, p11, p10);
  }

  return { positions, colors, indices };
}

// Persistent tyre tracks (issue #168): a visible, terrain-following imprint of the
// bike's actual ridden line — distinct from RouteOverlay.js's static, intended-route
// ribbon. Sampled each frame from `bike` (mesh.position, yaw, isGrounded(),
// brakeActive), grounded via terrain.getHeightAt like every other terrain-following
// element in this codebase. Returns a THREE.Mesh with update(dt, bike)/reset() attached,
// the same tacked-on-lifecycle-hook pattern as buildScenery()/buildGroundMist().
export function buildTyreTrackTrail(terrain) {
  const points = [];

  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'tyre-track-trail';
  mesh.frustumCulled = false; // the trail can span the whole route; never worth culling away

  function syncGeometry() {
    if (points.length < 2) {
      geometry.setIndex([]);
      geometry.deleteAttribute('position');
      geometry.deleteAttribute('color');
      return;
    }
    const { positions, colors, indices } = buildArrays(points);
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 4));
    geometry.setIndex(indices);
  }

  mesh.update = (dt, bike) => {
    for (const point of points) point.age += dt;
    while (points.length > 0 && points[0].age > TRACK_MAX_AGE) points.shift();

    const grounded = typeof bike.isGrounded === 'function' ? bike.isGrounded() : true;
    if (grounded) {
      const { x, z } = computeRearContactPoint(bike.mesh.position.x, bike.mesh.position.z, bike.yaw);
      const last = points[points.length - 1];
      if (!last || Math.hypot(x - last.x, z - last.z) >= TRACK_MIN_SEGMENT_DISTANCE) {
        const skidding = Boolean(bike.brakeActive);
        points.push({
          x,
          z,
          y: terrain.getHeightAt(x, z) + TRACK_HEIGHT_OFFSET,
          age: 0,
          skidding,
          width: skidding ? TRACK_SKID_WIDTH : TRACK_NORMAL_WIDTH,
          color: skidding ? TRACK_SKID_COLOR : TRACK_NORMAL_COLOR,
          alpha: skidding ? TRACK_SKID_MAX_ALPHA : TRACK_NORMAL_MAX_ALPHA,
        });
        if (points.length > TRACK_MAX_POINTS) points.shift();
      }
    }

    // Age-based fade on top of the hard TRACK_MAX_AGE cutoff above, so a point dims
    // smoothly toward transparent rather than popping out of existence.
    for (const point of points) {
      const maxAlpha = point.skidding ? TRACK_SKID_MAX_ALPHA : TRACK_NORMAL_MAX_ALPHA;
      point.alpha = maxAlpha * Math.max(0, 1 - point.age / TRACK_MAX_AGE);
    }

    syncGeometry();
  };

  mesh.reset = () => {
    points.length = 0;
    syncGeometry();
  };

  syncGeometry();
  return mesh;
}
