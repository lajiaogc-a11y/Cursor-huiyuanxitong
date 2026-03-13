import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
  descriptionEn: string;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  const shortcuts: ShortcutConfig[] = [
    {
      key: 'k',
      ctrl: true,
      description: '全局搜索',
      descriptionEn: 'Global Search',
      action: () => {
        // 触发自定义事件，供搜索组件监听
        window.dispatchEvent(new CustomEvent('global-search-open'));
      },
    },
    {
      key: 'n',
      ctrl: true,
      description: '新建订单',
      descriptionEn: 'New Order',
      action: () => {
        navigate('/staff/orders');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('shortcut-new-order'));
        }, 300);
      },
    },
    {
      key: '/',
      ctrl: true,
      description: '显示快捷键帮助',
      descriptionEn: 'Show Shortcuts Help',
      action: () => {
        window.dispatchEvent(new CustomEvent('shortcut-help-open'));
      },
    },
    {
      key: 'Escape',
      description: '关闭对话框',
      descriptionEn: 'Close Dialog',
      action: () => {
        // 按 Escape 关闭最上层的 dialog/sheet
        const event = new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
        });
        document.activeElement?.dispatchEvent(event);
      },
    },
  ];

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // 忽略输入框中的快捷键（Escape 除外）
    const target = e.target as HTMLElement;
    const isInputFocused = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.isContentEditable;

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        // Escape 在输入框中也生效；其他快捷键不在输入框中生效
        if (shortcut.key === 'Escape' || !isInputFocused) {
          e.preventDefault();
          e.stopPropagation();
          shortcut.action();
          return;
        }
      }
    }
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [handleKeyDown]);

  return { shortcuts };
}
