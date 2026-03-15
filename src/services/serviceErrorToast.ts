import { toast } from "sonner";

type Translate = (zh: string, en: string) => string;

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
};

export function showServiceErrorToast(
  error: unknown,
  t: Translate,
  fallbackZh = "操作失败，请稍后重试",
  fallbackEn = "Operation failed, please retry later"
) {
  const code = String((error as { code?: string; message?: string })?.code || (error as { message?: string })?.message || "UNKNOWN");
  const preset = ERROR_MESSAGES[code];
  if (preset) {
    toast.error(t(preset.zh, preset.en));
    return;
  }

  const detail = (error as { message?: string })?.message ? ` (${(error as { message?: string }).message})` : "";
  toast.error(t(`${fallbackZh}${detail}`, `${fallbackEn}${detail}`));
}

