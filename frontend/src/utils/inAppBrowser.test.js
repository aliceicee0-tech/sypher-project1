import { describe, it, expect } from 'vitest';
import { detectInAppBrowser } from './inAppBrowser.js';

// detectInAppBrowser takes an optional UA so we can test deterministically.
describe('detectInAppBrowser', () => {
  it('returns null for a normal desktop Chrome', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    expect(detectInAppBrowser(ua)).toBeNull();
  });

  it('returns null for a normal mobile Safari', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(detectInAppBrowser(ua)).toBeNull();
  });

  it('detects Facebook in-app browser', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/420.0.0;FBBV/531000000]';
    expect(detectInAppBrowser(ua)).toBe('Facebook');
  });

  it('detects TikTok in-app browser', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36 musical_ly_2023000000 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly';
    expect(detectInAppBrowser(ua)).toBe('TikTok');
  });

  it('detects Instagram in-app browser', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0';
    expect(detectInAppBrowser(ua)).toBe('Instagram');
  });

  it('detects Messenger', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Messenger';
    expect(detectInAppBrowser(ua)).toBe('Messenger');
  });

  it('detects a generic Android webview without a known app marker', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36; wv)';
    expect(detectInAppBrowser(ua)).toBe('In-App Browser');
  });

  it('returns null for an empty UA', () => {
    expect(detectInAppBrowser('')).toBeNull();
  });
});
