import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBeijingTime } from "@/lib/beijingTime";
import { pointsLedgerTransactionLabel } from "@/lib/pointsLedgerTypeLabel";
import { translatePointsLedgerDescription } from "@/lib/pointsLedgerDescriptionI18n";
import type { PointsLedgerEntry } from "@/hooks/usePointsLedger";

export interface ActivityPointsHistoryMember {
  phone_number: string;
  member_code: string;
}

export interface ActivityPointsHistoryOrder {
  id: string;
  order_number?: string;
}

/** 积分流水「备注」：商城兑换展示写入流水时的礼品名称快照 */
function formatPointsLedgerRemark(
  entry: { description?: string | null; currency?: string | null },
  opts: { isMallRedemption: boolean; isRedemptionType: boolean },
  t: (zh: string, en: string) => string,
): string {
  const desc = String(entry.description ?? "").trim();
  if (opts.isMallRedemption && desc) {
    const m = desc.match(/前端兑换[（(](.+?)[）)]/);
    if (m) return m[1].trim();
    return translatePointsLedgerDescription(desc, t);
  }
  if (desc) return translatePointsLedgerDescription(desc, t);
  if (!opts.isRedemptionType && entry.currency) return String(entry.currency);
  return "-";
}

export interface ActivityPointsHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: ActivityPointsHistoryMember | null;
  /** Filtered ledger entries for this member (newest first, same as usePointsLedger slice) */
  entries: PointsLedgerEntry[];
  orders: ActivityPointsHistoryOrder[];
  displayPhone: (phone: string) => string;
}

export function ActivityPointsHistoryDrawer({
  open,
  onOpenChange,
  member,
  entries,
  orders,
  displayPhone,
}: ActivityPointsHistoryDrawerProps) {
  const { t } = useLanguage();

  return (
    <DrawerDetail
      open={open}
      onOpenChange={onOpenChange}
      title={`${t("积分流水详情", "Points History")} — ${member?.member_code ?? ""}`}
      sheetMaxWidth="4xl"
    >
      <div className="space-y-4">
        {member && (
          <>
            <div className="text-sm text-muted-foreground">
              {t("电话号码", "Phone")}：{displayPhone(member.phone_number)}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-center">{t("时间", "Time")}</TableHead>
                    <TableHead className="text-center">{t("订单ID", "Order ID")}</TableHead>
                    <TableHead className="text-center">{t("类型", "Type")}</TableHead>
                    <TableHead className="text-center">{t("获得积分", "Points Earned")}</TableHead>
                    <TableHead className="text-center">{t("变动前积分", "Before")}</TableHead>
                    <TableHead className="text-center">{t("变动后积分", "After")}</TableHead>
                    <TableHead className="text-center">{t("备注", "Remark")}</TableHead>
                    <TableHead className="text-center">{t("状态", "Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {t("暂无积分流水记录", "No points history records")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      const history = entries;
                      const ascHistory = [...history].sort(
                        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                      );
                      let runBal = 0;
                      const balMap = new Map<string, { before: number; after: number }>();
                      for (const e of ascHistory) {
                        const pe = Number(e.points_earned ?? (e as { amount?: unknown }).amount ?? 0);
                        const rawBal = (e as { balance_after?: unknown }).balance_after;
                        const dbBal = rawBal != null ? Number(rawBal) : NaN;
                        if (Number.isFinite(dbBal)) {
                          const after = dbBal;
                          const before = after - pe;
                          runBal = after;
                          balMap.set(e.id, { before, after });
                        } else {
                          const before = runBal;
                          const after = runBal + pe;
                          runBal = after;
                          balMap.set(e.id, { before, after });
                        }
                      }
                      return history.map((entry) => {
                        const pe = Number(entry.points_earned ?? entry.amount ?? 0);
                        const bal = balMap.get(entry.id) ?? { before: 0, after: 0 };
                        const pointsBefore = bal.before;
                        const pointsAfter = bal.after;
                        const txn = String(entry.transaction_type || entry.type || "").toLowerCase();
                        const ty = String(entry.type || "").toLowerCase();
                        const refTy = String((entry as { reference_type?: string }).reference_type || "").toLowerCase();
                        const isRedemptionType =
                          txn === "redeem_activity_1" ||
                          txn === "redeem_activity_2" ||
                          txn === "redemption" ||
                          txn === "redeem" ||
                          txn === "mall_redemption" ||
                          ty.startsWith("redeem_") ||
                          refTy === "mall_redemption";
                        const typeLabel = pointsLedgerTransactionLabel(
                          entry.transaction_type,
                          entry.type,
                          (entry as { reference_type?: string | null }).reference_type,
                          t,
                        );

                        const isRedemption = isRedemptionType;
                        const isMallRedemption = txn === "mall_redemption" || refTy === "mall_redemption";

                        const orderDisplayId = isRedemption
                          ? t("无", "N/A")
                          : entry.order_id
                            ? orders.find((o) => o.id === entry.order_id)?.order_number ||
                              entry.order_id.substring(0, 8)
                            : "-";

                        const remarkDisplay = formatPointsLedgerRemark(
                          entry as { description?: string | null; currency?: string | null },
                          { isMallRedemption, isRedemptionType },
                          t,
                        );

                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="text-center text-xs">
                              {formatBeijingTime(entry.created_at)}
                            </TableCell>
                            <TableCell className="text-center font-mono text-xs">{orderDisplayId}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{typeLabel}</Badge>
                            </TableCell>
                            <TableCell
                              className={`text-center font-medium ${pe > 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {pe > 0 ? `+${pe}` : pe}
                            </TableCell>
                            <TableCell className="text-center text-muted-foreground">{pointsBefore}</TableCell>
                            <TableCell className="text-center font-bold text-primary">{pointsAfter}</TableCell>
                            <TableCell className="text-center max-w-[220px] text-xs break-words">
                              {remarkDisplay}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant="outline"
                                className={
                                  isRedemptionType
                                    ? "bg-orange-50 text-orange-700"
                                    : pe > 0
                                      ? "bg-green-50 text-green-700"
                                      : "bg-red-50 text-red-700"
                                }
                              >
                                {isRedemptionType
                                  ? t("已兑换", "Redeemed")
                                  : pe > 0
                                    ? t("已发放", "Issued")
                                    : t("已回收", "Reversed")}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
      <div className="border-t border-border pt-4 mt-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("关闭", "Close")}
        </Button>
      </div>
    </DrawerDetail>
  );
}
