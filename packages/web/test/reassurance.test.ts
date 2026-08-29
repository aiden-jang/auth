import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_REASSURANCE, reassurance } from '../src/lib/reassurance';
import { partOfDay, welcome, welcomeLine } from '../src/lib/welcome';
import type { RecentAccount } from '../src/lib/recentAccount';

/*
 * Two kinds of rot: security copy drifting into "bank-grade encryption", and the welcome line naming
 * an account on a screen nobody has authenticated on.
 */

describe('reassurance copy', () => {
  it('has a line for every waiting moment', () => {
    expect(ALL_REASSURANCE.length).toBeGreaterThan(5);
    for (const [key, line] of ALL_REASSURANCE) {
      expect(reassurance(key)).toBe(line);
      expect(line.length).toBeGreaterThan(20);
      expect(line.trim()).toMatch(/\.$/);
    }
  });

  it('renders every line somewhere in the app', () => {
    const src = fileURLToPath(new URL('../src', import.meta.url));
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.tsx?$/.test(name) && !name.includes('.test.') ? [full] : [];
      });
    const code = walk(src)
      .filter((file) => !file.endsWith(join('lib', 'reassurance.ts')))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    for (const [key] of ALL_REASSURANCE) {
      expect(code, `reassurance('${key}') is never rendered`).toContain(`reassurance('${key}')`);
    }
  });

  it('avoids the vocabulary that makes security copy meaningless', () => {
    // All true of any product, which is why none belongs here.
    const empty = [
      /bank[- ]grade/i, /military[- ]grade/i, /industry[- ]standard/i, /state of the art/i,
      /we take .* seriously/i, /rest assured/i, /peace of mind/i, /your safety is/i,
      /world[- ]class/i, /cutting[- ]edge/i, /best[- ]in[- ]class/i, /enterprise[- ]grade/i,
      /fully secure/i, /completely safe/i, /100% secure/i, /unhackable/i,
    ];
    for (const [key, line] of ALL_REASSURANCE) {
      for (const pattern of empty) {
        expect(line, `${key} uses empty security language`).not.toMatch(pattern);
      }
    }
  });

  it('never overpromises', () => {
    // "Never" about our own storage is checkable and fine; "always safe" is a promise nobody can keep.
    for (const [, line] of ALL_REASSURANCE) {
      expect(line).not.toMatch(/\balways safe\b|\bcannot be hacked\b|\bimpossible\b/i);
    }
  });

  it('says something specific, not just that something is happening', () => {
    // A line that only says "Loading..." with extra words is the spinner again.
    for (const [key, line] of ALL_REASSURANCE) {
      expect(line.split(/\s+/).length, `${key} is too short to say anything`).toBeGreaterThan(5);
    }
  });
});

describe('the welcome line', () => {
  const account = (over: Partial<RecentAccount> = {}): RecentAccount => ({
    email: 'aidenwsj@gmail.com',
    lastUsedAt: '2026-08-01T10:00:00.000Z',
    ...over,
  });

  it('greets by the time of day', () => {
    expect(partOfDay(new Date(2026, 7, 12, 8))).toBe('morning');
    expect(partOfDay(new Date(2026, 7, 12, 14))).toBe('afternoon');
    expect(partOfDay(new Date(2026, 7, 12, 20))).toBe('evening');
    expect(partOfDay(new Date(2026, 7, 12, 3))).toBe('night');
  });

  it('does not say good night to somebody arriving at 3am', () => {
    // "Good night" is a farewell. Somebody signing in then is starting something.
    expect(welcomeLine([], new Date(2026, 7, 12, 3))).not.toMatch(/good night/i);
  });

  it('claims no history on a first visit', () => {
    // Inventing familiarity is worse than not having any.
    expect(welcome([], new Date(2026, 7, 12, 9)).note).toBeNull();
    expect(welcomeLine([], new Date(2026, 7, 12, 9))).toBe('Good morning.');
  });

  it('mentions the device once it has been here', () => {
    const line = welcomeLine([account()], new Date(2026, 7, 12, 20));
    expect(line).toMatch(/^Good evening\./);
    expect(line).toMatch(/device has been here/i);
    // Sentence case throughout: a lowercase clause after a full stop reads as a typo, not a voice.
    expect(line).toBe('Good evening. This device has been here before.');
  });

  it('never names or hints at an account', () => {
    const accounts = [account(), account({ email: 'someone.else@work.example' })];
    for (const at of [3, 9, 14, 20]) {
      const line = welcomeLine(accounts, new Date(2026, 7, 12, at));
      expect(line).not.toMatch(/aidenwsj|someone\.else|gmail|work\.example|@/);
      // Not even a masked form, which the switcher below is allowed to show and this is not.
      expect(line).not.toMatch(/•/);
    }
  });

  it('reads the same however many accounts are remembered', () => {
    // Must not leak how many people use this machine beyond one/many.
    const many = [account(), account({ email: 'b@b.test' }), account({ email: 'c@c.test' })];
    expect(welcomeLine(many, new Date(2026, 7, 12, 9))).not.toMatch(/\d/);
  });
});
