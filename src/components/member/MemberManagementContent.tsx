import { useState, useEffect, useMemo } from "react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trackRender } from "@/lib/performanceUtils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, KeyRound, Copy } from "lucide-react";
import { toast } from "sonner";
import { useMembers, Member } from "@/hooks/useMembers";
import { logOperation } from "@/stores/auditLogStore";
import { getCurrencyBadgeColor, normalizeCurrencyCode } from "@/config/currencies";
import { useCustomerSources } from "@/stores/customerSourceStore";
import { useCards } from "@/hooks/useMerchantConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBeijingDate } from "@/lib/beijingTime";
import { getDisplayPhone } from "@/lib/phoneMask";
import { adminSetMemberInitialPassword } from "@/services/members/memberAdminRpcService";
import { useAuditWorkflow } from "@/hooks/useAuditWorkflow";
import { useModulePermissions } from "@/hooks/useFieldPermissions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TablePagination } from "@/components/ui/table-pagination";
import { ChevronDown } from "lucide-react";
import { isStandardMemberLevel } from "@/config/memberLevels";
import { getMemberPortalDisplayName } from "@/lib/memberDisplayName";
import { loadSharedData } from "@/services/finance/sharedDataService";
import { mergeAuditSettings } from "@/lib/auditSettingsTypes";
import { useTenantView } from "@/contexts/TenantViewContext";
import { fetchMemberLevelsApi } from "@/services/members/memberLevelsApi";
import { displayMemberLevelLabel } from "@/lib/memberLevelDisplay";

/** 与 handleSaveEdit 中变更检测一致，供「提交审核 / 确认修改」按钮按当前实际改动判断 */
function getMemberFieldChanges(
  original: Member | null | undefined,
  edited: Member
): { fieldKey: string; oldValue: unknown; newValue: unknown }[] {
  const changes: { fieldKey: string; oldValue: unknown; newValue: unknown }[] = [];
  if (!original) return changes;
  if (original.level !== edited.level || original.currentLevelId !== edited.currentLevelId) {
    changes.push({
      fieldKey: 'level',
      oldValue: original.level,
      newValue: edited.currentLevelId || edited.level,
    });
  }
  if (original.remark !== edited.remark) {
    changes.push({ fieldKey: 'remark', oldValue: original.remark, newValue: edited.remark });
  }
  if (original.customerFeature !== edited.customerFeature) {
    changes.push({ fieldKey: 'customerFeature', oldValue: original.customerFeature, newValue: edited.customerFeature });
  }
  if (JSON.stringify(original.commonCards) !== JSON.stringify(edited.commonCards)) {
    changes.push({ fieldKey: 'commonCards', oldValue: original.commonCards, newValue: edited.commonCards });
  }
  if (original.bankCard !== edited.bankCard) {
    changes.push({ fieldKey: 'bankCard', oldValue: original.bankCard, newValue: edited.bankCard });
  }
  if (JSON.stringify(original.preferredCurrency) !== JSON.stringify(edited.preferredCurrency)) {
    changes.push({ fieldKey: 'preferredCurrency', oldValue: original.preferredCurrency, newValue: edited.preferredCurrency });
  }
  if (original.sourceId !== edited.sourceId) {
    changes.push({ fieldKey: 'sourceId', oldValue: original.sourceId, newValue: edited.sourceId });
  }
  const refDigits = (p?: string) => String(p || "").replace(/\D/g, "");
  if (refDigits(original.referrerPhone) !== refDigits(edited.referrerPhone)) {
    changes.push({
      fieldKey: "referrerPhone",
      oldValue: original.referrerPhone,
      newValue: edited.referrerPhone,
    });
  }
  return changes;
}

interface MemberManagementContentProps {
  searchTerm?: string;
}

