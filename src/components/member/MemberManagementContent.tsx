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
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination } from "@/components/ui/mobile-data-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useMembers, Member } from "@/hooks/useMembers";
import { logOperation } from "@/stores/auditLogStore";
import { getCurrencyBadgeColor, normalizeCurrencyCode } from "@/config/currencies";
import { useCustomerSources } from "@/stores/customerSourceStore";
import { useCards } from "@/hooks/useMerchantConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDisplayPhone } from "@/lib/phoneMask";
import { useAuditWorkflow } from "@/hooks/useAuditWorkflow";
import { useModulePermissions } from "@/hooks/useFieldPermissions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TablePagination } from "@/components/ui/table-pagination";
import { ChevronDown } from "lucide-react";

// 会员等级选项 - 包含默认值和 A/B/C/D 等级
const memberLevels = ["普通会员", "A", "B", "C", "D"];

interface MemberManagementContentProps {
  searchTerm?: string;
}

export default function MemberManagementContent({ searchTerm: externalSearchTerm = "" }: MemberManagementContentProps) {
  // Performance tracking
  trackRender('MemberManagementContent');
  
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const { isAdmin, employee } = useAuth();
  const { members, loading, updateMember, deleteMember, refetch } = useMembers();
  const { sources: customerSources } = useCustomerSources();
  const { submitBatchForApproval, checkCanEditDirectly, currentEmployee } = useAuditWorkflow();
  const { activeCards } = useCards();
  
  // 获取会员管理模块的所有字段权限
  const { permissions: fieldPerms, canViewField, canEditField, canDeleteField, currentRole } = useModulePermissions('members');
  
  // 检查当前用户是否有任何字段需要审核
  const [hasAnyFieldNeedingApproval, setHasAnyFieldNeedingApproval] = useState(false);
  
  useEffect(() => {
    const checkApprovalNeeded = async () => {
      // 检查主要可编辑字段是否需要审核
      const fieldsToCheck = ['member_level', 'remark', 'common_cards', 'bank_card', 'currency_preferences', 'source'];
      for (const field of fieldsToCheck) {
        const canEdit = await checkCanEditDirectly('member', field);
        if (!canEdit) {
          setHasAnyFieldNeedingApproval(true);
          return;
        }
      }
      setHasAnyFieldNeedingApproval(false);
    };
    checkApprovalNeeded();
  }, [checkCanEditDirectly, currentRole]);
  
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  
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
        member.phoneNumber.toLowerCase().includes(search) ||
        member.memberCode.toLowerCase().includes(search) ||
        (member.remark ?? '').toLowerCase().includes(search) ||
        (member.commonCards?.join(",") || "").toLowerCase().includes(search)
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

  const handleEdit = (member: Member) => {
    setEditingMember({ ...member });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (editingMember) {
      const originalMember = members.find(m => m.id === editingMember.id);
      
      // 检测哪些字段发生了变化
      const changes: { fieldKey: string; oldValue: any; newValue: any }[] = [];
      
      if (originalMember?.level !== editingMember.level) {
        changes.push({ fieldKey: 'level', oldValue: originalMember?.level, newValue: editingMember.level });
      }
      if (originalMember?.remark !== editingMember.remark) {
        changes.push({ fieldKey: 'remark', oldValue: originalMember?.remark, newValue: editingMember.remark });
      }
      if (originalMember?.customerFeature !== editingMember.customerFeature) {
        changes.push({ fieldKey: 'customerFeature', oldValue: originalMember?.customerFeature, newValue: editingMember.customerFeature });
      }
      if (JSON.stringify(originalMember?.commonCards) !== JSON.stringify(editingMember.commonCards)) {
        changes.push({ fieldKey: 'commonCards', oldValue: originalMember?.commonCards, newValue: editingMember.commonCards });
      }
      if (originalMember?.bankCard !== editingMember.bankCard) {
        changes.push({ fieldKey: 'bankCard', oldValue: originalMember?.bankCard, newValue: editingMember.bankCard });
      }
      if (JSON.stringify(originalMember?.preferredCurrency) !== JSON.stringify(editingMember.preferredCurrency)) {
        changes.push({ fieldKey: 'preferredCurrency', oldValue: originalMember?.preferredCurrency, newValue: editingMember.preferredCurrency });
      }
      if (originalMember?.sourceId !== editingMember.sourceId) {
        changes.push({ fieldKey: 'sourceId', oldValue: originalMember?.sourceId, newValue: editingMember.sourceId });
      }

      if (changes.length === 0) {
        toast.info("没有修改任何内容");
        setIsEditDialogOpen(false);
        return;
      }

      // 管理员直接编辑，不需要审核
      if (isAdmin) {
        const result = await updateMember(editingMember.id, {
          level: editingMember.level,
          remark: editingMember.remark,
          customerFeature: editingMember.customerFeature,
          commonCards: editingMember.commonCards,
          bankCard: editingMember.bankCard,
          preferredCurrency: editingMember.preferredCurrency,
          sourceId: editingMember.sourceId,
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
          
          toast.success("会员信息已更新");
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
            if (field === 'level') directUpdate.level = editingMember.level;
            if (field === 'remark') directUpdate.remark = editingMember.remark;
            if (field === 'customerFeature') directUpdate.customerFeature = editingMember.customerFeature;
            if (field === 'commonCards') directUpdate.commonCards = editingMember.commonCards;
            if (field === 'bankCard') directUpdate.bankCard = editingMember.bankCard;
            if (field === 'preferredCurrency') directUpdate.preferredCurrency = editingMember.preferredCurrency;
            if (field === 'sourceId') directUpdate.sourceId = editingMember.sourceId;
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
        level: editingMember.level,
        remark: editingMember.remark,
        customerFeature: editingMember.customerFeature,
        commonCards: editingMember.commonCards,
        bankCard: editingMember.bankCard,
        preferredCurrency: editingMember.preferredCurrency,
        sourceId: editingMember.sourceId,
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
        return "bg-slate-100 text-slate-600 border-slate-200";
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  // 格式化等级显示 - A/B/C/D 后加"级"，普通会员保持原样
  const formatLevelDisplay = (level: string) => {
    if (["A", "B", "C", "D"].includes(level)) {
      return `${level}级`;
    }
    return level || "普通会员";
  };

  const activeCustomerSources = customerSources.filter(s => s.isActive);

  if (loading) {
    return <TablePageSkeleton columns={6} rows={5} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4">
          {isMobile ? (
            <>
              <MobileCardList>
                {paginatedMembers.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">
                    {filteredMembers.length === 0 
                      ? t("暂无会员数据", "No members yet")
                      : t("当前页无数据", "No data on this page")}
                  </p>
                ) : paginatedMembers.map((member) => (
                  <MobileCard key={member.id}>
                    <MobileCardHeader>
                      <span className="font-medium text-sm font-mono">{getDisplayPhone(member.phoneNumber, isAdmin)}</span>
                      {canViewField('member_level') && (
                        <Badge className={getLevelBadgeColor(member.level)}>
                          {formatLevelDisplay(member.level)}
                        </Badge>
                      )}
                    </MobileCardHeader>
                    {canViewField('member_code') && (
                      <MobileCardRow label={t("会员编号", "Code")} value={
                        <Badge variant="outline" className="font-mono text-xs">{member.memberCode}</Badge>
                      } />
                    )}
                    {canViewField('currency_preferences') && member.preferredCurrency.length > 0 && (
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
                      <MobileCardRow label={t("添加时间", "Created")} value={member.createdAt ? new Date(member.createdAt).toLocaleDateString('zh-CN') : '-'} />
                    </MobileCardCollapsible>
                    <MobileCardActions>
                      <Button size="sm" variant="outline" className="flex-1 h-9" onClick={() => handleEdit(member)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />{t("编辑", "Edit")}
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
          <StickyScrollTableContainer minWidth="1400px">
            <Table className="text-sm">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  {canViewField('phone_number') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("手机号", "Phone")}</TableHead>}
                  {canViewField('member_code') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("会员编号", "Member Code")}</TableHead>}
                  {canViewField('referrer') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("推荐人", "Referrer")}</TableHead>}
                  {canViewField('member_level') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("等级", "Level")}</TableHead>}
                  {canViewField('common_cards') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("常交易卡", "Common Cards")}</TableHead>}
                  {canViewField('currency_preferences') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("币种偏好", "Currency Pref.")}</TableHead>}
                  {canViewField('bank_card') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("银行卡", "Bank Card")}</TableHead>}
                  {canViewField('customer_feature') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("客户特点", "Feature")}</TableHead>}
                  {canViewField('source') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("来源", "Source")}</TableHead>}
                  {canViewField('remark') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("备注", "Remark")}</TableHead>}
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("添加时间", "Created")}</TableHead>
                  {canViewField('recorder') && <TableHead className="text-center whitespace-nowrap px-1.5">{t("录入人", "Recorder")}</TableHead>}
                  <TableHead className="text-center whitespace-nowrap px-1.5 w-[100px] sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
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
                      {canViewField('referrer') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5">
                          {member.referrerPhone ? (
                            <span className={`text-xs font-mono ${members.some(m => m.phoneNumber === member.referrerPhone) ? 'text-muted-foreground' : 'text-destructive'}`}>
                              {getDisplayPhone(member.referrerPhone, isAdmin)}
                              {!members.some(m => m.phoneNumber === member.referrerPhone) && ' ⚠'}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      {canViewField('member_level') && (
                        <TableCell className="text-center whitespace-nowrap px-1.5">
                          <Badge className={getLevelBadgeColor(member.level)}>
                            {formatLevelDisplay(member.level)}
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
                            {member.preferredCurrency.map((currency) => (
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
                      <TableCell className="text-sm text-muted-foreground text-center">
                        {member.createdAt ? new Date(member.createdAt).toLocaleString('zh-CN') : '-'}
                      </TableCell>
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

      {/* 编辑会员对话框 - 横向布局 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("编辑会员信息", "Edit Member")}</DialogTitle>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-3 py-4">
              {/* 只读字段 - 手机号、会员编号 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t("手机号", "Phone")}</Label>
                  {/* 编辑时显示与报表一致的格式（根据权限脱敏） */}
                  <Input value={getDisplayPhone(editingMember.phoneNumber, isAdmin)} disabled className="bg-muted flex-1" />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t("会员编号", "Code")}</Label>
                  <Input value={editingMember.memberCode} disabled className="bg-muted flex-1" />
                </div>
              </div>

              {/* 等级、常交易卡 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t("等级", "Level")}</Label>
                  <Select
                    value={editingMember.level}
                    onValueChange={(value) =>
                      setEditingMember({ ...editingMember, level: value })
                    }
                    disabled={!canEditField('member_level')}
                  >
                    <SelectTrigger className={`flex-1 ${!canEditField('member_level') ? 'bg-muted' : ''}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {memberLevels.map((level) => (
                        <SelectItem key={level} value={level}>
                          {formatLevelDisplay(level)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t("常交易卡", "Cards")}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`flex-1 justify-between h-10 font-normal ${!canEditField('common_cards') ? 'bg-muted pointer-events-none' : ''}`}
                        disabled={!canEditField('common_cards')}
                      >
                        <span className="truncate text-left">
                          {editingMember.commonCards && editingMember.commonCards.length > 0
                            ? editingMember.commonCards.join(", ")
                            : t("请选择常交易卡", "Select cards")}
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
                                if (!canEditField('common_cards')) return;
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
                  <Label className="w-20 text-right shrink-0">{t("银行卡", "Bank Card")}</Label>
                  <Input
                    value={editingMember.bankCard || ""}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, bankCard: e.target.value })
                    }
                    placeholder={t("例如: 8027489826 opay", "e.g. 8027489826 opay")}
                    className="flex-1"
                    disabled={!canEditField('bank_card')}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t("币种偏好", "Currency")}</Label>
                  <div className="flex gap-1 flex-wrap flex-1">
                    {editingMember.preferredCurrency.length > 0 ? 
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
                  <Label className="w-20 text-right shrink-0">{t("客户特点", "Feature")}</Label>
                  <Input
                    value={editingMember.customerFeature || ""}
                    onChange={(e) =>
                      setEditingMember({ ...editingMember, customerFeature: e.target.value })
                    }
                    placeholder={t("请输入客户特点", "Enter feature")}
                    className="flex-1"
                    disabled={!canEditField('customer_feature')}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t("来源", "Source")}</Label>
                  <Select
                    value={editingMember.sourceChannel || ""}
                    onValueChange={(value) =>
                      setEditingMember({ ...editingMember, sourceChannel: value })
                    }
                    disabled={!canEditField('source')}
                  >
                    <SelectTrigger className={`flex-1 ${!canEditField('source') ? 'bg-muted' : ''}`}>
                      <SelectValue placeholder={t("请选择来源", "Select source")} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeCustomerSources.map((source) => (
                        <SelectItem key={source.id} value={source.name}>
                          {source.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 备注 */}
              <div className="flex items-start gap-3">
                <Label className="w-20 text-right shrink-0 pt-2">{t("备注", "Remark")}</Label>
                <Textarea
                  value={editingMember.remark}
                  onChange={(e) =>
                    setEditingMember({ ...editingMember, remark: e.target.value })
                  }
                  placeholder={t("请输入备注", "Enter remark")}
                  className="resize-none flex-1"
                  rows={2}
                  disabled={!canEditField('remark')}
                />
              </div>

              {/* 推荐人、录入人 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{t("推荐人", "Referrer")}</Label>
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
                  <Label className="w-20 text-right shrink-0">{t("录入人", "Recorder")}</Label>
                  {/* 显示创建者姓名，如果没有则显示"-" */}
                  <Input
                    value={editingMember.recorder || "-"}
                    disabled
                    className="bg-muted flex-1"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t("取消", "Cancel")}
            </Button>
            {/* 根据权限显示不同按钮 */}
            {hasAnyFieldNeedingApproval ? (
              <Button 
                onClick={handleSaveEdit}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                {t("提交审核", "Submit for Review")}
              </Button>
            ) : (
              <Button onClick={handleSaveEdit}>
                {t("确认修改", "Confirm")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 备注详情对话框 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("备注详情", "Remark Details")}</DialogTitle>
          </DialogHeader>
          {detailMember && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t("会员编号", "Code")}: {detailMember.memberCode}</span>
                <span>|</span>
                <span>{t("手机号", "Phone")}: {detailMember.phoneNumber}</span>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="whitespace-pre-wrap">{detailMember.remark || t("暂无备注", "No remark")}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailDialogOpen(false)}>{t("关闭", "Close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
