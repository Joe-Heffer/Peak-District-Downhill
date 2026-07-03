// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTiltController, isTiltSupported, TILT_DEADZONE_DEG, TILT_MAX_DEG } from './TiltController.js';

function dispatchTilt(gamma) {
  const event = new Event('deviceorientation');
  event.gamma = gamma;
  window.dispatchEvent(event);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isTiltSupported', () => {
  it('is false when window.DeviceOrientationEvent is absent', () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    expect(isTiltSupported()).toBe(false);
  });

  it('is true when window.DeviceOrientationEvent is present', () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    expect(isTiltSupported()).toBe(true);
  });
});

describe('createTiltController on a platform with no permission gate', () => {
  beforeEach(() => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
  });

  it('enables without calling any permission API and steers from tilt', async () => {
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    const granted = await tiltController.enable();
    expect(granted).toBe(true);
    expect(tiltController.isEnabled()).toBe(true);

    dispatchTilt(0);
    dispatchTilt(10);
    expect(state.steerAmount).not.toBe(0);
  });

  it('returns false and does nothing when tilt is unsupported', async () => {
    vi.stubGlobal('DeviceOrientationEvent', undefined);
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    const granted = await tiltController.enable();
    expect(granted).toBe(false);
    expect(tiltController.isEnabled()).toBe(false);
  });
});

describe('createTiltController on an iOS-style permission-gated platform', () => {
  it('enables when permission is granted', async () => {
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: vi.fn().mockResolvedValue('granted') });
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    const granted = await tiltController.enable();
    expect(granted).toBe(true);
    expect(tiltController.isEnabled()).toBe(true);
  });

  it('does not enable when permission is denied', async () => {
    vi.stubGlobal('DeviceOrientationEvent', { requestPermission: vi.fn().mockResolvedValue('denied') });
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    const granted = await tiltController.enable();
    expect(granted).toBe(false);
    expect(tiltController.isEnabled()).toBe(false);

    dispatchTilt(15);
    expect(state.steerAmount).toBe(0);
  });

  it('does not throw and returns false when the permission promise rejects', async () => {
    vi.stubGlobal('DeviceOrientationEvent', {
      requestPermission: vi.fn().mockRejectedValue(new Error('denied by user')),
    });
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    await expect(tiltController.enable()).resolves.toBe(false);
    expect(tiltController.isEnabled()).toBe(false);
  });
});

describe('createTiltController calibration and steer-amount math', () => {
  beforeEach(() => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
  });

  it('treats the tilt angle at enable time as the zero-steer center', async () => {
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    dispatchTilt(10); // establishes lastGamma before enable() calibrates off it
    await tiltController.enable();

    dispatchTilt(10 + TILT_DEADZONE_DEG);
    expect(state.steerAmount).toBe(0);
  });

  it('returns a proportional negative (steer-right) value beyond the deadzone', async () => {
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    dispatchTilt(10);
    await tiltController.enable();

    dispatchTilt(10 + TILT_DEADZONE_DEG + 3);
    expect(state.steerAmount).toBeCloseTo(-3 / (TILT_MAX_DEG - TILT_DEADZONE_DEG));
  });

  it('returns a proportional positive (steer-left) value beyond the deadzone', async () => {
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    dispatchTilt(10);
    await tiltController.enable();

    dispatchTilt(10 - TILT_DEADZONE_DEG - 3);
    expect(state.steerAmount).toBeCloseTo(3 / (TILT_MAX_DEG - TILT_DEADZONE_DEG));
  });

  it('clamps to exactly +/-1 beyond TILT_MAX_DEG', async () => {
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    dispatchTilt(0);
    await tiltController.enable();

    dispatchTilt(-(TILT_MAX_DEG + 15));
    expect(state.steerAmount).toBe(1);

    dispatchTilt(TILT_MAX_DEG + 15);
    expect(state.steerAmount).toBe(-1);
  });

  it('recalibrates relative to a new center when calibrate() is called again', async () => {
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    dispatchTilt(0);
    await tiltController.enable();

    dispatchTilt(20); // becomes the new lastGamma
    tiltController.calibrate();

    dispatchTilt(20 + TILT_DEADZONE_DEG);
    expect(state.steerAmount).toBe(0);
  });
});

describe('createTiltController disable()', () => {
  beforeEach(() => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
  });

  it('zeroes steerAmount synchronously and ignores further tilt until re-enabled', async () => {
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    dispatchTilt(0);
    await tiltController.enable();
    dispatchTilt(15);
    expect(state.steerAmount).not.toBe(0);

    tiltController.disable();
    expect(state.steerAmount).toBe(0);

    dispatchTilt(15);
    expect(state.steerAmount).toBe(0);
  });

  it('only registers one deviceorientation listener across enable/disable/enable cycles', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const state = { steerAmount: 0 };
    const tiltController = createTiltController(state);

    await tiltController.enable();
    tiltController.disable();
    await tiltController.enable();

    const tiltListenerCalls = addEventListenerSpy.mock.calls.filter(([type]) => type === 'deviceorientation');
    expect(tiltListenerCalls).toHaveLength(1);
  });
});