export default function MemberManagementContent({ searchTerm: externalSearchTerm = "" }: MemberManagementContentProps) {
  // Performance tracking
  trackRender('MemberManagementContent');
  
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const { isAdmin, employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId =
    employee?.is_platform_super_admin
      ? viewingTenantId || employee?.tenant_id || null
      : viewingTenantId || employee?.tenant_id || null;
  const { members, loading, isFetching, updateMember, deleteMember, refetch } = useMembers();
  const { sources: customerSources } = useCustomerSources();
  const { submitBatchForApproval, checkNeedsApproval } = useAuditWorkflow();
  const { activeCards } = useCards();
  
  // 获取会员管理模块的所有字段权限
  const { canViewField, canEditField, canDeleteField } = useModulePermissions('members');
  
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [allowManualMemberLevel, setAllowManualMemberLevel] = useState(false);
  const [promotionRules, setPromotionRules] = useState<
    { id: string; level_name: string; level_name_zh: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    loadSharedData<unknown>("auditSettings").then((raw) => {
      if (cancelled) return;
      setAllowManualMemberLevel(mergeAuditSettings(raw).allow_manual_member_level === true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!effectiveTenantId) {
      setPromotionRules([]);
      return;
    }
    let cancelled = false;
    fetchMemberLevelsApi(effectiveTenantId)
      .then((rows) => {
        if (cancelled) return;
        setPromotionRules(
          (rows || []).map((r) => ({
            id: r.id,
            level_name: r.level_name,
            level_name_zh: r.level_name_zh ?? '',
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setPromotionRules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveTenantId]);
  
  /** 当前编辑会话中：已改动的字段里是否存在「需走审核」的项（结合审核设置 + 数据编辑权限） */
  const [memberEditNeedsApproval, setMemberEditNeedsApproval] = useState(false);
  
  useEffect(() => {
    if (!isEditDialogOpen || !editingMember || isAdmin) {
      setMemberEditNeedsApproval(false);
      return;
    }
    const originalMember = members.find((m) => m.id === editingMember.id);
    const changes = getMemberFieldChanges(originalMember, editingMember);
    if (changes.length === 0) {
      setMemberEditNeedsApproval(false);
      return;
    }
    let cancelled = false;
    (async () => {
      for (const c of changes) {
        if (await checkNeedsApproval('member', c.fieldKey)) {
          if (!cancelled) setMemberEditNeedsApproval(true);
          return;
        }
      }
      if (!cancelled) setMemberEditNeedsApproval(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editingMember, members, isEditDialogOpen, isAdmin, checkNeedsApproval]);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [setPasswordMember, setSetPasswordMember] = useState<Member | null>(null);
  const [setPasswordValue, setSetPasswordValue] = useState("");
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  
  // 分页状态 - 默认20条
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [10, 20, 50, 100];

  // 排序后的会员列表（按创建时间倒序）
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [members]);

  // 筛选后的会员 - 支持电话号码和会员编号搜索
  const filteredMembers = useMemo(() => {
    const search = externalSearchTerm.toLowerCase();
    return sortedMembers.filter(
      (member) =>
        String(member.phoneNumber ?? '').toLowerCase().includes(search) ||
        String(member.memberCode ?? '').toLowerCase().includes(search) ||
        String(member.remark ?? '').toLowerCase().includes(search) ||
        String(member.nickname ?? '').toLowerCase().includes(search) ||
        String(member.commonCards?.join(",") || "").toLowerCase().includes(search)
    );
  }, [sortedMembers, externalSearchTerm]);
  
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
  }, [externalSearchTerm, pageSize]);

  const canEditPromotionLevel = allowManualMemberLevel && canEditField("member_level");

  const handleEdit = (member: Member) => {
    let cid = member.currentLevelId || null;
    if (!cid && promotionRules.length) {
      const hit = promotionRules.find((r) => r.level_name === member.level);
      cid = hit?.id || null;
    }
    setEditingMember({ ...member, currentLevelId: cid });
    setIsEditDialogOpen(true);
  };

  const levelPayloadForSave = (m: Member) =>
    canEditPromotionLevel && m.currentLevelId
      ? { currentLevelId: m.currentLevelId }
      : canEditPromotionLevel
        ? { level: m.level }
        : {};

  const handleSaveEdit = async () => {
    if (editingMember) {
      const originalMember = members.find(m => m.id === editingMember.id);
      const changes = getMemberFieldChanges(originalMember, editingMember);

      if (changes.length === 0) {
        toast.info(t("没有修改任何内容", "No changes made"));
        setIsEditDialogOpen(false);
        return;
      }

      // 管理员直接编辑，不需要审核
      if (isAdmin) {
        const result = await updateMember(editingMember.id, {
          ...levelPayloadForSave(editingMember),
          remark: editingMember.remark,
          customerFeature: editingMember.customerFeature,
          commonCards: editingMember.commonCards,
          bankCard: editingMember.bankCard,
          preferredCurrency: editingMember.preferredCurrency,
          sourceId: editingMember.sourceId,
          referrerPhone: editingMember.referrerPhone ?? "",
        });
        
        if (result) {
          logOperation(
            'member_management',
            'update',
            editingMember.id,
            originalMember,
            editingMember,
            `修改会员: ${editingMember.phoneNumber}`
          );
          
          toast.success(t("会员信息已更新", "Member info updated"));
          setIsEditDialogOpen(false);
          setEditingMember(null);
        }
        return;
      }

      // 非管理员：检查是否有字段需要审核
      const auditResult = await submitBatchForApproval({
        module: 'member',
        changes,
        targetId: editingMember.id,
        targetDescription: `会员 ${editingMember.phoneNumber}`,
        originalData: originalMember,
      });

      // 如果有字段被拒绝（不可编辑且未开放审核）
      if (auditResult.hasRejected) {
        toast.error(auditResult.message);
        return;
      }

      // 如果有字段需要审核
      if (auditResult.pendingFields.length > 0) {
        toast.info(auditResult.message);
        
        // 只更新不需要审核的字段
        if (auditResult.directFields.length > 0) {
          const directUpdate: any = {};
          for (const field of auditResult.directFields) {
            if (field === 'level') {
              if (canEditPromotionLevel && editingMember.currentLevelId) {
                directUpdate.currentLevelId = editingMember.currentLevelId;
              } else if (canEditPromotionLevel) {
                directUpdate.level = editingMember.level;
              }
            }
            if (field === 'remark') directUpdate.remark = editingMember.remark;
            if (field === 'customerFeature') directUpdate.customerFeature = editingMember.customerFeature;
            if (field === 'commonCards') directUpdate.commonCards = editingMember.commonCards;
            if (field === 'bankCard') directUpdate.bankCard = editingMember.bankCard;
            if (field === 'preferredCurrency') directUpdate.preferredCurrency = editingMember.preferredCurrency;
            if (field === 'sourceId') directUpdate.sourceId = editingMember.sourceId;
            if (field === 'referrerPhone') directUpdate.referrerPhone = editingMember.referrerPhone ?? "";
          }
          
          if (Object.keys(directUpdate).length > 0) {
            await updateMember(editingMember.id, directUpdate);
            logOperation(
              'member_management',
              'update',
              editingMember.id,
              originalMember,
              { ...originalMember, ...directUpdate },
              `修改会员(部分): ${editingMember.phoneNumber}`
            );
          }
        }
        
        setIsEditDialogOpen(false);
        setEditingMember(null);
        return;
      }
      
      // 所有字段都可以直接更新
      const result = await updateMember(editingMember.id, {
        ...levelPayloadForSave(editingMember),
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
          `修改会员: ${editingMember.phoneNumber}`
        );
        
        toast.success(t("会员信息已更新", "Member updated"));
        setIsEditDialogOpen(false);
        setEditingMember(null);
      }
    }
  };

  const handleDelete = async (memberId: string) => {
    const memberToDelete = members.find((m) => m.id === memberId);
    
    const success = await deleteMember(memberId);
    
    if (success) {
      toast.success(t("会员已删除", "Member deleted"));
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
      toast.error(t("该会员暂无初始密码", "No initial password set for this member"));
      return;
    }
    try {
      await navigator.clipboard.writeText(pwd);
      toast.success(`Your password is: ${pwd}`);
    } catch {
      toast.info(`Your password is: ${pwd}`);
    }
  };

  const handleSetPasswordSubmit = async () => {
    if (!setPasswordMember) return;
    const pwd = setPasswordValue.trim();
    if (pwd.length < 6) {
      toast.error(t("密码至少6位", "Password must be at least 6 characters"));
      return;
    }
    setSetPasswordLoading(true);
    try {
      let result: { success?: boolean; error?: string };
      try {
        result = await adminSetMemberInitialPassword(setPasswordMember.id, pwd);
      } catch (err: unknown) {
        toast.error(t("设置失败", "Set failed") + ": " + (err instanceof Error ? err.message : String(err)));
        return;
      }
      if (result?.success) {
        toast.success(t("密码已设置", "Password set successfully"));
        setSetPasswordMember(null);
        refetch();
      } else {
        const msg =
          result?.error === "PASSWORD_TOO_SHORT"
            ? t("密码至少6位", "Password must be at least 6 characters")
            : result?.error === "MEMBER_NOT_FOUND"
              ? t("会员不存在", "Member not found")
              : result?.error || t("设置失败", "Set failed");
        toast.error(msg);
      }
    } catch (e: unknown) {
      toast.error(t("设置失败", "Set failed") + ": " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSetPasswordLoading(false);
    }
  };

  // 使用全局币种配置的Badge颜色
  const getCurrencyBadgeColorLocal = (currency: string) => {
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
      case "普通会员":
        return "bg-muted text-muted-foreground border-border";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  // 格式化等级显示 - A/B/C/D 后加"级"，普通会员保持原样
  const formatLevelDisplay = (level: string) => {
    if (isStandardMemberLevel(level)) {
      return `${level}级`;
    }
    return level || "普通会员";
  };

  /** 员工端列表/详情：中文界面优先规则表中的中文名 */
  const staffLevelDisplay = (level: string) => {
    const z = promotionRules.find((r) => r.level_name === level)?.level_name_zh?.trim();
    if (language === "zh" && z) return z;
    return formatLevelDisplay(level);
  };

  const renderEditingLevelControl = () => {
    if (!editingMember) return null;
    if (!canEditPromotionLevel) {
      return (
        <div className="space-y-1">
          <Input value={staffLevelDisplay(editingMember.level)} readOnly className="bg-muted" />
          <p className="text-[10px] text-muted-foreground">
            {t(
              "等级由累计积分自动计算。需在审核中心开启「允许手动修改会员等级」且具备等级编辑权限后才可调整。",
              "Level follows total points. Enable manual override in Audit Center and have level edit permission to change.",
            )}
          </p>
        </div>
      );
    }
    if (promotionRules.length === 0) {
      return (
        <p className="text-xs text-muted-foreground">
          {t("暂无等级规则，请先在「会员晋级」中配置。", "No level rules — configure in Member promotion first.")}
        </p>
      );
    }
    return (
      <Select
        value={editingMember.currentLevelId || ""}
        onValueChange={(id) => {
          const rule = promotionRules.find((r) => r.id === id);
          setEditingMember({
            ...editingMember,
            currentLevelId: id,
            level: rule?.level_name ?? editingMember.level,
          });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t("选择等级", "Select level")} />
        </SelectTrigger>
        <SelectContent>
          {promotionRules.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {displayMemberLevelLabel(r.level_name, r.level_name_zh, language)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const activeCustomerSources = customerSources.filter(s => s.isActive);

  if (loading && members.length === 0) {
    return <TablePageSkeleton columns={7} rows={5} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="px-3 pt-4 pb-4 sm:px-6 sm:pb-6">
          {isMobile ? (
            <>
              <MobileCardList>
                {paginatedMembers.length === 0 ? (
                  <MobileEmptyState message={filteredMembers.length === 0 
                      ? t("暂无会员数据", "No members yet")
                      : t("当前页无数据", "No data on this page")} />
                ) : paginatedMembers.map((member) => (
                  <MobileCard key={member.id} accent="info">
                    <MobileCardHeader>
                      <span className="font-medium text-sm font-mono">{getDisplayPhone(member.phoneNumber, isAdmin)}</span>
                      {canViewField('member_level') && (
                        <Badge className={getLevelBadgeColor(member.level)}>
                          {staffLevelDisplay(member.level)}
                        </Badge>
                      )}
                    </MobileCardHeader>
                    {canViewField('member_code') && (
                      <MobileCardRow label={t("会员编号", "Code")} value={
                        <Badge variant="outline" className="font-mono text-xs">{member.memberCode}</Badge>
                      } />
                    )}
                    {canViewField('nickname') && (
                      <MobileCardRow
                        label={t("用户名称", "Display name")}
                        value={
                          <span className="text-right font-medium truncate max-w-[200px]" title={getMemberPortalDisplayName(member)}>
                            {getMemberPortalDisplayName(member) || "—"}
                          </span>
                        }
                      />
                    )}
                    {canViewField('member_code') && (
                      <MobileCardRow
                        label={t("注册时间", "Registered")}
                        value={member.createdAt ? formatBeijingDate(member.createdAt) : "-"}
                      />
                    )}
                    {canViewField('currency_preferences') && Array.isArray(member.preferredCurrency) && member.preferredCurrency.length > 0 && (
                      <MobileCardRow label={t("币种", "Currency")} value={
                        <div className="flex gap-1 flex-wrap justify-end">
                          {member.preferredCurrency.map((c) => (
                            <Badge key={c} variant="outline" className={getCurrencyBadgeColorLocal(c) + " text-xs"}>{c}</Badge>
                          ))}
                        </div>
                      } />
                    )}
                    <MobileCardCollapsible>
                      {canViewField('referrer') && (
                        <MobileCardRow label={t("推荐人", "Referrer")} value={member.referrerPhone ? getDisplayPhone(member.referrerPhone, isAdmin) : "-"} />
                      )}
                      {canViewField('referrer') && (
                        <MobileCardRow label={t("推荐人编号", "Referrer Code")} value={member.referrerMemberCode || "-"} />
                      )}
                      {canViewField('common_cards') && (
                        <MobileCardRow label={t("常交易卡", "Cards")} value={
                          member.commonCards && member.commonCards.length > 0 ? (
                            <div className="flex gap-1 flex-wrap justify-end">
                              {member.commonCards.map((card) => (
                                <Badge key={card} variant="outline" className="text-xs">{card}</Badge>
                              ))}
                            </div>
                          ) : "-"
                        } />
                      )}
                      {canViewField('bank_card') && (
                        <MobileCardRow label={t("银行卡", "Bank Card")} value={member.bankCard || "-"} />
                      )}
                      {canViewField('source') && (
                        <MobileCardRow label={t("来源", "Source")} value={customerSources.find(s => s.id === member.sourceId)?.name || "-"} />
                      )}
                      {canViewField('customer_feature') && (
                        <MobileCardRow label={t("客户特征", "Feature")} value={member.customerFeature || "-"} />
                      )}
                      {canViewField('recorder') && (
                        <MobileCardRow label={t("录入人", "Recorder")} value={member.recorder || "-"} />
                      )}
                      {canViewField('remark') && (
                        <MobileCardRow label={t("备注", "Remark")} value={member.remark || "-"} />
                      )}
                    </MobileCardCollapsible>
                    <MobileCardActions>
                      <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => handleEdit(member)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />{t("编辑", "Edit")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" onClick={() => handleOpenSetPassword(member)} title={t("设置密码", "Set Password")}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" onClick={() => handleCopyPassword(member)} title={t("复制密码", "Copy Password")}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {canDeleteField('delete_button') && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline" className="h-9 text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("此操作将彻底删除该会员，无法恢复。确定要继续吗？", "This will permanently delete this member. Are you sure?")}
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
                      )}
                    </MobileCardActions>
                  </MobileCard>
                ))}
                <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredMembers.length} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} />
              </MobileCardList>
            </>
          ) : (
          <>
          <StickyScrollTableContainer minWidth="1520px">
            <Table className="text-sm">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  {canViewField('phone_number') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("手机号", "Phone")}</TableHead>}
                  {canViewField('member_code') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("会员编号", "Member Code")}</TableHead>}
                  {canViewField('nickname') && (
                    <TableHead className="text-center whitespace-nowrap px-1.5 max-w-[140px]">
                      {t("用户名称", "Display name")}
                    </TableHead>
                  )}
                  {canViewField('member_code') && (
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t("注册时间", "Registered")}</TableHead>
                  )}
                  {canViewField('referrer') && (
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t("推荐人电话", "Referrer phone")}</TableHead>
                  )}
                  {canViewField('referrer') && (
                    <TableHead className="text-center whitespace-nowrap px-1.5">{t("推荐人编号", "Referrer code")}</TableHead>
                  )}
                  {canViewField('member_level') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("等级", "Level")}</TableHead>}
                  {canViewField('common_cards') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("常交易卡", "Common Cards")}</TableHead>}
                  {canViewField('currency_preferences') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("币种偏好", "Currency Pref.")}</TableHead>}
                  {canViewField('bank_card') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("银行卡", "Bank Card")}</TableHead>}
                  {canViewField('customer_feature') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("客户特点", "Feature")}</TableHead>}
                  {canViewField('source') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("来源", "Source")}</TableHead>}
                  {canViewField('remark') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("备注", "Remark")}</TableHead>}
                  {canViewField('recorder') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("录入人", "Recorder")}</TableHead>}
                  <TableHead className="text-center whitespace-nowrap px-1.5 w-[130px] sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center py-8 text-muted-foreground">
                      {filteredMembers.length === 0 
                        ? t("暂无会员数据，提交订单后将自动生成会员记录", "No members yet. Records will be created automatically after orders.")
                        : t("当前页无数据", "No data on this page")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMembers.map((member) => (
                    <TableRow key={member.id}>
                      {canViewField('phone_number') && (
                        <TableCell className="font-medium text-center whitespace-nowrap px-1.5">{getDisplayPhone(member.phoneNumber, isAdmin)}</TableCell>
                      )}
                      {canViewField('member_code') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5">
                          <Badge variant="outline" className="font-mono">
                            {member.memberCode}
                          </Badge>
                        </TableCell>
                      )}
                      {canViewField('nickname') && (
                        <TableCell className="text-center max-w-[160px] px-1.5">
                          <span className="truncate inline-block max-w-full align-middle" title={getMemberPortalDisplayName(member)}>
                            {getMemberPortalDisplayName(member) || "—"}
                          </span>
                        </TableCell>
                      )}
                      {canViewField('member_code') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5 text-muted-foreground text-xs tabular-nums">
                          {member.createdAt ? formatBeijingDate(member.createdAt) : "-"}
                        </TableCell>
                      )}
                      {canViewField('referrer') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5 max-w-[120px]">
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
                      )}
                      {canViewField('referrer') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5 max-w-[100px]">
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
                      )}
                      {canViewField('member_level') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5">
                          <Badge className={getLevelBadgeColor(member.level)}>
                            {staffLevelDisplay(member.level)}
                          </Badge>
                        </TableCell>
                      )}
                      {canViewField('common_cards') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5">
                          <div className="flex gap-1 flex-wrap justify-center max-w-[100px] mx-auto">
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
                      )}
                      {canViewField('currency_preferences') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5">
                          <div className="flex gap-1 flex-wrap justify-center">
                            {(Array.isArray(member.preferredCurrency) ? member.preferredCurrency : []).map((currency) => (
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
                      )}
                      {canViewField('bank_card') && (
                        <TableCell className="max-w-[100px] truncate text-xs text-center">
                          {member.bankCard || "-"}
                        </TableCell>
                      )}
                      {canViewField('customer_feature') && (
                        <TableCell className="max-w-[100px] truncate text-center">
                          {member.customerFeature || "-"}
                        </TableCell>
                      )}
                      {canViewField('source') && (
                        <TableCell className="text-center">
                          {(() => {
                            const sourceName = customerSources.find(s => s.id === member.sourceId)?.name;
                            return sourceName ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                {sourceName}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            );
                          })()}
                        </TableCell>
                      )}
                      {canViewField('remark') && (
                        <TableCell className="max-w-[100px] truncate text-center">
                          {member.remark || "-"}
                        </TableCell>
                      )}
                      {canViewField('recorder') && (
                        <TableCell className="text-sm text-muted-foreground text-center">
                          {member.recorder || "-"}
                        </TableCell>
                      )}
                      <TableCell className="sticky right-0 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)] whitespace-nowrap px-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(member)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenSetPassword(member)}
                            title={t("设置密码", "Set Password")}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleCopyPassword(member)}
                            title={t("复制密码", "Copy Password")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {canDeleteField('delete_button') && (
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
                                  <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t("此操作将彻底删除该会员，无法恢复。确定要继续吗？", "This will permanently delete this member. Are you sure?")}
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
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </StickyScrollTableContainer>
          
          {/* 分页控件 */}
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredMembers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 20, 50, 100]}
          />
          </>
          )}
        </CardContent>
      </Card>

      <DrawerDetail
        open={!!setPasswordMember}
        onOpenChange={(open) => {
          if (!open) setSetPasswordMember(null);
        }}
        title={t("设置密码", "Set Password")}
        sheetMaxWidth="xl"
      >
          {setPasswordMember && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("为会员", "For member")} {getDisplayPhone(setPasswordMember.phoneNumber, isAdmin)} ({setPasswordMember.memberCode}) {t("设置初始密码", "set initial password")}
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
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 mt-4">
            <Button variant="outline" onClick={() => setSetPasswordMember(null)} disabled={setPasswordLoading}>
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleSetPasswordSubmit} disabled={setPasswordLoading || (setPasswordValue.trim().length < 6)}>
              {setPasswordLoading ? t("设置中...", "Setting...") : t("确认设置", "Confirm")}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        title={t("编辑会员信息", "Edit Member")}
        sheetMaxWidth="3xl"
      >
          {editingMember && (
            isMobile ? (
              /* ── Mobile: 单列垂直布局 ── */
              <div className="space-y-4 py-2">
                {/* 只读信息摘要 */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{t("手机号", "Phone")}</p>
                    <p className="text-sm font-medium truncate">{getDisplayPhone(editingMember.phoneNumber, isAdmin)}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{t("会员编号", "Code")}</p>
                    <p className="text-sm font-medium truncate">{editingMember.memberCode}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("等级", "Level")}</Label>
                  {renderEditingLevelControl()}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("常交易卡", "Cards")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={`w-full justify-between h-10 font-normal ${!canEditField('common_cards') ? 'bg-muted pointer-events-none' : ''}`} disabled={!canEditField('common_cards')}>
                        <span className="truncate text-left">{editingMember.commonCards?.length ? editingMember.commonCards.join(", ") : t("请选择常交易卡", "Select cards")}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[calc(100vw-64px)] p-2 max-h-[240px] overflow-y-auto" align="start">
                      {activeCards.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-2 px-2">{t("暂无卡片数据", "No cards available")}</div>
                      ) : (
                        <div className="space-y-0.5">
                          {activeCards.map((card) => (
                            <div key={card.id} className="flex items-center gap-2 p-2.5 rounded-lg active:bg-muted cursor-pointer" onClick={() => {
                              if (!canEditField('common_cards')) return;
                              const cur = editingMember.commonCards || [];
                              setEditingMember({ ...editingMember, commonCards: cur.includes(card.name) ? cur.filter((c) => c !== card.name) : [...cur, card.name] });
                            }}>
                              <Checkbox checked={editingMember.commonCards?.includes(card.name) || false} />
                              <span className="text-sm flex-1">{card.name}</span>
                              <span className="text-xs text-muted-foreground">{card.type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("银行卡", "Bank Card")}</Label>
                  <Input value={editingMember.bankCard || ""} onChange={(e) => setEditingMember({ ...editingMember, bankCard: e.target.value })} placeholder={t("例如: 8027489826 opay", "e.g. 8027489826 opay")} disabled={!canEditField('bank_card')} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("币种偏好", "Currency")}</Label>
                  <div className="flex gap-1.5 flex-wrap min-h-[36px] items-center px-1">
                    {Array.isArray(editingMember.preferredCurrency) && editingMember.preferredCurrency.length > 0
                      ? editingMember.preferredCurrency.map((c) => <Badge key={c} variant="outline">{c}</Badge>)
                      : <span className="text-muted-foreground text-sm">{t("由订单自动判定", "Auto-detected")}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("客户特点", "Feature")}</Label>
                    <Input value={editingMember.customerFeature || ""} onChange={(e) => setEditingMember({ ...editingMember, customerFeature: e.target.value })} placeholder={t("客户特点", "Feature")} disabled={!canEditField('customer_feature')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("来源", "Source")}</Label>
                    <Select value={editingMember.sourceChannel || ""} onValueChange={(v) => setEditingMember({ ...editingMember, sourceChannel: v })} disabled={!canEditField('source')}>
                      <SelectTrigger className={!canEditField('source') ? 'bg-muted' : ''}><SelectValue placeholder={t("选择来源", "Source")} /></SelectTrigger>
                      <SelectContent>{activeCustomerSources.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("备注", "Remark")}</Label>
                  <Textarea value={editingMember.remark} onChange={(e) => setEditingMember({ ...editingMember, remark: e.target.value })} placeholder={t("请输入备注", "Enter remark")} className="resize-none" rows={2} disabled={!canEditField('remark')} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("成功邀请注册（累计人次）", "Successful invites (lifetime)")}</Label>
                    <Input value={String(editingMember.inviteSuccessLifetimeCount ?? 0)} readOnly className="bg-muted" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("累计获得积分奖励", "Lifetime reward points earned")}</Label>
                    <Input
                      value={Number(editingMember.lifetimeRewardPointsEarned ?? 0).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("推荐人", "Referrer")}</Label>
                    <Input value={editingMember.referrerPhone || ""} onChange={(e) => setEditingMember({ ...editingMember, referrerPhone: e.target.value })} placeholder={t("推荐人电话", "Phone")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t("录入人", "Recorder")}</Label>
                    <Input value={editingMember.recorder || "-"} disabled className="bg-muted" />
                  </div>
                </div>
              </div>
            ) : (
              /* ── Desktop: 原始两列横向布局 ── */
              <div className="space-y-3 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("手机号", "Phone")}</Label>
                    <Input value={getDisplayPhone(editingMember.phoneNumber, isAdmin)} disabled className="bg-muted flex-1" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("会员编号", "Code")}</Label>
                    <Input value={editingMember.memberCode} disabled className="bg-muted flex-1" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <Label className="w-20 text-right shrink-0 pt-2">{t("等级", "Level")}</Label>
                    <div className="flex-1 min-w-0">{renderEditingLevelControl()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("常交易卡", "Cards")}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={`flex-1 justify-between h-10 font-normal ${!canEditField('common_cards') ? 'bg-muted pointer-events-none' : ''}`} disabled={!canEditField('common_cards')}>
                          <span className="truncate text-left">{editingMember.commonCards?.length ? editingMember.commonCards.join(", ") : t("请选择常交易卡", "Select cards")}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-2 max-h-[300px] overflow-y-auto" align="start">
                        {activeCards.length === 0 ? (
                          <div className="text-sm text-muted-foreground py-2 px-2">{t("暂无卡片数据，请先在卡商管理中添加卡片", "No cards available.")}</div>
                        ) : (
                          <div className="space-y-1">
                            {activeCards.map((card) => (
                              <div key={card.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer" onClick={() => {
                                if (!canEditField('common_cards')) return;
                                const cur = editingMember.commonCards || [];
                                setEditingMember({ ...editingMember, commonCards: cur.includes(card.name) ? cur.filter((c) => c !== card.name) : [...cur, card.name] });
                              }}>
                                <Checkbox checked={editingMember.commonCards?.includes(card.name) || false} />
                                <span className="text-sm">{card.name}</span>
                                <span className="text-xs text-muted-foreground ml-auto">{card.type}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("银行卡", "Bank Card")}</Label>
                    <Input value={editingMember.bankCard || ""} onChange={(e) => setEditingMember({ ...editingMember, bankCard: e.target.value })} placeholder={t("例如: 8027489826 opay", "e.g. 8027489826 opay")} className="flex-1" disabled={!canEditField('bank_card')} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("币种偏好", "Currency")}</Label>
                    <div className="flex gap-1 flex-wrap flex-1">
                      {Array.isArray(editingMember.preferredCurrency) && editingMember.preferredCurrency.length > 0
                        ? editingMember.preferredCurrency.map((c) => <Badge key={c} variant="outline">{c}</Badge>)
                        : <span className="text-muted-foreground text-sm">{t("由订单自动判定", "Auto-detected from orders")}</span>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("客户特点", "Feature")}</Label>
                    <Input value={editingMember.customerFeature || ""} onChange={(e) => setEditingMember({ ...editingMember, customerFeature: e.target.value })} placeholder={t("请输入客户特点", "Enter feature")} className="flex-1" disabled={!canEditField('customer_feature')} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("来源", "Source")}</Label>
                    <Select value={editingMember.sourceChannel || ""} onValueChange={(value) => setEditingMember({ ...editingMember, sourceChannel: value })} disabled={!canEditField('source')}>
                      <SelectTrigger className={`flex-1 ${!canEditField('source') ? 'bg-muted' : ''}`}><SelectValue placeholder={t("请选择来源", "Select source")} /></SelectTrigger>
                      <SelectContent>{activeCustomerSources.map((source) => <SelectItem key={source.id} value={source.name}>{source.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Label className="w-20 text-right shrink-0 pt-2">{t("备注", "Remark")}</Label>
                  <Textarea value={editingMember.remark} onChange={(e) => setEditingMember({ ...editingMember, remark: e.target.value })} placeholder={t("请输入备注", "Enter remark")} className="resize-none flex-1" rows={2} disabled={!canEditField('remark')} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0 leading-tight">{t("邀请成功累计", "Invites (lifetime)")}</Label>
                    <Input value={String(editingMember.inviteSuccessLifetimeCount ?? 0)} readOnly className="bg-muted flex-1" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0 leading-tight">{t("累计奖励积分", "Reward pts (total)")}</Label>
                    <Input
                      value={Number(editingMember.lifetimeRewardPointsEarned ?? 0).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                      readOnly
                      className="bg-muted flex-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("推荐人", "Referrer")}</Label>
                    <Input value={editingMember.referrerPhone || ""} onChange={(e) => setEditingMember({ ...editingMember, referrerPhone: e.target.value })} placeholder={t("推荐人电话", "Referrer phone")} className="flex-1" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-20 text-right shrink-0">{t("录入人", "Recorder")}</Label>
                    <Input value={editingMember.recorder || "-"} disabled className="bg-muted flex-1" />
                  </div>
                </div>
              </div>
            )
          )}
          <div
            className={`border-t border-border pt-4 mt-4 ${isMobile ? "flex flex-col gap-2" : "flex flex-wrap justify-end gap-2"}`}
          >
            {isMobile ? (
              <>
                {!isAdmin && memberEditNeedsApproval ? (
                  <Button onClick={handleSaveEdit} className="w-full bg-amber-500 hover:bg-amber-600 text-white h-11">{t("提交审核", "Submit for Review")}</Button>
                ) : (
                  <Button onClick={handleSaveEdit} className="w-full h-11">{t("确认修改", "Confirm")}</Button>
                )}
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="w-full h-11">{t("取消", "Cancel")}</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>{t("取消", "Cancel")}</Button>
                {!isAdmin && memberEditNeedsApproval ? (
                  <Button onClick={handleSaveEdit} className="bg-amber-500 hover:bg-amber-600 text-white">{t("提交审核", "Submit for Review")}</Button>
                ) : (
                  <Button onClick={handleSaveEdit}>{t("确认修改", "Confirm")}</Button>
                )}
              </>
            )}
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={isDetailDialogOpen}
        onOpenChange={setIsDetailDialogOpen}
        title={t("备注详情", "Remark Details")}
        sheetMaxWidth="xl"
      >
          {detailMember && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{t("会员编号", "Code")}: {detailMember.memberCode}</span>
                <span>|</span>
                <span>{t("手机号", "Phone")}: {detailMember.phoneNumber}</span>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="whitespace-pre-wrap">{detailMember.remark || t("暂无备注", "No remark")}</p>
              </div>
            </div>
          )}
          <div className="border-t border-border pt-4 mt-4">
            <Button onClick={() => setIsDetailDialogOpen(false)}>{t("关闭", "Close")}</Button>
          </div>
      </DrawerDetail>
    </div>
  );
}
