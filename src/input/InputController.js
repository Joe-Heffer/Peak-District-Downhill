// Free-look camera (issue #39): drag-to-look rather than always-on mouse-follow, per
// the issue's own reasoning — a held drag reads as deliberate and doesn't fight
// steering input the way a cursor-follow camera would. `lookYawOffset` is a raw,
// clamped radian offset the player is actively dragging toward; `looking` tells
// BikeController.updateCamera() whether to track that offset directly or decay it back
// to zero (see LOOK_YAW_RETURN_RATE there) — the "no recent look input" auto-reset the
// issue asks for is just "the drag ended", not a separate idle timer.
const LOOK_YAW_SENSITIVITY = 0.006; // rad of camera yaw per pixel of horizontal drag
const LOOK_YAW_MAX_OFFSET = Math.PI * 0.85; // ~153 deg either way — wide but short of a full reverse-facing spin, so the trail ahead is never fully lost

function clampLookYaw(value) {
  return Math.min(LOOK_YAW_MAX_OFFSET, Math.max(-LOOK_YAW_MAX_OFFSET, value));
}

export function createInputController(canvas) {
  const state = {
    steerLeft: false,
    steerRight: false,
    jump: false,
    brake: false,
    boost: false,
    reset: false,
    steerAmount: 0, // continuous -1..1 signal, written externally by TiltController
    lookYawOffset: 0, // radians, camera yaw offset from the bike's forward heading
    looking: false, // true while the player is actively drag-to-looking
  };

  bindPointerZone('steer-left', (pressed) => (state.steerLeft = pressed));
  bindPointerZone('steer-right', (pressed) => (state.steerRight = pressed));
  bindPointerZone('brake-btn', (pressed) => (state.brake = pressed));
  bindPointerZone('boost-btn', (pressed) => (state.boost = pressed));
  bindPointerZone('jump-btn', (pressed) => {
    if (pressed) state.jump = true;
  });
  bindPointerZone('reset-btn', (pressed) => {
    if (pressed) state.reset = true;
  });

  // Optional: main.js only has the canvas once setupScene() has run, and tests that
  // don't care about free-look call createInputController() with no argument.
  if (canvas) bindLookDrag(canvas, state);

  window.addEventListener('keydown', (event) => handleKey(event, true));
  window.addEventListener('keyup', (event) => handleKey(event, false));

  function handleKey(event, pressed) {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        state.steerLeft = pressed;
        break;
      case 'ArrowRight':
      case 'KeyD':
        state.steerRight = pressed;
        break;
      case 'ArrowDown':
      case 'KeyS':
        state.brake = pressed;
        break;
      case 'KeyW':
      case 'ArrowUp':
        state.boost = pressed;
        break;
      case 'Space':
        if (pressed) state.jump = true;
        break;
      case 'KeyR':
        if (pressed) state.reset = true;
        break;
      default:
        break;
    }
  }

  return state;
}

function bindPointerZone(elementId, onPressChange) {
  const element = document.getElementById(elementId);

  element.addEventListener(
    'pointerdown',
    (event) => {
      event.preventDefault();
      onPressChange(true);
    },
    { passive: false },
  );

  const release = (event) => {
    event.preventDefault();
    onPressChange(false);
  };

  element.addEventListener('pointerup', release, { passive: false });
  element.addEventListener('pointercancel', release, { passive: false });
  element.addEventListener('pointerleave', release, { passive: false });
}

// Drag-to-look on the game canvas itself: PointerEvents unify mouse and touch, and the
// on-screen touch controls (`#controls`) live in a separate part of the DOM tree layered
// visually above the canvas (see style.css), so a touch starting on one of those buttons
// never reaches this listener — no extra conflict-avoidance needed beyond that layering.
function bindLookDrag(canvas, state) {
  let dragPointerId = null;
  let lastX = 0;

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      // Left mouse button only (event.button is always 0 for touch/pen primary contact).
      if (event.button !== 0) return;
      dragPointerId = event.pointerId;
      lastX = event.clientX;
      state.looking = true;
      // Guarded: not every test/older-browser environment implements pointer capture,
      // and drag tracking here works fine without it (pointermove keeps firing on the
      // canvas as long as the pointer stays within the window either way).
      canvas.setPointerCapture?.(dragPointerId);
    },
    { passive: true },
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerId !== dragPointerId) return;
      const deltaX = event.clientX - lastX;
      lastX = event.clientX;
      state.lookYawOffset = clampLookYaw(state.lookYawOffset - deltaX * LOOK_YAW_SENSITIVITY);
    },
    { passive: true },
  );

  const endDrag = (event) => {
    if (event.pointerId !== dragPointerId) return;
    dragPointerId = null;
    state.looking = false;
  };

  canvas.addEventListener('pointerup', endDrag, { passive: true });
  canvas.addEventListener('pointercancel', endDrag, { passive: true });
}
