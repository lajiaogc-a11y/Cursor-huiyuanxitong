/**
 * 会员门户（/member/*）：按用户手机/浏览器本地时区展示后端存储的北京时间时刻。
 * 解析规则与员工端一致（无时区后缀视为北京时间），再换算为本地显示。
 */
import { parseBackendStoredDatetimeToDate } from "@/lib/beijingTime";

/** 默认 yyyy/MM/dd HH:mm（与会员页原 date-fns 风格接近） */
export function formatMemberLocalTime(
  dateStr: string | Date | null | undefined,
): string {
  const date = parseBackendStoredDatetimeToDate(dateStr);
  if (!date) return typeof dateStr === "string" ? dateStr : "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const y = get("year");
    const m = get("month");
    const d = get("day");
    const h = get("hour").padStart(2, "0");
    const min = get("minute").padStart(2, "0");
    return `${y}/${m}/${d} ${h}:${min}`;
  } catch {
    return typeof dateStr === "string" ? dateStr : "";
  }
}

/** 会员端仅日期 */
export function formatMemberLocalDate(dateStr: string | Date | null | undefined): string {
  const date = parseBackendStoredDatetimeToDate(dateStr);
  if (!date) return typeof dateStr === "string" ? dateStr : "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return typeof dateStr === "string" ? dateStr : "";
  }
}
