import type { Dispatch, SetStateAction } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pencil, Trash2, KeyRound, UsersRound, Copy } from "lucide-react";
import { Member } from "@/hooks/useMembers";
import { getDisplayPhone } from "@/lib/phoneMask";
import { getMemberPortalDisplayName } from "@/lib/memberDisplayName";
import { getCurrencyBadgeColorLocal, getLevelBadgeColor } from "./memberDisplayHelpers";

type TFn = (zh: string, en?: string) => string;

type Props = {
  members: Member[];
  loading: boolean;
  paginatedMembers: Member[];
  filteredMembers: Member[];
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  pageSize: number;
  setPageSize: (n: number) => void;
  pageSizeOptions: number[];
  totalPages: number;
  isAdmin: boolean;
  t: TFn;
  formatDate: (d: string) => string;
  refetch: () => Promise<void>;
  setSearchDraft: (v: string) => void;
  setFilterQuery: (v: string) => void;
  onEdit: (member: Member) => void;
  onOpenSetPassword: (member: Member) => void;
  onCopyPassword: (member: Member) => void;
  onViewReferrals: (member: Member) => void;
  onDelete: (memberId: string) => void;
};

export function MemberManagementDesktopTable({
  members,
  loading,
  paginatedMembers,
  filteredMembers,
  currentPage,
  setCurrentPage,
  pageSize,
  setPageSize,
  pageSizeOptions,
  totalPages,
  isAdmin,
  t,
  formatDate,
  refetch,
  setSearchDraft,
  setFilterQuery,
  onEdit,
  onOpenSetPassword,
  onCopyPassword,
  onViewReferrals,
  onDelete,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <TooltipProvider delayDuration={200}>
          <StickyScrollTableContainer>
          <Table className="text-sm">
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead className="text-center">{t("members.phone")}</TableHead>
                <TableHead className="text-center">{t("members.memberCode")}</TableHead>
                <TableHead className="text-center max-w-[140px]">{t("用户名称", "Display name")}</TableHead>
                <TableHead className="text-center">{t("注册时间", "Registered")}</TableHead>
                <TableHead className="text-center whitespace-nowrap">{t("推荐人电话", "Referrer phone")}</TableHead>
                <TableHead className="text-center whitespace-nowrap">{t("推荐人编号", "Referrer code")}</TableHead>
                <TableHead className="text-center">{t("members.level")}</TableHead>
                <TableHead className="text-center">{t("members.commonCards")}</TableHead>
                <TableHead className="text-center">{t("members.currencyPreference")}</TableHead>
                <TableHead className="text-center">{t("members.bankCard")}</TableHead>
                <TableHead className="text-center">{t("members.feature")}</TableHead>
                <TableHead className="text-center">{t("members.source")}</TableHead>
                <TableHead className="text-center">{t("备注", "Remark")}</TableHead>
                <TableHead className="text-center">{t("members.recorder")}</TableHead>
                <TableHead className="text-center w-[100px]">{t("操作", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && members.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 14 }).map((__, j) => (
                      <TableCell key={j} className="py-2">
                        <Skeleton className="h-7 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paginatedMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center py-10 text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <p className="text-sm">
                        {filteredMembers.length === 0
                          ? members.length === 0
                            ? t("members.noMembers")
                            : t("无匹配结果", "No matches")
                          : t("members.currentPageEmpty")}
                      </p>
                      {members.length === 0 && !loading ? (
                        <Button variant="outline" size="sm" onClick={() => void refetch()}>
                          {t("重试", "Retry")}
                        </Button>
                      ) : null}
                      {filteredMembers.length === 0 && members.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearchDraft("");
                            setFilterQuery("");
                          }}
                        >
                          {t("清空搜索", "Clear search")}
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium text-center">
                      {getDisplayPhone(member.phoneNumber, isAdmin)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {member.memberCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center max-w-[160px]">
                      <span className="truncate inline-block max-w-full" title={getMemberPortalDisplayName(member)}>
                        {getMemberPortalDisplayName(member) || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground tabular-nums">
                      {member.createdAt ? formatDate(member.createdAt) : "-"}
                    </TableCell>
                    <TableCell className="text-center max-w-[120px]">
                      {member.referrerPhone ? (
                        <span
                          className={`text-xs font-mono ${
                            members.some((m) => m.phoneNumber === member.referrerPhone)
                              ? "text-muted-foreground"
                              : "text-destructive"
                          }`}
                          title={member.referrerPhone}
                        >
                          {getDisplayPhone(member.referrerPhone, isAdmin)}
                          {!members.some((m) => m.phoneNumber === member.referrerPhone) && " ⚠"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center max-w-[100px]">
                      {member.referrerMemberCode ? (
                        <Badge
                          variant="outline"
                          className={`text-xs font-mono w-fit mx-auto max-w-full truncate ${
                            members.some((m) => m.memberCode === member.referrerMemberCode)
                              ? "text-muted-foreground"
                              : "border-destructive/50 text-destructive"
                          }`}
                          title={member.referrerMemberCode}
                        >
                          {member.referrerMemberCode}
                          {!members.some((m) => m.memberCode === member.referrerMemberCode) && " ⚠"}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={getLevelBadgeColor(member.level)}>
                        {member.level}
                        {t("级", "")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 flex-wrap justify-center max-w-[120px] mx-auto">
                        {member.commonCards && member.commonCards.length > 0 ? (
                          member.commonCards.map((card) => (
                            <Badge
                              key={card}
                              variant="outline"
                              className="bg-purple-100 text-purple-700 border-purple-200 text-xs"
                            >
                              {card}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 flex-wrap justify-center">
                        {(member.preferredCurrency ?? []).map((currency) => (
                          <Badge
                            key={currency}
                            variant="outline"
                            className={getCurrencyBadgeColorLocal(currency)}
                          >
                            {currency}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-xs text-center">
                      {member.bankCard || "-"}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-center">
                      {member.customerFeature || "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {member.sourceChannel ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                          {member.sourceChannel}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[100px] truncate text-center">{member.remark || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground text-center">{member.recorder || "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onEdit(member)}
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">{t("编辑", "Edit")}</TooltipContent>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onOpenSetPassword(member)}
                                aria-label="Set password"
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("设置密码", "Set password")}</TooltipContent>
                          </Tooltip>
                        )}
                        {isAdmin && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onCopyPassword(member)}
                                aria-label="Copy password"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("复制密码", "Copy password")}</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onViewReferrals(member)}
                              aria-label="View referrals"
                            >
                              <UsersRound className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">{t("查看推荐人", "View referrals")}</TooltipContent>
                        </Tooltip>
                        {isAdmin && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      aria-label="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
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
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("删除", "Delete")}</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </StickyScrollTableContainer>
        </TooltipProvider>
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {t("members.total")} {filteredMembers.length} {t("members.items")}
          </span>
          <span>|</span>
          <span>{t("members.perPage")}</span>
          <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v, 10))}>
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
            {t("首页", "First")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            {t("上一页", "Previous")}
          </Button>
          <span className="px-3 text-sm">
            {currentPage} / {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
          >
            {t("下一页", "Next")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage >= totalPages}
          >
            {t("末页", "Last")}
          </Button>
        </div>
      </div>
    </div>
  );
}
