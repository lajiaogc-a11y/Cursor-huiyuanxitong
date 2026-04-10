import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackRender } from "@/lib/performanceUtils";
import { useLanguage } from "@/contexts/LanguageContext";
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
import { RefreshCw, ChevronDown, Download } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/ui/useExportConfirm";
import { exportTableToXLSX } from "@/services/dataExportImportService";
import { notify } from "@/lib/notifyHub";
import { useMembers, Member } from "@/hooks/members/useMembers";
import { logOperation } from "@/services/audit/auditLogService";
import { useCustomerSources } from "@/hooks/crm/useCustomerSources";
import { useCards } from "@/hooks/finance/useMerchantConfig";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayPhone } from "@/lib/phoneMask";
import { adminGetMemberReferrals, adminSetMemberInitialPassword, adminGetInitialPassword } from "@/services/members/memberAdminRpcService";
import { MEMBER_LEVELS } from "@/config/memberLevels";
import { formatBeijingDateHM, formatBeijingDate } from "@/lib/beijingTime";
import { PageHeader, PageActions, KPIGrid } from "@/components/common";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { useDebouncedValue } from "@/hooks/ui/useDebounce";
import { MemberManagementFilterSection } from "@/pages/memberManagement/MemberManagementFilterSection";
import { MemberManagementDesktopTable } from "@/pages/memberManagement/MemberManagementDesktopTable";
import { MemberManagementMobileList } from "@/pages/memberManagement/MemberManagementMobileList";

const memberLevels = [...MEMBER_LEVELS];

export default function MemberManagement() {
  // Performance tracking
  trackRender('MemberManagement');
  
  const { t } = useLanguage();
  const formatDate = (d: string) => formatBeijingDateHM(d);
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const { members, loading, updateMember, deleteMember, refetch } = useMembers();
  const exportConfirm = useExportConfirm();
  const { activeSources: customerSources } = useCustomerSources();
  const { activeCards } = useCards();
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
    } catch (e) {
      console.error('[MemberManagement] load referrals failed:', e);
      notify.error(t("加载推荐数据失败", "Failed to load referral data"));
      setReferrals([]);
    }
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
    if (!isAdmin) {
      notify.error(t("仅管理员可执行此操作", "Only admins can perform this action"));
      return;
    }
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
    if (!isAdmin) {
      notify.error(t("仅管理员可执行此操作", "Only admins can perform this action"));
      return;
    }
    setSetPasswordMember(member);
    setSetPasswordValue("");
  };

  const handleCopyPassword = async (member: Member) => {
    if (!isAdmin) {
      notify.error(t("仅管理员可执行此操作", "Only admins can perform this action"));
      return;
    }
    const pwd = await adminGetInitialPassword(member.id);
    if (!pwd) {
      notify.error(t("该会员暂无初始密码", "No initial password set for this member"));
      return;
    }
    try {
      await navigator.clipboard.writeText(pwd);
      notify.success(t("密码已复制到剪贴板", "Password copied to clipboard"));
    } catch {
      notify.error(t("复制失败，请手动复制", "Copy failed, please copy manually"));
    }
  };

  const handleSetPasswordSubmit = async () => {
    if (!setPasswordMember) return;
    if (!isAdmin) {
      notify.error(t("仅管理员可执行此操作", "Only admins can perform this action"));
      return;
    }
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

  return (
    <div className="h-full flex flex-col gap-4">
      <PageHeader
        description={t("搜索、编辑与导出会员；移动端为卡片列表。", "Search, edit, and export members; mobile uses cards.")}
        actions={
          !isMobile ? (
            <PageActions>
              <Button variant="outline" size="icon" onClick={handleRefresh} aria-label="Refresh">
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
        <MemberManagementFilterSection
          isMobile={false}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          searchError={searchError}
          setSearchError={setSearchError}
          setFilterQuery={setFilterQuery}
          t={t}
          handleRefresh={handleRefresh}
          refetch={refetch}
          isAdmin={isAdmin}
          requestExport={exportConfirm.requestExport}
        />
      )}

      <Card className="flex min-h-0 flex-1 flex-col">
        {isMobile && (
          <MemberManagementFilterSection
            isMobile
            searchDraft={searchDraft}
            setSearchDraft={setSearchDraft}
            searchError={searchError}
            setSearchError={setSearchError}
            setFilterQuery={setFilterQuery}
            t={t}
            handleRefresh={handleRefresh}
            refetch={refetch}
            isAdmin={isAdmin}
            requestExport={exportConfirm.requestExport}
          />
        )}
        <CardContent className="flex min-h-0 flex-1 flex-col p-4">
          <div className="text-sm text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg shrink-0">
            💡 {t('members.memberTip')}
          </div>
          <div className="flex-1 min-h-0">
            {isMobile ? (
              <MemberManagementMobileList
                paginatedMembers={paginatedMembers}
                filteredMembers={filteredMembers}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                setPageSize={setPageSize}
                isAdmin={isAdmin}
                t={t}
                formatDate={formatDate}
                onEdit={handleEdit}
                onOpenSetPassword={handleOpenSetPassword}
                onCopyPassword={handleCopyPassword}
                onDelete={handleDelete}
              />
            ) : (
              <MemberManagementDesktopTable
                members={members}
                loading={loading}
                paginatedMembers={paginatedMembers}
                filteredMembers={filteredMembers}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                pageSize={pageSize}
                setPageSize={setPageSize}
                pageSizeOptions={pageSizeOptions}
                totalPages={totalPages}
                isAdmin={isAdmin}
                t={t}
                formatDate={formatDate}
                refetch={refetch}
                setSearchDraft={setSearchDraft}
                setFilterQuery={setFilterQuery}
                onEdit={handleEdit}
                onOpenSetPassword={handleOpenSetPassword}
                onCopyPassword={handleCopyPassword}
                onViewReferrals={handleViewReferrals}
                onDelete={handleDelete}
              />
            )}
          </div>

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
                      {activeCards.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-2 px-2">
                          {t("暂无卡片数据，请先在卡商管理中添加卡片", "No cards available. Please add cards in merchant management.")}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {activeCards.map((card) => (
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
