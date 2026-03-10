// ============= 分页大小选择器组件 =============
// 通用的每页显示条数选择器

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';

interface PageSizeSelectProps {
  value: number;
  onChange: (size: number) => void;
  options?: number[];
  label?: string;
  className?: string;
}

export function PageSizeSelect({
  value,
  onChange,
  options = [10, 20, 50, 100],
  label,
  className = '',
}: PageSizeSelectProps) {
  const { t } = useLanguage();
  
  const displayLabel = label ?? t('每页显示', 'Show');
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-sm text-muted-foreground whitespace-nowrap">{displayLabel}</span>
      <Select
        value={value.toString()}
        onValueChange={(v) => onChange(parseInt(v))}
      >
        <SelectTrigger className="w-[80px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((size) => (
            <SelectItem key={size} value={size.toString()}>
              {size} {t('条', 'items')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default PageSizeSelect;
