import { useMemo, useState } from "react";
import { Headphones, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import type { CustomerServiceAgent } from "@/services/members/memberPortalSettingsService";
import { CustomerServiceAgentRows } from "@/components/member/CustomerServiceAgentRows";
import "@/styles/member-portal.css";

interface Props {
  agents: CustomerServiceAgent[];
  /** Panel title override */
  label?: string | null;
}

export function CustomerServiceWidget({ agents, label }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const validAgents = useMemo(
    () => (agents || []).filter((a) => a.name?.trim() && a.link?.trim()),
    [agents],
  );
  const hasAny = validAgents.length > 0;

  if (!hasAny) return null;

  const panelTitle = (label && label.trim()) || t("客服", "Customer Service");

  return (
    <>
      <div className="member-cs-anchor">
        <button
          type="button"
          className={cn("member-cs-fab", open && "member-cs-fab--open")}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? t("关闭客服", "Close support") : t("打开客服", "Open support")}
        >
          {open ? (
            <X size={20} strokeWidth={1.85} aria-hidden />
          ) : (
            <Headphones size={22} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>

      {open && (
        <div className="member-cs-panel" role="dialog" aria-label={panelTitle}>
          <p className="member-cs-panel-title">{panelTitle}</p>
          <CustomerServiceAgentRows agents={validAgents} variant="fab" />
        </div>
      )}
    </>
  );
}
