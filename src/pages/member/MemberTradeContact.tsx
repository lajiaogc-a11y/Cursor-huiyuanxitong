import { useEffect, useMemo, useRef, useState } from "react";
import BackHeader from "@/components/member/BackHeader";
import { CustomerServiceAgentRows } from "@/components/member/CustomerServiceAgentRows";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { pickBilingualPortalField } from "@/lib/memberPortalBilingualHint";
import { getMemberLotteryPrizes } from "@/services/lottery/lotteryService";
import "@/styles/member-portal.css";

export default function MemberTradeContact() {
  const { t, language } = useLanguage();
  const { member } = useMemberAuth();
  const { settings } = useMemberPortalSettings(member?.id);
  const [orderSpinTipAmount, setOrderSpinTipAmount] = useState<number | null>(null);
  const [tipLoaded, setTipLoaded] = useState(false);
  const prevMemberId = useRef(member?.id);

  useEffect(() => {
    let cancelled = false;
    const mid = member?.id?.trim();
    if (!mid) {
      if (!prevMemberId.current) setTipLoaded(true);
      return;
    }
    prevMemberId.current = mid;
    getMemberLotteryPrizes(mid).then((r) => {
      if (cancelled) return;
      if (r.order_completed_spin_enabled && r.order_completed_spin_amount > 0) {
        setOrderSpinTipAmount(r.order_completed_spin_amount);
      } else {
        setOrderSpinTipAmount(null);
      }
      setTipLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  const portalLang = language === "en" ? "en" : "zh";
  const intro = useMemo(
    () =>
      pickBilingualPortalField(
        portalLang,
        settings.home_first_trade_contact_zh,
        settings.home_first_trade_contact_en,
        t("请联系下方客服完成首笔交易。", "Please contact an agent below to complete your first trade."),
        t("请联系下方客服完成首笔交易。", "Please contact an agent below to complete your first trade."),
      ),
    [
      portalLang,
      settings.home_first_trade_contact_zh,
      settings.home_first_trade_contact_en,
      t,
    ],
  );

  const agents = settings.customer_service_agents || [];
  const hasAgents = agents.some((a) => a.name?.trim() && a.link?.trim());

  return (
    <div className="m-page-bg relative min-h-screen pb-24">
      <BackHeader title={t("联系客服交易", "Contact support to trade")} />

      {tipLoaded && orderSpinTipAmount != null && (
        <div className="relative z-[2] mx-5 mt-2 animate-in fade-in duration-300 rounded-xl border border-[hsl(var(--pu-m-accent)/0.35)] bg-[hsl(var(--pu-m-accent)/0.12)] px-4 py-3 text-[12px] leading-relaxed text-[hsl(var(--pu-m-text))]">
          {t(
            `每完成一笔交易可获得 ${orderSpinTipAmount} 次抽奖机会。`,
            `Earn ${orderSpinTipAmount} lottery spin(s) for each completed transaction.`,
          )}
        </div>
      )}

      <div className="relative overflow-hidden">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] space-y-4 px-5 pb-6 pt-1">
          <p className="m-0 text-[12px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.95)]">{intro}</p>

          {hasAgents ? (
            <CustomerServiceAgentRows agents={agents} variant="trade" />
          ) : (
            <p className="m-0 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.35)] px-4 py-3 text-[12px] text-[hsl(var(--pu-m-text-dim))]">
              {t(
                "尚未配置客服坐席。请管理员在「会员门户 → 客服设置」中添加并发布后重试。",
                "No support agents are configured yet. Ask an admin to add agents under Member Portal → Customer Service, then publish.",
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
