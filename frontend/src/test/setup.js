// Vitest global setup: jest-dom matchers + a few jsdom polyfills the app needs.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Auto-cleanup the DOM after every test so renders don't leak across tests.
// RTL registers this automatically when its globals are on, but under vitest we
// wire it explicitly to be safe.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement matchMedia; some components may touch it.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom doesn't implement IntersectionObserver / ResizeObserver.
window.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom doesn't implement scrollTo on elements (Chat scroller uses it).
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}
if (!window.scrollTo) {
  window.scrollTo = () => {};
}

// pointermove / pointerdown are missing in jsdom's event map in some versions.
// No-op: tests that need them spy on handlers directly.
