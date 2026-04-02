/**
 * Application logger
 *
 * Use this instead of raw console.* calls:
 *   - logger.log / logger.debug → only output in development
 *   - logger.warn → only output in development
 *   - logger.error → always output (for monitoring/alerting)
 *
 * In production, console.log/warn/debug are suppressed globally in main.tsx,
 * so using logger.error is the only guaranteed way to surface critical issues.
 */
const isDev = import.meta.env.DEV;

export const logger = {
  log:   (...args: unknown[]) => { if (isDev) console.log(...args); },
  debug: (...args: unknown[]) => { if (isDev) console.debug(...args); },
  warn:  (...args: unknown[]) => { if (isDev) console.warn(...args); },
  /** Always shown – use for real errors that need attention in production */
  error: (...args: unknown[]) => console.error(...args),
  /** Group (dev only) */
  group: (label: string) => { if (isDev) console.group(label); },
  groupEnd: () => { if (isDev) console.groupEnd(); },
};
