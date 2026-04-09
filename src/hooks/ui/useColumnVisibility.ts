/**
 * Column Visibility Hook - 列显示/隐藏管理
 * localStorage 即时缓存 + 防抖同步到数据库（user_data_store），换电脑不丢失。
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ensureUserPreferencesLoaded,
  getColumnVisibilitySync,
  setColumnVisibility as saveColumnVisibilityToDb,
} from '@/services/userPreferencesService';

export interface ColumnConfig {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

export function useColumnVisibility(storageKey: string, columns: ColumnConfig[]) {
  const dbSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbSyncedRef = useRef(false);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`column-visibility-${storageKey}`);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch { /* ignore */ }
    return new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key));
  });

  useEffect(() => {
    if (dbSyncedRef.current) return;
    let cancelled = false;
    ensureUserPreferencesLoaded().then(() => {
      if (cancelled) return;
      dbSyncedRef.current = true;
      const dbCols = getColumnVisibilitySync(storageKey);
      if (dbCols && dbCols.length > 0) {
        setVisibleColumns(new Set(dbCols));
        try { localStorage.setItem(`column-visibility-${storageKey}`, JSON.stringify(dbCols)); } catch { /* ignore */ }
      } else {
        const localRaw = localStorage.getItem(`column-visibility-${storageKey}`);
        if (localRaw) {
          try {
            const localCols = JSON.parse(localRaw) as string[];
            if (localCols.length > 0) {
              saveColumnVisibilityToDb(storageKey, localCols).catch(() => { /* migrate best-effort */ });
            }
          } catch { /* ignore */ }
        }
      }
    }).catch(() => { /* DB load failed, keep localStorage values */ });
    return () => { cancelled = true; };
  }, [storageKey]);

  const toggleColumn = useCallback((columnKey: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnKey)) next.delete(columnKey);
      else next.add(columnKey);
      return next;
    });
  }, []);

  const setColumnVisible = useCallback((columnKey: string, visible: boolean) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (visible) next.add(columnKey);
      else next.delete(columnKey);
      return next;
    });
  }, []);

  const showAll = useCallback(() => {
    setVisibleColumns(new Set(columns.map(c => c.key)));
  }, [columns]);

  const hideAll = useCallback(() => {
    setVisibleColumns(new Set(['actions']));
  }, []);

  const resetToDefault = useCallback(() => {
    setVisibleColumns(new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key)));
  }, [columns]);

  const isVisible = useCallback((columnKey: string) => {
    return visibleColumns.has(columnKey);
  }, [visibleColumns]);

  useEffect(() => {
    const arr = [...visibleColumns];
    try { localStorage.setItem(`column-visibility-${storageKey}`, JSON.stringify(arr)); } catch { /* ignore */ }
    if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current);
    dbSyncTimerRef.current = setTimeout(() => {
      saveColumnVisibilityToDb(storageKey, arr).catch(() => { /* silent */ });
    }, 3000);
    return () => { if (dbSyncTimerRef.current) clearTimeout(dbSyncTimerRef.current); };
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
