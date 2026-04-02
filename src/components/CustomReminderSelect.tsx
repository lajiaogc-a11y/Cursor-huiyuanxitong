import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Clock, ChevronDown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export type TimeUnit = 'minutes' | 'hours' | 'days';

interface CustomReminderSelectProps {
  value: number; // Always stored as minutes
  onChange: (minutes: number) => void;
  className?: string;
}

export function CustomReminderSelect({ value, onChange, className }: CustomReminderSelectProps) {
  const { t, language } = useLanguage();
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState<string>("1");
  const [customUnit, setCustomUnit] = useState<TimeUnit>("hours");
  const [open, setOpen] = useState(false);

  // Preset options with bilingual labels
  const PRESET_OPTIONS = [
    { value: 40, label: t("40分钟", "40 min") },
    { value: 60, label: t("1小时", "1 hr") },
    { value: 120, label: t("2小时", "2 hrs") },
    { value: 240, label: t("4小时", "4 hrs") },
    { value: 1440, label: t("1天", "1 day") },
    { value: 4320, label: t("3天", "3 days") },
  ];

  // Convert minutes to display label
  const getDisplayLabel = (minutes: number) => {
    const preset = PRESET_OPTIONS.find(opt => opt.value === minutes);
    if (preset) return preset.label;
    
    if (minutes >= 1440 && minutes % 1440 === 0) {
      const days = minutes / 1440;
      return language === 'zh' ? `${days}天` : `${days} day${days > 1 ? 's' : ''}`;
    }
    if (minutes >= 60 && minutes % 60 === 0) {
      const hours = minutes / 60;
      return language === 'zh' ? `${hours}小时` : `${hours} hr${hours > 1 ? 's' : ''}`;
    }
    return language === 'zh' ? `${minutes}分钟` : `${minutes} min`;
  };

  const handlePresetSelect = (val: string) => {
    if (val === 'custom') {
      setIsCustomMode(true);
    } else {
      onChange(parseInt(val));
      setOpen(false);
    }
  };

  const handleCustomConfirm = () => {
    const numValue = parseInt(customValue) || 1;
    let minutes = numValue;
    
    switch (customUnit) {
      case 'hours':
        minutes = numValue * 60;
        break;
      case 'days':
        minutes = numValue * 1440;
        break;
    }
    
    onChange(minutes);
    setOpen(false);
    setIsCustomMode(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`w-full justify-between font-normal ${className}`}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{getDisplayLabel(value)}</span>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        {!isCustomMode ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("预设时间", "Presets")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  variant={value === opt.value ? "default" : "outline"}
                  size="sm"
                  className="text-xs"
                  onClick={() => handlePresetSelect(opt.value.toString())}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <div className="border-t pt-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => setIsCustomMode(true)}
              >
                <Clock className="h-3 w-3 mr-1" />
                {t("自定义时间", "Custom")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">{t("自定义时间", "Custom Time")}</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                max="999"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                className="flex-1"
                placeholder={t("数值", "Value")}
              />
              <Select value={customUnit} onValueChange={(v) => setCustomUnit(v as TimeUnit)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">{t("分钟", "Minutes")}</SelectItem>
                  <SelectItem value="hours">{t("小时", "Hours")}</SelectItem>
                  <SelectItem value="days">{t("天", "Days")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setIsCustomMode(false)}
              >
                {t("取消", "Cancel")}
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleCustomConfirm}
              >
                {t("确定", "Confirm")}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
