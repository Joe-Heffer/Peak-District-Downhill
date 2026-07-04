export function createInputController() {
  const state = {
    steerLeft: false,
    steerRight: false,
    jump: false,
    brake: false,
    pedal: false,
    reset: false,
    steerAmount: 0, // continuous -1..1 signal, written externally by TiltController
  };

  bindPointerZone('steer-left', (pressed) => (state.steerLeft = pressed));
  bindPointerZone('steer-right', (pressed) => (state.steerRight = pressed));
  bindPointerZone('brake-btn', (pressed) => (state.brake = pressed));
  bindPointerZone('pedal-btn', (pressed) => (state.pedal = pressed));
  bindPointerZone('jump-btn', (pressed) => {
    if (pressed) state.jump = true;
  });
  bindPointerZone('reset-btn', (pressed) => {
    if (pressed) state.reset = true;
  });

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
        state.pedal = pressed;
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
