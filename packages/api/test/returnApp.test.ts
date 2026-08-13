import { describe, expect, it } from 'vitest';
import { returnAppName } from '../src/returnApp.js';

/*
 * This string is printed in an email, so the interesting tests are the ones about what cannot get in.
 * A caller passes `returnTo` straight from a request body.
 */

describe('naming the app somebody was trying to reach', () => {
  it('names an app from its subdomain', () => {
    expect(returnAppName('https://owewell.aidenjang.com/trips/3')).toBe('owewell');
    expect(returnAppName('https://bloomnote.aidenjang.com')).toBe('bloomnote');
  });

  it('does not need a list of apps to keep up with', () => {
    // The point of deriving it: an app added to the hub reads correctly with no change here.
    expect(returnAppName('https://somethingnew.aidenjang.com')).toBe('somethingnew');
  });

  it('says nothing for the accounts page itself', () => {
    // Signing in at the accounts page is not signing in "to accounts".
    expect(returnAppName('https://accounts.aidenjang.com/login')).toBeNull();
    expect(returnAppName('https://www.aidenjang.com')).toBeNull();
  });

  it('says nothing rather than guessing', () => {
    expect(returnAppName(null)).toBeNull();
    expect(returnAppName(undefined)).toBeNull();
    expect(returnAppName('')).toBeNull();
    expect(returnAppName('/account')).toBeNull();
    expect(returnAppName('not a url')).toBeNull();
    expect(returnAppName('https://aidenjang.com')).toBeNull();
  });

  /*
   * The one that matters.
   *
   * A footer reading "someone used this address to sign in to your bank" is the sentence a phisher
   * would most like to put there, and `returnTo` is whatever the client posted.
   */
  it('refuses a host that is not ours, however much it looks like it', () => {
    for (const hostile of [
      'https://evil.com',
      'https://aidenjang.com.evil.com',
      'https://owewell.aidenjang.com.evil.com',
      'https://notaidenjang.com',
      'https://evil.com/?x=owewell.aidenjang.com',
    ]) {
      expect(returnAppName(hostile), hostile).toBeNull();
    }
  });

  it('refuses a deeper subdomain, which is not one of the apps', () => {
    expect(returnAppName('https://a.b.aidenjang.com')).toBeNull();
  });

  it('ignores the case the client happened to send', () => {
    expect(returnAppName('https://OweWell.AidenJang.com')).toBe('owewell');
  });
});
