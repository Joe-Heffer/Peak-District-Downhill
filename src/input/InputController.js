export function createInputController() {
  const state = { steerLeft: false, steerRight: false, jump: false, brake: false };

  bindPointerZone('steer-left', (pressed) => (state.steerLeft = pressed));
  bindPointerZone('steer-right', (pressed) => (state.steerRight = pressed));
  bindPointerZone('brake-btn', (pressed) => (state.brake = pressed));
  bindPointerZone('jump-btn', (pressed) => {
    if (pressed) state.jump = true;
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
      case 'Space':
      case 'ArrowUp':
        if (pressed) state.jump = true;
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
