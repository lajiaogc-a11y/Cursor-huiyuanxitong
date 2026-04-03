import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Search, CheckCircle, XCircle, Users, ShoppingCart, AlertCircle } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMembers, Member } from "@/hooks/useMembers";
import { useTenantView } from "@/contexts/TenantViewContext";
import { lookupMemberForReferral, type ApiMember } from "@/api/members";
import { useOrders, useUsdtOrders } from "@/hooks/useOrders";
import { useReferrals } from "@/hooks/useReferrals";
import { useAuth } from "@/contexts/AuthContext";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { useReferralFormPersistence } from "@/hooks/useReferralFormPersistence";
import { findMemberByPhoneOrCode } from "@/lib/memberLookup";
import { mapDbMemberToMember } from "@/lib/mappers/memberMapper";

interface ReferrerInfo {
  isMember: boolean;
  member?: Member;
  referralCount: number;
  orderCount: number;
  referrerOrderCount: number;
}

interface RefereeInfo {
  exists: boolean;
  member?: Member;
}

function apiMemberToMember(row: ApiMember): Member {
  return mapDbMemberToMember(row as any);
}

export default function ReferralEntryTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};

  const effectiveTenantId = useMemo(() => {
    if (employee?.is_platform_super_admin) {
      return viewingTenantId || null;
    }
    return viewingTenantId || employee?.tenant_id || null;
  }, [employee?.is_platform_super_admin, employee?.tenant_id, viewingTenantId]);

  // 使用数据库 Hooks（订单统计等仍用本地缓存）
  const { addMember, members } = useMembers();
  const { orders } = useOrders();
  const { orders: usdtOrders } = useUsdtOrders();
  const { relations, addReferral, getReferralCount, getReferralsByReferrer } = useReferrals();
  
  // Stable refs — prevent useEffect from re-firing when hook data refreshes
  const membersRef = useRef(members);
  membersRef.current = members;
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const usdtOrdersRef = useRef(usdtOrders);
  usdtOrdersRef.current = usdtOrders;
  const getReferralCountRef = useRef(getReferralCount);
  getReferralCountRef.current = getReferralCount;
  const getReferralsByReferrerRef = useRef(getReferralsByReferrer);
  getReferralsByReferrerRef.current = getReferralsByReferrer;

  // 使用持久化表单 Hook
  const {
    referrerInput,
    refereePhone,
    setReferrerInput,
    setRefereePhone,
    clearForm: clearPersistedForm,
  } = useReferralFormPersistence();
  
  // 介绍人验证信息
  const [referrerInfo, setReferrerInfo] = useState<ReferrerInfo | null>(null);
  const [referrerInputError, setReferrerInputError] = useState("");
  
  // 被推荐人验证信息
  const [refereeInfo, setRefereeInfo] = useState<RefereeInfo | null>(null);
  const [refereePhoneError, setRefereePhoneError] = useState("");
  
  // 提交状态
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referrerLookupLoading, setReferrerLookupLoading] = useState(false);
  const [refereeLookupLoading, setRefereeLookupLoading] = useState(false);
  const referrerLookupGen = useRef(0);
  const refereeLookupGen = useRef(0);
  
  // 提交推荐关系
  const handleSubmit = async () => {
    // ===== 前置校验 =====
    if (!referrerInfo?.isMember || !referrerInfo.member) {
      notify.error(t("介绍人必须是系统会员", "Referrer must be a system member"));
      return;
    }
    
    const refereeDigits = cleanPhoneNumber(refereePhone.trim());
    if (refereeDigits.length < 8 || refereeDigits.length > 18) {
      notify.error(t("被推荐人请填写 8～18 位手机号（新会员）", "Please enter referee phone: 8–18 digits for new member"));
      return;
    }
    
    // ===== 校验被推荐人不能是现有会员 =====
    if (refereeInfo?.exists) {
      notify.error(t("该电话号码已是会员，无法被推荐", "This phone number is already a member"));
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // 1. 创建新会员 - 使用当前登录员工作为录入人（统一存纯数字手机号）
      const newMember = await addMember({
        phoneNumber: refereeDigits,
        level: 'D',
        preferredCurrency: [],
        remark: `由 ${referrerInfo.member.memberCode} 推荐`,
        tradeFeature: '',
        sourceChannel: '转介绍',
        recorder: employee?.real_name || '',  // 设置录入人为当前登录员工
        recorderId: employee?.id || '',       // 设置录入人ID
        commonCards: [],
        customerFeature: '',
        referrerPhone: referrerInfo.member.phoneNumber,
        referrerMemberCode: referrerInfo.member.memberCode,
      });
      
      if (!newMember) {
        setIsSubmitting(false);
        return;
      }
      
      // 2. 创建推荐关系
      const relation = await addReferral(
        referrerInfo.member.phoneNumber,
        referrerInfo.member.memberCode,
        refereeDigits,
        newMember.memberCode,
        referrerInfo.member.id,
        newMember.id,
      );
      
      if (relation) {
        notify.success(t("推荐关系提交成功，新会员已创建", "Referral submitted, new member created"));
        
        // 重置表单（同时清除持久化数据）
        clearPersistedForm();
        setReferrerInfo(null);
        setRefereeInfo(null);
      }
    } catch (error) {
      console.error('Failed to submit referral:', error);
      notify.error(t("提交失败", "Submission failed"));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 介绍人：服务端实时查询，本地会员缓存作为回退
  // Only re-trigger when the user's input or tenant changes — NOT when hook data refreshes
  useEffect(() => {
    if (!referrerInput.trim()) {
      setReferrerInfo(null);
      setReferrerLookupLoading(false);
      return;
    }
    if (!effectiveTenantId) {
      setReferrerInfo(null);
      setReferrerLookupLoading(false);
      return;
    }

    const gen = ++referrerLookupGen.current;
    const q = referrerInput.trim();

    const timer = setTimeout(async () => {
      setReferrerLookupLoading(true);
      try {
        let member: Member | null = null;

        // 1) 优先服务端查询
        try {
          const row = await lookupMemberForReferral(q, effectiveTenantId);
          if (gen !== referrerLookupGen.current) return;
          if (row) {
            member = apiMemberToMember(row);
          }
        } catch (serverErr) {
          console.warn("[ReferralEntry] server lookup failed, falling back to local cache:", serverErr);
        }

        // 2) 回退：本地会员缓存匹配（按电话号码数字比较 / 会员编号不区分大小写）
        const curMembers = membersRef.current;
        if (!member && curMembers.length > 0) {
          const localMatch = findMemberByPhoneOrCode(curMembers, q);
          if (localMatch) {
            member = localMatch;
          }
        }

        if (gen !== referrerLookupGen.current) return;

        if (!member) {
          setReferrerInfo({
            isMember: false,
            referralCount: 0,
            orderCount: 0,
            referrerOrderCount: 0,
          });
          return;
        }

        const curOrders = ordersRef.current;
        const curUsdtOrders = usdtOrdersRef.current;

        const referralCount = getReferralCountRef.current(member.phoneNumber);
        const memberOrders = curOrders.filter(
          (o) => o.memberCode === member!.memberCode && o.status === "completed"
        );
        const memberUsdtOrders = curUsdtOrders.filter(
          (o) => o.memberCode === member!.memberCode && o.status === "completed"
        );

        const referrals = getReferralsByReferrerRef.current(member.phoneNumber);
        const refereePhoneList = referrals.map((r) => r.refereePhone);
        const referrerRegularOrders = curOrders.filter(
          (o) => refereePhoneList.includes(o.phoneNumber) && o.status === "completed"
        );
        const referrerUsdtOrders = curUsdtOrders.filter(
          (o) => refereePhoneList.includes(o.phoneNumber) && o.status === "completed"
        );
        const referrerOrderCount = referrerRegularOrders.length + referrerUsdtOrders.length;

        setReferrerInfo({
          isMember: true,
          member,
          referralCount,
          orderCount: memberOrders.length + memberUsdtOrders.length,
          referrerOrderCount,
        });
      } catch (e) {
        console.error("[ReferralEntry] referrer lookup failed:", e);
        if (gen !== referrerLookupGen.current) return;
        setReferrerInfo({
          isMember: false,
          referralCount: 0,
          orderCount: 0,
          referrerOrderCount: 0,
        });
      } finally {
        if (gen === referrerLookupGen.current) {
          setReferrerLookupLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      referrerLookupGen.current += 1;
    };
  }, [referrerInput, effectiveTenantId]);
  
  // 被推荐人：服务端实时查询是否已是会员，本地会员缓存作为回退
  useEffect(() => {
    if (!refereePhone.trim()) {
      setRefereeInfo(null);
      setRefereeLookupLoading(false);
      return;
    }
    if (!effectiveTenantId) {
      setRefereeInfo(null);
      setRefereeLookupLoading(false);
      return;
    }

    const gen = ++refereeLookupGen.current;
    const q = refereePhone.trim();

    const timer = setTimeout(async () => {
      setRefereeLookupLoading(true);
      try {
        let foundMember: Member | undefined;

        // 1) 优先服务端查询
        try {
          const row = await lookupMemberForReferral(q, effectiveTenantId);
          if (gen !== refereeLookupGen.current) return;
          if (row) {
            foundMember = apiMemberToMember(row);
          }
        } catch (serverErr) {
          console.warn("[ReferralEntry] server referee lookup failed, falling back to local cache:", serverErr);
        }

        // 2) 回退：本地会员缓存匹配
        const curMembers = membersRef.current;
        if (!foundMember && curMembers.length > 0) {
          const localMatch = findMemberByPhoneOrCode(curMembers, q);
          if (localMatch) {
            foundMember = localMatch;
          }
        }

        if (gen !== refereeLookupGen.current) return;

        if (foundMember) {
          setRefereeInfo({ exists: true, member: foundMember });
        } else {
          setRefereeInfo({ exists: false, member: undefined });
        }
      } catch (e) {
        console.error("[ReferralEntry] referee lookup failed:", e);
        if (gen !== refereeLookupGen.current) return;
        setRefereeInfo({ exists: false, member: undefined });
      } finally {
        if (gen === refereeLookupGen.current) {
          setRefereeLookupLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      refereeLookupGen.current += 1;
    };
  }, [refereePhone, effectiveTenantId]);

  const refereeDigitsForSubmit = cleanPhoneNumber(refereePhone.trim());
  const refereePhoneOk =
    refereeDigitsForSubmit.length >= 8 &&
    refereeDigitsForSubmit.length <= 18 &&
    validatePhoneLength(refereeDigitsForSubmit).valid;

  // 须等服务端校验完成，避免 refereeInfo 仍为 null 时误允许提交
  const canSubmit =
    Boolean(effectiveTenantId) &&
    Boolean(referrerInput.trim()) &&
    !referrerLookupLoading &&
    Boolean(referrerInfo?.isMember) &&
    Boolean(refereePhone.trim()) &&
    refereePhoneOk &&
    !refereeLookupLoading &&
    refereeInfo !== null &&
    !refereeInfo.exists;

  const levelLabel = (level: string | undefined) => {
    if (!level) return "";
    if (level.includes("级") || level.toLowerCase().includes("level")) return level;
    // 单字母/数字等级（如 D、1）补「级」；「普通会员」等完整文案原样显示
    if (/^[A-Za-z0-9]$/.test(level)) return `${level}${t("级", "")}`;
    return level;
  };

  return (
    <div className="space-y-6">
      {!effectiveTenantId && (
        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {t(
            "请先选择要办理业务的租户（平台总管理需在顶部切换进入租户后再使用推荐录入）",
            "Select a business tenant first (platform admins: switch into a tenant before referral entry)",
          )}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 推荐关系录入区 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {t("推荐关系录入", "Referral Entry")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 介绍人 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("介绍人（电话号码或会员编号）", "Referrer (Phone or Member Code)")}
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={referrerInput}
                    onChange={(e) => {
                      const raw = e.target.value;
                      // 含字母视为会员编号，保留字母数字；否则只保留数字（电话）
                      let next: string;
                      if (/[A-Za-z]/.test(raw)) {
                        next = raw.replace(/\s+/g, "").toUpperCase().slice(0, 32);
                      } else {
                        next = cleanPhoneNumber(raw).slice(0, 18);
                      }
                      setReferrerInput(next);
                      const validation =
                        /[A-Za-z]/.test(next) || next.length === 0
                          ? { valid: true, message: "" }
                          : validatePhoneLength(next);
                      setReferrerInputError(validation.valid ? "" : validation.message);
                    }}
                    placeholder={t("手机号或会员编号（如 M123）", "Phone or member code (e.g. M123)")}
                    className={referrerInputError ? "border-red-500" : ""}
                  />
                </div>
              </div>
              {/* 介绍人验证状态 - 显示在输入框下方 */}
              {referrerInputError && (
                <div className="text-xs text-red-500">{referrerInputError}</div>
              )}
              {referrerLookupLoading && referrerInput.trim() && (
                <div className="text-sm p-2 rounded-md bg-muted/50 text-muted-foreground border">
                  {t("正在从服务器校验介绍人…", "Verifying referrer with server…")}
                </div>
              )}
              {referrerInfo && (
                <div className={`text-sm p-2 rounded-md flex items-center gap-2 ${
                  referrerInfo.isMember 
                    ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' 
                    : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                }`}>
                  {referrerInfo.isMember ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>
                        {t("是系统会员", "Is member")} · 
                        {t("编号", "Code")}: {referrerInfo.member?.memberCode} · 
                        {t("等级", "Level")}: {levelLabel(referrerInfo.member?.level)} · 
                        {t("已推荐", "Referrals")}: {referrerInfo.referralCount}{t("人", "people")}
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      <span>{t("非系统会员，无法作为介绍人", "Not a member, cannot be referrer")}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* 被推荐人 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t("被推荐人（新会员填手机号；可查会员编号是否已注册）", "Referee: phone for new member; or code to check if already registered")}
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={refereePhone}
                    onChange={(e) => {
                      const raw = e.target.value;
                      let next: string;
                      if (/[A-Za-z]/.test(raw)) {
                        next = raw.replace(/\s+/g, "").toUpperCase().slice(0, 32);
                      } else {
                        next = cleanPhoneNumber(raw).slice(0, 18);
                      }
                      setRefereePhone(next);
                      const validation =
                        /[A-Za-z]/.test(next) || next.length === 0
                          ? { valid: true, message: "" }
                          : validatePhoneLength(next);
                      setRefereePhoneError(validation.valid ? "" : validation.message);
                    }}
                    placeholder={t("新会员：8～18 位手机号；查询：会员编号", "New member: phone 8–18 digits; lookup: member code")}
                    className={refereePhoneError ? "border-red-500" : ""}
                  />
                </div>
              </div>
              {/* 被推荐人验证状态 - 显示在输入框下方 */}
              {refereePhoneError && (
                <div className="text-xs text-red-500">{refereePhoneError}</div>
              )}
              {refereeLookupLoading && refereePhone.trim() && (
                <div className="text-sm p-2 rounded-md bg-muted/50 text-muted-foreground border">
                  {t("正在从服务器校验被推荐人…", "Verifying referee with server…")}
                </div>
              )}
              {refereeInfo && (
                <div className={`text-sm p-2 rounded-md flex items-center gap-2 ${
                  refereeInfo.exists 
                    ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800' 
                    : 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                }`}>
                  {refereeInfo.exists ? (
                    <>
                      <XCircle className="h-4 w-4" />
                      <span>
                        {t("已是会员", "Already member")} · 
                        {t("编号", "Code")}: {refereeInfo.member?.memberCode} · 
                        {t("无法被推荐", "Cannot be referred")}
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>
                        {/[A-Za-z]/.test(refereePhone)
                          ? t(
                              "该会员编号未在系统中注册；创建新会员时请改填被推荐人手机号",
                              "This member code is not registered; enter referee phone to create a new member",
                            )
                          : t("非会员，可以被推荐", "Not a member, can be referred")}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* 提交按钮 */}
            <Button 
              onClick={handleSubmit} 
              className="w-full gap-2"
              disabled={!canSubmit || isSubmitting}
            >
              <UserPlus className="h-4 w-4" />
              {isSubmitting ? t("提交中...", "Submitting...") : t("确定提交", "Submit")}
            </Button>
            
            {/* 提交提示 */}
            {refereeInfo?.exists && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                {t("该电话号码已是会员，无法被推荐", "This phone number is already a member")}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* 数据校验与信息展示区 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Search className="h-5 w-5" />
              {t("校验信息展示", "Validation Info")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 介绍人信息 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">
                {t("介绍人信息", "Referrer Info")}
              </Label>
              {referrerInfo ? (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("是否为系统会员", "Is System Member")}</span>
                    {referrerInfo.isMember ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {t("是", "Yes")}
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                        <XCircle className="h-3 w-3" />
                        {t("否", "No")}
                      </Badge>
                    )}
                  </div>
                  
                  {referrerInfo.isMember && referrerInfo.member && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t("会员编号", "Member Code")}</span>
                        <Badge variant="outline" className="font-mono">
                          {referrerInfo.member.memberCode}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t("会员等级", "Level")}</span>
                        <Badge variant="secondary">{referrerInfo.member.level}级</Badge>
                      </div>
                    </>
                  )}
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {t("已成功推荐人数", "Successful Referrals")}
                    </span>
                    <span className="font-medium">{referrerInfo.referralCount} {t("人", "people")}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      {t("介绍人累计完成交易笔数", "Referrer's Own Orders")}
                    </span>
                    <span className="font-medium">{referrerInfo.orderCount} {t("笔", "orders")}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1">
                      <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      {t("被推荐人累计交易笔数", "Referees' Total Orders")}
                    </span>
                    <span className="font-medium">{referrerInfo.referrerOrderCount} {t("笔", "orders")}</span>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-4 text-center text-muted-foreground text-sm bg-muted/20">
                  {t("请输入介绍人信息并点击查询", "Enter referrer info and click search")}
                </div>
              )}
            </div>
            
            {/* 被推荐人信息 */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">
                {t("被推荐人信息", "Referee Info")}
              </Label>
              {refereeInfo ? (
                <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t("是否存在于会员管理", "Exists in Member Management")}</span>
                    {refereeInfo.exists ? (
                      <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
                        <XCircle className="h-3 w-3" />
                        {t("有（无法推荐）", "Yes (Cannot refer)")}
                      </Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {t("没有（可推荐）", "No (Can refer)")}
                      </Badge>
                    )}
                  </div>
                  
                  {refereeInfo.exists && refereeInfo.member && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t("会员编号", "Member Code")}</span>
                        <Badge variant="outline" className="font-mono">
                          {refereeInfo.member.memberCode}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t("电话号码", "Phone")}</span>
                        <span className="font-mono text-sm">{refereeInfo.member.phoneNumber}</span>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="border rounded-lg p-4 text-center text-muted-foreground text-sm bg-muted/20">
                  {t("请输入被推荐人电话并点击查询", "Enter referee phone and click search")}
                </div>
              )}
            </div>
            
            {/* 说明 */}
            <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg space-y-1">
              <p>💡 {t(
                "提交后将自动创建新会员并建立推荐关系",
                "After submission, a new member will be created and the referral relationship established"
              )}</p>
              <p>💡 {t(
                "被推荐人首次消费后，介绍人可获得相应积分奖励",
                "After the referee's first purchase, the referrer can receive corresponding point rewards"
              )}</p>
              <p>💡 {t(
                "推荐关系会写入 referral_relations，与订单积分中的推荐奖励逻辑一致",
                "Referral is saved to referral_relations for referral point rewards on orders"
              )}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
