import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildTyreTrackTrail,
  computeRearContactPoint,
  TRACK_MAX_POINTS,
  TRACK_MAX_AGE,
  TRACK_MIN_SEGMENT_DISTANCE,
  TRACK_REAR_OFFSET,
  TRACK_HEIGHT_OFFSET,
  TRACK_NORMAL_WIDTH,
  TRACK_SKID_WIDTH,
  TRACK_NORMAL_COLOR,
  TRACK_SKID_COLOR,
} from './TyreTrackTrail.js';

const terrain = {
  getHeightAt: (x, z) => 100 + x * 0.01 - z * 0.005,
};

// Straight down +z at yaw 0 (forward = (sin(0), cos(0)) = (0, 1) — BikeController's
// convention), grounded unless overridden.
function makeBike({ x = 0, z = 0, yaw = 0, grounded = true, brakeActive = false } = {}) {
  return {
    mesh: { position: { x, z } },
    yaw,
    brakeActive,
    isGrounded: () => grounded,
  };
}

describe('computeRearContactPoint', () => {
  it('offsets behind the bike opposite its forward direction at yaw 0', () => {
    const point = computeRearContactPoint(10, 20, 0);
    expect(point.x).toBeCloseTo(10);
    expect(point.z).toBeCloseTo(20 - TRACK_REAR_OFFSET);
  });

  it('rotates the offset with yaw', () => {
    const point = computeRearContactPoint(0, 0, Math.PI / 2);
    expect(point.x).toBeCloseTo(-TRACK_REAR_OFFSET);
    expect(point.z).toBeCloseTo(0);
  });
});

describe('buildTyreTrackTrail', () => {
  it('returns an empty mesh with update/reset attached', () => {
    const trail = buildTyreTrackTrail(terrain);
    expect(trail).toBeInstanceOf(THREE.Mesh);
    expect(trail.geometry.getAttribute('position')).toBeUndefined();
    expect(typeof trail.update).toBe('function');
    expect(typeof trail.reset).toBe('function');
  });

  it('stamps a grounded, moving bike into a ribbon of 2 vertices per point', () => {
    const trail = buildTyreTrackTrail(terrain);
    trail.update(1 / 60, makeBike({ z: 0 }));
    trail.update(1 / 60, makeBike({ z: 1 }));
    trail.update(1 / 60, makeBike({ z: 2 }));

    const position = trail.geometry.getAttribute('position');
    expect(position.count).toBe(3 * 2);
  });

  it('does not record points while airborne', () => {
    const trail = buildTyreTrackTrail(terrain);
    trail.update(1 / 60, makeBike({ z: 0, grounded: false }));
    trail.update(1 / 60, makeBike({ z: 1, grounded: false }));

    expect(trail.geometry.getAttribute('position')).toBeUndefined();
  });

  it('skips a new point when the bike has not moved TRACK_MIN_SEGMENT_DISTANCE', () => {
    const trail = buildTyreTrackTrail(terrain);
    trail.update(1 / 60, makeBike({ z: 0 }));
    trail.update(1 / 60, makeBike({ z: 1 })); // 2 points recorded so far -> a renderable ribbon
    expect(trail.geometry.getAttribute('position').count).toBe(2 * 2);

    trail.update(1 / 60, makeBike({ z: 1 + TRACK_MIN_SEGMENT_DISTANCE * 0.5 }));
    expect(trail.geometry.getAttribute('position').count).toBe(2 * 2); // unchanged
  });

  it('grounds each point via terrain.getHeightAt at the rear contact position', () => {
    const trail = buildTyreTrackTrail(terrain);
    trail.update(1 / 60, makeBike({ x: 5, z: 0 }));
    trail.update(1 / 60, makeBike({ x: 5, z: 1 }));

    const { x, z } = computeRearContactPoint(5, 1, 0);
    const expectedY = terrain.getHeightAt(x, z) + TRACK_HEIGHT_OFFSET;

    const position = trail.geometry.getAttribute('position');
    expect(position.getY(2)).toBeCloseTo(expectedY);
    expect(position.getY(3)).toBeCloseTo(expectedY);
  });

  it('renders a skid as a wider, darker segment than a normal rolling track', () => {
    const rolling = buildTyreTrackTrail(terrain);
    rolling.update(1 / 60, makeBike({ z: 0 }));
    rolling.update(1 / 60, makeBike({ z: 1 }));
    const rollingPos = rolling.geometry.getAttribute('position');
    const rollingWidth = Math.abs(rollingPos.getX(2) - rollingPos.getX(3));

    const skidding = buildTyreTrackTrail(terrain);
    skidding.update(1 / 60, makeBike({ z: 0, brakeActive: true }));
    skidding.update(1 / 60, makeBike({ z: 1, brakeActive: true }));
    const skidPos = skidding.geometry.getAttribute('position');
    const skidWidth = Math.abs(skidPos.getX(2) - skidPos.getX(3));

    expect(skidWidth).toBeCloseTo(TRACK_SKID_WIDTH);
    expect(rollingWidth).toBeCloseTo(TRACK_NORMAL_WIDTH);
    expect(skidWidth).toBeGreaterThan(rollingWidth);

    const rollingColor = rolling.geometry.getAttribute('color');
    const skidColor = skidding.geometry.getAttribute('color');
    expect(rollingColor.getX(2)).toBeCloseTo(TRACK_NORMAL_COLOR.r);
    expect(skidColor.getX(2)).toBeCloseTo(TRACK_SKID_COLOR.r);
  });

  it('caps geometry at TRACK_MAX_POINTS regardless of ride length', () => {
    const trail = buildTyreTrackTrail(terrain);
    const extra = 50;
    for (let i = 0; i < TRACK_MAX_POINTS + extra; i += 1) {
      trail.update(1 / 60, makeBike({ z: i * TRACK_MIN_SEGMENT_DISTANCE * 2 }));
    }

    const position = trail.geometry.getAttribute('position');
    expect(position.count).toBe(TRACK_MAX_POINTS * 2);
  });

  it('fades and expires points once they exceed TRACK_MAX_AGE', () => {
    const trail = buildTyreTrackTrail(terrain);
    trail.update(1 / 60, makeBike({ z: 0 }));
    trail.update(1 / 60, makeBike({ z: 1 }));

    const freshAlpha = trail.geometry.getAttribute('color').getW(0);
    expect(freshAlpha).toBeGreaterThan(0);

    // Stay grounded but stationary (relative to the last recorded point) so no new
    // points are added while time passes — isolates the age-based fade/expiry.
    trail.update(TRACK_MAX_AGE + 1, makeBike({ z: 1 }));

    expect(trail.geometry.getAttribute('position')).toBeUndefined();
  });

  it('reset() clears the trail back to empty', () => {
    const trail = buildTyreTrackTrail(terrain);
    trail.update(1 / 60, makeBike({ z: 0 }));
    trail.update(1 / 60, makeBike({ z: 1 }));
    expect(trail.geometry.getAttribute('position')).toBeDefined();

    trail.reset();
    expect(trail.geometry.getAttribute('position')).toBeUndefined();
  });
});
