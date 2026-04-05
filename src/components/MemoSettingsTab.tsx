import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { Bell, Clock, Save, Trash2, AlertCircle } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import {
  getMemoSettingsAsync,
  saveMemoSettingsAsync,
  MemoSettings,
  getWorkMemos,
  cleanupExpiredMemos,
} from "@/services/system/systemSettingsService";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MemoSettingsTab() {
  const { t, language } = useLanguage();
  const [settings, setSettings] = useState<MemoSettings>({
    autoDeleteEnabled: true,
    autoDeleteHours: 72,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [customHours, setCustomHours] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  
  // Statistics
  const [memoStats, setMemoStats] = useState({ total: 0, read: 0, unread: 0, pendingDelete: 0 });

  // Bilingual time options
  const TIME_OPTIONS = [
    { value: "24", label_zh: "24小时（1天）", label_en: "24 hours (1 day)" },
    { value: "48", label_zh: "48小时（2天）", label_en: "48 hours (2 days)" },
    { value: "72", label_zh: "72小时（3天）", label_en: "72 hours (3 days)" },
    { value: "168", label_zh: "168小时（7天）", label_en: "168 hours (7 days)" },
    { value: "336", label_zh: "336小时（14天）", label_en: "336 hours (14 days)" },
    { value: "720", label_zh: "720小时（30天）", label_en: "720 hours (30 days)" },
    { value: "custom", label_zh: "自定义...", label_en: "Custom..." },
  ];

  const getTimeOptionLabel = (opt: typeof TIME_OPTIONS[0]) => {
    return language === 'zh' ? opt.label_zh : opt.label_en;
  };

  useEffect(() => {
    loadSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const data = await getMemoSettingsAsync();
      setSettings(data);
      
      // Check if it's a custom value
      const isPreset = TIME_OPTIONS.some(opt => opt.value === data.autoDeleteHours.toString());
      setIsCustom(!isPreset);
      if (!isPreset) {
        setCustomHours(data.autoDeleteHours.toString());
      }
      
      // Load statistics
      loadStats(data);
    } catch (error) {
      console.error('Failed to load memo settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = (currentSettings: MemoSettings) => {
    const memos = getWorkMemos();
    const now = new Date();
    const cutoffMs = currentSettings.autoDeleteHours * 60 * 60 * 1000;
    
    const readMemos = memos.filter(m => m.isRead);
    const unreadMemos = memos.filter(m => !m.isRead);
    
    // Calculate pending delete (read and past retention time)
    const pendingDeleteCount = currentSettings.autoDeleteEnabled 
      ? readMemos.filter(m => {
          if (!m.readAt) return false;
          const readTime = new Date(m.readAt);
          return now.getTime() - readTime.getTime() >= cutoffMs;
        }).length
      : 0;
    
    setMemoStats({
      total: memos.length,
      read: readMemos.length,
      unread: unreadMemos.length,
      pendingDelete: pendingDeleteCount,
    });
  };

  const handleToggleEnabled = (checked: boolean) => {
    setSettings(prev => ({ ...prev, autoDeleteEnabled: checked }));
    setHasChanges(true);
  };

  const handleTimeSelect = (value: string) => {
    if (value === "custom") {
      setIsCustom(true);
      setCustomHours(settings.autoDeleteHours.toString());
    } else {
      setIsCustom(false);
      setSettings(prev => ({ ...prev, autoDeleteHours: parseInt(value) }));
      setHasChanges(true);
    }
  };

  const handleCustomHoursChange = (value: string) => {
    setCustomHours(value);
    const hours = parseInt(value);
    if (!isNaN(hours) && hours > 0) {
      setSettings(prev => ({ ...prev, autoDeleteHours: hours }));
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveMemoSettingsAsync(settings);
      setHasChanges(false);
      notify.success(t("备忘录设置已保存", "Memo settings saved"));
      loadStats(settings);
    } catch (error) {
      console.error('Failed to save memo settings:', error);
      notify.error(t("保存失败", "Failed to save"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCleanupNow = () => {
    const deletedCount = cleanupExpiredMemos();
    if (deletedCount > 0) {
      notify.success(t(`已清理 ${deletedCount} 条过期备忘`, `Cleaned up ${deletedCount} expired memos`));
      loadStats(settings);
    } else {
      notify.info(t("没有需要清理的备忘", "No memos to clean up"));
    }
  };

  const getCurrentTimeValue = () => {
    if (isCustom) return "custom";
    const preset = TIME_OPTIONS.find(opt => opt.value === settings.autoDeleteHours.toString());
    return preset ? preset.value : "custom";
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t("加载中...", "Loading...")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Memo Statistics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t("备忘录统计", "Memo Statistics")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className="text-2xl font-bold">{memoStats.total}</div>
              <div className="text-xs text-muted-foreground">{t("总数", "Total")}</div>
            </div>
            <div className="text-center p-3 bg-secondary rounded-lg border border-secondary-foreground/20">
              <div className="text-2xl font-bold text-primary">{memoStats.unread}</div>
              <div className="text-xs text-muted-foreground">{t("待处理", "Unread")}</div>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg border border-primary/30">
              <div className="text-2xl font-bold text-primary">{memoStats.read}</div>
              <div className="text-xs text-muted-foreground">{t("已读", "Read")}</div>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg border border-destructive/50">
              <div className="text-2xl font-bold text-destructive">{memoStats.pendingDelete}</div>
              <div className="text-xs text-muted-foreground">{t("待清理", "Pending Delete")}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto Cleanup Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t("自动清理设置", "Auto Cleanup Settings")}
          </CardTitle>
          <CardDescription>
            {t(
              "配置已读备忘的自动清理规则，超过保留时间的已读备忘将自动删除",
              "Configure auto-cleanup rules for read memos. Read memos exceeding retention time will be automatically deleted"
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Switch */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("启用自动清理", "Enable Auto Cleanup")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("开启后，已读备忘将在指定时间后自动删除", "When enabled, read memos will be automatically deleted after the specified time")}
              </p>
            </div>
            <Switch
              checked={settings.autoDeleteEnabled}
              onCheckedChange={handleToggleEnabled}
            />
          </div>

          {/* Retention Time Settings */}
          <div className="space-y-2">
            <Label>{t("保留时间", "Retention Time")}</Label>
            <div className="flex gap-3">
              <Select
                value={getCurrentTimeValue()}
                onValueChange={handleTimeSelect}
                disabled={!settings.autoDeleteEnabled}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {getTimeOptionLabel(opt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {isCustom && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={customHours}
                    onChange={(e) => handleCustomHoursChange(e.target.value)}
                    className="w-24"
                    min={1}
                    disabled={!settings.autoDeleteEnabled}
                  />
                  <span className="text-sm text-muted-foreground">{t("小时", "hours")}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                `已读备忘将在确认已读后 ${settings.autoDeleteHours} 小时自动删除`,
                `Read memos will be auto-deleted ${settings.autoDeleteHours} hours after being marked as read`
              )}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t">
            <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {t("保存设置", "Save Settings")}
            </Button>
            
            <Button 
              variant="outline" 
              onClick={() => setCleanupConfirmOpen(true)}
              disabled={!settings.autoDeleteEnabled || memoStats.pendingDelete === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("立即清理", "Cleanup Now")}
              {memoStats.pendingDelete > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {memoStats.pendingDelete}
                </Badge>
              )}
            </Button>
          </div>

          {/* Info Message */}
          {!settings.autoDeleteEnabled && (
            <div className="flex items-start gap-2 p-3 bg-muted border border-muted-foreground/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="text-sm text-muted-foreground">
                {t(
                  "自动清理已关闭，已读备忘将永久保留直到手动删除",
                  "Auto cleanup is disabled. Read memos will be kept permanently until manually deleted"
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={cleanupConfirmOpen} onOpenChange={setCleanupConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("立即清理已读备忘？", "Clean up eligible read memos now?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `将删除当前符合保留规则的已读备忘（约 ${memoStats.pendingDelete} 条），此操作不可撤销。`,
                `Deletes read memos that match the retention rule (about ${memoStats.pendingDelete} now). This cannot be undone.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setCleanupConfirmOpen(false);
                handleCleanupNow();
              }}
            >
              {t("确认清理", "Confirm cleanup")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
