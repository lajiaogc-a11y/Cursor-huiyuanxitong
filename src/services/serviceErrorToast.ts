import { notify } from "@/lib/notifyHub";
import { ApiError } from "@/lib/apiClient";
import { readEffectiveAppLocale } from "@/lib/appLocale";

type Translate = (zh: string, en: string) => string;

/** 优先使用结构化 code（勿把英文 message 当作 code，否则无法匹配预设文案） */
function resolveErrorCode(error: unknown): string {
  if (error instanceof ApiError && typeof error.code === "string" && error.code.length > 0) {
    return error.code;
  }
  if (error && typeof error === "object" && "code" in error) {
    const c = (error as { code?: unknown }).code;
    if (typeof c === "string" && c.length > 0) return c;
  }
  return "UNKNOWN";
}

const ERROR_MESSAGES: Record<string, { zh: string; en: string }> = {
  HAS_UNRETURNED_PHONES: {
    zh: "当前有未归还或未删除的号码，请先处理后再提取",
    en: "You still have unreturned/undeleted numbers",
  },
  DAILY_LIMIT_EXCEEDED: {
    zh: "今日提取次数已达上限",
    en: "Daily extract limit reached",
  },
  NOT_AUTHENTICATED: {
    zh: "登录会话已失效，请刷新页面重新登录后再试",
    en: "Session expired, please refresh and sign in again",
  },
  FORBIDDEN_TENANT_MISMATCH: {
    zh: "当前租户与操作租户不一致，请退出租户视图后重试",
    en: "Tenant mismatch. Exit tenant view and retry",
  },
  TENANT_REQUIRED: {
    zh: "未识别到租户，请重新登录后重试",
    en: "Tenant not found, please sign in again",
  },
  FORBIDDEN_ADMIN_ONLY: {
    zh: "仅管理员可修改",
    en: "Admin only",
  },
  MULTI_TENANT_NOT_READY: {
    zh: "数据库尚未完成多租户初始化",
    en: "Multi-tenant schema not initialized",
  },
  NO_PERMISSION: {
    zh: "权限不足",
    en: "No permission",
  },
  PLATFORM_SUPER_ADMIN_REQUIRED: {
    zh: "仅平台超级管理员可操作此功能；若为总管理员请退出后重新登录再试。",
    en: "Platform super admin only. If you are one, sign out and sign in again to refresh your session.",
  },
  TENANT_CODE_EXISTS: {
    zh: "租户编码已存在",
    en: "Tenant code already exists",
  },
  ADMIN_USERNAME_EXISTS: {
    zh: "管理员账号已存在",
    en: "Admin username already exists",
  },
  ADMIN_REAL_NAME_EXISTS: {
    zh: "管理员姓名已存在",
    en: "Admin real name already exists",
  },
  TENANT_NOT_FOUND: {
    zh: "租户不存在",
    en: "Tenant not found",
  },
  ADMIN_NOT_FOUND: {
    zh: "未找到该租户管理员账号",
    en: "Admin not found for this tenant",
  },
  TENANT_HAS_DATA: {
    zh: "该租户包含业务数据，需确认后强制删除",
    en: "Tenant has business data, force delete required",
  },
  INVALID_PASSWORD: {
    zh: "密码错误，请重新输入",
    en: "Invalid password, please try again",
  },
  PASSWORD_REQUIRED: {
    zh: "请输入密码确认",
    en: "Password is required",
  },
  CANNOT_DELETE_PLATFORM: {
    zh: "不能删除平台管理租户",
    en: "Cannot delete platform tenant",
  },
  TASK_NOT_FOUND: {
    zh: "任务不存在",
    en: "Task not found",
  },
  TASK_ALREADY_CLOSED: {
    zh: "任务已关闭",
    en: "Task already closed",
  },
  POSTER_NOT_FOUND: {
    zh: "海报不存在",
    en: "Poster not found",
  },
  ORDER_NOT_FOUND: {
    zh: "更新失败: 未找到匹配的订单记录",
    en: "Update failed: No matching order found",
  },
  FEATURE_DISABLED: {
    zh: "该功能当前已关闭",
    en: "This feature is currently disabled",
  },
  QUOTA_EXCEEDED: {
    zh: "已达到租户配额上限，请联系平台管理员调整",
    en: "Tenant quota exceeded, please contact platform admin",
  },
  INVALID_FLAG_KEY: {
    zh: "功能开关键无效",
    en: "Invalid feature flag key",
  },
  TARGET_NOT_FOUND: {
    zh: "目标记录不存在",
    en: "Target record not found",
  },
  MAINTENANCE_MODE: {
    zh: "系统维护中，请稍后再试",
    en: "System is under maintenance, please try later",
  },
  TENANT_ID_REQUIRED: {
    zh: "平台管理员请先进入「租户视图」选择租户，或确认请求已携带 tenant_id",
    en: "Platform admin: enter tenant view first, or ensure tenant_id is sent",
  },
  TENANT_SCOPE_FORBIDDEN: {
    zh: "无权访问该租户的数据，请重新登录或切换正确的租户视图",
    en: "No access to this tenant’s data. Re-sign in or switch tenant view",
  },
  TENANT_NOT_BOUND: {
    zh: "当前账号未绑定租户，无法加载该数据",
    en: "Your account has no tenant bound",
  },
  STATS_QUERY_FAILED: {
    zh: "网站数据统计查询失败（请确认数据库已迁移并重启 API）",
    en: "Site stats query failed; check DB migrations and API restart",
  },
  CLEANUP_SETTINGS_QUERY_FAILED: {
    zh: "数据管理规则查询失败（请确认 member_portal_settings 表与迁移已执行）",
    en: "Cleanup settings query failed; check member_portal_settings migrations",
  },
  STATS_DATE_INVALID: {
    zh: "日期格式无效，请使用 YYYY-MM-DD",
    en: "Invalid date format, use YYYY-MM-DD",
  },
  STATS_RANGE_INVALID_ORDER: {
    zh: "开始日期不能晚于结束日期",
    en: "Start date must be on or before end date",
  },
  STATS_RANGE_TOO_LONG: {
    zh: "统计区间过长（最多 366 天），请缩短后重试",
    en: "Date range too long (max 366 days)",
  },
  CLEANUP_NO_TRADE_MONTHS_REQUIRED: {
    zh: "启用自动清理时，「无交易月数」须为 ≥1 的整数",
    en: "When cleanup is enabled, months without trade must be ≥ 1",
  },
  CLEANUP_NO_LOGIN_MONTHS_REQUIRED: {
    zh: "启用自动清理时，「无登录月数」须为 ≥1 的整数",
    en: "When cleanup is enabled, months without login must be ≥ 1",
  },
  CLEANUP_MAX_POINTS_REQUIRED: {
    zh: "启用自动清理时，请填写「积分低于」阈值",
    en: "When cleanup is enabled, set the points-below threshold",
  },
  EMPLOYEE_ADMIN_REQUIRED: {
    zh: "需要管理员权限才能执行此操作",
    en: "Admin permission required",
  },
  DEVICE_WHITELIST_UNAVAILABLE: {
    zh: "设备白名单数据暂不可用，请稍后重试或确认数据库迁移已完成",
    en: "Device whitelist data is temporarily unavailable; retry later or confirm DB migrations",
  },
  SERVICE_UNAVAILABLE: {
    zh: "服务暂时不可用，请稍后重试",
    en: "Service temporarily unavailable, please try again later",
  },
};

