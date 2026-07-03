const ISSUE_URL = 'https://github.com/joe-heffer/Peak-District-Downhill/issues/new';
const ISSUE_TITLE = 'Player feedback';
const ISSUE_LABELS = 'player-feedback';

function buildIssueBody({ userAgent, platform, screenSize, pageUrl }) {
  return [
    '**What happened?**',
    '',
    '',
    '**What did you expect to happen?**',
    '',
    '',
    '---',
    `Browser: ${userAgent}`,
    `Platform: ${platform}`,
    `Screen: ${screenSize}`,
    `URL: ${pageUrl}`,
  ].join('\n');
}

// Builds params manually with encodeURIComponent (per issue #107) rather than
// URLSearchParams, which would encode spaces as "+" instead of "%20".
function buildQueryString(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

// Reads browser/OS context from the environment at call time (rather than importing
// `navigator`/`screen`/`location` directly) so it also runs under Vitest's default
// node test environment, and so tests can supply fixed values instead of jsdom's.
export function buildFeedbackIssueUrl({
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  platform = typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
  screenSize = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown',
  pageUrl = typeof location !== 'undefined' ? location.href : 'unknown',
} = {}) {
  const query = buildQueryString({
    title: ISSUE_TITLE,
    body: buildIssueBody({ userAgent, platform, screenSize, pageUrl }),
    labels: ISSUE_LABELS,
  });

  return `${ISSUE_URL}?${query}`;
}
