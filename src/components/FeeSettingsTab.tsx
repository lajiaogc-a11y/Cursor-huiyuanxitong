import { useState, useEffect } from "react";
import { SettingsSection, SettingsPageContainer } from "@/components/SettingsSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, DollarSign, Calculator, Loader2 } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { getFeeSettings, saveFeeSettings, FeeSettings, saveUsdtFee } from "@/services/system/systemSettingsService";
import { useLanguage } from "@/contexts/LanguageContext";
import { CURRENCIES } from "@/config/currencies";
import { loadSharedData, saveSharedData } from "@/services/finance/sharedDataService";

export default function FeeSettingsTab() {
  const { t } = useLanguage();
  const [feeSettings, setFeeSettings] = useState<FeeSettings>(getFeeSettings());
  const [isLoadingFeeSettings, setIsLoadingFeeSettings] = useState(true);
  const [usdtFee, setUsdtFee] = useState<string>("");
  const [isLoadingUsdtFee, setIsLoadingUsdtFee] = useState(true);
  const [clearUsdtFeeDialogOpen, setClearUsdtFeeDialogOpen] = useState(false);
  const [clearingUsdtFee, setClearingUsdtFee] = useState(false);

  useEffect(() => {
    const loadFeeSettingsFromDb = async () => {
      try {
        const savedSettings = await loadSharedData<FeeSettings>('feeSettings');
        setFeeSettings(savedSettings ?? getFeeSettings());
      } catch (error) {
        console.error('Failed to load fee settings:', error);
        setFeeSettings(getFeeSettings());
      } finally {
        setIsLoadingFeeSettings(false);
      }
    };
    loadFeeSettingsFromDb();
  }, []);

  // 初始化时加载USDT手续费
  useEffect(() => {
    // 异步加载USDT手续费，确保从数据库获取正确值
    const loadUsdtFeeFromDb = async () => {
      try {
        const savedFee = await loadSharedData<number>('systemSettings_usdtFee');
        if (savedFee !== null) {
          setUsdtFee(savedFee === 0 ? "" : savedFee.toString());
        }
      } catch (error) {
        console.error('Failed to load USDT fee:', error);
      } finally {
        setIsLoadingUsdtFee(false);
      }
    };
    loadUsdtFeeFromDb();
  }, []);

  const handleSave = async () => {
    saveFeeSettings(feeSettings);
    const feeValue = parseFloat(usdtFee) || 0;
    // 使用异步保存确保写入数据库成功
    const success = await saveSharedData('systemSettings_usdtFee', feeValue);
    if (success) {
      saveUsdtFee(feeValue);  // 更新缓存
      notify.success(t("手续费设定已保存", "Fee settings saved"));
    } else {
      notify.error(t("保存失败，请重试", "Save failed, please retry"));
    }
  };

  const handleClearUsdtFee = async () => {
    setClearingUsdtFee(true);
    try {
      const success = await saveSharedData("systemSettings_usdtFee", 0);
      if (success) {
        setUsdtFee("");
        saveUsdtFee(0);
        notify.success(t("USDT手续费已清除", "USDT fee cleared"));
        setClearUsdtFeeDialogOpen(false);
      } else {
        notify.error(t("清除失败，请重试", "Clear failed, please retry"));
      }
    } finally {
      setClearingUsdtFee(false);
    }
  };

  if (isLoadingFeeSettings || isLoadingUsdtFee) {
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
      <SettingsSection
        title={t("USDT 设置", "USDT Settings")}
        description={t("此设置为系统级配置，汇率计算页面和报表管理将自动读取此值", "System-level settings used by Exchange Rate and Reports")}
        icon={DollarSign}
        accent="primary"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("USDT手续费", "USDT Fee")}</Label>
            <p className="text-xs text-muted-foreground mb-2">{t("支持正负数和小数", "Supports positive/negative decimals")}</p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                value={usdtFee}
                onChange={(e) => setUsdtFee(e.target.value)}
                placeholder="0"
                className="flex-1 max-w-[200px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearUsdtFeeDialogOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t("清除", "Clear")}
              </Button>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t(`${CURRENCIES.NGN.name}手续费规则`, `${CURRENCIES.NGN.englishName} Fee Rules`)}
        icon={Calculator}
        accent="violet"
      >
        <div className="grid gap-6 sm:grid-cols-2">
            {/* ≥ 阈值时 */}
            <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="text-violet-600 dark:text-violet-400">≥</span>
                <span>{t("阈值时", "threshold")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("阈值", "Threshold")}</Label>
                  <Input
                    type="number"
                    value={feeSettings.nairaThreshold}
                    onChange={(e) => setFeeSettings(prev => ({ 
                      ...prev, 
                      nairaThreshold: parseFloat(e.target.value) || 0 
                    }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("手续费", "Fee")}</Label>
                  <Input
                    type="number"
                    value={feeSettings.nairaFeeAbove}
                    onChange={(e) => setFeeSettings(prev => ({ 
                      ...prev, 
                      nairaFeeAbove: parseFloat(e.target.value) || 0 
                    }))}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* < 阈值时 */}
            <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="text-violet-600 dark:text-violet-400">&lt;</span>
                <span>{t("阈值时", "threshold")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("阈值", "Threshold")}</Label>
                  <Input
                    type="number"
                    value={feeSettings.nairaThreshold}
                    disabled
                    className="h-9 bg-muted"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("手续费", "Fee")}</Label>
                  <Input
                    type="number"
                    value={feeSettings.nairaFeeBelow}
                    onChange={(e) => setFeeSettings(prev => ({ 
                      ...prev, 
                      nairaFeeBelow: parseFloat(e.target.value) || 0 
                    }))}
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          </div>
      </SettingsSection>

      <SettingsSection
        title={t(`${CURRENCIES.GHS.name}手续费规则`, `${CURRENCIES.GHS.englishName} Fee Rules`)}
        icon={Calculator}
        accent="indigo"
      >
        <div className="grid gap-6 sm:grid-cols-2">
            {/* ≥ 阈值时 */}
            <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="text-indigo-600 dark:text-indigo-400">≥</span>
                <span>{t("阈值时", "threshold")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("阈值", "Threshold")}</Label>
                  <Input
                    type="number"
                    value={feeSettings.cediThreshold}
                    onChange={(e) => setFeeSettings(prev => ({ 
                      ...prev, 
                      cediThreshold: parseFloat(e.target.value) || 0 
                    }))}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("手续费", "Fee")}</Label>
                  <Input
                    type="number"
                    value={feeSettings.cediFeeAbove}
                    onChange={(e) => setFeeSettings(prev => ({ 
                      ...prev, 
                      cediFeeAbove: parseFloat(e.target.value) || 0 
                    }))}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* < 阈值时 */}
            <div className="p-4 bg-muted/30 rounded-lg border space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="text-indigo-600 dark:text-indigo-400">&lt;</span>
                <span>{t("阈值时", "threshold")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("阈值", "Threshold")}</Label>
                  <Input
                    type="number"
                    value={feeSettings.cediThreshold}
                    disabled
                    className="h-9 bg-muted"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("手续费", "Fee")}</Label>
                  <Input
                    type="number"
                    value={feeSettings.cediFeeBelow}
                    onChange={(e) => setFeeSettings(prev => ({ 
                      ...prev, 
                      cediFeeBelow: parseFloat(e.target.value) || 0 
                    }))}
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          </div>
      </SettingsSection>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} size="lg" className="gap-2 shadow-sm">
          <Save className="h-4 w-4" />
          {t("保存设置", "Save Settings")}
        </Button>
      </div>

      <AlertDialog open={clearUsdtFeeDialogOpen} onOpenChange={setClearUsdtFeeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("清除 USDT 手续费？", "Clear USDT fee?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将把 USDT 手续费重置为 0 并立即写入数据库，确定继续？",
                "This resets the USDT fee to 0 and saves immediately. Continue?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingUsdtFee}>{t("取消", "Cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={clearingUsdtFee}
              onClick={() => void handleClearUsdtFee()}
            >
              {clearingUsdtFee ? <Loader2 className="h-4 w-4 animate-spin" /> : t("清除", "Clear")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsPageContainer>
  );
}
