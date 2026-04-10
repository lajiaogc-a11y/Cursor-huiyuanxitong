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
  const numProto = Number.prototype as Record<string, unknown>;
  numProto.toFixed = function (this: unknown, digits?: number): string {
    return _origToFixed.call(Number(this) || 0, digits);
  };

  const strProto = String.prototype as Record<string, unknown>;
  if (typeof strProto.toFixed !== "function") {
    strProto.toFixed = function (this: string, digits?: number): string {
      return (Number(this) || 0).toFixed(digits);
    };
  }
}

/** Safely format any value to a fixed-point string. */
export function safeFixed(value: unknown, digits = 2): string {
  return (Number(value) || 0).toFixed(digits);
}
