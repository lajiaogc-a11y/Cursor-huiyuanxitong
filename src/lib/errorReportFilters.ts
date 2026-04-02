/**
 * 前端异常上报前的过滤：排除浏览器/扩展/无害布局等噪声，避免操作日志里堆满非本站问题。
 */

const EXTENSION_PATTERN =
  /chrome-extension:\/\/|moz-extension:\/\/|safari-web-extension:\/\/|edge:\/\/extension\//i;

/** 常见无害或可自愈、不应占用 error_reports 配额的提示 */
const SUPPRESS_MESSAGE_PATTERNS: RegExp[] = [
  /resizeobserver/i,
  /resizeobserver loop limit exceeded/i,
  /script error\.?\s*$/i,
  /^script error$/i,
  /loading chunk \d+ failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /\babort(ed)?\b.*fetch|fetch.*\babort/i,
  /the user aborted a request/i,
  /signal is aborted without reason/i,
  /cancelled\b/i,
  /non-error promise rejection captured/i,
  /play\(\) request was interrupted/i,
  /permission denied.*notification/i,
  // 浏览器扩展
  /chrome-extension:\/\/|moz-extension:\/\/|extension context invalidated/i,
  /receiving end does not exist/i,
  /could not establish connection/i,
  /message port closed/i,
  // 网络瞬时失败（已由 UI/Query 处理，不必每条入库）
  /^failed to load resource$/i,
  /net::err_(aborted|failed|timed_out|connection)/i,
  /^load failed$/i,
  // 剪贴板在无焦点/非安全上下文失败
  /notallowederror.*clipboard|clipboard.*notallowederror|document is not focused.*copy/i,
];

export function isExtensionScriptFilename(filename: string | null | undefined): boolean {
  if (!filename || typeof filename !== "string") return false;
  return EXTENSION_PATTERN.test(filename.trim());
}

/**
 * 是否不应写入 error_reports（全局 error / unhandledrejection 用）
 */
export function shouldSuppressGlobalErrorReport(args: {
  message: string;
  filename?: string | null;
  source?: string;
}): boolean {
  const msg = String(args.message || "").trim();
  if (!msg) return true;
  if (isExtensionScriptFilename(args.filename)) return true;
  if (EXTENSION_PATTERN.test(msg)) return true;
  for (const re of SUPPRESS_MESSAGE_PATTERNS) {
    if (re.test(msg)) return true;
  }
  return false;
}

/**
 * Promise rejection 的安全文案（避免 JSON.stringify 循环引用抛错拖垮上报逻辑）
 */
export function safeRejectionMessage(reason: unknown): string {
  if (reason == null) return "Unhandled promise rejection";
  if (typeof reason === "string") return reason.slice(0, 2000);
  if (typeof reason === "number" || typeof reason === "boolean" || typeof reason === "bigint") {
    return String(reason).slice(0, 2000);
  }
  if (reason instanceof Error) {
    const m = reason.message || reason.name || "Error";
    return String(m).slice(0, 2000);
  }
  if (typeof reason === "object") {
    const r = reason as { message?: unknown; name?: unknown };
    if (typeof r.message === "string" && r.message.trim()) {
      return r.message.slice(0, 2000);
    }
    try {
      return JSON.stringify(reason).slice(0, 2000);
    } catch {
      return String(reason).slice(0, 2000);
    }
  }
  return String(reason).slice(0, 2000);
}
