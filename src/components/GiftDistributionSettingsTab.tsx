import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SettingsPageContainer } from "@/components/SettingsSection";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { saveGiftDistributionSettingsAsync } from "@/services/system/systemSettingsService";
import { useGiftDistributionSettings } from "@/hooks/activity/useGiftDistributionSettings";
import { Percent, PieChart, Info, Save, Loader2 } from "lucide-react";

export default function GiftDistributionSettingsTab() {
  const { t } = useLanguage();
  const { settings: hookSettings, totalGiftValue, loading, refetch } = useGiftDistributionSettings();
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(hookSettings);

  useEffect(() => {
    setSettings(hookSettings);
  }, [hookSettings]);

  // 处理开关变化
  const handleEnabledChange = (checked: boolean) => {
    setSettings(prev => ({ ...prev, enabled: checked }));
  };

  // 处理滑块变化
  const handleSliderChange = (value: number[]) => {
    setSettings(prev => ({ ...prev, distributionRatio: value[0] }));
  };

  // 处理输入框变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(100, Math.max(0, Number(e.target.value) || 0));
    setSettings(prev => ({ ...prev, distributionRatio: value }));
  };

  // 保存设置
  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await saveGiftDistributionSettingsAsync(settings);
      if (success) {
        notify.success(t('设置已保存', 'Settings saved'));
        refetch();
      } else {
        notify.error(t('保存失败', 'Save failed'));
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      notify.error(t('保存失败', 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  // 计算分配后的金额
  const distributableAmount = settings.enabled 
    ? totalGiftValue * (settings.distributionRatio / 100) 
    : totalGiftValue;

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <SettingsPageContainer>
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            {t('活动赠送分配设置', 'Gift Distribution Settings')}
          </CardTitle>
          <CardDescription>
            {t(
              '设置活动赠送总额中用于员工利润报表分配的比例',
              'Configure the percentage of total gift value distributed to employee profit reports'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 启用开关 */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div className="space-y-1">
              <Label className="text-base font-medium">
                {t('启用自定义分配比例', 'Enable Custom Distribution Ratio')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t(
                  '启用后，可设置活动赠送总额中用于员工分配的比例',
                  'When enabled, you can set the percentage of total gifts allocated to employees'
                )}
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={handleEnabledChange}
            />
          </div>

          {/* 分配比例设置 */}
          <div className={`space-y-4 p-4 rounded-lg border ${!settings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <Label className="text-base font-medium">
                {t('分配比例', 'Distribution Ratio')}
              </Label>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Slider
                  value={[settings.distributionRatio]}
                  onValueChange={handleSliderChange}
                  min={0}
                  max={100}
                  step={1}
                  disabled={!settings.enabled}
                />
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={settings.distributionRatio}
                  onChange={handleInputChange}
                  className="w-20 text-center"
                  min={0}
                  max={100}
                  disabled={!settings.enabled}
                />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          {/* 预览说明 */}
          <Card className="bg-muted/50 border-dashed">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2 mb-3">
                <Info className="h-4 w-4 text-primary mt-0.5" />
                <span className="text-sm font-medium">
                  {t('分配预览', 'Distribution Preview')}
                </span>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('当前活动赠送总额', 'Total Gift Value')}:
                  </span>
                  <span className="font-mono font-medium">
                    ₦ {totalGiftValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    × {t('分配比例', 'Distribution Ratio')}:
                  </span>
                  <span className="font-mono font-medium">
                    {settings.enabled ? settings.distributionRatio : 100}%
                  </span>
                </div>
                
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-medium">
                    = {t('员工分配金额', 'Employee Distribution Amount')}:
                  </span>
                  <span className="font-mono font-bold text-primary">
                    ₦ {distributableAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground mt-3">
                {t(
                  '该金额将按员工利润占比分配到员工利润报表中',
                  'This amount will be distributed to employees based on their profit ratio'
                )}
              </p>
            </CardContent>
          </Card>

          {/* 保存按钮 */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {t('保存设置', 'Save Settings')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </SettingsPageContainer>
  );
}
