/**
 * Column Visibility Hook - 列显示/隐藏管理
 * 持久化保存用户的列显示偏好到 localStorage
 */

import { useState, useCallback, useEffect } from 'react';

export interface ColumnConfig {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

export function useColumnVisibility(storageKey: string, columns: ColumnConfig[]) {
  // 从 localStorage 读取保存的设置
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`column-visibility-${storageKey}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Set(parsed);
      }
    } catch (e) {
      console.error('Failed to load column visibility settings:', e);
    }
    // 默认：所有列可见
    return new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key));
  });

  // 切换列可见性
  const toggleColumn = useCallback((columnKey: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return next;
    });
  }, []);

  // 设置某列的可见性
  const setColumnVisible = useCallback((columnKey: string, visible: boolean) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (visible) {
        next.add(columnKey);
      } else {
        next.delete(columnKey);
      }
      return next;
    });
  }, []);

  // 全部显示
  const showAll = useCallback(() => {
    setVisibleColumns(new Set(columns.map(c => c.key)));
  }, [columns]);

  // 全部隐藏（保留操作列）
  const hideAll = useCallback(() => {
    setVisibleColumns(new Set(['actions']));
  }, []);

  // 重置为默认
  const resetToDefault = useCallback(() => {
    setVisibleColumns(new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key)));
  }, [columns]);

  // 检查列是否可见
  const isVisible = useCallback((columnKey: string) => {
    return visibleColumns.has(columnKey);
  }, [visibleColumns]);

  // 保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`column-visibility-${storageKey}`, JSON.stringify([...visibleColumns]));
    } catch (e) {
      console.error('Failed to save column visibility settings:', e);
    }
  }, [storageKey, visibleColumns]);

  return {
    visibleColumns,
    toggleColumn,
    setColumnVisible,
    showAll,
    hideAll,
    resetToDefault,
    isVisible,
  };
}
