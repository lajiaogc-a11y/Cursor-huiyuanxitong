import { useState, useEffect, useMemo } from "react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, RefreshCw, Users, Pencil, Trash2, ChevronDown, Upload, Download, KeyRound } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination } from "@/components/ui/mobile-data-card";
import { exportTableToCSV } from "@/services/dataExportImportService";
import { toast } from "sonner";
import { useMembers, Member } from "@/hooks/useMembers";
import { logOperation } from "@/stores/auditLogStore";
import { getCurrencyBadgeColor, normalizeCurrencyCode, CURRENCIES } from "@/config/currencies";
import { useCustomerSources } from "@/stores/customerSourceStore";
import { getActiveCards, CardItem } from "@/stores/merchantConfigStore";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayPhone } from "@/lib/phoneMask";
import { supabase } from "@/integrations/supabase/client";

const memberLevels = ["A", "B", "C", "D"];

export default function MemberManagement() {
  // Performance tracking
  trackRender('MemberManagement');
  
  const { t, tr, formatDate } = useLanguage();
  const { isAdmin } = useAuth();
  const isMobile = useIsMobile();
  const { members, loading, updateMember, deleteMember, refetch } = useMembers();
  const { activeSources: customerSources } = useCustomerSources();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState("");
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [detailMember, setDetailMember] = useState<Member | null>(null);
  const [setPasswordMember, setSetPasswordMember] = useState<Member | null>(null);
  const [setPasswordValue, setSetPasswordValue] = useState("");
  const [setPasswordLoading, setSetPasswordLoading] = useState(false);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pageSizeOptions = [10, 20, 50, 100];

  const handleRefresh = async () => {
    await refetch();
    toast.success(tr('members.listRefreshed'));
  };

  // 排序后的会员列表（按创建时间倒序）
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [members]);

  // 筛选后的会员
  const filteredMembers = useMemo(() => {
    return sortedMembers.filter(
      (member) =>
        member.phoneNumber.includes(searchTerm) ||
        member.memberCode.includes(searchTerm) ||
        (member.remark ?? '').includes(searchTerm) ||
        (member.commonCards?.join(",") || "").includes(searchTerm)
    );
  }, [sortedMembers, searchTerm]);
  
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
  }, [searchTerm, pageSize]);

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
        
        toast.success(tr('members.updateSuccess'));
        setIsEditDialogOpen(false);
        setEditingMember(null);
      }
    }
  };

  const handleDelete = async (memberId: string) => {
    const success = await deleteMember(memberId);
    if (success) {
      toast.success(tr('members.deleteSuccess'));
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

  const handleSetPasswordSubmit = async () => {
    if (!setPasswordMember) return;
    const pwd = setPasswordValue.trim();
    if (pwd.length < 6) {
      toast.error(t("密码至少6位", "Password must be at least 6 characters"));
      return;
    }
    setSetPasswordLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_set_member_initial_password", {
        p_member_id: setPasswordMember.id,
        p_new_password: pwd,
      });
      if (error) {
        toast.error(t("设置失败", "Set failed") + ": " + error.message);
        return;
      }
      const result = data as { success?: boolean; error?: string } | null;
      if (result?.success) {
        toast.success(t("密码已设置", "Password set successfully"));
        setSetPasswordMember(null);
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
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className="pb-4 shrink-0">
          <div className={isMobile ? "space-y-3" : "flex items-center justify-between"}>
            {!isMobile && (
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                {tr('members.title')}
              </CardTitle>
            )}
            <div className={isMobile ? "flex flex-col gap-2" : "flex items-center gap-3"}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={tr('members.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSearchError("");
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '');
                    setSearchTerm(pasted);
                    setSearchError("");
                  }}
                  className={`pl-9 ${isMobile ? 'w-full' : 'w-64'} ${searchError ? 'border-destructive' : ''}`}
                />
                {searchError && <span className="text-xs text-destructive whitespace-nowrap">{searchError}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <TableImportButton tableName="members" onImportComplete={refetch} />
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={() => exportTableToCSV('members', false)}>
                    <Download className="h-4 w-4" />
                    {!isMobile && <span className="ml-1">{t('导出', 'Export')}</span>}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 flex flex-col p-4">
          <div className="text-sm text-muted-foreground mb-3 p-3 bg-muted/30 rounded-lg shrink-0">
            💡 {tr('members.memberTip')}
          </div>
          <div className="flex-1 min-h-0">
            {isMobile ? (
              <MobileCardList>
                {paginatedMembers.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">
                    {filteredMembers.length === 0 ? tr('members.noMembers') : tr('members.currentPageEmpty')}
                  </p>
                ) : paginatedMembers.map((member) => (
                  <MobileCard key={member.id}>
                    <MobileCardHeader>
                      <span className="font-medium text-sm">{getDisplayPhone(member.phoneNumber, isAdmin)}</span>
                      <Badge className={getLevelBadgeColor(member.level)}>
                        {member.level}{t('级', '')}
                      </Badge>
                    </MobileCardHeader>
                    <MobileCardRow label={tr('members.memberCode')} value={<Badge variant="outline" className="font-mono">{member.memberCode}</Badge>} />
                    <MobileCardRow label={tr('members.commonCards')} value={
                      member.commonCards && member.commonCards.length > 0
                        ? <div className="flex gap-1 flex-wrap justify-end">{member.commonCards.map(c => <Badge key={c} variant="outline" className="bg-purple-100 text-purple-700 border-purple-200 text-xs">{c}</Badge>)}</div>
                        : "-"
                    } />
                    <MobileCardCollapsible>
                      <MobileCardRow label={tr('members.referrer')} value={member.referrerPhone ? getDisplayPhone(member.referrerPhone, isAdmin) : "-"} />
                      <MobileCardRow label={tr('members.bankCard')} value={member.bankCard || "-"} />
                      <MobileCardRow label={tr('members.feature')} value={member.customerFeature || "-"} />
                      <MobileCardRow label={t('备注', 'Remark')} value={member.remark || "-"} />
                    </MobileCardCollapsible>
                    <MobileCardActions>
                      <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => handleEdit(member)}>
                        <Pencil className="h-3 w-3 mr-1" />{t('编辑', 'Edit')}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => handleOpenSetPassword(member)} title={t('设置密码', 'Set Password')}>
                        <KeyRound className="h-3 w-3" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive/30"><Trash2 className="h-3 w-3" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>{tr('members.confirmDelete')}</AlertDialogTitle><AlertDialogDescription>{tr('members.deleteWarning')}</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(member.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('删除', 'Delete')}</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </MobileCardActions>
                  </MobileCard>
                ))}
                <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredMembers.length} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} />
              </MobileCardList>
            ) : (
            <StickyScrollTableContainer>
              <Table className="text-sm">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                  <TableHead className="text-center">{tr('members.phone')}</TableHead>
                  <TableHead className="text-center">{tr('members.memberCode')}</TableHead>
                  <TableHead className="text-center">{tr('members.referrer')}</TableHead>
                  <TableHead className="text-center">{tr('members.level')}</TableHead>
                  <TableHead className="text-center">{tr('members.commonCards')}</TableHead>
                  <TableHead className="text-center">{tr('members.currencyPreference')}</TableHead>
                  <TableHead className="text-center">{tr('members.bankCard')}</TableHead>
                  <TableHead className="text-center">{tr('members.feature')}</TableHead>
                  <TableHead className="text-center">{tr('members.source')}</TableHead>
                  <TableHead className="text-center">{t('备注', 'Remark')}</TableHead>
                  <TableHead className="text-center">{t('添加时间', 'Created At')}</TableHead>
                  <TableHead className="text-center">{tr('members.recorder')}</TableHead>
                  <TableHead className="text-center w-[100px]">{t('操作', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      {filteredMembers.length === 0 
                        ? tr('members.noMembers')
                        : tr('members.currentPageEmpty')}
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
                      <TableCell className="text-center">
                        {member.referrerPhone ? (
                          <div className="flex flex-col gap-0.5 items-center">
                            <span className="text-xs text-muted-foreground font-mono">{getDisplayPhone(member.referrerPhone, isAdmin)}</span>
                            {member.referrerMemberCode && (
                              <Badge variant="outline" className="text-xs w-fit">
                                {member.referrerMemberCode}
                              </Badge>
                            )}
                          </div>
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
                        {member.createdAt ? formatDate(member.createdAt) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground text-center">
                        {member.recorder || "-"}
                      </TableCell>
                      <TableCell>
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
                            title={t('设置密码', 'Set Password')}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
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
                                <AlertDialogTitle>{tr('members.confirmDelete')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {tr('members.deleteWarning')}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(member.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t('删除', 'Delete')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
           </StickyScrollTableContainer>
            )}
          </div>
          
          {/* 分页控件 - 仅桌面端显示（移动端已有 MobilePagination） */}
          {!isMobile && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t shrink-0">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{tr('members.total')} {filteredMembers.length} {tr('members.items')}</span>
              <span>|</span>
              <span>{tr('members.perPage')}</span>
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

      {/* 编辑会员对话框 - 横向布局 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('members.editMember')}</DialogTitle>
          </DialogHeader>
          {editingMember && (
            <div className="space-y-3 py-4">
              {/* 只读字段 - 手机号、会员编号 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{tr('members.phone')}</Label>
                  <Input value={editingMember.phoneNumber} disabled className="bg-muted flex-1" />
                </div>
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{tr('members.memberCode')}</Label>
                  <Input value={editingMember.memberCode} disabled className="bg-muted flex-1" />
                </div>
              </div>

              {/* 等级、常交易卡 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <Label className="w-20 text-right shrink-0">{tr('members.level')}</Label>
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
                  <Label className="w-20 text-right shrink-0">{tr('members.commonCards')}</Label>
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
                  <Label className="w-20 text-right shrink-0">{tr('members.bankCard')}</Label>
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
                  <Label className="w-20 text-right shrink-0">{tr('members.currencyPreference')}</Label>
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
                  <Label className="w-20 text-right shrink-0">{tr('members.feature')}</Label>
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
                  <Label className="w-20 text-right shrink-0">{tr('members.source')}</Label>
                  <Select
                    value={editingMember.sourceId || ""}
                    onValueChange={(value) =>
                      setEditingMember({ ...editingMember, sourceId: value, sourceChannel: customerSources.find(s => s.id === value)?.name || "" })
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={tr('members.selectSource')} />
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
                  <Label className="w-20 text-right shrink-0">{tr('members.referrer')}</Label>
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
                  <Label className="w-20 text-right shrink-0">{tr('members.recorder')}</Label>
                  <Input
                    value={editingMember.recorder}
                    disabled
                    className="bg-muted flex-1"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button onClick={handleSaveEdit}>
              {isAdmin ? t("确认修改", "Confirm Edit") : t("提交审核", "Submit for Review")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 设置密码对话框 */}
      <Dialog open={!!setPasswordMember} onOpenChange={(open) => !open && setSetPasswordMember(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('设置密码', 'Set Password')}</DialogTitle>
          </DialogHeader>
          {setPasswordMember && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-muted-foreground">
                {t('为会员', 'For member')} {getDisplayPhone(setPasswordMember.phoneNumber, isAdmin)} ({setPasswordMember.memberCode}) {t('设置初始密码', 'set initial password')}
              </p>
              <div className="space-y-2">
                <Label>{t('新密码', 'New password')}</Label>
                <Input
                  type="password"
                  value={setPasswordValue}
                  onChange={(e) => setSetPasswordValue(e.target.value)}
                  placeholder={t('至少6位', 'At least 6 characters')}
                  minLength={6}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetPasswordMember(null)} disabled={setPasswordLoading}>
              {t('取消', 'Cancel')}
            </Button>
            <Button onClick={handleSetPasswordSubmit} disabled={setPasswordLoading || (setPasswordValue.trim().length < 6)}>
              {setPasswordLoading ? t('设置中...', 'Setting...') : t('确认设置', 'Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 备注详情对话框 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('备注详情', 'Remark Details')}</DialogTitle>
          </DialogHeader>
          {detailMember && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{tr('members.memberCode')}: {detailMember.memberCode}</span>
                <span>|</span>
                <span>{tr('members.phone')}: {detailMember.phoneNumber}</span>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="whitespace-pre-wrap">{detailMember.remark || t("暂无备注", "No remark")}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailDialogOpen(false)}>{t('关闭', 'Close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
