import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronDown, ChevronUp, X, UserPlus, Calculator, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

const LS_HIDE_KEY = "dashboard_hide_quickstart_v1";

/** 与 App.tsx ROUTES.STAFF 保持一致 */
const LINKS = [
  { to: "/staff/member-management", zh: "新增会员", en: "Add member", icon: UserPlus },
  { to: "/staff/exchange-rate", zh: "汇率计算 / 下单", en: "Exchange rate / Order", icon: Calculator },
  { to: "/staff/orders", zh: "订单管理", en: "Orders", icon: ClipboardList },
] as const;

/**
 * 仪表盘「新用户 5 分钟」快捷指引（可折叠、可永久隐藏）
 */
export function DashboardQuickStartCard() {
  const { t } = useLanguage();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(LS_HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(LS_HIDE_KEY) !== "1";
    } catch {
      return true;
    }
  });

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(LS_HIDE_KEY, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  }, []);

  if (hidden) return null;

  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          {t("首次使用 · 5 分钟主路径", "First-time · 5-minute path")}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={dismiss} title={t("不再显示", "Don't show again")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 px-4 pb-3">
          <p className="text-xs text-muted-foreground mb-3">
            {t(
              "按顺序完成下列步骤即可完成基础验收；详细清单见项目内 docs/新用户5分钟走查清单.md。",
              "Complete these in order for a basic walkthrough; see docs/新用户5分钟走查清单.md for details."
            )}
          </p>
          <ol className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {LINKS.map((item, i) => (
              <li key={item.to}>
                <Button variant="secondary" size="sm" className="h-auto py-2 px-3 justify-start gap-2" asChild>
                  <Link to={item.to}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {i + 1}
                    </span>
                    <item.icon className="h-4 w-4 shrink-0 opacity-70" />
                    <span className="text-left">{t(item.zh, item.en)}</span>
                  </Link>
                </Button>
              </li>
            ))}
          </ol>
        </CardContent>
      )}
    </Card>
  );
}
