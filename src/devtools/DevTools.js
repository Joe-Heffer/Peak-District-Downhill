import { worldToGridRef } from '../terrain/gridReference.js';

// Persisted panel-visibility toggle, same pattern as main.js's MUSIC_MUTED_KEY.
export const DEVTOOLS_VISIBLE_KEY = 'devtoolsVisible';

const LOG_CAPACITY = 200;
const STATS_REDRAW_INTERVAL = 0.2; // s — same throttling spirit as main.js's LOCATION_UPDATE_INTERVAL
const FPS_SMOOTHING_ALPHA = 0.1;

const HELP_TEXT = [
  'Commands:',
  '  help                          list commands',
  '  respawn                       reset the bike to the route start',
  '  teleport <easting> <northing> move the bike to a BNG grid position',
  '  wireframe                     toggle terrain wireframe rendering',
  '  clear                         clear the log',
  '  crash                         trigger a test (non-fatal) crash report',
].join('\n');

// Parses a typed command line into { name, args }. Pure/exported for unit testing.
export function parseCommandLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const [name, ...args] = trimmed.split(/\s+/);
  return { name: name.toLowerCase(), args };
}

// Formats the live debug-info stats block. Pure/exported for unit testing.
export function formatStats(fps, gameState) {
  if (!gameState) return 'Loading…';

  const { bike, terrain, terrainData } = gameState;
  const { x, y, z } = bike.mesh.position;
  const { x: vx, y: vy, z: vz } = bike.body.velocity;
  const yawDegrees = ((bike.yaw * 180) / Math.PI).toFixed(0);
  const groundHeight = terrain.getHeightAt(x, z);

  let gridRef = 'n/a';
  try {
    gridRef = worldToGridRef(x, z, terrainData.origin);
  } catch {
    // Outside the GB national grid (e.g. after a wild teleport) — leave as 'n/a'.
  }

  return [
    `FPS: ${fps.toFixed(1)}`,
    `Pos: ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`,
    `Vel: ${vx.toFixed(1)}, ${vy.toFixed(1)}, ${vz.toFixed(1)}  Speed: ${bike.speed.toFixed(1)} m/s`,
    `Yaw: ${yawDegrees}°  Grounded: ${bike.isGrounded() ? 'yes' : 'no'}`,
    `Ground height: ${groundHeight.toFixed(1)} m`,
    `Grid ref: ${gridRef}`,
  ].join('\n');
}

