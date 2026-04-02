/**
 * 员工端 / 业务统一：数据库存储为北京时间（+08:00 语义），展示也用 Asia/Shanghai。
 */

const SHANGHAI = "Asia/Shanghai";

/**
 * 将后端返回的 DATETIME / ISO 字符串解析为绝对时刻的 Date。
 * 无时区后缀的 `YYYY-MM-DD HH:mm:ss` 视为已存储的北京时间（补 +08:00）。
 * 含多段空格的字符串不再用「只替换第一个空格」的方式处理（会破坏 RFC/Date.toString 格式）。
 */
export function parseBackendStoredDatetimeToDate(
  dateStr: string | Date | null | undefined,
): Date | null {
  if (dateStr == null || dateStr === "") return null;

  if (dateStr instanceof Date) {
    return Number.isNaN(dateStr.getTime()) ? null : dateStr;
  }

  const s = String(dateStr).trim();

  // 无时区的北京时间 DATETIME（MySQL 等）：整行匹配，避免误伤 "Fri Mar 27 ..." 等多空格串
  const naiveBeijing =
    /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?)$/;
  const naiveMatch = s.match(naiveBeijing);
  if (naiveMatch) {
    const iso = `${naiveMatch[1]}T${naiveMatch[2]}+08:00`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // ISO / 带 Z 或偏移 / 浏览器 Date.toString() 等
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 返回当前北京时间的 ISO 格式字符串 (YYYY-MM-DDTHH:mm:ss)，不含时区后缀。
 * 用于写入数据库 DATETIME 列，保证存储值为北京时间。
 */
export function getNowBeijingISO(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * 统一按「北京时间 Asia/Shanghai」格式化，不依赖浏览器本地时区。
 */
export function formatBeijingTime(dateStr: string | Date | null | undefined): string {
  const date = parseBackendStoredDatetimeToDate(dateStr);
  if (!date) {
    return typeof dateStr === "string" ? dateStr : "";
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SHANGHAI,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const y = get("year");
    const m = get("month");
    const d = get("day");
    const h = get("hour").padStart(2, "0");
    const min = get("minute").padStart(2, "0");
    const sec = get("second").padStart(2, "0");
    // 统一短格式：2026/3/27/20:42:00（月日不补零，与业务表一致）
    return `${y}/${m}/${d}/${h}:${min}:${sec}`;
  } catch {
    return typeof dateStr === "string" ? dateStr : "";
  }
}

/** 仅日期（员工端列表等） */
export function formatBeijingDate(dateStr: string | Date | null | undefined): string {
  const date = parseBackendStoredDatetimeToDate(dateStr);
  if (!date) return typeof dateStr === "string" ? dateStr : "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: SHANGHAI,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return typeof dateStr === "string" ? dateStr : "";
  }
}

/** 短月+日，如「1月5日」/「Jan 5」（北京时间，随 locale） */
export function formatBeijingMonthDayShort(
  dateStr: string | Date | null | undefined,
  locale: string,
): string {
  const date = parseBackendStoredDatetimeToDate(dateStr);
  if (!date) return typeof dateStr === "string" ? dateStr : "";
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: SHANGHAI,
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return typeof dateStr === "string" ? dateStr : "";
  }
}

/** 英文长日期，如 March 23, 2026（北京时间，用于海报等） */
export function formatBeijingDateLongEnglish(
  dateStr: string | Date | null | undefined,
): string {
  const date = parseBackendStoredDatetimeToDate(dateStr);
  if (!date) return typeof dateStr === "string" ? dateStr : "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: SHANGHAI,
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return typeof dateStr === "string" ? dateStr : "";
  }
}

/** 仅时分秒（北京时间，24h） */
export function formatBeijingTimeOnly(dateStr: string | Date | null | undefined): string {
  const date = parseBackendStoredDatetimeToDate(dateStr);
  if (!date) return "";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: SHANGHAI,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return "";
  }
}
