import "@testing-library/jest-dom";

// Polyfill AbortSignal.timeout for jsdom < 21 (which lacks it).
// Production code (Node ≥ 17.3 / modern browsers) has native support.
if (typeof AbortSignal.timeout !== 'function') {
  (AbortSignal as any).timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
