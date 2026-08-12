import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionMap } from './SessionMap';
import { project, type SessionLike } from '../lib/sessionMap';

/* No jsdom in this package, so these render to static markup. */

const session = (id: string, location: string | null, current = false): SessionLike => ({ id, location, current });

const render = (sessions: SessionLike[]): string => renderToStaticMarkup(<SessionMap sessions={sessions} />);

describe('rendering the map', () => {
  it('draws a dot at the projected position, not at a guess', () => {
    const html = render([session('a', 'Berlin, DE')]);
    const { x, y } = project(51.2, 10.5);
    expect(html).toContain(`cx="${x}"`);
    expect(html).toContain(`cy="${y}"`);
  });

  it('labels each country and its count', () => {
    const html = render([session('a', 'Brooklyn, US'), session('b', 'Austin, US'), session('c', 'Berlin, DE')]);
    expect(html).toContain('US');
    expect(html).toContain('×2');
    expect(html).toContain('DE');
  });

  it('does not label a count of one, which is noise', () => {
    expect(render([session('a', 'Berlin, DE')])).not.toContain('×1');
  });

  it('gives the picture a text equivalent', () => {
    const html = render([session('a', 'Brooklyn, US', true), session('b', 'Berlin, DE')]);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Approximate session locations. 2 sessions across 2 countries."');
  });

  it('marks this device with more than a colour', () => {
    // "The green one is you" is no answer for a colourblind reader, so the ring is not decoration.
    const withCurrent = render([session('a', 'Brooklyn, US', true)]);
    const without = render([session('a', 'Brooklyn, US')]);
    expect(withCurrent).toContain('session-dot-pulse');
    expect(without).not.toContain('session-dot-pulse');
  });

  it('says so plainly rather than drawing an empty grid', () => {
    // Otherwise an empty graticule, which reads as a broken component.
    const html = render([session('a', null)]);
    expect(html).not.toContain('<svg');
    expect(html).toContain('No location for this session.');
  });

  it('admits on screen to sessions it could not place', () => {
    const html = render([session('a', 'Brooklyn, US'), session('b', null)]);
    expect(html).toContain('1 session across 1 country, and 1 with no location.');
  });

  it('says what it collects, where somebody reading a security page will see it', () => {
    expect(render([session('a', 'Brooklyn, US')])).toContain('No precise location is collected.');
  });

  it('staggers the dots without letting a busy account crawl', () => {
    // Capped, or a busy account spends two seconds assembling itself.
    const many = Array.from({ length: 20 }, (_, i) => session(`s${i}`, `City, ${['US', 'DE', 'JP', 'GB', 'AU', 'BR', 'IN', 'CA', 'FR', 'ES'][i % 10]}`));
    const delays = [...render(many).matchAll(/animation-delay:(\d+)ms/g)].map((m) => Number(m[1]));
    expect(delays.length).toBeGreaterThan(1);
    expect(Math.max(...delays)).toBeLessThanOrEqual(560);
  });
});
