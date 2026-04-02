import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackRender } from "@/lib/performanceUtils";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { useLanguage } from "@/contexts/LanguageContext";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, RefreshCw, Pencil, Trash2, ChevronDown, Download, KeyRound, UsersRound, Copy, X } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { MobileFilterBar } from "@/components/ui/mobile-filter-bar";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportTableToXLSX } from "@/services/dataExportImportService";
import { notify } from "@/lib/notifyHub";
import { useMembers, Member } from "@/hooks/useMembers";
import { logOperation } from "@/stores/auditLogStore";
import { getCurrencyBadgeColor, normalizeCurrencyCode, CURRENCIES } from "@/config/currencies";
import { useCustomerSources } from "@/stores/customerSourceStore";
import { getActiveCards, CardItem } from "@/stores/merchantConfigStore";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayPhone } from "@/lib/phoneMask";
import { adminGetMemberReferrals, adminSetMemberInitialPassword } from "@/services/members/memberAdminRpcService";
import { MEMBER_LEVELS } from "@/config/memberLevels";
import { formatBeijingDate } from "@/lib/beijingTime";
import { getMemberPortalDisplayName } from "@/lib/memberDisplayName";
import { PageHeader, PageActions, FilterBar, KPIGrid } from "@/components/common";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const memberLevels = [...MEMBER_LEVELS];

