import { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Keyboard } from 'lucide-react';

interface ShortcutItem {
  keys: string[];
  zh: string;
  en: string;
}

const SHORTCUTS: ShortcutItem[] = [
  { keys: ['Ctrl', 'K'], zh: '全局搜索', en: 'Global Search' },
  { keys: ['Ctrl', 'N'], zh: '新建订单', en: 'New Order' },
  { keys: ['Ctrl', '/'], zh: '显示快捷键帮助', en: 'Show Shortcuts Help' },
  { keys: ['Esc'], zh: '关闭对话框', en: 'Close Dialog' },
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const { language } = useLanguage();

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('shortcut-help-open', handler);
    return () => window.removeEventListener('shortcut-help-open', handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            {language === 'zh' ? '键盘快捷键' : 'Keyboard Shortcuts'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {SHORTCUTS.map((shortcut, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-foreground">
                {language === 'zh' ? shortcut.zh : shortcut.en}
              </span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span key={j}>
                    <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-border bg-muted px-1.5 text-xs font-medium text-muted-foreground">
                      {key}
                    </kbd>
                    {j < shortcut.keys.length - 1 && (
                      <span className="mx-0.5 text-muted-foreground">+</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
