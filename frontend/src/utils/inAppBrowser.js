/**
 * Detect whether the current page is running inside an in-app browser
 * (Facebook, TikTok, Instagram, Messenger, LinkedIn, X/Twitter, …).
 *
 * These embedded webviews are rejected by Google's OAuth (the "access blocked /
 * secure browsers policy" error), so when we detect one we must ask the user to
 * open the app in a standalone browser (Chrome / Safari) instead.
 *
 * Returns a short label ("Facebook", "TikTok", …) or null for a normal browser.
 */
export function detectInAppBrowser(userAgent = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  if (!userAgent) return null;

  const ua = userAgent.toLowerCase();

  // iOS Safari inside an app reports as "Safari" but contains markers for the
  // host app (e.g. "FBAN", "Instagram", "Tiktok"). We check those explicitly.
  const rules = [
    { id: 'Facebook', needle: ['fban', 'fbav', 'fbbv'] },
    { id: 'Messenger', needle: ['messenger'] },
    { id: 'Instagram', needle: ['instagram'] },
    { id: 'TikTok', needle: ['tiktok', 'musical_ly'] },
    { id: 'X (Twitter)', needle: ['twitter'] },
    { id: 'LinkedIn', needle: ['linkedin'] },
    { id: 'Snapchat', needle: ['snapchat'] },
    { id: 'Telegram', needle: ['telegram'] },
    { id: 'Discord', needle: ['discord'] },
    { id: 'WhatsApp', needle: ['whatsapp'] },
    { id: 'WeChat', needle: ['micromessenger'] },
    { id: 'Reddit', needle: ['reddit'] },
    { id: 'Pinterest', needle: ['pinterest'] },
  ];

  for (const { id, needle } of rules) {
    if (needle.some((n) => ua.includes(n))) return id;
  }

  // Android Chrome custom tabs / generic webview with no known app marker.
  // The "; wv)" token is the definitive webview signal on Android — it appears
  // even when the UA also contains "Chrome/" (webviews share Chrome's engine).
  if (/; wv\)/.test(ua)) return 'In-App Browser';

  // iOS: Safari UA inside an app often has no app marker, but a webview on iOS
  // lacks the "Safari/" token that standalone Safari includes.
  const isIOS = /iphone|ipad|ipod/.test(ua);
  if (isIOS && /applewebkit/.test(ua) && !/safari\//.test(ua) && !/crios/.test(ua)) {
    return 'In-App Browser';
  }

  return null;
}

/**
 * Try to open the current URL in the system's default (standalone) browser.
 *
 * - Android Chrome: appending `googlechrome://` or using an intent works in some
 *   webviews; the most reliable cross-app trick is to navigate to a page that
 *   triggers the "open in browser" intent.
 * - iOS Safari: there's no JS API to force Safari open; we rely on the user.
 *
 * Returns true if we attempted an automatic open, false if the user must do it
 * manually (the caller then shows the copy-link fallback).
 */
export function tryOpenInExternalBrowser() {
  const ua = navigator.userAgent || '';
  const currentUrl = window.location.href;

  // Android: try the Chrome intent scheme, which pops the user out into Chrome.
  if (/android/.test(ua.toLowerCase())) {
    // Craft a Chrome intent that opens the same URL. If Chrome isn't installed
    // the browser ignores it and we fall back to the manual instructions.
    const intent =
      `intent://${currentUrl.replace(/^https?:\/\//, '')}` +
      `#Intent;scheme=https;package=com.android.chrome;end`;
    // Some webviews also honor this marker to open externally.
    window.location.href = intent;
    return true;
  }

  // iOS: no reliable JS trigger; the user must tap "Open in Safari" in the share
  // sheet, or we just tell them. Return false so the UI shows the copy fallback.
  return false;
}
