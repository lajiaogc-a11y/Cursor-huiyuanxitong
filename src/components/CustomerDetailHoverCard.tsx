/**
 * 客户详情 - 点击显示会员数据与活动数据（弹窗模式）
 */
import { useState, useCallback } from "react";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Loader2, User, Coins } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { getCustomerDetailByPhone, type CustomerDetail } from "@/services/members/customerDetailService";
import { cn } from "@/lib/utils";
import { formatBeijingTime } from "@/lib/beijingTime";

interface CustomerDetailHoverCardProps {
  phone: string;
  children: React.ReactNode;
  className?: string;
}

function formatDate(iso: string) {
  return formatBeijingTime(iso);
}

export default function CustomerDetailHoverCard({ phone, children, className }: CustomerDetailHoverCardProps) {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!phone?.trim()) return;
    setLoading(true);
    try {
      const data = await getCustomerDetailByPhone(phone, effectiveTenantId);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [phone, effectiveTenantId]);

  const handleOpen = () => {
    setOpen(true);
    loadDetail();
  };

  const renderRow = (label: string, value: string | number | null | undefined) => (
    <div className="flex gap-2 py-1 text-sm">
      <span className="text-muted-foreground shrink-0 w-24">{label}:</span>
      <span className="break-all min-w-0">{value ?? "-"}</span>
    </div>
  );

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        className={cn("cursor-pointer hover:text-primary hover:underline", className)}
        onClick={handleOpen}
        onKeyDown={(e) => e.key === "Enter" && handleOpen()}
      >
        {children}
      </div>
      <DrawerDetail
        open={open}
        onOpenChange={setOpen}
        title={
          <span className="text-base">
            {t("客户详情", "Customer Detail")} — {phone}
          </span>
        }
        sheetMaxWidth="xl"
      >
          <div className="min-h-0 max-h-[min(70vh,560px)] overflow-y-auto -mx-1 px-1">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : detail?.member ? (
              <div className="divide-y">
                {/* 会员数据 */}
                <div className="py-4">
                  <div className="flex items-center gap-2 font-medium mb-3">
                    <User className="h-4 w-4" />
                    {t("会员数据", "Member Data")}
                  </div>
                  <div className="space-y-0">
                    {renderRow(t("会员编号", "Member Code"), detail.member.member_code)}
                    {renderRow(t("推荐人", "Referrer"), detail.member.referrer_display)}
                    {renderRow(t("等级", "Level"), detail.member.member_level)}
                    {renderRow(t("常交易卡", "Common Cards"), detail.member.common_cards?.join("、") || null)}
                    {renderRow(t("币种偏好", "Currency Preference"), detail.member.currency_preferences?.join("、") || null)}
                    {renderRow(t("银行卡", "Bank Card"), detail.member.bank_card)}
                    {renderRow(t("客户特点", "Customer Feature"), detail.member.customer_feature)}
                    {renderRow(t("来源", "Source"), detail.member.source_name)}
                    {renderRow(t("备注", "Remark"), detail.member.remark)}
                    {renderRow(t("添加时间", "Added Time"), detail.member.created_at ? formatDate(detail.member.created_at) : null)}
                    {renderRow(t("录入人", "Recorder"), detail.member.recorder_name)}
                    {renderRow(
                      t("成功邀请注册（累计人次）", "Successful invites (lifetime)"),
                      String(detail.member.invite_success_lifetime_count ?? 0),
                    )}
                    {renderRow(
                      t("累计获得积分奖励", "Lifetime reward points earned"),
                      Number(detail.member.lifetime_reward_points_earned ?? 0).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      }),
                    )}
                  </div>
                </div>

                {/* 活动数据 */}
                {detail.activity && (
                  <div className="py-4">
                    <div className="flex items-center gap-2 font-medium mb-3">
                      <Coins className="h-4 w-4" />
                      {t("活动数据", "Activity Data")}
                    </div>
                    <div className="space-y-0">
                      {renderRow(t("累计次数", "Order Count"), String(detail.activity.order_count))}
                      {renderRow(
                        t("累计利润", "Accum. Profit"),
                        detail.activity.accumulated_profit != null
                          ? detail.activity.accumulated_profit.toLocaleString()
                          : "-"
                      )}
                      {renderRow(
                        t("累计奈拉", "Accum. NGN"),
                        detail.activity.total_accumulated_ngn != null
                          ? detail.activity.total_accumulated_ngn.toLocaleString()
                          : "-"
                      )}
                      {renderRow(
                        t("累计赛地", "Accum. GHS"),
                        detail.activity.total_accumulated_ghs != null
                          ? detail.activity.total_accumulated_ghs.toLocaleString()
                          : "-"
                      )}
                      {renderRow(
                        t("累计US", "Accum. USDT"),
                        detail.activity.total_accumulated_usdt != null
                          ? detail.activity.total_accumulated_usdt.toLocaleString()
                          : "-"
                      )}
                      {renderRow(t("推荐人数", "Referrals"), String(detail.activity.referral_count))}
                      {renderRow(t("下级次数", "Subordinate Count"), String(detail.activity.consumption_count))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-16 px-4 text-center text-sm text-muted-foreground">
                {t("未找到该客户数据", "No customer data found")}
              </div>
            )}
          </div>
      </DrawerDetail>
    </>
  );
}
