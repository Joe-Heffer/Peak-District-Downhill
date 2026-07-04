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
