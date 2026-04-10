/**
 * 会话列表单项 — Step 11 React.memo 优化
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import { ConversationStatusBadge } from './ConversationStatusBadge';
import type { WaConversation } from '@/services/whatsapp/localSessionBridgeService';

export type { WaConversation };

interface Props {
  item: WaConversation;
  isActive: boolean;
  onClick: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  return `${Math.floor(diff / 86_400_000)}天前`;
}

function ConversationItemInner({ item, isActive, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors flex gap-2.5',
        isActive && 'bg-primary/10 border-l-2 border-l-primary',
      )}
    >
      <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-sm font-medium">
        {item.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium truncate">{item.name}</span>
          <span className="text-[10px] text-muted-foreground flex-shrink-0">
            {timeAgo(item.lastMessageAt)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">{item.lastMessage}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {item.status && <ConversationStatusBadge status={item.status} />}
            {item.unreadCount > 0 && (
              <span className="min-w-[18px] h-[18px] rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center px-1">
                {item.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export const ConversationItem = memo(ConversationItemInner);
