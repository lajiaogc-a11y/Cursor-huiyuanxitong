// 统一的日期筛选工具 - 基于北京时间 (Asia/Shanghai +08:00)

import { formatBeijingDate } from "@/lib/beijingTime";

const SHANGHAI = "Asia/Shanghai";
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export type TimeRangeType = "全部" | "今日" | "昨日" | "近7天" | "近30天" | "本月" | "上月" | "自定义";

export const TIME_RANGES: TimeRangeType[] = ["全部", "今日", "昨日", "近7天", "近30天", "本月", "上月", "自定义"];

/** 用于「全部」的显式宽日期范围，避免无日期筛选时的边界问题（如「上月」数据多于「全部」） */
export const ALL_TIME_DATE_RANGE: { start: Date; end: Date } = (() => {
  const start = new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 0) - BEIJING_OFFSET_MS);
  const end = new Date(Date.UTC(2099, 11, 31, 23, 59, 59, 999) - BEIJING_OFFSET_MS);
  return { start, end };
})();

/** 仪表盘「全部」实际请求范围：近 2 年，避免 2000-至今 导致 RPC 超时（约 9000 天数据） */
export function getAllTimeRequestRange(): { start: Date; end: Date } {
  const end = new Date();
  const bj = getBeijingComponents();
  const start = createBeijingDayStart(bj.year - 2, bj.month, bj.day);
  return { start, end };
}

/**
 * 获取当前北京时间的日历分量
 */
