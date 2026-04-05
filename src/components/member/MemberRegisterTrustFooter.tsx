import { Shield, Lock, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function MemberRegisterTrustFooter() {
  const { t } = useLanguage();
  return (
    <div className="mt-6 space-y-3 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-center gap-6 text-xs opacity-50">
        <span className="flex items-center gap-1">
          <Shield className="h-3 w-3" />
          {t("安全注册", "Secure")}
        </span>
        <span className="flex items-center gap-1">
          <Lock className="h-3 w-3" />
          {t("隐私保护", "Private")}
        </span>
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          {t("即时开通", "Instant")}
        </span>
      </div>
      <p className="text-center text-[10px] opacity-30">
        {t("所有数据传输均已加密", "All data is encrypted in transit")}
      </p>
    </div>
  );
}
