import { useState, useCallback, useRef } from 'react';

/**
 * 员工端导出前确认：requestExport(fn) 打开弹窗，确认后执行 fn（支持 async）。
 */
export function useExportConfirm() {
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<(() => void | Promise<void>) | null>(null);

  const requestExport = useCallback((fn: () => void | Promise<void>) => {
    pendingRef.current = fn;
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(() => {
    const fn = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    void Promise.resolve(fn?.());
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) pendingRef.current = null;
    setOpen(next);
  }, []);

  return { open, requestExport, handleConfirm, handleOpenChange };
}
