/**
 * 全站统一通知入口。业务代码请使用本模块的 `notify` / `notifySuccess` 等，
 * 勿直接 `import … from "sonner"`（`sonner.tsx` Toaster 与 notifyHub 内部除外）。
 */
import { toast as sonnerToast, type ExternalToast } from "sonner";
import { CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react";
import { pickBilingual } from "@/lib/appLocale";

export type BilingualInput = readonly [string, string] | string;

export function resolveNotifyText(msg: BilingualInput): string {
  if (typeof msg === "string") return msg;
  return pickBilingual(msg[0], msg[1]);
}

const iconSuccess = <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />;
const iconError = <XCircle className="h-4 w-4 text-destructive" aria-hidden />;
const iconInfo = <Info className="h-4 w-4 text-sky-500" aria-hidden />;
const iconWarn = <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />;

export const notify = {
  success: (msg: BilingualInput, opts?: ExternalToast) =>
    sonnerToast.success(resolveNotifyText(msg), { icon: iconSuccess, ...opts }),

  error: (msg: BilingualInput, opts?: ExternalToast) =>
    sonnerToast.error(resolveNotifyText(msg), { icon: iconError, ...opts }),

  info: (msg: BilingualInput, opts?: ExternalToast) =>
    sonnerToast.info(resolveNotifyText(msg), { icon: iconInfo, ...opts }),

  warning: (msg: BilingualInput, opts?: ExternalToast) =>
    sonnerToast.warning(resolveNotifyText(msg), { icon: iconWarn, ...opts }),

  loading: (msg: BilingualInput, opts?: ExternalToast) =>
    sonnerToast.loading(resolveNotifyText(msg), opts),

  message: (msg: BilingualInput, opts?: ExternalToast) =>
    sonnerToast.message(resolveNotifyText(msg), opts),

  /** 标题 + 描述 + action（与历史 sonner `toast(title, { … })` 对齐） */
  banner: (
    title: BilingualInput,
    options?: {
      description?: BilingualInput;
      action?: { label: string; onClick: () => void };
      duration?: number;
    },
  ) =>
    sonnerToast(resolveNotifyText(title), {
      description: options?.description ? resolveNotifyText(options.description) : undefined,
      action: options?.action,
      duration: options?.duration,
    }),

  dismiss: sonnerToast.dismiss,
  promise: sonnerToast.promise,
  custom: sonnerToast.custom,
};

export function notifySuccess(msg: BilingualInput) {
  notify.success(msg);
}

export function notifyError(msg: BilingualInput) {
  notify.error(msg);
}

export function notifyInfo(msg: BilingualInput) {
  notify.info(msg);
}

export function notifyLoading(msg: BilingualInput) {
  return notify.loading(msg);
}
