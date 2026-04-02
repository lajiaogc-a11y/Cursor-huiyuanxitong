import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0", className)}>
      {children}
    </p>
  );
}

export function LegalPoliciesTab({
  settings,
  onSettingsChange,
}: {
  settings: MemberPortalSettings;
  onSettingsChange: (patch: Partial<MemberPortalSettings>) => void;
}) {
  const { t } = useLanguage();
  const requireAgreement = settings.registration_require_legal_agreement !== false;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-2">
        {t(
          "编辑服务条款与隐私政策全文；保存草稿并发布后会员端注册流程将同步展示。关闭下方开关可隐藏「须勾选同意」且不再拦截未勾选的注册。",
          "Edit the full Terms and Privacy text; after you save draft and publish, the member sign-up flow updates. Turn off the switch below to hide the mandatory checkbox and skip blocking when unchecked.",
        )}
      </p>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("注册与展示", "Registration")}</SectionTitle>
          <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 gap-4">
            <div>
              <p className="text-sm font-medium leading-none">
                {t("注册须同意条款", "Require agreement on sign-up")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "关闭后会员端注册页不再显示勾选框，也不校验同意。",
                  "When off, the member sign-up page hides the checkbox and does not require agreement.",
                )}
              </p>
            </div>
            <Switch
              checked={requireAgreement}
              onCheckedChange={(v) => onSettingsChange({ registration_require_legal_agreement: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("服务条款", "Terms of Service")}</SectionTitle>
          <div className="space-y-2">
            <Label>{t("中文正文", "Chinese")}</Label>
            <Textarea
              className="min-h-[220px] font-mono text-xs leading-relaxed"
              value={settings.terms_of_service_zh}
              onChange={(e) => onSettingsChange({ terms_of_service_zh: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("英文正文", "English")}</Label>
            <Textarea
              className="min-h-[220px] font-mono text-xs leading-relaxed"
              value={settings.terms_of_service_en}
              onChange={(e) => onSettingsChange({ terms_of_service_en: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("隐私政策", "Privacy Policy")}</SectionTitle>
          <div className="space-y-2">
            <Label>{t("中文正文", "Chinese")}</Label>
            <Textarea
              className="min-h-[220px] font-mono text-xs leading-relaxed"
              value={settings.privacy_policy_zh}
              onChange={(e) => onSettingsChange({ privacy_policy_zh: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("英文正文", "English")}</Label>
            <Textarea
              className="min-h-[220px] font-mono text-xs leading-relaxed"
              value={settings.privacy_policy_en}
              onChange={(e) => onSettingsChange({ privacy_policy_en: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
