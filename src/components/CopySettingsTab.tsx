import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageContainer } from "@/components/SettingsSection";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Copy, Save, Info, PlayCircle, Loader2 } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { loadSharedData, saveSharedData } from "@/services/finance/sharedDataService";
import { getActivitySettings } from "@/services/activity/activitySettingsService";
import {
  type CopySettings,
  DEFAULT_COPY_SETTINGS,
  normalizeCopySettingsFromStorage,
} from "@/lib/copySettingsDefaults";
import {
  generateEnglishCopyText,
  updateCopySettingsCache,
  persistCopySettings as saveCopySettingsToServer,
} from "@/services/copy/copySettingsService";

export type { CopySettings };
export { initializeCopySettings, refreshCopySettings, getCopySettings, generateEnglishCopyText } from "@/services/copy/copySettingsService";

export function saveCopySettings(settings: CopySettings): void {
  saveCopySettingsToServer(settings);
}


export default function CopySettingsTab() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<CopySettings>(DEFAULT_COPY_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [previewText, setPreviewText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      try {
        const savedSettings = await loadSharedData<CopySettings>('copySettings');
        const normalized = normalizeCopySettingsFromStorage(savedSettings);
        setSettings(normalized);
        updateCopySettingsCache(normalized);
      } catch (error) {
        console.error('Failed to load copy settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    const success = await saveSharedData('copySettings', settings);
    if (success) {
      updateCopySettingsCache(settings);
      setHasChanges(false);
      notify.success(t("复制设置已保存", "Copy settings saved"));
    } else {
      notify.error(t("保存失败", "Save failed"));
    }
  };

  // 测试按钮 - 模拟订单数据生成内容，根据当前活动设置选择模板
  const handleTestGenerate = () => {
    const activitySettings = getActivitySettings();
    
    // 确定活动类型
    let activityType: 'activity1' | 'activity2' | 'none' = 'none';
    if (activitySettings.activity1Enabled) {
      activityType = 'activity1';
    } else if (activitySettings.activity2?.enabled) {
      activityType = 'activity2';
    }
    
    // 测试数据
    const testCurrency = 'GHS'; // 模拟赛地币种
    const testTotalPoints = 155;
    
    // 计算可兑换金额
    let redeemableAmount = '5,000 NGN';
    if (activityType === 'activity2') {
      // 活动2: 积分 × 兑换率
      const rate = activitySettings.activity2?.pointsToGHS || 0;
      redeemableAmount = `${(testTotalPoints * rate).toLocaleString()} ${testCurrency}`;
    }
    
    const rewardTiersSource = activitySettings.accumulatedRewardTiers ?? [];
    const testData = {
      phoneNumber: "08012345678",
      memberCode: "TEST001",  // 测试用会员编号
      earnedPoints: 5,
      totalPoints: testTotalPoints,
      referralPoints: 50,
      consumptionPoints: 100,
      redeemableAmount,
      currency: testCurrency,
      rewardTiers: rewardTiersSource.map(tier => ({
        range: tier.maxPoints === null ? `≥${tier.minPoints}` : `${tier.minPoints}-${tier.maxPoints}`,
        ngn: tier.rewardAmountNGN || 0,
        ghs: tier.rewardAmountGHS || 0,
        usdt: tier.rewardAmountUSDT || 0,
      })),
      activityType,
      activity2Rates: activityType === 'activity2' ? {
        pointsToNGN: activitySettings.activity2?.pointsToNGN || 0,
        pointsToGHS: activitySettings.activity2?.pointsToGHS || 0,
        pointsToUSDT: activitySettings.activity2?.pointsToUSDT || 0,
      } : undefined,
    };
    
    const generatedText = generateEnglishCopyText(testData);
    setPreviewText(generatedText);
    notify.success(t("测试内容已生成", "Test content generated"));
  };

  const handleCopyPreview = () => {
    if (!previewText) {
      handleTestGenerate();
    }
    const textToCopy = previewText || generateEnglishCopyText({
      phoneNumber: "08012345678",
      memberCode: "TEST001",  // 测试用会员编号
      earnedPoints: 5,
      totalPoints: 155,
      referralPoints: 50,
      consumptionPoints: 100,
      redeemableAmount: "5,000 NGN",
      currency: "NGN",
      rewardTiers: [
        { range: "0-50", ngn: 1000, ghs: 20, usdt: 2 },
        { range: "50-100", ngn: 3000, ghs: 50, usdt: 5 },
        { range: "100-200", ngn: 5000, ghs: 80, usdt: 8 },
        { range: "≥200", ngn: 10000, ghs: 150, usdt: 15 },
      ],
    });
    
    navigator.clipboard.writeText(textToCopy);
    notify.success(t("内容已复制到剪贴板", "Content copied to clipboard"));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
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

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Copy className="h-5 w-5" />
            {t("复制设置", "Copy Settings")}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "配置提交订单后自动复制到剪贴板的内容模板。内容将包含客户积分信息和活动方案。",
              "Configure the content template to auto-copy to clipboard after order submission."
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 启用开关 */}
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-base">{t("启用自动复制", "Enable Auto Copy")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("提交订单后自动将客户积分信息复制到剪贴板", "Auto copy customer points info to clipboard after order submission")}
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => {
                setSettings({ ...settings, enabled: checked });
                setHasChanges(true);
              }}
            />
          </div>

          {/* 测试和复制按钮 */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleTestGenerate} className="gap-2">
              <PlayCircle className="h-4 w-4" />
              {t("测试生成", "Test Generate")}
            </Button>
            <Button variant="outline" onClick={handleCopyPreview} className="gap-2">
              <Copy className="h-4 w-4" />
              {t("复制到剪贴板", "Copy to Clipboard")}
            </Button>
          </div>

          {/* 英文模板预览 */}
          <div className="space-y-3">
            <Label className="text-base">{t("英文模板预览", "English Template Preview")}</Label>
            <div className="p-4 bg-muted/50 rounded-lg text-sm font-mono whitespace-pre-wrap border min-h-[200px]">
              {previewText || `Your Member ID: [Member Code]
Points Earned This Order: [Points from this order]
Your Total Points: [Referral Points + Points Earned]
Your Referral Points: [Activity Data - Referral Rewards]
Your Spending Points: [Activity Data - Consumption Rewards]
Estimated Redeemable Amount: [Calculated from points tier]

FastGC Latest Promotions:
Points Range | Naira Rewards | USD Rewards | Other Rewards
[Dynamic reward table based on activity settings]

[Custom English Notes]`}
            </div>
          </div>

          {/* 英文自定义说明 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-base">{t("英文说明内容", "English Notes")}</Label>
              <Info className="h-4 w-4 text-muted-foreground" />
            </div>
            <Textarea
              value={settings.customNoteEnglish}
              onChange={(e) => {
                setSettings({ ...settings, customNoteEnglish: e.target.value });
                setHasChanges(true);
              }}
              placeholder={t("输入英文说明内容...", "Enter English note content...")}
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          {/* 中文自定义说明 (保留) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-base">{t("中文说明内容", "Chinese Notes")}</Label>
              <Info className="h-4 w-4 text-muted-foreground" />
            </div>
            <Textarea
              value={settings.customNote}
              onChange={(e) => {
                setSettings({ ...settings, customNote: e.target.value });
                setHasChanges(true);
              }}
              placeholder={t("输入中文说明内容...", "Enter Chinese note content...")}
              rows={6}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "此内容将显示在中文版复制文本的底部说明区域",
                "This content will appear at the bottom of the Chinese version copied text"
              )}
            </p>
          </div>

          {/* 数据来源说明 */}
          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
            <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
              {t("数据获取逻辑", "Data Retrieval Logic")}
            </h4>
            <ul className="text-blue-700 dark:text-blue-300 space-y-1 text-xs">
              <li>• {t("电话号码：订单表 → 提交订单时的电话号码", "Phone Number: Order table → Phone from order submission")}</li>
              <li>• {t("本次获得消费积分：订单表 → 当前订单积分", "Points Earned This Order: Order table → Current order points")}</li>
              <li>• {t("当前总积分：活动数据页面的剩余积分", "Total Points: Remaining points from Activity Data page")}</li>
              <li>• {t("当前推荐积分：会员管理 → 活动数据 → 推荐奖励", "Referral Points: Member Management → Activity Data → Referral Rewards")}</li>
              <li>• {t("当前消费积分：会员管理 → 活动数据 → 消费奖励", "Spending Points: Member Management → Activity Data → Consumption Rewards")}</li>
              <li>• {t("预计可兑换金额：会员管理 → 活动数据 → 可兑换金额", "Redeemable Amount: Member Management → Activity Data → Redeemable Amount")}</li>
              <li>• {t("最新活动方案：系统设置 → 活动设置 → 累积兑换奖励", "Latest Promotions: System Settings → Activity Settings → Accumulated Rewards")}</li>
            </ul>
          </div>

          {/* 触发流程说明 */}
          <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg text-sm">
            <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
              {t("触发条件", "Trigger Condition")}
            </h4>
            <p className="text-green-700 dark:text-green-300 text-xs">
              {t(
                "用户在汇率计算页面 → 提交订单时自动触发，生成英文模板并复制到剪贴板。",
                "Triggered automatically when user submits an order on the Exchange Rate page. English template is generated and copied to clipboard."
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </SettingsPageContainer>
  );
}
