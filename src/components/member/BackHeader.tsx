/**
 * BackHeader — Premium back-navigation header for member sub-pages (premium-ui-boost layout).
 * Pure UI component, no business logic.
 */
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

interface BackHeaderProps {
  title: string;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
}

export default function BackHeader({ title, onBack, rightSlot }: BackHeaderProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const handleBack = onBack ?? (() => navigate(-1));

  return (
    <header className="grid grid-cols-[2.25rem_1fr_minmax(0,auto)] items-center gap-2 px-5 pb-3 pt-6">
      <button
        type="button"
        onClick={handleBack}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.5)] transition motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.8)] active:scale-90"
        aria-label={t("返回", "Back")}
      >
        <ArrowLeft className="h-4 w-4 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
      </button>
      <h1 className="min-w-0 truncate text-center text-base font-extrabold text-[hsl(var(--pu-m-text))]">
        {title}
      </h1>
      <div className="flex min-w-0 items-center justify-end">
        {rightSlot ?? <span className="inline-block w-9 shrink-0" aria-hidden />}
      </div>
    </header>
  );
}
