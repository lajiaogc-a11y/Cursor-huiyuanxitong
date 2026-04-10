/**
 * 会话操作栏 — Step 11 增强版
 *
 * 新增：
 *   - 快捷状态按钮（已读未回 / 已回复 / 待跟进 / 优先）
 *   - 快速备注输入
 *   - 联系人信息展示
 */
import { useState, useRef, useEffect, memo } from 'react';
import { Tag, MessageSquareText, BookmarkCheck, Clock, AlertTriangle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ALL_STATUSES,
  STATUS_META,
  type ConversationStatus,
} from '@/services/whatsapp/conversationStatusService';

interface Props {
  currentStatus: ConversationStatus | null;
  onStatusChange: (status: ConversationStatus) => void;
  onQuickNote?: (text: string) => void;
  contactName?: string;
  contactPhone?: string;
}

interface QuickAction {
  status: ConversationStatus;
  icon: typeof Check;
  tip: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { status: 'read_no_reply', icon: BookmarkCheck, tip: '标记已读未回' },
  { status: 'replied',       icon: Check,         tip: '标记已回复' },
  { status: 'follow_up_required', icon: Clock,    tip: '标记待跟进' },
  { status: 'priority',      icon: AlertTriangle,  tip: '标记优先' },
];

function ConversationToolbarInner({ currentStatus, onStatusChange, onQuickNote, contactName, contactPhone }: Props) {
  const [open, setOpen] = useState(false);
  const [noteMode, setNoteMode] = useState(false);
  const [noteText, setNoteText] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  const currentLabel = currentStatus ? STATUS_META[currentStatus]?.zh : null;
  const currentDot = currentStatus ? STATUS_META[currentStatus]?.dotColor : null;

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (noteMode) noteInputRef.current?.focus();
  }, [noteMode]);

  const handleNoteSubmit = () => {
    const trimmed = noteText.trim();
    if (trimmed && onQuickNote) {
      onQuickNote(trimmed);
    }
    setNoteText('');
    setNoteMode(false);
  };

  return (
    <div className="border-b bg-background flex-shrink-0">
      <div className="h-10 flex items-center px-3 gap-1">
        {/* 状态下拉菜单 */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            <Tag className="w-3.5 h-3.5" />
            {currentDot && <span className={cn('w-2 h-2 rounded-full', currentDot)} />}
            <span>{currentLabel ?? '设置状态'}</span>
          </button>
          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[140px]">
              {ALL_STATUSES.map(s => {
                const meta = STATUS_META[s];
                return (
                  <button
                    key={s}
                    onClick={() => { onStatusChange(s); setOpen(false); }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2',
                      currentStatus === s && 'bg-muted font-medium',
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', meta.dotColor)} />
                    {meta.zh}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 分隔线 */}
        <div className="w-px h-4 bg-border mx-0.5" />

        {/* 快捷状态按钮 */}
        {QUICK_ACTIONS.map(({ status, icon: Icon, tip }) => (
          <button
            key={status}
            onClick={() => onStatusChange(status)}
            title={tip}
            className={cn(
              'w-7 h-7 rounded flex items-center justify-center transition-colors',
              currentStatus === status
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}

        {/* 分隔线 */}
        <div className="w-px h-4 bg-border mx-0.5" />

        {/* 快速备注 */}
        {onQuickNote && (
          <button
            onClick={() => setNoteMode(!noteMode)}
            title="快速备注"
            className={cn(
              'w-7 h-7 rounded flex items-center justify-center transition-colors',
              noteMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <MessageSquareText className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 联系人信息 */}
        {contactName && (
          <span className="text-[10px] text-muted-foreground ml-auto truncate max-w-[200px]" title={contactPhone}>
            {contactName} {contactPhone ? `(${contactPhone})` : ''}
          </span>
        )}
      </div>

      {/* 快速备注输入区 */}
      {noteMode && (
        <div className="px-3 pb-2 flex gap-1.5">
          <input
            ref={noteInputRef}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleNoteSubmit(); if (e.key === 'Escape') { setNoteMode(false); setNoteText(''); } }}
            placeholder="输入备注后按 Enter 保存..."
            className="flex-1 h-7 text-xs px-2 border rounded bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            onClick={handleNoteSubmit}
            disabled={!noteText.trim()}
            className="text-[10px] px-2 h-7 rounded bg-primary text-primary-foreground disabled:opacity-50"
          >
            保存
          </button>
          <button
            onClick={() => { setNoteMode(false); setNoteText(''); }}
            className="text-[10px] px-2 h-7 rounded hover:bg-muted"
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}

export const ConversationToolbar = memo(ConversationToolbarInner);
