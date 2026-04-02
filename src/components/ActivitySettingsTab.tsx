import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageContainer } from "@/components/SettingsSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Gift, Plus, Trash2, Save, AlertTriangle, Zap } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getActivitySettings,
  getActivitySettingsAsync,
  saveActivitySettings,
  AccumulatedRewardTier,
  ActivitySettings,
  Activity2Config,
} from "@/stores/activitySettingsStore";

export default function ActivitySettingsTab() {
  const { t, language } = useLanguage();
  
  const [settings, setSettings] = useState<ActivitySettings>(getActivitySettings());
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [tierDeleteId, setTierDeleteId] = useState<string | null>(null);
  
  // 新增档位表单
  const [newTier, setNewTier] = useState({
    minPoints: 0,
    rewardAmountNGN: 0,
    rewardAmountGHS: 0,
    rewardAmountUSDT: 0,
  });

  useEffect(() => {
    let mounted = true;
    getActivitySettingsAsync()
      .then((data) => {
        if (mounted) setSettings(data);
      })
      .catch((error) => {
        console.error('Failed to load activity settings:', error);
        if (mounted) setSettings(getActivitySettings());
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleTierChange = (tierId: string, field: keyof AccumulatedRewardTier, value: any) => {
    setSettings(prev => ({
      ...prev,
      accumulatedRewardTiers: prev.accumulatedRewardTiers.map(tier =>
        tier.id === tierId ? { ...tier, [field]: value } : tier
      ),
    }));
    setHasChanges(true);
  };

  const handleAddTier = () => {
    if (newTier.minPoints <= 0) {
      notify.error(t("积分下限必须大于0", "Min points must be greater than 0"));
      return;
    }
    
    // 检查是否与现有档位冲突
    const exists = settings.accumulatedRewardTiers.some(
      tier => tier.minPoints === newTier.minPoints
    );
    if (exists) {
      notify.error(t("该积分下限已存在", "This min points already exists"));
      return;
    }

    const newTierEntry: AccumulatedRewardTier = {
      id: Math.random().toString(36).substring(2, 15),
      minPoints: newTier.minPoints,
      maxPoints: null,
      rewardAmountNGN: newTier.rewardAmountNGN,
      rewardAmountGHS: newTier.rewardAmountGHS,
      rewardAmountUSDT: newTier.rewardAmountUSDT,
    };

    // 添加并排序
    const updatedTiers = [...settings.accumulatedRewardTiers, newTierEntry];
    updatedTiers.sort((a, b) => a.minPoints - b.minPoints);

    // 重新计算区间
    for (let i = 0; i < updatedTiers.length; i++) {
      if (i === updatedTiers.length - 1) {
        updatedTiers[i].maxPoints = null;
      } else {
        updatedTiers[i].maxPoints = updatedTiers[i + 1].minPoints;
      }
    }

    setSettings(prev => ({
      ...prev,
      accumulatedRewardTiers: updatedTiers,
    }));
    setHasChanges(true);
    setNewTier({ minPoints: 0, rewardAmountNGN: 0, rewardAmountGHS: 0, rewardAmountUSDT: 0 });
    notify.success(t("档位已添加", "Tier added"));
  };

  const handleDeleteTier = (tierId: string) => {
    const tier = settings.accumulatedRewardTiers.find(t => t.id === tierId);
    
    // 不允许删除最后一档
    if (tier?.maxPoints === null) {
      notify.error(t("最后一档不可删除", "Cannot delete the last tier"));
      return;
    }
    
    // 至少保留一档
    if (settings.accumulatedRewardTiers.length <= 1) {
      notify.error(t("至少保留一个档位", "At least one tier required"));
      return;
    }

    const updatedTiers = settings.accumulatedRewardTiers.filter(t => t.id !== tierId);
    
    // 重新计算区间
    for (let i = 0; i < updatedTiers.length; i++) {
      if (i === updatedTiers.length - 1) {
        updatedTiers[i].maxPoints = null;
      } else {
        updatedTiers[i].maxPoints = updatedTiers[i + 1].minPoints;
      }
    }

    setSettings(prev => ({
      ...prev,
      accumulatedRewardTiers: updatedTiers,
    }));
    setHasChanges(true);
    notify.success(t("档位已删除", "Tier deleted"));
  };

  // 活动1开关 - 互斥检查
  const handleActivity1Toggle = (enabled: boolean) => {
    // 检查互斥：如果要开启活动1，需要确保活动2已关闭
    if (enabled && settings.activity2?.enabled) {
      notify.error(t(
        "活动1和活动2不可以同时开启，请先关闭当前已开启的活动。",
        "Activity 1 and Activity 2 cannot be enabled simultaneously. Please disable the current active one first."
      ));
      return;
    }
    
    setSettings(prev => ({
      ...prev,
      activity1Enabled: enabled,
    }));
    setHasChanges(true);
  };

  // 活动2配置修改 - 互斥检查
  const handleActivity2Change = (field: keyof Activity2Config, value: any) => {
    // 如果是开启活动2，需要检查活动1是否已开启
    if (field === 'enabled' && value === true && settings.activity1Enabled) {
      notify.error(t(
        "活动1和活动2不可以同时开启，请先关闭当前已开启的活动。",
        "Activity 1 and Activity 2 cannot be enabled simultaneously. Please disable the current active one first."
      ));
      return;
    }
    
    setSettings(prev => ({
      ...prev,
      activity2: {
        ...prev.activity2,
        [field]: value,
      },
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // 验证互斥逻辑
    if (settings.activity1Enabled && settings.activity2?.enabled) {
      notify.error(t(
        "活动1和活动2不可以同时开启，请先关闭其中一个。",
        "Activity 1 and Activity 2 cannot both be enabled. Please disable one."
      ));
      return;
    }
    
    // 仅当活动1开启时要求至少一档；活动1关闭时允许无档位，不影响保存活动2等配置
    const tiers = [...settings.accumulatedRewardTiers];
    if (settings.activity1Enabled && tiers.length === 0) {
      notify.error(t("至少需要一个档位", "At least one tier required"));
      return;
    }

    // 有档位时才重新排序并计算区间
    if (tiers.length > 0) {
      tiers.sort((a, b) => a.minPoints - b.minPoints);
      for (let i = 0; i < tiers.length; i++) {
        if (i === tiers.length - 1) {
          tiers[i].maxPoints = null;
        } else {
          tiers[i].maxPoints = tiers[i + 1].minPoints;
        }
      }
    }

    // 保存完整设置
    const settingsToSave: ActivitySettings = {
      ...settings,
      accumulatedRewardTiers: tiers,
    };
    saveActivitySettings(settingsToSave);
    setHasChanges(false);
    notify.success(t("活动设置已保存", "Activity settings saved"));
  };

  const formatTierRange = (tier: AccumulatedRewardTier): string => {
    if (tier.maxPoints === null) {
      return `≥ ${tier.minPoints}`;
    }
    return `${tier.minPoints} - ${tier.maxPoints}`;
  };

  if (isLoading) {
    return (
      <SettingsPageContainer>
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t("加载设置中...", "Loading settings...")}
        </div>
      </SettingsPageContainer>
    );
  }

  return (
    <SettingsPageContainer>
      {/* 保存按钮 */}
      {hasChanges && (
        <div className="flex justify-end">
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            {t("保存设置", "Save Settings")}
          </Button>
        </div>
      )}

      {/* 活动1：累积兑换奖励（阶梯制） */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Gift className="h-5 w-5" />
              {t("活动1：累积兑换奖励（阶梯制）", "Activity 1: Tiered Rewards")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="activity1-switch" className="text-sm text-muted-foreground">
                {settings.activity1Enabled ? t("已开启", "Enabled") : t("已关闭", "Disabled")}
              </Label>
              <Switch
                id="activity1-switch"
                checked={settings.activity1Enabled}
                onCheckedChange={handleActivity1Toggle}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "基于会员当前积分区间配置兑换奖励，每个档位可同时设置三种货币（NGN/GHS/USDT）的奖励金额。开启后积分数据会在积分明细生成。",
              "Configure exchange rewards based on member points ranges. When enabled, points data will be generated in points ledger."
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 档位列表 */}
          <div className={`border rounded-lg overflow-x-auto ${!settings.activity1Enabled ? 'opacity-50' : ''}`}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[130px]">{t("积分区间", "Points Range")}</TableHead>
                  <TableHead className="w-[100px]">{t("积分下限", "Min Points")}</TableHead>
                  <TableHead className="w-[120px]">{t("奈拉奖励", "NGN Reward")}</TableHead>
                  <TableHead className="w-[120px]">{t("赛地奖励", "GHS Reward")}</TableHead>
                  <TableHead className="w-[120px]">{t("USDT奖励", "USDT Reward")}</TableHead>
                  <TableHead className="w-[80px] text-center">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.accumulatedRewardTiers.map((tier, index) => (
                  <TableRow key={tier.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {formatTierRange(tier)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={tier.minPoints}
                        onChange={(e) => handleTierChange(tier.id, "minPoints", parseInt(e.target.value) || 0)}
                        className="h-8 w-20"
                        min={0}
                        disabled={!settings.activity1Enabled}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={tier.rewardAmountNGN || 0}
                        onChange={(e) => handleTierChange(tier.id, "rewardAmountNGN", parseFloat(e.target.value) || 0)}
                        className="h-8 w-24"
                        min={0}
                        step={0.01}
                        disabled={!settings.activity1Enabled}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={tier.rewardAmountGHS || 0}
                        onChange={(e) => handleTierChange(tier.id, "rewardAmountGHS", parseFloat(e.target.value) || 0)}
                        className="h-8 w-24"
                        min={0}
                        step={0.01}
                        disabled={!settings.activity1Enabled}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={tier.rewardAmountUSDT || 0}
                        onChange={(e) => handleTierChange(tier.id, "rewardAmountUSDT", parseFloat(e.target.value) || 0)}
                        className="h-8 w-24"
                        min={0}
                        step={0.0001}
                        disabled={!settings.activity1Enabled}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {tier.maxPoints !== null ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setTierDeleteId(tier.id)}
                          disabled={!settings.activity1Enabled}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          {t("固定", "Fixed")}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 新增档位 */}
          {settings.activity1Enabled && (
            <div className="border rounded-lg p-4 bg-muted/30 dark:bg-muted/10 space-y-3">
              <h4 className="font-medium text-sm flex items-center gap-2">
                <Plus className="h-4 w-4" />
                {t("新增档位", "Add Tier")}
              </h4>
              <div className="grid grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("积分下限", "Min Points")}</Label>
                  <Input
                    type="number"
                    value={newTier.minPoints || ""}
                    onChange={(e) => setNewTier({ ...newTier, minPoints: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="h-8"
                    min={0}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("奈拉奖励", "NGN Reward")}</Label>
                  <Input
                    type="number"
                    value={newTier.rewardAmountNGN || ""}
                    onChange={(e) => setNewTier({ ...newTier, rewardAmountNGN: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="h-8"
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("赛地奖励", "GHS Reward")}</Label>
                  <Input
                    type="number"
                    value={newTier.rewardAmountGHS || ""}
                    onChange={(e) => setNewTier({ ...newTier, rewardAmountGHS: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="h-8"
                    min={0}
                    step={0.01}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("USDT奖励", "USDT Reward")}</Label>
                  <Input
                    type="number"
                    value={newTier.rewardAmountUSDT || ""}
                    onChange={(e) => setNewTier({ ...newTier, rewardAmountUSDT: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="h-8"
                    min={0}
                    step={0.0001}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddTier} size="sm" className="h-8 gap-1">
                    <Plus className="h-3 w-3" />
                    {t("添加", "Add")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 说明 */}
          <div className="text-xs text-muted-foreground p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <span>
              {t(
                "档位区间将根据积分下限自动计算。最后一档（积分≥X）为固定档位，不可删除。客户兑换奖励时，系统根据客户的需求币种自动匹配对应货币的奖励金额。",
                "Tier ranges are auto-calculated from min points. The last tier (points≥X) is fixed and cannot be deleted."
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 活动2：固定积分兑换 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {t("活动2：固定积分兑换", "Activity 2: Fixed Points Exchange")}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="activity2-switch" className="text-sm text-muted-foreground">
                {settings.activity2?.enabled ? t("已开启", "Enabled") : t("已关闭", "Disabled")}
              </Label>
              <Switch
                id="activity2-switch"
                checked={settings.activity2?.enabled || false}
                onCheckedChange={(checked) => handleActivity2Change("enabled", checked)}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "固定比例兑换：1积分等于固定的货币数量，无阶梯制。开启后积分数据会在积分明细生成。",
              "Fixed rate exchange: 1 point equals a fixed currency amount. When enabled, points data will be generated in points ledger."
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`grid grid-cols-3 gap-6 ${!settings.activity2?.enabled ? 'opacity-50' : ''}`}>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="text-sm font-medium">1 {t("积分", "Point")} =</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={settings.activity2?.pointsToNGN || 0}
                  onChange={(e) => handleActivity2Change("pointsToNGN", parseFloat(e.target.value) || 0)}
                  className="h-9"
                  step={0.01}
                  min={0}
                  disabled={!settings.activity2?.enabled}
                />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{t("奈拉", "NGN")}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="text-sm font-medium">1 {t("积分", "Point")} =</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={settings.activity2?.pointsToGHS || 0}
                  onChange={(e) => handleActivity2Change("pointsToGHS", parseFloat(e.target.value) || 0)}
                  className="h-9"
                  step={0.01}
                  min={0}
                  disabled={!settings.activity2?.enabled}
                />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">{t("赛地", "GHS")}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span className="text-sm font-medium">1 {t("积分", "Point")} =</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={settings.activity2?.pointsToUSDT || 0}
                  onChange={(e) => handleActivity2Change("pointsToUSDT", parseFloat(e.target.value) || 0)}
                  className="h-9"
                  step={0.0001}
                  min={0}
                  disabled={!settings.activity2?.enabled}
                />
                <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">USDT</span>
              </div>
            </div>
          </div>

          {/* 说明 */}
          <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <span>
              {t(
                "活动2采用固定比例兑换，无论客户有多少积分，每1积分都按照上面设置的比例兑换相应货币。与活动1的阶梯制不同。",
                "Activity 2 uses a fixed exchange rate regardless of total points. Each point is converted at the rates set above."
              )}
            </span>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={tierDeleteId !== null} onOpenChange={(open) => !open && setTierDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除该积分档位？", "Delete this reward tier?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `将移除积分下限 ≥ ${settings.accumulatedRewardTiers.find((x) => x.id === tierDeleteId)?.minPoints ?? "—"} 的档位（未保存的修改需先点保存才会写入服务器）。确定继续？`,
                `Removes the tier with min points ≥ ${settings.accumulatedRewardTiers.find((x) => x.id === tierDeleteId)?.minPoints ?? "—"}. Save the page afterward to persist. Continue?`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = tierDeleteId;
                setTierDeleteId(null);
                if (id) handleDeleteTier(id);
              }}
            >
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageContainer>
  );
}