import { describe, expect, it } from 'vitest';
import { buildFeedbackIssueUrl } from './FeedbackUrl.js';

describe('buildFeedbackIssueUrl', () => {
  it('points at the repo issues/new endpoint', () => {
    const url = buildFeedbackIssueUrl();
    expect(url.startsWith('https://github.com/joe-heffer/Peak-District-Downhill/issues/new?')).toBe(true);
  });

  it('prefills title, body, and the player-feedback label', () => {
    const url = buildFeedbackIssueUrl({
      userAgent: 'TestAgent/1.0',
      platform: 'TestOS',
      screenSize: '800x600',
      pageUrl: 'https://example.com/game',
    });
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.get('title')).toBe('Player feedback');
    expect(params.get('labels')).toBe('player-feedback');
    expect(params.get('body')).toContain('What happened?');
    expect(params.get('body')).toContain('What did you expect to happen?');
    expect(params.get('body')).toContain('TestAgent/1.0');
    expect(params.get('body')).toContain('TestOS');
    expect(params.get('body')).toContain('800x600');
    expect(params.get('body')).toContain('https://example.com/game');
  });

  it('encodes reserved characters so the URL is well-formed', () => {
    const url = buildFeedbackIssueUrl({
      userAgent: 'Weird/Agent (with & and = chars)',
      platform: 'TestOS',
      screenSize: '800x600',
      pageUrl: 'https://example.com/game?query=1',
    });

    expect(url).not.toContain(' ');
    expect(() => new URL(url)).not.toThrow();
  });

  it('falls back to "unknown" fields when run outside a browser environment', () => {
    const url = buildFeedbackIssueUrl();
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('body')).toContain('unknown');
  });
});
