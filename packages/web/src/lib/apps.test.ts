import { describe, expect, it } from 'vitest';
import { APPS } from './apps';

// These entries get copy-pasted. Nothing else notices a duplicated host, but `returnAppFor` then
// shows the wrong app's name and colour on a real sign-in.

describe('the app registry', () => {
  it('gives every app its own name, production host and dev port', () => {
    const names = APPS.map((app) => app.name);
    const hosts = APPS.map((app) => new URL(app.url).hostname);
    const ports = APPS.map((app) => new URL(app.devUrl).port);
    expect(new Set(names).size, 'duplicate name').toBe(APPS.length);
    expect(new Set(hosts).size, 'duplicate production host').toBe(APPS.length);
    expect(new Set(ports).size, 'duplicate dev port').toBe(APPS.length);
  });

  it('points production at https under aidenjang.com and dev at localhost', () => {
    for (const app of APPS) {
      const production = new URL(app.url);
      const dev = new URL(app.devUrl);
      expect(production.protocol, app.name).toBe('https:');
      expect(production.hostname.endsWith('.aidenjang.com'), app.name).toBe(true);
      expect(dev.hostname, app.name).toBe('localhost');
    }
  });

  it('writes every accent as a six-digit hex', () => {
    // theme.ts throws on anything else, and that takes the whole login page down.
    for (const app of APPS) {
      expect(app.accent, app.name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keeps every name lower case', () => {
    for (const app of APPS) {
      expect(app.name, app.name).toBe(app.name.toLowerCase());
    }
  });

  it('keeps taglines short and lower-case, the way the launcher reads them', () => {
    // Only the opening letter: "draw it, an AI guesses" should keep its acronym.
    for (const app of APPS) {
      expect(app.tagline.length, app.name).toBeLessThanOrEqual(34);
      expect(app.tagline[0], app.name).toBe(app.tagline[0]?.toLowerCase());
      expect(app.tagline.endsWith('.'), app.name).toBe(false);
    }
  });
});
