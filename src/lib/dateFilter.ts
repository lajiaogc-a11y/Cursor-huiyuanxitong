// 统一的日期筛选工具 - 基于本地时区（MY/CN）

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export type TimeRangeType = "全部" | "今日" | "昨日" | "近7天" | "近30天" | "本月" | "上月" | "自定义";

export const TIME_RANGES: TimeRangeType[] = ["全部", "今日", "昨日", "近7天", "近30天", "本月", "上月", "自定义"];

/** 用于「全部」的显式宽日期范围，避免无日期筛选时的边界问题（如「上月」数据多于「全部」） */
export const ALL_TIME_DATE_RANGE: { start: Date; end: Date } = (() => {
  const start = new Date(2000, 0, 1, 0, 0, 0, 0);
  const end = new Date(2099, 11, 31, 23, 59, 59, 999);
  return { start, end };
})();

/** 仪表盘「全部」实际请求范围：近 2 年，避免 2000-至今 导致 RPC 超时（约 9000 天数据） */
export function getAllTimeRequestRange(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 2);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * 获取当前时间的本地日期部分（忽略时区转换问题）
 */
function getLocalNow(): Date {
  return new Date();
}

/**
 * 创建本地时间的开始时间（00:00:00.000）
 */
function createLocalDayStart(year: number, month: number, date: number): Date {
  return new Date(year, month, date, 0, 0, 0, 0);
}

/**
 * 创建本地时间的结束时间（23:59:59.999）
 */
function createLocalDayEnd(year: number, month: number, date: number): Date {
  return new Date(year, month, date, 23, 59, 59, 999);
}

/**
 * 根据时间范围类型获取具体的日期范围（基于本地时区）
 * 所有日期筛选必须包含"今天"的数据
 */
export function getTimeRangeDates(range: TimeRangeType, customStart?: Date, customEnd?: Date): DateRange {
  const now = getLocalNow();
  const todayStart = createLocalDayStart(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = createLocalDayEnd(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (range) {
    case "全部":
      return { start: null, end: null };
    case "今日":
      // 今日：今天00:00:00 到 今天23:59:59.999
      return { start: todayStart, end: todayEnd };
    case "昨日": {
      // 昨日：昨天00:00:00 到 昨天23:59:59.999
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStart = createLocalDayStart(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      const yesterdayEnd = createLocalDayEnd(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      return { start: yesterdayStart, end: yesterdayEnd };
    }
    case "近7天": {
      // 近7天：6天前00:00:00 到 今天23:59:59.999（包含今天）
      const startDay = new Date(now);
      startDay.setDate(startDay.getDate() - 6);
      const last7Start = createLocalDayStart(startDay.getFullYear(), startDay.getMonth(), startDay.getDate());
      return { start: last7Start, end: todayEnd };
    }
    case "近30天": {
      // 近30天：29天前00:00:00 到 今天23:59:59.999（包含今天）
      const startDay = new Date(now);
      startDay.setDate(startDay.getDate() - 29);
      const last30Start = createLocalDayStart(startDay.getFullYear(), startDay.getMonth(), startDay.getDate());
      return { start: last30Start, end: todayEnd };
    }
    case "本月": {
      // 本月：当月1日00:00:00 到 今天23:59:59.999（包含今天）
      const thisMonthStart = createLocalDayStart(now.getFullYear(), now.getMonth(), 1);
      return { start: thisMonthStart, end: todayEnd };
    }
    case "上月": {
      // 上月：上月1日00:00:00 到 上月最后一天23:59:59.999
      // 上月最后一天 = 本月0日
      const lastMonthStart = createLocalDayStart(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      const lastMonthEnd = createLocalDayEnd(lastDayOfLastMonth.getFullYear(), lastDayOfLastMonth.getMonth(), lastDayOfLastMonth.getDate());
      return { start: lastMonthStart, end: lastMonthEnd };
    }
    case "自定义":
      if (customStart && customEnd) {
        // 确保开始日期从00:00:00开始，结束日期到23:59:59.999
        const start = createLocalDayStart(customStart.getFullYear(), customStart.getMonth(), customStart.getDate());
        const end = createLocalDayEnd(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate());
        return { start, end };
      }
      return { start: null, end: null };
    default:
      return { start: null, end: null };
  }
}

/**
 * 将本地日期转换为 ISO 字符串（保持本地时间语义）
 * 用于数据库查询时避免时区偏移
 */
export function toLocalISOString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
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
 * 格式化日期为显示字符串
 */
export function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/**
 * 格式化日期范围为显示字符串
 */
export function formatDateRangeForDisplay(range: DateRange): string {
  if (!range.start || !range.end) return '全部时间';
  return `${formatDateForDisplay(range.start)} - ${formatDateForDisplay(range.end)}`;
}
