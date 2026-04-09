/**
 * Column Visibility Dropdown - 列显示/隐藏下拉菜单
 * 用于订单管理等表格的列配置
 */

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Columns3, RotateCcw } from 'lucide-react';
import { ColumnConfig } from '@/hooks/ui/useColumnVisibility';
import { useLanguage } from '@/contexts/LanguageContext';

interface ColumnVisibilityDropdownProps {
  columns: ColumnConfig[];
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  onReset: () => void;
}

export default function ColumnVisibilityDropdown({
  columns,
  visibleColumns,
  onToggleColumn,
  onReset,
}: ColumnVisibilityDropdownProps) {
  const { t } = useLanguage();
  const visibleCount = visibleColumns.size;
  const totalCount = columns.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="h-4 w-4" />
          <span className="hidden sm:inline">{t('列', 'Columns')}</span>
          <span className="text-xs text-muted-foreground">
            {visibleCount}/{totalCount}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t('显示列', 'Show Columns')}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={(e) => {
              e.preventDefault();
              onReset();
            }}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            {t('重置', 'Reset')}
          </Button>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={visibleColumns.has(column.key)}
            onCheckedChange={() => onToggleColumn(column.key)}
            disabled={column.key === 'actions'} // 操作列不可隐藏
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