export default function MemberManagement() {
  // Performance tracking
  trackRender('MemberManagement');
  
  const { t } = useLanguage();
  const formatDate = (d: string) => formatBeijingDate(d);
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const { members, loading, updateMember, deleteMember, refetch } = useMembers();
  const exportConfirm = useExportConfirm();
  const { activeSources: customerSources } = useCustomerSources();
  const [searchDraft, setSearchDraft] = useState("");
  const debouncedSearch = useDebouncedValue(searchDraft, 300);
  const [filterQuery, setFilterQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [setPasswordMember, setSetPasswordMember] = useState<Member | null>(null);
  const [setPasswordValue, setSetPasswordValue] = useState("");
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  const [referralMember, setReferralMember] = useState<Member | null>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);

  const handleViewReferrals = async (member: Member) => {
    setReferralMember(member);
    setReferralsLoading(true);
    try {
      const r = await adminGetMemberReferrals(member.id);
      setReferrals(r?.referrals || []);
    } catch { setReferrals([]); }
    setReferralsLoading(false);
  };
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [10, 20, 50, 100];

  const handleRefresh = async () => {
    await refetch();
    notify.success(t('members.listRefreshed'));
  };

  // 排序后的会员列表（按创建时间倒序）
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [members]);

  useEffect(() => {
    setFilterQuery(debouncedSearch);
  }, [debouncedSearch]);

  // 筛选后的会员（防抖 + Enter 立即生效见 filterQuery）
  const filteredMembers = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return sortedMembers.filter(
      (member) =>
        String(member.phoneNumber ?? "").toLowerCase().includes(q) ||
        String(member.memberCode ?? "").toLowerCase().includes(q) ||
        String(member.remark ?? "").toLowerCase().includes(q) ||
        String(member.nickname ?? "").toLowerCase().includes(q) ||
        String(member.commonCards?.join(",") || "").toLowerCase().includes(q)
    );
  }, [sortedMembers, filterQuery]);
  
  // 分页后的会员
  const paginatedMembers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredMembers.slice(startIndex, startIndex + pageSize);
  }, [filteredMembers, currentPage, pageSize]);
  
  // 总页数
  const totalPages = Math.ceil(filteredMembers.length / pageSize);
  
  // 重置页码当筛选条件变化
  useEffect(() => {
    setCurrentPage(1);
  }, [filterQuery, pageSize]);

  const memberKpiItems = useMemo(() => {
    const levelACount = members.filter((m) => m.level === "A").length;
    return [
      { label: t("会员总数", "Total members"), value: String(members.length) },
      { label: t("筛选结果", "After filter"), value: String(filteredMembers.length) },
      { label: t("A 级会员", "Level A"), value: String(levelACount) },
      {
        label: t("分页", "Page"),
        value: `${currentPage} / ${totalPages || 1}`,
        tone: "neutral" as const,
      },
    ];
  }, [members, filteredMembers.length, currentPage, totalPages, t]);

  const handleEdit = (member: Member) => {
    setEditingMember({ ...member });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (editingMember) {
      const originalMember = members.find(m => m.id === editingMember.id);
      
      const result = await updateMember(editingMember.id, {
        level: editingMember.level,
        remark: editingMember.remark,
        customerFeature: editingMember.customerFeature,
        commonCards: editingMember.commonCards,
        bankCard: editingMember.bankCard,
        preferredCurrency: editingMember.preferredCurrency,
        sourceId: editingMember.sourceId,
        referrerPhone: editingMember.referrerPhone ?? "",
      });
      
      if (result) {
        // Audit log - 修改会员
        logOperation(
          'member_management',
          'update',
          editingMember.id,
          originalMember,
          editingMember,
          t(`修改会员: ${editingMember.phoneNumber}`, `Update member: ${editingMember.phoneNumber}`)
        );
        
        notify.success(t('members.updateSuccess'));
        setIsEditDialogOpen(false);
        setEditingMember(null);
      }
    }
  };

  const handleDelete = async (memberId: string) => {
    const success = await deleteMember(memberId);
    if (success) {
      notify.success(t('members.deleteSuccess'));
    }
  };

  const handleViewDetail = (member: Member) => {
    setDetailMember(member);
    setIsDetailDialogOpen(true);
  };

  const handleOpenSetPassword = (member: Member) => {
    setSetPasswordMember(member);
    setSetPasswordValue("");
  };

  const handleCopyPassword = async (member: Member) => {
    const pwd = member.initialPassword;
    if (!pwd) {
      notify.error(t("该会员暂无初始密码", "No initial password set for this member"));
      return;
    }
    try {
      await navigator.clipboard.writeText(pwd);
      notify.success(`Your password is: ${pwd}`);
    } catch {
      notify.info(`Your password is: ${pwd}`);
    }
  };

  const handleSetPasswordSubmit = async () => {
    if (!setPasswordMember) return;
    const pwd = setPasswordValue.trim();
    if (pwd.length < 6) {
      notify.error(t("密码至少6位", "Password must be at least 6 characters"));
      return;
    }
    setSetPasswordLoading(true);
    try {
      const result = await adminSetMemberInitialPassword(setPasswordMember.id, pwd);
      if (result?.success) {
        notify.success(t("密码已设置", "Password set successfully"));
        setSetPasswordMember(null);
        refetch();
      } else {
        const msg =
          result?.error === "PASSWORD_TOO_SHORT"
            ? t("密码至少6位", "Password must be at least 6 characters")
            : result?.error === "MEMBER_NOT_FOUND"
              ? t("会员不存在", "Member not found")
              : result?.error || t("设置失败", "Set failed");
        notify.error(msg);
      }
    } catch (e: unknown) {
      notify.error(t("设置失败", "Set failed") + ": " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSetPasswordLoading(false);
    }
  };

  // 使用全局币种配置的Badge颜色
  const getCurrencyBadgeColorLocal = (currency: string) => {
    // 先尝试规范化币种代码
    const normalizedCode = normalizeCurrencyCode(currency);
    if (normalizedCode) {
      return getCurrencyBadgeColor(normalizedCode);
    }
    return "bg-gray-100 text-gray-700 border-gray-200";
  };

  const getLevelBadgeColor = (level: string) => {
    switch (level) {
      case "A":
        return "bg-amber-100 text-amber-700 border-amber-200";
      case "B":
        return "bg-sky-100 text-sky-700 border-sky-200";
      case "C":
        return "bg-violet-100 text-violet-700 border-violet-200";
      case "D":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <PageHeader
        description={t("搜索、编辑与导出会员；移动端为卡片列表。", "Search, edit, and export members; mobile uses cards.")}
        actions={
          !isMobile ? (
            <PageActions>
              <Button variant="outline" size="icon" onClick={handleRefresh} aria-label={t("刷新", "Refresh")}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <TableImportButton tableName="members" onImportComplete={refetch} />
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    exportConfirm.requestExport(async () => {
                      const r = await exportTableToXLSX("members", false);
                      if (r.success) notify.success(t("已导出 Excel（.xlsx）", "Exported as Excel (.xlsx)"));
                      else if (r.error) notify.error(r.error);
                    })
                  }
                >
                  <Download className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">{t("导出", "Export")}</span>
                </Button>
              )}
            </PageActions>
          ) : undefined
        }
      />

      <KPIGrid items={memberKpiItems} />

      {!isMobile && (
        <FilterBar>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none z-[1]" aria-hidden />
              <Input
                placeholder={t("members.searchPlaceholder")}
                value={searchDraft}
                data-staff-page-search
                onChange={(e) => {
                  setSearchDraft(e.target.value);
                  setSearchError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setFilterQuery(searchDraft);
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  const raw = e.clipboardData.getData("text");
                  const pasted = raw.replace(/[^a-zA-Z0-9]/g, "");
                  setSearchDraft(pasted);
                  setSearchError("");
                  if (raw !== pasted) {
                    notify.info(
                      t("已去除空格与符号，仅保留字母与数字以便匹配。", "Removed spaces and symbols; only letters and digits are kept for matching."),
                    );
                  }
                }}
                className={cn("pl-9 pr-9", searchError && "border-destructive")}
                autoComplete="off"
                name="member-search"
                data-lpignore="true"
                aria-describedby="member-search-hint"
                aria-invalid={!!searchError}
              />
              {searchDraft ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 z-[1] -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setSearchDraft("");
                    setFilterQuery("");
                    setSearchError("");
                  }}
                  aria-label={t("清空搜索", "Clear search")}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              <p id="member-search-hint" className="mt-1 text-[11px] text-muted-foreground">
                {t("粘贴时会自动去掉空格与符号。", "Paste automatically strips spaces and symbols.")}
              </p>
              {searchError ? (
                <span className="mt-1 block text-xs text-destructive" role="alert">
                  {searchError}
                </span>
              ) : null}
            </div>
          </div>
        </FilterBar>
      )}

      <Card className="flex min-h-0 flex-1 flex-col">
        {isMobile && (
          <CardHeader className="shrink-0 px-2.5 pb-2 pt-2">
            <div className="space-y-2">
              <MobileFilterBar
                searchValue={searchDraft}
                onSearchChange={(v) => {
                  setSearchDraft(v);
                  setSearchError("");
                }}
                placeholder={t("members.searchPlaceholder")}
                onRefresh={handleRefresh}
                actions={
                  <div className="flex items-center gap-1.5">
                    <TableImportButton tableName="members" onImportComplete={refetch} />
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0 touch-manipulation rounded-lg"
                        onClick={() =>
                          exportConfirm.requestExport(async () => {
                            const r = await exportTableToXLSX("members", false);
                            if (r.success) notify.success(t("已导出 Excel（.xlsx）", "Exported as Excel (.xlsx)"));
                            else if (r.error) notify.error(r.error);
                          })
                        }
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                }
              />
              {searchError ? <span className="text-xs text-destructive">{searchError}</span> : null}
            </div>
          </CardHeader>
        )}
        <CardContent className="flex min-h-0 flex-1 flex-col p-4">
          <div className="text-sm text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg shrink-0">
            💡 {t('members.memberTip')}
          </div>
          <div className="flex-1 min-h-0">
            {isMobile ? (
              <MobileCardList>
                {paginatedMembers.length === 0 ? (
                  <MobileEmptyState message={filteredMembers.length === 0 ? t('members.noMembers') : t('members.currentPageEmpty')} />
                ) : paginatedMembers.map((member) => (
                  <MobileCard key={member.id} accent="info">
                    <MobileCardHeader>
                      <div className="min-w-0">
                        <span className="font-medium text-sm block">{getDisplayPhone(member.phoneNumber, isAdmin)}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">{member.memberCode}</span>
                      </div>
                      <Badge className={getLevelBadgeColor(member.level)}>
                        {member.level}{t('级', '')}
                      </Badge>
                    </MobileCardHeader>
                    <MobileCardRow
                      label={t("用户名称", "Display name")}
                      value={getMemberPortalDisplayName(member) || "—"}
                    />
                    <MobileCardRow
                      label={t('注册时间', 'Registered')}
                      value={member.createdAt ? formatDate(member.createdAt) : '-'}
                    />
                    <MobileCardRow label={t('members.commonCards')} value={
                      member.commonCards && member.commonCards.length > 0
                        ? <div className="flex gap-1 flex-wrap justify-end">{member.commonCards.map(c => <Badge key={c} variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800 text-[10px]">{c}</Badge>)}</div>
                        : "-"
                    } />
                    <MobileCardCollapsible>
                      <MobileCardRow
                        label={t("推荐人电话", "Referrer phone")}
                        value={member.referrerPhone ? getDisplayPhone(member.referrerPhone, isAdmin) : "-"}
                        mono
                      />
                      <MobileCardRow label={t("推荐人编号", "Referrer code")} value={member.referrerMemberCode || "-"} mono />
                      <MobileCardRow label={t('members.bankCard')} value={member.bankCard || "-"} />
                      <MobileCardRow label={t('members.feature')} value={member.customerFeature || "-"} />
                      <MobileCardRow label={t('备注', 'Remark')} value={member.remark || "-"} />
                    </MobileCardCollapsible>
                    <MobileCardActions>
                      <Button size="sm" variant="outline" className="flex-1 h-9 touch-manipulation" onClick={() => handleEdit(member)}>
                        <Pencil className="h-3 w-3 mr-1" />{t('编辑', 'Edit')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 w-9 touch-manipulation" onClick={() => handleOpenSetPassword(member)} title={t('设置密码', 'Set Password')}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-9 w-9 touch-manipulation" onClick={() => handleCopyPassword(member)} title={t('复制密码', 'Copy Password')}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-9 w-9 text-destructive border-destructive/30 touch-manipulation"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>{t('members.confirmDelete')}</AlertDialogTitle><AlertDialogDescription>{t('members.deleteWarning')}</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(member.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('删除', 'Delete')}</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </MobileCardActions>
                  </MobileCard>
                ))}
                <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredMembers.length} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} />
              </MobileCardList>
            ) : (
            <TooltipProvider delayDuration={200}>
            <StickyScrollTableContainer>
              <Table className="text-sm">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                  <TableHead className="text-center">{t('members.phone')}</TableHead>
                  <TableHead className="text-center">{t('members.memberCode')}</TableHead>
                  <TableHead className="text-center max-w-[140px]">{t("用户名称", "Display name")}</TableHead>
                  <TableHead className="text-center">{t('注册时间', 'Registered')}</TableHead>
                  <TableHead className="text-center whitespace-nowrap">{t("推荐人电话", "Referrer phone")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap">{t("推荐人编号", "Referrer code")}</TableHead>
                  <TableHead className="text-center">{t('members.level')}</TableHead>
                  <TableHead className="text-center">{t('members.commonCards')}</TableHead>
                  <TableHead className="text-center">{t('members.currencyPreference')}</TableHead>
                  <TableHead className="text-center">{t('members.bankCard')}</TableHead>
                  <TableHead className="text-center">{t('members.feature')}</TableHead>
                  <TableHead className="text-center">{t('members.source')}</TableHead>
                  <TableHead className="text-center">{t('备注', 'Remark')}</TableHead>
                  <TableHead className="text-center">{t('members.recorder')}</TableHead>
                  <TableHead className="text-center w-[100px]">{t('操作', 'Actions')}</TableHead>
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
                      <TableCell className="font-medium text-center">{getDisplayPhone(member.phoneNumber, isAdmin)}</TableCell>
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
                        {member.createdAt ? formatDate(member.createdAt) : '-'}
                      </TableCell>
                      <TableCell className="text-center max-w-[120px]">
                        {member.referrerPhone ? (
                          <span
                            className={`text-xs font-mono ${members.some((m) => m.phoneNumber === member.referrerPhone) ? "text-muted-foreground" : "text-destructive"}`}
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
                          {member.level}{t('级', '')}
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
                      <TableCell className="max-w-[100px] truncate text-center">
                        {member.remark || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground text-center">
                        {member.recorder || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(member)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("编辑", "Edit")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleOpenSetPassword(member)}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("设置密码", "Set password")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleCopyPassword(member)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("复制密码", "Copy password")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleViewReferrals(member)}
                              >
                                <UsersRound className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("查看推荐人", "View referrals")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>{t("members.confirmDelete")}</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {t("members.deleteWarning")}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDelete(member.id)}
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
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
           </StickyScrollTableContainer>
            </TooltipProvider>
            )}
          </div>
          
          {/* 分页控件 - 仅桌面端显示（移动端已有 MobilePagination） */}
          {!isMobile && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t shrink-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t('members.total')} {filteredMembers.length} {t('members.items')}</span>
              <span>|</span>
              <span>{t('members.perPage')}</span>
              <Select 
                value={pageSize.toString()} 
                onValueChange={(v) => setPageSize(parseInt(v))}
              >
                <SelectTrigger className="h-8 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
              >
                {t('首页', 'First')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                {t('上一页', 'Previous')}
              </Button>
              <span className="px-3 text-sm">
                {currentPage} / {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
              >
                {t('下一页', 'Next')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
              >
                {t('末页', 'Last')}
              </Button>
            </div>
          </div>
          )}
        </CardContent>
      </Card>

      <DrawerDetail
        open={isEditDialogOpen && !!editingMember}
        onOpenChange={(v) => {
          setIsEditDialogOpen(v);
          if (!v) setEditingMember(null);
        }}
        title={t("members.editMember")}
        sheetMaxWidth="3xl"
      >
        {editingMember ? (
          <>
            <div className="space-y-3">
              {/* 只读字段 - 手机号、会员编号 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.phone')}</Label>
                  <Input value={editingMember.phoneNumber} disabled className="bg-muted flex-1" />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.memberCode')}</Label>
                  <Input value={editingMember.memberCode} disabled className="bg-muted flex-1" />
                </div>
              </div>

              {/* 等级、常交易卡 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.level')}</Label>
                  <Select
                    value={editingMember.level}
                    onValueChange={(value) =>
                      setEditingMember({ ...editingMember, level: value })
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {memberLevels.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.commonCards')}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="flex-1 justify-between h-10 font-normal"
                      >
                        <span className="truncate text-left">
                          {editingMember.commonCards && editingMember.commonCards.length > 0
                            ? editingMember.commonCards.join(", ")
                            : t("请选择常交易卡", "Select common cards")}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-2 max-h-[300px] overflow-y-auto" align="start">
                      {getActiveCards().length === 0 ? (
                        <div className="text-sm text-muted-foreground py-2 px-2">
                          {t("暂无卡片数据，请先在卡商管理中添加卡片", "No cards available. Please add cards in merchant management.")}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {getActiveCards().map((card) => (
                            <div
                              key={card.id}
                              className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                              onClick={() => {
                                const currentCards = editingMember.commonCards || [];
                                const isSelected = currentCards.includes(card.name);
                                const newCards = isSelected
                                  ? currentCards.filter((c) => c !== card.name)
                                  : [...currentCards, card.name];
                                setEditingMember({
                                  ...editingMember,
                                  commonCards: newCards,
                                });
                              }}
                            >
                              <Checkbox
                                checked={editingMember.commonCards?.includes(card.name) || false}
                              />
                              <span className="text-sm">{card.name}</span>
                              <span className="text-xs text-muted-foreground ml-auto">
                                {card.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* 银行卡、币种偏好 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.bankCard')}</Label>
                  <Input
                    value={editingMember.bankCard || ""}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, bankCard: e.target.value })
                    }
                    placeholder={t("例如: 8027489826 opay", "e.g. 8027489826 opay")}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.currencyPreference')}</Label>
                  <div className="flex gap-1 flex-wrap flex-1">
                    {Array.isArray(editingMember.preferredCurrency) && editingMember.preferredCurrency.length > 0 ? 
                      editingMember.preferredCurrency.map((c) => (
                        <Badge key={c} variant="outline">{c}</Badge>
                      )) : 
                      <span className="text-muted-foreground text-sm">{t("由订单自动判定", "Auto-detected from orders")}</span>
                    }
                  </div>
                </div>
              </div>

              {/* 客户特点、来源 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.feature')}</Label>
                  <Input
                    value={editingMember.customerFeature || ""}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, customerFeature: e.target.value })
                    }
                    placeholder={t("请输入客户特点", "Enter customer feature")}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.source')}</Label>
                  <Select
                    value={editingMember.sourceId || ""}
                    onValueChange={(value) =>
                      setEditingMember({ ...editingMember, sourceId: value, sourceChannel: customerSources.find(s => s.id === value)?.name || "" })
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t('members.selectSource')} />
                    </SelectTrigger>
                    <SelectContent>
                      {customerSources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 备注 */}
              <div className="flex items-start gap-3">
                <Label className="w-20 text-right shrink-0 pt-2">{t('备注', 'Remark')}</Label>
                <Textarea
                  value={editingMember.remark}
                  onChange={(e) =>
                    setEditingMember({ ...editingMember, remark: e.target.value })
                  }
                  placeholder={t("请输入备注", "Enter remark")}
                  className="resize-none flex-1"
                  rows={2}
                />
              </div>

              {/* 推荐人、录入人 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.referrer')}</Label>
                  <Input
                    value={editingMember.referrerPhone || ""}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, referrerPhone: e.target.value })
                    }
                    placeholder={t("推荐人电话", "Referrer phone")}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t('members.recorder')}</Label>
                  <Input
                    value={editingMember.recorder}
                    disabled
                    className="bg-muted flex-1"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                {t("取消", "Cancel")}
              </Button>
              <Button onClick={handleSaveEdit}>
                {isAdmin ? t("确认修改", "Confirm Edit") : t("提交审核", "Submit for Review")}
              </Button>
            </div>
          </>
        ) : null}
      </DrawerDetail>

      <DrawerDetail
        open={!!setPasswordMember}
        onOpenChange={(v) => {
          if (!v) setSetPasswordMember(null);
        }}
        title={t("设置密码", "Set Password")}
      >
        {setPasswordMember ? (
          <>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("为会员", "For member")} {getDisplayPhone(setPasswordMember.phoneNumber, isAdmin)} ({setPasswordMember.memberCode}){" "}
                {t("设置初始密码", "set initial password")}
              </p>
              <div className="space-y-2">
                <Label>{t("新密码", "New password")}</Label>
                <Input
                  type="password"
                  value={setPasswordValue}
                  onChange={(e) => setSetPasswordValue(e.target.value)}
                  placeholder={t("至少6位", "At least 6 characters")}
                  minLength={6}
                  autoComplete="new-password"
                  name="member-initial-password"
                  data-lpignore="true"
                />
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setSetPasswordMember(null)} disabled={setPasswordLoading}>
                {t("取消", "Cancel")}
              </Button>
              <Button onClick={handleSetPasswordSubmit} disabled={setPasswordLoading || setPasswordValue.trim().length < 6}>
                {setPasswordLoading ? t("设置中...", "Setting...") : t("确认设置", "Confirm")}
              </Button>
            </div>
          </>
        ) : null}
      </DrawerDetail>

      <DrawerDetail
        open={isDetailDialogOpen && !!detailMember}
        onOpenChange={(v) => {
          setIsDetailDialogOpen(v);
          if (!v) setDetailMember(null);
        }}
        title={t("备注详情", "Remark Details")}
      >
        {detailMember ? (
          <>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {t("members.memberCode")}: {detailMember.memberCode}
                </span>
                <span>|</span>
                <span>
                  {t("members.phone")}: {detailMember.phoneNumber}
                </span>
              </div>
              <div className="rounded-lg bg-muted/30 p-4">
                <p className="whitespace-pre-wrap">{detailMember.remark || t("暂无备注", "No remark")}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <Button onClick={() => setIsDetailDialogOpen(false)}>{t("关闭", "Close")}</Button>
            </div>
          </>
        ) : null}
      </DrawerDetail>

      <DrawerDetail
        open={!!referralMember}
        onOpenChange={(v) => {
          if (!v) setReferralMember(null);
        }}
        title={t("推荐人关系", "Referrals")}
        sheetMaxWidth="xl"
      >
        {referralMember ? (
          <>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("会员", "Member")} {referralMember.phoneNumber} ({referralMember.memberCode}) {t("推荐的用户", "referred users")}:
              </p>
              {referralsLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("加载中...", "Loading...")}</div>
              ) : referrals.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("暂无推荐记录", "No referrals yet")}</div>
              ) : (
                <div className="space-y-2">
                  {referrals.map((r: { id: string; referee_nickname?: string; referee_phone?: string; referee_code?: string; referee_joined?: string }) => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {(r.referee_nickname || r.referee_phone || "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{r.referee_nickname || r.referee_phone}</p>
                          <p className="font-mono text-xs text-muted-foreground">{r.referee_code || "-"}</p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{r.referee_joined ? formatBeijingDate(r.referee_joined) : "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end border-t border-border pt-4">
              <Button variant="outline" onClick={() => setReferralMember(null)}>
                {t("关闭", "Close")}
              </Button>
            </div>
          </>
        ) : null}
      </DrawerDetail>

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </div>
  );
}
