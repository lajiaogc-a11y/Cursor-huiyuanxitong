import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
  MobileCardCollapsible,
  MobileCardActions,
  MobilePagination,
  MobileEmptyState,
} from "@/components/ui/mobile-data-card";
import type { Dispatch, SetStateAction } from "react";
import { Pencil, Trash2, KeyRound, Copy } from "lucide-react";
import { Member } from "@/hooks/members/useMembers";
import { getDisplayPhone } from "@/lib/phoneMask";
import { getMemberPortalDisplayName } from "@/lib/memberDisplayName";
import { getLevelBadgeColor } from "./memberDisplayHelpers";

type TFn = (zh: string, en?: string) => string;

type Props = {
  paginatedMembers: Member[];
  filteredMembers: Member[];
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  totalPages: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  isAdmin: boolean;
  t: TFn;
  formatDate: (d: string) => string;
  onEdit: (member: Member) => void;
  onOpenSetPassword: (member: Member) => void;
  onCopyPassword: (member: Member) => void;
  onDelete: (memberId: string) => void;
};

export function MemberManagementMobileList({
  paginatedMembers,
  filteredMembers,
  currentPage,
  setCurrentPage,
  totalPages,
  pageSize,
  setPageSize,
  isAdmin,
  t,
  formatDate,
  onEdit,
  onOpenSetPassword,
  onCopyPassword,
  onDelete,
}: Props) {
  return (
    <MobileCardList>
      {paginatedMembers.length === 0 ? (
        <MobileEmptyState
          message={filteredMembers.length === 0 ? t("members.noMembers") : t("members.currentPageEmpty")}
        />
      ) : (
        paginatedMembers.map((member) => (
          <MobileCard key={member.id} accent="info">
            <MobileCardHeader>
              <div className="min-w-0">
                <span className="font-medium text-sm block">{getDisplayPhone(member.phoneNumber, isAdmin)}</span>
                <span className="text-[11px] text-muted-foreground font-mono">{member.memberCode}</span>
              </div>
              <Badge className={getLevelBadgeColor(member.level)}>
                {member.level}
                {t("级", "")}
              </Badge>
            </MobileCardHeader>
            <MobileCardRow
              label={t("用户名称", "Display name")}
              value={getMemberPortalDisplayName(member) || "—"}
            />
            <MobileCardRow
              label={t("注册时间", "Registered")}
              value={member.createdAt ? formatDate(member.createdAt) : "-"}
            />
            <MobileCardRow
              label={t("members.commonCards")}
              value={
                member.commonCards && member.commonCards.length > 0 ? (
                  <div className="flex gap-1 flex-wrap justify-end">
                    {member.commonCards.map((c) => (
                      <Badge
                        key={c}
                        variant="outline"
                        className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800 text-[10px]"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  "-"
                )
              }
            />
            <MobileCardCollapsible>
              <MobileCardRow
                label={t("推荐人电话", "Referrer phone")}
                value={member.referrerPhone ? getDisplayPhone(member.referrerPhone, isAdmin) : "-"}
                mono
              />
              <MobileCardRow label={t("推荐人编号", "Referrer code")} value={member.referrerMemberCode || "-"} mono />
              <MobileCardRow label={t("members.bankCard")} value={member.bankCard || "-"} />
              <MobileCardRow label={t("members.feature")} value={member.customerFeature || "-"} />
              <MobileCardRow label={t("备注", "Remark")} value={member.remark || "-"} />
            </MobileCardCollapsible>
            <MobileCardActions>
              <Button size="sm" variant="outline" className="flex-1 h-9 touch-manipulation" onClick={() => onEdit(member)}>
                <Pencil className="h-3 w-3 mr-1" />
                {t("编辑", "Edit")}
              </Button>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 touch-manipulation"
                  onClick={() => onOpenSetPassword(member)}
                  title={t("设置密码", "Set Password")}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 touch-manipulation"
                  onClick={() => onCopyPassword(member)}
                  title={t("复制密码", "Copy Password")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 w-9 text-destructive border-destructive/30 touch-manipulation"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("members.confirmDelete")}</AlertDialogTitle>
                      <AlertDialogDescription>{t("members.deleteWarning")}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(member.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("删除", "Delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </MobileCardActions>
          </MobileCard>
        ))
      )}
      <MobilePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredMembers.length}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
      />
    </MobileCardList>
  );
}