function formatArgs(args) {
  return args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

export function createDevTools() {
  const panel = document.getElementById('devtools');
  if (!panel) {
    return {
      attachGameState() {},
      update() {},
      reportCrash() {},
    };
  }

  const bannerEl = document.createElement('div');
  bannerEl.id = 'devtools-banner';
  bannerEl.hidden = true;

  const statsEl = document.createElement('pre');
  statsEl.id = 'devtools-stats';
  statsEl.textContent = 'Loading…';

  const logListEl = document.createElement('ul');
  logListEl.id = 'devtools-log';

  const inputEl = document.createElement('input');
  inputEl.id = 'devtools-cmd-input';
  inputEl.type = 'text';
  inputEl.placeholder = 'command… (try "help")';
  inputEl.autocomplete = 'off';
  inputEl.spellcheck = false;

  panel.append(bannerEl, statsEl, logListEl, inputEl);

  let visible = localStorage.getItem(DEVTOOLS_VISIBLE_KEY) === 'true';
  panel.hidden = !visible;

  let gameState = null;
  let smoothedFps = 0;
  let timeSinceStatsRedraw = 0;
  const logEntries = [];

  function appendLogRow(level, text) {
    const li = document.createElement('li');
    li.className = `devtools-log-entry devtools-log-entry--${level}`;
    li.textContent = text;
    logListEl.appendChild(li);
    while (logListEl.children.length > LOG_CAPACITY) logListEl.removeChild(logListEl.firstChild);
    logListEl.scrollTop = logListEl.scrollHeight;
  }

  function renderFullLog() {
    logListEl.replaceChildren();
    for (const entry of logEntries) appendLogRow(entry.level, entry.text);
  }

  function pushLog(level, text) {
    logEntries.push({ level, text });
    if (logEntries.length > LOG_CAPACITY) logEntries.shift();
    if (!visible) return;
    appendLogRow(level, text);
  }

  function setVisible(next) {
    visible = next;
    localStorage.setItem(DEVTOOLS_VISIBLE_KEY, String(visible));
    panel.hidden = !visible;
    if (visible) {
      renderFullLog();
      timeSinceStatsRedraw = STATS_REDRAW_INTERVAL; // force an immediate stats redraw
    }
  }

  // Wrap console.log/info/warn/error: always call through to the original (so real
  // devtools and Playwright's page.on('console') still see everything unchanged),
  // and also mirror into the in-panel log list.
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  for (const level of ['log', 'info', 'warn', 'error']) {
    console[level] = (...args) => {
      originalConsole[level](...args);
      pushLog(level === 'log' ? 'info' : level, formatArgs(args));
    };
  }

  function reportCrash(source, error, { fatal = false } = {}) {
    const detail = error && error.stack ? error.stack : String(error);
    console.error(`[devtools] crash in ${source}:`, detail);
    if (fatal) {
      setVisible(true);
      bannerEl.hidden = false;
      bannerEl.textContent = `Game crashed (${source}) — see log below`;
    }
  }

  window.addEventListener('error', (event) => {
    reportCrash('window.error', event.error ?? new Error(event.message), { fatal: true });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    reportCrash('unhandledrejection', reason, { fatal: true });
  });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Backquote') return;
    setVisible(!visible);
  });

  const commands = {
    help: {
      requiresGameState: false,
      run() {
        console.log(HELP_TEXT);
      },
    },
    clear: {
      requiresGameState: false,
      run() {
        logEntries.length = 0;
        logListEl.replaceChildren();
      },
    },
    crash: {
      requiresGameState: false,
      run() {
        reportCrash('command:crash', new Error('Manual test crash (devtools "crash" command)'), {
          fatal: false,
        });
      },
    },
    respawn: {
      run() {
        gameState.bike.respawn();
        gameState.scoreTracker?.reset();
        console.log('Respawned at route start.');
      },
    },
    teleport: {
      run(args) {
        const easting = Number(args[0]);
        const northing = Number(args[1]);
        if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
          console.warn('Usage: teleport <easting> <northing>');
          return;
        }
        const { origin } = gameState.terrainData;
        const x = easting - origin.easting;
        const z = origin.northing - northing;
        gameState.bike.teleport(x, z);
        console.log(`Teleported to ${easting}, ${northing}.`);
      },
    },
    wireframe: {
      run() {
        const material = gameState.terrain.material;
        material.wireframe = !material.wireframe;
        console.log(`Wireframe ${material.wireframe ? 'on' : 'off'}.`);
      },
    },
  };

  function executeCommand(line) {
    const parsed = parseCommandLine(line);
    if (!parsed) return;
    console.log(`> ${line.trim()}`);

    const command = commands[parsed.name];
    if (!command) {
      console.warn(`Unknown command "${parsed.name}". Type "help" for a list.`);
      return;
    }
    if (command.requiresGameState !== false && !gameState) {
      console.warn(`"${parsed.name}" isn't ready yet — still loading.`);
      return;
    }
    try {
      command.run(parsed.args);
    } catch (err) {
      console.error(`Command "${parsed.name}" failed:`, err);
    }
  }

  inputEl.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.code === 'Escape') {
      inputEl.blur();
      return;
    }
    if (event.key !== 'Enter') return;
    executeCommand(inputEl.value);
    inputEl.value = '';
  });
  inputEl.addEventListener('keyup', (event) => event.stopPropagation());

  function attachGameState(state) {
    gameState = state;
  }

  function update(dt) {
    const instantFps = dt > 0 ? 1 / dt : 0;
    smoothedFps = smoothedFps === 0 ? instantFps : smoothedFps + (instantFps - smoothedFps) * FPS_SMOOTHING_ALPHA;

    if (!visible) return;
    timeSinceStatsRedraw += dt;
    if (timeSinceStatsRedraw < STATS_REDRAW_INTERVAL) return;
    timeSinceStatsRedraw = 0;
    statsEl.textContent = formatStats(smoothedFps, gameState);
  }

  return { attachGameState, update, reportCrash };
}
