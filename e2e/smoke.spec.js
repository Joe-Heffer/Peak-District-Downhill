import { expect, test } from '@playwright/test';

// main.js now gates init() behind the course-select overlay — click the (only) course's
// list entry to dismiss it before any test interacts with something init() sets up.
async function selectFirstCourse(page) {
  await page.locator('#course-select-list button').first().click();
}

test('game loads without errors, renders a canvas, and shows the correct credits', async ({
  page,
  request,
  baseURL,
}) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // The browser's own default favicon.ico request 404s (index.html declares none) and
  // Chromium logs that as a console error — harmless noise, unrelated to the app itself.
  // Short-circuiting it here keeps the no-console-errors assertion meaningful.
  await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));

  // A leading slash would resolve against the server root, discarding the GitHub Pages
  // subpath baked into baseURL under CI — use a relative path so it stays under baseURL.
  await page.goto('./');
  await selectFirstCourse(page);

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);

  await expect(page.locator('#minimap')).toBeVisible();
  await expect(page.locator('#stamina-bar-fill')).toHaveCSS('width', '140px'); // full stamina at spawn

  // The credits text depends on whether any of the seven baked datasets are still the
  // synthetic placeholder — fetch them directly and derive the expected branch instead of
  // hardcoding one, so this stays correct whichever data is currently committed.
  const [terrainData, routeData, landcoverData, pathsData, treesData, buildingsData, waterData] = await Promise.all([
    request.get(new URL('data/terrain/cutgate.json', baseURL).href).then((r) => r.json()),
    request.get(new URL('data/routes/cutgate.json', baseURL).href).then((r) => r.json()),
    request
      .get(new URL('data/terrain/cutgate-landcover.json', baseURL).href)
      .then((r) => r.json()),
    request.get(new URL('data/routes/cutgate-paths.json', baseURL).href).then((r) => r.json()),
    request.get(new URL('data/terrain/cutgate-trees.json', baseURL).href).then((r) => r.json()),
    request.get(new URL('data/terrain/cutgate-buildings.json', baseURL).href).then((r) => r.json()),
    request.get(new URL('data/terrain/cutgate-water.json', baseURL).href).then((r) => r.json()),
  ]);
  const isPlaceholder = Boolean(
    terrainData.placeholder ||
      routeData.placeholder ||
      landcoverData.placeholder ||
      pathsData.placeholder ||
      treesData.placeholder ||
      buildingsData.placeholder ||
      waterData.placeholder,
  );

  const credits = page.locator('#credits');
  if (isPlaceholder) {
    await expect(credits).toContainText('Placeholder terrain/route/landcover/paths/trees/buildings/water data');
  } else {
    await expect(credits).toContainText('Environment Agency LIDAR');
  }

  // Let the render/physics tick loop run for a few frames — a crash in the game loop
  // (e.g. bad grounding/height-lookup math) would otherwise only surface as a console
  // error a beat after load, not on the very first paint.
  await page.waitForFunction(() => {
    const el = document.querySelector('#app canvas');
    return el && el.width > 0 && el.height > 0;
  });
  await page.waitForTimeout(500);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('mute button toggles aria-pressed', async ({ page }) => {
  // A leading slash would resolve against the server root, discarding the GitHub Pages
  // subpath baked into baseURL under CI — use a relative path so it stays under baseURL.
  await page.goto('./');
  await selectFirstCourse(page);

  const muteButton = page.locator('#mute-btn');
  await expect(muteButton).toHaveAttribute('aria-pressed', 'false');

  // The button element is present from index.html immediately, but its click listener is
  // only wired up once init()'s audio buffers finish decoding — retry the click rather
  // than guessing a fixed delay.
  await expect(async () => {
    await muteButton.click();
    await expect(muteButton).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
  }).toPass({ timeout: 10_000 });

  await muteButton.click();
  await expect(muteButton).toHaveAttribute('aria-pressed', 'false');
});

test('tilt button reflects tilt-steering support in this browser', async ({ page }) => {
  // A leading slash would resolve against the server root, discarding the GitHub Pages
  // subpath baked into baseURL under CI — use a relative path so it stays under baseURL.
  await page.goto('./');
  await selectFirstCourse(page);

  const supported = await page.evaluate(() => typeof window.DeviceOrientationEvent !== 'undefined');
  const tiltButton = page.locator('#tilt-btn');

  if (!supported) {
    await expect(tiltButton).toBeHidden();
    return;
  }

  await expect(tiltButton).toBeVisible();
  await expect(tiltButton).toHaveAttribute('aria-pressed', 'false');

  // Same retry pattern as the mute button above — the click listener attaches post-init.
  await expect(async () => {
    await tiltButton.click();
    await expect(tiltButton).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
  }).toPass({ timeout: 10_000 });
});

test('feedback button opens a prefilled GitHub issue in a new tab', async ({ page, context }) => {
  // A leading slash would resolve against the server root, discarding the GitHub Pages
  // subpath baked into baseURL under CI — use a relative path so it stays under baseURL.
  await page.goto('./');
  await selectFirstCourse(page);

  // Intercept and abort the outbound request instead of letting it hit the real
  // github.com — the button's job is producing the right URL, not GitHub loading it,
  // and a live external request would make CI depend on GitHub's availability.
  let requestedUrl = null;
  let resolveRequestSeen;
  const requestSeen = new Promise((resolve) => {
    resolveRequestSeen = resolve;
  });
  await context.route('https://github.com/**', (route) => {
    requestedUrl = route.request().url();
    resolveRequestSeen();
    route.abort();
  });

  const feedbackButton = page.locator('#feedback-btn');
  await expect(feedbackButton).toBeVisible();

  // The button element is present from index.html immediately, but its click listener is
  // only wired up once init()'s audio buffers finish decoding — retry the click rather
  // than guessing a fixed delay (same reasoning as the mute button test above).
  await expect(async () => {
    await feedbackButton.click();
    await Promise.race([
      requestSeen,
      new Promise((_, reject) => setTimeout(() => reject(new Error('no request yet')), 500)),
    ]);
  }).toPass({ timeout: 10_000 });

  const popupUrl = new URL(requestedUrl);
  expect(popupUrl.origin + popupUrl.pathname).toBe(
    'https://github.com/joe-heffer/Peak-District-Downhill/issues/new',
  );
  expect(popupUrl.searchParams.get('title')).toBe('Player feedback');
  expect(popupUrl.searchParams.get('labels')).toBe('player-feedback');
  expect(popupUrl.searchParams.get('body')).toContain('What happened?');
});

test('devtools panel toggles with the backtick key', async ({ page }) => {
  // A leading slash would resolve against the server root, discarding the GitHub Pages
  // subpath baked into baseURL under CI — use a relative path so it stays under baseURL.
  await page.goto('./');

  // No selectFirstCourse() call needed here: createDevTools() wires the backtick-key
  // listener before init() awaits the course-select overlay, so it works regardless of
  // whether a course has been picked yet.
  const panel = page.locator('#devtools');
  await expect(panel).toBeHidden();

  await page.keyboard.press('Backquote');
  await expect(panel).toBeVisible();

  await page.keyboard.press('Backquote');
  await expect(panel).toBeHidden();
});
