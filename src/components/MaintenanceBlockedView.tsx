import { Button } from "@/components/ui/button";
import { Wrench, LogOut } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface MaintenanceBlockedViewProps {
  scope: "global" | "tenant";
  message?: string | null;
  onLogout?: () => void | Promise<void>;
}

export function MaintenanceBlockedView({ scope, message, onLogout }: MaintenanceBlockedViewProps) {
  const { t } = useLanguage();
  const title =
    scope === "global"
      ? t("系统全站维护中", "System Maintenance")
      : t("当前租户维护中", "Tenant Maintenance");
  const description =
    message ||
    (scope === "global"
      ? t("平台正在进行全站维护，请稍后再试。", "The platform is under maintenance. Please try again later.")
      : t("当前租户正在维护中，请稍后再试。", "This tenant is under maintenance. Please try again later."));

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center max-w-lg mx-4">
        <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center">
          <Wrench className="h-7 w-7 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
        {onLogout ? (
          <Button onClick={onLogout} variant="outline">
            <LogOut className="h-4 w-4 mr-2" />
            {t("返回登录", "Back to Login")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
