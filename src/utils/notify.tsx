import { toast } from "sonner";
import { CheckCircle2, XCircle, Info } from "lucide-react";
import { pickBilingual } from "@/lib/appLocale";

type Bilingual = readonly [zh: string, en: string];

function resolveText(msg: Bilingual | string): string {
  if (typeof msg === "string") return msg;
  return pickBilingual(msg[0], msg[1]);
}

/** 成功提示（语言与员工端 LanguageContext / localStorage 一致） */
export function notifySuccess(msg: Bilingual | string) {
  toast.success(resolveText(msg), {
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />,
  });
}

/** 失败提示 */
export function notifyError(msg: Bilingual | string) {
  toast.error(resolveText(msg), {
    icon: <XCircle className="h-4 w-4 text-destructive" aria-hidden />,
  });
}

/** 信息提示 */
export function notifyInfo(msg: Bilingual | string) {
  toast.info(resolveText(msg), {
    icon: <Info className="h-4 w-4 text-sky-500" aria-hidden />,
  });
}
