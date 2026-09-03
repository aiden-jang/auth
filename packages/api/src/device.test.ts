import { describe, expect, it } from 'vitest';
import { deviceLabel } from './device.js';

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  operaMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  chromeAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
};

/*
 * This label is what somebody scans down the active-sessions list to spot a device that is not
 * theirs, so a wrong one is worse than none: it makes a stranger's session look like their own
 * laptop. Every ambiguity below is a real substring collision, not a hypothetical.
 */
describe('naming a device from its user agent', () => {
  it.each([
    ['Chrome on macOS', UA.chromeMac],
    ['Safari on iOS', UA.safariIphone],
    ['Firefox on Linux', UA.firefoxLinux],
  ])('reads %s', (label, ua) => {
    expect(deviceLabel(ua)).toBe(label);
  });

  // Edge and Opera both carry "Chrome/" in their UA, and are checked ahead of it.
  it('does not call Edge or Opera Chrome', () => {
    expect(deviceLabel(UA.edgeWindows)).toBe('Edge on Windows');
    expect(deviceLabel(UA.operaMac)).toBe('Opera on macOS');
  });

  // Chrome's UA ends in "Safari/537.36", so Safari has to be the last browser considered.
  it('does not call Chrome Safari', () => {
    expect(deviceLabel(UA.chromeMac)).toBe('Chrome on macOS');
  });

  // Android UAs open with "Linux", so Android has to be considered first.
  it('does not call Android Linux', () => {
    expect(deviceLabel(UA.chromeAndroid)).toBe('Chrome on Android');
  });

  // An iPhone reports "like Mac OS X", which would otherwise read as a desktop.
  it('does not call an iPhone a Mac', () => {
    expect(deviceLabel(UA.safariIphone)).toBe('Safari on iOS');
  });

  it('says nothing at all when there is no user agent', () => {
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel(undefined)).toBeNull();
    expect(deviceLabel('')).toBeNull();
  });

  it('falls back rather than inventing a name it cannot support', () => {
    expect(deviceLabel('curl/8.4.0')).toBe('Unknown device');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows');
  });
});
