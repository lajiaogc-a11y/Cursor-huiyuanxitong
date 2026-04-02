import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { CustomerServiceAgent } from "@/services/members/memberPortalSettingsService";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import "@/styles/member-portal.css";

export function CustomerServiceAgentAvatar({
  agent,
  idx,
  imageLoading = "lazy",
}: {
  agent: CustomerServiceAgent;
  idx: number;
  /** trade 页在首屏：避免 lazy 占位与滚动时反复解码导致闪烁（Edge 干预日志） */
  imageLoading?: "lazy" | "eager";
}) {
  const raw = String(agent.avatar_url ?? "").trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(
    `cs-agent-${idx}-${agent.link}`,
    raw || undefined,
  );
  const showImg = raw && !usePlaceholder;
  if (showImg) {
    return (
      <img
        src={resolvedSrc}
        alt=""
        className="member-cs-agent__avatar"
        loading={imageLoading}
        decoding="async"
        onError={onImageError}
      />
    );
  }
  return (
    <div className="member-cs-agent__placeholder" aria-hidden>
      {agent.name.charAt(0).toUpperCase()}
    </div>
  );
}

type Variant = "fab" | "trade";

export function CustomerServiceAgentRows({
  agents,
  variant,
}: {
  agents: CustomerServiceAgent[];
  variant: Variant;
}) {
  const { t } = useLanguage();
  const validAgents = useMemo(
    () => (agents || []).filter((a) => a.name?.trim() && a.link?.trim()),
    [agents],
  );
  if (!validAgents.length) return null;

  return (
    <div className="member-cs-agent-list">
      {validAgents.map((agent, idx) =>
        variant === "fab" ? (
          <a
            key={`${agent.link}-${idx}`}
            href={agent.link}
            target="_blank"
            rel="noopener noreferrer"
            className="member-cs-agent"
          >
            <CustomerServiceAgentAvatar agent={agent} idx={idx} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="member-cs-agent__name">{agent.name}</p>
              <p className="member-cs-agent__sub">
                {t("WhatsApp / 聊天 · 点击打开", "WhatsApp / chat · tap to open")}
              </p>
            </div>
            <span className="member-cs-agent__chev" aria-hidden>
              →
            </span>
          </a>
        ) : (
          <div key={`${agent.link}-${idx}`} className="member-cs-agent member-cs-agent--trade-row">
            <CustomerServiceAgentAvatar agent={agent} idx={idx} imageLoading={variant === "trade" ? "eager" : "lazy"} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="member-cs-agent__name">{agent.name}</p>
              <p className="member-cs-agent__sub">
                {t("WhatsApp / 聊天 · 与右下角客服一致", "WhatsApp / chat · same as the floating support button")}
              </p>
            </div>
            <button
              type="button"
              className="member-cs-trade-cta"
              onClick={() => window.open(agent.link, "_blank", "noopener,noreferrer")}
            >
              {t("立即交易", "Trade now")}
            </button>
          </div>
        ),
      )}
    </div>
  );
}