export function showServiceErrorToast(
  error: unknown,
  t: Translate,
  fallbackZh = "操作失败，请稍后重试",
  fallbackEn = "Operation failed, please retry later"
) {
  if (error instanceof TypeError) {
    const msg = error.message || "";
    const isNetworkError =
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("Load failed") ||
      msg.includes("ERR_BLOCKED");
    if (isNetworkError) {
      notify.error(t(
        `${fallbackZh}（网络异常，请检查网络或关闭广告拦截插件后重试）`,
        `${fallbackEn} (network error — check connection or disable ad blocker)`,
      ));
      return;
    }
  }

  const code = resolveErrorCode(error);
  const preset = ERROR_MESSAGES[code];
  if (preset) {
    notify.error(t(preset.zh, preset.en));
    return;
  }

  const raw =
    error instanceof ApiError
      ? String(error.message || "").trim()
      : String((error as { message?: string })?.message || "").trim();
  if (
    error instanceof ApiError &&
    raw &&
    /[\u4e00-\u9fff]/.test(raw) &&
    !/^请求失败 \(HTTP/.test(raw)
  ) {
    notify.error(raw);
    return;
  }
  const useDetail =
    raw &&
    raw !== "请求失败" &&
    !/^请求失败 \(HTTP/.test(raw) &&
    readEffectiveAppLocale() === "en";
  const detail = useDetail ? ` (${raw})` : "";
  notify.error(t(`${fallbackZh}${detail}`, `${fallbackEn}${detail}`));
}