function getBeijingComponents(): { year: number; month: number; day: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parseInt(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/**
 * 创建北京时间某天 00:00:00.000 对应的 UTC Date
 */
function createBeijingDayStart(year: number, month: number, date: number): Date {
  return new Date(Date.UTC(year, month, date, 0, 0, 0, 0) - BEIJING_OFFSET_MS);
}

/**
 * 创建北京时间某天 23:59:59.999 对应的 UTC Date
 */
function createBeijingDayEnd(year: number, month: number, date: number): Date {
  return new Date(Date.UTC(year, month, date, 23, 59, 59, 999) - BEIJING_OFFSET_MS);
}

/**
 * 根据时间范围类型获取具体的日期范围（基于本地时区）
 * 所有日期筛选必须包含"今天"的数据
 */
export function getTimeRangeDates(range: TimeRangeType, customStart?: Date, customEnd?: Date): DateRange {
  const bj = getBeijingComponents();
  const todayStart = createBeijingDayStart(bj.year, bj.month, bj.day);
  const todayEnd = createBeijingDayEnd(bj.year, bj.month, bj.day);
  
  switch (range) {
    case "全部":
      return { start: null, end: null };
    case "今日":
      return { start: todayStart, end: todayEnd };
    case "昨日": {
      const yd = new Date(todayStart.getTime() - 86400000);
      const ydBj = getBeijingPartsFromDate(yd);
      return {
        start: createBeijingDayStart(ydBj.year, ydBj.month, ydBj.day),
        end: createBeijingDayEnd(ydBj.year, ydBj.month, ydBj.day),
      };
    }
    case "近7天": {
      const sd = new Date(todayStart.getTime() - 6 * 86400000);
      const sdBj = getBeijingPartsFromDate(sd);
      return { start: createBeijingDayStart(sdBj.year, sdBj.month, sdBj.day), end: todayEnd };
    }
    case "近30天": {
      const sd = new Date(todayStart.getTime() - 29 * 86400000);
      const sdBj = getBeijingPartsFromDate(sd);
      return { start: createBeijingDayStart(sdBj.year, sdBj.month, sdBj.day), end: todayEnd };
    }
    case "本月":
      return { start: createBeijingDayStart(bj.year, bj.month, 1), end: todayEnd };
    case "上月": {
      const lastMonthStart = createBeijingDayStart(bj.year, bj.month - 1, 1);
      const lastDayNum = new Date(Date.UTC(bj.year, bj.month, 0)).getUTCDate();
      const lastMonthEnd = createBeijingDayEnd(bj.year, bj.month - 1, lastDayNum);
      return { start: lastMonthStart, end: lastMonthEnd };
    }
    case "自定义":
      if (customStart && customEnd) {
        const sBj = getBeijingPartsFromDate(customStart);
        const eBj = getBeijingPartsFromDate(customEnd);
        return {
          start: createBeijingDayStart(sBj.year, sBj.month, sBj.day),
          end: createBeijingDayEnd(eBj.year, eBj.month, eBj.day),
        };
      }
      return { start: null, end: null };
    default:
      return { start: null, end: null };
  }
}

function getBeijingPartsFromDate(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parseInt(parts.find((p) => p.type === t)?.value ?? "0");
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/**
 * 将 Date 转换为北京时间的 ISO 格式字符串（无时区后缀）
 * 用于数据库查询时保证北京时间对齐
 */
export function toLocalISOString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "00";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}.${ms}`;
}

/**
 * 解析日期字符串为Date对象
 * 支持多种格式：ISO格式、zh-CN格式等
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // 尝试直接解析
  let date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  // 尝试解析 "YYYY/M/D HH:mm:ss" 格式 (zh-CN locale)
  const zhCNMatch = dateStr.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (zhCNMatch) {
    const [, year, month, day, hour, minute, second] = zhCNMatch;
    date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // 尝试解析 "YYYY-M-D" 格式
  const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}

/**
 * 检查日期是否在指定范围内
 * 这是核心的数据库级别日期筛选函数
 */
export function isDateInRange(dateStr: string, range: DateRange): boolean {
  // 如果没有设置范围，则返回true（显示所有数据）
  if (!range.start && !range.end) return true;
  
  const date = parseDate(dateStr);
  if (!date) return false; // 无法解析日期的记录不显示
  
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  
  return true;
}

/**
 * 过滤数组中的数据，只返回在日期范围内的记录
 * @param data 原始数据数组
 * @param dateField 日期字段名
 * @param range 日期范围
 */
export function filterByDateRange<T extends Record<string, any>>(
  data: T[],
  dateField: keyof T,
  range: DateRange
): T[] {
  if (!range.start && !range.end) return data;
  
  return data.filter(item => {
    const dateValue = item[dateField];
    if (typeof dateValue !== 'string') return false;
    return isDateInRange(dateValue, range);
  });
}

/**
 * 格式化日期为显示字符串（员工端筛选等：按北京时间日历）
 */
export function formatDateForDisplay(date: Date): string {
  return formatBeijingDate(date);
}

/**
 * 格式化日期范围为显示字符串
 */
export function formatDateRangeForDisplay(range: DateRange): string {
  if (!range.start || !range.end) return '全部时间';
  return `${formatDateForDisplay(range.start)} - ${formatDateForDisplay(range.end)}`;
}

// ─── Member portal diagnostics: SQL p_date_from (Shanghai calendar day start) ───

export const DATE_RANGES = [
  { key: "all", zh: "全部", en: "All" },
  { key: "today", zh: "今天", en: "Today" },
  { key: "7d", zh: "近7天", en: "7 Days" },
  { key: "30d", zh: "近30天", en: "30 Days" },
] as const;

export type DateRangeKey = (typeof DATE_RANGES)[number]["key"];

export function getDateRangeSql(range: DateRangeKey): string | undefined {
  if (range === "all") return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  if (range === "today") {
    return `${get("year")}-${get("month")}-${get("day")} 00:00:00`;
  }
  const days = range === "7d" ? 7 : 30;
  const d = new Date(Date.now() - days * 86400000);
  const dp = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const dg = (t: Intl.DateTimeFormatPartTypes) => dp.find((p) => p.type === t)?.value ?? "";
  return `${dg("year")}-${dg("month")}-${dg("day")} 00:00:00`;
}
