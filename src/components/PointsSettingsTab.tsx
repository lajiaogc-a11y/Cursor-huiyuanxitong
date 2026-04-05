import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageContainer } from "@/components/SettingsSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, Star, RefreshCw, Trash2 } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useAuth } from "@/contexts/AuthContext";
import { 
  getPointsSettings, 
  savePointsSettings,
  updateAutoRates,
  PointsSettings,
  POINTS_AUTO_UPDATE_INTERVAL,
} from "@/services/points/pointsSettingsService";

/** 自动采集间隔预设（毫秒） */
const INTERVAL_PRESETS_MS = [
  { ms: 15 * 60 * 1000, zh: "15 分钟", en: "15 min" },
  { ms: 30 * 60 * 1000, zh: "30 分钟", en: "30 min" },
  { ms: 60 * 60 * 1000, zh: "1 小时", en: "1 hour" },
  { ms: 2 * 60 * 60 * 1000, zh: "2 小时", en: "2 hours" },
  { ms: 4 * 60 * 60 * 1000, zh: "4 小时", en: "4 hours" },
  { ms: 8 * 60 * 60 * 1000, zh: "8 小时", en: "8 hours" },
  { ms: 12 * 60 * 60 * 1000, zh: "12 小时", en: "12 hours" },
  { ms: 24 * 60 * 60 * 1000, zh: "24 小时", en: "24 hours" },
];

function describeAutoFetchInterval(
  ms: number,
  t: (zh: string, en: string) => string
): string {
  const hours = ms / 3600000;
  if (hours < 1) {
    const m = Math.round(ms / 60000);
    return t(`每 ${m} 分钟自动采集国际汇率`, `Auto-fetch rates every ${m} minutes`);
  }
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
  return t(`每 ${label} 小时自动采集国际汇率`, `Auto-fetch rates every ${label} hours`);
}
import { usePointsSettingsData } from "@/hooks/usePointsSettingsData";
import { useMembers } from "@/hooks/useMembers";
import { useLanguage } from "@/contexts/LanguageContext";
import { CURRENCIES } from "@/config/currencies";
import { formatBeijingTime } from "@/lib/beijingTime";

