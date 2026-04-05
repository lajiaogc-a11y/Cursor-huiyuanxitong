/**
 * Safe number formatting module.
 *
 * MySQL DECIMAL columns often arrive as strings; normalize before formatting.
 * Instead of scattering `Number(x).toFixed(d)` across 50+ call sites we
 * patch the prototypes once at boot so existing `.toFixed()` calls never crash.
 *
 * New code should prefer the explicit `safeFixed()` helper below.
 */

const _origToFixed = Number.prototype.toFixed;

export function installSafeToFixed(): void {
  (Number.prototype as any).toFixed = function (this: any, digits?: number) {
    return _origToFixed.call(Number(this) || 0, digits);
  };

  if (!(String.prototype as any).toFixed) {
    (String.prototype as any).toFixed = function (this: string, digits?: number) {
      return (Number(this) || 0).toFixed(digits);
    };
  }
}

/** Safely format any value to a fixed-point string. */
export function safeFixed(value: unknown, digits = 2): string {
  return (Number(value) || 0).toFixed(digits);
}
