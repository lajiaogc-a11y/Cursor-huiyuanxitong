/**
 * 服务端统一按 Asia/Shanghai 日历处理日期，与 MySQL 会话/连接时区 +08:00 对齐。
 * 避免使用 Date.toISOString().slice(0, 10)（UTC 日历日）导致与北京时间差一天或展示偏差。
 */

export const SHANGHAI_TZ = 'Asia/Shanghai';

/** 当前「上海」日历日 YYYY-MM-DD */
export function getShanghaiDateString(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 上海时区当前「整点档」键，用于防重复跑小时任务，如 2026-04-01-14 */
export function getShanghaiHourKey(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  return `${get('year')}-${get('month')}-${get('day')}-${hour}`;
}

/** 距离下一上海整点的毫秒数（用于整点对齐定时任务） */
export function msUntilNextShanghaiHourBoundary(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TZ,
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(now));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '0';
  const minute = parseInt(get('minute'), 10);
  const second = parseInt(get('second'), 10);
  const frac = now % 1000;
  const msIntoHour = (minute * 60 + second) * 1000 + frac;
  const left = 3600_000 - msIntoHour;
  return left <= 0 ? 1000 : left;
}

/**
 * 近似：从参考时刻往回滚 N 个 24 小时后再取上海日历日（报表趋势用，中国无 DST 一般足够）。
 */
export function getShanghaiDateMinusDays(days: number, from = new Date()): string {
  const ref = new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
  return getShanghaiDateString(ref);
}

/**
 * Convert JS Date / ISO 8601 string to MySQL DATETIME compatible format,
 * aligned to the MySQL session timezone (Asia/Shanghai = +08:00).
 *
 * ISO inputs (with 'T' separator and optional 'Z'/offset) are parsed and
 * re-formatted in SHANGHAI_TZ so that WHERE comparisons match DATETIME values
 * stored by NOW() under the same session timezone.
 *
 * Non-ISO strings (e.g. '2026-03-23 11:53:51') are passed through as-is,
 * assuming they are already in the correct timezone.
 */
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

function formatDateAsShanghai(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? '';
  let hour = get('hour');
  if (hour === '24') hour = '00';
  const ms = d.getMilliseconds();
  const msStr = ms > 0 ? `.${String(ms).padStart(3, '0')}` : '';
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}${msStr}`;
}

export function toMySqlDatetime(value: string | Date): string {
  if (value instanceof Date) {
    return formatDateAsShanghai(value);
  }
  if (!ISO_RE.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return value.replace('T', ' ').replace(/Z$/, '').replace(/[+-]\d{2}:\d{2}$/, '');
  }
  return formatDateAsShanghai(d);
}

/** Shorthand: current timestamp in MySQL format (Asia/Shanghai) */
export function mysqlNow(): string {
  return toMySqlDatetime(new Date());
}