export default function PointsSettingsTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { members, loading: membersLoading } = useMembers();
  const { settings: hookSettings, loading: isLoading, refetch } = usePointsSettingsData();
  const [settings, setSettings] = useState<PointsSettings | null>(hookSettings);
  const [isAutoUpdating, setIsAutoUpdating] = useState(false);
  
  // 清空积分对话框状态
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [clearUsername, setClearUsername] = useState("");
  const [clearPassword, setClearPassword] = useState("");

  useEffect(() => {
    setSettings(hookSettings);
  }, [hookSettings]);

  const isAutoMode = settings?.mode === 'auto';
  const autoIntervalMs = settings?.autoUpdateIntervalMs || POINTS_AUTO_UPDATE_INTERVAL;

  const intervalSelectOptions = useMemo(() => {
    const known = INTERVAL_PRESETS_MS.some((p) => p.ms === autoIntervalMs);
    if (known) return INTERVAL_PRESETS_MS;
    const m = Math.round(autoIntervalMs / 60000);
    return [
      ...INTERVAL_PRESETS_MS,
      { ms: autoIntervalMs, zh: `${m} 分钟（当前）`, en: `${m} min (current)` },
    ].sort((a, b) => a.ms - b.ms);
  }, [autoIntervalMs]);

  // 自动模式：按「采集间隔」判断是否需要拉取；每 2 分钟轮询一次避免漏触发（原先用固定 4h 定时器会漏判）
  useEffect(() => {
    if (!isAutoMode) return;

    const POLL_MS = 2 * 60 * 1000;

    const checkAndUpdate = async () => {
      const s = getPointsSettings();
      if (s.mode !== "auto") return;
      const intervalMs = s.autoUpdateIntervalMs || POINTS_AUTO_UPDATE_INTERVAL;
      const lastUpdate = s.lastAutoUpdate ? new Date(s.lastAutoUpdate).getTime() : 0;
      if (Date.now() - lastUpdate >= intervalMs) {
        const result = await updateAutoRates();
        setSettings(result.settings);
      }
    };

    checkAndUpdate();
    const timer = setInterval(checkAndUpdate, POLL_MS);
    return () => clearInterval(timer);
  }, [isAutoMode, settings?.autoUpdateIntervalMs]);

  const handleModeChange = (checked: boolean) => {
    if (!settings) return;
    const newMode = checked ? 'auto' : 'manual';
    const newSettings: PointsSettings = { 
      ...settings, 
      mode: newMode as 'auto' | 'manual'
    };
    setSettings(newSettings);
    savePointsSettings(newSettings);
    refetch();
    notify.success(checked 
      ? t("已切换为自动模式", "Switched to auto mode")
      : t("已切换为手动模式", "Switched to manual mode")
    );
  };

  const handleSaveManualSettings = () => {
    if (!settings) return;
    const newSettings = {
      ...settings,
      lastManualUpdate: new Date().toISOString(),
    };
    savePointsSettings(newSettings);
    setSettings(newSettings);
    refetch();
    notify.success(t("积分设置已保存", "Points settings saved"));
  };

  const handleAutoUpdate = async () => {
    setIsAutoUpdating(true);
    try {
      const result = await updateAutoRates();
      setSettings(result.settings);
      refetch();
      if (result.hasChange) {
        notify.success(t("汇率已更新（检测到波动）", "Rates updated (fluctuation detected)"));
      } else {
        notify.info(t("汇率无变化，保持当前值", "No rate change, keeping current values"));
      }
    } catch (error) {
      notify.error(t("自动更新失败", "Auto update failed"));
    } finally {
      setIsAutoUpdating(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '-';
    return formatBeijingTime(dateStr);
  };

  // 清空会员积分
  const handleClearAllPoints = async () => {
    // 验证管理员账号密码
    if (!clearUsername || !clearPassword) {
      notify.error(t("请输入管理员账号和密码", "Please enter admin username and password"));
      return;
    }
    
    // 验证是否是当前管理员账号
    if (employee?.username !== clearUsername) {
      notify.error(t("账号不正确", "Incorrect username"));
      return;
    }
    
    try {
      const { deletePointsLedgerByMemberCodes, deletePointsAccountsByMemberCodes } = await import('@/services/staff/pointsTableService');
      const tenantId = employee?.tenant_id;
      if (!tenantId) {
        notify.error(t("无法确定当前租户", "Cannot determine current tenant"));
        return;
      }

      if (membersLoading) {
        notify.error(t("会员列表加载中，请稍后再试", "Member list is still loading, please try again"));
        return;
      }

      if (members.length === 0) {
        console.error('Failed to fetch tenant members: empty');
        notify.error(t("获取租户会员失败", "Failed to fetch tenant members"));
        return;
      }

      const memberCodes = members.map((m) => String(m.memberCode || '').trim()).filter(Boolean);
      if (memberCodes.length === 0) {
        notify.info(t("当前租户无会员数据", "No members in current tenant"));
        setIsClearDialogOpen(false);
        return;
      }

      const CHUNK = 40;
      for (let i = 0; i < memberCodes.length; i += CHUNK) {
        const chunk = memberCodes.slice(i, i + CHUNK);
        const inList = chunk.join(',');
        try {
          await deletePointsLedgerByMemberCodes(inList);
        } catch (ledgerErr) {
          console.error('Failed to clear points ledger:', ledgerErr);
        }
        try {
          await deletePointsAccountsByMemberCodes(inList);
        } catch (accountsErr) {
          console.error('Failed to clear points accounts:', accountsErr);
        }
      }

      notify.success(t("会员积分已清空", "All member points cleared"));
      setIsClearDialogOpen(false);
      setClearUsername("");
      setClearPassword("");
    } catch (error) {
      console.error('Failed to clear points:', error);
      notify.error(t("清空积分失败", "Failed to clear points"));
    }
  };

  // 加载状态
  if (isLoading || !settings) {
    return (
      <SettingsPageContainer>
        <Card className="rounded-xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              {t("积分规则配置", "Points Rules Configuration")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">{t("加载中...", "Loading...")}</span>
          </CardContent>
        </Card>
      </SettingsPageContainer>
    );
  }

  return (
    <SettingsPageContainer>
    <Card className="rounded-xl shadow-sm overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Star className="h-5 w-5" />
            {t("积分规则配置", "Points Rules Configuration")}
          </CardTitle>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1"
            onClick={() => setIsClearDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("清空会员积分", "Clear All Points")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 活动开关 + 模式切换 */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-6">
            {/* 推荐活动总开关 */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{t("推荐活动总开关", "Referral Activity Master Switch")}</span>
              <Switch 
                checked={settings.referralActivityEnabled !== false}
                onCheckedChange={(checked) => {
                  // 关闭总开关时，同时关闭模式1和模式2
                  const newSettings = checked 
                    ? { ...settings, referralActivityEnabled: checked }
                    : { 
                        ...settings, 
                        referralActivityEnabled: checked,
                        referralMode1Enabled: false,
                        referralMode2Enabled: false,
                      };
                  setSettings(newSettings);
                  savePointsSettings(newSettings);
                  notify.success(checked 
                    ? t("推荐活动已开启", "Referral activity enabled")
                    : t("推荐活动已关闭，模式1和模式2已同时关闭", "Referral activity disabled, Mode 1 and Mode 2 also disabled")
                  );
                }}
              />
              <Badge variant={settings.referralActivityEnabled !== false ? "default" : "secondary"} className="text-xs">
                {settings.referralActivityEnabled !== false ? t("开启", "ON") : t("关闭", "OFF")}
              </Badge>
            </div>
            
            {/* 分隔线 */}
            <div className="h-6 w-px bg-border"></div>
            
            {/* 汇率模式切换 */}
            <div className="flex items-center gap-2">
              <span className={!isAutoMode ? "font-medium" : "text-muted-foreground"}>
                {t("手动", "Manual")}
              </span>
              <Switch 
                checked={isAutoMode}
                onCheckedChange={handleModeChange}
              />
              <span className={isAutoMode ? "font-medium" : "text-muted-foreground"}>
                {t("自动", "Auto")}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {isAutoMode 
                ? describeAutoFetchInterval(autoIntervalMs, t)
                : t("手动设置所有汇率", "Manually set all rates")}
            </span>
          </div>
          {isAutoMode && (
            <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  {t("采集间隔", "Fetch interval")}
                </Label>
                <Select
                  value={String(autoIntervalMs)}
                  onValueChange={(v) => {
                    const ms = Number(v);
                    const newSettings = { ...settings, autoUpdateIntervalMs: ms };
                    setSettings(newSettings);
                    savePointsSettings(newSettings);
                    refetch();
                    notify.success(t("采集间隔已保存", "Interval saved"));
                  }}
                >
                  <SelectTrigger className="h-8 w-[130px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {intervalSelectOptions.map((p) => (
                      <SelectItem key={p.ms} value={String(p.ms)}>
                        {t(p.zh, p.en)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {t("上次:", "Last:")} {formatDateTime(settings.lastAutoUpdate)}
                </span>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleAutoUpdate}
                  disabled={isAutoUpdating}
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${isAutoUpdating ? 'animate-spin' : ''}`} />
                  {t("更新", "Update")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 积分倍率设置 - 更紧凑 */}
        <div className="p-3 border-2 border-primary rounded-lg space-y-3 bg-primary/5">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-primary" />
            <span className="font-medium text-primary text-sm">
              {t("积分倍率设置", "Points Multiplier Setting")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <Label className="font-medium text-sm whitespace-nowrap">{t("1 USD =", "1 USD =")}</Label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={settings.usdToPointsRate || 1}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  usdToPointsRate: parseFloat(e.target.value) || 1 
                } : prev)}
                className="w-20 h-8"
              />
              <span className="font-medium text-sm">{t("积分", "Points")}</span>
            </div>
          </div>
          
          {/* 推荐积分模式设置 */}
          <div className="pt-3 border-t space-y-3">
            <div className="text-sm font-medium text-primary">{t("推荐积分设置", "Referral Points Settings")}</div>
            
            {/* 推荐模式1 */}
            <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{t("推荐模式1", "Mode 1")}</span>
                <Switch 
                  checked={settings.referralMode1Enabled !== false}
                  disabled={settings.referralActivityEnabled === false}
                  onCheckedChange={(checked) => {
                    // 如果推荐活动总开关关闭，不允许开启
                    if (settings.referralActivityEnabled === false) {
                      notify.error(t("请先开启推荐活动总开关", "Please enable referral activity first"));
                      return;
                    }
                    // 如果尝试开启且模式2已开启，提示互斥
                    if (checked && settings.referralMode2Enabled) {
                      notify.error(t("推荐模式1和模式2不可同时开启，请先关闭模式2", "Mode 1 and Mode 2 cannot be enabled at the same time. Please disable Mode 2 first."));
                      return;
                    }
                    // 同步更新 referralMode 和 referralMode1Enabled
                    const newSettings = { 
                      ...settings, 
                      referralMode1Enabled: checked,
                      referralMode: checked ? 'mode1' as const : settings.referralMode,
                      // 开启模式1时，确保模式2关闭
                      referralMode2Enabled: checked ? false : settings.referralMode2Enabled,
                    };
                    setSettings(newSettings);
                    savePointsSettings(newSettings);
                    notify.success(checked 
                      ? t("推荐模式1已开启", "Referral mode 1 enabled")
                      : t("推荐模式1已关闭", "Referral mode 1 disabled")
                    );
                  }}
                />
                <Badge variant={settings.referralMode1Enabled !== false ? "default" : "secondary"} className="text-xs">
                  {settings.referralMode1Enabled !== false ? t("开启", "ON") : t("关闭", "OFF")}
                </Badge>
              </div>
              <span className="text-sm">=</span>
              <Input
                type="number"
                min="0"
                step="1"
                value={settings.referralPointsPerAction || 1}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  referralPointsPerAction: parseInt(e.target.value) || 1 
                } : prev)}
                className="w-16 h-8"
                disabled={settings.referralMode1Enabled === false}
              />
              <span className="text-sm text-muted-foreground">{t("固定积分", "Fixed Points")}</span>
            </div>
            
            {/* 推荐模式2 */}
            <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{t("推荐模式2", "Mode 2")}</span>
                <Switch 
                  checked={settings.referralMode2Enabled === true}
                  disabled={settings.referralActivityEnabled === false}
                  onCheckedChange={(checked) => {
                    // 如果推荐活动总开关关闭，不允许开启
                    if (settings.referralActivityEnabled === false) {
                      notify.error(t("请先开启推荐活动总开关", "Please enable referral activity first"));
                      return;
                    }
                    // 如果尝试开启且模式1已开启，提示互斥
                    if (checked && settings.referralMode1Enabled !== false) {
                      notify.error(t("推荐模式1和模式2不可同时开启，请先关闭模式1", "Mode 1 and Mode 2 cannot be enabled at the same time. Please disable Mode 1 first."));
                      return;
                    }
                    // 同步更新 referralMode 和 referralMode2Enabled
                    const newSettings = { 
                      ...settings, 
                      referralMode2Enabled: checked,
                      referralMode: checked ? 'mode2' as const : settings.referralMode,
                      // 开启模式2时，确保模式1关闭
                      referralMode1Enabled: checked ? false : settings.referralMode1Enabled,
                    };
                    setSettings(newSettings);
                    savePointsSettings(newSettings);
                    notify.success(checked 
                      ? t("推荐模式2已开启", "Referral mode 2 enabled")
                      : t("推荐模式2已关闭", "Referral mode 2 disabled")
                    );
                  }}
                />
                <Badge variant={settings.referralMode2Enabled ? "default" : "secondary"} className="text-xs">
                  {settings.referralMode2Enabled ? t("开启", "ON") : t("关闭", "OFF")}
                </Badge>
              </div>
              <span className="text-sm">=</span>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={settings.referralMode2Percentage || 10}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  referralMode2Percentage: parseFloat(e.target.value) || 10 
                } : prev)}
                className="w-16 h-8"
                disabled={!settings.referralMode2Enabled}
              />
              <span className="text-sm text-muted-foreground">%</span>
              <span className="text-xs text-muted-foreground ml-2">
                {t("（推荐人获得客户消费积分的百分比）", "(Referrer gets % of customer points)")}
              </span>
            </div>
            
            <p className="text-xs text-muted-foreground">
              {t(
                "推荐模式1和模式2只能开启其中一个。关闭推荐活动总开关将同时关闭两个模式。",
                "Only one of Mode 1 or Mode 2 can be enabled at a time. Disabling the referral activity will disable both modes."
              )}
            </p>
          </div>
        </div>

        {/* 币种汇率配置 - 三列布局 - 放大输入框 */}
        <div className="grid grid-cols-3 gap-4">
          {/* USDT配置 */}
          <div className="p-4 border rounded-lg space-y-3" style={{ borderColor: CURRENCIES.USDT.color }}>
            <Badge style={{ backgroundColor: CURRENCIES.USDT.color, color: 'white' }} className="text-sm">
              {CURRENCIES.USDT.name}
            </Badge>
            <div className="flex items-center gap-2 flex-wrap p-3 bg-muted/30 rounded">
              <span className="text-sm font-medium">{t("汇率", "Rate")}</span>
              <span className="text-sm font-bold text-primary">
                ({((settings.usdtFormulaMultiplier || 1) * (settings.usdtCoefficient || 1)).toFixed(4)})
              </span>
              <span className="text-sm">=</span>
              <Input
                type="number"
                step="0.0001"
                value={settings.usdtFormulaMultiplier || 1}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  usdtFormulaMultiplier: parseFloat(e.target.value) || 0 
                } : prev)}
                className="w-24 h-9"
                placeholder="1"
              />
              <span className="text-sm">×</span>
              <Input
                type="number"
                step="0.0001"
                value={settings.usdtCoefficient || 1}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  usdtCoefficient: parseFloat(e.target.value) || 0 
                } : prev)}
                className="w-24 h-9"
                placeholder="1"
              />
            </div>
          </div>

          {/* 奈拉配置 */}
          <div className="p-4 border rounded-lg space-y-3" style={{ borderColor: CURRENCIES.NGN.color }}>
            <Badge style={{ backgroundColor: CURRENCIES.NGN.color, color: 'white' }} className="text-sm">
              {CURRENCIES.NGN.name}
            </Badge>
            <div className="flex items-center gap-2 flex-wrap p-3 bg-muted/30 rounded">
              <span className="text-sm font-medium">{t("汇率", "Rate")}</span>
              <span className="text-sm font-bold text-primary">
                ({(settings.ngnToUsdRate || 0).toFixed(2)})
              </span>
              <span className="text-sm">=</span>
              <Input
                type="number"
                step="0.01"
                value={settings.ngnToUsdRate}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  ngnToUsdRate: parseFloat(e.target.value) || 0 
                } : prev)}
                className="w-28 h-9"
                disabled={isAutoMode}
              />
              <span className="text-sm">×</span>
              <Input
                type="number"
                step="0.0001"
                value={settings.ngnFormulaMultiplier || 1}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  ngnFormulaMultiplier: parseFloat(e.target.value) || 0 
                } : prev)}
                className="w-24 h-9"
                placeholder="1"
              />
            </div>
            {isAutoMode && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("采集微调", "Adjust")}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="2"
                  value={settings.ngnRateAdjustment ?? 1}
                  onChange={(e) => setSettings(prev => prev ? { 
                    ...prev, 
                    ngnRateAdjustment: parseFloat(e.target.value) || 1 
                  } : prev)}
                  className="w-16 h-7"
                  placeholder="1"
                />
                <span className="text-muted-foreground">{t("(1=不调，1.1=+10%)", "(1=no adj)")}</span>
              </div>
            )}
          </div>

          {/* 赛地配置 */}
          <div className="p-4 border rounded-lg space-y-3" style={{ borderColor: CURRENCIES.GHS.color }}>
            <Badge style={{ backgroundColor: CURRENCIES.GHS.color, color: 'white' }} className="text-sm">
              {CURRENCIES.GHS.name}
            </Badge>
            <div className="flex items-center gap-2 flex-wrap p-3 bg-muted/30 rounded">
              <span className="text-sm font-medium">{t("汇率", "Rate")}</span>
              <span className="text-sm font-bold text-primary">
                ({(settings.ghsToUsdRate ?? 12.8).toFixed(2)})
              </span>
              <span className="text-sm">=</span>
              <Input
                type="number"
                step="0.01"
                value={settings.ghsToUsdRate ?? 12.8}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  ghsToUsdRate: parseFloat(e.target.value) || 0 
                } : prev)}
                className="w-28 h-9"
                disabled={isAutoMode}
                placeholder="12.8"
              />
              <span className="text-sm">×</span>
              <Input
                type="number"
                step="0.0001"
                value={settings.ghsFormulaMultiplier || 1}
                onChange={(e) => setSettings(prev => prev ? { 
                  ...prev, 
                  ghsFormulaMultiplier: parseFloat(e.target.value) || 0 
                } : prev)}
                className="w-24 h-9"
                placeholder="1"
              />
            </div>
            {isAutoMode && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t("采集微调", "Adjust")}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="2"
                  value={settings.ghsRateAdjustment ?? 1}
                  onChange={(e) => setSettings(prev => prev ? { 
                    ...prev, 
                    ghsRateAdjustment: parseFloat(e.target.value) || 1 
                  } : prev)}
                  className="w-16 h-7"
                  placeholder="1"
                />
                <span className="text-muted-foreground">{t("(1=不调，1.1=+10%)", "(1=no adj)")}</span>
              </div>
            )}
          </div>
        </div>

        {/* 保存按钮 */}
        <Button onClick={handleSaveManualSettings} className="gap-2" size="sm">
          <Save className="h-4 w-4" />
          {t("保存设置", "Save Settings")}
        </Button>
      </CardContent>

      {/* 清空会员积分确认对话框 */}
      <AlertDialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("清空会员积分", "Clear All Member Points")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "此操作将清空所有会员的消费奖励、推荐奖励和剩余积分。请输入管理员账号密码确认操作。",
                "This will clear all member consumption rewards, referral rewards, and remaining points. Please enter admin credentials to confirm."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("管理员账号", "Admin Username")}</Label>
              <Input
                value={clearUsername}
                onChange={(e) => setClearUsername(e.target.value)}
                placeholder={t("请输入管理员账号", "Enter admin username")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("管理员密码", "Admin Password")}</Label>
              <Input
                type="password"
                value={clearPassword}
                onChange={(e) => setClearPassword(e.target.value)}
                placeholder={t("请输入管理员密码", "Enter admin password")}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setClearUsername("");
              setClearPassword("");
            }}>
              {t("取消", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAllPoints} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("确认清空", "Confirm Clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
    </SettingsPageContainer>
  );
}
