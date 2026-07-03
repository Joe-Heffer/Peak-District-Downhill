// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDevTools, DEVTOOLS_VISIBLE_KEY, formatStats, parseCommandLine } from './DevTools.js';

let originalConsole;

beforeEach(() => {
  document.body.innerHTML = '<div id="devtools" hidden></div>';
  localStorage.clear();
  originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
});

afterEach(() => {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

function pressBackquote() {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
}

function typeCommand(line) {
  const input = document.getElementById('devtools-cmd-input');
  input.value = line;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

function stubGameState(overrides = {}) {
  return {
    bike: { respawn: vi.fn(), teleport: vi.fn() },
    world: {},
    scene: {},
    camera: {},
    terrain: { mesh: { material: { wireframe: false } }, getHeightAt: () => 0 },
    terrainData: { origin: { easting: 100, northing: 200 } },
    routeData: {},
    ...overrides,
  };
}

describe('parseCommandLine', () => {
  it('splits a command and its args, lowercasing the command name', () => {
    expect(parseCommandLine('Teleport 100 200')).toEqual({ name: 'teleport', args: ['100', '200'] });
  });

  it('returns null for empty/whitespace-only input', () => {
    expect(parseCommandLine('')).toBeNull();
    expect(parseCommandLine('   ')).toBeNull();
  });
});

describe('formatStats', () => {
  it('reports "Loading…" when no game state is attached yet', () => {
    expect(formatStats(60, null)).toBe('Loading…');
  });

  it('includes fps, position, speed, and grounded state once attached', () => {
    const gameState = {
      bike: {
        mesh: { position: { x: 1, y: 2, z: 3 } },
        body: { velocity: { x: 0, y: 0, z: 0 } },
        speed: 4,
        yaw: 0,
        isGrounded: () => true,
      },
      terrain: { getHeightAt: () => 1.5 },
      terrainData: { origin: { easting: 0, northing: 0 } },
    };

    const stats = formatStats(59.9, gameState);
    expect(stats).toContain('FPS: 59.9');
    expect(stats).toContain('Speed: 4.0 m/s');
    expect(stats).toContain('Grounded: yes');
  });
});

describe('createDevTools panel toggle', () => {
  it('starts hidden and toggles visibility + persistence on Backquote', () => {
    createDevTools();
    const panel = document.getElementById('devtools');
    expect(panel.hidden).toBe(true);

    pressBackquote();
    expect(panel.hidden).toBe(false);
    expect(localStorage.getItem(DEVTOOLS_VISIBLE_KEY)).toBe('true');

    pressBackquote();
    expect(panel.hidden).toBe(true);
    expect(localStorage.getItem(DEVTOOLS_VISIBLE_KEY)).toBe('false');
  });

  it('restores visibility from localStorage on creation', () => {
    localStorage.setItem(DEVTOOLS_VISIBLE_KEY, 'true');
    createDevTools();
    expect(document.getElementById('devtools').hidden).toBe(false);
  });

  it('no-ops gracefully when #devtools is missing from the DOM', () => {
    document.body.innerHTML = '';
    const devTools = createDevTools();
    expect(() => devTools.attachGameState(stubGameState())).not.toThrow();
    expect(() => devTools.update(0.016)).not.toThrow();
    expect(() => devTools.reportCrash('test', new Error('boom'))).not.toThrow();
  });
});

describe('createDevTools console wrapping', () => {
  it('still calls through to the original console method', () => {
    // Spy on the live console.log *before* creating DevTools, so the spy becomes
    // the "original" DevTools captures and calls through to internally.
    const logSpy = vi.spyOn(console, 'log');
    createDevTools();
    console.log('hello');
    expect(logSpy).toHaveBeenCalledWith('hello');
  });

  it('mirrors console output into the rendered log once the panel is visible', () => {
    createDevTools();
    pressBackquote();
    console.log('hello from console');
    const log = document.getElementById('devtools-log');
    expect(log.textContent).toContain('hello from console');
  });
});

describe('createDevTools admin commands', () => {
  it('warns instead of throwing when a command runs before attachGameState', () => {
    const warnSpy = vi.fn();
    console.warn = warnSpy;
    createDevTools();

    expect(() => typeCommand('respawn')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('still loading'));
  });

  it('respawn calls bike.respawn()', () => {
    const devTools = createDevTools();
    const gameState = stubGameState();
    devTools.attachGameState(gameState);

    typeCommand('respawn');
    expect(gameState.bike.respawn).toHaveBeenCalledOnce();
  });

  it('teleport converts easting/northing to world x/z and calls bike.teleport', () => {
    const devTools = createDevTools();
    const gameState = stubGameState();
    devTools.attachGameState(gameState);

    typeCommand('teleport 150 150');
    expect(gameState.bike.teleport).toHaveBeenCalledWith(50, 50);
  });

  it('teleport warns on non-numeric args without throwing or calling bike.teleport', () => {
    const warnSpy = vi.fn();
    console.warn = warnSpy;
    const devTools = createDevTools();
    const gameState = stubGameState();
    devTools.attachGameState(gameState);

    expect(() => typeCommand('teleport abc def')).not.toThrow();
    expect(gameState.bike.teleport).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: teleport'));
  });

  it('wireframe toggles the terrain material flag', () => {
    const devTools = createDevTools();
    const gameState = stubGameState();
    devTools.attachGameState(gameState);

    typeCommand('wireframe');
    expect(gameState.terrain.mesh.material.wireframe).toBe(true);
    typeCommand('wireframe');
    expect(gameState.terrain.mesh.material.wireframe).toBe(false);
  });

  it('an unknown command warns without throwing', () => {
    const warnSpy = vi.fn();
    console.warn = warnSpy;
    createDevTools();

    expect(() => typeCommand('bogus')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown command'));
  });

  it('a handler that throws is caught and reported via console.error, not rethrown', () => {
    const errorSpy = vi.fn();
    console.error = errorSpy;
    const devTools = createDevTools();
    const gameState = stubGameState({
      bike: {
        respawn: () => {
          throw new Error('boom');
        },
        teleport: vi.fn(),
      },
    });
    devTools.attachGameState(gameState);

    expect(() => typeCommand('respawn')).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Command "respawn" failed'), expect.any(Error));
  });
});

describe('createDevTools crash reporting', () => {
  it('reportCrash logs via console.error and force-reveals the panel when fatal', () => {
    const errorSpy = vi.fn();
    console.error = errorSpy;
    const devTools = createDevTools();

    devTools.reportCrash('test', new Error('boom'), { fatal: true });

    expect(errorSpy).toHaveBeenCalled();
    expect(document.getElementById('devtools').hidden).toBe(false);
    expect(localStorage.getItem(DEVTOOLS_VISIBLE_KEY)).toBe('true');
  });

  it('a window "error" event is reported as a fatal crash', () => {
    const errorSpy = vi.fn();
    console.error = errorSpy;
    createDevTools();

    const event = new Event('error');
    event.error = new Error('boom2');
    event.message = 'boom2';
    window.dispatchEvent(event);

    expect(errorSpy).toHaveBeenCalled();
    expect(document.getElementById('devtools').hidden).toBe(false);
  });

  it('an unhandledrejection event is reported as a fatal crash', () => {
    const errorSpy = vi.fn();
    console.error = errorSpy;
    createDevTools();

    const event = new Event('unhandledrejection');
    event.reason = new Error('boom3');
    window.dispatchEvent(event);

    expect(errorSpy).toHaveBeenCalled();
    expect(document.getElementById('devtools').hidden).toBe(false);
  });

  it('the "crash" command triggers a non-fatal report that does not force the panel open', () => {
    const errorSpy = vi.fn();
    console.error = errorSpy;
    const devTools = createDevTools();
    devTools.attachGameState(stubGameState());

    typeCommand('crash');

    expect(errorSpy).toHaveBeenCalled();
    expect(document.getElementById('devtools').hidden).toBe(true);
  });
});
