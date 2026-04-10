/**
 * 消息输入框 — Step 11 React.memo 优化
 */
import { useState, useRef, memo } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
}

function MessageComposerInner({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t bg-muted/20 p-3 flex items-end gap-2">
      <button
        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
        title="附件（暂未开放）"
        disabled
      >
        <Paperclip className="w-4 h-4" />
      </button>
      <textarea
        ref={inputRef}
        id="wa-message-input"
        name="messageText"
        aria-label="消息内容"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入消息... Enter 发送, Shift+Enter 换行"
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[36px] max-h-[120px]"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
          text.trim() && !disabled
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-muted text-muted-foreground',
        )}
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
}

export const MessageComposer = memo(MessageComposerInner);
