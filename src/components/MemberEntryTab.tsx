// ============= 新增会员 Tab 组件 =============
// 智能会员识别与编辑：支持自动检测会员、填充数据、创建/更新分支
// 操作日志记录所有创建和更新操作

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMembers, Member } from "@/hooks/members/useMembers";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { lookupMemberForReferral, type ApiMember } from "@/services/members/memberLookupService";
import {
  getMemberByPhoneForMyTenant,
  type MemberByPhone,
} from "@/services/members/memberLookupService";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { useMemberEntryFormPersistence, generateMemberCode } from "@/hooks/members/useMemberEntryFormPersistence";
import { findMemberByPhoneOrCode } from "@/lib/memberLookup";
import { logOperation } from "@/services/audit/auditLogService";
import { getCustomerSourcesApi } from "@/services/staff/staffDataService";
import { MEMBER_LEVELS } from "@/config/memberLevels";
import { mapDbMemberToMember } from "@/lib/mappers/memberMapper";

const memberLevels = [...MEMBER_LEVELS];

function apiMemberToMember(row: ApiMember): Member {
  return mapDbMemberToMember(row);
}

function memberByPhoneToMember(m: MemberByPhone): Member {
  return mapDbMemberToMember(m);
}

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
  const { viewingTenantId } = useTenantView() || {};
  const { addMember, updateMember, findMemberByPhone, members } = useMembers();

  const effectiveTenantId = useMemo(() => {
    if (employee?.is_platform_super_admin) {
      return viewingTenantId || employee?.tenant_id || null;
    }
    return viewingTenantId || employee?.tenant_id || null;
  }, [employee?.is_platform_super_admin, employee?.tenant_id, viewingTenantId]);
  
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

  const memberCodeRef = useRef("");
  memberCodeRef.current = formData.memberCode || "";
  
  // 会员状态检测
  const [memberStatus, setMemberStatus] = useState<MemberStatus>('empty');
  const [existingMemberId, setExistingMemberId] = useState<string | null>(null);
  const [existingMemberData, setExistingMemberData] = useState<Member | null>(null);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const phoneLookupGen = useRef(0);
  
  // 客户来源列表
  const [customerSources, setCustomerSources] = useState<{ id: string; name: string }[]>([]);
  
  // 表单状态
  const [phoneError, setPhoneError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // 加载客户来源
  useEffect(() => {
    const fetchSources = async () => {
      try {
        const data = await getCustomerSourcesApi();
        setCustomerSources(
          data
            .filter((source) => source.is_active)
            .map((source) => ({ id: source.id, name: source.name }))
        );
      } catch (error) {
        console.error('Failed to load customer sources:', error);
        setCustomerSources([]);
      }
    };
    fetchSources();
  }, []);
  
  /** 服务端 + 本地列表识别会员（多层回退，数字归一化匹配） */
  const checkMemberExists = useCallback(
    async (phone: string, gen: number) => {
      if (!phone || phone.length < 8) {
        setMemberStatus("empty");
        setExistingMemberId(null);
        setExistingMemberData(null);
        return;
      }

      setMemberStatus("checking");

      const applyExisting = (member: Member) => {
        if (gen !== phoneLookupGen.current) return;
        setMemberStatus("exists");
        setExistingMemberId(member.id);
        setExistingMemberData(member);
        setFormData({
          memberCode: member.memberCode,
          bankCard: member.bankCard || "",
          preferredCurrency: member.preferredCurrency || [],
          selectedCommonCards: member.commonCards || [],
          memberLevel: member.level || "D",
          customerSource: member.sourceId || "",
          customerFeature: member.customerFeature || "",
          remark: member.remark || "",
        });
      };

      try {
        // 1) customer-detail：与汇率页同源，且会按订单汇总常交易卡（sync_common_cards）
        try {
          const db = await getMemberByPhoneForMyTenant(phone, effectiveTenantId);
          if (gen !== phoneLookupGen.current) return;
          if (db) {
            applyExisting(memberByPhoneToMember(db));
            return;
          }
        } catch (err2) {
          console.warn("[MemberEntryTab] getMemberByPhoneForMyTenant failed:", err2);
        }

        // 2) 服务端 lookup（推荐录入同源，支持数字归一化匹配）
        if (effectiveTenantId) {
          try {
            const row = await lookupMemberForReferral(phone, effectiveTenantId);
            if (gen !== phoneLookupGen.current) return;
            if (row) {
              applyExisting(apiMemberToMember(row));
              return;
            }
          } catch (err1) {
            console.warn("[MemberEntryTab] lookupMemberForReferral failed:", err1);
          }
        }

        // 3) 本地精确匹配
        const local = findMemberByPhone(phone);
        if (gen !== phoneLookupGen.current) return;
        if (local) {
          applyExisting(local);
          return;
        }

        // 4) 本地数字归一化匹配（处理电话号码格式差异）
        if (members.length > 0) {
          const fuzzyLocal = findMemberByPhoneOrCode(members, phone);
          if (gen !== phoneLookupGen.current) return;
          if (fuzzyLocal) {
            applyExisting(fuzzyLocal);
            return;
          }
        }

        if (gen !== phoneLookupGen.current) return;
        setMemberStatus("new");
        setExistingMemberId(null);
        setExistingMemberData(null);
        if (!memberCodeRef.current.trim()) {
          updateField("memberCode", generateMemberCode());
        }
      } catch (e) {
        console.error("[MemberEntryTab] phone lookup failed:", e);
        if (gen === phoneLookupGen.current) {
          setMemberStatus("empty");
          setExistingMemberId(null);
          setExistingMemberData(null);
        }
      }
    },
    [effectiveTenantId, findMemberByPhone, members, setFormData, updateField],
  );
  
  // Stable ref for checkMemberExists to avoid re-triggering on members list changes
  const checkMemberExistsRef = useRef(checkMemberExists);
  checkMemberExistsRef.current = checkMemberExists;

  // 初始化或租户上下文就绪时：对持久化里已填的电话重新从服务端识别（仅在表单加载完成时运行一次）
  useEffect(() => {
    if (!isFormLoading && formData.phoneNumber && formData.phoneNumber.length >= 8) {
      phoneLookupGen.current += 1;
      const gen = phoneLookupGen.current;
      void checkMemberExistsRef.current(formData.phoneNumber, gen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once when form finishes loading
  }, [isFormLoading]);
  
  // 当 members 列表更新时，重新检查当前电话号码（防止数据变化后状态不一致）
  useEffect(() => {
    if (formData.phoneNumber && formData.phoneNumber.length >= 8 && memberStatus !== 'checking') {
      const member = findMemberByPhone(formData.phoneNumber)
        || findMemberByPhoneOrCode(members, formData.phoneNumber);
      if (member && memberStatus === 'new') {
        setMemberStatus('exists');
        setExistingMemberId(member.id);
        setExistingMemberData(member);
      } else if (!member && memberStatus === 'exists') {
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
    if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    phoneLookupGen.current += 1;
    const gen = phoneLookupGen.current;
    checkTimeoutRef.current = setTimeout(() => {
      void checkMemberExists(limited, gen);
    }, 500);
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
    notify.success(t("会员编号已复制", "Member code copied"));
  };
  
  // 验证表单
  const validateForm = (): boolean => {
    // 电话号码必填
    if (!formData.phoneNumber.trim()) {
      notify.error(t("请输入电话号码", "Please enter phone number"));
      return false;
    }
    
    // 电话号码格式验证
    const phoneValidation = validatePhoneLength(formData.phoneNumber);
    if (!phoneValidation.valid) {
      notify.error(phoneValidation.message);
      return false;
    }
    
    // 来源必填
    if (!formData.customerSource) {
      notify.error(t("请选择会员来源", "Please select member source"));
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
              commonCards: updatedMember.commonCards || [],
              level: updates.level,
              source: sourceName,
              customerFeature: updates.customerFeature,
              remark: updates.remark,
            },
            `更新会员: ${updatedMember.phoneNumber}`
          );
          
          notify.success(t("会员更新成功", "Member updated successfully"));
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
              commonCards: newMember.commonCards || [],
              level: memberData.level,
              source: sourceName,
              customerFeature: memberData.customerFeature,
              remark: memberData.remark,
              recorder: memberData.recorder,
            },
            `新增会员: ${newMember.phoneNumber}`
          );
          
          notify.success(t("会员创建成功", "Member created successfully"));
          clearForm();
          setMemberStatus('empty');
          setExistingMemberId(null);
          setExistingMemberData(null);
        }
      }
    } catch (error) {
      console.error('Failed to save member:', error);
      notify.error(t("保存会员失败", "Failed to save member"));
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
    notify.success(t("表单已重置", "Form has been reset"));
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
            {/* 常交易卡（由订单管理交易记录自动汇总） */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("常交易卡", "Common Cards")}
              </Label>
              <div className="min-h-[40px] flex flex-wrap gap-1.5 items-center rounded-md border border-input bg-muted/40 px-3 py-2">
                {formData.selectedCommonCards.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    {t("暂无（客户有订单后将自动显示）", "None yet — appears after orders exist")}
                  </span>
                ) : (
                  formData.selectedCommonCards.map((card) => (
                    <Badge key={card} variant="secondary" className="font-normal">
                      {card}
                    </Badge>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "与汇率计算页一致：根据订单中的卡片类型自动写入会员资料，输入电话查询会员时会刷新。",
                  "Same as rate page: filled from order card types; refreshed when you look up by phone.",
                )}
              </p>
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
                value={formData.customerSource || undefined}
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
