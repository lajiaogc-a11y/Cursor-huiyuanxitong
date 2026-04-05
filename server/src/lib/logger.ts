/**
 * Centralized server logger — use instead of raw console.* calls.
 *
 * - logger.info / logger.debug → standard runtime messages
 * - logger.warn → non-fatal warnings
 * - logger.error → always output, for monitoring
 *
 * This is a thin wrapper that adds timestamps and structured prefixes.
 * Can be swapped to winston/pino later without changing call sites.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function ts(): string {
  return new Date().toISOString();
}

export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (shouldLog('debug')) console.debug(`${ts()} [DEBUG] [${tag}]`, ...args);
  },
  info: (tag: string, ...args: unknown[]) => {
    if (shouldLog('info')) console.log(`${ts()} [INFO] [${tag}]`, ...args);
  },
  warn: (tag: string, ...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(`${ts()} [WARN] [${tag}]`, ...args);
  },
  error: (tag: string, ...args: unknown[]) => {
    console.error(`${ts()} [ERROR] [${tag}]`, ...args);
  },
};

export default logger;
