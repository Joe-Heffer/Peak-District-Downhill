// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createInputController } from './InputController.js';

beforeEach(() => {
  document.body.innerHTML = `
    <div id="steer-left"></div>
    <div id="steer-right"></div>
    <div id="brake-btn"></div>
    <div id="boost-btn"></div>
    <div id="jump-btn"></div>
    <div id="reset-btn"></div>
  `;
});

function dispatchKey(type, code) {
  window.dispatchEvent(new KeyboardEvent(type, { code }));
}

function dispatchPointer(elementId, type) {
  document.getElementById(elementId).dispatchEvent(new PointerEvent(type));
}

function dispatchCanvasPointer(canvas, type, options = {}) {
  canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, button: 0, ...options }));
}

describe('createInputController keyboard bindings', () => {
  it('sets and clears steerLeft on ArrowLeft/KeyA keydown/keyup', () => {
    const state = createInputController();

    dispatchKey('keydown', 'ArrowLeft');
    expect(state.steerLeft).toBe(true);
    dispatchKey('keyup', 'ArrowLeft');
    expect(state.steerLeft).toBe(false);

    dispatchKey('keydown', 'KeyA');
    expect(state.steerLeft).toBe(true);
    dispatchKey('keyup', 'KeyA');
    expect(state.steerLeft).toBe(false);
  });

  it('sets and clears steerRight on ArrowRight/KeyD keydown/keyup', () => {
    const state = createInputController();

    dispatchKey('keydown', 'ArrowRight');
    expect(state.steerRight).toBe(true);
    dispatchKey('keyup', 'ArrowRight');
    expect(state.steerRight).toBe(false);

    dispatchKey('keydown', 'KeyD');
    expect(state.steerRight).toBe(true);
    dispatchKey('keyup', 'KeyD');
    expect(state.steerRight).toBe(false);
  });

  it('sets jump true on Space keydown, and keyup does not reset it', () => {
    const state = createInputController();

    dispatchKey('keydown', 'Space');
    expect(state.jump).toBe(true);
    dispatchKey('keyup', 'Space');
    // Only applyInput()'s consumption resets jump — a keyup is a no-op for it.
    expect(state.jump).toBe(true);
  });

  it('sets and clears brake on ArrowDown/KeyS keydown/keyup', () => {
    const state = createInputController();

    dispatchKey('keydown', 'ArrowDown');
    expect(state.brake).toBe(true);
    dispatchKey('keyup', 'ArrowDown');
    expect(state.brake).toBe(false);

    dispatchKey('keydown', 'KeyS');
    expect(state.brake).toBe(true);
    dispatchKey('keyup', 'KeyS');
    expect(state.brake).toBe(false);
  });

  it('sets and clears boost on KeyW/ArrowUp keydown/keyup', () => {
    const state = createInputController();

    dispatchKey('keydown', 'KeyW');
    expect(state.boost).toBe(true);
    dispatchKey('keyup', 'KeyW');
    expect(state.boost).toBe(false);

    dispatchKey('keydown', 'ArrowUp');
    expect(state.boost).toBe(true);
    dispatchKey('keyup', 'ArrowUp');
    expect(state.boost).toBe(false);
  });

  it('sets reset true on KeyR keydown, and keyup does not reset it (issue #66)', () => {
    const state = createInputController();

    dispatchKey('keydown', 'KeyR');
    expect(state.reset).toBe(true);
    dispatchKey('keyup', 'KeyR');
    // Same edge-triggered pattern as jump — only the consumer clears it.
    expect(state.reset).toBe(true);
  });
});

describe('createInputController pointer zone bindings', () => {
  it('sets and clears steerLeft/steerRight on pointerdown/pointerup', () => {
    const state = createInputController();

    dispatchPointer('steer-left', 'pointerdown');
    expect(state.steerLeft).toBe(true);
    dispatchPointer('steer-left', 'pointerup');
    expect(state.steerLeft).toBe(false);

    dispatchPointer('steer-right', 'pointerdown');
    expect(state.steerRight).toBe(true);
    dispatchPointer('steer-right', 'pointercancel');
    expect(state.steerRight).toBe(false);

    dispatchPointer('steer-left', 'pointerdown');
    dispatchPointer('steer-left', 'pointerleave');
    expect(state.steerLeft).toBe(false);
  });

  it('sets jump true on jump-btn pointerdown, and pointerup does not reset it', () => {
    const state = createInputController();

    dispatchPointer('jump-btn', 'pointerdown');
    expect(state.jump).toBe(true);
    dispatchPointer('jump-btn', 'pointerup');
    expect(state.jump).toBe(true);
  });

  it('sets and clears brake on brake-btn pointerdown/pointerup', () => {
    const state = createInputController();

    dispatchPointer('brake-btn', 'pointerdown');
    expect(state.brake).toBe(true);
    dispatchPointer('brake-btn', 'pointerup');
    expect(state.brake).toBe(false);
  });

  it('sets and clears boost on boost-btn pointerdown/pointerup', () => {
    const state = createInputController();

    dispatchPointer('boost-btn', 'pointerdown');
    expect(state.boost).toBe(true);
    dispatchPointer('boost-btn', 'pointerup');
    expect(state.boost).toBe(false);
  });

  it('sets reset true on reset-btn pointerdown, and pointerup does not reset it (issue #66)', () => {
    const state = createInputController();

    dispatchPointer('reset-btn', 'pointerdown');
    expect(state.reset).toBe(true);
    dispatchPointer('reset-btn', 'pointerup');
    expect(state.reset).toBe(true);
  });
});

describe('createInputController drag-to-look camera (issue #39)', () => {
  it('does not bind look-drag handling when no canvas is passed', () => {
    const state = createInputController();
    expect(state.lookYawOffset).toBe(0);
    expect(state.looking).toBe(false);
  });

  it('sets looking true on canvas pointerdown and accumulates lookYawOffset from drag deltas', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const state = createInputController(canvas);

    dispatchCanvasPointer(canvas, 'pointerdown', { clientX: 100 });
    expect(state.looking).toBe(true);
    expect(state.lookYawOffset).toBe(0);

    // Dragging left (clientX decreases) should increase the offset (see
    // LOOK_YAW_SENSITIVITY's sign in InputController.js).
    dispatchCanvasPointer(canvas, 'pointermove', { clientX: 50 });
    expect(state.lookYawOffset).toBeGreaterThan(0);

    dispatchCanvasPointer(canvas, 'pointerup', {});
    expect(state.looking).toBe(false);
  });

  it('clamps lookYawOffset to LOOK_YAW_MAX_OFFSET rather than allowing a full free spin', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const state = createInputController(canvas);

    dispatchCanvasPointer(canvas, 'pointerdown', { clientX: 0 });
    dispatchCanvasPointer(canvas, 'pointermove', { clientX: -100000 });

    expect(state.lookYawOffset).toBeCloseTo(Math.PI * 0.85);
  });

  it('ignores pointermove/pointerup from an unrelated pointerId', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const state = createInputController(canvas);

    dispatchCanvasPointer(canvas, 'pointerdown', { clientX: 0, pointerId: 1 });
    dispatchCanvasPointer(canvas, 'pointermove', { clientX: 100, pointerId: 2 });
    expect(state.lookYawOffset).toBe(0);

    dispatchCanvasPointer(canvas, 'pointerup', { pointerId: 2 });
    expect(state.looking).toBe(true);
  });

  it('ignores non-left-button pointerdown (e.g. right-click)', () => {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    const state = createInputController(canvas);

    dispatchCanvasPointer(canvas, 'pointerdown', { button: 2 });
    expect(state.looking).toBe(false);
  });
});
