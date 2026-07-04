import { defineConfig, devices } from '@playwright/test';

// Mirrors vite.config.js's own `base` logic exactly — under GitHub Actions the built app
// (and every runtime fetch() it makes) lives under the /Peak-District-Downhill/ GitHub
// Pages subpath, not at the server root. Tests must resolve URLs against that same prefix
// or they'll 404 against paths the real app never uses.
const BASE_PATH = process.env.GITHUB_ACTIONS ? '/Peak-District-Downhill/' : '/';
const baseURL = `http://localhost:4173${BASE_PATH}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Each test boots a full WebGL scene + physics world + audio decode/synth — on the
  // 2-vCPU GitHub Actions runner, 2 parallel workers contend for CPU badly enough that
  // async init() (particularly audio setup) can miss a test's click-listener retry
  // window, e.g. the mute/feedback button tests. Serialize in CI to remove that
  // contention; keep default (CPU-count-based) parallelism locally where it's fine.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
