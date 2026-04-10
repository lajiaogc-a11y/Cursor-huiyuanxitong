/**
 * 消息区 — Step 11 性能优化
 *
 * - MessageBubble 提取为 memo 子组件，避免列表整体重渲染
 * - 底部自动滚动
 */
import { useEffect, useRef, memo } from 'react';
import { cn } from '@/lib/utils';
import { MessageComposer } from './MessageComposer';
import { Check, CheckCheck } from 'lucide-react';
import type { WaMessage } from '@/services/whatsapp/localSessionBridgeService';

export type { WaMessage };

interface Props {
  messages: WaMessage[];
  contactName: string;
  contactPhone: string;
  onSend: (text: string) => void;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function StatusIcon({ status }: { status?: string }) {
  if (!status) return null;
  if (status === 'read') return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />;
  if (status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-muted-foreground" />;
  return <Check className="w-3.5 h-3.5 text-muted-foreground" />;
}

const MessageBubble = memo(function MessageBubble({ msg }: { msg: WaMessage }) {
  return (
    <div className={cn('flex', msg.fromMe ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[70%] rounded-lg px-3 py-2 text-sm shadow-sm',
        msg.fromMe
          ? 'bg-primary text-primary-foreground rounded-br-none'
          : 'bg-background border rounded-bl-none',
      )}>
        <div className="whitespace-pre-wrap break-words">{msg.body}</div>
        <div className={cn(
          'flex items-center justify-end gap-1 mt-1 text-[10px]',
          msg.fromMe ? 'text-primary-foreground/70' : 'text-muted-foreground',
        )}>
          <span>{formatTime(msg.timestamp)}</span>
          {msg.fromMe && <StatusIcon status={msg.status} />}
        </div>
      </div>
    </div>
  );
});

function MessagePaneInner({ messages, contactName, contactPhone, onSend }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // 依赖最后一条消息的 id + 时间戳，确保内容替换时也触发滚底
  const lastMsgKey = messages.length > 0
    ? `${messages[messages.length - 1].id}:${messages[messages.length - 1].timestamp}`
    : '';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMsgKey]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[hsl(var(--muted)/0.15)]">
      <div className="h-12 border-b flex items-center px-4 gap-3 bg-background flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
          {contactName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{contactName}</div>
          <div className="text-[10px] text-muted-foreground">{contactPhone}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-8">暂无消息</div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <MessageComposer onSend={onSend} />
    </div>
  );
}

export const MessagePane = memo(MessagePaneInner);
