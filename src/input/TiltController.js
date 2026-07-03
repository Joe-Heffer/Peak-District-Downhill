export const TILT_DEADZONE_DEG = 3;
export const TILT_MAX_DEG = 20;

export function isTiltSupported() {
  return typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined';
}

export function createTiltController(state) {
  let lastGamma = null;
  let centerGamma = null;
  let enabled = false;

  function handleOrientation(event) {
    if (typeof event.gamma !== 'number') return;
    lastGamma = event.gamma;
    if (centerGamma === null) centerGamma = event.gamma;
    if (!enabled) return;
    state.steerAmount = computeSteerAmount(event.gamma - centerGamma);
  }

  // Attached immediately (not gated on enable()) so a raw tilt sample is already
  // available by the time enable() calibrates — on non-iOS browsers deviceorientation
  // events fire without any permission step, so waiting until enable() to start
  // listening would otherwise throw away whatever sample arrived first.
  window.addEventListener('deviceorientation', handleOrientation);

  function calibrate() {
    if (lastGamma !== null) centerGamma = lastGamma;
  }

  async function enable() {
    if (!isTiltSupported()) return false;

    const needsPermission = typeof DeviceOrientationEvent.requestPermission === 'function';
    if (needsPermission) {
      let result;
      try {
        result = await DeviceOrientationEvent.requestPermission();
      } catch {
        return false;
      }
      if (result !== 'granted') return false;
    }

    calibrate();
    enabled = true;
    return true;
  }

  function disable() {
    enabled = false;
    state.steerAmount = 0;
  }

  return { enable, disable, calibrate, isEnabled: () => enabled };
}

// gamma increases as the device tilts right, and steerRight's existing effect is
// `yaw -= turnCap * dt`, so a positive offset must map to a *negative* steerAmount to
// steer right — verify this sign feels correct on a real device, not just in tests.
function computeSteerAmount(offsetDeg) {
  const magnitude = Math.abs(offsetDeg);
  if (magnitude <= TILT_DEADZONE_DEG) return 0;
  const travel = Math.min(magnitude, TILT_MAX_DEG) - TILT_DEADZONE_DEG;
  const normalized = travel / (TILT_MAX_DEG - TILT_DEADZONE_DEG);
  return -Math.sign(offsetDeg) * normalized;
}
