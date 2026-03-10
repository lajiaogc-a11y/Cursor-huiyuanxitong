import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Search, CheckCircle, XCircle, Users, ShoppingCart, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMembers, Member } from "@/hooks/useMembers";
import { useOrders, useUsdtOrders } from "@/hooks/useOrders";
import { useReferrals } from "@/hooks/useReferrals";
import { useAuth } from "@/contexts/AuthContext";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { useReferralFormPersistence } from "@/hooks/useReferralFormPersistence";

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

export default function ReferralEntryTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  
  // 使用数据库 Hooks
  const { members, addMember, findMemberByPhone } = useMembers();
  const { orders } = useOrders();
  const { orders: usdtOrders } = useUsdtOrders();
  const { relations, addReferral, getReferralCount, getReferralsByReferrer } = useReferrals();
  
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
  
  // 提交推荐关系
  const handleSubmit = async () => {
    // ===== 前置校验 =====
    if (!referrerInfo?.isMember || !referrerInfo.member) {
      toast.error(t("介绍人必须是系统会员", "Referrer must be a system member"));
      return;
    }
    
    if (!refereePhone.trim()) {
      toast.error(t("请输入被推荐人电话", "Please enter referee phone"));
      return;
    }
    
    // ===== 校验被推荐人不能是现有会员 =====
    if (refereeInfo?.exists) {
      toast.error(t("该电话号码已是会员，无法被推荐", "This phone number is already a member"));
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // 1. 创建新会员 - 使用当前登录员工作为录入人
      const newMember = await addMember({
        phoneNumber: refereePhone.trim(),
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
        refereePhone.trim(),
        newMember.memberCode
      );
      
      if (relation) {
        toast.success(t("推荐关系提交成功，新会员已创建", "Referral submitted, new member created"));
        
        // 重置表单（同时清除持久化数据）
        clearPersistedForm();
        setReferrerInfo(null);
        setRefereeInfo(null);
      }
    } catch (error) {
      console.error('Failed to submit referral:', error);
      toast.error(t("提交失败", "Submission failed"));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 自动查询介绍人 - 减少防抖延迟至300ms
  useEffect(() => {
    if (!referrerInput.trim()) {
      setReferrerInfo(null);
      return;
    }
    
    const timer = setTimeout(() => {
      const member = members.find(
        m => m.phoneNumber === referrerInput.trim() || m.memberCode === referrerInput.trim().toUpperCase()
      );
      
      if (member) {
        const referralCount = getReferralCount(member.phoneNumber);
        const memberOrders = orders.filter(
          o => o.memberCode === member.memberCode && o.status === "completed"
        );
        const memberUsdtOrders = usdtOrders.filter(
          o => o.memberCode === member.memberCode && o.status === "completed"
        );
        
        const referrals = getReferralsByReferrer(member.phoneNumber);
        const refereePhoneList = referrals.map(r => r.refereePhone);
        const referrerRegularOrders = orders.filter(
          o => refereePhoneList.includes(o.phoneNumber) && o.status === "completed"
        );
        const referrerUsdtOrders = usdtOrders.filter(
          o => refereePhoneList.includes(o.phoneNumber) && o.status === "completed"
        );
        const referrerOrderCount = referrerRegularOrders.length + referrerUsdtOrders.length;
        
        setReferrerInfo({
          isMember: true,
          member,
          referralCount,
          orderCount: memberOrders.length + memberUsdtOrders.length,
          referrerOrderCount,
        });
      } else {
        setReferrerInfo({
          isMember: false,
          referralCount: 0,
          orderCount: 0,
          referrerOrderCount: 0,
        });
      }
    }, 300); // 300ms防抖
    return () => clearTimeout(timer);
  }, [referrerInput, members, orders, usdtOrders, getReferralCount, getReferralsByReferrer]);
  
  // 自动查询被推荐人 - 减少防抖延迟至300ms
  useEffect(() => {
    if (!refereePhone.trim()) {
      setRefereeInfo(null);
      return;
    }
    
    const timer = setTimeout(() => {
      const member = findMemberByPhone(refereePhone.trim());
      setRefereeInfo({
        exists: !!member,
        member: member || undefined,
      });
    }, 300); // 300ms防抖
    return () => clearTimeout(timer);
  }, [refereePhone, findMemberByPhone]);

  // 判断是否可以提交
  const canSubmit = referrerInfo?.isMember && refereePhone.trim() && !refereeInfo?.exists;

  return (
    <div className="space-y-6">
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
                      const cleaned = cleanPhoneNumber(e.target.value);
                      const limited = cleaned.slice(0, 18);
                      setReferrerInput(limited);
                      
                      const validation = validatePhoneLength(limited);
                      setReferrerInputError(validation.valid ? "" : validation.message);
                    }}
                    placeholder={t("输入电话号码（8-18位数字）", "Enter phone (8-18 digits)")}
                    className={referrerInputError ? "border-red-500" : ""}
                  />
                </div>
              </div>
              {/* 介绍人验证状态 - 显示在输入框下方 */}
              {referrerInputError && (
                <div className="text-xs text-red-500">{referrerInputError}</div>
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
                        {t("等级", "Level")}: {referrerInfo.member?.level}级 · 
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
                {t("被推荐人（电话号码）", "Referee (Phone Number)")}
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={refereePhone}
                    onChange={(e) => {
                      const cleaned = cleanPhoneNumber(e.target.value);
                      const limited = cleaned.slice(0, 18);
                      setRefereePhone(limited);
                      
                      const validation = validatePhoneLength(limited);
                      setRefereePhoneError(validation.valid ? "" : validation.message);
                    }}
                    placeholder={t("输入电话号码（8-18位数字）", "Enter phone (8-18 digits)")}
                    className={refereePhoneError ? "border-red-500" : ""}
                  />
                </div>
              </div>
              {/* 被推荐人验证状态 - 显示在输入框下方 */}
              {refereePhoneError && (
                <div className="text-xs text-red-500">{refereePhoneError}</div>
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
                      <span>{t("非会员，可以被推荐", "Not a member, can be referred")}</span>
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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
