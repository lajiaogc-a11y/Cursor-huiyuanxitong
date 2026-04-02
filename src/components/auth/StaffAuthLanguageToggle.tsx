import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/** 员工登录/注册等未进入主布局页时的语言切换（与顶栏行为一致） */
export function StaffAuthLanguageToggle({ className }: Props) {
  const { t, language, toggleLanguage } = useLanguage();
  const tip =
    language === "zh"
      ? t("切换为英文", "Switch to English")
      : t("切换为中文", "Switch to Chinese");

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-9 min-w-9 px-2.5 text-xs font-semibold tabular-nums bg-background/80 backdrop-blur-sm shadow-sm",
              className,
            )}
            onClick={toggleLanguage}
            aria-label={tip}
          >
            {language === "zh" ? "EN" : "中"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
