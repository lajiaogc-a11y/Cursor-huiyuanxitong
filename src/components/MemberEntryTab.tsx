// ============= 新增会员 Tab 组件 =============
// 智能会员识别与编辑：支持自动检测会员、填充数据、创建/更新分支
// 操作日志记录所有创建和更新操作

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, RefreshCw, Copy, Check, Loader2, UserCheck, UserX, Search } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMembers, Member } from "@/hooks/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { useMemberEntryFormPersistence, generateMemberCode } from "@/hooks/useMemberEntryFormPersistence";
import { supabase } from "@/integrations/supabase/client";
import { logOperation } from "@/stores/auditLogStore";

// 会员等级选项
const memberLevels = ["A", "B", "C", "D"];

// 币种偏好选项
const currencyOptions = [
  { value: "NGN", label: "NGN" },
  { value: "GHS", label: "GHS" },
  { value: "USDT", label: "USDT" },
];

// 会员状态类型
type MemberStatus = 'empty' | 'checking' | 'exists' | 'new';

export default function MemberEntryTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { addMember, updateMember, findMemberByPhone, members } = useMembers();
  
  // 使用持久化表单 Hook
  const {
    formData,
    updateField,
    setFormData,
    refreshMemberCode,
    clearForm,
    clearFieldsExceptPhone,
    isLoading: isFormLoading,
  } = useMemberEntryFormPersistence();
  
  // 会员状态检测
  const [memberStatus, setMemberStatus] = useState<MemberStatus>('empty');
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null);
  const [existingMemberData, setExistingMemberData] = useState<Member | null>(null);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // 卡片列表（从数据库获取）
  const [cardsList, setCardsList] = useState<{ id: string; name: string }[]>([]);
  // 客户来源列表
  const [customerSources, setCustomerSources] = useState<{ id: string; name: string }[]>([]);
  
  // 表单状态
  const [phoneError, setPhoneError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // 加载卡片列表
  useEffect(() => {
    const fetchCards = async () => {
      const { data, error } = await supabase
        .from('cards')
        .select('id, name, sort_order')
        .eq('status', 'active')
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      
      if (!error && data) {
        setCardsList(data.map(card => ({ id: card.id, name: card.name })));
      }
    };
    fetchCards();
  }, []);
  
  // 加载客户来源
  useEffect(() => {
    const fetchSources = async () => {
      const { data, error } = await supabase
        .from('customer_sources')
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      
      if (!error && data) {
        setCustomerSources(data.map(s => ({ id: s.id, name: s.name })));
      }
    };
    fetchSources();
  }, []);
  
  // 检查会员是否存在
  const checkMemberExists = useCallback((phone: string) => {
    if (!phone || phone.length < 8) {
      setMemberStatus('empty');
      setExistingMemberId(null);
      setExistingMemberData(null);
      return;
    }
    
    const member = findMemberByPhone(phone);
    if (member) {
      setMemberStatus('exists');
      setExistingMemberId(member.id);
      setExistingMemberData(member);
      // 自动填充会员数据
      setFormData({
        memberCode: member.memberCode,
        bankCard: member.bankCard || '',
        preferredCurrency: member.preferredCurrency || [],
        selectedCommonCards: member.commonCards || [],
        memberLevel: member.level || 'D',
        customerSource: member.sourceId || '',
        customerFeature: member.customerFeature || '',
        remark: member.remark || '',
      });
    } else {
      setMemberStatus('new');
      setExistingMemberId(null);
      setExistingMemberData(null);
      // 生成新会员编号
      if (!formData.memberCode) {
        const newCode = generateMemberCode();
        updateField('memberCode', newCode);
      }
    }
  }, [findMemberByPhone, setFormData, formData.memberCode, updateField]);
  
  // 初始化时检查持久化数据中的电话号码
  useEffect(() => {
    if (!isFormLoading && formData.phoneNumber && formData.phoneNumber.length >= 8) {
      checkMemberExists(formData.phoneNumber);
    }
  }, [isFormLoading]); // 只在加载完成后执行一次
  
  // 当 members 列表更新时，重新检查当前电话号码（防止数据变化后状态不一致）
  useEffect(() => {
    if (formData.phoneNumber && formData.phoneNumber.length >= 8 && memberStatus !== 'checking') {
      const member = findMemberByPhone(formData.phoneNumber);
      if (member && memberStatus === 'new') {
        // 会员刚被创建，更新状态
        setMemberStatus('exists');
        setExistingMemberId(member.id);
        setExistingMemberData(member);
      } else if (!member && memberStatus === 'exists') {
        // 会员被删除
        setMemberStatus('new');
        setExistingMemberId(null);
        setExistingMemberData(null);
      }
    }
  }, [members, formData.phoneNumber, memberStatus, findMemberByPhone]);
  
  // 处理电话号码输入（防抖查询）
  const handlePhoneChange = (value: string) => {
    const cleaned = cleanPhoneNumber(value);
    const limited = cleaned.slice(0, 18);
    updateField('phoneNumber', limited);
    
    // 验证格式
    const validation = validatePhoneLength(limited);
    setPhoneError(validation.valid ? "" : validation.message);
    
    // 清空时重置所有状态
    if (!limited) {
      setMemberStatus('empty');
      setExistingMemberId(null);
      setExistingMemberData(null);
      clearFieldsExceptPhone();
      return;
    }
    
    // 长度不足时不查询
    if (limited.length < 8) {
      setMemberStatus('empty');
      setExistingMemberId(null);
      setExistingMemberData(null);
      return;
    }
    
    // 防抖查询（500ms）
    setMemberStatus('checking');
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    checkTimeoutRef.current = setTimeout(() => {
      checkMemberExists(limited);
    }, 500);
  };
  
  // 处理常交易卡选择（多选）
  const handleCardSelect = (cardName: string) => {
    const current = formData.selectedCommonCards;
    if (current.includes(cardName)) {
      updateField('selectedCommonCards', current.filter(c => c !== cardName));
    } else {
      updateField('selectedCommonCards', [...current, cardName]);
    }
  };
  
  // 处理币种偏好选择
  const handleCurrencyToggle = (currency: string) => {
    const current = formData.preferredCurrency;
    if (current.includes(currency)) {
      updateField('preferredCurrency', current.filter(c => c !== currency));
    } else {
      updateField('preferredCurrency', [...current, currency]);
    }
  };
  
  // 复制会员编号
  const handleCopyMemberCode = () => {
    if (!formData.memberCode) return;
    navigator.clipboard.writeText(formData.memberCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t("会员编号已复制", "Member code copied"));
  };
  
  // 验证表单
  const validateForm = (): boolean => {
    // 电话号码必填
    if (!formData.phoneNumber.trim()) {
      toast.error(t("请输入电话号码", "Please enter phone number"));
      return false;
    }
    
    // 电话号码格式验证
    const phoneValidation = validatePhoneLength(formData.phoneNumber);
    if (!phoneValidation.valid) {
      toast.error(phoneValidation.message);
      return false;
    }
    
    // 来源必填
    if (!formData.customerSource) {
      toast.error(t("请选择会员来源", "Please select member source"));
      return false;
    }
    
    return true;
  };
  
  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    
    try {
      // 获取来源名称用于日志
      const sourceName = customerSources.find(s => s.id === formData.customerSource)?.name || '';
      
      if (memberStatus === 'exists' && existingMemberId && existingMemberData) {
        // ========== 更新已有会员 ==========
        const updates = {
          bankCard: formData.bankCard.trim(),
          preferredCurrency: formData.preferredCurrency,
          commonCards: formData.selectedCommonCards,
          level: formData.memberLevel,
          sourceId: formData.customerSource,
          customerFeature: formData.customerFeature.trim(),
          remark: formData.remark.trim(),
        };
        
        // 获取更新前的来源名称
        const oldSourceName = customerSources.find(s => s.id === existingMemberData.sourceId)?.name || '';
        
        const updatedMember = await updateMember(existingMemberId, updates);
        
        if (updatedMember) {
          // 记录更新操作日志（包含前后对比）
          logOperation(
            'member_management',
            'update',
            existingMemberId,
            {
              phoneNumber: existingMemberData.phoneNumber,
              memberCode: existingMemberData.memberCode,
              bankCard: existingMemberData.bankCard || '',
              preferredCurrency: existingMemberData.preferredCurrency || [],
              commonCards: existingMemberData.commonCards || [],
              level: existingMemberData.level,
              source: oldSourceName,
              customerFeature: existingMemberData.customerFeature || '',
              remark: existingMemberData.remark || '',
            },
            {
              phoneNumber: updatedMember.phoneNumber,
              memberCode: updatedMember.memberCode,
              bankCard: updates.bankCard,
              preferredCurrency: updates.preferredCurrency,
              commonCards: updates.commonCards,
              level: updates.level,
              source: sourceName,
              customerFeature: updates.customerFeature,
              remark: updates.remark,
            },
            `更新会员: ${updatedMember.phoneNumber}`
          );
          
          toast.success(t("会员更新成功", "Member updated successfully"));
          clearForm();
          setMemberStatus('empty');
          setExistingMemberId(null);
          setExistingMemberData(null);
        }
      } else {
        // ========== 创建新会员 ==========
        const memberData = {
          phoneNumber: formData.phoneNumber.trim(),
          memberCode: formData.memberCode || generateMemberCode(),
          bankCard: formData.bankCard.trim(),
          preferredCurrency: formData.preferredCurrency,
          commonCards: formData.selectedCommonCards,
          level: formData.memberLevel,
          sourceId: formData.customerSource,
          customerFeature: formData.customerFeature.trim(),
          remark: formData.remark.trim(),
          recorder: employee?.real_name || '',
          recorderId: employee?.id || '',
          tradeFeature: formData.customerFeature.trim(),
          sourceChannel: '',
        };
        
        const newMember = await addMember(memberData);
        
        if (newMember) {
          // 记录创建操作日志
          logOperation(
            'member_management',
            'create',
            newMember.id,
            null,
            {
              phoneNumber: newMember.phoneNumber,
              memberCode: newMember.memberCode,
              bankCard: memberData.bankCard,
              preferredCurrency: memberData.preferredCurrency,
              commonCards: memberData.commonCards,
              level: memberData.level,
              source: sourceName,
              customerFeature: memberData.customerFeature,
              remark: memberData.remark,
              recorder: memberData.recorder,
            },
            `新增会员: ${newMember.phoneNumber}`
          );
          
          toast.success(t("会员创建成功", "Member created successfully"));
          clearForm();
          setMemberStatus('empty');
          setExistingMemberId(null);
          setExistingMemberData(null);
        }
      }
    } catch (error) {
      console.error('Failed to save member:', error);
      toast.error(t("保存会员失败", "Failed to save member"));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 重置表单
  const handleReset = () => {
    clearForm();
    setPhoneError("");
    setMemberStatus('empty');
    setExistingMemberId(null);
    setExistingMemberData(null);
    toast.success(t("表单已重置", "Form has been reset"));
  };
  
  // 渲染会员状态提示
  const renderMemberStatusBanner = () => {
    if (memberStatus === 'empty' || !formData.phoneNumber || formData.phoneNumber.length < 8) {
      return null;
    }
    
    if (memberStatus === 'checking') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border border-border">
          <Search className="h-4 w-4 animate-pulse text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {t("正在查询会员...", "Checking member...")}
          </span>
        </div>
      );
    }
    
    if (memberStatus === 'exists') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
          <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="text-sm text-green-700 dark:text-green-300">
            {t("已是会员", "Already a member")} - {t("会员编号", "Member Code")}: 
            <span className="font-mono font-semibold ml-1">{formData.memberCode}</span>
          </span>
        </div>
      );
    }
    
    if (memberStatus === 'new') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            {t("不是会员", "Not a member")} - {t("将创建新会员", "Will create new member")}
          </span>
        </div>
      );
    }
    
    return null;
  };
  
  if (isFormLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  const isExistingMember = memberStatus === 'exists';
  const canSubmit = memberStatus === 'exists' || memberStatus === 'new';
  
  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t("新增会员", "New Member")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 第一行：电话号码 + 会员编号 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 电话号码 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("电话号码", "Phone Number")} <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formData.phoneNumber}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder={t("输入电话号码（8-18位数字）", "Enter phone (8-18 digits)")}
                className={phoneError ? "border-destructive" : ""}
              />
              {phoneError && (
                <p className="text-xs text-destructive">{phoneError}</p>
              )}
            </div>
            
            {/* 会员编号 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("会员编号", "Member Code")}
                {!isExistingMember && formData.memberCode && (
                  <span className="text-muted-foreground text-xs ml-2">
                    ({t("自动生成", "Auto-generated")})
                  </span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={formData.memberCode}
                  readOnly
                  className="font-mono bg-muted/50"
                  placeholder={t("输入电话号码后显示", "Enter phone first")}
                />
                {/* 刷新按钮仅在新会员时显示 */}
                {memberStatus === 'new' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={refreshMemberCode}
                    title={t("重新生成", "Regenerate")}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                {/* 复制按钮始终显示（如果有编号） */}
                {formData.memberCode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyMemberCode}
                    title={t("复制", "Copy")}
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          {/* 会员状态提示 */}
          {renderMemberStatusBanner()}
          
          {/* 第二行：银行卡 + 币种偏好 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 银行卡 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("银行卡", "Bank Card")}
              </Label>
              <Input
                value={formData.bankCard}
                onChange={(e) => updateField('bankCard', e.target.value)}
                placeholder={t("卡号 银行", "Card number Bank")}
              />
            </div>
            
            {/* 币种偏好 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("币种偏好", "Currency Preference")}
              </Label>
              <div className="flex flex-wrap gap-4 pt-2">
                {currencyOptions.map((currency) => (
                  <div key={currency.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`currency-${currency.value}`}
                      checked={formData.preferredCurrency.includes(currency.value)}
                      onCheckedChange={() => handleCurrencyToggle(currency.value)}
                    />
                    <label
                      htmlFor={`currency-${currency.value}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {currency.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          {/* 第三行：常交易卡 + 会员等级 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 常交易卡 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("常交易卡", "Common Cards")}
              </Label>
              <Select
                value={formData.selectedCommonCards[formData.selectedCommonCards.length - 1] || ""}
                onValueChange={handleCardSelect}
              >
                <SelectTrigger>
                  <span className="truncate">
                    {formData.selectedCommonCards.length === 0
                      ? t("选择常交易卡", "Select cards")
                      : formData.selectedCommonCards.join("、")}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {cardsList.map((card) => (
                    <SelectItem
                      key={card.id}
                      value={card.name}
                      className={formData.selectedCommonCards.includes(card.name) ? "bg-primary/10" : ""}
                    >
                      {formData.selectedCommonCards.includes(card.name) ? "✓ " : ""}{card.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.selectedCommonCards.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {formData.selectedCommonCards.map((card) => (
                    <Badge
                      key={card}
                      variant="secondary"
                      className="cursor-pointer hover:bg-destructive/20"
                      onClick={() => handleCardSelect(card)}
                    >
                      {card} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            
            {/* 会员等级 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("会员等级", "Member Level")}
                <span className="text-muted-foreground text-xs ml-2">
                  ({t("默认D级", "Default D")})
                </span>
              </Label>
              <Select
                value={formData.memberLevel}
                onValueChange={(v) => updateField('memberLevel', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("选择等级", "Select level")} />
                </SelectTrigger>
                <SelectContent>
                  {memberLevels.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}{t("级", " Level")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* 第四行：来源 + 客户特点 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 来源 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("来源", "Source")} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.customerSource}
                onValueChange={(v) => updateField('customerSource', v)}
              >
                <SelectTrigger className={!formData.customerSource ? "text-muted-foreground" : ""}>
                  <SelectValue placeholder={t("选择来源", "Select source")}>
                    {customerSources.find(s => s.id === formData.customerSource)?.name || t("选择来源", "Select source")}
                  </SelectValue>
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
            
            {/* 客户特点 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("客户特点", "Customer Feature")}
              </Label>
              <Input
                value={formData.customerFeature}
                onChange={(e) => updateField('customerFeature', e.target.value)}
                placeholder={t("自由填写", "Free text")}
              />
            </div>
          </div>
          
          {/* 第五行：会员备注 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("会员备注", "Member Remark")}
            </Label>
            <Textarea
              value={formData.remark}
              onChange={(e) => updateField('remark', e.target.value.slice(0, 500))}
              placeholder={t("最多500字符", "Max 500 characters")}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">
              {formData.remark.length}/500
            </p>
          </div>
          
          {/* 提交按钮 */}
          <div className="flex justify-center gap-4 pt-4">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !canSubmit}
              className="min-w-[120px] gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("提交中...", "Submitting...")}
                </>
              ) : isExistingMember ? (
                <>
                  <UserCheck className="h-4 w-4" />
                  {t("更新会员", "Update Member")}
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  {t("创建会员", "Create Member")}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={isSubmitting}
              className="min-w-[120px]"
            >
              {t("重置", "Reset")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
