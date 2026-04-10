/**
 * 跟进记录面板 — 纯 UI 组件
 * 类型来自 conversationStatusService
 */
import { useState, memo } from 'react';
import { Plus, StickyNote } from 'lucide-react';
import type { ConversationNote } from '@/services/whatsapp/conversationStatusService';

export type { ConversationNote };

interface Props {
  notes: ConversationNote[];
  onAddNote: (text: string) => void;
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function FollowUpPanelInner({ notes, onAddNote }: Props) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setText('');
    setAdding(false);
  };

  return (
    <div className="border-t">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <StickyNote className="w-3.5 h-3.5" />
          跟进记录
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="w-5 h-5 rounded flex items-center justify-center hover:bg-muted transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {adding && (
        <div className="p-2 border-b">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="输入跟进备注..."
            rows={2}
            className="w-full rounded border bg-muted/30 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
          />
          <div className="flex justify-end gap-1 mt-1">
            <button onClick={() => { setText(''); setAdding(false); }} className="text-[10px] px-2 py-0.5 rounded hover:bg-muted">取消</button>
            <button onClick={handleAdd} disabled={!text.trim()} className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-50">保存</button>
          </div>
        </div>
      )}

      <div className="max-h-48 overflow-y-auto">
        {notes.length === 0 && (
          <div className="text-center text-muted-foreground text-[10px] py-4">暂无跟进记录</div>
        )}
        {notes.map(n => (
          <div key={n.id} className="px-3 py-2 border-b border-border/50 last:border-0">
            <div className="text-xs text-foreground">{n.note}</div>
            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
              <span>{n.createdBy}</span>
              <span>{formatDate(n.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const FollowUpPanel = memo(FollowUpPanelInner);
